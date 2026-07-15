#!/usr/bin/env python3
"""Runner: parsea el ACUMULADO real y muestra el Concentrado por periodo (Sec IV),
totales del mes (para I/VII/VIII) y hallazgos de control de fila."""
import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.acumulado import parse_acumulado
from motor.normaliza import centavos_a_mxn as mxn

DEFAULT = "/Users/claudioleon/.openclaw/workspace/hrm/data/acumulado_enero2026.xlsx"

# Cifras ancla del INFORME PDF de Enero 2026 (objetivo a reproducir), en centavos.
ANCLAS_PDF = {
    "percepciones":       14028912385,
    "deducciones":         3869487695,
    "comprobacion_neto":  10159424690,   # "Neto" de conciliación (perc - ded)
    "neto_fiscal":         9892387916,   # NETO SUELDO FISCAL (Sec IV)
    "isr":                 2457280197,
    "imss_patronal":       1102759059,
    "rcv_patronal":        1185752843,
    "infonavit_patronal":   690895630,
}


def _cmp(label, got, exp):
    d = got - exp
    flag = "OK ✓" if d == 0 else ("~cent" if abs(d) <= 200 else "DIF")
    return (f"  {label:<24}{mxn(got):>18}{mxn(exp):>18}"
            f"{mxn(d):>14}   {flag}")


def orden_periodo(p):
    """Ordena SEM 01, SEM 02, ..., CAT 01, ..., y especiales al final."""
    m = re.match(r"^(SEM|CAT)\s*0*(\d+)", p)
    if m:
        grupo = 0 if m.group(1) == "SEM" else 1
        return (grupo, int(m.group(2)), p)
    return (2, 0, p)  # especiales (BONO, FINIQUITOS, ...) al final, alfabético


def main(path):
    res = parse_acumulado(path)
    m = res.meta
    print("=" * 78)
    print(f"ACUMULADO  ·  {os.path.basename(path)}")
    print("=" * 78)
    print(f"hoja={m['hoja']}  encabezado=fila {m['fila_encabezado']}  "
          f"columnas={m['columnas_detectadas']}")
    print(f"filas de datos={m['filas_datos']}  omitidas={m['filas_omitidas']}  "
          f"empleados únicos (RFC) del mes={m['empleados_unicos_mes']}")
    print(f"familias mapeadas: ISR={m['familias']['isr']} cols · "
          f"INFONAVIT={m['familias']['infonavit']} cols · "
          f"FONACOT={m['familias']['fonacot']} cols")

    print("\n" + "-" * 78)
    print("SECCIÓN IV — CONCENTRADO POR PERIODO (percepciones / deducciones / neto)")
    print("-" * 78)
    print(f"{'PERIODO':<16}{'EMP':>6}{'PERCEPCIONES':>18}{'DEDUCCIONES':>18}{'NETO':>18}")
    for p in sorted(res.periodos, key=orden_periodo):
        a = res.periodos[p]
        print(f"{p:<16}{a.empleados:>6}{mxn(a.percepciones):>18}"
              f"{mxn(a.deducciones):>18}{mxn(a.neto):>18}")
    t = res.total
    print("-" * 78)
    print(f"{'TOTAL MES':<16}{t.empleados:>6}{mxn(t.percepciones):>18}"
          f"{mxn(t.deducciones):>18}{mxn(t.neto):>18}")
    print(f"{'  (despensa infor.)':<16}{'':>6}{'':>18}{'':>18}{mxn(t.despensa_informativo):>18}")
    print(f"{'  Neto concil.':<16}{'':>6}{'(perc - ded)':>18}{'':>18}{mxn(t.comprobacion_neto):>18}")

    print("\n" + "-" * 78)
    print("IMPUESTOS Y CUOTAS DEL MES (base secciones VII / VIII / IX)")
    print("-" * 78)
    print(f"  ISR (familia, {m['familias']['isr']} cols).......... {mxn(t.isr):>18}")
    print(f"  IMSS obrero......................... {mxn(t.imss_obrero):>18}")
    print(f"  RCV obrero.......................... {mxn(t.rcv_obrero):>18}")
    print(f"  Infonavit (familia, {m['familias']['infonavit']} cols)..... {mxn(t.infonavit):>18}")
    print(f"  Fonacot (familia, {m['familias']['fonacot']} cols)....... {mxn(t.fonacot):>18}")
    print("  --- patronales (Sec VIII) ---")
    print(f"  IMSS patronal....................... {mxn(t.imss_patronal):>18}")
    print(f"  RCV patronal........................ {mxn(t.rcv_patronal):>18}")
    print(f"  Infonavit empresa................... {mxn(t.infonavit_patronal):>18}")
    print(f"  ISN (informativo en acumulado)...... {mxn(t.isn_informativo):>18}")
    print(f"  Previsión social.................... {mxn(t.prevision_social):>18}")

    print("\n" + "-" * 78)
    print(f"HALLAZGOS (control de fila perc - ded = neto): {len(res.hallazgos)}")
    print("-" * 78)
    ctrl = [h for h in res.hallazgos if h.get("tipo") == "control_fila"]
    coerc = [h for h in res.hallazgos if h.get("tipo") == "coercion"]
    print(f"  descuadres de fila: {len(ctrl)}  ·  errores de coerción: {len(coerc)}")
    for h in ctrl[:8]:
        print(f"   - fila {h['fila']} [{h['periodo']}] RFC {h['rfc']}: "
              f"descuadre {mxn(h['descuadre'])} "
              f"(perc {mxn(h['perc'])} - desp {mxn(h.get('desp',0))} - ded {mxn(h['ded'])} != neto {mxn(h['neto'])})")
    if len(ctrl) > 8:
        print(f"   ... y {len(ctrl) - 8} más")

    print("\n" + "=" * 78)
    print("VALIDACIÓN CONTRA INFORME PDF ENERO 2026 (cifras ancla)")
    print("=" * 78)
    print(f"  {'concepto':<24}{'MOTOR':>18}{'INFORME PDF':>18}{'DIF':>14}")
    print(_cmp("Percepciones",       t.percepciones,       ANCLAS_PDF["percepciones"]))
    print(_cmp("Deducciones",        t.deducciones,        ANCLAS_PDF["deducciones"]))
    print(_cmp("Neto conciliación",  t.comprobacion_neto,  ANCLAS_PDF["comprobacion_neto"]))
    print(_cmp("Neto sueldo fiscal", t.neto,               ANCLAS_PDF["neto_fiscal"]))
    print(_cmp("ISR (familia)",      t.isr,                ANCLAS_PDF["isr"]))
    print(_cmp("IMSS patronal",      t.imss_patronal,      ANCLAS_PDF["imss_patronal"]))
    print(_cmp("RCV patronal",       t.rcv_patronal,       ANCLAS_PDF["rcv_patronal"]))
    print(_cmp("Infonavit empresa",  t.infonavit_patronal, ANCLAS_PDF["infonavit_patronal"]))
    print("\n  Leyenda: OK ✓ = exacto al centavo · ~cent = ≤$2 (redondeo) · DIF = revisar")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else DEFAULT)
