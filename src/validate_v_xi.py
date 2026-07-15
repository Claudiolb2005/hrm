"""Valida Sec V (catálogo puesto) y Sec XI fino (provisión por periodo)."""
from motor.acumulado import parse_acumulado
from motor.contabilidad import parse_contabilidad, parse_provision_periodos
from motor import secciones as S

def m(c): return f"{c/100:,.2f}"
AC = "data/abril2026/acumulado_abril2026.xlsx"

acum = parse_acumulado(AC)
v = S.seccion_v_por_puesto(acum.por_puesto)
print("===== SEC V — Totales por puesto =====")
print("Nómina Semanal:")
for f in v["semanal"]:
    print(f"   {m(f['monto']):>14}  {f['puesto']}")
print(f"   {'TOTAL':>14}  {m(v['total_semanal'])}")
otros_sem = next((f['monto'] for f in v['semanal'] if f['puesto']=='OTROS'), 0)
print(f"   OTROS = {100*otros_sem/max(v['total_semanal'],1):.1f}% del semanal")
print("Nómina Catorcenal:")
for f in v["catorcenal"]:
    print(f"   {m(f['monto']):>14}  {f['puesto']}")
print(f"   {'TOTAL':>14}  {m(v['total_catorcenal'])}")
otros_cat = next((f['monto'] for f in v['catorcenal'] if f['puesto']=='OTROS'), 0)
print(f"   OTROS = {100*otros_cat/max(v['total_catorcenal'],1):.1f}% del catorcenal")

print("\n===== SEC XI fino — Provisión por periodo (Hoja1) =====")
prov = parse_provision_periodos(AC)
contab = parse_contabilidad("data/abril2026/contabilidad_abril2026.xlsx")
xi = S.seccion_xi_provision(acum.total.neto, contab, prov_periodos=prov)
print("PERIODO           PROVISIÓN")
for r in xi["por_periodo"]:
    print(f"  {r['periodo']:16} {m(r['provision']):>16}")
print(f"  {'ACUMULADO':16} {m(xi['prov_acumulado']):>16}")
print(f"  {'PAGO':16} {m(xi['prov_pago']):>16}")
print(f"  {'DIF':16} {m(xi['prov_dif']):>16}")
print("Especiales (PAGO):")
for e in xi["especiales"]:
    print(f"  {e['concepto']:26} {m(e['pago']):>16}")

print("\n--- Validación vs informe MARZO 2026 (Hoja1 = ciclo marzo) ---")
gt = {"SEMANA 09":1627547901,"SEMANA 10":1707843437,"SEMANA 11":1529100516,
      "SEMANA 12":1842730007,"CATORCENA 05":332140140,"CATORCENA 06":286120691}
okp = all(any(r['periodo']==k and r['provision']==val for r in xi["por_periodo"]) for k,val in gt.items())
print(f"  periodos provisión coinciden con informe: {okp}")
print(f"  DIF (redondeos) = {m(xi['prov_dif'])}  (informe: -5.63)")
print(f"  BONOS CAT = {m(dict(xi['especiales']==xi['especiales'] and {e['concepto']:e['pago'] for e in xi['especiales']}).get('BONOS CAT',0))}  (informe: 778,926.10)")
