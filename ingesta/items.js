// items.js — Del renglón canónico a las entradas del kernel y a los movimientos del cliente.
//
// Dos lados de la resta (T1 nivel 3):
//   · items: lo que el kernel debe calcular según la ley (EXE → ISR por renglón; AJM e ISN
//     en la fase mensual porque necesitan el mes completo).
//   · movimientos: lo que calculó la nómina actual, por rubro, tal como viene en el archivo.
// Cuando el renglón está fuera del alcance de la v1 (finiquito, PTU, concepto opaco o no
// catalogado, control de renglón roto), el ítem lleva la limitación: el kernel la registra
// y el resultado nunca es «completo» por ese renglón.
import { Contexto } from '../kernel/src/parametros.js';
import { CALC_EXE_001 } from '../kernel/src/reglas/exenciones.js';
import { sha256Hex } from '../kernel/src/sello.js';

/** Domingos trabajados: columna explícita, o prima dominical = domingos × 25% × SD exacto al centavo. */
export function domingosDe(r, prima_c) {
  if (Number.isInteger(r.domingos) && r.domingos > 0) return { domingos: r.domingos, origen: 'columna' };
  if (!r.sd_c || !prima_c) return { domingos: null, origen: 'sin_dato' };
  const porDomingo = Math.floor((r.sd_c * 25 + 50) / 100); // 25% del SD, a centavo, medio hacia arriba
  if (porDomingo > 0 && prima_c % porDomingo === 0 && prima_c / porDomingo <= 5) return { domingos: prima_c / porDomingo, origen: 'derivado: prima ÷ (25% × SD)' };
  return { domingos: null, origen: 'no_deducible' };
}

/** Entrada de CALC-EXE-001 para un renglón. */
export function entradaExe(r, cal, perfil) {
  const percepciones = [];
  for (const p of r.percepciones) {
    if (p.tipo !== 'percepcion') continue;
    const x = { concepto: p.concepto, monto_c: p.monto_c };
    if (p.concepto === 'prima_dominical') x.domingos = domingosDe(r, p.monto_c).domingos;
    percepciones.push(x);
  }
  return { fecha_pago: cal.fecha_pago, percepciones, semanas_periodo: cal.periodicidad === 'catorcenal' ? 2 : 1,
    perfil: { fondo_ahorro_cumple_requisitos: perfil.perfil_fiscal.fondo_ahorro_cumple_requisitos } };
}

/** Limitaciones del renglón para el ISR (fuera del alcance de la v1). */
export function limitacionesIsr(r) {
  const l = [];
  if (!r.control_ok) l.push({ motivo: 'control_renglon', detalle: 'suma de conceptos ' + r.suma_bloque_c + ' ≠ TOTAL PERCEPCIONES ' + r.total_percepciones_c });
  for (const p of r.percepciones) {
    if (p.tipo === 'separacion') l.push({ motivo: 'regla_faltante', detalle: 'finiquito/separación sin regla en v1 (' + p.encabezado + ')' });
    if (p.tipo === 'ptu') l.push({ motivo: 'regla_faltante', detalle: 'PTU sin regla en v1' });
    if (p.tipo === 'opaco') l.push({ motivo: 'concepto_opaco', detalle: p.encabezado + ' (P2)' });
  }
  for (const c of r.no_catalogados) l.push({ motivo: 'concepto_no_catalogado', detalle: c.encabezado });
  if ((r.movimientos.isr_separacion || 0) !== 0) l.push({ motivo: 'regla_faltante', detalle: 'ISR de finiquito/liquidación en el renglón' });
  for (const e of r.errores) l.push({ motivo: 'importe_invalido', detalle: e });
  return l;
}

/** Base gravable del renglón con la misma regla que correrá el kernel (determinista). */
export function baseDe(r, cal, perfil, catalogo) {
  const ctx = new Contexto(catalogo);
  const res = CALC_EXE_001.calcular(entradaExe(r, cal, perfil), ctx);
  return { base_c: res.extra.base_gravable_c, base_tope_c: res.extra.base_para_tope_subsidio_c, limitaciones: ctx.limitaciones };
}

