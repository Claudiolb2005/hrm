"""Ensamblador del Informe de Supervisión de Nóminas de 13 secciones (spec §5.8/§5.9).

Orquesta el motor determinista: carga los insumos, corre los parsers y las
conciliaciones, y arma las 13 secciones en un solo objeto `Informe` serializable
(JSON) que el portal (fase 2) renderiza.

Principios (spec §5.1):
- No fabricación: si dos fuentes no cuadran → hallazgo, nunca se ajusta.
- Determinismo total: todo en centavos enteros; la IA no toca aritmética.
- Fail-closed pero graceful (§5.9): sin ACUMULADO no hay informe; si falta otro
  insumo, se generan las secciones que se puedan y las demás quedan como PENDIENTE.
- Idempotencia: misma entrada → mismo informe (sin relojes ni azar aquí).

Multi-cliente: el `config` trae las rutas de los 4 insumos y los parámetros del
cliente/periodo; los catálogos de columnas/cuentas viven en `conceptos_prime` y
`contabilidad` (sustituibles por cliente).
"""
from __future__ import annotations

from dataclasses import dataclass, field

from . import secciones as S
from .acumulado import parse_acumulado
from .cfdi import parse_cfdi
from .concilia import conciliar_r1, conciliar_r6, TOL_SUMA
from .maestro import parse_resumen, parse_bases
from .contabilidad import (
    parse_contabilidad, parse_provision_periodos, parse_resumen_conciliacion,
)

VERSION_MOTOR = "1.0"
ORDEN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII"]


@dataclass
class Informe:
    meta: dict
    secciones: dict = field(default_factory=dict)   # "I".."XIII" -> dict de sección
    hallazgos: list = field(default_factory=list)   # tablero global consolidado
    pendientes: list = field(default_factory=list)  # secciones/datos no generables

    def to_dict(self):
        return {"meta": self.meta,
                "secciones": {k: self.secciones.get(k) for k in ORDEN if k in self.secciones},
                "hallazgos": self.hallazgos, "pendientes": self.pendientes}


def _hallazgo(tipo, seccion, severidad, detalle, monto=None):
    h = {"tipo": tipo, "seccion": seccion, "severidad": severidad, "detalle": detalle}
    if monto is not None:
        h["monto"] = monto
    return h


