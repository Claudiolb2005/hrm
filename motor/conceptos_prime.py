"""Plantilla de mapeo de columnas para el ACUMULADO de PRIMEWIRELESS (§5.3.2 paso 1).

Estas son las cabeceras EXACTAS del archivo real de PRIME (perfiladas del
'ACUMULADO ENERO 2026.xlsx', hoja 'Hoja1', 91 columnas). El motor mapea por
CLAVE NORMALIZADA (normalizar_clave) contra estas variantes, así que es robusto
a mayúsculas/acentos/espacios. Un cliente nuevo tendrá su propia plantilla.

Regla de negocio central (confirma el doc DATOS ERRONEOS): ISR, INFONAVIT y
FONACOT NO son una sola columna: son FAMILIAS de columnas que se SUMAN. No
sumarlas = el bug histórico ("el ISR no suma todos los conceptos").
"""

# canónico -> cabecera exacta del archivo PRIME (match por clave normalizada).
# El valor puede ser una cadena o una LISTA de variantes equivalentes (el mapeo
# usa la primera que aparezca en el archivo). Esto absorbe que PRIME renombre
# columnas entre entregas: p.ej. la llave de periodo fue "SEMANA / CATORCENA"
# en el ACUMULADO de enero-2026 y "NO. PROCESO" en el de abril-2026.
PLANTILLA_ACUMULADO = {
    # --- identidad / llave ---
    "periodo":            ["SEMANA / CATORCENA", "NO. PROCESO", "NO. PERIODO"],
    "empleado":           "Empleado",
    "puesto":             "Puesto",
    "registro_patronal":  "REGISTRO PATRONAL",
    "rfc":                "RFC",
    "nss":                "NSS",
    "sucursal":           "Sucursal",
    "fecha_ingreso":      "FECHA DE INGRESO",
    # --- totales de control (§5.6) ---
    "percepciones":       "TOTAL PERCEPCIONES",
    "deducciones":        "TOTAL DEDUCCIONES",
    "neto":               "NETO SUELDO FISCAL",
    # Despensa(Informativo): está DENTRO de TOTAL PERCEPCIONES pero NO va al neto
    # fiscal (§5.3.3). Identidad real: neto = percepciones - despensa - deducciones.
    "despensa_informativo": "Despensa(Informativo)",
    # --- deducciones obreras individuales ---
    "imss_obrero":        "I.M.S.S.",
    "rcv_obrero":         "rcv (MONTO)",
    # --- patronales (sección VIII) ---
    "imss_patronal":      "Imss",
    "rcv_patronal":       "RCV",
    "infonavit_patronal": "Infonavit empresa",
    "isn_informativo":    "Impuesto estatal",
    "prevision_social":   "TOTAL PREVISION SOCIAL",
}

# familias que se SUMAN a un total canónico (cabeceras exactas de PRIME)
FAMILIAS_ACUMULADO = {
    "isr": [
        "I.S.R. (sp)",
        "ISR Nómina",        # aparece en abril-2026 (no estaba en enero); $126,533 que
                             # el conteo previo omitía → el bug "ISR no suma todo".
        "ISR FINIQUITO",
        "ISR Liquidacion",
        "ISR AJUSTE",
        "ISR ajustado_por subsidio",
    ],
    "infonavit": [
        "Préstamo Infonavit",
        "Ajuste Infonavit",
        "Ajuste INFONAVIT mes anterior",
    ],
    "fonacot": [
        "Préstamo FONACOT",
        "Préstamo FONACOT1",
        "Préstamo FONACOT2",
        "Préstamo FONACOT3",
        "Prestamo FONACOT 4",
        "Ajuste Fonacot",
        "FONACOT MES ANTERIOR",
    ],
}

# --- Sec V: familias de puesto por tipo de nómina (catálogo PRIME, §10) ---
# La nómina SEMANAL es retail: se agrupa por PREFIJO de puesto; el resto -> OTROS.
FAMILIAS_PUESTO_SEM = [
    "EJECUTIVO DE VENTAS",   # incluye BACK UP / EXPANSION / MEDIO TIEMPO / OVER STAFF
    "GERENTE DE TIENDA",     # incluye CLUSTER / EXPANSION / CUBRE INC
    "GERENTE REGIONAL",      # todas las regiones
    "ASSISTANT MANAGER",
    "TECNICO DE SERVICIO",
    "EJECUTIVO CUBRE INC",
    "MONITORISTA",
]
# La nómina CATORCENAL es corporativa: familia por PALABRA CLAVE; el resto -> OTROS.
# El orden importa (primer match gana): dirección antes que gerencia, etc.
FAMILIAS_PUESTO_CAT = [
    ("PRESIDEN", "PRESIDENCIA"),   # PRESIDENTE, ASISTENTE PRESIDENCIA
    ("DIRECTOR", "DIRECTORES"),    # DIRECTOR / DIRECTORA / DIRECTOR REGIONAL
    ("GERENTE", "GERENTES"),       # GERENTE SR/JR/DE ...
    ("COORD", "COORDINADORES"),    # COORDINADOR / COORD ...
    ("ANALISTA", "ANALISTAS"),
]

# conceptos especiales (§5.3.3) — informativos, no cuentan al neto de dispersión
CONCEPTOS_INFORMATIVOS = ["Despensa(Informativo)"]

# canónicos mínimos requeridos para poder parsear (si falta uno -> ERROR)
REQUERIDAS = ["periodo", "percepciones", "deducciones", "neto", "rfc"]
