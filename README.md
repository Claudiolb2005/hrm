# clientes-hrm — Portal de Supervisión de Nómina

Portal automatizado de supervisión mensual de nómina para clientes de **HRM Consultores**.
Toda la aplicación vive en un único Cloudflare Worker (`worker.js`) que sirve, según el rol:
panel **admin**, **portal de cliente** (socio) y **visor de reportes**.

> ⚠️ **Repo recomendado PRIVADO.** Contiene la lógica completa de la app y los IDs de
> infraestructura. No incluye secretos (las contraseñas se guardan hasheadas; la API key
> de Anthropic va como *secret* del Worker, fuera del repo).
> **Nunca** se versionan insumos de nómina (Excel/PDF con RFC/CURP/NSS/salarios): ver `.gitignore`.

## Dos partes del proyecto

1. **Portal (Cloudflare Worker)** — `worker.js` + `schema.sql` + `wrangler.toml` (abajo).
2. **Motor determinista (Python)** — `motor/` — reimplementación al centavo del cálculo de
   nómina (percepciones, ISR, IMSS, RCV, ISN) y del informe de 13 secciones, con pruebas en
   `tests/` y scripts en `src/`. Es la referencia que valida/portará el Worker.

### Motor Python — uso

```bash
pip install -r requirements.txt          # openpyxl, pandas, pytest
pytest                                    # pruebas (requieren insumos locales en data/, NO versionados)
python src/run_informe.py enero           # arma el informe de 13 secciones
python src/render_informe_html.py enero   # -> out/informe_enero2026.html (reporte visual)
```

- `motor/nomina_cliente.py` — genera **Nomina Cliente** (74 cols) desde **INCIDENCIAS** de PRIME;
  reproduce el cálculo de la plataforma origen al **98% exacto / 99.6% en $1**. Ver `ref/nomina-cliente-README.md`.
- `motor/informe.py` + `motor/secciones.py` — Informe de Supervisión de 13 secciones.
- Parámetros fiscales 2026 (UMA, tarifa ISR, subsidio, cuotas IMSS, cesantía patronal, ISN)
  recuperados de la data real y verificados contra el DOF.

## Kernel de cálculo v0.1 (`kernel/`) — Revisión del maestro v0.3

Base del kernel que pide la revisión del 13–14 oct 2026 (T1, T2, T3 aprobadas; T9; N1):
módulo JS propio, versionado y con su suite, sin dependencias, que corre igual en el
Worker y en Node. Reemplaza al motor embebido con `String.raw` como fuente de cálculo.

- `kernel/src/` — aritmética exacta, catálogo de parámetros con vigencia y base temporal,
  las 10 reglas v1, ejecución sellada con tres estados, reconciliación con tres cubetas.
- `kernel/src/d1.js` — persistencia en D1.
- `kernel/data/` — semilla de parámetros 2026 y bitácora de criterios (C1–C8).
- `migrations/0001_kernel_v1.sql` — tablas nuevas (aditiva): `encargo` con `origen_nomina`,
  `parametro_fiscal`, `regla`/`regla_fuente`, `ejecucion`, `calculo_kernel` inmutable,
  `resultado_regla`, `movimiento_nomina`, `diferencia` + vista `v_diferencia`,
  `bitacora_criterio`, `dictamen` inmutable.

```bash
cd kernel && npm test                                                        # 55 pruebas
wrangler d1 execute hrm-nomina-portal --remote --file=migrations/0001_kernel_v1.sql   # aplicar tablas
```

Aplicadas en producción el 15-oct-2026: `0001_kernel_v1.sql` (tablas) y
`0002_semilla_kernel_v1.sql` (65 parámetros, 14 fuentes, 10 reglas activas, criterios C1–C8;
generada por `kernel/scripts/semilla-sql.mjs`).

### Ingesta en el servidor (`ingesta/`, T8)

El archivo del cliente va a R2, una cola en D1 lo procesa por lotes (cron cada minuto) y al
terminar la ejecución queda sellada y reconciliada contra lo que calculó la nómina. Ver
`ingesta/README.md` (incluye los pasos para correr agosto 2026). Migraciones 0003 y 0004
aplicadas en producción el 15-oct-2026.

### Panel de auditoría (`/kernel`, sólo admin)

