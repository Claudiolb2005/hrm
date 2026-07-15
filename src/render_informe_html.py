#!/usr/bin/env python3
"""
Renderiza el Informe de Supervisión de Nómina (13 secciones) a un HTML visual,
profesional y listo para imprimir a PDF.

    python src/render_informe_html.py [enero|abril]  ->  out/informe_<mes>.html
"""
import sys, os, json, datetime
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from motor.informe import generar_informe

DATA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "out")

CONFIGS = {
    "enero": {
        "cliente": "PRIMEWIRELESS HOLDINGS", "periodo_label": "Enero 2026", "mes_pago": "2026-01",
        "acumulado": f"{DATA}/acumulado_enero2026.xlsx", "maestro": f"{DATA}/maestro_enero2026.xlsx",
        "cfdi": f"{DATA}/cfdi_enero2026.xlsx", "contabilidad": f"{DATA}/contabilidad_enero2026.xlsx",
    },
    "abril": {
        "cliente": "PRIMEWIRELESS HOLDINGS", "periodo_label": "Abril 2026", "mes_pago": "2026-04",
        "acumulado": f"{DATA}/abril2026/acumulado_abril2026.xlsx", "maestro": f"{DATA}/abril2026/isn_abril2026.xlsx",
        "cfdi": f"{DATA}/abril2026/cfdi_abril2026.xlsx", "contabilidad": f"{DATA}/abril2026/contabilidad_abril2026.xlsx",
    },
}

SEV = {"alta": ("#b91c1c", "#fee2e2"), "media": ("#b45309", "#fef3c7"), "baja": ("#1d4ed8", "#dbeafe")}


def mxn(c):
    if c is None:
        return "—"
    return f"${c/100:,.2f}"


def pct(x):
    return "—" if x is None else f"{x*100:.2f}%"


def num(n):
    return "—" if n is None else f"{n:,}"


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def tabla(headers, rows, aligns=None, total_row=None):
    aligns = aligns or ["left"] + ["right"] * (len(headers) - 1)
    th = "".join(f'<th style="text-align:{a}">{esc(h)}</th>' for h, a in zip(headers, aligns))
    body = ""
    for r in rows:
        tds = "".join(f'<td style="text-align:{a}">{c}</td>' for c, a in zip(r, aligns))
        body += f"<tr>{tds}</tr>"
    tot = ""
    if total_row:
        tds = "".join(f'<td style="text-align:{a}">{c}</td>' for c, a in zip(total_row, aligns))
        tot = f'<tr class="total">{tds}</tr>'
    return f'<table><thead><tr>{th}</tr></thead><tbody>{body}{tot}</tbody></table>'


def card(num_sec, titulo, contenido):
    return (f'<section class="card"><h2><span class="badge">{esc(num_sec)}</span>'
            f'{esc(titulo)}</h2>{contenido}</section>')


def kpi(label, value, sub=""):
    subhtml = f'<div class="kpi-sub">{esc(sub)}</div>' if sub else ""
    return f'<div class="kpi"><div class="kpi-val">{value}</div><div class="kpi-lbl">{esc(label)}</div>{subhtml}</div>'


