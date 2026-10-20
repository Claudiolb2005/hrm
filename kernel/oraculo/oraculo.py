#!/usr/bin/env python3
"""Oráculo independiente de nómina mexicana 2026 (prueba diferencial).

Implementado desde la ley (LISR, LSS, LINFONAVIT) y la especificación del
despacho. NO deriva de /kernel/src ni /kernel/test. Sólo lee data/parametros-2026.json.

stdin:  {"casos":[{"id":..., "regla":..., "entrada":{...}}]}
stdout: {"resultados":[{"id":..., "valor_c":..., ...extras}]}
Importes de entrada/salida en centavos enteros; parámetros en pesos.
"""
import json
import os
import sys
from datetime import date, timedelta
from decimal import Decimal as D, getcontext, ROUND_HALF_UP, ROUND_DOWN
from fractions import Fraction as F

getcontext().prec = 50

RUTA_PARAMS = os.environ.get(
    "ORACULO_PARAMS",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "parametros-2026.json"),
)

DIAS = {"diaria": D(1), "semanal": D(7), "decenal": D(10), "catorcenal": D(14),
        "quincenal": D(15), "mensual": D("30.4")}
TARIFA = {"diaria": "ISR_TARIFA_DIARIA", "semanal": "ISR_TARIFA_SEMANAL",
          "decenal": "ISR_TARIFA_DECENAL", "quincenal": "ISR_TARIFA_QUINCENAL",
          "mensual": "ISR_TARIFA_MENSUAL"}
CIEN = D(100)


# ---------------------------------------------------------------- utilidades
def r_c(pesos):
    """pesos exactos -> centavos enteros, medio hacia arriba (incluye negativos simétricos)."""
    return int((D(pesos) * CIEN).quantize(D(1), rounding=ROUND_HALF_UP))


def c2p(c):
    return D(int(c)) / CIEN


def r_c_frac(x):
    """Fraction exacta en pesos -> centavos enteros, medio hacia arriba (simétrico)."""
    c = F(x) * 100
    neg = c < 0
    c = abs(c)
    n = (c + F(1, 2)).__floor__()
    return -int(n) if neg else int(n)


def fq(v):
    """str/Decimal/int -> Fraction exacta."""
    return F(str(v))


def fecha(s):
    return date.fromisoformat(str(s)[:10])


def dias_rango(desde, hasta):
    d, h = fecha(desde), fecha(hasta)
    out = []
    while d <= h:
        out.append(d)
        d += timedelta(days=1)
    return out


class Params:
    def __init__(self, ruta):
        with open(ruta, encoding="utf-8") as f:
            self.filas = json.load(f)["filas"]

    def vigente(self, clave, f):
        f = fecha(f) if not isinstance(f, date) else f
        cands = []
        for r in self.filas:
            if r["clave"] != clave:
                continue
            desde = fecha(r["vigencia_desde"]) if r.get("vigencia_desde") else date.min
            hasta = fecha(r["vigencia_hasta"]) if r.get("vigencia_hasta") else date.max
            if desde <= f <= hasta:
                cands.append((desde, r))
        if not cands:
            return None
        cands.sort(key=lambda x: x[0])
        return cands[-1][1]["valor"]  # la más reciente si se traslapan

    def num(self, clave, f):
        v = self.vigente(clave, f)
        if v is None:
            raise ValueError(f"parámetro {clave} no vigente a {f}")
        return D(str(v))


P = None


# ---------------------------------------------------------------- ISR
def isr_tarifa(base, tarifa):
    """LISR art. 96: renglón con el mayor li <= base."""
    if base <= 0:
        return D(0)
    fila = None
    for li, ls, cf, pct in tarifa:
        if D(str(li)) <= base:
            fila = (D(str(li)), D(str(cf)), D(str(pct)))
    if fila is None:
        return D(0)
    li, cf, pct = fila
    return cf + (base - li) * pct / CIEN


