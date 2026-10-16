// reconciliacion.js — Nivel 3 de prueba (T1): kernel contra el proceso actual.
//
// No hay verdad previa: es un descubrimiento. Cada diferencia se clasifica en una
// de tres cubetas:
//   kernel_mal              el kernel estaba mal y se corrige
//   proceso_mal             el proceso actual estaba mal: es hallazgo
//   criterio_sin_resolver   decisión interpretativa; se asienta en la bitácora de criterios
// Criterio de aceptación: cero diferencias SIN CLASIFICAR (no cero diferencias).
//
// El hallazgo guarda dos referencias (movimiento del cliente y calculo_kernel); la
// diferencia se DERIVA al leer, nunca se guarda como número suelto (T2, decisión 2).

export const CUBETAS = ['kernel_mal', 'proceso_mal', 'criterio_sin_resolver'];

const llave = (x) => [x.colaborador_id, x.rubro, x.corrida_id || ''].join('|');

/**
 * @param {Array} calculos   renglones de calculo_kernel
 * @param {Array} cliente    [{ colaborador_id, rubro, corrida_id?, valor_c, movimiento_ref }]
 * @param {object} [op]      { tolerancia_c } — T4 sigue pendiente de ratificar; por omisión 0
 */
export function reconciliar(calculos, cliente, { tolerancia_c = 0 } = {}) {
  const mapaCli = new Map();
  for (const m of cliente) {
    const k = llave(m);
    if (mapaCli.has(k)) throw new Error('reconciliar: movimiento del cliente duplicado para ' + k);
    mapaCli.set(k, m);
  }
  const diferencias = [], sin_par_cliente = [], limitados = [];
  let coincidencias = 0, coincidencias_limitadas = 0;
  const usados = new Set();
  for (const c of calculos) {
    const k = llave(c);
    const m = mapaCli.get(k);
    if (!m) { sin_par_cliente.push(c.id); continue; }
    usados.add(k);
    // Sin cifra no hay resta: queda como limitado. Con cifra limitada sí se compara (es descubrimiento),
    // pero se marca: una coincidencia limitada nunca cuenta para «conforme».
    if (c.valor_calculado_c == null) { limitados.push({ calculo_kernel_id: c.id, movimiento_ref: m.movimiento_ref }); continue; }
    if (c.limitado) limitados.push({ calculo_kernel_id: c.id, movimiento_ref: m.movimiento_ref });
    const d = m.valor_c - c.valor_calculado_c;
    if (Math.abs(d) <= tolerancia_c) { if (c.limitado) coincidencias_limitadas += 1; else coincidencias += 1; continue; }
    diferencias.push({ calculo_kernel_id: c.id, movimiento_ref: m.movimiento_ref, colaborador_id: c.colaborador_id, rubro: c.rubro, corrida_id: c.corrida_id || null,
      kernel_c: c.valor_calculado_c, cliente_c: m.valor_c, diferencia_c: d, limitado: !!c.limitado, cubeta: null });
  }
  const sin_par_kernel = cliente.filter(m => !usados.has(llave(m))).map(m => m.movimiento_ref);
  return { coincidencias, coincidencias_limitadas, diferencias, limitados, sin_par_cliente, sin_par_kernel };
}

/** Clasifica una diferencia. Devuelve un objeto nuevo; no muta el original. */
export function clasificar(dif, cubeta, { motivo, quien, criterio_id = null, fecha }) {
  if (!CUBETAS.includes(cubeta)) throw new Error('Cubeta inválida: ' + cubeta);
  if (!motivo || !quien) throw new Error('Clasificar exige motivo y quién decidió');
  if (cubeta === 'criterio_sin_resolver' && !criterio_id) throw new Error('Una diferencia de criterio se asienta en la bitácora: falta criterio_id');
  return { ...dif, cubeta, motivo, quien, criterio_id, clasificado_en: fecha || new Date().toISOString() };
}

/** Criterio de aceptación del módulo 22: cero diferencias sin clasificar. */
export function aceptacion(diferencias) {
  const por_cubeta = Object.fromEntries(CUBETAS.map(c => [c, 0]));
  let sin_clasificar = 0;
  for (const d of diferencias) { if (d.cubeta) por_cubeta[d.cubeta] += 1; else sin_clasificar += 1; }
  return { aceptado: sin_clasificar === 0, sin_clasificar, por_cubeta };
}

/**
 * Estado de la prueba de una regla para el dictamen. Nunca da «conforme» sobre un
 * universo incompleto o con parámetros en nivel C.
 */
export function resultadoPrueba(resultadoRegla, rec) {
  if (resultadoRegla.estado === 'limitacion_alcance') return 'limitacion_alcance';
  const hayDif = rec.diferencias.length > 0 || rec.sin_par_kernel.length > 0 || rec.sin_par_cliente.length > 0;
  if (hayDif) return 'con_diferencias';
  if (resultadoRegla.estado === 'universo_parcial' || rec.limitados.length > 0) return 'universo_parcial';
  return 'conforme';
}
