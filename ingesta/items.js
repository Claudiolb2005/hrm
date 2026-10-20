// items.js — Del renglón canónico a las entradas del kernel y a los movimientos del cliente.
//
// Dos lados de la resta (T1 nivel 3):
//   · items: lo que el kernel debe calcular según la ley (EXE → ISR por renglón; AJM e ISN
//     en la fase mensual porque necesitan el mes completo).
//   · movimientos: lo que calculó la nómina actual, por rubro, tal como viene en el archivo.
// Cuando el renglón está fuera del alcance (concepto opaco o no catalogado, control de renglón
// roto), el ítem lleva la limitación: el kernel la registra y el resultado nunca es «completo»
// por ese renglón. Desde 0.9.0 la separación (LISR 95) y la PTU (RLISR 174) tienen regla propia.
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

/** Limitaciones del renglón para el ISR. */
export function limitacionesIsr(r) {
  const l = [];
  if (!r.control_ok) l.push({ motivo: 'control_renglon', detalle: 'suma de conceptos ' + r.suma_bloque_c + ' ≠ TOTAL PERCEPCIONES ' + r.total_percepciones_c });
  for (const p of r.percepciones) {
    if (p.tipo === 'opaco') l.push({ motivo: 'concepto_opaco', detalle: p.encabezado + ' (P2)' });
  }
  for (const c of r.no_catalogados) l.push({ motivo: 'concepto_no_catalogado', detalle: c.encabezado });
  for (const e of r.errores) l.push({ motivo: 'importe_invalido', detalle: e });
  return l;
}

/** Fecha de baja para los años de servicio: la del renglón si existe; si no, la fecha de pago del finiquito. */
function fechaBaja(r, cal) {
  return r.fecha_baja ? { fecha: r.fecha_baja, origen: 'renglón' } : { fecha: cal.fecha_pago, origen: 'fecha de pago del finiquito (el archivo no trae baja)' };
}

/**
 * Ítems de separación (EXE con las fechas → SEP) y de PTU (EXE → 174) de un renglón.
 * La base de cada una se calcula aquí con la misma regla de exenciones que correrá el kernel.
 */
function itemsEspeciales(r, cal, ctx, origen, lim) {
  const items = [];
  const sep = r.percepciones.filter(p => p.tipo === 'separacion' && p.monto_c > 0);
  if (sep.length) {
    const baja = fechaBaja(r, cal);
    const exe = { fecha_pago: cal.fecha_pago, percepciones: sep.map(p => ({ concepto: p.concepto, monto_c: p.monto_c })), consumido: { separacion: 0 },
      separacion: r.fecha_ingreso ? { fecha_ingreso: r.fecha_ingreso, fecha_baja: baja.fecha } : undefined, perfil: {} };
    const c = new Contexto(ctx.catalogo);
    const res = CALC_EXE_001.calcular(exe, c);
    const gravado_c = res.extra.base_gravable_c - res.extra.base_para_tope_subsidio_c;
    const l = [...lim, ...c.limitaciones.map(x => ({ motivo: 'base_limitada', detalle: x.motivo + ': ' + x.detalle }))];
    if (!r.sd_c) l.push({ motivo: 'dato_faltante', detalle: 'salario diario para el último sueldo mensual (LISR 95)' });
    items.push({ regla_id: 'CALC-ISR-SEP-001', colaborador_id: r.colaborador_id, corrida_id: r.corrida_id,
      entrada: { separacion_gravable_c: gravado_c, salario_diario_c: r.sd_c || 0, fecha_pago: cal.fecha_pago }, limitaciones: l,
      origen: { ...origen, base_de: 'CALC-EXE-001 (separación)', exento_c: res.traza.exento_total_c, fecha_baja: baja } });
  }
  const ptu = r.percepciones.filter(p => p.tipo === 'ptu' && p.monto_c > 0);
  if (ptu.length) {
    const soloPtu = r.percepciones.every(p => p.tipo !== 'percepcion' && p.tipo !== 'separacion' || !(p.monto_c > 0));
    const c = new Contexto(ctx.catalogo);
    // La PTU pagada antes en el año pudo consumir el tope: sin acumulado anual la base queda limitada (lo dice EXE).
    const res = CALC_EXE_001.calcular({ fecha_pago: cal.fecha_pago, percepciones: ptu.map(p => ({ concepto: p.concepto, monto_c: p.monto_c })), perfil: {} }, c);
    const l = [...lim, ...c.limitaciones.map(x => ({ motivo: 'base_limitada', detalle: x.motivo + ': ' + x.detalle }))];
    if (!r.sd_c) l.push({ motivo: 'dato_faltante', detalle: 'salario diario para el sueldo mensual (RLISR 174)' });
    items.push({ regla_id: 'CALC-ISR-174-001', colaborador_id: r.colaborador_id, corrida_id: r.corrida_id,
      entrada: { pago_gravable_c: res.extra.base_gravable_c, salario_diario_c: r.sd_c || 0, fecha_pago: cal.fecha_pago, concepto: 'ptu', rubro_salida: soloPtu ? 'isr' : 'isr_ptu' },
      limitaciones: soloPtu ? l : [...l, { motivo: 'ptu_mezclada', detalle: 'la PTU viene con otras percepciones y el ISR del cliente no se separa' }],
      origen: { ...origen, base_de: 'CALC-EXE-001 (PTU)', exento_c: res.traza.exento_total_c } });
  }
  return { items, soloPtu: ptu.length > 0 && r.percepciones.every(p => p.tipo !== 'percepcion' && p.tipo !== 'separacion' || !(p.monto_c > 0)) };
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
  const esp = itemsEspeciales(r, cal, ctx, origen, fuera);
  items.push(...esp.items);
  if (!ajm && !esp.soloPtu) {
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
    if (rubro === 'isn') continue; // ISN se agrega por registro y mes
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
      entrada: { registro: a.registro, entidad, municipio: (ctx.municipios && ctx.municipios.get(a.registro)) || undefined, mes: a.mes, conceptos: [...a.conceptos.entries()].sort().map(([concepto, monto_c]) => ({ concepto, monto_c })) },
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
