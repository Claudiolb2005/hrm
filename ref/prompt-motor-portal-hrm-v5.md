# Prompt de construcción — Motor + Portal de Supervisión de Nómina HRM (v5)

> **Prompt de construcción para Opus.** Objetivo: que **el motor funcione, sea robusto y reproduzca el caso dorado (Febrero 2025) al centavo** (lectura/extracción explícitas, §5), y que el **portal conserve el look actual (tema claro aqua/teal) con TODOS los "Volver"/back funcionando** (§9).
> `(a decidir)` = decisión de la junta. `(abierto: …)` = duda a confirmar con el cliente antes de programar.
> Centros del documento: **§5 EL MOTOR** y **§9 Diseño visual y navegación**.

---

## 0. Cómo usar este documento
Especificación para reconstruir `clientes-hrm`. Orden de trabajo: **construir el motor primero**, validarlo contra Febrero 2025 al centavo, y luego el portal. El motor NO se da por terminado hasta cumplir la **Definición de Hecho (§5.11)**.

## 1. Qué es el sistema
- Portal **multi-cliente real** que automatiza la **supervisión mensual de nómina** de HRM Consultores.
- Reemplaza el proceso manual en Excel/PDF (tablas dinámicas, VLOOKUPs, conversión PDF→Excel, cruce de fuentes).
- Salida: el **informe de 13 secciones** que firma Alma Claudia Ramírez Escamilla, **generado por el motor** desde los archivos que sube el cliente o HRM.
- Cliente vivo: **PRIMEWIRELESS HOLDINGS** (RFC PHO190128QD8). Diseñar para **N clientes** (ver §7).

## 2. Diagnóstico — por qué se rehace
| Problema | Detalle |
|---|---|
| Automatización incompleta | Hoy se extrae a mano y se inserta JSON. El motor debe automatizarlo. |
| Monolito frágil | `worker.js` ~3,460 líneas con HTML en template literals → escapes, sintaxis rota. |
| Datos como blobs | Secciones en JSON curado a mano → inconsistencias. |
| Sin tolerancia a formatos | Multi-cliente = formatos distintos → necesita capa de mapeo. |
| Integridad | En un informe manual se *fabricó* una cifra de CFDI de finiquitos para tapar ~$806K. **El motor jamás cuadra inventando datos: expone la diferencia.** |

## 3. Objetivos
- Motor de ingesta real: leer → mapear → parsear → insertar → **conciliar** → generar 13 secciones, sin edición manual.
- Datos **normalizados** (multi-tenant); secciones **calculadas por consulta**.
- Frontend separado del motor.
- **Trazabilidad** (re-generar cualquier mes) y **honestidad numérica**.

## 4. Usuarios y roles
| Rol | Sube archivos | Ve |
|---|---|---|
| **admin** (HRM) | Sí, de cualquier cliente | Todo: gestión, mapeo, hallazgos, publicar |
| **socio** (cliente) | **Sí, sus crudos** | Su empresa: estado de cargas + informes publicados |
| **visor** | No | Un informe |

Ambos perfiles suben documentos (ver §8).

---

# 5. EL MOTOR

## 5.1 Principios (innegociables)
1. **No fabricación.** Si dos fuentes no cuadran, se genera un **hallazgo**; nunca se ajusta una cifra para que empate.
2. **Determinismo total en dinero.** Todo monto lo calcula código determinista. **La IA nunca toca aritmética** (solo mapeo de texto y narrativa, §6.2).
3. **Centavos enteros.** Todo importe se guarda y se compara como **entero de centavos** (`Math.round(valor*100)`). Las sumas y diferencias se hacen en enteros; solo se formatea a 2 decimales para mostrar. Esto elimina el float-drift y es lo que permite cuadrar "al centavo".
4. **Fail-closed.** Si la validación o la conciliación no es confiable, **no se publica**; se marca para revisión de HRM.
5. **Idempotencia.** Reprocesar un mes = `DELETE + INSERT` por `(empresa_id, periodo_id)`. Nunca duplica.
6. **Todo queda en bitácora.** Cada etapa registra entrada, salida, conteos y errores.

## 5.2 Pipeline (8 etapas)
```
1. UPLOAD     → archivo a R2 (prefijo por cliente) + registro en D1 (tipo, periodo, empresa, hash sha256)
2. DETECTAR   → identificar el insumo (por nombre + hojas + columnas); lo desconocido se rechaza con motivo
3. MAPEAR     → columnas del cliente → esquema canónico (plantilla por cliente; IA sugiere la 1ª vez, humano confirma)
4. PARSEAR    → extraer filas a tablas STAGING normalizadas (determinista, §5.3)
5. VALIDAR    → columnas mínimas, tipos, totales de control, duplicados, llaves (§5.6) — fail-closed
6. CONCILIAR  → R1–R6 en centavos enteros con tolerancia (§5.7) → HALLAZGOS
7. GENERAR    → calcular las 13 secciones por query/función pura (§5.8)
8. PUBLICAR   → informe en portal; narrativa III/XIII/resumen con IA (editable); descargable PDF/Word
```
El estado de cada etapa se persiste y se muestra (stepper, §9). Falla en una etapa → estado `error` con etapa+motivo y **reintentar**, conservando el progreso parcial.