def subsidio_periodo(base_tope, periodicidad, fecha_pago, previo_c=0):
    """Devuelve (subsidio_c, extras). base_tope en pesos exactos."""
    M = P.num("SUBSIDIO_MONTO_MENSUAL", fecha_pago)
    T = P.num("SUBSIDIO_TOPE_MENSUAL", fecha_pago)
    Dv = P.num("SUBSIDIO_DIVISOR_DIAS", fecha_pago)
    dias = DIAS[periodicidad]
    # Sin divisiones intermedias: Decimal no es racional exacto y M/30.4 no termina.
    # base_tope/14 <= T/Dv  ⇔  base_tope × Dv <= T × 14 (lo mismo en las demás periodicidades).
    aplica = base_tope * Dv <= T * dias
    sub = r_c(M * dias / Dv) if aplica else 0
    disponible = max(0, r_c(M) - int(previo_c or 0))
    sub = max(0, min(sub, disponible))
    return sub, {"aplica": bool(aplica)}


def isr_periodo_exacto(base, periodicidad, fecha_pago):
    if periodicidad == "catorcenal":
        tar = P.vigente("ISR_TARIFA_DIARIA", fecha_pago)
        # (cf + (base/14 − li) × %) × 14 = 14·cf + (base − 14·li) × %: misma fórmula sin
        # dividir entre 14 (la división no termina y truncaría los empates de .5 centavo).
        if base <= 0:
            return D(0)
        fila = None
        for li, ls, cf, pct in tar:
            if D(str(li)) * D(14) <= base:
                fila = (D(str(li)), D(str(cf)), D(str(pct)))
        if fila is None:  # 0 < base/14 < 0.01: primer renglón
            li, ls, cf, pct = tar[0]
            fila = (D(str(li)), D(str(cf)), D(str(pct)))
        li, cf, pct = fila
        exc = max(D(0), base - D(14) * li)
        return D(14) * cf + exc * pct / CIEN
    tar = P.vigente(TARIFA[periodicidad], fecha_pago)
    return isr_tarifa(base, tar)


def regla_isr(e, per_default, con_subsidio=True, campo_base="base_gravable_c"):
    per = e.get("periodicidad") or per_default
    fp = e["fecha_pago"]
    base = c2p(e[campo_base])
    isr = isr_periodo_exacto(base, per, fp)
    sub_c = 0
    if con_subsidio:
        bt = e.get("base_para_tope_c")
        bt = c2p(bt) if bt is not None else base
        sub_c, _ = subsidio_periodo(bt, per, fp, e.get("subsidio_previo_mes_c") or 0)
    ret = r_c(max(D(0), isr - c2p(sub_c)))
    return {"valor_c": ret, "isr_antes_subsidio_c": r_c(isr), "subsidio_c": sub_c}


def regla_sub(e):
    sub, ex = subsidio_periodo(c2p(e["base_para_tope_c"]), e["periodicidad"], e["fecha_pago"],
                               e.get("subsidio_previo_mes_c") or 0)
    return {"valor_c": sub, "aplica": ex["aplica"]}


def regla_ext(e):
    r = regla_isr(dict(e, base_gravable_c=e["pago_gravable_c"]), "semanal", con_subsidio=False)
    return {"valor_c": r["valor_c"], "isr_antes_subsidio_c": r["isr_antes_subsidio_c"]}


def regla_ajm(e):
    if e.get("aplica_ajuste_mensual") is not True:
        return {"valor_c": None}
    fp = e["fecha_pago"]
    bases = sum((c2p(x) for x in e.get("bases_mes_c") or []), D(0))
    bt_list = e.get("bases_tope_mes_c")
    btope = sum((c2p(x) for x in bt_list), D(0)) if bt_list is not None else bases
    isr = isr_tarifa(bases, P.vigente("ISR_TARIFA_MENSUAL", fp))
    M = P.num("SUBSIDIO_MONTO_MENSUAL", fp)
    T = P.num("SUBSIDIO_TOPE_MENSUAL", fp)
    Dv = P.num("SUBSIDIO_DIVISOR_DIAS", fp)
    sub = M if btope <= T else D(0)  # M ÷ 30.4 × 30.4 = M, sin división intermedia
    isr_mes = r_c(max(D(0), isr - sub))
    previo = int(e.get("isr_retenido_previo_mes_c") or 0)
    return {"valor_c": isr_mes - previo, "isr_mes_c": isr_mes, "isr_antes_subsidio_c": r_c(isr),
            "subsidio_c": r_c(sub)}


