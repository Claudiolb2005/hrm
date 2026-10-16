# @hrm/kernel

Kernel de cálculo determinista de nómina, modo auditoría (versión 1). Es el activo que
hace defendible el dictamen: lo que la ley dice que debía haber pasado, con traza
suficiente para rehacerlo a mano y sellado contra la versión exacta de código,
reglas y parámetros.

Especificación rectora: *Documento maestro v0.3* y su *Revisión* (13–14 oct 2026).
Decisiones que implementa: T1, T2 y T3 (aprobadas 13-oct), T9, N1.

## Reglas base

- **El kernel no lee archivos ni hace E/S.** Recibe datos canónicos y un `Catalogo`;
  devuelve cálculos con traza. La persistencia vive en `src/d1.js`.
- **Los parámetros se cargan con vigencia; no se programan.** Cada renglón trae
  vigencia, base temporal, fundamento, fuente y nivel A–D.
- **Nunca afirma más de lo que verificó.** Un cálculo que toca un parámetro en nivel C,
  un dato faltante o un criterio abierto queda `limitado`; la regla no da `completo`.
- **Centavos enteros, aritmética exacta, un solo redondeo** medio hacia arriba
  (salvo IMSS/RCV/INFONAVIT: por rama, como el SUA y como lo fija la regla).

## Uso

```js
import { Catalogo, ejecutar, reconciliar, aceptacion } from '@hrm/kernel';
import { cargarCatalogo, persistirEjecucion } from '@hrm/kernel/d1';

const catalogo = await cargarCatalogo(env.DB);
const r = await ejecutar({
  catalogo, encargo_id: 'enc_prime_2026_08', corrida_id: 'SEM31',
  fuentes: { prenomina: { estado: 'completa', sha256 }, catalogo_conceptos_cliente: { estado: 'completa' } },
  items: [{ regla_id: 'CALC-ISR-SEM-001', colaborador_id: '1067513', entrada: { base_gravable_c: 776068, fecha_pago: '2026-08-06' } }],
});
await persistirEjecucion(env.DB, r, { catalogo, ejercicio: 2026 });
```

## Reglas v1

| Regla | Calcula | Caso de prueba (agosto 2026) |
|---|---|---|
| CALC-EXE-001 | Exenciones ISR y base gravable | emp 390062: prima dominical 135.79 → 117.31 exentos |
| CALC-SUB-001 | Subsidio por periodo (C2) | emp 1073134: 123.34 |
| CALC-ISR-SEM-001 | ISR semanal ordinario | emp 1067513: 1,222.87 |
| CALC-ISR-CAT-001 | ISR catorcenal (C1) | emp 191: 2,207.47 (nómina 2,207.49 → ver C1) |
| CALC-ISR-AJM-001 | Ajuste mensual | emp 191: 2,058.41 |
| CALC-ISR-EXT-001 | Pagos extra (C5) | bono 19,695.34 → 4,466.24 |
| CALC-IMSS-001 | Cuotas IMSS por rama | emp 1067513: obrera 61.28, patronal 403.41 |
| CALC-RCV-001 | Retiro, CEAV (C4) | emp 1067513: 410.12 / 48.50 |
| CALC-INF-001 | INFONAVIT 5% | emp 1067513: 215.56 |
| CALC-ISN-001 | ISN concepto × entidad | CDMX: 471,623.37, limitado (V8) |

## Pruebas

```bash
cd kernel
npm test          # verifica la huella del código y corre la suite (node ≥ 20, sin dependencias)
npm run huella    # después de cambiar cualquier archivo de src/
npm run parametros  # regenera data/parametros-2026.json
```

Nivel 1 (T1): unitarias contra la ley con los casos de *Reglas v1*. Las cifras esperadas
las escribe quien sabe nómina; el programador no las toca. Los niveles 2 (no-regresión
del portal contra febrero 2025) y 3 (reconciliación contra agosto) corren con datos
reales, que no se versionan.

## Parámetros

`data/parametros-2026.json` es una **semilla de arranque**, no el catálogo rector:
tarifas ISR 2026 del Anexo 8 (nivel A) y las cifras que cita la revisión. Se reemplaza
renglón por renglón con el *Catálogo de parámetros 2026* de Rafael González (162
renglones). ISN sólo trae las entidades que cita la revisión: una entidad sin tasa
cargada produce limitación al alcance, no un número inventado.

## Pendiente (fuera de v0.1)

- Recalcular el SBC (V4, versión 2); multas, recargos e INPC (V3); históricos 2021–2025 (V6).
- ISR de finiquitos y PTU (LISR 95 y 96): limitación al alcance hasta que llegue la regla.
- Tolerancia agregada (T4) y materialidad (T5): pendientes de ratificar; hoy la reconciliación usa tolerancia 0.
- Ingesta por cola en el servidor (T8) y mapeo del perfil de PRIME → entradas canónicas.