---

## 5.3 LECTURA Y EXTRACCIÓN DE DATOS (explícito)

### 5.3.0 Reglas compartidas de normalización y coerción
Se aplican a **toda** lectura, en código determinista.

**Texto / encabezados** — `normalizarClave(s)`:
- `trim` → colapsar espacios múltiples a uno → `toUpperCase` → **quitar acentos** (NFD + remover diacríticos) → remover puntuación de borde.
- Ej.: `" Total  Percepciones "` → `TOTAL PERCEPCIONES`; `"Catorcena 03"` → `CATORCENA 03`.

**Números / importes** — `aCentavos(v)` (robusto a formato mexicano y a basura):
```
si v es número  → return Math.round(v*100)
s = String(v).trim()
si s ∈ {"", "-", "—", "N/A", "NA", "null"} → return 0
negativo = false
si s empieza con "(" y termina con ")"  → negativo=true; s = interior      // (1,234.50) = -1234.50
si s termina con "-"                      → negativo=true; s = sin el "-"
s = s.replace(/[$\s\u00A0]/g,"")          // quita $, espacios y NBSP
s = s.replace(/,/g,"")                    // formato MX: coma=miles, punto=decimal
n = Number(s); si NaN → ERROR de coerción (columna, fila, valor)
c = Math.round(n*100); return negativo ? -c : c
```
- Las columnas de importe se leen **siempre** con `aCentavos`. Mostrar = `centavos/100` con 2 decimales y separador de miles (`Intl.NumberFormat('es-MX')`).

**Fechas** — `aISO(v)`:
- Si SheetJS la entrega como `Date` (`cellDates:true`) → ISO.
- Si es serial Excel → convertir.
- Si es texto `dd/mm/yyyy` (convención MX) → parsear a ISO. Cualquier otro formato no reconocido → ERROR explícito.

**RFC** — `normalizarRFC(s)`: `trim` + `toUpperCase`; validar con `/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/` (3 letras = persona moral, 4 = física). RFC inválido en una fila clave → hallazgo, no se descarta en silencio.

**Reglas de fila:** se descartan filas **totalmente vacías**; se descartan filas de **subtotal/total** (clave vacía o etiqueta `TOTAL`/`SUMA` en columna llave); se descartan **encabezados repetidos**.

### 5.3.1 Detección de hoja y de fila de encabezado
La fila de encabezado **no** siempre es la primera (ej. real: hoja `RESUMEN` con encabezado en fila 2). Algoritmo:
```
seleccionarHoja(wb, insumo):
  - si el insumo declara nombre de hoja (RESUMEN/BASES) → usarlo (match normalizado)
  - si es CONTABILIDAD → elegir la hoja con pólizas (la que contenga columnas DEBIT/CREDIT)
  - si es ACUMULADO → elegir la hoja con más filas y columnas
  - fallback → la hoja cuyo mejor renglón-encabezado maximiza columnas esperadas mapeadas

detectarFilaEncabezado(filas):
  - examinar las primeras 10 filas
  - para cada fila: contar celdas string que mapean (vía §5.3.2) a una columna canónica esperada
  - devolver el índice de la fila con mayor conteo (≥ umbral); si ninguna supera umbral → ERROR "no se encontró encabezado"
```

### 5.3.2 Mapeo de columnas (plantilla → sinónimos → fuzzy → humano)
```
mapearColumnas(headersNormalizados, empresa_id, insumo):
  1. PLANTILLA: si existe plantillas_mapeo[empresa_id][insumo] → aplicarla (determinista)
  2. SINÓNIMOS: diccionario canónico→[variantes] (p. ej. NETO ← ["NETO SUELDO FISCAL","NETO A PAGAR","NETO"])
  3. FUZZY: para no resueltas, similitud por tokens + Levenshtein contra el vocabulario; aceptar solo si score ≥ umbral alto
  4. requeridas faltantes  → ERROR (lista exacta de las que faltan)
     ambiguas/no resueltas → marcar etapa MAPEAR como "requiere revisión": el humano confirma y se GUARDA plantilla
```
- **Nunca adivinar en silencio una columna requerida.** El CFDI trae columnas variables entre exports → se mapea por nombre, se ignoran extras, se exige el set mínimo.

