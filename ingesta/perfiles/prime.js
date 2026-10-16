// perfiles/prime.js — Perfil de mapeo declarativo de PrimeWireless (módulo 6).
//
// Un perfil dice QUÉ significa cada columna del archivo del cliente; no calcula nada.
// Encabezados tomados de los archivos reales de PRIME (acumulado ene/abr-2026, 91 columnas;
// «Nomina Cliente» SEM 26, 74 columnas). Se comparan por clave normalizada (sin acentos,
// mayúsculas, espacios colapsados). Una columna de percepción que no esté aquí no se
// adivina: queda como «concepto no catalogado» y limita el ISR del renglón que la traiga.
//
// Tipos de concepto:
//   percepcion   entra a la base de ISR; `concepto` es la clave del kernel (EXENCION:<concepto>
//                si tiene exención; si no, grava al 100%) y la del cuadro de ISN.
//   otro_pago    otro pago del CFDI (no es ingreso gravable): subsidio entregado, ISR ajustado.
//   no_ingreso   devolución de un descuento: no es ingreso.
//   opaco        naturaleza por confirmar (P2): limita el ISR del renglón si trae importe.
//   separacion   indemnización/liquidación/prima de antigüedad: sin regla de ISR en v1
//                (LISR 95); el renglón queda limitado.
//   ptu          sin regla de ISR en v1; el renglón queda limitado.

