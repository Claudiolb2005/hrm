// cruce.js — Cruce nómina ↔ CFDI por colaborador y corrida (módulo 4.2). Puro y determinista.
//
// La llave es el colaborador (número de empleado o RFC, según el encargo) y la corrida del
// calendario (D5: FechaFinalPago). Un colaborador con renglones en dos registros patronales
// en la misma corrida, o con dos CFDI vigentes, se suma por llave: el cruce es del pago, no del papel.
// Sólo se devuelve lo que no coincide; la coincidencia se cuenta.

export const RUBROS_CRUCE = ['percepciones', 'isr', 'neto'];
const DE_CFDI = { percepciones: 'total_percepciones_c', isr: 'isr_retenido_c', neto: 'total_c' };

/** «1073134#Y6079749104» (renglón separado por registro) → «1073134». */
export const llaveBase = (colaborador_id) => String(colaborador_id).split('#')[0];

/**
 * @param nomina [{ colaborador_llave, corrida_id, rubro, valor_c, movimiento_id }]
 * @param cfdis  [{ uuid, colaborador_llave, corrida_id, total_percepciones_c, isr_retenido_c, total_c }]
 */
export function cruzarNominaCfdi(nomina, cfdis, { rubros = RUBROS_CRUCE } = {}) {
  const k = (x) => x.colaborador_llave + '|' + x.corrida_id;
  const N = new Map(), F = new Map();
  for (const m of nomina) {
    if (!rubros.includes(m.rubro)) continue;
    const g = N.get(k(m)) || { colaborador_llave: m.colaborador_llave, corrida_id: m.corrida_id, valores: {}, movs: {} };
    g.valores[m.rubro] = (g.valores[m.rubro] || 0) + m.valor_c;
    g.movs[m.rubro] = g.movs[m.rubro] ? g.movs[m.rubro] + ',' + m.movimiento_id : m.movimiento_id;
    N.set(k(m), g);
  }
  for (const c of cfdis) {
    const g = F.get(k(c)) || { colaborador_llave: c.colaborador_llave, corrida_id: c.corrida_id, uuids: [], valores: Object.fromEntries(rubros.map(r => [r, 0])) };
    g.uuids.push(c.uuid);
    for (const r of rubros) g.valores[r] += c[DE_CFDI[r]] || 0;
    F.set(k(c), g);
  }
  const cruces = [];
  let coincidencias = 0, con_diferencia = 0, multiples_cfdi = 0;
  const sinRubro = new Set();
  for (const [key, n] of [...N.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const f = F.get(key);
    if (!f) {
      const rubro = n.valores.neto !== undefined ? 'neto' : 'percepciones';
      const v = n.valores[rubro] ?? 0;
      if (v === 0 && !(n.valores.percepciones)) continue; // renglón sin pago: no exige comprobante
      cruces.push({ tipo: 'sin_cfdi', colaborador_llave: n.colaborador_llave, corrida_id: n.corrida_id, rubro, movimiento_id: n.movs[rubro] || null, uuids: null, nomina_c: v, cfdi_c: null });
      continue;
    }
    if (f.uuids.length > 1) multiples_cfdi += 1;
    let igual = true;
    for (const r of rubros) {
      if (n.valores[r] === undefined) { sinRubro.add(r); continue; }
      if (n.valores[r] === f.valores[r]) continue;
      igual = false;
      cruces.push({ tipo: 'diferencia', colaborador_llave: n.colaborador_llave, corrida_id: n.corrida_id, rubro: r, movimiento_id: n.movs[r] || null,
        uuids: f.uuids.join(','), nomina_c: n.valores[r], cfdi_c: f.valores[r] });
    }
    if (igual) coincidencias += 1; else con_diferencia += 1;
  }
  for (const [key, f] of [...F.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (N.has(key)) continue;
    cruces.push({ tipo: 'sin_nomina', colaborador_llave: f.colaborador_llave, corrida_id: f.corrida_id, rubro: 'neto', movimiento_id: null,
      uuids: f.uuids.join(','), nomina_c: null, cfdi_c: f.valores.neto });
  }
  const tipos = {};
  for (const c of cruces) tipos[c.tipo] = (tipos[c.tipo] || 0) + 1;
  return { coincidencias, con_diferencia, multiples_cfdi, cruces, por_tipo: tipos, llaves_nomina: N.size, llaves_cfdi: F.size,
    rubros_sin_dato_en_nomina: [...sinRubro].sort() };
}