### 5.3.3 Excel — ACUMULADO (insumo 1)  *(~17k filas × ~91 cols)*
Canónico mínimo: `SEMANA / CATORCENA`, `RFC`, `Puesto`, `REGISTRO PATRONAL`, `TOTAL PERCEPCIONES`, `TOTAL DEDUCCIONES`, `NETO SUELDO FISCAL`, desglose (`Sueldo`, `Comisiones`, `Despensa(Informativo)`, `Aguinaldo`, `Gratificacion`, `Liquidacion`, `Bono`, …), impuestos/cuotas (`I.S.R.`, `I.M.S.S.`, `RCV`, `Préstamo Infonavit`, `FONACOT`, patronal).
```
1. wb = XLSX.read(buf, {type:'array', cellDates:true, raw:true})
2. hoja = seleccionarHoja(); filas = sheet_to_json(hoja,{header:1, defval:null, blankrows:false, raw:true})
3. h = detectarFilaEncabezado(filas); mapa = mapearColumnas(filas[h])
4. para cada fila > h:
     si fila vacía o subtotal → skip
     reg = { empresa_id, periodo_id,
             rfc: normalizarRFC(col(RFC)), puesto: trim(col(Puesto)),
             registro_patronal: trim(col(REGISTRO PATRONAL)),
             semana_catorcena: normalizarClave(col(SEMANA/CATORCENA)),
             percepciones: aCentavos(col(TOTAL PERCEPCIONES)),
             deducciones:  aCentavos(col(TOTAL DEDUCCIONES)),
             neto:         aCentavos(col(NETO SUELDO FISCAL)),
             desglose: { cada concepto mapeado → aCentavos } }
     CONTROL DE FILA: assert percepciones - deducciones == neto (±1 centavo) → si no, hallazgo de fila
     acumular reg en lote
5. insertar en empleados_periodo por lotes (≤25KB / N filas), con bitácora de conteos
```
**Conceptos especiales (mapa por cliente):** `Despensa(Informativo)` NO suma a neto; `Fondo ahorro empresa` (percepción) y `Fondo de ahorro Empleado` (deducción) con igual monto se **cancelan**; `Cancelaciones Prematuras`, `Pago anticipado a neto`, `TOTAL PREVISION SOCIAL` (exento) se tratan según el mapa de conceptos. (abierto: confirmar lista completa por cliente.)

### 5.3.4 Excel — `01_<MES>_<AÑO>` hojas RESUMEN/BASES (insumo 2, ISN)
- `RESUMEN` (encabezado típico en fila 2): por estado → `RP`, `Entidad`, `Empleados`, `Base ISN` (`aCentavos`), `Tasa` (a fracción: `4.00%`→0.04), `Impuesto` (`aCentavos`). Alimenta **X**.
- `BASES`: tabla de tasas por RP/estado → construye el **mapeo estado↔registro patronal** que usa la sección VI.
- Validar: `Base ISN * Tasa ≈ Impuesto` por renglón (±1 centavo) → si no, hallazgo.

### 5.3.5 Excel — CFDI One Facture (insumo 3)  *(columnas variables)*
Canónico mínimo: `Total percepciones`, `Total deducciones`, `Total`, `Tipo nomina`, `Fecha pago`, `RFC` (y UUID si está).
```
1. leer plano; mapear por nombre (ignorar columnas extra); exigir el set mínimo
2. para cada CFDI:
     total_concil = aCentavos(Total percepciones) - aCentavos(Total deducciones)   // ← REGLA: no la columna "Total"
     fila = { rfc, total_perc, total_ded, total: aCentavos(Total),
              total_concil, tipo_nomina, fecha_pago: aISO(...), uuid }
3. DUPLICADOS: agrupar por (uuid) o por (rfc,fecha_pago,total); marcar es_duplicado a los repetidos y EXCLUIRLOS de sumas (los timbres duplicados son una constante conocida); registrar el conteo excluido
4. FINIQUITOS: varios CFDIs el mismo día por RFC → clasificar por RFC/periodo (no por fecha); finiquitos a mes completo
5. insertar en tabla cfdi
```

### 5.3.6 Excel — CONTABILIDAD (insumo 4, pólizas)
Hoja de pólizas (suele nombrarse por la cuenta, ej. `2489`). Columnas: `TRANSACTION DATE`, `DEBIT AMOUNT`, `CREDIT AMOUNT`, `ACCOUNT DESCRIPTION DETAIL` (ej. `PASIVO GLOBAL NOMINA`, `BBVA BANCOMER MXN…`), `MES AL QUE CORRESPONDE` (etiqueta de periodo: `CATORCENA 03`, `FINIQUITOS`, `PENSION CAT 03`).
```
1. seleccionar hoja con DEBIT/CREDIT; mapear
2. por póliza: { fecha: aISO(TRANSACTION DATE), debit: aCentavos(DEBIT), credit: aCentavos(CREDIT),
                 cuenta: trim(ACCOUNT DESCRIPTION DETAIL), periodo_etiqueta: normalizarClave(MES AL QUE CORRESPONDE) }
3. para DISPERSIONES (R2): sumar las pólizas que indique la CONFIG DE CONCILIACIÓN del cliente
   (abierto: ¿PAGO DE NOMINA vs TRASPASO NÓMINA BBVA? ¿TEF DEVUELTO y SPEI a otros bancos se restan o suman?)
4. para PROVISIÓN (R4, XI): tomar PASIVO GLOBAL NOMINA
5. insertar en dispersiones (origen=contab) y dejar la provisión disponible para R4
```

