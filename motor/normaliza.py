"""Núcleo de normalización y coerción determinista (spec §5.3.0).

Principios innegociables (§5.1):
- Todo importe se maneja como ENTERO DE CENTAVOS (Math.round(valor*100)).
- La aritmética de dinero es siempre en enteros; solo se formatea a 2 decimales
  para mostrar. Esto elimina el float-drift y permite cuadrar "al centavo".
- La IA nunca toca aritmética. Todo aquí es determinista y probado.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import datetime, date


class CoercionError(ValueError):
    """Error explícito de coerción: (columna, fila, valor) cuando aplique."""


# --------------------------------------------------------------------------- #
# Texto / encabezados                                                         #
# --------------------------------------------------------------------------- #
_WS = re.compile(r"\s+")
_EDGE_PUNCT = re.compile(r"^[\s\.\,\;\:\-_/]+|[\s\.\,\;\:\-_/]+$")


def normalizar_clave(s) -> str:
    """`normalizarClave(s)` del spec.
    trim -> colapsar espacios -> UPPER -> quitar acentos -> quitar puntuación de borde.
    Ej.: ' Total  Percepciones ' -> 'TOTAL PERCEPCIONES'; 'Catorcena 03' -> 'CATORCENA 03'.
    """
    if s is None:
        return ""
    s = str(s).strip()
    s = _WS.sub(" ", s)
    s = s.upper()
    # quitar acentos (NFD + remover diacríticos)
    s = "".join(c for c in unicodedata.normalize("NFD", s)
                if unicodedata.category(c) != "Mn")
    s = _EDGE_PUNCT.sub("", s)
    return s


# --------------------------------------------------------------------------- #
# Números / importes -> centavos                                              #
# --------------------------------------------------------------------------- #
_VACIOS = {"", "-", "—", "–", "N/A", "NA", "NULL", "NONE", "#N/A", "#REF!", "#VALUE!"}


def a_centavos(v) -> int:
    """`aCentavos(v)` del spec. Robusto a formato mexicano y a basura.
    Devuelve un ENTERO de centavos. Lanza CoercionError si no es coercible.
    """
    # número directo
    if isinstance(v, bool):
        # bool es subclase de int; tratar como 0/1 sería peligroso -> error
        raise CoercionError(f"valor booleano no es importe: {v!r}")
    if isinstance(v, int):
        return v * 100
    if isinstance(v, float):
        return round(v * 100)

    s = str(v).strip()
    if s.upper() in _VACIOS:
        return 0

    negativo = False
    # (1,234.50) = -1234.50
    if s.startswith("(") and s.endswith(")"):
        negativo = True
        s = s[1:-1].strip()
    # 1234.50-  = -1234.50
    if s.endswith("-"):
        negativo = True
        s = s[:-1].strip()
    if s.startswith("-"):
        negativo = not negativo
        s = s[1:].strip()

    s = re.sub(r"[$\s ]", "", s)   # quita $, espacios y NBSP
    s = s.replace(",", "")              # formato MX: coma=miles, punto=decimal

    if s in ("", "."):
        return 0
    try:
        n = float(s)
    except ValueError:
        raise CoercionError(f"no coercible a importe: {v!r}")
    c = round(n * 100)
    return -c if negativo else c


def centavos_a_mxn(c: int) -> str:
    """Formatea centavos a string es-MX con separador de miles y 2 decimales."""
    signo = "-" if c < 0 else ""
    c = abs(int(c))
    pesos, cent = divmod(c, 100)
    return f"{signo}{pesos:,}.{cent:02d}"


# --------------------------------------------------------------------------- #
# Fechas -> ISO                                                               #
# --------------------------------------------------------------------------- #
_EXCEL_EPOCH = date(1899, 12, 30)  # Excel serial base (con el bug de 1900)


def a_iso(v):
    """`aISO(v)` del spec. Devuelve 'YYYY-MM-DD' o lanza CoercionError."""
    if v is None or (isinstance(v, str) and v.strip() == ""):
        return None
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        # serial Excel
        from datetime import timedelta
        return (_EXCEL_EPOCH + timedelta(days=int(v))).isoformat()
    s = str(v).strip()
    # ISO ya (YYYY-MM-DD [HH:MM:SS])
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    # dd/mm/yyyy (convención MX)
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", s)
    if m:
        d, mth, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return date(y, mth, d).isoformat()
    raise CoercionError(f"fecha no reconocida: {v!r}")


# --------------------------------------------------------------------------- #
# RFC                                                                          #
# --------------------------------------------------------------------------- #
_RFC_RE = re.compile(r"^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$")


def normalizar_rfc(s):
    """`normalizarRFC(s)`: trim + upper; valida patrón. Devuelve (rfc, valido)."""
    if s is None:
        return "", False
    rfc = str(s).strip().upper()
    return rfc, bool(_RFC_RE.match(rfc))


# --------------------------------------------------------------------------- #
# Reglas de fila                                                               #
# --------------------------------------------------------------------------- #
_TOTAL_LABELS = {"TOTAL", "SUMA", "TOTALES", "GRAN TOTAL", "SUBTOTAL"}


def es_fila_total(clave_norm: str) -> bool:
    """True si la etiqueta de la columna llave indica subtotal/total."""
    return clave_norm in _TOTAL_LABELS
