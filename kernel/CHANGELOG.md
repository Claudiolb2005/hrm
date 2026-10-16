# Changelog — @hrm/kernel

Cada cambio de regla entra con una línea que dice qué cambió y desde qué fecha aplica (T9).
La versión viaja en cada `calculo_kernel` y en cada dictamen.

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
