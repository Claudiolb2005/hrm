# Changelog — @hrm/kernel

Cada cambio de regla entra con una línea que dice qué cambió y desde qué fecha aplica (T9).
La versión viaja en cada `calculo_kernel` y en cada dictamen.

## 0.8.0 — 2026-10-19

Pruebas de exactitud del cálculo. No cambia ninguna regla ni ningún importe; cambian nivel, fuente y notas de parámetros.

- **Oráculo independiente** (`oraculo/`): ISR, subsidio, ajuste mensual, pagos extra, exenciones, IMSS, RCV e
  INFONAVIT reescritos en Python desde la ley, sin ver el código del kernel. `oraculo/diferencial.mjs` compara los dos
  al centavo; 130,000 casos aleatorios y de frontera en 6 semillas sin una diferencia. La primera corrida encontró 9
  diferencias de un centavo en catorcenal: eran del oráculo (Decimal trunca ÷ 14), el kernel redondeaba bien.
  `npm test` corre 3,000 casos.
- **Invariantes** (`test/invariantes.test.js`, 33 pruebas): las seis tarifas del Anexo 8 cuadran al centavo entre sí
  (diaria = mensual ÷ 30.4; 7, 10 y 15 días = diaria × días; anual = mensual × 12; cuotas fijas = impuesto acumulado);
  ISR creciente y continuo en fronteras; subsidio al centavo en el tope; tope de 25 UMA; umbral de 3 UMA; fronteras de
  CEAV con truncado (C4); cambio de UMA dentro del periodo; incapacidades por rama; topes de exención.
- **Cotejo de parámetros contra fuente oficial** (19-oct-2026): UMA, INPC y tarifas del Anexo 8 a nivel A; subsidio,
  recargos, cuotas IMSS, RCV, CEAV, salarios mínimos y tasas de ISN coinciden. Correcciones de descripción: adicionales
  de Chihuahua (extraordinarias sobre base × 3%) y Tlaxcala (no hay condonación general). Migración 0013.
- **Criterios nuevos** C13 (primer renglón de CEAV en SM), C14 (LSS art. 36, cuota obrera del salario mínimo) y C15
  (ISN Sinaloa progresivo).
- **No-regresión de informes publicados** (`scripts/no-regresion-reporte.mjs`): ISN por estado a través del kernel,
  aritmética interna y cuadre entre secciones, registros duplicados.
- **Casos dorados** (`data/casos-dorados.mjs`, 42 casos / 58 importes): plantilla .xlsx para que Rafael capture la
  cifra esperada a mano, importador y prueba que compara al centavo.

## 0.7.0 — 2026-10-15

Secciones 7 y 11 del dictamen y conservación (N6). No cambia ninguna regla de cálculo.

- `saldosAFavor`: lo pagado de más por rubro (cliente > kernel), quién lo recupera, cuánto depende de un criterio
  pendiente y cuánto falta clasificar. Lo que se clasificó como error del kernel no cuenta.
- Sección 11 (módulo 25): los hallazgos de periodos anteriores de la misma empresa que siguen abiertos se reportan
  en cada dictamen, con su responsable y si la fecha compromiso ya venció.
- El contenido del dictamen dice hasta cuándo se conservan los archivos fuente (cinco años después de la anual del
  ejercicio, o el plazo del contrato si es mayor). Migración 0012.

## 0.6.0 — 2026-10-15

Valuación de hallazgos (módulo 18; adelanta V3 de la versión 2). No cambia ninguna regla de cálculo.

- `valuacion.js`: contribución omitida por rubro y mes de pago → actualización (CFF 17-A: factor al diezmilésimo,
  truncado, mínimo 1; último INPC publicado si falta el del mes), recargos (CFF 21: por mes o fracción con la tasa
  de cada mes, tope 60) y multa (CFF 76 para ISR; LSS 304 para cuotas) sobre la contribución actualizada.
  Contingencia mínima = corrección espontánea (CFF 73); máxima = con la multa máxima. ISN no se valúa (ley estatal).
- Parámetros nuevos: INPC dic-2025 a sep-2026 (boletines INEGI, nivel B), recargos 2026 (LIF art. 11 fr. I: 1.38%
  de prórroga, nivel A → 2.07% de mora, nivel D), recargos 2025 (1.47%, nivel B), multas CFF 76 (55–75%) y LSS 304
  (40–100%), nivel B. Migración 0010.
- La materialidad usa la contingencia máxima valuada (D7); la cédula del dictamen trae el desglose.

## 0.5.0 — 2026-10-15

Requerimiento de información y cruce de afiliación. No cambia ninguna regla de cálculo.

- Fuente nueva `maestro_empleados` (no la declara ninguna regla CALC; la usa el cruce de afiliación).
- `ingesta/maestro.js`: lector del maestro de empleados (perfil HC de PRIME: activos, bajas aplicadas, finiquitos)
  que guarda sólo número de empleado, RFC, fechas y grupo (N7). Validado contra el maestro real de PRIME del
  14-oct (3,148 empleados; sólo estadísticas, ningún dato se versiona).
- Cruce de afiliación (D7 cualitativo): pago después de la baja en corrida ordinaria sin separación, pago antes del
  alta; pagados ausentes del maestro cuentan como cobertura. Módulo 4.12 siempre en universo parcial mientras las
  fechas sean del maestro y no del IDSE.
- El contenido del dictamen declara los documentos pedidos no recibidos completos (documento, responsable, fecha).
- Migraciones 0008 y 0009.

