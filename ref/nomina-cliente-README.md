# Motor "Nomina Cliente" (PRIME) — INCIDENCIAS → Nomina Cliente

Automatiza el entregable semanal que PRIME solicita: a partir del archivo
**`INCIDENCIAS NOMINA SEMANA X`** (lo que PRIME envía) genera **`Nomina Cliente SEM X`**
(hoy hecho a mano). Código: `motor/nomina_cliente.py`. Pruebas: `tests/test_nomina_cliente.py`.

## Uso

```python
from motor.nomina_cliente import generar_archivo

# referencia = el/los Nomina Cliente previos (fuente del maestro por empleado)
generar_archivo(
    incidencias_path="INCIDENCIAS NOMINA SEMANA 24.xlsx",
    referencia_paths=["Nomina Cliente SEM 26.xlsx"],
    out_path="Nomina Cliente SEM 24.xlsx",
)
```

## La transformación (44 cols → 74 cols)

`INCIDENCIAS` trae datos crudos (identidad, incidencias, comisiones, préstamos).
`Nomina Cliente` es la **nómina calculada completa** (percepciones, ISR, IMSS, RCV,
deducciones, neto y previsión social patronal). Las 74 columnas salen de 3 orígenes:

1. **Directas de INCIDENCIAS (~55 cols):** ID, RFC, SD, fecha ingreso, faltas,
   incapacidades, vacaciones, comisiones, incentivos, préstamos, chargeback, averías…
   → 100% exactas.
2. **Calculadas (motor fiscal 2026):** Sueldo, prima dominical, día festivo/descanso,
   **ISR, IMSS obrero/patronal, RCV obrero/patronal, Infonavit empresa, ISN**.
3. **Maestro por empleado (NO viene en INCIDENCIAS):** **SBC**, Sucursal, Registro
   Patronal, Región, préstamos Infonavit/FONACOT, pensión, seguro vivienda, **prima
   de riesgo** y **tasa ISN** (estas dos por Registro Patronal). Se arrastran del
   Nomina Cliente previo (estables semana a semana).

Los 4 totales (TOTAL PERCEPCIONES, TOTAL DEDUCCIONES, NETO, TOTAL PREVISIÓN) se
escriben como **fórmulas** `=SUM(...)`, igual que el Excel original.

## Fórmulas clave (ingeniería inversa validada contra SEM 26)

- **Días trabajados** = 7 − faltas − incapacidades − vacaciones.
- **Días cotizados IMSS** = 7 (faltas/vacaciones cotizan; solo alta a mitad de semana prorratea).
- **Sueldo** = SD × días trabajados.
- **Prima dominical** = domingos × SD × 0.25 · **Día festivo/descanso** = días × SD × 2.
- **ISR:** proyección mensual (base semanal × 30.4/7 → tarifa mensual 2026 − subsidio →
  ×7/30.4). **Base gravable** = Sueldo + Vacaciones + Comisiones + incentivos +
  prima dominical gravable = **SD×(7−faltas−incap) + comisiones + incentivos**.
- **Subsidio al empleo** = **$555.91/mes** (15.59% UMA) si ingreso ≤ $11,492.66/mes.
- **IMSS obrero** = 1.25%·SBC·días + 0.40%·excedente(3 UMA) · **RCV obrero** = 1.125%·SBC·días.
- **IMSS patronal** = cuota fija (20.40% UMA) + excedente 1.10% + dinero 0.70% + GMP 1.05%
  + IV 1.75% + guardería 1.00% + **prima RT (por Registro Patronal, 0.50%–0.64%)**, todo ×SBC·días.
- **RCV patronal** = (2% retiro + cesantía por tramo UMA: 3.150%…7.513%)·SBC·días.
- **Infonavit empresa** = 5%·SBC·días · **ISN** = tasa_estado(Registro Patronal)·TOTAL PERCEPCIONES.
- **UMA 2026** = 117.31.

## Precisión (validación motor vs Nomina Cliente SEM 26 real, 3131 empleados)

- **98.0% de las celdas numéricas exactas al centavo; 99.6% dentro de $1.**
- NETO total: diferencia de **−0.21%** vs el archivo real.
- Columnas 100%/≈100%: todas las directas + Infonavit, ISN, prima dominical, día festivo…
- ~96–97%: IMSS obrero/patronal, RCV, subsidio (casos de incapacidad / prorrateo).

## Limitaciones conocidas (el motor las EXPONE, no las inventa)

1. **ISR de finiquitos / percepciones especiales** (aguinaldo, indemnización, bono,
   gratificación en la semana): la base gravable queda incompleta → ISR desviado.
   Afecta ~2–3% de empleados (los mismos con TOTAL PERCEPCIONES <100%).
2. **SBC y préstamos** se arrastran del Nomina Cliente previo. Si PRIME actualiza el
   SBC (bimestral IMSS) entre semanas, puede haber pequeñas diferencias. Empleados
   nuevos que no estén en la referencia salen **sin SBC** (estatutarias en 0) y se
   deben marcar. En SEM 24: 3.0% sin cobertura.
3. **Subsidio 15.59%** (no 15.02%): así lo aplica el sistema de PRIME todo el año.

## Dependencia a resolver con PRIME / operación

El SBC y los préstamos/pensión por empleado no vienen en INCIDENCIAS. Hoy se arrastran
del Nomina Cliente de la semana anterior. Para operar semana a semana conviene definir
la fuente autoritativa del SBC (IMSS/SUA o el maestro que mantiene el equipo).
