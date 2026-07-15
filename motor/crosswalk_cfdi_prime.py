"""Crosswalk concepto interno (ACUMULADO) → concepto CFDI/SAT, para PRIME.

Fuente autoritativa: `ref/correlacion-conceptos-ia-2026.xlsx`, hoja 'ACUM DE NOM'
(el doc "CORRELACIÓN DE CONCEPTOS IA 2026 (1)"). Es la comparación PHO (CFDI) vs
ACUMULADO que menciona el spec v6 como "columnas marrón" embebidas. El archivo es
una PLANTILLA: el mapeo vive en el ENCABEZADO (cada concepto interno va seguido de
su columna CFDI); las filas de datos van vacías.

Uso: sembrar el `mapa_conceptos` del cliente y clasificar cada concepto interno en
su bucket CFDI para la conciliación R1 (nómina vs CFDI) y las secciones I/VII.
Códigos SAT: percepciones (0xx tipo 1) y deducciones (0xx tipo 2) del catálogo nómina.
"""

# concepto interno (cabecera exacta ACUMULADO) -> etiqueta CFDI/SAT del crosswalk
CROSSWALK_CFDI = {
    # ---- percepciones ----
    "Sueldo":                         "001 Sueldo (Gravado)",
    "Despensa(Informativo)":          "029 Vales de despensa",   # informativo: lo paga 3ero
    "Vacaciones":                     "001 Sueldo",
    "Vacaciones pendientes":          "001 Sueldo",
    "Prima vacacional":               "021 Prima Vacacional",
    "Aguinaldo":                      "002 Aguinaldo",
    "Complemento de Aguinaldo":       "002 Aguinaldo",
    "Liquidacion":                    "025 Indemnizaciones",
    "Prima de antigüedad":            "022 Prima de Antigüedad",
    "PTU":                            "003 Utilidades/PTU",
    "Bono":                           "038 Otros Ingresos/Salarios",
    "incentivos (MONTO)":             "038 Otros Ingresos (Gravado)",
    "Prestamo Empleados":             "999 Pagos distintos (no sueldos)",
    "Fondo ahorro empresa":           "005 Fondo de Ahorro",
    "Comisiones":                     "028 Comisiones",
    "Prima dominical":                "020 Prima Dominical",
    "Día festivo":                    "Total Exento",
    "Día descanso":                   "Total Exento",
    "Devolucion Infonavit":           "Total otros pagos",
    "devolucion fonacot":             "Total otros pagos",
    "Devolucion descuento improcedente": "Total otros pagos",
    "Subsidio al Empleo (sp)":        "002 Subsidio al Empleo (otros pagos)",
    # ---- deducciones ----
    "I.S.R. (sp)":                    "002 ISR",
    "ISR FINIQUITO":                  "002 ISR",
    "ISR Liquidacion":                "002 ISR",
    "ISR AJUSTE":                     "002 ISR",
    "ISR ajustado_por subsidio":      "002 ISR",
    "I.M.S.S.":                       "001 Seguridad Social",
    "rcv (MONTO)":                    "003 Retiro/Cesantía/Vejez",
    "Préstamo Infonavit":             "009 Préstamos Fondo Nacional Vivienda",
    "Ajuste Infonavit":               "010 Pago Crédito Vivienda",
    "Ajuste INFONAVIT mes anterior":  "010 Pago Crédito Vivienda",
    "Préstamo FONACOT":               "011 Pago Abonos INFONACOT",
    "Fondo de ahorro Empleado":       "004 Otros",
    "Fondo de ahorro de Empresa":     "004 Otros",
    "Cancelaciones Prematuras":       "004 Otros",       # recuperación, no se paga
    "OTROS DESCUENTOS":               "004 Otros",
    "PENSION ALIMENTICIA":            "007 Pensión Alimenticia",
    "PENSION ALIMENCIA ADEUDO":       "007 Pensión Alimenticia",
    "seguro_vivienda (MONTO)":        "009 Préstamos Fondo Nacional Vivienda",
    "Pago anticipado a neto":         None,   # deducción interna SIN CFDI propio (v6 §5.3.3)
}

# Totales CFDI que el crosswalk pone lado a lado con los internos (para R1).
# En el ACUMULADO real de Enero-2026 estas columnas NO vienen; se obtienen del
# archivo CFDI (One Facture) parseado aparte.
TOTALES_CFDI = {
    "percepciones_cfdi": "Total percepciones",   # col [65] del crosswalk
    "otros_pagos_cfdi":  "Total otros pagos",     # se SUMA al neto CFDI (v6)
    "deducciones_cfdi":  "Total deducciones",     # col [108]
    "total_cfdi":        "Total",                 # col [112] (= neto CFDI)
}

# Regla de neto CFDI confirmada (v6 §5.3.5):
#   neto_cfdi = Total percepciones + Total otros pagos - Total deducciones
# NUNCA usar la columna "Total" directamente para conciliar percep/deduc.