def render(inf, fecha):
    m = inf.meta
    S = inf.secciones
    H = inf.hallazgos
    parts = []

    # ---------- Portada / header ----------
    parts.append(f"""<header class="cover">
      <div class="cover-tag">INFORME DE SUPERVISIÓN DE NÓMINA</div>
      <h1>{esc(m['cliente'])}</h1>
      <div class="cover-sub">{esc(m.get('periodo') or '')} · {m['empleados_mes']:,} empleados · {len(m['periodos'])} periodos</div>
      <div class="cover-meta">Generado {fecha} · Motor determinista v{m['version_motor']} · Cifras en pesos (centavos exactos)</div>
    </header>""")

    # ---------- KPIs ejecutivos ----------
    i = S["I"]
    kpis = [
        kpi("Percepciones", mxn(i["percepciones"])),
        kpi("Deducciones", mxn(i["deducciones"])),
        kpi("Neto de nómina", mxn(i["total"])),
        kpi("Empleados del mes", num(m["empleados_mes"])),
        kpi("Hallazgos", str(len(H)), "situaciones detectadas"),
    ]
    parts.append('<div class="kpis">' + "".join(kpis) + "</div>")

    # ---------- Tablero de hallazgos ----------
    if H:
        chips = ""
        for h in H:
            col, bg = SEV.get(h["severidad"], ("#374151", "#f3f4f6"))
            monto = f' · <b>{mxn(h["monto"])}</b>' if h.get("monto") is not None else ""
            chips += (f'<div class="hallazgo" style="border-left:4px solid {col};background:{bg}">'
                      f'<span class="sev" style="color:{col}">{esc(h["severidad"].upper())}</span> '
                      f'<span class="sec">Sec {esc(h["seccion"])}</span> — {esc(h["detalle"])}{monto}</div>')
        parts.append(card("⚠", "Tablero de hallazgos", chips))

    # ---------- I ----------
    parts.append(card("I", i["titulo"],
        tabla(["Concepto", "Importe"],
              [["Percepciones", mxn(i["percepciones"])],
               ["Deducciones", mxn(i["deducciones"])]],
              total_row=["TOTAL (neto)", mxn(i["total"])])))

    # ---------- II ----------
    ii = S["II"]
    rows = [["Nómina (neto de conciliación)", mxn(ii["nomina"])]]
    if "cfdi" in ii:
        rows += [["CFDI (timbrado)", mxn(ii["cfdi"])], ["Diferencia Nómina − CFDI", mxn(ii["dif_cfdi"])]]
    if "dispersado" in ii:
        rows += [["Dispersado (bancos)", mxn(ii["dispersado"])], ["Diferencia Nómina − Dispersión", mxn(ii["dif_dispersado"])]]
    parts.append(card("II", ii["titulo"], tabla(["Fuente", "Importe"], rows)))

    # ---------- III ----------
    if "III" in S:
        iii = S["III"]
        rows = [[esc(f["periodo"]), mxn(f["dif_cfdi"]), mxn(f["dif_dispersado"])] for f in iii["filas"]]
        parts.append(card("III", iii["titulo"], tabla(["Periodo", "Dif. CFDI", "Dif. Dispersión"], rows)))

    # ---------- IV ----------
    iv = S["IV"]
    rows = [[esc(f["periodo"]), num(f["empleados"]), mxn(f["percepciones"]), mxn(f["deducciones"]), mxn(f["neto_concil"])]
            for f in iv["filas"]]
    tot = ["TOTAL", num(sum(f["empleados"] for f in iv["filas"])), mxn(sum(f["percepciones"] for f in iv["filas"])),
           mxn(sum(f["deducciones"] for f in iv["filas"])), mxn(sum(f["neto_concil"] for f in iv["filas"]))]
    parts.append(card("IV", iv["titulo"],
        tabla(["Periodo", "Empleados", "Percepciones", "Deducciones", "Neto"], rows,
              ["left", "right", "right", "right", "right"], tot)))

    # ---------- V ----------
    v = S["V"]
    def _bloque(items, total, titulo):
        rows = [[esc(x["puesto"]), mxn(x["monto"])] for x in items]
        return f'<h3>{titulo}</h3>' + tabla(["Puesto / familia", "Monto"], rows, total_row=["TOTAL", mxn(total)])
    parts.append(card("V", v["titulo"],
        _bloque(v["semanal"], v["total_semanal"], "Semanal") + _bloque(v["catorcenal"], v["total_catorcenal"], "Catorcenal")))

    # ---------- VI ----------
    if "VI" in S:
        vi = S["VI"]
        rows = [[esc(f["estado"]), mxn(f["monto"]), f'{f["pct"]:.2f}%'] for f in vi["filas"]]
        parts.append(card("VI", vi["titulo"],
            tabla(["Estado", "Monto", "%"], rows, total_row=["TOTAL", mxn(vi["total"]), "100%"])))

    # ---------- VII ----------
    vii = S["VII"]
    rows = [[esc(f["periodo"]), mxn(f["isr"]), mxn(f["imss_obrero"]), mxn(f["infonavit"]), mxn(f["fonacot"]), mxn(f["total"])]
            for f in vii["filas"]]
    tot = ["TOTAL", mxn(vii["total_isr"]), mxn(vii["total_imss_obrero"]), mxn(vii["total_infonavit"]),
           mxn(vii["total_fonacot"]), mxn(vii["total"])]
    parts.append(card("VII", vii["titulo"],
        tabla(["Periodo", "ISR", "IMSS obrero", "Infonavit", "FONACOT", "Total"], rows,
              ["left", "right", "right", "right", "right", "right"], tot)))

    # ---------- VIII ----------
    viii = S["VIII"]
    rows = [[esc(f["periodo"]), mxn(f["imss_patronal"]), mxn(f["rcv_patronal"]), mxn(f["infonavit_empresa"]), mxn(f["isn"]), mxn(f["total"])]
            for f in viii["filas"]]
    tot = ["TOTAL", mxn(viii["total_imss"]), mxn(viii["total_rcv"]), mxn(viii["total_infonavit"]), mxn(viii["total_isn"]), mxn(viii["total"])]
    parts.append(card("VIII", viii["titulo"],
        tabla(["Periodo", "IMSS patronal", "RCV patronal", "Infonavit empresa", "ISN", "Total"], rows,
              ["left", "right", "right", "right", "right", "right"], tot)))

    # ---------- IX ----------
    if "IX" in S:
        ix = S["IX"]
        rows = [[esc(f["entidad"]), esc(f["rp"]), num(f["empleados"]), mxn(f["imss"]), mxn(f["rcv"])] for f in ix["filas"]]
        tot = ["TOTAL", "", num(ix.get("total_empleados")), mxn(ix["total_imss"]), mxn(ix["total_rcv"])]
        parts.append(card("IX", ix["titulo"],
            tabla(["Entidad", "Registro Patronal", "Empleados", "IMSS", "RCV"], rows,
                  ["left", "left", "right", "right", "right"], tot)))

    # ---------- X ----------
    if "X" in S:
        x = S["X"]
        rows = [[esc(f["entidad"]), num(f["empleados"]), mxn(f["base_isn"]), pct(f["tasa_bases"]), mxn(f["impuesto_bases"])]
                for f in x["filas"]]
        tot = ["TOTAL", "", mxn(x["total_base"]), "", mxn(x.get("total_impuesto_bases") or x.get("total_impuesto"))]
        extra = ""
        if x.get("discrepancias_tasa"):
            extra = f'<p class="note">⚠ {len(x["discrepancias_tasa"])} estado(s) con tasa del RESUMEN ≠ tasa autoritativa (BASES).</p>'
        parts.append(card("X", x["titulo"],
            tabla(["Estado", "Empleados", "Base ISN", "Tasa 2026", "ISN"], rows,
                  ["left", "right", "right", "right", "right"], tot) + extra))

    # ---------- XI ----------
    if "XI" in S:
        xi = S["XI"]
        estado = "CUADRA" if xi.get("cuadra") else "NO CUADRA"
        col = "#15803d" if xi.get("cuadra") else "#b91c1c"
        rows = [["Neto fiscal de nómina", mxn(xi["nomina_neto_fiscal"])],
                ["Dispersado (contabilidad / bancos)", mxn(xi["dispersado"])],
                [f'Diferencia (<b style="color:{col}">{estado}</b>)', mxn(xi["diferencia"])]]
        contenido = tabla(["Concepto", "Importe"], rows)
        if xi.get("por_periodo"):
            pr = [[esc(p.get("periodo", "")), mxn(p.get("provision")), mxn(p.get("pago")), mxn(p.get("dif"))]
                  for p in xi["por_periodo"][:20]]
            contenido += '<h3>Provisión vs pago por periodo</h3>' + tabla(["Periodo", "Provisión", "Pago", "Dif."], pr)
        parts.append(card("XI", xi["titulo"], contenido))

    # ---------- XII ----------
    if "XII" in S:
        xii = S["XII"]
        rows = [[esc(f["periodo"]), num(f["headcount"]), num(f.get("altas")), num(f.get("bajas"))] for f in xii["semanal"]]
        sub = (f'Headcount final: semanal <b>{num(xii.get("headcount_final_sem"))}</b> · '
               f'catorcenal <b>{num(xii.get("headcount_final_cat"))}</b>')
        parts.append(card("XII", xii["titulo"],
            tabla(["Periodo", "Headcount", "Altas", "Bajas"], rows) + f'<p class="note">{sub}</p>'))

    # ---------- XIII ----------
    if "XIII" in S:
        xiii = S["XIII"]
        acc = "".join(f"<li>{esc(a)}</li>" for a in xiii["acciones"])
        parts.append(card("XIII", xiii["titulo"], f"<ul>{acc}</ul>"))

    if inf.pendientes:
        pend = "".join(f"<li>{esc(p)}</li>" for p in inf.pendientes)
        parts.append(card("⏳", "Pendientes de insumo", f"<ul>{pend}</ul>"))

    body = "\n".join(parts)
    return HTML.replace("{{TITLE}}", esc(f"Informe {m['cliente']} — {m.get('periodo')}")).replace("{{BODY}}", body)


