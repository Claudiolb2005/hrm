"""Generador de secciones del informe (spec §5.8). Funciones puras que reciben
los agregados del motor y devuelven estructuras listas para render.

Implementadas aquí: IV (concentrado), V (por puesto), VI (por estado),
IX (IMSS/RCV por registro patronal), X (ISN por estado).
"""
from __future__ import annotations

import re

from .conceptos_prime import FAMILIAS_PUESTO_SEM, FAMILIAS_PUESTO_CAT


def _num_periodo(nombre: str) -> int:
    m = re.search(r"(\d+)", nombre or "")
    return int(m.group(1)) if m else 0


def _familia_sem(puesto: str, catalogo) -> str:
    """SEMANAL (retail): agrupa por prefijo del catálogo; el resto -> OTROS."""
    p = (puesto or "").upper().strip()
    for pref in catalogo:
        if p.startswith(pref):
            return pref
    return "OTROS"


def _familia_cat(puesto: str, reglas) -> str:
    """CATORCENAL (corporativo): familia por palabra clave; el resto -> OTROS."""
    p = (puesto or "").upper()
    for kw, fam in reglas:
        if kw in p:
            return fam
    return "OTROS"


def seccion_iv_concentrado(periodos: dict) -> dict:
    filas = [{"periodo": p, "empleados": a.empleados,
              "percepciones": a.percepciones, "deducciones": a.deducciones,
              "neto": a.neto, "neto_concil": a.comprobacion_neto}
             for p, a in periodos.items()]
    return {"num": "IV", "titulo": "Concentrado por periodo", "filas": filas}


def seccion_v_por_puesto(por_puesto: dict, cat_sem=None, reglas_cat=None) -> dict:
    """Totales por puesto (Sec V). Semanal agrupa por prefijo (retail) y catorcenal
    por palabra clave (corporativo) — catálogos PRIME, sustituibles por cliente.
    Cierra el bug del informe ("en catorcenal solo muestra OTROS")."""
    cat_sem = cat_sem or FAMILIAS_PUESTO_SEM
    reglas_cat = reglas_cat or FAMILIAS_PUESTO_CAT
    sem, cat = {}, {}
    for puesto, g in por_puesto.items():
        if g["sem"]:
            f = _familia_sem(puesto, cat_sem)
            sem[f] = sem.get(f, 0) + g["sem"]
        if g["cat"]:
            f = _familia_cat(puesto, reglas_cat)
            cat[f] = cat.get(f, 0) + g["cat"]
    # OTROS siempre al final; el resto por monto desc
    def ordenar(d):
        return sorted(({"puesto": k, "monto": v} for k, v in d.items()),
                      key=lambda x: (x["puesto"] == "OTROS", -x["monto"]))
    semanal, catorcenal = ordenar(sem), ordenar(cat)
    return {"num": "V", "titulo": "Totales por puesto",
            "semanal": semanal, "total_semanal": sum(x["monto"] for x in semanal),
            "catorcenal": catorcenal, "total_catorcenal": sum(x["monto"] for x in catorcenal)}


def seccion_vi_por_estado(por_rp: dict, bases: dict) -> dict:
    """Suma el neto de conciliación por estado (RP→estado vía BASES)."""
    por_estado = {}
    sin_mapeo = []
    for rp, g in por_rp.items():
        estado = bases.get(rp, {}).get("entidad") or "(RP SIN MAPEO)"
        if estado == "(RP SIN MAPEO)":
            sin_mapeo.append(rp)
        por_estado[estado] = por_estado.get(estado, 0) + g["neto_concil"]
    total = sum(por_estado.values())
    filas = sorted(({"estado": k, "monto": v,
                     "pct": round(v * 100 / total, 2) if total else 0}
                    for k, v in por_estado.items()), key=lambda x: -x["monto"])
    return {"num": "VI", "titulo": "Totales por estado", "filas": filas,
            "total": total, "rp_sin_mapeo": sin_mapeo}


def seccion_ix_imss_rcv_rp(por_rp: dict, bases: dict) -> dict:
    """IMSS y RCV (obrero+patronal) por registro patronal, con # colaboradores."""
    filas = []
    for rp, g in por_rp.items():
        imss = g["imss_obrero"] + g["imss_patronal"]
        rcv = g["rcv_obrero"] + g["rcv_patronal"]
        filas.append({"rp": rp, "entidad": bases.get(rp, {}).get("entidad", ""),
                      "empleados": len(g["rfcs"]), "imss": imss, "rcv": rcv,
                      "imss_patronal": g["imss_patronal"], "rcv_patronal": g["rcv_patronal"]})
    filas.sort(key=lambda x: x["rp"])
    return {"num": "IX", "titulo": "IMSS y RCV por registro patronal", "filas": filas,
            "total_imss": sum(f["imss"] for f in filas),
            "total_rcv": sum(f["rcv"] for f in filas),
            "total_empleados": sum(f["empleados"] for f in filas)}