### 5.3.7 PDF — dispersiones BBVA Net Cash (insumo 6)  *(texto, 8 avisos/página)*
```
1. doc = pdfjs.getDocument({data}).promise
2. POR PÁGINA: tc = page.getTextContent()
     - si tc.items vacío → PDF sin capa de texto (escaneado) → marcar "requiere OCR / no parseable" (NO devolver 0)
     - reconstruir líneas: agrupar items por Y (tolerancia), ordenar por X dentro de la línea
     - segmentar en bloques de "aviso" por las etiquetas ancla del aviso BBVA (Importe / Cuenta / Beneficiario / Referencia)
3. POR AVISO, extraer con regex:
     monto:  /[\d,]+\.\d{2}/   → aCentavos
     rfc:    /[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}/
     clabe:  /\b\d{18}\b/
     fecha:  /\d{2}\/\d{2}\/\d{4}/
4. CLASIFICAR por nombre de archivo: NOMSEM/NOMCAT/FINIQUITOS · BBVA(interno) / INTER(SPEI) / PNOM(pre-pago)
5. sumar por periodo: total_banco = Σ(BBVA) + Σ(INTER)
6. insertar en dispersiones (origen=banco); manejar última página con < 8 avisos
```
**Rechazos (insumo 7):** se restan para justificar la diferencia banco↔acumulado. Ejemplo real: `10,825,932.24 + 6,236,276.61 = 17,062,208.85`; dif vs acumulado `16,226.96`; rechazos `16,225.52`; **dif final `1.44` = aceptable**.

### 5.3.8 ZIP — desvinculaciones / comprobantes (JSZip)
Descomprimir en navegador → iterar entradas → enrutar PDFs al parser §5.3.7 → listar finiquitos por nombre de empleado (carpeta/archivo) → validar nombres contra los RFC del acumulado → para los que hay evidencia, extraer importe y fecha del comprobante.

### 5.3.9 Visor de Nóminas SAT (insumo 4 del informe — sección VII)
5 cifras: total nómina, nómina exenta, ISR retenido, ISR enterado, trabajadores timbrados.
- Si llega como **PDF con texto** → parsear por etiquetas.
- Si llega como **imagen/captura** → **captura manual** en un formulario corto del panel admin (5 campos). Robusto: no se intenta OCR frágil para 5 números.

### 5.3.10 Calendario (insumo 5, opcional)
- Si llega `CALENDARIO_<MES>_<AÑO>.xlsx` → leerlo.
- Si no → **generar por convención**: semanales = viernes de cada semana ISO; catorcenales = miércoles cada 14 días desde fecha base del año; periodos variables (BONO CAT, FINIQUITOS, GRATIFICACIONES) se derivan del acumulado y los pagos.

---

## 5.4 Esquema D1 normalizado (multi-tenant)
Todas con `empresa_id`. Mínimo:
`empresas`(rfc, config_conciliacion JSON, mapeo_estado_rp JSON, mapa_conceptos JSON) · `usuarios` · `periodos`(mes, anio, tipo, estado) · `archivos`(tipo_insumo, r2_key, hash, estado_pipeline, log) · `plantillas_mapeo`(tipo_insumo, mapa_columnas JSON) · `empleados_periodo`(rfc, puesto, registro_patronal, estado, percepciones, deducciones, neto, semana_catorcena, desglose JSON) · `cfdi`(rfc, total_perc, total_ded, total, total_concil, tipo_nomina, fecha_pago, uuid, es_duplicado) · `dispersiones`(origen, rfc, monto, fecha, es_rechazo) · `conciliaciones`(tipo R1..R6, monto_a, monto_b, diferencia, dentro_tolerancia) · `hallazgos`(descripcion, monto, estado, nota) · `secciones`(num_seccion, datos_json) · `bitacora`(etapa, mensaje, ts).
**Importes en columnas enteras de centavos.** Las secciones se **calculan**, no se curan a mano.

## 5.5 Inserción (reglas)
- `?1` + `.bind()`; nunca interpolar JSON en SQL.
- `DELETE` + `INSERT` por `(empresa_id, periodo_id)` (idempotente); no `INSERT OR REPLACE`.
- `json_valid(datos_json)` tras insertar; lotes ≤25KB; sin cross-database insert.
- **Atomicidad lógica:** primero STAGING, luego secciones; si GENERAR falla, el STAGING permanece para re-correr.