# ---------------------------------------------------------------- ISR art. 174 RLISR / art. 95 LISR
def isr_mensual_frac(base, fecha_pago):
    """LISR art. 96, tarifa mensual (Anexo 8), en racionales exactos."""
    if base <= 0:
        return F(0)
    fila = None
    for li, ls, cf, pct in P.vigente("ISR_TARIFA_MENSUAL", fecha_pago):
        if fq(li) <= base:
            fila = (fq(li), fq(cf), fq(pct))
    if fila is None:
        return F(0)
    li, cf, pct = fila
    return cf + (base - li) * pct / 100


def sueldo_mensual(e, dias):
    if e.get("sueldo_mensual_c") is not None:
        return F(int(e["sueldo_mensual_c"]), 100)
    return F(int(e["salario_diario_c"]), 100) * dias


def regla_174(e):
    """RLISR art. 174, criterio C17. Racionales exactos, un redondeo al final."""
    fp = e["fecha_pago"]
    g = F(int(e["pago_gravable_c"]), 100)
    if g <= 0:
        return {"valor_c": 0}
    sueldo = sueldo_mensual(e, fq("30.4"))
    eq = g / 365 * fq("30.4")                                  # I
    if eq == 0:
        return {"valor_c": 0}
    dif = isr_mensual_frac(sueldo + eq, fp) - isr_mensual_frac(sueldo, fp)   # II − III
    tasa = dif / eq                                            # IV
    return {"valor_c": r_c_frac(g * tasa)}                     # V


def regla_sep(e):
    """LISR art. 95, criterio C16 (último sueldo = SD × 30)."""
    fp = e["fecha_pago"]
    g = F(int(e["separacion_gravable_c"]), 100)
    sueldo = sueldo_mensual(e, F(30))
    if sueldo <= 0:
        return {"valor_c": None}
    if g <= 0:
        return {"valor_c": 0}
    if g >= sueldo:
        isr = g * isr_mensual_frac(sueldo, fp) / sueldo
    else:
        isr = isr_mensual_frac(sueldo + g, fp) - isr_mensual_frac(sueldo, fp)
    return {"valor_c": r_c_frac(isr)}


# ---------------------------------------------------------------- IMSS / RCV / INFONAVIT
def salario_minimo(e, d):
    clave = "SALARIO_MINIMO_FRONTERA" if e.get("zona_salarial") == "frontera" else "SALARIO_MINIMO_GENERAL"
    return P.num(clave, d)


def gana_minimo(e):
    """Criterio C14 (LSS art. 36): salario diario si viene, si no el SBC; igualdad exacta."""
    sm = salario_minimo(e, e["periodo"]["desde"])
    medida = e.get("salario_diario_c")
    medida = medida if medida is not None else e["sbc_c"]
    return c2p(medida) == sm
def dias_no_incap(periodo, incap):
    dias = dias_rango(periodo["desde"], periodo["hasta"])
    if incap is None:
        return dias
    if isinstance(incap, (int, float)) and not isinstance(incap, bool):
        n = int(incap)
        return dias[:max(0, len(dias) - n)] if n > 0 else dias
    excl = {fecha(x) for x in incap}
    return [d for d in dias if d not in excl]


def sbc_dia(sbc, d):
    uma = P.num("UMA_DIARIA", d)
    tope = P.num("TOPE_SBC_VECES_UMA", d) * uma
    return uma, min(sbc, tope)


