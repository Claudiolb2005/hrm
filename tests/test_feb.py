"""Regresión FEBRERO 2026 — papel de trabajo real (tercer mes de validación).

Bloquea los 3 desbloqueos hechos con el barrido de Drive:
- Sec XII (tendencias) por ROSTER-DIFF reproduce la hoja ALTAS Y BAJAS.
- Sec XI variación por periodo (nómina vs pago) desde la hoja 'resumen'.
- La nómina del motor por periodo cuadra con el papel de trabajo (validación 3er mes).
- ACUM DE NOM con llave de periodo 'NO. PERIODO' (tercera variante).
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.acumulado import parse_acumulado
from motor.contabilidad import parse_resumen_conciliacion
from motor import secciones as S

FEB = "/Users/claudioleon/.openclaw/workspace/hrm/data/feb2026/acumulado_feb2026.xlsx"


def test_feb_parsea_no_periodo():
    r = parse_acumulado(FEB)
    assert r.meta["hoja"] == "ACUM DE NOM"          # elige el acumulado, no CFDI ULTIMO
    assert len([h for h in r.hallazgos if h.get("tipo") == "control_fila"]) == 0
    # headcount por roster = TOTAL EMPLEADOS de la hoja ALTAS Y BAJAS
    hc = {p: len(a.rfcs) for p, a in r.periodos.items()}
    assert hc["SEM 05"] == 3342 and hc["SEM 08"] == 3342 and hc["CAT 04"] == 106


def test_secxii_altas_bajas_roster_diff():
    r = parse_acumulado(FEB)
    xii = S.seccion_xii_tendencias(r.periodos)
    porp = {f["periodo"]: f for f in xii["semanal"] + xii["catorcenal"]}
    # (altas, bajas) exactas vs hoja ALTAS Y BAJAS (transiciones internas de febrero)
    assert (porp["SEM 06"]["altas"], porp["SEM 06"]["bajas"]) == (34, 51)
    assert (porp["SEM 07"]["altas"], porp["SEM 07"]["bajas"]) == (57, 39)
    assert (porp["SEM 08"]["altas"], porp["SEM 08"]["bajas"]) == (49, 50)
    assert (porp["CAT 04"]["altas"], porp["CAT 04"]["bajas"]) == (2, 3)
    # SEM 05 y CAT 03 son base (sin mes anterior en el archivo) -> sin altas/bajas
    assert porp["SEM 05"]["altas"] is None


def test_secxi_variacion_por_periodo():
    r = parse_acumulado(FEB)
    concil = parse_resumen_conciliacion(FEB)
    assert concil, "no se parseó la hoja resumen"
    nomina_pp = {p: a.comprobacion_neto for p, a in r.periodos.items()}
    xi = S.seccion_xi_variacion(nomina_pp, concil)
    porp = {f["periodo"]: f for f in xi["filas"]}
    # la nómina del motor cuadra con el ACUMULADO del papel (~$1) -> valida 3er mes
    for p in ("SEM 05", "SEM 06", "SEM 08", "CAT 03"):
        assert abs(porp[p]["nomina"] - porp[p]["acum_papel"]) <= 200, p
    # SEM 07 y CAT 04: la variación grande es DESPENSA (no se dispersa en efectivo)
    assert porp["SEM 07"]["variacion"] > 200_000_000    # > $2M
    assert porp["CAT 04"]["variacion"] > 20_000_000     # > $200k
    # periodos totalmente dispersados: variación ~ 0
    assert abs(porp["SEM 05"]["variacion"]) <= 200


def _main():
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    ok = 0
    for fn in fns:
        try:
            fn(); print(f"  ok  {fn.__name__}"); ok += 1
        except AssertionError as e:
            print(f"FAIL  {fn.__name__}: {e}")
        except Exception as e:
            print(f"ERR   {fn.__name__}: {type(e).__name__}: {e}")
    print(f"\n{ok}/{len(fns)} pruebas ok")
    return ok == len(fns)


if __name__ == "__main__":
    sys.exit(0 if _main() else 1)