## 0.4.0 — 2026-10-15

XML de nómina (B3) y cruce nómina ↔ CFDI (módulo 4.2; D5, D13). No cambia ninguna regla de cálculo.

- `ingesta/cfdi-xml.js`: lector de CFDI 3.3/4.0 con nómina 1.2 sin dependencias; resuelve prefijos por espacio de
  nombres; importes exactos; reporta los cuadres internos que fallan (Total, SubTotal, Descuento, gravado + exento,
  ISR retenido). Asignación de corrida por FechaFinalPago y periodicidad (D5); sin coincidencia única no se adivina.
  Metadata del SAT (descarga masiva) para el estado vigente/cancelado.
- `ingesta/cfdi.js`: cola en D1 para el ZIP de XML (una lectura por rango de R2 por lote de 250) y para la metadata;
  huella del paquete en streaming; cruce contra la última prenómina terminada del encargo.
- `ingesta/cruce.js`: percepciones, ISR retenido y neto por colaborador y corrida, al centavo (criterio C11); pago
  sin CFDI, CFDI sin nómina. Repetidos y cancelados fuera; lo que no se pudo cruzar deja el módulo en universo parcial.
- La prenómina guarda percepciones, neto y RFC por renglón para el cruce.
- `estadoModulos` recibe módulos que salen de un cruce de fuentes (4.2). La propuesta de opinión toma el paquete
  cruzado como fuente B3; los cruces sin clasificar o de proceso sin cédula bloquean la emisión.
- Migración 0007.

## 0.3.0 — 2026-10-15

Del resultado a la opinión: hallazgos, tolerancia, materialidad y dictamen (T4, T5, T6, T7; D2, D7, D13).
No cambia ninguna regla de cálculo.

- `dictamen.js`: tolerancia T4 por rubro y corrida ($0.50 individual; agregado = máx($5.00, colaboradores × $0.50)
  sobre la suma con signo de lo tolerado; nunca en rubros de entero), umbral de materialidad sobre la carga patronal del
  periodo dictaminado con piso, disparadores cualitativo y por recurrencia, estado por módulo del frente 1, árbol de
  opinión (sin opinión sin B1/B3, adverso si es generalizado, salvedades, observaciones, conforme), cambio de opinión
  sólo con motivo, consolidado de grupo por la peor opinión, reproceso con límite de 60 días y transición de hallazgos.
- La ingesta y `/reconciliar` aplican la tolerancia con la configuración del encargo; el reporte dice cuántas
  diferencias quedaron dentro de tolerancia.
- Migración 0006: hallazgo con cédula y bitácora (no se borra), dictamen versionado e inmutable, foto de hallazgos por
  versión, grupos multi-RFC y dictamen consolidado.

## 0.2.0 — 2026-10-15

Ingesta en el servidor (T8) y reconciliación por lotes.

- Ejecución por lotes: `abrirEjecucion` → `calcularLote` (idempotente, ids deterministas) →
  `cerrarEjecucion`. El sello final encadena el sello de cada lote. En D1 la ejecución nace
  `abierta` y sólo puede pasar a `sellada`; no se agregan cálculos a una sellada (migración 0003).
- Universo esperado por regla (`universo_por_regla`); excluidos resumidos por motivo con muestra.
- Reconciliación: los cálculos limitados con cifra también se comparan (descubrimiento) y se
  marcan; una coincidencia limitada nunca cuenta para «conforme».
- La huella del código cubre kernel e ingesta.
- CALC-EXE-001 1.1.0 (aplica desde 2026-01-01): el acumulado anual y la fecha de ingreso dejan de
  ser obligatorios para toda la regla; si un renglón trae un concepto con tope anual o una
  separación y falta el dato, ese renglón queda limitado. Topes semanales × semanas del periodo.
- CALC-ISR-AJM-001 y CALC-ISR-EXT-001 1.1.0: rubro `isr` (son el ISR de esa nómina), para
  reconciliar contra la misma columna del cliente.

## 0.1.0 — 2026-10-15

Base del kernel de la versión 1 (auditoría de agosto 2026 de PrimeWireless), según la
Revisión del maestro v0.3 (T1, T2 y T3 aprobadas el 13-oct).

- Módulo propio con versión semántica y suite de pruebas, en vez de embebido con `String.raw` (T9).
- Aritmética exacta racional en centavos; un solo redondeo, medio hacia arriba.
- Catálogo de parámetros con vigencia, base temporal (fecha de pago, día cotizado,
  mes de causación, dato de entrada) y nivel A–D; nivel C produce limitación por construcción.
- `calculo_kernel` inmutable con traza suficiente para rehacer el cálculo a mano;
  ejecución sellada con huella de código, versión de reglas, versión de parámetros y
  SHA-256 de entradas (T2).
- Matriz regla ↔ fuente derivada de las reglas, prueba de arranque, lista PBC de la misma
  fuente, tres estados de resultado con cobertura declarada (T3).
- Reconciliación con tres cubetas y criterio de aceptación «cero diferencias sin clasificar» (T1).
- Diez reglas v1, aplican desde 2026-01-01: CALC-EXE-001, CALC-SUB-001, CALC-ISR-SEM-001,
  CALC-ISR-CAT-001, CALC-ISR-AJM-001, CALC-ISR-EXT-001, CALC-IMSS-001, CALC-RCV-001,
  CALC-INF-001, CALC-ISN-001. Incorporan las correcciones 1, 2, 5, 6 y 7 de la revisión.
