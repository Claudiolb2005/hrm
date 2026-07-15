#!/usr/bin/env python3
"""Genera las secciones V, VI, IX, X desde el motor y valida vs el informe PDF."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.acumulado import parse_acumulado
from motor.maestro import parse_resumen, parse_bases
from motor import secciones as S
from motor.normaliza import centavos_a_mxn as mxn

DATA = "/Users/claudioleon/.openclaw/workspace/hrm/data"


def val_line(label, got, exp, tol=200):
    d = got - exp
    flag = "OK ✓" if d == 0 else ("~cent" if abs(d) <= tol else "DIF")
    return f"  {label:<22}{mxn(got):>18} | informe {mxn(exp):>18} | dif {mxn(d):>12}  {flag}"


def main():
    acum = parse_acumulado(f"{DATA}/acumulado_enero2026.xlsx")
    resumen = parse_resumen(f"{DATA}/maestro_enero2026.xlsx")
    bases = parse_bases(f"{DATA}/maestro_enero2026.xlsx")

    # ---- V por puesto ----
    v = S.seccion_v_por_puesto(acum.por_puesto)
    print("=" * 80); print("SECCIÓN V — TOTALES POR PUESTO (neto conciliación)"); print("=" * 80)
    print("  SEMANAL (top 8):")
    for f in v["semanal"][:8]:
        print(f"    {f['puesto'][:34]:<34} {mxn(f['monto']):>18}")
    print(f"    {'TOTAL SEMANAL':<34} {mxn(v['total_semanal']):>18}   (informe 94,308,746.00)")
    print("  CATORCENAL (top 8):")
    for f in v["catorcenal"][:8]:
        print(f"    {f['puesto'][:34]:<34} {mxn(f['monto']):>18}")
    print(f"    {'TOTAL CATORCENAL':<34} {mxn(v['total_catorcenal']):>18}   (informe 7,285,501.00)")

    # ---- VI por estado ----
    vi = S.seccion_vi_por_estado(acum.por_rp, bases)
    print("\n" + "=" * 80); print("SECCIÓN VI — TOTALES POR ESTADO"); print("=" * 80)
    for f in vi["filas"][:10]:
        print(f"  {f['estado'][:30]:<30} {mxn(f['monto']):>18}  {f['pct']:>6.2f}%")
    print(f"  ... {len(vi['filas'])} estados en total")
    print(val_line("TOTAL por estado", vi["total"], 10159424690, tol=300000))
    if vi["rp_sin_mapeo"]:
        print(f"  ⚠ RP sin mapeo a estado: {vi['rp_sin_mapeo']}")

    # ---- IX IMSS/RCV por RP ----
    ix = S.seccion_ix_imss_rcv_rp(acum.por_rp, bases)
    print("\n" + "=" * 80); print("SECCIÓN IX — IMSS/RCV POR REGISTRO PATRONAL"); print("=" * 80)
    for f in ix["filas"][:6]:
        print(f"  {f['rp']:<13} {f['entidad'][:20]:<20} emp={f['empleados']:>4} "
              f"IMSS={mxn(f['imss']):>15} RCV={mxn(f['rcv']):>15}")
    print(f"  ... {len(ix['filas'])} registros patronales")
    print(f"  total colaboradores: {ix['total_empleados']}   (informe 3,695)")
    print(f"  total IMSS (obrero+patronal): {mxn(ix['total_imss'])}")
    print(f"  total RCV  (obrero+patronal): {mxn(ix['total_rcv'])}")

    # ---- X ISN ----
    x = S.seccion_x_isn(resumen, bases)
    print("\n" + "=" * 80); print("SECCIÓN X — ISN POR ESTADO"); print("=" * 80)
    for f in x["filas"][:6]:
        print(f"  {f['rp']:<13} {f['entidad'][:16]:<16} base={mxn(f['base_isn']):>16} "
              f"tasa={f['tasa']*100:>5.2f}% imp={mxn(f['impuesto']):>14} {'ok' if f['cuadra'] else 'DESCUADRA'}")
    print(f"  ... {len(x['filas'])} estados")
    print(val_line("TOTAL base ISN", x["total_base"], 13876206802, tol=500000))
    print(val_line("ISN (tasa RESUMEN)", x["total_impuesto"], 455809494, tol=200))
    print(val_line("ISN (tasa BASES auth)", x["total_impuesto_bases"], 455809494, tol=200))
    if x["discrepancias_tasa"]:
        print(f"  ⚠ HALLAZGO: {len(x['discrepancias_tasa'])} estados con tasa RESUMEN ≠ tasa BASES (autoritativa):")
        for d in x["discrepancias_tasa"]:
            print(f"     {d['entidad'][:20]:<20} RESUMEN {d['tasa_resumen']*100:.2f}% → BASES {d['tasa_bases']*100:.2f}%"
                  f"  (imp {mxn(d['imp_resumen'])} → {mxn(d['imp_bases'])})")


if __name__ == "__main__":
    main()