Botón **Auditoría** en el Administrador. Encargos, subida del Excel con avance en vivo,
reporte de la ingesta (fuentes, corridas sin calendario, conceptos no catalogados, resultado
por regla, reconciliación), diferencias agrupadas por importe con clasificación en bloque y
criterio de aceptación, calendario de nómina, registros patronales y bitácora de criterios.
Página en `paginas/kernel.js`; todo lo que viene de archivos del cliente se escapa.

### API del kernel en el Worker (`api/kernel.js`, sólo admin)

| Ruta | Qué hace |
|---|---|
| `GET /api/kernel/estado` | Versión y huella del kernel; **integridad**: catálogo en D1 = semilla del código; matriz completa |
| `GET /api/kernel/pbc` | Lista PBC derivada de las reglas |
| `GET/POST /api/kernel/encargos` | Alta de encargo con `origen_nomina` (N1) |
| `POST /api/kernel/ejecutar` | Corre reglas sobre ≤ 500 entradas canónicas y guarda la ejecución sellada |
| `GET /api/kernel/ejecuciones?encargo_id=` · `GET /api/kernel/ejecucion?id=` | Consulta; verifica el sello |
| `POST /api/kernel/movimientos` | Carga el lado «cliente» (lo que hoy calcula la nómina) |
| `POST /api/kernel/reconciliar` | Crea las diferencias kernel vs cliente |
| `GET /api/kernel/diferencias?encargo_id=` · `POST /api/kernel/clasificar` | Tres cubetas y criterio de aceptación |
| `GET /api/kernel/criterios` | Bitácora de criterios |
| `POST /api/kernel/ingestas` · `GET /api/kernel/ingestas?encargo_id=` | Sube el archivo (multipart) y lo encola; lista |
| `GET /api/kernel/ingesta?id=` · `POST /api/kernel/ingesta/avanzar` · `/reintentar` | Avance, reporte y reproceso |
| `GET/POST /api/kernel/calendario` | Calendario de nómina del encargo (fecha de pago y periodicidad por corrida) |
| `GET/POST /api/kernel/registros` | Entidad y prima de riesgo por registro patronal |
| `GET /api/kernel/diferencias/grupos?encargo_id=&ejecucion_id=` | Diferencias agrupadas por regla, rubro e importe |
| `POST /api/kernel/clasificar-grupo` | Clasifica en bloque las diferencias sin clasificar de un filtro |

Ver `kernel/README.md`.

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


## Hallazgos y dictamen (T4–T7)

Pestaña **Hallazgos y dictamen** en `/kernel`; el cliente ve sus dictámenes en `/portal` y cada uno en `/dictamen?id=…`.

1. Captura la **carga patronal del periodo dictaminado** (mes en iguala, ejercicio en niveles A): sin ella no se decide materialidad.
2. Toda diferencia clasificada como «proceso actual mal» va a una **cédula de hallazgo** (criterio, condición, causa, efecto, riesgo, recomendación, responsable, fecha). El efecto se deriva de sus diferencias.
3. **Calcular propuesta**: semáforo por módulo y opinión según el árbol (D13: sin XML originales no hay opinión).
4. **Emitir**: el dictamen queda sellado con su huella y no cambia. Un reproceso emite la versión siguiente con motivo y quién lo pidió; los hallazgos de la anterior pasan a confirmado, superado o resuelto por reproceso. Pasados 60 días del cierre del encargo, una corrección abre un encargo nuevo.

| Ruta | Quién | Qué hace |
|---|---|---|
| `POST /api/kernel/encargo/config` | admin | Carga patronal, materialidad, piso, recurrencia, tolerancia |
| `GET/POST /api/kernel/hallazgos` · `GET /api/kernel/hallazgos/pendientes` | admin | Cédulas y diferencias de proceso sin cédula |
| `GET/POST /api/kernel/hallazgo` | admin | Detalle con bitácora; actualizar cédula y estatus |
| `GET/POST /api/kernel/dictamen/propuesta` · `POST /api/kernel/dictamen/emitir` | admin | Opinión propuesta, bloqueos; emisión |
| `POST /api/kernel/encargo/cerrar` | admin | Cierra el encargo (plazo de 60 días para versiones) |
| `GET/POST /api/kernel/grupos` · `POST /api/kernel/encargos-grupo` · `POST /api/kernel/dictamen/consolidado` | admin | Grupo multi-RFC y su consolidado |
| `GET /api/dictamenes` · `GET /api/dictamen?id=` | cliente y admin | Dictámenes de la empresa, versiones e integridad |