HTML = """<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{TITLE}}</title>
<style>
:root{--navy:#0f2740;--navy2:#1b3a5b;--accent:#2563eb;--ink:#1f2937;--muted:#6b7280;--line:#e5e7eb;--bg:#f4f6f9}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:1040px;margin:0 auto;padding:24px}
.cover{background:linear-gradient(135deg,var(--navy),var(--navy2));color:#fff;border-radius:16px;padding:38px 40px;margin-bottom:22px;box-shadow:0 10px 30px rgba(15,39,64,.25)}
.cover-tag{font-size:12px;letter-spacing:3px;opacity:.8;font-weight:600}
.cover h1{margin:8px 0 6px;font-size:30px;font-weight:800;letter-spacing:-.5px}
.cover-sub{font-size:16px;opacity:.95;font-weight:600}
.cover-meta{margin-top:12px;font-size:12px;opacity:.7}
.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:22px}
.kpi{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px;text-align:center;box-shadow:0 1px 2px rgba(0,0,0,.03)}
.kpi-val{font-size:19px;font-weight:800;color:var(--navy);font-variant-numeric:tabular-nums}
.kpi-lbl{font-size:11px;color:var(--muted);margin-top:4px;text-transform:uppercase;letter-spacing:.5px;font-weight:600}
.kpi-sub{font-size:10px;color:var(--muted);margin-top:2px}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:22px 24px;margin-bottom:18px;box-shadow:0 1px 3px rgba(0,0,0,.04);break-inside:avoid}
.card h2{margin:0 0 14px;font-size:17px;color:var(--navy);display:flex;align-items:center;gap:10px;border-bottom:2px solid var(--line);padding-bottom:10px}
.card h3{font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin:16px 0 6px}
.badge{display:inline-flex;min-width:30px;height:26px;padding:0 8px;align-items:center;justify-content:center;background:var(--accent);color:#fff;border-radius:7px;font-size:13px;font-weight:800}
table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
th{background:#f8fafc;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.4px;padding:8px 10px;border-bottom:2px solid var(--line)}
td{padding:7px 10px;border-bottom:1px solid #f1f3f5}
tr:hover td{background:#fafbfc}
tr.total td{font-weight:800;background:#f0f5fb;border-top:2px solid var(--navy);color:var(--navy)}
.hallazgo{padding:9px 12px;margin:6px 0;border-radius:6px;font-size:13px}
.hallazgo .sev{font-weight:800;font-size:11px}
.hallazgo .sec{color:var(--muted);font-weight:600;font-size:12px}
.note{font-size:12px;color:var(--muted);margin:10px 0 0}
ul{margin:6px 0;padding-left:20px}li{margin:4px 0}
.foot{text-align:center;color:var(--muted);font-size:11px;margin:24px 0}
@media print{body{background:#fff}.wrap{max-width:none;padding:0}.card,.kpi{box-shadow:none}.cover{box-shadow:none}}
@media(max-width:820px){.kpis{grid-template-columns:repeat(2,1fr)}}
</style></head><body><div class="wrap">
{{BODY}}
<div class="foot">Informe generado por el motor determinista HRM · cifras validadas al centavo · uso interno / supervisión</div>
</div></body></html>"""


def main():
    cual = sys.argv[1] if len(sys.argv) > 1 else "enero"
    cfg = CONFIGS[cual]
    inf = generar_informe(cfg)
    fecha = datetime.date.today().strftime("%d/%m/%Y")
    html = render(inf, fecha)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"informe_{cual}2026.html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"✅ {path}  ({len(html)//1024} KB)  secciones: {', '.join(inf.meta['secciones_generadas'])}  hallazgos: {len(inf.hallazgos)}")


if __name__ == "__main__":
    main()