/** Id determinista por ingesta: reprocesar la misma ingesta no duplica; otra ingesta del mismo archivo es otro juego. */
export async function idMovimiento(ingesta_id, corrida_id, colaborador_id, rubro) {
  return 'mov_' + (await sha256Hex([ingesta_id, corrida_id || '', colaborador_id, rubro].join('|'))).slice(0, 24);
}

/**
 * Items del kernel y movimientos de un renglón (fase por lote). AJM e ISN van en la fase mensual.
 * @param ctx { calendario: Map, ultimaDelMes: Set(corrida_id), perfil, catalogo, aplicaAjuste }
 */
export async function itemsDeRenglon(r, ctx, archivo_sha256, ingesta_id) {
  const cal = ctx.calendario.get(r.corrida_id);
  const items = [];
  const movimientos = [];
  if (!cal) return { items, movimientos, excluido: 'calendario_faltante' };
  const origen = { archivo_sha256, fila: r.fila, corrida_raw: r.corrida_raw };
  const exe = entradaExe(r, cal, ctx.perfil);
  items.push({ regla_id: 'CALC-EXE-001', colaborador_id: r.colaborador_id, corrida_id: r.corrida_id, entrada: exe, origen });

  const fuera = limitacionesIsr(r);
  const b = baseDe(r, cal, ctx.perfil, ctx.catalogo);
  const lim = [...fuera, ...b.limitaciones.map(l => ({ motivo: 'base_limitada', detalle: l.motivo + ': ' + l.detalle }))];
  const ajm = cal.ordinaria && ctx.aplicaAjuste && ctx.ultimaDelMes.has(r.corrida_id);
  if (!ajm) {
    let regla, entrada;
    if (!cal.ordinaria) {
      regla = 'CALC-ISR-EXT-001';
      entrada = { pago_gravable_c: b.base_c, periodicidad: cal.periodicidad, fecha_pago: cal.fecha_pago };
    } else if (cal.periodicidad === 'catorcenal') {
      regla = 'CALC-ISR-CAT-001';
      entrada = { base_gravable_c: b.base_c, base_para_tope_c: b.base_tope_c, fecha_pago: cal.fecha_pago };
    } else {
      regla = 'CALC-ISR-SEM-001';
      entrada = { base_gravable_c: b.base_c, base_para_tope_c: b.base_tope_c, fecha_pago: cal.fecha_pago, periodicidad: cal.periodicidad };
    }
    items.push({ regla_id: regla, colaborador_id: r.colaborador_id, corrida_id: r.corrida_id, entrada, limitaciones: lim,
      origen: { ...origen, base_de: 'CALC-EXE-001' } });
  }
  for (const [rubro, valor_c] of Object.entries(r.movimientos)) {
    if (rubro === 'isn' || rubro === 'isr_separacion') continue; // ISN se agrega por registro y mes
    movimientos.push({ id: await idMovimiento(ingesta_id, r.corrida_id, r.colaborador_id, rubro), encargo_id: ctx.encargo_id, ingesta_id,
      corrida_id: r.corrida_id, colaborador_id: r.colaborador_id, rubro, valor_c, archivo_sha256, renglon_origen: 'fila ' + r.fila, rfc: r.rfc || null });
  }
  return { items, movimientos };
}

/**
 * Fase mensual: ajuste mensual de ISR (última nómina ordinaria del mes) e ISN por registro.
 * @param renglones todos los renglones canónicos de la ingesta (ya con calendario)
 */