## 5.6 Validación y totales de control (fail-closed)
| Chequeo | Regla | Si falla |
|---|---|---|
| Columnas mínimas | presentes por insumo (§5.3) | ERROR (lista exacta) |
| Coerción | todo importe pasa `aCentavos`; toda fecha `aISO` | ERROR (columna, fila, valor) |
| Control de fila | `percepciones − deducciones = neto` (±1 centavo) | hallazgo de fila |
| Control de periodo | Σ por periodo coherente; Σ periodos = total archivo | hallazgo + **no publica** |
| Duplicados CFDI | mismo UUID o (RFC,fecha,total) → excluir | registrar conteo |
| Integridad de llave | `RFC+NETO+PERIODO`; colisión (2 registros mismo periodo) → regla por cliente (sumar / 2 llaves) | registrar |
| Cobertura (R6) | cada RFC del acumulado tiene CFDI | listar faltantes (sec III/VII) |
| ISN | `Base*Tasa ≈ Impuesto` por renglón | hallazgo |

## 5.7 Conciliación R1–R6 (en centavos enteros)
Llave a nivel empleado: `RFC + NETO + PERIODO`.
| # | A | B | Tolerancia | Sec |
|---|---|---|---|---|
| R1 | Acumulado NETO/periodo | **CFDI: Σperc − Σded** | ≤ tol (centavos) | II |
| R2 | Acumulado NETO/periodo | Banco (BBVA+INTER) y/o Contab DEBIT − rechazos | dif justificada por rechazos | II |
| R3 | Acumulado I.S.R. | Visor SAT ISR retenido | ≤ tol | VII |
| R4 | PASIVO GLOBAL NOMINA | Nómina − despensa + pensión | dif desglosada | XI |
| R5 | Duplicados CFDI | — | marcar/excluir | II/III |
| R6 | RFCs acumulado | RFCs CFDI | faltantes/extra | III/VII |
- Tolerancia configurable por cliente/reconciliación (default ±$1.00 = 100 centavos por redondeos). Diferencia > tolerancia → **hallazgo** (no se oculta).

## 5.8 Cálculo de las 13 secciones (por query)
I Integración · II R1+R2 · III narrativa sobre hallazgos (IA) · IV concentrado por periodo · V por puesto (mapeo híbrido) · VI por estado (vía BASES) · VII impuestos + R3 · VIII patronales · IX IMSS/RCV por RP · X ISN (RESUMEN) · XI R4 desglosado · XII tendencias (meses publicados) · XIII acciones (IA). Orden de meses con `CASE mes WHEN 'enero' … END`.

## 5.9 Manejo de errores, reintentos y estados
- Cada etapa envuelta en try/catch → estado `error` con etapa + mensaje accionable + **reintentar**; progreso parcial conservado.
- Mensajes de error **específicos** (qué columna/fila/archivo), nunca genéricos.
- Reproceso idempotente; nunca duplica.
- Fail-closed: validación o conciliación no confiable → no publica.
- Todo a `bitacora`.

## 5.10 Caso dorado y pruebas
- **Febrero 2025** = referencia con las 13 secciones validadas. **Nada avanza si el motor no lo reproduce al centavo.**
- El prototipo Python (`calendario`, `acumulado`, `cfdi`, `dispersiones`, `conciliador`, `reporte`) cuadró **7/10 periodos** → portar sin cambiar fórmulas y **cerrar los 3 restantes**.
- **Suite de pruebas por parser** contra fixtures de Febrero 2025; correr en CI antes de desplegar. Cada parser entrega su prueba antes de integrarse.

## 5.11 Definición de Hecho del motor (criterios de aceptación)
El motor se considera terminado **solo si**:
1. Reproduce **Febrero 2025 al centavo** en las 13 secciones.
2. Todos los **totales de control** (§5.6) pasan o generan hallazgo trazable.
3. Las conciliaciones R1–R6 corren en **centavos enteros** con tolerancia configurable.
4. Es **idempotente** (reproceso sin duplicar) y **fail-closed** (no publica con datos no confiables).
5. **Cero IA en el camino numérico.**
6. Cada etapa registra en bitácora; cada error es específico y accionable.
7. Maneja los casos borde enumerados: encabezado fuera de la primera fila, columnas variables del CFDI, timbres duplicados, finiquitos con múltiples CFDIs, empleado con 2 registros, PDF escaneado sin texto, última página con <8 avisos, valores vacíos/negativos/entre paréntesis.

## 5.12 Dónde corre el motor **(a decidir)**
| Opción | Qué es | Pros | Contras |
|---|---|---|---|
| A — Navegador limpio | baja de R2, parsea con SheetJS/PDF.js, sube JSON | sin límite CPU del Worker; hay prototipo | depende del navegador; difícil para el socio |
| B — Workflows/Queues | Worker encola; Workflow procesa por pasos | asíncrono, reintentos | curva, límites de tiempo |
| C — Servicio externo | microservicio (contenedor) hace el parseo pesado | sin límites, Python directo | infra fuera de Cloudflare |
**Propuesta:** **B** para orquestar (estados/reintentos) + parseo pesado en B o C. Evitar depender del navegador del socio. (El ACUMULADO ~15MB y PDFs de 258 pág exceden el CPU/memoria del Worker → el parseo pesado NO corre en el Worker.)