def seccion_x_isn(resumen: list, bases: dict = None) -> dict:
    """ISN por estado. Recalcula impuesto = base × tasa AUTORITATIVA (BASES) y
    expone dónde la tasa del RESUMEN difiere de la de BASES (hallazgo real:
    el RESUMEN puede traer tasas desactualizadas)."""
    bases = bases or {}
    filas = []
    discrepancias_tasa = []
    for r in resumen:
        tasa_bases = bases.get(r["rp"], {}).get("tasa", r["tasa"])
        imp_bases = round(r["base_isn"] * tasa_bases)
        if tasa_bases and abs(tasa_bases - r["tasa"]) > 1e-9:
            discrepancias_tasa.append({"rp": r["rp"], "entidad": r["entidad"],
                                       "tasa_resumen": r["tasa"], "tasa_bases": tasa_bases,
                                       "imp_resumen": r["impuesto"], "imp_bases": imp_bases})
        filas.append({"rp": r["rp"], "entidad": r["entidad"], "empleados": r["empleados"],
                      "base_isn": r["base_isn"], "tasa": r["tasa"], "tasa_bases": tasa_bases,
                      "impuesto": r["impuesto"], "impuesto_bases": imp_bases,
                      "cuadra": r["cuadra"]})
    return {"num": "X", "titulo": "Impuesto sobre nómina por estado", "filas": filas,
            "total_base": sum(f["base_isn"] for f in filas),
            "total_impuesto": sum(f["impuesto"] for f in filas),
            "total_impuesto_bases": sum(f["impuesto_bases"] for f in filas),
            "discrepancias_tasa": discrepancias_tasa,
            "renglones_descuadran": [f["rp"] for f in filas if not f["cuadra"]]}


def seccion_xi_provision(neto_fiscal_nomina: int, contab, prov_periodos=None, tol=500) -> dict:
    """Provisión Global (contabilidad) vs Nómina — conciliación de dispersión (R2).

    Compara el neto fiscal de la nómina (lo que debe salir en efectivo a los
    empleados) contra lo efectivamente dispersado según contabilidad (Σ créditos
    del banco de nómina). El fondeo por traspaso es el mismo dinero (se aísla, no
    suma). La diferencia se EXPONE como hallazgo (rechazos/timbrado/tiempos).

    Si se pasa `prov_periodos` (parse_provision_periodos), añade el DESGLOSE por
    periodo (PROVISIÓN por SEMANA/CATORCENA + especiales BONOS/FINIQUITOS y el
    control ACUMULADO/PAGO/DIF), tal como lo muestra el informe."""
    dispersado = contab.dispersado
    dif = neto_fiscal_nomina - dispersado
    out = {
        "num": "XI", "titulo": "Provisión Global (contabilidad) vs Nómina",
        "nomina_neto_fiscal": neto_fiscal_nomina,
        "dispersado": dispersado,
        "diferencia": dif,
        "cuadra": abs(dif) <= tol,
        "composicion": dict(contab.por_clase),
        "fondeo_traspaso": contab.fondeo_traspaso,
        "pasivo_debito": contab.pasivo_debito,
        "pasivo_credito": contab.pasivo_credito,
    }
    if prov_periodos is not None:
        out["por_periodo"] = [{"periodo": n, "provision": v} for n, v in prov_periodos.periodos]
        out["especiales"] = [{"concepto": n, "pago": v} for n, v in prov_periodos.especiales]
        out["prov_acumulado"] = prov_periodos.acumulado
        out["prov_pago"] = prov_periodos.pago
        out["prov_dif"] = prov_periodos.dif
    return out