def regla_imss(e):
    sbc = c2p(e["sbc_c"])
    prima = D(str((e.get("prima_rt") or {}).get("pct", 0)))
    acc = {k: D(0) for k in ("cuota_fija_pat", "excedente_pat", "excedente_obr", "dinero_pat",
                             "dinero_obr", "gmp_pat", "gmp_obr", "rt_pat", "iv_pat", "iv_obr",
                             "guarderias_pat")}
    for d in dias_no_incap(e["periodo"], e.get("incapacidades")):
        q = P.vigente("IMSS_CUOTAS", d)
        t = {k: D(str(v)) / CIEN for k, v in q.items()}
        uma, s = sbc_dia(sbc, d)
        umbral = P.num("UMBRAL_EXCEDENTE_VECES_UMA", d) * uma
        exc = max(D(0), s - umbral)
        acc["cuota_fija_pat"] += t["cuota_fija_pat"] * uma
        acc["excedente_pat"] += t["excedente_pat"] * exc
        acc["excedente_obr"] += t["excedente_obr"] * exc
        acc["dinero_pat"] += t["dinero_pat"] * s
        acc["dinero_obr"] += t["dinero_obr"] * s
        acc["gmp_pat"] += t["gmp_pat"] * s
        acc["gmp_obr"] += t["gmp_obr"] * s
        acc["rt_pat"] += prima / CIEN * s
        acc["iv_pat"] += t["iv_pat"] * s
        acc["iv_obr"] += t["iv_obr"] * s
        acc["guarderias_pat"] += t["guarderias_pat"] * s
    ramas = {k: r_c(v) for k, v in acc.items()}
    obr = sum(v for k, v in ramas.items() if k.endswith("_obr"))
    pat = sum(v for k, v in ramas.items() if k.endswith("_pat"))
    c14 = gana_minimo(e)
    # valor_c = retención al trabajador; con C14 el patrón absorbe la cuota obrera.
    return {"valor_c": 0 if c14 else obr, "obrera_c": obr, "patronal_c": pat, "ramas_c": ramas,
            "c14": c14}


def regla_rcv(e):
    sbc = c2p(e["sbc_c"])
    retiro = ceav_p = ceav_o = D(0)
    for d in dias_rango(e["periodo"]["desde"], e["periodo"]["hasta"]):
        q = P.vigente("RCV_CUOTAS", d)
        _, s = sbc_dia(sbc, d)
        retiro += D(str(q["retiro_pat"])) / CIEN * s
    for d in dias_no_incap(e["periodo"], e.get("incapacidades")):
        q = P.vigente("RCV_CUOTAS", d)
        uma, s = sbc_dia(sbc, d)
        tabla = P.vigente("CEAV_PATRONAL_TABLA", d)
        tasa = None
        if s == salario_minimo(e, d):  # criterio C13: renglón «1.00 SM» sólo con SBC = SM exacto
            tasa = D(str(tabla[0][1]))
        else:
            veces = (s / uma).quantize(D("0.01"), rounding=ROUND_DOWN)  # criterio C4
            for hasta, t in tabla[1:]:
                if hasta is None or veces <= D(str(hasta)):
                    tasa = D(str(t))
                    break
        ceav_p += tasa / CIEN * s
        ceav_o += D(str(q["ceav_obr"])) / CIEN * s
    r, cp, co = r_c(retiro), r_c(ceav_p), r_c(ceav_o)
    ret_co = 0 if gana_minimo(e) else co  # criterio C14
    return {"valor_c": r + cp, "retiro_c": r, "ceav_pat_c": cp, "ceav_obr_c": co,
            "retencion_ceav_obr_c": ret_co}


def regla_inf(e):
    sbc = c2p(e["sbc_c"])
    tot = D(0)
    for d in dias_rango(e["periodo"]["desde"], e["periodo"]["hasta"]):
        _, s = sbc_dia(sbc, d)
        tot += P.num("INFONAVIT_APORTACION", d) / CIEN * s
    return {"valor_c": r_c(tot)}


# ---------------------------------------------------------------- Exenciones LISR art. 93
def anios_servicio(ingreso, baja):
    fi, fb = fecha(ingreso), fecha(baja)

    def sumar_meses(f, m):
        y, mo = f.year + (f.month - 1 + m) // 12, (f.month - 1 + m) % 12 + 1
        import calendar
        return date(y, mo, min(f.day, calendar.monthrange(y, mo)[1]))

    anios = 0
    while sumar_meses(fi, 12 * (anios + 1)) <= fb:
        anios += 1
    aniv = sumar_meses(fi, 12 * anios)
    if fb > sumar_meses(aniv, 6):  # fracción de MÁS de seis meses
        anios += 1
    return anios