---

# 6. Cómo lo construye Opus
## 6.1 Orden de construcción
1. Esquema D1 normalizado; migrar Febrero 2025 (caso dorado).
2. Portar el prototipo Python a módulos deterministas del runtime, **sin cambiar fórmulas**.
3. Un parser por insumo + su prueba al centavo antes de integrarse.
4. Capa de mapeo tolerante (plantilla por cliente; IA solo sugiere, humano confirma).
5. Conciliador R1–R6 (centavos) + hallazgos.
6. Generador de secciones por query.
7. Frontend SPA + todas las pantallas/estados (§9).
8. Validar sintaxis (`node --check`/`acorn` sourceType module) antes de desplegar; en archivos grandes (~220KB+) entregar **parches search-and-replace**.

**Reglas duras:** IA nunca hace aritmética · nunca cuadrar inventando · idempotencia DELETE+INSERT · nunca `unicode_escape` sobre el source (rompe UTF-8/español).

## 6.2 IA en runtime
| Modelo | Tarea | Determinismo |
|---|---|---|
| Haiku | sugerir mapeo de formato nuevo; normalizar puestos | sugerencia, humano confirma |
| Sonnet/Opus | redactar III (explicar diferencias **ya calculadas**), XIII y resumen ejecutivo | texto sobre números reales; HRM edita antes de publicar |

---

# 7. Multi-cliente real
- Aislamiento por `empresa_id` en cada tabla y query (D1 sin RLS → en código). R2 con prefijo por cliente. Sesiones ligadas a empresa.
- El socio solo ve su empresa; admin todas.
- Por cliente cambia: formato de archivos (`plantillas_mapeo`), registros patronales y `mapeo_estado_rp`, `mapa_conceptos`, y `config_conciliacion` (qué pólizas suman, tolerancias, contra qué compara dispersiones).
- Alta de cliente nuevo: crear empresa → cargar primer mes → IA sugiere mapeo → HRM confirma plantilla y config → reutilizable.

# 8. Ingesta y carga — ambos roles
**Socio:** ve qué subir (contrato de entradas del mes) → drag-drop multi-archivo etiquetando tipo → validación inmediata → estado simple (*En proceso · Requiere revisión HRM · Listo*) → al publicar HRM, ve el informe. No ve hallazgos crudos.
**Admin:** igual, para cualquier cliente + sube lo que el cliente no provee (visor SAT, ISN, informe previo); accede a mapeo, hallazgos, narrativa y publicar.
**Reglas:** tipos .xlsx/.pdf/.zip, tamaño máximo, validación, reemplazo (reprocesa), hash anti-duplicado. Aquí **no** entran credenciales ni pagos.

# 9. Diseño visual, componentes y navegación (explícito y robusto)

## 9.0 Principio: conservar el look actual
Preservar el aspecto que ya gusta: **tema claro aqua/teal** de la marca HRM (NO oscuro). Reusar los mismos tokens, tipografía y componentes del portal actual. Lo que cambia: ahora **todos los "Volver"/back funcionan** y existen las pantallas que faltaban (carga, proceso, mapeo, hallazgos, estados de error/vacío).

## 9.1 Tokens de diseño (sistema — usar tal cual)
Variables CSS, tema claro aqua/teal (las del portal actual):
```
--bg #f0f6f8 · --surface #ffffff · --card #ffffff · --card-hover #f7fbfc
--border #d4e5eb · --border-light #e8f1f4
--text #1a2e3a · --text-sec #5a7a8a · --muted #8ba5b2
--accent #1a8a8a · --accent-light #2bb5b5 · --accent2 #0e6e7a · --teal #20a0a0 · --aqua #40c8c8
--red #d94452 · --amber #d4920a · --purple #7b5ea7 · --blue #2a7ab5   (cada uno con *-dim ~0.08–0.10 alpha)
--font 'Plus Jakarta Sans' (400–800) · --mono 'JetBrains Mono' (números/códigos)
```
- Radios: cards 12–13px, controles 8–10px, chips 6px. Sombras suaves. Scrollbar 6px.
- Moneda: `Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'})`, en fuente mono.
- Fuentes desde Google Fonts (igual que hoy). Un **único archivo de tema**; todo por variables. (Modo oscuro opcional como toggle; **default = claro**.)

## 9.2 Layout base
- `.layout` flex: **sidebar** (260px, sticky, colapsable; logo arriba, footer con "Cerrar sesión" en rojo) + **main**.
- **Topbar** dentro de main: a la izquierda **breadcrumb + BackButton**; a la derecha menú de rol + cerrar sesión.
- Sidebar con navegación por rol, ítem activo resaltado; en móvil colapsa a drawer.