def generar_informe(config: dict) -> Informe:
    """`config`:
        acumulado      (str, requerido)  ruta del ACUMULADO
        maestro        (str)             ruta del MAESTRO (RESUMEN/BASES) → V/VI/IX/X
        cfdi           (str)             ruta del CFDI → II/III (R1/R6)
        contabilidad   (str)             ruta de CONTABILIDAD → XI (dispersión)
        mes_pago       (str 'YYYY-MM')   filtro de fecha de pago del CFDI
        empresa_id     (str)             cliente (plantilla de columnas), default 'PRIME'
        cliente        (str)             nombre para la portada
        periodo_label  (str)             p.ej. 'Enero 2026'
        sat_isr        (int centavos)    ISR del visor SAT (Sec VII), si se tiene
        hoja_provision / hoja_resumen    overrides de hojas del acumulado
    """
    empresa_id = config.get("empresa_id", "PRIME")
    meta = {
        "cliente": config.get("cliente", empresa_id),
        "empresa_id": empresa_id,
        "periodo": config.get("periodo_label"),
        "version_motor": VERSION_MOTOR,
        "insumos": {k: config.get(k) for k in
                    ("acumulado", "maestro", "cfdi", "contabilidad") if config.get(k)},
    }
    inf = Informe(meta=meta)

    # ---- insumo 1: ACUMULADO (requerido) ----
    acum = parse_acumulado(config["acumulado"], empresa_id=empresa_id)
    meta["empleados_mes"] = acum.meta["empleados_unicos_mes"]
    meta["periodos"] = list(acum.periodos.keys())
    neto_nomina = acum.total.comprobacion_neto      # perc − ded (neto de conciliación)

    # hallazgos del propio ACUMULADO (control de fila §5.3.3)
    control = [h for h in acum.hallazgos if h.get("tipo") == "control_fila"]
    if control:
        inf.hallazgos.append(_hallazgo(
            "control_fila", "IV", "alta",
            f"{len(control)} fila(s) donde percepciones − despensa − deducciones ≠ neto",
            monto=sum(abs(h.get("descuadre", 0)) for h in control)))

    # ---- insumo 2: MAESTRO (RESUMEN/BASES) ----
    resumen = bases = None
    if config.get("maestro"):
        try:
            resumen = parse_resumen(config["maestro"])
            bases = parse_bases(config["maestro"])
        except Exception as e:                       # noqa: BLE001 (se expone como pendiente)
            inf.pendientes.append(f"MAESTRO ilegible ({e}); Sec V/VI/IX/X afectadas")
    else:
        inf.pendientes.append("MAESTRO no proporcionado; Sec VI/IX/X (por estado/RP) no se generan")

    # ---- insumo 3: CFDI → conciliación R1/R6 ----
    cfdi = r1 = r6 = None
    if config.get("cfdi"):
        cfdi = parse_cfdi(config["cfdi"], mes_pago=config.get("mes_pago"))
        r1 = conciliar_r1(acum.por_rfc, cfdi.por_rfc)
        r6 = conciliar_r6(acum.por_rfc, cfdi.por_rfc)
    else:
        inf.pendientes.append("CFDI no proporcionado; Sec II/III (conciliación timbrado) parciales")

    # ---- insumo 4: CONTABILIDAD → dispersión (Sec XI) ----
    contab = None
    if config.get("contabilidad"):
        try:
            contab = parse_contabilidad(config["contabilidad"])
        except Exception as e:                       # noqa: BLE001
            inf.pendientes.append(f"CONTABILIDAD ilegible ({e}); Sec XI parcial")
    else:
        inf.pendientes.append("CONTABILIDAD no proporcionada; Sec XI (dispersión) parcial")

    # papel de conciliación por periodo (del propio ACUMULADO) → Sec III y XI variación
    concil_periodo = {}
    prov_periodos = None
    try:
        concil_periodo = parse_resumen_conciliacion(
            config["acumulado"], hoja=config.get("hoja_resumen", "resumen"))
    except Exception:                                # noqa: BLE001
        pass
    try:
        prov_periodos = parse_provision_periodos(
            config["acumulado"], hoja=config.get("hoja_provision", "Hoja1"))
    except Exception:                                # noqa: BLE001
        pass

    sec = inf.secciones
    cfdi_total = r1.cfdi_total if r1 else None
    dispersado = contab.dispersado if contab else None

    # ======================= ENSAMBLE DE LAS 13 SECCIONES =======================
    sec["I"] = S.seccion_i_integracion(acum.total)
    sec["II"] = S.seccion_ii_importes(neto_nomina, cfdi_total, dispersado)
    if concil_periodo:
        sec["III"] = S.seccion_iii_situaciones(concil_periodo)
    else:
        inf.pendientes.append("Sec III: falta el papel de conciliación por periodo "
                              "(hoja 'resumen' del acumulado o mapeo CFDI→periodo)")
    sec["IV"] = S.seccion_iv_concentrado(acum.periodos)
    sec["V"] = S.seccion_v_por_puesto(acum.por_puesto)
    if bases is not None:
        sec["VI"] = S.seccion_vi_por_estado(acum.por_rp, bases)
        sec["IX"] = S.seccion_ix_imss_rcv_rp(acum.por_rp, bases)
    sec["VII"] = S.seccion_vii_impuestos_sat(acum.periodos, sat_isr=config.get("sat_isr"))
    sec["VIII"] = S.seccion_viii_contribuciones(acum.periodos)
    if resumen is not None:
        sec["X"] = S.seccion_x_isn(resumen, bases)
    if contab is not None:
        sec["XI"] = S.seccion_xi_provision(acum.total.neto, contab, prov_periodos)
    sec["XII"] = S.seccion_xii_tendencias(acum.periodos)

    # ---- tablero de hallazgos consolidado (no fabricación §5.1) ----
    if r1 and not r1.dentro_tol_suma:
        inf.hallazgos.append(_hallazgo(
            "conciliacion_cfdi", "II", "alta",
            f"Nómina vs CFDI fuera de tolerancia de suma "
            f"({r1.empleados_dif} empleado(s) fuera de ±$0.50)", monto=r1.diferencia))
    if r6:
        if r6.solo_acumulado:
            inf.hallazgos.append(_hallazgo(
                "cfdi_faltante", "II", "media",
                f"{len(r6.solo_acumulado)} empleado(s) con nómina pero SIN CFDI "
                f"(timbrado pendiente)"))
        if r6.solo_cfdi:
            inf.hallazgos.append(_hallazgo(
                "cfdi_extra", "II", "media",
                f"{len(r6.solo_cfdi)} CFDI sin nómina asociada (revisar)"))
    if cfdi and cfdi.meta.get("duplicados_excluidos"):
        inf.hallazgos.append(_hallazgo(
            "cfdi_duplicados", "VII", "baja",
            f"{cfdi.meta['duplicados_excluidos']} timbre(s) duplicado(s) excluidos del SAT"))
    if "X" in sec and sec["X"].get("discrepancias_tasa"):
        d = sec["X"]["discrepancias_tasa"]
        inf.hallazgos.append(_hallazgo(
            "isn_tasa", "X", "alta",
            f"{len(d)} estado(s) con tasa ISN del RESUMEN ≠ tasa autoritativa (BASES)"))
    if "XI" in sec and not sec["XI"].get("cuadra", True):
        inf.hallazgos.append(_hallazgo(
            "dispersion", "XI", "alta",
            "Neto de nómina vs dispersado (contabilidad) no cuadra",
            monto=sec["XI"].get("diferencia")))

    # ---- XIII con los hallazgos del mes ----
    sec["XIII"] = S.seccion_xiii_acciones(hallazgos=inf.hallazgos)

    meta["secciones_generadas"] = [k for k in ORDEN if k in sec]
    meta["n_hallazgos"] = len(inf.hallazgos)
    return inf