def regla_exe(e):
    fp = e["fecha_pago"]
    uma = P.num("UMA_DIARIA", fp)
    consumido = {k: D(int(v)) for k, v in (e.get("consumido") or {}).items()}  # centavos
    semanas = D(str(e.get("semanas_periodo", 1)))
    perfil = e.get("perfil") or {}
    sep = e.get("separacion")
    base_grav = 0
    grav_sep = 0
    exento_tot = 0
    detalle = []
    for p in e.get("percepciones") or []:
        conc = p["concepto"]
        monto_c = int(p["monto_c"])
        monto = c2p(monto_c)
        cfg = P.vigente("EXENCION:" + conc, fp)
        grupo = None
        ex = D(0)
        if cfg is None:
            ex = D(0)
        else:
            tipo = cfg.get("tipo")
            grupo = cfg.get("grupo") or conc
            usado = c2p(consumido.get(grupo, 0))
            veces = D(str(cfg.get("veces", "0")))
            if tipo == "tope_uma":
                ex = min(monto, max(D(0), veces * uma - usado))
            elif tipo == "uma_por_domingo":
                dom = p.get("domingos")
                ex = D(0) if dom is None else min(monto, D(str(dom)) * veces * uma)
            elif tipo == "pct_hasta_uma":
                pct = D(str(cfg.get("porcentaje", "50")))
                ex = min(monto * pct / CIEN, max(D(0), veces * uma * semanas - usado))
            elif tipo == "separacion":
                grupo = cfg.get("grupo") or "separacion"
                usado = c2p(consumido.get(grupo, 0))
                anios = anios_servicio(sep["fecha_ingreso"], sep["fecha_baja"]) if sep else 0
                ex = min(monto, max(D(0), veces * uma * D(anios) - usado))
            elif tipo == "requisitos":
                ex = monto if perfil.get("fondo_ahorro_cumple_requisitos") is True else D(0)
            else:  # pendiente u otro: grava
                ex = D(0)
        ex_c = max(0, min(monto_c, r_c(max(D(0), ex))))
        grav_c = monto_c - ex_c
        if grupo is not None:
            consumido[grupo] = consumido.get(grupo, D(0)) + D(ex_c)
        if cfg is not None and cfg.get("tipo") == "separacion":
            grav_sep += grav_c
        base_grav += grav_c
        exento_tot += ex_c
        detalle.append({"concepto": conc, "exento_c": ex_c, "gravado_c": grav_c})
    return {"valor_c": base_grav, "exento_total_c": exento_tot,
            "base_para_tope_subsidio_c": base_grav - grav_sep, "detalle": detalle,
            "consumido_c": {k: int(v) for k, v in consumido.items()}}


REGLAS = {
    "CALC-SUB-001": regla_sub,
    "CALC-ISR-SEM-001": lambda e: regla_isr(e, "semanal"),
    "CALC-ISR-CAT-001": lambda e: regla_isr(e, "catorcenal"),
    "CALC-ISR-EXT-001": regla_ext,
    "CALC-ISR-AJM-001": regla_ajm,
    "CALC-ISR-174-001": regla_174,
    "CALC-ISR-SEP-001": regla_sep,
    "CALC-IMSS-001": regla_imss,
    "CALC-RCV-001": regla_rcv,
    "CALC-INF-001": regla_inf,
    "CALC-EXE-001": regla_exe,
}


def main():
    global P
    P = Params(RUTA_PARAMS)
    entrada = json.load(sys.stdin)
    res = []
    for caso in entrada.get("casos", []):
        out = {"id": caso.get("id")}
        try:
            fn = REGLAS[caso["regla"]]
            out.update(fn(caso.get("entrada") or {}))
        except Exception as ex:  # el error es un resultado, no un aborto
            out.update({"valor_c": None, "error": f"{type(ex).__name__}: {ex}"})
        res.append(out)
    json.dump({"resultados": res}, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
