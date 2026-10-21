// sua.js — Cuotas IMSS, RCV e INFONAVIT por trabajador: kernel contra lo emitido por el IMSS y lo pagado en el SUA.
// Puro: recibe lo que leyó sua-formato.js y devuelve items del kernel y renglones del cruce. La E/S vive en sua-d1.js.
//
// Qué se calcula («debido»):
//   · Tramos de SBC: los de la emisión del IMSS (EMA para el mes, EBA para el bimestre). Es lo que el IMSS tiene
//     registrado por los movimientos afiliatorios del patrón.
//   · Incapacidades: las del SUA (la emisión no las descuenta). Si dentro del periodo el SBC cambia y no hay fechas,
//     el kernel limita en vez de suponer qué días restar.
//   · Prima de riesgo: la de la emisión (CDEMPA99), o la del registro patronal si no viene.
// Tres lados por trabajador y rama: kernel, emitido (IMSS) y pagado (.SUA). Sólo se guarda lo que no coincide.
import { RAMAS, RAMAS_IMSS, emitidoPorRama } from './sua-formato.js';

const pad = (n) => String(n).padStart(2, '0');
const finDeMes = (a, m) => a + '-' + pad(m) + '-' + pad(new Date(Date.UTC(a, m, 0)).getUTCDate());
const masDias = (f, n) => { const d = new Date(f + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Mes de cotización y, si es par, su bimestre (el RCV y el INFONAVIT se pagan con el mes par). */
export function periodosDe(periodo) {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo || '');
  if (!m) throw new Error('periodo debe ser AAAA-MM');
  const a = Number(m[1]), mes = Number(m[2]);
  const r = { mes: { desde: a + '-' + pad(mes) + '-01', hasta: finDeMes(a, mes) }, bimestre: null };
  if (mes % 2 === 0) r.bimestre = { desde: a + '-' + pad(mes - 1) + '-01', hasta: finDeMes(a, mes), numero: mes / 2 };
  return r;
}

/**
 * Tramos de la emisión → tramos del kernel. La fecha null significa «desde el inicio del periodo»;
 * cada tramo dura sus días. Los renglones de 0 días (bajas) no cotizan.
 */
export function tramosDe(renglones, periodo) {
  const out = [];
  for (const r of renglones || []) {
    if (!r.dias) continue;
    const desde = r.fecha || periodo.desde;
    out.push({ desde, hasta: masDias(desde, r.dias - 1), sbc_c: r.sbc_c });
  }
  return out.sort((a, b) => a.desde.localeCompare(b.desde));
}

/** Fechas de incapacidad del SUA (movimiento 12: fecha de inicio y días) dentro de un periodo. */
export function fechasIncapacidad(movs, periodo) {
  const set = new Set();
  for (const m of movs || []) {
    if (m.tipo !== '12' || !m.fecha || !m.dias) continue;
    for (let i = 0; i < m.dias; i++) { const d = masDias(m.fecha, i); if (d >= periodo.desde && d <= periodo.hasta) set.add(d); }
  }
  return [...set].sort();
}

/** Incapacidades para la entrada del kernel: fechas si el SUA las explica completas; si no, el número. */
function incapacidadesPara(n, fechas) {
  if (!n) return 0;
  return fechas.length === n ? fechas : n;
}

/**
 * Items del kernel para un registro patronal.
 * @param p.sua         leerArchivoSUA(...)
 * @param p.ema, p.eba  leerEmision(..., 'ema' | 'eba')   (eba sólo en mes par)
 * @param p.prima_rt    { pct, vigencia_desde?, vigencia_hasta? }  (de CDEMPA99 o del registro)
 * @param p.colaborador (rfc, nss) → { colaborador_id, salario_diario_c? } | null   (cruce con la prenómina)
 * @param p.zona_salarial 'general' | 'frontera'
 */
export function itemsSUA({ sua, ema, eba, prima_rt, colaborador = () => null, zona_salarial = 'general' }) {
  const per = periodosDe(sua.patron.periodo);
  const registro = sua.patron.registro;
  const corrida_id = 'sua:' + registro + ':' + sua.patron.periodo;
  const movsPorNss = new Map();
  for (const m of sua.movimientos) { if (!movsPorNss.has(m.nss)) movsPorNss.set(m.nss, []); movsPorNss.get(m.nss).push(m); }
  const personas = new Map();     // nss → { colaborador_id, rfc, w (03) }
  const usados = new Set();
  const idDe = (nss, rfc) => {
    const c = colaborador(rfc, nss);
    let id = c && c.colaborador_id ? String(c.colaborador_id) : (rfc || 'NSS…' + nss.slice(-4));
    if (usados.has(id) && !personas.has(nss)) id = id + '#' + nss.slice(-4);
    usados.add(id);
    return { colaborador_id: id, salario_diario_c: c && Number.isInteger(c.salario_diario_c) ? c.salario_diario_c : null, ligado: !!(c && c.colaborador_id) };
  };
  for (const w of sua.trabajadores) {
    if (personas.has(w.nss)) throw new Error('El SUA trae dos veces al NSS …' + w.nss.slice(-4));
    personas.set(w.nss, { ...idDe(w.nss, w.rfc), rfc: w.rfc, w });
  }
  for (const nss of [...(ema ? ema.porNss.keys() : []), ...(eba ? eba.porNss.keys() : [])]) if (!personas.has(nss)) personas.set(nss, { ...idDe(nss, null), rfc: null, w: null });

  const items = [];
  for (const [nss, p] of personas) {
    const origen = { fuente: 'sua', registro, nss_final: nss.slice(-4), registro_03: p.w ? p.w.registro_n : null };
    const comun = { salario_diario_c: p.salario_diario_c ?? undefined, zona_salarial };
    const tm = tramosDe(ema && ema.porNss.get(nss), per.mes);
    if (tm.length) {
      const inc = p.w ? incapacidadesPara(p.w.mes.incapacidades, fechasIncapacidad(movsPorNss.get(nss), per.mes)) : 0;
      items.push({ regla_id: 'CALC-IMSS-001', colaborador_id: p.colaborador_id, corrida_id, origen,
        entrada: { ...comun, periodo: per.mes, tramos: tm, incapacidades: inc, ausentismos: p.w ? p.w.mes.ausentismos : 0, prima_rt: { ...prima_rt, registro } } });
    }
    if (per.bimestre) {
      const tb = tramosDe(eba && eba.porNss.get(nss), per.bimestre);
      if (tb.length) {
        const inc = p.w ? incapacidadesPara(p.w.bimestre.incapacidades, fechasIncapacidad(movsPorNss.get(nss), per.bimestre)) : 0;
        items.push({ regla_id: 'CALC-RCV-001', colaborador_id: p.colaborador_id, corrida_id, origen, entrada: { ...comun, periodo: per.bimestre, tramos: tb, incapacidades: inc } });
        items.push({ regla_id: 'CALC-INF-001', colaborador_id: p.colaborador_id, corrida_id, origen, entrada: { periodo: per.bimestre, tramos: tb } });
      }
    }
  }
  return { items, personas, corrida_id, periodos: per };
}

/** Importes del kernel por rama (patrón + obrero), desde las trazas de los cálculos de un trabajador. */
export function kernelPorRama(calculos) {
  const r = {};
  for (const c of calculos) {
    const t = c.traza || {};
    if (c.regla_id === 'CALC-IMSS-001' && c.rubro === 'imss_patronal' && t.ramas_c) {
      const x = t.ramas_c;
      Object.assign(r, { cuota_fija: x.cuota_fija_pat, excedente: x.excedente_pat + x.excedente_obr, dinero: x.dinero_pat + x.dinero_obr,
        gmp: x.gmp_pat + x.gmp_obr, rt: x.rt_pat, iv: x.iv_pat + x.iv_obr, guarderias: x.guarderias_pat });
    }
    if (c.regla_id === 'CALC-RCV-001' && c.rubro === 'rcv_patronal') Object.assign(r, { retiro: t.retiro_c, ceav_patronal: t.ceav_patronal_c, ceav_obrera: t.ceav_obrera_c });
    if (c.regla_id === 'CALC-INF-001') r.infonavit = c.valor_calculado_c;
  }
  return r;
}

/**
 * Cruce de tres lados. Devuelve los renglones que no coinciden y el resumen por rama.
 *   tipo diferencia   los tres lados existen y alguno difiere
 *        sin_emision  el SUA paga pero el IMSS no emitió (o el kernel no pudo calcular por falta de tramos)
 *        sin_pago     el IMSS emitió y el SUA no paga
 * Causa de cada diferencia:
 *   incapacidad        kernel = pagado ≠ emitido, con incapacidades: la emisión no las descuenta (C26)
 *   sua_distinto_imss  kernel = emitido ≠ pagado (o, con incapacidad, kernel ≠ ambos): el SUA trae días o SBC distintos a los del IMSS
 *   calculo_limitado   el kernel no pudo calcular sin suponer (p. ej. incapacidad sin fechas con varios SBC)
 *   kernel_distinto    el kernel no coincide con ninguno: se revisa el kernel primero
 * Sin tolerancia: el SUA y la emisión son cálculos deterministas al centavo (C24).
 */
export function cruzarSUA({ personas, ema, eba, calculos, excluidos = new Map(), periodos }) {
  const porColab = new Map();
  for (const c of calculos) { if (!porColab.has(c.colaborador_id)) porColab.set(c.colaborador_id, []); porColab.get(c.colaborador_id).push(c); }
  const renglones = [];
  const resumen = Object.fromEntries(RAMAS.map(k => [k, { kernel_c: 0, emitido_c: 0, pagado_c: 0, renglones: 0 }]));
  const ramas = periodos.bimestre ? RAMAS : RAMAS_IMSS;
  for (const [nss, p] of personas) {
    const cs = porColab.get(p.colaborador_id) || [];
    const k = kernelPorRama(cs);
    const limitado = cs.some(c => c.limitado);
    const te = ema ? ema.porNss.get(nss) || [] : [], tb = eba ? eba.porNss.get(nss) || [] : [];
    const e = emitidoPorRama(te, tb);
    const pag = p.w ? p.w.pagado_c : null;
    for (const rama of ramas) {
      const imss = RAMAS_IMSS.includes(rama);
      const hayEmision = imss ? te.some(t => t.dias > 0) : tb.some(t => t.dias > 0);
      const kv = k[rama] ?? null, ev = hayEmision ? e[rama] : null, pv = pag ? pag[rama] : null;
      const s = resumen[rama];
      s.kernel_c += kv || 0; s.emitido_c += ev || 0; s.pagado_c += pv || 0;
      let tipo = null;
      if (!hayEmision && pv) tipo = 'sin_emision';
      else if (hayEmision && !pag && ev) tipo = 'sin_pago';
      else if (hayEmision && (kv !== (pv ?? 0) || ev !== (pv ?? 0))) tipo = 'diferencia';
      if (!tipo) continue;
      s.renglones += 1;
      const lim = limitado || excluidos.has(p.colaborador_id);
      const inc = p.w ? (imss ? p.w.mes.incapacidades : p.w.bimestre.incapacidades) : 0;
      // Con incapacidad el kernel ya no puede igualar a la emisión: si tampoco iguala al SUA, el SUA trae otro SBC o días.
      const causa = tipo !== 'diferencia' ? tipo : lim ? 'calculo_limitado' : kv === pv && inc > 0 ? 'incapacidad'
        : kv === ev || inc > 0 ? 'sua_distinto_imss' : 'kernel_distinto';
      renglones.push({ colaborador_id: p.colaborador_id, rfc: p.rfc, nss_final: nss.slice(-4), ligado: p.ligado, rama, tipo, causa,
        kernel_c: kv, emitido_c: ev, pagado_c: pv, limitado: lim,
        dias_mes: p.w ? p.w.mes.dias : null, incapacidades_mes: p.w ? p.w.mes.incapacidades : null,
        incapacidades_bim: p.w ? p.w.bimestre.incapacidades : null, tramos: imss ? te.length : tb.length });
    }
  }
  return { renglones, resumen };
}