## 9.3 NAVEGACIÓN Y RUTEO — que TODOS los "Volver" funcionen
La corrección clave. **Router real (SPA) con History API; nada de `href` sueltos ni `history.back()` ciego.** Tabla única de rutas; cada vista declara su **ruta padre** y el BackButton navega SIEMPRE a esa padre.
```
Jerarquía (back = subir un nivel):
/login
/(app)
  /dashboard                       ← raíz por rol
  /empresas                        ← dashboard
    /empresas/:id                  ← /empresas
    /empresas/:id/editar           ← /empresas/:id
  /usuarios                        ← dashboard
  /periodos                        ← dashboard
    /periodos/:id                  ← /periodos
      /periodos/:id/cargar         ← /periodos/:id
      /periodos/:id/proceso        ← /periodos/:id
      /periodos/:id/mapeo          ← /periodos/:id/proceso
      /periodos/:id/hallazgos      ← /periodos/:id
      /periodos/:id/informe        ← /periodos/:id
  /bitacora                        ← dashboard
/r/:token  (visor, sin gestión)
```
**Reglas de robustez del back (todas obligatorias):**
1. **BackButton = ruta padre declarada** (determinista; nunca cae en pantalla inválida).
2. **Sincronía navegador↔app:** back del navegador = back del botón; `pushState` en cada navegación.
3. **Deep-link + refresh (F5):** recargar en cualquier ruta restaura el estado leyendo `:id`/params y refetch. Nada se rompe.
4. **Back en modal/diálogo cierra el modal**, no la página (`Esc` y back cierran el overlay).
5. **Back durante proceso conserva la carga** (el pipeline corre en backend); al volver se ve el estado actual.
6. **Back con cambios sin guardar** (mapeo / edición de narrativa) → diálogo "¿Descartar cambios?".
7. **Role-aware:** el back nunca lleva a ruta no permitida por el rol; si la padre no aplica, redirige a su dashboard.
8. **404 / ruta inválida** → pantalla "no encontrado" con botón a dashboard (nunca pantalla en blanco).
9. **Sesión expirada** en cualquier punto → /login guardando `returnTo`; tras login vuelve a donde estaba.
10. **Breadcrumb clickeable**, coherente con la jerarquía (cada nivel navega a esa ruta).

**Componente `<BackButton>`:** único y reutilizado en TODAS las vistas; deriva la ruta padre de la tabla y muestra "← Volver a {Padre}" (ej. "← Volver a Periodos").

## 9.4 Inventario de componentes (anatomía + estados) — conservar el look
| Componente | Anatomía | Estados |
|---|---|---|
| Sidebar | logo, ítems por rol, ítem activo, footer "Cerrar sesión" (rojo) | normal / colapsado / drawer móvil |
| Topbar | breadcrumb + `<BackButton>` + menú rol | — |
| KPI card | etiqueta, valor (mono), `--kpi-color` | normal / skeleton / vacío (—) |
| Sección acordeón | header (núm romano + título + chevron) + body | colapsado / abierto |
| Chart card | título + `<canvas>` Chart.js | cargando (skeleton) / con datos / vacío |
| Tabla | encabezado teal, filas, formato es-MX, diferencias en color | cargando / datos / vacío / paginada |
| Callout | banda lateral teal/roja con cifras de conciliación | info / éxito / alerta |
| Dropzone | área drag-drop por insumo + lista de archivos | idle / hover / subiendo (%) / éxito / error |
| Stepper de proceso | 8 etapas (check/spinner/error) + log + reintentar | por etapa: pendiente / en curso / ok / error |
| Tabla de mapeo | columna cliente ↔ canónica + sugerencia IA | sin mapear / sugerido / confirmado |
| Lista de hallazgos | descripción, monto, estado, nota | abierto / justificado |
| Editor de narrativa | III/XIII/resumen (IA), editable | borrador / editado / guardado |
| Toast | éxito / error / info | autohide |
| Diálogo confirmación | título, descripción, acciones | publicar / eliminar / reprocesar / descartar |
| Skeleton | placeholder por componente | — |
| Empty state | ícono + texto + CTA | sin empresas/periodos/documentos/informes/resultados |
| Error state | mensaje **específico** + reintentar | por etapa |
| Badge de estado | En proceso / Requiere revisión HRM / Listo / Publicado | colores semánticos |

## 9.5 Pantallas por rol (ruta → contenido → back)
Cada vista trae `<BackButton>` (ruta padre §9.3), estados de carga/vacío/error y es responsive.

**Login** `/login`: logo, gradiente aqua, email/clave, error de credenciales, recuperación (si aplica), redirección por rol. (sin back)

