"""Valida Sec XI (Provisión/dispersión) contra Abril."""
from motor.acumulado import parse_acumulado
from motor.contabilidad import parse_contabilidad
from motor.secciones import seccion_xi_provision

def m(c): return f"{c/100:,.2f}"

acum = parse_acumulado("data/abril2026/acumulado_abril2026.xlsx")
contab = parse_contabilidad("data/abril2026/contabilidad_abril2026.xlsx")

print("CONTAB meta:", contab.meta)
print(f"\nDispersado (Σ créditos banco nómina): {m(contab.dispersado)}")
print(f"Fondeo/traspaso (mismo dinero, aislado): {m(contab.fondeo_traspaso)}")
print("Composición de la dispersión:")
for k, v in sorted(contab.por_clase.items(), key=lambda x: -x[1]):
    print(f"   {k:14} {m(v):>16}")
print(f"\nPASIVO GLOBAL NOMINA  débito(liquidado) {m(contab.pasivo_debito)}  crédito(provisión) {m(contab.pasivo_credito)}")

sx = seccion_xi_provision(acum.total.neto, contab)
print("\n===== SECCIÓN XI =====")
print(f"  Nómina neto fiscal : {m(sx['nomina_neto_fiscal'])}")
print(f"  Dispersado (contab): {m(sx['dispersado'])}")
print(f"  Diferencia         : {m(sx['diferencia'])}  (cuadra≤$5: {sx['cuadra']})")
nf = acum.total.neto
print(f"\n  Contexto: neto_concil {m(acum.total.comprobacion_neto)} | despensa informativa {m(acum.total.despensa_informativo)}")
# finiquitos en nómina vs dispersados
fin_nom = sum(a.neto for p,a in acum.periodos.items() if 'FINIQUITO' in p or 'LIQUIDA' in p)
print(f"  Finiquitos en nómina (neto): {m(fin_nom)} | finiquitos dispersados: {m(contab.por_clase.get('finiquito',0))}")
