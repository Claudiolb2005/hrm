"""Regresión del parser ACUMULADO contra el caso real Enero 2026.

Bloquea (CI): control de fila limpio y patronales exactos al centavo vs el
INFORME PDF. Los conceptos con dependencia de finiquitos se validan con
tolerancia documentada (edge case pendiente: parser de finiquitos/CFDI).
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.acumulado import parse_acumulado

ACUM = "/Users/claudioleon/.openclaw/workspace/hrm/data/acumulado_enero2026.xlsx"

# Cifras ancla del INFORME PDF Enero 2026 (centavos)
EXACTAS = {              # deben cuadrar AL CENTAVO
    "imss_patronal":      1102759059,
    "rcv_patronal":       1185752843,
    "infonavit_patronal":  690895630,
}
APROX = {               # dependen del edge case finiquitos (tol documentada)
    "percepciones":     (14028912385, 2200_00),
    "deducciones":       (3869487695,  200_00),
    "neto":              (9892387916, 2000_00),
    "isr":               (2457280197,  100_00),
}


def _res():
    return parse_acumulado(ACUM)


def test_estructura():
    r = _res()
    assert r.meta["hoja"] == "Hoja1"
    assert r.meta["fila_encabezado"] == 0
    assert r.meta["filas_datos"] == 17053
    assert r.meta["familias"] == {"isr": 5, "infonavit": 3, "fonacot": 7}


def test_control_fila_limpio():
    r = _res()
    ctrl = [h for h in r.hallazgos if h.get("tipo") == "control_fila"]
    assert len(ctrl) == 0, f"esperaba 0 descuadres, hay {len(ctrl)}"


def test_patronales_exactas_al_centavo():
    r = _res()
    for campo, esperado in EXACTAS.items():
        got = getattr(r.total, campo)
        assert got == esperado, f"{campo}: motor {got} != PDF {esperado} (dif {got-esperado})"


def test_periodos_completos():
    r = _res()
    esperados = {"SEM 01", "SEM 02", "SEM 03", "SEM 04", "SEM 52", "CAT 01",
                 "CAT 02", "BONOS CAT", "BONOS SEM", "FINIQUITOS",
                 "FINIQUITOS CAT", "GRATIFICACION"}
    assert set(r.periodos) == esperados, f"periodos: {set(r.periodos) ^ esperados}"


def test_aproximadas_dentro_de_tolerancia():
    r = _res()
    for campo, (esperado, tol) in APROX.items():
        got = getattr(r.total, campo)
        assert abs(got - esperado) <= tol, \
            f"{campo}: motor {got} vs PDF {esperado}, dif {got-esperado} > tol {tol}"


def _run():
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
    sys.exit(0 if _run() else 1)
