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

/**
 * Pagos fuera de la nómina ordinaria (bonos, finiquitos, PTU, comisiones, gratificaciones).
 *
 * PRIME timbra muchos de esos pagos como nómina ordinaria con las fechas de la semana (el bono
 * de agosto sale como TipoNomina O, FechaFinalPago de la SEM 32) y otros como extraordinaria
 * con fecha de pago propia que no está en el calendario. Por fechas, el CFDI cae en la semana
 * (y se suma al recibo normal) o no cae en ninguna corrida. Antes de cruzar por corrida, cada
 * renglón extra de la prenómina busca su CFDI por colaborador e importe neto (regla de 4 pasos:
 * RFC + importe), y ese CFDI se cruza contra el renglón extra.
 *
 * Sólo puede tomarse un CFDI que no cuadra solo: sin corrida, o en una corrida ordinaria donde el
 * colaborador tiene más de un CFDI, o donde la prenómina no tiene renglón suyo. Un recibo que es el
 * único del colaborador en una semana con renglón en la prenómina nunca se mueve.
 * Primero un CFDI con el neto exacto; si no, hasta 4 CFDI que sumen el neto exacto; si no, un CFDI
 * a no más de 50 ¢. Determinista: renglones de mayor a menor neto, CFDI por UUID.
 *
 * @param nomina [{ colaborador_llave, corrida_id, rubro, valor_c }]
 * @param cfdis  [{ uuid, colaborador_llave, corrida_id, total_c }] (corrida_id puede ser null)
 * @param ordinarias Set de corridas ordinarias del calendario
 * @returns { cfdis: copia con corrida_id reasignada, reasignados: [{ uuid, de, a }] }
 */
export function emparejarExtras(nomina, cfdis, ordinarias, { tolerancia_c = 50, max_combinados = 4 } = {}) {
  const extras = new Map(); // colab → [{ corrida_id, neto }]
  const conRenglon = new Set();
  for (const m of nomina) {
    conRenglon.add(m.colaborador_llave + '|' + m.corrida_id);
    if (m.rubro !== 'neto' || ordinarias.has(m.corrida_id)) continue;
    const xs = extras.get(m.colaborador_llave) || [];
    const x = xs.find(e => e.corrida_id === m.corrida_id);
    if (x) x.neto += m.valor_c; else xs.push({ corrida_id: m.corrida_id, neto: m.valor_c });
    extras.set(m.colaborador_llave, xs);
  }
  const salida = cfdis.map(c => ({ ...c }));
  const reasignados = [];
  if (!extras.size) return { cfdis: salida, reasignados };
  const porLlave = new Map();
  for (const c of salida) if (c.corrida_id) porLlave.set(c.colaborador_llave + '|' + c.corrida_id, (porLlave.get(c.colaborador_llave + '|' + c.corrida_id) || 0) + 1);
  const libre = (c) => !c.corrida_id || porLlave.get(c.colaborador_llave + '|' + c.corrida_id) > 1 || !conRenglon.has(c.colaborador_llave + '|' + c.corrida_id);
  const porColab = new Map();
  for (const c of salida) {
    if (!extras.has(c.colaborador_llave) || !libre(c)) continue;
    const xs = porColab.get(c.colaborador_llave) || [];
    xs.push(c); porColab.set(c.colaborador_llave, xs);
  }
  const mover = (c, a) => {
    if (c.corrida_id) porLlave.set(c.colaborador_llave + '|' + c.corrida_id, porLlave.get(c.colaborador_llave + '|' + c.corrida_id) - 1);
    reasignados.push({ uuid: c.uuid, colaborador_llave: c.colaborador_llave, de: c.corrida_id || null, a });
    c.corrida_id = a; c.emparejado_por_importe = true;
  };
  for (const [colab, xs] of [...extras.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const cands = (porColab.get(colab) || []).sort((a, b) => String(a.uuid).localeCompare(String(b.uuid)));
    for (const e of xs.sort((a, b) => b.neto - a.neto || a.corrida_id.localeCompare(b.corrida_id))) {
      if (e.neto === 0) continue;
      const disp = cands.filter(c => !c.emparejado_por_importe && libre(c));
      let elegidos = null;
      const uno = disp.find(c => (c.total_c || 0) === e.neto);
      if (uno) elegidos = [uno];
      if (!elegidos && disp.length > 1) {
        const lim = disp.slice(0, 12);
        const n = lim.length;
        for (let k = 2; k <= Math.min(max_combinados, n) && !elegidos; k++) {
          const idx = Array.from({ length: k }, (_, i) => i);
          while (true) {
            if (idx.reduce((s, i) => s + (lim[i].total_c || 0), 0) === e.neto) { elegidos = idx.map(i => lim[i]); break; }
            let p = k - 1;
            while (p >= 0 && idx[p] === n - k + p) p--;
            if (p < 0) break;
            idx[p]++;
            for (let q = p + 1; q < k; q++) idx[q] = idx[q - 1] + 1;
          }
        }
      }
      if (!elegidos) {
        const cerca = disp.filter(c => Math.abs((c.total_c || 0) - e.neto) <= tolerancia_c)
          .sort((a, b) => Math.abs((a.total_c || 0) - e.neto) - Math.abs((b.total_c || 0) - e.neto));
        if (cerca.length) elegidos = [cerca[0]];
      }
      if (elegidos) for (const c of elegidos) mover(c, e.corrida_id);
    }
  }
  return { cfdis: salida, reasignados };
}
