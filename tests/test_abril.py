"""Regresión ABRIL 2026 — el formato REAL del cliente (más completo que enero).

Bloquea las generalizaciones multi-variante (plantillas_mapeo):
- ACUMULADO hoja 'Base Pre nómina', 84 cols, periodo 'NO. PROCESO'; ISR + 'ISR Nómina'.
- ISN tasas 2026 (col 'ISN 2026'); Sec X reproduce el RESUMEN al centavo.
- CFDI 92 cols (columnas por nombre); R1 concilia dentro de tolerancia.
- CONTABILIDAD → Sec XI dispersión (partida doble, traspaso aislado).
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.acumulado import parse_acumulado
from motor.cfdi import parse_cfdi
from motor.concilia import conciliar_r1, conciliar_r6
from motor.maestro import parse_resumen, parse_bases
from motor.contabilidad import parse_contabilidad
from motor import secciones as S

DATA = "/Users/claudioleon/.openclaw/workspace/hrm/data/abril2026"


def test_acumulado_abril_parsea_con_no_proceso():
    r = parse_acumulado(f"{DATA}/acumulado_abril2026.xlsx")
    assert r.meta["hoja"] == "Base Pre nómina"
    assert r.meta["filas_datos"] == 17141
    # el neto fiscal del mes (control de fila sin descuadres)
    assert r.total.neto == 9241691361, r.total.neto
    assert len([h for h in r.hallazgos if h.get("tipo") == "control_fila"]) == 0
    # periodos por NO. PROCESO (semanales + catorcenales + especiales)
    assert "SEM 13" in r.periodos and "CAT 07" in r.periodos and "FINIQUITOS" in r.periodos


def test_isr_incluye_isr_nomina():
    r = parse_acumulado(f"{DATA}/acumulado_abril2026.xlsx")
    # familia ISR ahora suma 5 columnas incl. 'ISR Nómina' (antes se omitía $126,533)
    assert r.meta["familias"]["isr"] == 5
    assert r.total.isr == 2016009885, r.total.isr


def test_secx_reproduce_resumen_abril():
    resumen = parse_resumen(f"{DATA}/isn_abril2026.xlsx")
    bases = parse_bases(f"{DATA}/isn_abril2026.xlsx")
    x = S.seccion_x_isn(resumen, bases)
    assert len(x["filas"]) == 30
    # base e impuesto = RESUMEN (verdad Sec X); tasas 2026 = BASES -> 0 discrepancias
    assert x["total_base"] == 12698386052, x["total_base"]
    assert not x["discrepancias_tasa"]
    assert abs(x["total_impuesto_bases"] - x["total_impuesto"]) <= 1
    # Colima y Chiapas al 3% (duda 2026 resuelta)
    tasas = {b["entidad"]: b["tasa"] for b in bases.values()}
    assert tasas["COLIMA"] == 0.03 and tasas["CHIAPAS"] == 0.03


def test_cfdi_abril_columnas_por_nombre_y_r1():
    acum = parse_acumulado(f"{DATA}/acumulado_abril2026.xlsx")
    cf = parse_cfdi(f"{DATA}/cfdi_abril2026.xlsx", mes_pago="2026-04")
    # 92 cols -> los totales se resuelven por nombre, no por posición
    assert cf.total.neto > 9_000_000_00
    r1 = conciliar_r1(acum.por_rfc, cf.por_rfc)
    r6 = conciliar_r6(acum.por_rfc, cf.por_rfc)
    # concilia a <0.02% con muy pocos empleados en diferencia
    assert abs(r1.diferencia) < 2_000_000, r1.diferencia
    assert r1.empleados_dif <= 5, r1.empleados_dif
    assert len(r6.solo_cfdi) == 0   # todo CFDI tiene nómina


def test_secxi_dispersion_partida_doble():
    acum = parse_acumulado(f"{DATA}/acumulado_abril2026.xlsx")
    contab = parse_contabilidad(f"{DATA}/contabilidad_abril2026.xlsx")
    # dispersado = Σ créditos banco de nómina; partida doble: = débito del pasivo
    assert contab.dispersado == 9211357654, contab.dispersado
    assert contab.pasivo_debito == contab.dispersado
    # el traspaso (fondeo) se aísla, NO cuenta como dispersión
    assert contab.fondeo_traspaso == 8940000000
    xi = S.seccion_xi_provision(acum.total.neto, contab)
    # nómina vs dispersado: el motor EXPONE la diferencia (finiquitos/tiempos), no la oculta
    assert xi["diferencia"] == acum.total.neto - contab.dispersado
    assert xi["diferencia"] == 30333707 and not xi["cuadra"]


def test_secv_familias_por_tipo():
    acum = parse_acumulado(f"{DATA}/acumulado_abril2026.xlsx")
    v = S.seccion_v_por_puesto(acum.por_puesto)
    sem = {f["puesto"] for f in v["semanal"]}
    cat = {f["puesto"] for f in v["catorcenal"]}
    # semanal: retail por prefijo; OTROS mínimo (catálogo cubre casi todo)
    assert "EJECUTIVO DE VENTAS" in sem and "GERENTE DE TIENDA" in sem
    otros_sem = next((f["monto"] for f in v["semanal"] if f["puesto"] == "OTROS"), 0)
    assert otros_sem / v["total_semanal"] < 0.02
    # catorcenal: familias corporativas reales (cierra el bug "solo OTROS")
    assert {"PRESIDENCIA", "DIRECTORES", "GERENTES", "COORDINADORES", "ANALISTAS"} <= cat
    otros_cat = next((f["monto"] for f in v["catorcenal"] if f["puesto"] == "OTROS"), 0)
    assert otros_cat / v["total_catorcenal"] < 0.15   # informe ~9.8%


def test_secxi_provision_por_periodo():
    from motor.contabilidad import parse_provision_periodos
    prov = parse_provision_periodos(f"{DATA}/acumulado_abril2026.xlsx")
    # Hoja1 del archivo de abril = ciclo marzo -> reproduce el informe de marzo
    pmap = dict(prov.periodos)
    assert pmap["SEMANA 09"] == 1627547901, pmap.get("SEMANA 09")
    assert len(prov.periodos) == 6
    assert prov.dif == -563                      # redondeos -5.63 (= informe marzo)
    assert dict(prov.especiales)["BONOS CAT"] == 77892610


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
