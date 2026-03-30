// ════════════════════════════════════════════════════════════
//  HUERTA DASHBOARD — Apps Script Web App
//  Pegá este código en: Extensiones → Apps Script → Code.gs
//  Luego: Implementar → Nueva implementación → App web
//  Acceso: Cualquier persona → Implementar
//  Copiá la URL y pegala en el dashboard
// ════════════════════════════════════════════════════════════

function doGet(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const data = buildData(ss);
    output.setContent(JSON.stringify(data));
  } catch(err) {
    output.setContent(JSON.stringify({ error: err.message }));
  }

  // Allow CORS so Vercel can fetch
  return output;
}

function buildData(ss) {
  // ── helpers ──────────────────────────────────────────────
  const getSheet = (keywords) => {
    const sheets = ss.getSheets();
    for (const s of sheets) {
      const name = s.getName().toLowerCase();
      if (keywords.some(k => name.includes(k))) return s;
    }
    return null;
  };

  const sheetToRows = (sheet) => {
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];
    const headers = data[0].map(h => String(h).trim());
    return data.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });
  };

  const toDate = (v) => {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v === 'number') {
      // Excel serial
      const d = new Date(1899, 11, 30);
      d.setDate(d.getDate() + v);
      return d;
    }
    const s = String(v);
    const p = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (p) return new Date(+p[3], +p[2]-1, +p[1]);
    const p2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (p2) return new Date(+p2[1], +p2[2]-1, +p2[3]);
    return null;
  };

  const mKey = (d) => {
    if (!d) return null;
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  };

  const fmtDate = (d) => d ? Utilities.formatDate(d, 'GMT-3', 'yyyy-MM-dd') : null;

  const pN = (v) => {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/[^0-9.\-]/g, '');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };

  // ── load sheets ──────────────────────────────────────────
  const sCob = getSheet(['cobranzas']);
  const sPag = getSheet(['pagos proveedores','pagos prov']);
  const sER  = getSheet(['estado de resultados','resultado']);
  const sImp = getSheet(['impuesto','otros imp']);
  const sObj = getSheet(['objetivo']);
  const sFC  = getSheet(['facturas clientes','fac clientes']);
  const sFP  = getSheet(['facturas proveedores','fac prov']);
  const sCFB = getSheet(['cashflow banco','cashflow ban']);

  if (!sCob || !sPag || !sER) throw new Error('Faltan solapas requeridas');

  const cobRows = sheetToRows(sCob);
  const pagRows = sheetToRows(sPag);
  const erRows  = sheetToRows(sER);
  const impRows = sheetToRows(sImp);
  const objRows = sheetToRows(sObj);
  const fcRows  = sheetToRows(sFC);
  const fpRows  = sheetToRows(sFP);
  const cfbRows = sheetToRows(sCFB);

  // ── meses ────────────────────────────────────────────────
  const mesesSet = new Set();
  cobRows.forEach(r => {
    const d = toDate(r['Fecha'] || r['fecha']);
    const m = mKey(d);
    if (m) mesesSet.add(m);
  });
  const meses = [...mesesSet].sort();

  // ── objetivos ────────────────────────────────────────────
  const objetivos = {};
  objRows.forEach(r => {
    const d = toDate(r['MES'] || r['Mes']);
    if (!d) return;
    const mes = mKey(d);
    if (!objetivos[mes]) objetivos[mes] = {};
    objetivos[mes][String(r['TIPO']||r['Tipo'])] = pN(r['IMPORTE']||r['Importe']);
  });
  Object.values(objetivos).forEach(v => {
    const ing=v['INGRESOS']||0, cv=v['COSTOS VARIABLES POR SEDE']||0, cm=v['COSTOS DE LA MARCA']||0;
    v['EBITDA'] = ing-cv-cm;
    v['MARGEN'] = ing ? Math.round((ing-cv-cm)/ing*1000)/10 : 0;
  });

  // ── build output ─────────────────────────────────────────
  const out = {
    meses, cashflow:{}, ebitda:{}, sedes:{}, productos:{},
    costos_marca:{}, costos_sede_cat:{}, financieros_cat:{}, iva_cat:{},
    cobranzas_raw:[], pagos_raw:[], deudores:[], proveedores_pend:[],
    impuestos_raw:[], objetivos,
    bancos:{bancos:[], saldos_iniciales:{}, ajustes:[], cf_banco:{}}
  };

  const cobImp  = r => { const i=pN(r['Importe']||r['importe']); return i>0?i:0; };
  const pagImp  = r => { const i=pN(r['Importe']||r['importe']); if(i>0)return i; const nv=pN(r['NO VA']||r['No Va']||0); return nv>0?nv:0; };

  meses.forEach(mes => {
    const cobM = cobRows.filter(r => mKey(toDate(r['Fecha']||r['fecha']))===mes);
    const pagM = pagRows.filter(r => mKey(toDate(r['Fecha']||r['fecha']))===mes);
    const impM = impRows.filter(r => mKey(toDate(r['FECHA DE PAGO']||r['Fecha de pago']||r['Fecha']))===mes);
    const erM  = erRows.filter(r => mKey(toDate(r['Fecha']||r['fecha']))===mes);

    const cob = cobM.reduce((a,r)=>a+cobImp(r), 0);
    const pag = pagM.reduce((a,r)=>a+pagImp(r), 0);
    const imp = impM.reduce((a,r)=>a+pN(r['IMPORTE']||r['Importe']), 0);
    out.cashflow[mes] = {cobrado:cob, pagos_prov:pag, imp_otros:imp, neto:cob-pag-imp};

    const sub = s => erM.filter(r=>(r['SUBCATEGORIA']||r['Subcategoria']||'')==s).reduce((a,r)=>a+pN(r['Importe']||r['importe']||0),0);
    const ing=sub('INGRESOS'), cvs=sub('COSTOS VARIABLES POR SEDE'), cvm=sub('COSTOS DE LA MARCA');
    const fin=sub('FINANCIEROS'), impe=sub('IMPUESTOS'), iva=sub('IVA');
    const ebitda=ing+cvs+cvm, resultado=ebitda+fin+impe+iva;
    out.ebitda[mes] = {ingresos:ing,costos_sede:cvs,costos_marca:cvm,ebitda,
      margen:ing?Math.round(ebitda/ing*1000)/10:0,financieros:fin,impuestos:impe,iva,
      resultado,margen_resultado:ing?Math.round(resultado/ing*1000)/10:0};

    const ingRows = erM.filter(r=>(r['SUBCATEGORIA']||r['Subcategoria']||'')==='INGRESOS');
    const sedesM={},prodsM={},csM={},cmM={},finM={},ivaM={};
    ingRows.forEach(r=>{
      const s=r['SEDES']||r['Sedes']||''; const c=r['Cuenta']||r['cuenta']||'';
      const v=pN(r['Importe']||r['importe']||0);
      if(s) sedesM[String(s)]=(sedesM[String(s)]||0)+v;
      if(c) prodsM[String(c)]=(prodsM[String(c)]||0)+v;
    });
    erM.filter(r=>(r['SUBCATEGORIA']||'')==='COSTOS VARIABLES POR SEDE').forEach(r=>{const c=r['Cuenta']||'';if(c)csM[String(c)]=(csM[String(c)]||0)+pN(r['Importe']||0);});
    erM.filter(r=>(r['SUBCATEGORIA']||'')==='COSTOS DE LA MARCA').forEach(r=>{const c=r['Cuenta']||'';if(c)cmM[String(c)]=(cmM[String(c)]||0)+pN(r['Importe']||0);});
    erM.filter(r=>(r['SUBCATEGORIA']||'')==='FINANCIEROS').forEach(r=>{const c=r['Cuenta']||'';if(c)finM[String(c)]=(finM[String(c)]||0)+pN(r['Importe']||0);});
    erM.filter(r=>(r['SUBCATEGORIA']||'')==='IVA').forEach(r=>{const c=r['Cuenta']||'';if(c)ivaM[String(c)]=(ivaM[String(c)]||0)+pN(r['Importe']||0);});
    out.sedes[mes]=sedesM; out.productos[mes]=prodsM; out.costos_sede_cat[mes]=csM;
    out.costos_marca[mes]=cmM; out.financieros_cat[mes]=finM; out.iva_cat[mes]=ivaM;
  });

  // Raw data
  cobRows.forEach(r=>{
    const d=toDate(r['Fecha']||r['fecha']); const imp=cobImp(r); if(imp<=0)return;
    const banco=String(r['BANCO']||r['Banco']||'');
    out.cobranzas_raw.push({fecha:fmtDate(d),mes:mKey(d)||'',nombre:String(r['Razón Social']||r['Razon Social']||''),medio:String(r['Medio de Cobro']||r['Medio de cobro']||''),banco,importe:imp});
  });
  pagRows.forEach(r=>{
    const d=toDate(r['Fecha']||r['fecha']); const imp=pagImp(r); if(imp<=0)return;
    const banco=String(r['BANCO']||r['Banco']||'');
    out.pagos_raw.push({fecha:fmtDate(d),mes:mKey(d)||'',nombre:String(r['Razón Social']||r['Razon Social']||''),medio:String(r['Medio de Pago']||r['Medio de pago']||''),banco,importe:imp});
  });
  fcRows.forEach(r=>{
    const pend=pN(r['Pendiente']||r['pendiente']||0); if(pend<=0)return;
    const v=toDate(r['Vencimiento']||r['vencimiento']); const d=toDate(r['Fecha']||r['fecha']);
    out.deudores.push({nombre:String(r['Razón Social']||r['Razon Social']||r['Cliente']||''),mes:mKey(d)||'',vencimiento:fmtDate(v),pendiente:pend});
  });
  fpRows.forEach(r=>{
    const pend=pN(r['Pendiente']||r['pendiente']||0); if(pend<=0)return;
    const v=toDate(r['Vencimiento']||r['vencimiento']); const d=toDate(r['Fecha']||r['fecha']);
    out.proveedores_pend.push({nombre:String(r['Razón Social']||r['Razon Social']||r['Proveedor']||''),mes:mKey(d)||'',vencimiento:fmtDate(v),pendiente:pend});
  });
  impRows.forEach(r=>{
    const imp=pN(r['IMPORTE']||r['Importe']||0); const d=toDate(r['FECHA DE PAGO']||r['Fecha de pago']||r['Fecha']);
    const mes=mKey(d); if(imp<=0||!mes)return;
    out.impuestos_raw.push({descripcion:String(r['Descripcion']||r['descripcion']||''),mes,banco:String(r['BANCO']||r['Banco']||'BBVA'),importe:imp});
  });

  // CASHFLOW BANCOS
  const bancosSet = new Set();
  out.cobranzas_raw.forEach(r=>{if(r.banco&&!r.banco.toUpperCase().includes('TARJETA'))bancosSet.add(r.banco);});
  out.pagos_raw.forEach(r=>{if(r.banco&&!r.banco.toUpperCase().includes('TARJETA'))bancosSet.add(r.banco);});
  out.impuestos_raw.forEach(r=>{if(r.banco)bancosSet.add(r.banco);});
  cfbRows.forEach(r=>{
    const tipo=String(r['TIPO']||'').trim();
    const d=toDate(r['MES']||r['Mes']); if(!d)return;
    const mes=mKey(d); const banco=String(r['BANCO']||r['Banco']||'').trim();
    const imp=pN(r['IMPORTE']||r['Importe']||0); if(!banco)return;
    if(!banco.toUpperCase().includes('TARJETA')) bancosSet.add(banco);
    if(tipo==='SALDO INICIAL') out.bancos.saldos_iniciales[mes+'_'+banco]=imp;
    else if(tipo==='AJUSTE') out.bancos.ajustes.push({mes,banco,descripcion:String(r['DESCRIPCION']||r['Descripcion']||''),importe:imp});
  });
  out.bancos.bancos = [...bancosSet].filter(b=>!b.toUpperCase().includes('TARJETA')).sort();
  meses.forEach(mes=>{
    out.bancos.cf_banco[mes]={};
    out.bancos.bancos.forEach(b=>{
      const ing=out.cobranzas_raw.filter(r=>r.mes===mes&&r.banco===b).reduce((s,r)=>s+r.importe,0);
      const egProv=out.pagos_raw.filter(r=>r.mes===mes&&r.banco===b).reduce((s,r)=>s+r.importe,0);
      const egImp=out.impuestos_raw.filter(r=>r.mes===mes&&(r.banco||'BBVA')===b).reduce((s,r)=>s+r.importe,0);
      out.bancos.cf_banco[mes][b]={ingresos:ing,egresos:egProv+egImp,egresos_prov:egProv,egresos_imp:egImp};
    });
  });

  return out;
}