**Admin (HRM):**
| Ruta | Contenido | Back |
|---|---|---|
| /dashboard | KPIs: clientes, periodos en proceso, hallazgos abiertos, últimas cargas | — |
| /empresas | lista + alta | dashboard |
| /empresas/:id | RP, mapeo estado↔RP, config conciliación, mapa conceptos | /empresas |
| /usuarios | lista/alta (rol, empresa, reset) | dashboard |
| /periodos | lista por empresa, alta (mes/año/tipo), badge estado | dashboard |
| /periodos/:id | resumen + accesos a cargar/proceso/hallazgos/informe | /periodos |
| /periodos/:id/cargar | dropzone multi-archivo por insumo | /periodos/:id |
| /periodos/:id/proceso | stepper 8 etapas + log + reintentar | /periodos/:id |
| /periodos/:id/mapeo | tabla de mapeo (sugerencia IA, confirmar, guardar plantilla) | /proceso |
| /periodos/:id/hallazgos | resolver/justificar + nota → sec III | /periodos/:id |
| /periodos/:id/informe | 13 secciones (acordeón + charts + tablas); editar III/XIII/resumen; publicar/despublicar; descargar PDF/Word | /periodos/:id |
| /bitacora | auditoría de cargas/procesos/ediciones | dashboard |

**Socio (cliente):**
| Ruta | Contenido | Back |
|---|---|---|
| /dashboard | sus periodos + estado de cargas + avisos "requiere info" | — |
| /periodos/:id/cargar | instrucciones (qué subir) + dropzone | /dashboard |
| /periodos/:id | badge simple: En proceso / Requiere revisión HRM / Listo | /dashboard |
| /periodos/:id/informe | 13 secciones, descargar PDF/Word | /dashboard |

**Visor** `/r/:token`: un informe, sin sidebar de gestión, solo descarga.

## 9.6 Responsive y accesibilidad
- Breakpoints: ≥1200 sidebar fijo · 768–1199 colapsable · <768 drawer + botón menú en topbar.
- Tablas grandes → scroll horizontal con encabezado fijo; charts con `responsive:true`.
- Foco visible; navegación por teclado; `Esc` cierra modales; back/`Esc` consistentes; contraste AA; `aria-current` en breadcrumb/sidebar activo; estados comunicados con texto, no solo color.

## 9.7 Definición de Hecho de la navegación (criterios de aceptación)
La UI no se da por terminada hasta que:
1. **Todo `<BackButton>` lleva a su ruta padre declarada** y está presente en TODAS las vistas (salvo login/visor).
2. Back del navegador = back del botón; `pushState` en cada navegación.
3. F5 en cualquier ruta restaura el estado (deep-link).
4. Back en modal cierra el modal; back en proceso conserva la carga; back con cambios sin guardar pide confirmación.
5. Back nunca cae en ruta no permitida por rol ni en pantalla en blanco; 404 y sesión expirada manejados.
6. Breadcrumb clickeable y coherente con la jerarquía.
7. El look (tokens §9.1, componentes §9.4) coincide con el portal actual.

# 10. Reglas de negocio (resumen; detalle en §5.6–5.7)
Llave `RFC+NETO+PERIODO` · CFDI = perc−ded · finiquitos por RFC/periodo y mes completo · provisión = nómina − despensa + pensión · excluir timbres duplicados · meses con `CASE` · puestos híbrido (prefijo EJECUTIVO DE VENTAS / GERENTE REGIONAL, exacto el resto).

# 11. Stack e infraestructura
Cloudflare Workers (ES modules), D1, KV, R2; evaluar Workflows/Queues. Libs: pdfjs-dist@3.11.174, SheetJS, JSZip, Chart.js. Repo `github.com/Claudiolb2005/hrm` (Workers Builds). Infra: cuenta `2eae6266491115089bd40cb3c597e136` · D1 `hrm-nomina-portal` `4665558e-b9ae-46d9-ab84-efdeabc940cb` · KV `hrm-sessions` `57c364fa304d448b974f44c77d47da6d` · R2 `hrm-nomina-docs` · Worker `clientes-hrm`.

# 12. Landmines
`node --check`/`acorn` antes de desplegar · D1: `?1`+`.bind()`, DELETE+INSERT, `json_valid`, lotes ≤25KB · nunca `unicode_escape` sobre el source · `wrangler.toml` con los 3 bindings explícitos (no se heredan) · archivos grandes → parches search-and-replace.

# 13. Roadmap
1. Esquema D1 + Febrero 2025. 2. Parsers → STAGING validados al centavo. 3. Conciliador + hallazgos. 4. Secciones. 5. Orquestación (Workflows/Queues) + estados. 6. Frontend + pantallas. 7. Carga self-serve socio. 8. IA (Haiku mapeo/puestos, Sonnet III/XIII/resumen). 9. 2º cliente.

# 14. Preguntas abiertas
- (resuelto) Multi-cliente: sí. Ambos suben: sí.
- (abierto) Lógica exacta de dispersiones (§5.3.6 / R2) — confirmar con PrimeWireless.
- (abierto) Empleado con 2 registros en el mismo periodo: ¿sumar o 2 llaves?
- ¿Los insumos siempre llegan completos? (define secciones generables)
- ¿Informe firmado sigue siendo PDF/Word además del portal?
- ¿Dónde corre el parseo pesado (§5.12)?
- ¿Quién mantiene el catálogo de conceptos por cliente?