export default {
  id: 'prime',
  version: '2026-10-15',
  empresa: 'PRIMEWIRELESS HOLDINGS (PHO190128QD8)',

  // Hoja: la que más renglones × columnas tenga (el acumulado trae hojas auxiliares).
  hoja: 'mayor',
  encabezado: { buscar_en_primeros: 12, minimo_coincidencias: 6 },

  columnas: {
    corrida:        ['SEMANA / CATORCENA', 'NO. PROCESO', 'NO. PERIODO', 'NO. SEMANAL'],
    colaborador:    ['NO.', 'NO', 'NUM EMPLEADO', 'NUMERO DE EMPLEADO', 'NO. EMPLEADO'],
    rfc:            ['RFC'],
    registro:       ['REGISTRO PATRONAL'],
    sd:             ['SD', 'SALARIO DIARIO'],
    sbc:            ['SBC'],
    fecha_ingreso:  ['FECHA DE INGRESO'],
    dias:           ['DIAS TRABAJADOS'],
    domingos:       ['DOMINGOS', 'DOMINGOS TRABAJADOS'],
    total_percepciones: ['TOTAL PERCEPCIONES'],
    total_deducciones:  ['TOTAL DEDUCCIONES'],
    neto:               ['NETO SUELDO FISCAL'],
  },
  requeridas: ['corrida', 'colaborador', 'total_percepciones'],

  // Bloque de percepciones: de la primera columna de concepto a TOTAL PERCEPCIONES.
  bloque_percepciones: { desde: 'SUELDO', hasta: 'TOTAL PERCEPCIONES' },

  conceptos: [
    { encabezado: 'Sueldo',                        tipo: 'percepcion', concepto: 'sueldo' },
    { encabezado: 'Despensa(Informativo)',         tipo: 'percepcion', concepto: 'vales_despensa', nota: 'C3: PRIME ya no paga vales; agosto en ceros' },
    // «Vacaciones» aparece dos veces: días (incidencia) y monto. El monto es la segunda.
    { encabezado: 'Vacaciones', ocurrencia: 'ultima', tipo: 'percepcion', concepto: 'vacaciones' },
    { encabezado: 'Prima vacacional',              tipo: 'percepcion', concepto: 'prima_vacacional' },
    { encabezado: 'reintegro_de_isr_pagado_en_exceso (MONTO)', tipo: 'otro_pago' },
    { encabezado: 'Aguinaldo',                     tipo: 'percepcion', concepto: 'aguinaldo' },
    { encabezado: 'Gratificación',                 tipo: 'percepcion', concepto: 'gratificacion' },
    { encabezado: 'Indemnización',                 tipo: 'separacion', concepto: 'indemnizacion' },
    { encabezado: 'Prima de antigüedad',           tipo: 'separacion', concepto: 'prima_antiguedad' },
    { encabezado: 'Liquidacion',                   tipo: 'separacion', concepto: 'liquidacion' },
    { encabezado: 'PTU',                           tipo: 'ptu',        concepto: 'ptu' },
    { encabezado: 'Bono',                          tipo: 'percepcion', concepto: 'bono' },
    { encabezado: 'Prestamo Empleados',            tipo: 'opaco',      concepto: 'prestamo_empleados', nota: 'Préstamo pagado vía nómina: confirmar que no es ingreso' },
    { encabezado: 'Fondo ahorro empresa',          tipo: 'percepcion', concepto: 'fondo_ahorro_empresa', nota: 'P2: no cumple requisitos → grava (hallazgo 5)' },
    { encabezado: 'Comisiones',                    tipo: 'percepcion', concepto: 'comisiones' },
    { encabezado: 'Prima dominical',               tipo: 'percepcion', concepto: 'prima_dominical' },
    { encabezado: 'Día festivo',                   tipo: 'percepcion', concepto: 'dia_festivo' },
    { encabezado: 'Día descanso',                  tipo: 'percepcion', concepto: 'dia_descanso' },
    { encabezado: 'Devolucion Infonavit',          tipo: 'no_ingreso' },
    { encabezado: 'devolucion fonacot',            tipo: 'no_ingreso' },
    { encabezado: 'Devolucion descuento improcedente', tipo: 'no_ingreso' },
    { encabezado: 'subsidios por incapacidad',     tipo: 'percepcion', concepto: 'subsidio_incapacidad' },
    { encabezado: 'Retroactivo',                   tipo: 'percepcion', concepto: 'retroactivo' },
    { encabezado: 'Ajuste de sueldo',              tipo: 'percepcion', concepto: 'ajuste_sueldo' },
    { encabezado: 'incentivos (MONTO)',            tipo: 'percepcion', concepto: 'incentivos' },
    { encabezado: 'Incentivo',                     tipo: 'percepcion', concepto: 'incentivos' },
    { encabezado: 'isr_ajustado_por_subsidio (MONTO)', tipo: 'otro_pago' },
    { encabezado: 'Subsidio al Empleo (sp)',       tipo: 'otro_pago' },
    { encabezado: 'Cancelaciones Prematuras',      tipo: 'opaco', nota: 'P2' },
    { encabezado: 'Pago anticipado a neto',        tipo: 'opaco', nota: 'P2' },
  ],

  // Lado «cliente» de la resta: lo que calculó la nómina actual, por rubro.
  // Varias columnas se suman (familias): no sumarlas fue el bug histórico.
  movimientos: {
    isr:           ['I.S.R. (sp)', 'ISR Nómina', 'ISR AJUSTE'],
    isr_separacion:['ISR FINIQUITO', 'ISR Liquidacion'],
    imss_obrera:   ['I.M.S.S.'],
    ceav_obrera:   ['rcv (MONTO)'],
    imss_patronal: ['Imss'],
    rcv_patronal:  ['RCV'],
    infonavit:     ['Infonavit empresa'],
    isn:           ['Impuesto estatal'],          // se agrega por registro patronal y mes
  },

  // «SEM 31» → corrida SEM31 semanal; «CAT 16» → CAT16 catorcenal. Otro texto = corrida extra.
  corridas: [
    { patron: '^SEM(?:ANA)?\\s*0*(\\d+)$', id: 'SEM$1', periodicidad: 'semanal', ordinaria: true },
    { patron: '^CAT(?:ORCENA)?\\s*0*(\\d+)$', id: 'CAT$1', periodicidad: 'catorcenal', ordinaria: true },
  ],

  perfil_fiscal: {
    fondo_ahorro_cumple_requisitos: false,   // P2 resuelto: no cumple (hallazgo 5)
    aplica_ajuste_mensual: true,             // semana 34 y catorcena 17 ajustan con tarifa mensual
  },
};
