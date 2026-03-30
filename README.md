# Huerta Dashboard Financiero

Dashboard financiero automático conectado a Google Sheets.

## Setup

1. Subí el archivo `INGRESOS_Y_EGRESOS.xlsx` a Google Sheets
2. Publicá el sheet: **Archivo → Compartir → Publicar en la web → Todo el documento → CSV**
3. Copiá el ID del sheet de la URL: `docs.google.com/spreadsheets/d/**[ESTE_ES_EL_ID]**/edit`
4. Pegá el ID en la pantalla de inicio del dashboard

## Deploy en Vercel

1. Fork o push este repo a GitHub
2. Conectá el repo en [vercel.com](https://vercel.com)
3. Deploy automático — listo

## Actualizar datos

Cada vez que tengas un Excel nuevo:
1. En Google Sheets: **Archivo → Importar → Reemplazar hoja**
2. Recargá el dashboard → los datos se actualizan automáticamente

## Solapas requeridas en el Excel/Sheets

- `cobranzas clientes`
- `pagos proveedores`
- `ESTADO DE RESULTADOS POR CENTRO`
- `IMPUESTOS  OTROS`
- `OBJETIVOS`
- `facturas clientes`
- `facturas proveedores`
- `CASHFLOW BANCOS` (para saldos iniciales y ajustes)
