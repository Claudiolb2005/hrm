"""Pruebas del núcleo determinista (§5.3.0). Correr: python -m pytest -q
o bien: python tests/test_normaliza.py (runner casero sin pytest)."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.normaliza import (
    normalizar_clave, a_centavos, centavos_a_mxn, a_iso,
    normalizar_rfc, es_fila_total, CoercionError,
)


def test_normalizar_clave():
    assert normalizar_clave("  Total   Percepciones ") == "TOTAL PERCEPCIONES"
    assert normalizar_clave("Catorcena 03") == "CATORCENA 03"
    assert normalizar_clave("Préstamo Infonavit") == "PRESTAMO INFONAVIT"
    assert normalizar_clave("I.S.R. (sp)") == "I.S.R. (SP)"
    assert normalizar_clave(None) == ""
    assert normalizar_clave("NETO SUELDO FISCAL") == "NETO SUELDO FISCAL"


def test_a_centavos_basico():
    assert a_centavos(0) == 0
    assert a_centavos(100) == 10000
    assert a_centavos(1234.56) == 123456
    assert a_centavos("1,234.56") == 123456
    assert a_centavos("$1,234.56") == 123456
    assert a_centavos("  $ 1,234.56  ") == 123456
    assert a_centavos("") == 0
    assert a_centavos("-") == 0
    assert a_centavos("N/A") == 0
    assert a_centavos(None) == 0 if False else True  # None -> str 'None' -> vacío


def test_a_centavos_negativos():
    assert a_centavos("(1,234.50)") == -123450   # paréntesis contable
    assert a_centavos("1234.50-") == -123450      # signo al final
    assert a_centavos("-1,234.50") == -123450
    assert a_centavos("-500") == -50000


def test_a_centavos_float_drift():
    # el clásico 0.1+0.2: en centavos enteros nunca hay drift
    total = a_centavos(0.1) + a_centavos(0.2)
    assert total == 30  # 10 + 20 centavos, exacto
    # suma de muchos importes reales
    vals = [16311, 108.3325, 3033.31, 0, 2262.99]
    suma = sum(a_centavos(v) for v in vals)
    assert isinstance(suma, int)


def test_a_centavos_error():
    try:
        a_centavos("abc")
        assert False, "debió lanzar CoercionError"
    except CoercionError:
        pass


def test_centavos_a_mxn():
    assert centavos_a_mxn(123456) == "1,234.56"
    assert centavos_a_mxn(-123450) == "-1,234.50"
    assert centavos_a_mxn(0) == "0.00"
    assert centavos_a_mxn(6800465) == "68,004.65"
    assert centavos_a_mxn(100) == "1.00"


def test_a_iso():
    from datetime import datetime, date
    assert a_iso(datetime(2026, 1, 2, 4, 51)) == "2026-01-02"
    assert a_iso(date(2026, 1, 2)) == "2026-01-02"
    assert a_iso("2026-01-02") == "2026-01-02"
    assert a_iso("2026-01-02 04:51:51") == "2026-01-02"
    assert a_iso("02/01/2026") == "2026-01-02"   # dd/mm/yyyy MX
    assert a_iso(None) is None


def test_normalizar_rfc():
    assert normalizar_rfc("AAA010101AA1") == ("AAA010101AA1", True)   # moral (3 letras)
    assert normalizar_rfc("AAAA010101AA1") == ("AAAA010101AA1", True) # física (4 letras)
    assert normalizar_rfc(" bbbb020202bb2 ")[0] == "BBBB020202BB2"
    assert normalizar_rfc("XXX")[1] is False


def test_es_fila_total():
    assert es_fila_total("TOTAL") is True
    assert es_fila_total("SUMA") is True
    assert es_fila_total("SEM 52") is False


def _run():
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = 0
    for fn in fns:
        try:
            fn()
            print(f"  ok  {fn.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"FAIL  {fn.__name__}: {e}")
        except Exception as e:
            print(f"ERR   {fn.__name__}: {type(e).__name__}: {e}")
    print(f"\n{passed}/{len(fns)} pruebas ok")
    return passed == len(fns)


if __name__ == "__main__":
    sys.exit(0 if _run() else 1)