def seccion_xii_tendencias(periodos: dict, base_sem=None, base_cat=None) -> dict:
    """Tendencias de los movimientos de nómina (Sec XII): headcount + altas/bajas
    por periodo, vía ROSTER-DIFF entre periodos consecutivos (mismo método que el
    papel de trabajo 'separacion por semanas'; no requiere el reporte IDSE).

    Un empleado es ALTA en el periodo P si su RFC está en P pero no en P-1; es BAJA
    si estaba en P-1 y no en P (esto captura finiquitos como bajas automáticamente).
    `base_sem`/`base_cat`: roster (set de RFCs) del último periodo del mes anterior,
    para poder calcular altas/bajas del PRIMER periodo del mes; si no se pasa, ese
    renglón va solo con headcount."""
    def stream(prefijo, base):
        chain = sorted((p for p in periodos if str(p).upper().startswith(prefijo)),
                       key=_num_periodo)
        filas, prev = [], base
        for p in chain:
            ros = periodos[p].rfcs
            fila = {"periodo": p, "headcount": len(ros)}
            if prev is not None:
                fila["altas"], fila["bajas"] = len(ros - prev), len(prev - ros)
            else:
                fila["altas"] = fila["bajas"] = None
            filas.append(fila)
            prev = ros
        return filas

    sem, cat = stream("SEM", base_sem), stream("CAT", base_cat)
    churn = lambda filas, k: sum(f[k] for f in filas if f.get(k) is not None)
    return {
        "num": "XII", "titulo": "Tendencias de los movimientos de nómina",
        "semanal": sem, "catorcenal": cat,
        # rotación = suma de la rotación por periodo (churn), no el neto del mes
        "churn_altas_sem": churn(sem, "altas"), "churn_bajas_sem": churn(sem, "bajas"),
        "churn_altas_cat": churn(cat, "altas"), "churn_bajas_cat": churn(cat, "bajas"),
        "headcount_final_sem": sem[-1]["headcount"] if sem else 0,
        "headcount_final_cat": cat[-1]["headcount"] if cat else 0,
    }


def _orden_periodos(periodos):
    """Orden del informe: SEMANA (num) → CATORCENA (num) → especiales (BONOS,
    FINIQUITOS, GRATIFICACIÓN, PTU…) al final, alfabético."""
    def clave(p):
        u = str(p).upper()
        grupo = 0 if u.startswith("SEM") else (1 if u.startswith("CAT") else 2)
        return (grupo, _num_periodo(p) if grupo < 2 else 0, u)
    return sorted(periodos, key=clave)


def seccion_i_integracion(total) -> dict:
    """I. Integración de la nómina: Percepciones − Deducciones = Total (neto de
    conciliación, el mismo que cruza contra CFDI y dispersión)."""
    perc, ded = total.percepciones, total.deducciones
    return {"num": "I", "titulo": "Integración de la nómina",
            "percepciones": perc, "deducciones": ded, "total": perc - ded}


def seccion_ii_importes(neto_nomina: int, cfdi_total, dispersado) -> dict:
    """II. Importes de la nómina, CFDI y Pagos: confronta el neto de nómina contra
    el timbrado (CFDI, R1) y contra lo dispersado (bancos, R2). La diferencia es el
    hallazgo del mes (redondeos, timbrado pendiente, rechazos). `cfdi_total` /
    `dispersado` pueden ser None si el insumo no se proporcionó."""
    out = {"num": "II", "titulo": "Importes de la nómina, CFDI y Pagos",
           "nomina": neto_nomina}
    if cfdi_total is not None:
        out["cfdi"] = cfdi_total
        out["dif_cfdi"] = neto_nomina - cfdi_total
    if dispersado is not None:
        out["dispersado"] = dispersado
        out["dif_dispersado"] = neto_nomina - dispersado
    return out


def seccion_iii_situaciones(concil_periodo: dict) -> dict:
    """III. Explicación de situaciones detectadas: el cuadre Nómina/CFDI/Dispersión
    de la Sec II, pero DESGLOSADO por periodo, para ubicar en qué periodo está la
    diferencia. `concil_periodo`: dict periodo → {acumulado, cfdi, pagos} (de
    parse_resumen_conciliacion). Vacío si no hay papel de conciliación por periodo."""
    filas = []
    for p in _orden_periodos(concil_periodo):
        c = concil_periodo[p]
        nom, cfdi, disp = c.get("acumulado", 0), c.get("cfdi", 0), c.get("pagos", 0)
        filas.append({"periodo": p, "nomina": nom, "cfdi": cfdi, "dispersado": disp,
                      "dif_cfdi": nom - cfdi, "dif_dispersado": nom - disp})
    return {"num": "III", "titulo": "Explicación de situaciones detectadas",
            "filas": filas,
            "total_dif_cfdi": sum(f["dif_cfdi"] for f in filas),
            "total_dif_dispersado": sum(f["dif_dispersado"] for f in filas)}


