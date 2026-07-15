"""Conciliación R1 (Acumulado vs CFDI) y R6 (cobertura) — spec §5.7 + v6.

R1  Acumulado NETO/periodo  vs  CFDI: Σperc + Σotros − Σded   (Sec II)
R6  RFCs del acumulado      vs  RFCs del CFDI  → faltantes / extra (Sec III/VII)

Tolerancias v6 §5.7: ≤ $0.50 por empleado (50 centavos), ≤ $5.00 por periodo/suma.
Todo en centavos enteros. Diferencia > tolerancia → hallazgo (no se oculta).
"""
from __future__ import annotations

from dataclasses import dataclass, field

TOL_EMPLEADO = 50    # 50 centavos
TOL_SUMA = 500       # 500 centavos ($5.00)


@dataclass
class ResultadoR1:
    acum_total: int
    cfdi_total: int
    diferencia: int
    dentro_tol_suma: bool
    empleados_ok: int
    empleados_dif: int
    top_difs: list = field(default_factory=list)   # (rfc, acum, cfdi, dif)


@dataclass
class ResultadoR6:
    en_ambos: int
    solo_acumulado: list      # RFCs con nómina pero sin CFDI
    solo_cfdi: list           # RFCs con CFDI pero sin nómina


def conciliar_r1(acum_por_rfc, cfdi_por_rfc, tol_emp=TOL_EMPLEADO):
    """Compara neto de conciliación por RFC. acum: {rfc:{neto_concil}}; cfdi: {rfc:Agregado}."""
    acum_total = sum(v["neto_concil"] for v in acum_por_rfc.values())
    cfdi_total = sum(v.neto for v in cfdi_por_rfc.values())
    ok = dif = 0
    difs = []
    for rfc in set(acum_por_rfc) | set(cfdi_por_rfc):
        a = acum_por_rfc.get(rfc, {}).get("neto_concil", 0) if rfc in acum_por_rfc else 0
        c = cfdi_por_rfc[rfc].neto if rfc in cfdi_por_rfc else 0
        if abs(a - c) <= tol_emp:
            ok += 1
        else:
            dif += 1
            difs.append((rfc, a, c, a - c))
    difs.sort(key=lambda x: -abs(x[3]))
    return ResultadoR1(
        acum_total, cfdi_total, acum_total - cfdi_total,
        abs(acum_total - cfdi_total) <= TOL_SUMA, ok, dif, difs[:15],
    )


def conciliar_r6(acum_por_rfc, cfdi_por_rfc):
    a = set(k for k in acum_por_rfc if k)
    c = set(k for k in cfdi_por_rfc if k)
    return ResultadoR6(
        en_ambos=len(a & c),
        solo_acumulado=sorted(a - c),
        solo_cfdi=sorted(c - a),
    )
