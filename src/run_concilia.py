#!/usr/bin/env python3
"""Runner de conciliación R1/R6: ACUMULADO vs CFDI (Enero 2026).
Aplica la regla v6 de neto CFDI (perc + otros - ded) y valida contra el informe."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.acumulado import parse_acumulado
from motor.cfdi import parse_cfdi
from motor.concilia import conciliar_r1, conciliar_r6
from motor.normaliza import centavos_a_mxn as mxn

DATA = "/Users/claudioleon/.openclaw/workspace/hrm/data"
CFDI_INFORME = 10159424520   # objetivo informe: Total CFDI del mes (centavos)


def main():
    print("Parseando ACUMULADO..."); acum = parse_acumulado(f"{DATA}/acumulado_enero2026.xlsx")
    print("Parseando CFDI (fecha pago = 2026-01)...")
    cfdi = parse_cfdi(f"{DATA}/cfdi_enero2026.xlsx", mes_pago="2026-01")
    m = cfdi.meta
    print("\n" + "=" * 78)
    print("CFDI — resumen de parseo (regla v6: neto = percep + otros pagos − deduc)")
    print("=" * 78)
    print(f"  filas en archivo: {m['filas_totales']}  ·  fuera de enero (fecha pago): {m['fuera_de_mes']}")
    print(f"  CFDIs contados (enero): {m['cfdis_contados']}  ·  duplicados excluidos: {m['duplicados_excluidos']}"
          f"  ·  cancelados: {m['cancelados_excluidos']}")
    print(f"  RFCs únicos con CFDI: {m['rfcs_unicos']}")
    t = cfdi.total
    print(f"\n  Σ percepciones CFDI: {mxn(t.percepciones):>18}")
    print(f"  Σ otros pagos CFDI:  {mxn(t.otros_pagos):>18}")
    print(f"  Σ deducciones CFDI:  {mxn(t.deducciones):>18}")
    print(f"  = NETO CFDI (perc+otros−ded): {mxn(t.neto):>18}")
    d = t.neto - CFDI_INFORME
    flag = "OK ✓" if d == 0 else ("~" if abs(d) <= 500000 else "DIF")
    print(f"  objetivo informe CFDI:        {mxn(CFDI_INFORME):>18}   dif {mxn(d)}  {flag}")

    print("\n" + "=" * 78)
    print("R1 — CONCILIACIÓN NÓMINA vs CFDI (neto por empleado, tol $0.50)")
    print("=" * 78)
    r1 = conciliar_r1(acum.por_rfc, cfdi.por_rfc)
    print(f"  Neto conciliación ACUMULADO (Σ perc−ded): {mxn(r1.acum_total):>18}")
    print(f"  Neto CFDI (Σ perc+otros−ded):             {mxn(r1.cfdi_total):>18}")
    print(f"  DIFERENCIA R1:                            {mxn(r1.diferencia):>18}"
          f"   {'DENTRO tol suma' if r1.dentro_tol_suma else 'FUERA tol ($5)'}")
    print(f"  empleados conciliados (±$0.50): {r1.empleados_ok}  ·  con diferencia: {r1.empleados_dif}")
    if r1.top_difs:
        print("  top diferencias por empleado (RFC · acumulado · cfdi · dif):")
        for rfc, a, c, dd in r1.top_difs[:10]:
            print(f"    {rfc:<15} {mxn(a):>15} {mxn(c):>15}  dif {mxn(dd)}")

    print("\n" + "=" * 78)
    print("R6 — COBERTURA (RFCs acumulado vs CFDI)")
    print("=" * 78)
    r6 = conciliar_r6(acum.por_rfc, cfdi.por_rfc)
    print(f"  en ambos: {r6.en_ambos}  ·  solo nómina (sin CFDI): {len(r6.solo_acumulado)}"
          f"  ·  solo CFDI (sin nómina): {len(r6.solo_cfdi)}")
    if r6.solo_acumulado:
        print(f"    ej. sin CFDI: {', '.join(r6.solo_acumulado[:6])}")
    if r6.solo_cfdi:
        print(f"    ej. sin nómina: {', '.join(r6.solo_cfdi[:6])}")


if __name__ == "__main__":
    main()