export async function itemsMensuales(renglones, ctx, archivo_sha256, ingesta_id) {
  const items = [];
  const movimientos = [];
  const reporte = { ajm: 0, ajm_limitados: 0, isn_registros: 0, isn_sin_entidad: [] };

  // ── Ajuste mensual: por colaborador, periodicidad y mes de pago
  if (ctx.aplicaAjuste) {
    const grupos = new Map();
    for (const r of renglones) {
      const cal = ctx.calendario.get(r.corrida_id);
      if (!cal || !cal.ordinaria) continue;
      const k = [r.colaborador_id, cal.periodicidad, cal.fecha_pago.slice(0, 7)].join('|');
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push({ r, cal });
    }
    for (const g of grupos.values()) {
      const ult = g.find(x => ctx.ultimaDelMes.has(x.r.corrida_id));
      if (!ult) continue;
      const lim = [];
      const bases = [], topes = [];
      let previo = 0;
      for (const { r, cal } of g.sort((a, b) => a.cal.fecha_pago.localeCompare(b.cal.fecha_pago))) {
        const b = baseDe(r, cal, ctx.perfil, ctx.catalogo);
        bases.push(b.base_c); topes.push(b.base_tope_c);
        for (const l of [...limitacionesIsr(r), ...b.limitaciones]) lim.push({ motivo: l.motivo === 'dato_faltante' ? 'base_limitada' : l.motivo, detalle: r.corrida_id + ': ' + l.detalle });
        if (r !== ult.r) previo += r.movimientos.isr || 0; // ISR efectivamente retenido en el mes (dato de entrada)
      }
      items.push({ regla_id: 'CALC-ISR-AJM-001', colaborador_id: ult.r.colaborador_id, corrida_id: ult.r.corrida_id,
        entrada: { bases_mes_c: bases, bases_tope_mes_c: topes, isr_retenido_previo_mes_c: previo, fecha_pago: ult.cal.fecha_pago, aplica_ajuste_mensual: true },
        limitaciones: lim,
        origen: { archivo_sha256, filas: g.map(x => x.r.fila), isr_previo: 'retenido según prenómina',
          nota: 'C5 por confirmar: los pagos extra no entran a las bases del ajuste' } });
      reporte.ajm += 1;
      if (lim.length) reporte.ajm_limitados += 1;
    }
  }

  // ── ISN: por registro patronal y mes de pago, concepto por concepto
  const porRegistro = new Map();
  for (const r of renglones) {
    const cal = ctx.calendario.get(r.corrida_id);
    if (!cal || !r.registro) continue;
    const k = r.registro + '|' + cal.fecha_pago.slice(0, 7);
    if (!porRegistro.has(k)) porRegistro.set(k, { registro: r.registro, mes: cal.fecha_pago.slice(0, 7), conceptos: new Map(), isn_cliente_c: 0, no_catalogados: 0, opacos: 0 });
    const a = porRegistro.get(k);
    for (const p of r.percepciones) {
      if (p.tipo === 'opaco') a.opacos += 1;
      if (!['percepcion', 'separacion', 'ptu'].includes(p.tipo)) continue;
      a.conceptos.set(p.concepto, (a.conceptos.get(p.concepto) || 0) + p.monto_c);
    }
    a.no_catalogados += r.no_catalogados.length;
    a.isn_cliente_c += r.movimientos.isn || 0;
  }
  for (const a of porRegistro.values()) {
    const entidad = ctx.entidades.get(a.registro) || null;
    if (!entidad) reporte.isn_sin_entidad.push(a.registro);
    const lim = [];
    if (a.no_catalogados) lim.push({ motivo: 'concepto_no_catalogado', detalle: a.no_catalogados + ' importes en conceptos no catalogados' });
    if (a.opacos) lim.push({ motivo: 'concepto_opaco', detalle: a.opacos + ' importes en conceptos por confirmar (P2)' });
    items.push({ regla_id: 'CALC-ISN-001', colaborador_id: a.registro, corrida_id: 'MES' + a.mes,
      entrada: { registro: a.registro, entidad, mes: a.mes, conceptos: [...a.conceptos.entries()].sort().map(([concepto, monto_c]) => ({ concepto, monto_c })) },
      limitaciones: lim, origen: { archivo_sha256, agregado: 'registro × mes' } });
    movimientos.push({ id: await idMovimiento(ingesta_id, 'MES' + a.mes, a.registro, 'isn'), encargo_id: ctx.encargo_id, ingesta_id,
      corrida_id: 'MES' + a.mes, colaborador_id: a.registro, rubro: 'isn', valor_c: a.isn_cliente_c, archivo_sha256, renglon_origen: 'suma por registro y mes' });
    reporte.isn_registros += 1;
  }
  return { items, movimientos, reporte };
}

/** Corridas ordinarias que son la última pagada en su mes, por periodicidad. */
export function ultimasDelMes(calendario) {
  const ult = new Map();
  for (const [id, c] of calendario) {
    if (!c.ordinaria) continue;
    const k = c.periodicidad + '|' + c.fecha_pago.slice(0, 7);
    if (!ult.has(k) || ult.get(k).fecha_pago < c.fecha_pago) ult.set(k, { id, fecha_pago: c.fecha_pago });
  }
  return new Set([...ult.values()].map(x => x.id));
}
