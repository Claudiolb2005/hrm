# clientes-hrm — Portal de Supervisión de Nómina

Portal automatizado de supervisión mensual de nómina para clientes de **HRM Consultores**.
Toda la aplicación vive en un único Cloudflare Worker (`worker.js`) que sirve, según el rol:
panel **admin**, **portal de cliente** (socio) y **visor de reportes**.

> ⚠️ **Repo recomendado PRIVADO.** Contiene la lógica completa de la app y los IDs de
> infraestructura. No incluye secretos (las contraseñas se guardan hasheadas; la API key
> de Anthropic va como *secret* del Worker, fuera del repo).

## Stack

- **Cloudflare Workers** — worker `clientes-hrm`, app completa en `worker.js`
- **D1** (`hrm-nomina-portal`) — reportes, periodos, empresas, usuarios, bases ISN, mapeo de columnas
- **KV** (`hrm-sessions`) — sesiones
- **R2** (`hrm-nomina-docs`) — archivos fuente (Excel/PDF)
- **Browser-side**: SheetJS (Excel), PDF.js (PDF), JSZip (ZIP), Chart.js (gráficas)

## Estructura del reporte (14 secciones)

| ID | # | Sección |
|----|---|---------|
| sec1 | I | Integración de la nómina |
| sec2 | II | Importes por periodo (nómina / CFDI / dispersiones) |
| sec4 | III | Concentrado de nómina (percepciones/deducciones) |
| sec5 | IV | Totales por puesto |
| sec6 | V | Totales por estado |
| sec7 | VI | Impuestos trabajador (ISR/IMSS/Infonavit/FONACOT) + visor SAT |
| sec8 | VII | Contribuciones patronales (IMSS/RCV/Infonavit/ISN) |
| sec9 | VIII | IMSS y RCV por registro patronal |
| sec10 | IX | Impuesto sobre nómina por estado |
| sec11 | X | Provisión global (contabilidad) vs nómina |
| sec12 | XI | Tendencias de movimientos |
| sec14 | XII | Comisiones por estado/periodo + Seguro Social semanal |
| sec13 | XIII | Acciones de mejora |

`sec3` está libre. **Febrero 2025 (`periodo_id=4`) es la plantilla canónica** — todas las
secciones verificadas; el resto se compara contra ella.

## Pipeline de datos

**Meta:** que el cliente suba los Excels crudos y el sistema arme el reporte solo, sin
elaborar el PDF manualmente.

1. **Vía Excel (objetivo):** admin sube Excels → SheetJS agrega las ~14K filas en el browser
   → **Sonnet** mapea (columna de periodo/estado/percepciones, columnas a ignorar como las de
   "Comprobación", y `puesto → familia`) → JSON canónico → D1. Sonnet nunca ve las 14K filas,
   solo encabezados + muestra + listas únicas, así que es barato y robusto.
2. **Vía PDF (puente + verificación), doble motor:** se sube el informe PDF →
   **(a) PDF.js** extrae las tablas de forma determinista y **(b) Sonnet** lee el PDF →
   se comparan. Si **coinciden** → se acepta (verificado ✓). Si **no coinciden** → Sonnet hace
   una pasada de reconciliación sobre las diferencias, encuentra el error y corrige → JSON → D1.

Modelo: `claude-sonnet-4-6` (vía secret `ANTHROPIC_API_KEY`).

## Deploy

```bash
# Opción A: Quick Edit — pegar worker.js en el editor del Worker en el Dashboard.
# Opción B: Wrangler
wrangler deploy
wrangler secret put ANTHROPIC_API_KEY    # para la lectura con Sonnet
```

Bindings (Dashboard → Worker → Settings → Bindings): `DB` (D1), `SESSIONS` (KV), `DOCS` (R2).
Recrear la base: `wrangler d1 execute hrm-nomina-portal --file=schema.sql`.

## Notas de seguridad (pendientes)

- Hash de contraseñas con SHA-256 sin sal → migrar a un hash con sal (PBKDF2/scrypt).
- Mantener el repo **privado**; rotar cualquier credencial semilla.

## Convenciones de procesamiento (aprendidas)

- Total CFDI canónico = `Total percepciones − Total deducciones` (no la columna `Total`).
- Clasificación de periodo por contenido (regex `SEM`/`CAT`), no por nombre de columna.
- Clasificación de puesto por substring/prefijo (variantes regionales), no por igualdad exacta.
- Regex dentro de los template literals del Worker requieren doble backslash (`\\s`, `\\d`).
