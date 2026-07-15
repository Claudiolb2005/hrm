"""Regresión de secciones V/VI/IX/X — Enero 2026 real.

Bloquea: VI reproduce el informe por estado (dentro del gap de finiquitos),
X base ISN exacta al centavo, X impuesto calculado desde la fuente (RESUMEN/BASES).
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.acumulado import parse_acumulado
from motor.maestro import parse_resumen, parse_bases
from motor import secciones as S

DATA = "/Users/claudioleon/.openclaw/workspace/hrm/data"


def _ctx():
    acum = parse_acumulado(f"{DATA}/acumulado_enero2026.xlsx")
    resumen = parse_resumen(f"{DATA}/maestro_enero2026.xlsx")
    bases = parse_bases(f"{DATA}/maestro_enero2026.xlsx")
    return acum, resumen, bases


def test_vi_por_estado_reproduce_informe():
    acum, _, bases = _ctx()
    vi = S.seccion_vi_por_estado(acum.por_rp, bases)
    assert len(vi["filas"]) == 30, f"estados={len(vi['filas'])}"
    # total == neto de conciliación del acumulado; a $2k del informe (finiquitos)
    assert vi["total"] == acum.total.comprobacion_neto
    assert abs(vi["total"] - 10159424690) < 300000
    assert not vi["rp_sin_mapeo"], f"RP sin mapeo: {vi['rp_sin_mapeo']}"


def test_x_base_isn_exacta_al_centavo():
    _, resumen, bases = _ctx()
    x = S.seccion_x_isn(resumen, bases)
    # base gravable ISN total == informe (138,762,068.02) ± 1 centavo
    assert abs(x["total_base"] - 13876206802) <= 1, f"base={x['total_base']}"
    assert len(x["filas"]) == 30


def test_x_impuesto_desde_fuente():
    _, resumen, bases = _ctx()
    x = S.seccion_x_isn(resumen, bases)
    # el motor calcula desde RESUMEN/BASES (fuente); difiere del informe -> hallazgo
    assert x["total_impuesto"] == 439670039, f"imp={x['total_impuesto']}"
    # RESUMEN y BASES coinciden en tasas -> mismo impuesto
    assert x["total_impuesto_bases"] == x["total_impuesto"]
    # todos los renglones cuadran base*tasa=impuesto dentro del propio RESUMEN
    assert not x["renglones_descuadran"]


def test_v_por_puesto_estructura():
    acum, _, _ = _ctx()
    v = S.seccion_v_por_puesto(acum.por_puesto)
    # EJECUTIVO DE VENTAS (familia por prefijo) domina la nómina semanal
    assert v["semanal"][0]["puesto"] == "EJECUTIVO DE VENTAS"
    assert v["total_semanal"] > 0 and v["total_catorcenal"] > 0


def test_ix_por_rp_estructura():
    acum, _, bases = _ctx()
    ix = S.seccion_ix_imss_rcv_rp(acum.por_rp, bases)
    assert len(ix["filas"]) == 30
    assert ix["total_empleados"] == 3710   # RFCs con RP (informe cuenta 3,695: SUA)


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
