"""Valida los 3 pendientes contra FEB 2026 (papel de trabajo real)."""
from motor.acumulado import parse_acumulado
from motor.contabilidad import parse_resumen_conciliacion
from motor import secciones as S

def m(c): return f"{c/100:,.2f}"
AC = "data/feb2026/acumulado_feb2026.xlsx"
acum = parse_acumulado(AC)
print(f"FEB parseado: hoja {acum.meta['hoja']} | filas {acum.meta['filas_datos']} | control-fila {len([h for h in acum.hallazgos if h.get('tipo')=='control_fila'])}")

print("\n===== SEC XII — Tendencias (roster-diff) vs hoja ALTAS Y BAJAS =====")
xii = S.seccion_xii_tendencias(acum.periodos)
GT = {"SEM 06":(34,51),"SEM 07":(57,39),"SEM 08":(49,50),"CAT 04":(2,3)}  # (altas,bajas) informe
HC = {"SEM 05":3342,"SEM 06":3325,"SEM 07":3343,"SEM 08":3342,"CAT 03":107,"CAT 04":106}
print("PERIODO     headcount  altas  bajas   check")
for f in xii["semanal"] + xii["catorcenal"]:
    p=f["periodo"]; chk=[]
    if p in HC: chk.append("HC "+("OK" if f["headcount"]==HC[p] else f"!= {HC[p]}"))
    if p in GT: chk.append("A/B "+("OK" if (f["altas"],f["bajas"])==GT[p] else f"!= {GT[p]}"))
    print(f"  {p:10} {f['headcount']:>8}  {str(f['altas']):>5}  {str(f['bajas']):>5}   {' '.join(chk)}")

print("\n===== SEC XI — variación por periodo (nómina vs pago), hoja resumen =====")
concil = parse_resumen_conciliacion(AC)
nomina_pp = {p: a.comprobacion_neto for p, a in acum.periodos.items()}
xi = S.seccion_xi_variacion(nomina_pp, concil)
print("PERIODO          nómina(motor)      pago(papel)     variación   acum(papel)  valida_nómina")
for f in xi["filas"]:
    ap = f["acum_papel"]
    chk = "OK" if ap and abs(f["nomina"]-ap) <= 200 else (f"dif {m(f['nomina']-ap)}" if ap else "-")
    print(f"  {f['periodo']:16} {m(f['nomina']):>14} {m(f['pago']):>14} {m(f['variacion']):>13}  {m(ap):>12}  {chk}")
print(f"  TOTAL nómina {m(xi['total_nomina'])} | pago {m(xi['total_pago'])} | variación {m(xi['total_variacion'])}")
