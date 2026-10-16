# Changelog — @hrm/kernel

Cada cambio de regla entra con una línea que dice qué cambió y desde qué fecha aplica (T9).
La versión viaja en cada `calculo_kernel` y en cada dictamen.

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