def seccion_vii_impuestos_sat(periodos: dict, sat_isr: int = None) -> dict:
    """VII. Impuestos y visor de nóminas SAT (informativo): retenciones al
    TRABAJADOR por periodo — ISR | IMSS obrero | Préstamo Infonavit | Préstamo
    FONACOT | Total. Si se pasa `sat_isr` (visor SAT), expone la diferencia."""
    filas = []
    for p in _orden_periodos(periodos):
        a = periodos[p]
        tot = a.isr + a.imss_obrero + a.infonavit + a.fonacot
        filas.append({"periodo": p, "isr": a.isr, "imss_obrero": a.imss_obrero,
                      "infonavit": a.infonavit, "fonacot": a.fonacot, "total": tot})
    out = {"num": "VII", "titulo": "Impuestos y visor de nóminas SAT (informativo)",
           "filas": filas,
           "total_isr": sum(f["isr"] for f in filas),
           "total_imss_obrero": sum(f["imss_obrero"] for f in filas),
           "total_infonavit": sum(f["infonavit"] for f in filas),
           "total_fonacot": sum(f["fonacot"] for f in filas),
           "total": sum(f["total"] for f in filas)}
    if sat_isr is not None:
        out["sat_isr"] = sat_isr
        out["diferencia_sat"] = out["total_isr"] - sat_isr
    return out


def seccion_viii_contribuciones(periodos: dict) -> dict:
    """VIII. Contribuciones PATRONALES por periodo — IMSS patronal | RCV patronal |
    Infonavit empresa | Impuesto estatal (ISN informativo) | Total patrón."""
    filas = []
    for p in _orden_periodos(periodos):
        a = periodos[p]
        tot = a.imss_patronal + a.rcv_patronal + a.infonavit_patronal + a.isn_informativo
        filas.append({"periodo": p, "imss_patronal": a.imss_patronal,
                      "rcv_patronal": a.rcv_patronal,
                      "infonavit_empresa": a.infonavit_patronal,
                      "isn": a.isn_informativo, "total": tot})
    return {"num": "VIII", "titulo": "Contribuciones", "filas": filas,
            "total_imss": sum(f["imss_patronal"] for f in filas),
            "total_rcv": sum(f["rcv_patronal"] for f in filas),
            "total_infonavit": sum(f["infonavit_empresa"] for f in filas),
            "total_isn": sum(f["isn"] for f in filas),
            "total": sum(f["total"] for f in filas)}


ACCIONES_BASE = [
    "Continuar con la depuración de las diferencias detectadas durante el período, "
    "con la finalidad de tener de manera razonable las cifras correspondientes a la nómina.",
    "Proporcionar los papeles de trabajo en tiempo y forma, principalmente los pagos de "
    "finiquitos, liquidaciones y desvinculaciones, así como la provisión de contabilidad, "
    "considerando los finiquitos por meses completos y no solo por semanas o catorcenas.",
    "Realizar los Certificados Fiscales Digitales en tiempo, dentro del mes de la fecha de "
    "pago, para evitar que el informe se entregue con saldos pendientes.",
]


def seccion_xiii_acciones(hallazgos: list = None, pendientes_pago: list = None) -> dict:
    """XIII. Acciones de mejora: recomendaciones estándar del informe + los hallazgos
    concretos que el motor detectó este mes (no se fabrican, se exponen)."""
    return {"num": "XIII", "titulo": "Acciones de mejora",
            "acciones": list(ACCIONES_BASE),
            "hallazgos": hallazgos or [],
            "pendientes_pago": pendientes_pago or []}


def seccion_xi_variacion(nomina_por_periodo: dict, concil_por_periodo: dict) -> dict:
    """Columna VARIACIÓN de la Sección XI del mes vivo: NÓMINA por periodo (motor,
    neto con despensa) vs PAGOS (dispersión del papel de conciliación) → variación.
    La variación grande de un periodo suele ser despensa (vale, no se dispersa en
    efectivo) o pagos pendientes; el motor la EXPONE."""
    filas = []
    for p in sorted(set(nomina_por_periodo) | set(concil_por_periodo)):
        nom = nomina_por_periodo.get(p, 0)
        c = concil_por_periodo.get(p, {})
        pago = c.get("pagos", 0)
        filas.append({"periodo": p, "nomina": nom, "pago": pago,
                      "variacion": nom - pago, "acum_papel": c.get("acumulado", 0)})
    return {"num": "XI", "titulo": "Provisión Global (contabilidad) vs Nómina — variación por periodo",
            "filas": filas,
            "total_nomina": sum(f["nomina"] for f in filas),
            "total_pago": sum(f["pago"] for f in filas),
            "total_variacion": sum(f["variacion"] for f in filas)}
