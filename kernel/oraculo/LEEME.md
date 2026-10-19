# Oráculo independiente de nómina 2026

`oraculo.py` recalcula las reglas del kernel (ISR, subsidio, IMSS, RCV, INFONAVIT y exenciones del art. 93 LISR) para hacer **pruebas diferenciales** contra el kernel JS. Si los dos difieren en un caso, al menos uno tiene un error.

## Regla de independencia

El oráculo se escribió **desde la ley (LISR art. 93 y 96, LSS arts. 25, 71–74, 106, 107, 147 y 168, LINFONAVIT art. 29) y desde la especificación del despacho**. Para escribirlo no se leyó ningún archivo de `kernel/src/` ni de `kernel/test/`.
La única dependencia es `kernel/data/parametros-2026.json`, el catálogo de parámetros (UMA, tarifas, cuotas).
Si alguien modifica el oráculo, debe mantener esta regla. Copiar la lógica del kernel anula el valor de la prueba.

- Python 3, sólo biblioteca estándar.
- `decimal.Decimal` con precisión 50 y `ROUND_HALF_UP`.
- La aritmética es exacta y se redondea a centavo una sola vez, al final. IMSS y RCV redondean una vez por rama.

## Uso

```sh
python3 kernel/oraculo/oraculo.py < casos.json > resultados.json
```

Entrada:
```json
{"casos":[{"id":"c1","regla":"CALC-ISR-SEM-001","entrada":{"base_gravable_c":776068,"fecha_pago":"2026-08-06","periodicidad":"semanal"}}]}
```
Salida: `{"resultados":[{"id":"c1","valor_c":122287,"isr_antes_subsidio_c":122287,"subsidio_c":0}]}`

Todos los importes de entrada y salida están en **centavos enteros**. Si un caso falla, su resultado lleva `valor_c: null` y un campo `error`, y los demás casos se calculan igual.
La variable de entorno `ORACULO_PARAMS` permite usar otro archivo de parámetros.

## Reglas soportadas

| Regla | Valor `valor_c` | Extras |
|---|---|---|
| CALC-SUB-001 | subsidio del periodo | `aplica` |
| CALC-ISR-SEM-001 | ISR retenido (diaria/semanal/decenal/quincenal/mensual) | `isr_antes_subsidio_c`, `subsidio_c` |
| CALC-ISR-CAT-001 | ISR retenido catorcenal (criterio C1: tarifa diaria × 14) | ídem |
| CALC-ISR-EXT-001 | ISR de pago extra, sin subsidio | `isr_antes_subsidio_c` |
| CALC-ISR-AJM-001 | diferencia del ajuste mensual (puede ser negativa) o `null` si no aplica | `isr_mes_c`, `isr_antes_subsidio_c`, `subsidio_c` |
| CALC-IMSS-001 | cuota obrera | `patronal_c`, `ramas_c` |
| CALC-RCV-001 | retiro + CEAV patronal | `retiro_c`, `ceav_pat_c`, `ceav_obr_c` |
| CALC-INF-001 | aportación INFONAVIT 5% | — |
| CALC-EXE-001 | base gravable | `exento_total_c`, `base_para_tope_subsidio_c`, `detalle`, `consumido_c` |

## Casos de referencia (verificados)

ISR semanal 776068 → 122287 · subsidio semanal 220668 → 12334 · ISR semanal 220668 → 15744 / 3410 ·
catorcenal 1440600 → 220747 · extra 1969534 → 446624 · ajuste mensual → 205841 ·
IMSS sbc 61588 (27-jul a 2-ago, prima 0.50) → obrera 6128, patronal 40341 ·
RCV → retiro 8622, CEAV pat 32390, CEAV obr 4850 · INFONAVIT → 21556 · prima dominical 13579 con 1 domingo → exento 11731.

## Decisiones de interpretación del oráculo

1. Si dos renglones de parámetro están vigentes en la misma fecha, se usa el de `vigencia_desde` más reciente.
2. Si falta `base_para_tope_c` (ISR) o `bases_tope_mes_c` (ajuste mensual), se usa la base gravable.
3. Topes del subsidio: el límite para `subsidio_previo_mes_c` es `round(M)` en centavos. En el ajuste mensual, el subsidio es M/30.4×30.4 = M exacto, y se resta antes de redondear.
4. El SBC del día se topa en `TOPE_SBC_VECES_UMA` × UMA, y el umbral del excedente es `UMBRAL_EXCEDENTE_VECES_UMA` × UMA. Ambos se leen de los parámetros.
5. Incapacidades numéricas: se quitan los últimos n días del periodo. Una lista de fechas fuera del periodo no tiene efecto.
6. Exenciones: el acumulado se lleva por `grupo` de la fila; si la fila no tiene grupo, por el nombre del concepto. El exento nunca supera el monto. El exento de `tope_uma` y `separacion` es min(monto, tope − consumido). El de `pct_hasta_uma` es min(50%·monto, veces·UMA·semanas − consumido), con `semanas_periodo` = 1 por omisión. Si `uma_por_domingo` recibe `domingos`, el exento es min(monto, domingos·UMA).
7. Años de servicio: se cuentan los aniversarios completos. Si el excedente pasa de 6 meses de calendario, cuenta como un año más (exactamente 6 meses no suma). Sin `separacion`, se considera 0 años y todo grava.
8. `base_para_tope_subsidio_c` = base gravable − parte gravada de conceptos de tipo `separacion`.

## Exactitud numérica (19-oct-2026)

`Decimal` no es aritmética racional: `base ÷ 14` o `monto ÷ 30.4` no terminan y se
truncan a 50 dígitos. En la primera corrida diferencial eso hizo que el oráculo
redondeara hacia abajo 9 empates exactos de medio centavo en catorcenal (p. ej.
9,704.145 → 9,704.14) que el kernel, con racionales exactos, redondea bien
(9,704.15). Se reescribieron esas fórmulas sin división intermedia
(`14·cf + (base − 14·li) × %`, `M × días ÷ 30.4`, comparación cruzada del tope).
Es la misma ley; sólo cambia el orden de las operaciones.

## Prueba diferencial

```bash
cd kernel
node oraculo/diferencial.mjs 30000          # casos, semilla opcional
```

Genera casos aleatorios y pegados a las fronteras (renglones de tarifa, tope del
subsidio, 3 y 25 UMA, rangos de CEAV, cambio de UMA el 1-feb), corre kernel y
oráculo y compara al centavo cada importe. Sale con código 1 ante una sola
diferencia. `npm test` corre una muestra de 3,000 casos.

Lo que NO cubre: un parámetro mal capturado (ambos leen el mismo archivo) ni un
criterio mal decidido (ambos siguen la misma especificación). Para eso están el
cotejo contra el DOF y los casos dorados.
