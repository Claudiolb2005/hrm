#!/usr/bin/env python3
"""Genera el Informe de Supervisión de 13 secciones (Enero 2026) desde los 4
insumos reales, lo imprime legible y lo exporta a JSON (centavos enteros).

    python src/run_informe.py [enero|abril|feb]
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.informe import generar_informe, ORDEN
from motor.normaliza import centavos_a_mxn as mxn

DATA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

CONFIGS = {
    "enero": {
        "cliente": "PRIMEWIRELESS HOLDINGS", "periodo_label": "Enero 2026",
        "mes_pago": "2026-01",
        "acumulado": f"{DATA}/acumulado_enero2026.xlsx",
        "maestro": f"{DATA}/maestro_enero2026.xlsx",
        "cfdi": f"{DATA}/cfdi_enero2026.xlsx",
        "contabilidad": f"{DATA}/contabilidad_enero2026.xlsx",
    },
}


def linea(k, v):
    return f"    {k:<26} {mxn(v):>20}"


def main():
    cual = sys.argv[1] if len(sys.argv) > 1 else "enero"
    cfg = CONFIGS[cual]
    print(f"Generando informe: {cfg['cliente']} — {cfg['periodo_label']}\n")
    inf = generar_informe(cfg)
    d = inf.to_dict()

    print("=" * 74)
    print(f"INFORME DE SUPERVISIÓN — {inf.meta['cliente']} — {inf.meta['periodo']}")
    print(f"empleados del mes: {inf.meta['empleados_mes']}  ·  "
          f"periodos: {len(inf.meta['periodos'])}  ·  motor v{inf.meta['version_motor']}")
    print(f"secciones generadas: {', '.join(inf.meta['secciones_generadas'])}")
    print("=" * 74)

    S = inf.secciones
    print("\n── I. Integración de la nómina")
    print(linea("Percepciones", S["I"]["percepciones"]))
    print(linea("Deducciones", S["I"]["deducciones"]))
    print(linea("TOTAL (neto)", S["I"]["total"]))

    print("\n── II. Importes: Nómina vs CFDI vs Dispersión")
    print(linea("Nómina (neto)", S["II"]["nomina"]))
    if "cfdi" in S["II"]:
        print(linea("CFDI (timbrado)", S["II"]["cfdi"]))
        print(linea("  dif Nómina−CFDI", S["II"]["dif_cfdi"]))
    if "dispersado" in S["II"]:
        print(linea("Dispersado (bancos)", S["II"]["dispersado"]))
        print(linea("  dif Nómina−Disp", S["II"]["dif_dispersado"]))

    if "III" in S:
        print(f"\n── III. Situaciones detectadas ({len(S['III']['filas'])} periodos)")
        for f in S["III"]["filas"][:4]:
            print(f"    {f['periodo'][:22]:<22} dif CFDI {mxn(f['dif_cfdi']):>12}"
                  f"  dif Disp {mxn(f['dif_dispersado']):>12}")

    print(f"\n── IV. Concentrado ({len(S['IV']['filas'])} periodos)")
    print(linea("neto total (concil)", sum(f['neto_concil'] for f in S['IV']['filas'])))

    print("\n── V. Totales por puesto")
    print(linea("total semanal", S["V"]["total_semanal"]))
    print(linea("total catorcenal", S["V"]["total_catorcenal"]))

    if "VI" in S:
        print(f"\n── VI. Totales por estado ({len(S['VI']['filas'])} estados)")
        print(linea("total", S["VI"]["total"]))

    print("\n── VII. Impuestos / visor SAT (retenciones al trabajador)")
    print(linea("ISR", S["VII"]["total_isr"]))
    print(linea("IMSS obrero", S["VII"]["total_imss_obrero"]))
    print(linea("Préstamo Infonavit", S["VII"]["total_infonavit"]))
    print(linea("Préstamo FONACOT", S["VII"]["total_fonacot"]))
    print(linea("TOTAL trabajador", S["VII"]["total"]))

    print("\n── VIII. Contribuciones (patronales)")
    print(linea("IMSS patronal", S["VIII"]["total_imss"]))
    print(linea("RCV patronal", S["VIII"]["total_rcv"]))
    print(linea("Infonavit empresa", S["VIII"]["total_infonavit"]))
    print(linea("Impuesto estatal (ISN)", S["VIII"]["total_isn"]))
    print(linea("TOTAL patrón", S["VIII"]["total"]))

    if "IX" in S:
        print(f"\n── IX. IMSS/RCV por RP ({len(S['IX']['filas'])} registros)")
        print(linea("total IMSS", S["IX"]["total_imss"]))
        print(linea("total RCV", S["IX"]["total_rcv"]))
    if "X" in S:
        print(f"\n── X. ISN por estado ({len(S['X']['filas'])} estados)")
        print(linea("base ISN", S["X"]["total_base"]))
        print(linea("ISN (tasa BASES)", S["X"]["total_impuesto_bases"]))
    if "XI" in S:
        print("\n── XI. Provisión (contabilidad) vs Nómina")
        print(linea("neto fiscal nómina", S["XI"]["nomina_neto_fiscal"]))
        print(linea("dispersado", S["XI"]["dispersado"]))
        print(linea("diferencia", S["XI"]["diferencia"]))

    print("\n── XII. Tendencias")
    print(f"    headcount final sem {S['XII']['headcount_final_sem']}  ·  "
          f"cat {S['XII']['headcount_final_cat']}  ·  "
          f"altas/bajas sem {S['XII']['churn_altas_sem']}/{S['XII']['churn_bajas_sem']}")

    print(f"\n── XIII. Acciones de mejora ({len(S['XIII']['acciones'])} base)")

    print("\n" + "=" * 74)
    print(f"TABLERO DE HALLAZGOS ({len(inf.hallazgos)})")
    print("=" * 74)
    for h in inf.hallazgos:
        m = f"  [{mxn(h['monto'])}]" if "monto" in h else ""
        print(f"  · [{h['severidad']:<5}] Sec {h['seccion']:<4} {h['detalle']}{m}")
    if inf.pendientes:
        print(f"\nPENDIENTES ({len(inf.pendientes)}):")
        for p in inf.pendientes:
            print(f"  ⏳ {p}")

    # ---- export JSON (centavos enteros = fuente de verdad) ----
    d["meta"]["moneda"] = "centavos"
    outdir = os.path.join(os.path.dirname(DATA), "out")
    os.makedirs(outdir, exist_ok=True)
    outpath = os.path.join(outdir, f"informe_{cual}2026.json")
    with open(outpath, "w", encoding="utf-8") as fh:
        json.dump(d, fh, ensure_ascii=False, indent=2)
    print(f"\n✅ JSON exportado: {outpath}  ({os.path.getsize(outpath)//1024} KB)")


if __name__ == "__main__":
    main()
