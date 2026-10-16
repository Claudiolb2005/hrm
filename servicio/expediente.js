// servicio/expediente.js — Expediente de defensa y retención (N6) e inventario de datos (N7.3).
//
// Dos cosas que no se tratan igual:
//   · Papeles de trabajo del sistema (cálculos, ejecuciones, diferencias, hallazgos, dictámenes, bitácoras):
//     se conservan siempre. La base ya impide borrarlos.
//   · Archivos fuente del cliente (prenómina, XML, maestro, lo que sube al requerimiento): hasta cinco años
//     después de la presentación de la última declaración del ejercicio dictaminado (la anual de personas
//     morales vence el 31 de marzo del año siguiente; CFF art. 67), o lo que pida el contrato si es mayor.

/** Fecha hasta la que se conservan los archivos fuente de un ejercicio. */
export function conservarHasta(ejercicio, contratoHasta = null) {
  const legal = (Number(ejercicio) + 6) + '-03-31';
  return contratoHasta && contratoHasta > legal ? contratoHasta : legal;
}

/** Categoría de un archivo por su ruta en R2. */
export function categoriaDe(key) {
  if (/\/fuentes\//.test(key)) return 'prenomina';
  if (/\/cfdi\//.test(key)) return 'xml_y_metadata';
  if (/\/maestro\//.test(key)) return 'maestro_empleados';
  if (/\/pbc\//.test(key)) return 'entregado_por_el_cliente';
  if (/^ingestas\//.test(key)) return 'renglones_canonicos';
  return 'otro';
}

/** Metadatos que viajan con cada archivo fuente en R2: de qué encargo es y hasta cuándo se guarda. */
export async function metadatosFuente(db, encargo_id, categoria) {
  const e = await db.prepare('SELECT ejercicio, retencion_contrato_hasta FROM encargo WHERE id = ?1').bind(encargo_id).first();
  return { encargo_id: String(encargo_id), categoria, conservar_hasta: e ? conservarHasta(e.ejercicio, e.retencion_contrato_hasta) : '' };
}

/** Inventario de datos personales que trata el sistema (N7.3): qué, dónde y por cuánto tiempo. */
export const INVENTARIO = [
  { categoria: 'Identificadores del trabajador', datos: 'Número de empleado, RFC', donde: 'D1 (movimientos, cruces, maestro) y R2 (renglones canónicos)', plazo: 'Papeles de trabajo: permanente; archivos: plazo de retención' },
  { categoria: 'Percepciones y deducciones', datos: 'Importes por concepto, ISR, cuotas, neto', donde: 'D1 (cálculos, movimientos) y R2 (renglones canónicos)', plazo: 'Permanente (sostienen el dictamen)' },
  { categoria: 'Comprobantes fiscales', datos: 'UUID, RFC emisor y receptor, registro patronal, fechas, totales', donde: 'D1 (comprobante); el XML original en R2', plazo: 'Archivo: plazo de retención; extracto: permanente' },
  { categoria: 'Afiliación', datos: 'Fechas de alta, baja y baja IMSS; grupo de nómina', donde: 'D1 (colaborador_maestro)', plazo: 'Permanente' },
  { categoria: 'No se guardan', datos: 'Nombres, CURP, NSS, domicilio, cuentas bancarias, correo, teléfono (N7: minimización)', donde: '—', plazo: '—' },
];
