// api/kernel.js — Rutas del kernel en el Worker clientes-hrm (/api/kernel/*). Sólo admin.
//
// El cálculo corre en el SERVIDOR (T8): un resultado calculado en una máquina que no
// controlamos no es evidencia. Esta primera versión recibe lotes acotados de entradas
// canónicas; la ingesta con cola (archivo en R2 → lotes idempotentes) se monta encima.
import { ejecutar, reconciliar, aceptacion, listaPBC, verificarSello, KERNEL_VERSION, KERNEL_HUELLA, versionCatalogoReglas, Catalogo, CUBETAS } from '../kernel/src/index.js';
import { cargarCatalogo, persistirEjecucion, leerEjecucion, verificarArranque, compararMatriz, insertarMultiple } from '../kernel/src/d1.js';
import { crearIngesta, avanzar, estadoIngesta, reintentar, PERFILES } from '../ingesta/trabajos.js';
import semilla from '../kernel/data/parametros-2026.js';

const MAX_ITEMS = 500;
const ORIGENES = ['cliente', 'tercero', 'la_casa'];
export const ENTIDADES = ['AGS', 'BC', 'BCS', 'CAMP', 'CHIS', 'CHIH', 'CDMX', 'COAH', 'COL', 'DGO', 'GTO', 'GRO', 'HGO', 'JAL', 'MEX', 'MICH',
  'MOR', 'NAY', 'NL', 'OAX', 'PUE', 'QRO', 'QROO', 'SLP', 'SIN', 'SON', 'TAB', 'TAMS', 'TLAX', 'VER', 'YUC', 'ZAC'];
const PERIODICIDADES = ['semanal', 'decenal', 'catorcenal', 'quincenal', 'mensual'];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

async function cuerpo(request) {
  try { return await request.json(); } catch { return null; }
}

export async function rutasKernel(request, env, u, C, J, ctx) {
  const url = new URL(request.url);
  const p = url.pathname;
  const m = request.method;
  if (!p.startsWith('/api/kernel/')) return null;
  if (u.rol !== 'admin') return J({ error: 'Forbidden' }, 403, C);
  const db = env.DB;

  // Estado e integridad: matriz completa y catálogo en D1 idéntico a la semilla del código.
  if (p === '/api/kernel/estado' && m === 'GET') {
    const sinFuentes = await verificarArranque(db);
    const catalogo = await cargarCatalogo(db);
    const vD1 = await catalogo.version();
    const vSemilla = await new Catalogo(semilla.filas).version();
    const cuenta = async (t) => (await db.prepare('SELECT count(*) AS n FROM ' + t).first()).n;
    return J({
      kernel_version: KERNEL_VERSION, kernel_huella: KERNEL_HUELLA, version_catalogo_reglas: await versionCatalogoReglas(),
      version_parametros_d1: vD1, version_parametros_semilla: vSemilla, parametros_integros: vD1 === vSemilla,
      reglas_sin_fuente_obligatoria: sinFuentes, matriz_d1_vs_codigo: await compararMatriz(db),
      puede_arrancar: sinFuentes.length === 0,
      conteos: { parametros: catalogo.filas.length, encargos: await cuenta('encargo'), ejecuciones: await cuenta('ejecucion'), calculos: await cuenta('calculo_kernel') },
    }, 200, C);
  }

  if (p === '/api/kernel/pbc' && m === 'GET') return J({ pbc: listaPBC() }, 200, C);

  if (p === '/api/kernel/encargos' && m === 'GET') {
    const empresa = url.searchParams.get('empresa_id');
    const q = empresa ? db.prepare('SELECT * FROM encargo WHERE empresa_id = ?1 ORDER BY creado_en DESC').bind(Number(empresa))
      : db.prepare('SELECT * FROM encargo ORDER BY creado_en DESC LIMIT 200');
    return J({ encargos: (await q.all()).results }, 200, C);
  }

  if (p === '/api/kernel/encargos' && m === 'POST') {
    const d = await cuerpo(request);
    if (!d) return J({ error: 'JSON inválido' }, 400, C);
    const req = ['id', 'empresa_id', 'nivel', 'periodo_desde', 'periodo_hasta', 'ejercicio', 'origen_nomina'];
    for (const k of req) if (d[k] === undefined || d[k] === null || d[k] === '') return J({ error: 'Falta ' + k }, 400, C);
    if (!ORIGENES.includes(d.origen_nomina)) return J({ error: 'origen_nomina debe ser cliente, tercero o la_casa (N1)' }, 400, C);
    if (d.origen_nomina === 'la_casa' && !d.operador_nomina_usuario_id) return J({ error: 'Con origen la_casa se registra quién operó la nómina (separación de personas)' }, 400, C);
    await db.prepare('INSERT INTO encargo (id, empresa_id, periodo_id, nivel, periodo_desde, periodo_hasta, ejercicio, origen_nomina, operador_nomina_usuario_id, aplica_ajuste_mensual) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)')
      .bind(d.id, Number(d.empresa_id), d.periodo_id ?? null, d.nivel, d.periodo_desde, d.periodo_hasta, Number(d.ejercicio), d.origen_nomina,
        d.operador_nomina_usuario_id ?? null, d.aplica_ajuste_mensual ? 1 : 0).run();
    return J({ ok: true, id: d.id }, 201, C);
  }

  // Ejecuta reglas sobre un lote de entradas canónicas y persiste el resultado sellado.
  if (p === '/api/kernel/ejecutar' && m === 'POST') {
    const d = await cuerpo(request);
    if (!d || !d.encargo_id || !Array.isArray(d.items)) return J({ error: 'Se espera { encargo_id, corrida_id?, fuentes, items[] }' }, 400, C);
    if (d.items.length > MAX_ITEMS) return J({ error: 'Máximo ' + MAX_ITEMS + ' entradas por lote; parte el archivo en lotes' }, 413, C);
    const enc = await db.prepare('SELECT * FROM encargo WHERE id = ?1').bind(d.encargo_id).first();
    if (!enc) return J({ error: 'Encargo no existe' }, 404, C);
    const sinFuentes = await verificarArranque(db);
    if (sinFuentes.length) return J({ error: 'Matriz incompleta; el kernel no arranca', reglas: sinFuentes }, 503, C);
    const catalogo = await cargarCatalogo(db);
    const r = await ejecutar({ catalogo, encargo_id: enc.id, corrida_id: d.corrida_id || null, fuentes: d.fuentes || {}, items: d.items });
    await persistirEjecucion(db, r, { catalogo, ejercicio: enc.ejercicio });
    return J({ ejecucion: r.ejecucion, resultados: r.resultados }, 201, C);
  }

  if (p === '/api/kernel/ejecuciones' && m === 'GET') {
    const enc = url.searchParams.get('encargo_id');
    if (!enc) return J({ error: 'encargo_id requerido' }, 400, C);
    const { results } = await db.prepare('SELECT id, kernel_version, version_parametros, calculado_en, n_calculos, sello FROM ejecucion WHERE encargo_id = ?1 ORDER BY calculado_en DESC').bind(enc).all();
    return J({ ejecuciones: results }, 200, C);
  }

  if (p === '/api/kernel/ejecucion' && m === 'GET') {
    const id = url.searchParams.get('id');
    const e = id && await leerEjecucion(db, id);
    if (!e) return J({ error: 'Ejecución no existe' }, 404, C);
    return J({ ...e, sello_valido: await verificarSello(e) }, 200, C);
  }

  // Lado «cliente» de la resta: movimientos tal como vienen del proceso actual.
  if (p === '/api/kernel/movimientos' && m === 'POST') {
    const d = await cuerpo(request);
    if (!d || !d.encargo_id || !d.archivo_sha256 || !Array.isArray(d.movimientos)) return J({ error: 'Se espera { encargo_id, archivo_sha256, movimientos[] }' }, 400, C);
    if (d.movimientos.length > MAX_ITEMS) return J({ error: 'Máximo ' + MAX_ITEMS + ' movimientos por lote' }, 413, C);
    const st = [];
    for (const mv of d.movimientos) {
      if (!Number.isInteger(mv.valor_c)) return J({ error: 'valor_c debe ser entero en centavos', movimiento: mv }, 400, C);
      const id = mv.id || [d.encargo_id, mv.corrida_id || '', mv.colaborador_id, mv.rubro].join('|');
      st.push(db.prepare('INSERT OR IGNORE INTO movimiento_nomina (id, encargo_id, corrida_id, colaborador_id, rubro, valor_c, archivo_sha256, renglon_origen) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)')
        .bind(id, d.encargo_id, mv.corrida_id || null, String(mv.colaborador_id), mv.rubro, mv.valor_c, d.archivo_sha256, mv.renglon_origen || null));
    }
    for (let i = 0; i < st.length; i += 50) await db.batch(st.slice(i, i + 50));
    return J({ ok: true, recibidos: st.length }, 201, C);
  }

  // Reconciliación de una ejecución contra los movimientos del cliente: crea las diferencias sin clasificar.
  if (p === '/api/kernel/reconciliar' && m === 'POST') {
    const d = await cuerpo(request);
    if (!d || !d.ejecucion_id) return J({ error: 'ejecucion_id requerido' }, 400, C);
    const e = await leerEjecucion(db, d.ejecucion_id);
    if (!e) return J({ error: 'Ejecución no existe' }, 404, C);
    const { results: movs } = d.ingesta_id
      ? await db.prepare('SELECT id, corrida_id, colaborador_id, rubro, valor_c FROM movimiento_nomina WHERE ingesta_id = ?1').bind(d.ingesta_id).all()
      : await db.prepare('SELECT id, corrida_id, colaborador_id, rubro, valor_c FROM movimiento_nomina WHERE encargo_id = ?1 AND ingesta_id IS NULL').bind(e.ejecucion.encargo_id).all();
    const rubros = new Set(e.calculos.map(c => c.rubro));
    const cliente = movs.filter(x => rubros.has(x.rubro)).map(x => ({ ...x, corrida_id: x.corrida_id || null, movimiento_ref: x.id }));
    const rec = reconciliar(e.calculos, cliente);
    const st = rec.diferencias.map(df => db.prepare('INSERT OR IGNORE INTO diferencia (id, calculo_kernel_id, movimiento_id) VALUES (?1,?2,?3)')
      .bind('dif_' + df.calculo_kernel_id.slice(5), df.calculo_kernel_id, df.movimiento_ref));
    for (let i = 0; i < st.length; i += 50) await db.batch(st.slice(i, i + 50));
    return J({ coincidencias: rec.coincidencias, coincidencias_limitadas: rec.coincidencias_limitadas, diferencias: rec.diferencias.length, limitados: rec.limitados.length,
      sin_par_cliente: rec.sin_par_cliente.length, sin_par_kernel: rec.sin_par_kernel.length }, 200, C);
  }

  if (p === '/api/kernel/diferencias' && m === 'GET') {
    const q = url.searchParams;
    const enc = q.get('encargo_id');
    if (!enc) return J({ error: 'encargo_id requerido' }, 400, C);
    const filtros = ['encargo_id = ?1'], args = [enc];
    for (const k of ['ejecucion_id', 'regla_id', 'rubro', 'corrida_id']) if (q.get(k)) { args.push(q.get(k)); filtros.push(k + ' = ?' + args.length); }
    if (q.get('diferencia_c')) { args.push(Number(q.get('diferencia_c'))); filtros.push('diferencia_c = ?' + args.length); }
    if (q.get('pendientes') === '1') filtros.push('cubeta IS NULL');
    const lim = Math.min(Number(q.get('limit') || 500), 2000);
    const { results } = await db.prepare('SELECT * FROM v_diferencia WHERE ' + filtros.join(' AND ') + ' ORDER BY abs(diferencia_c) DESC LIMIT ' + lim).bind(...args).all();
    const tot = await db.prepare('SELECT count(*) AS n, sum(cubeta IS NULL) AS pendientes FROM v_diferencia WHERE ' + filtros.filter(f => f !== 'cubeta IS NULL').join(' AND ')).bind(...args).first();
    return J({ diferencias: results, total: tot.n, aceptacion: { aceptado: (tot.pendientes || 0) === 0, sin_clasificar: tot.pendientes || 0 } }, 200, C);
  }

  // Diferencias agrupadas por regla, rubro e importe: así se clasifican en bloque.
  if (p === '/api/kernel/diferencias/grupos' && m === 'GET') {
    const enc = url.searchParams.get('encargo_id');
    if (!enc) return J({ error: 'encargo_id requerido' }, 400, C);
    const ej = url.searchParams.get('ejecucion_id');
    const { results } = await db.prepare('SELECT regla_id, rubro, diferencia_c, count(*) AS n, sum(cubeta IS NULL) AS pendientes, sum(limitado) AS limitados, ' +
      'min(cubeta) AS cubeta, min(motivo) AS motivo, min(criterio_id) AS criterio_id FROM v_diferencia WHERE encargo_id = ?1' + (ej ? ' AND ejecucion_id = ?2' : '') +
      ' GROUP BY regla_id, rubro, diferencia_c ORDER BY pendientes DESC, n DESC LIMIT 500').bind(...(ej ? [enc, ej] : [enc])).all();
    const tot = await db.prepare('SELECT count(*) AS n, sum(cubeta IS NULL) AS pendientes FROM v_diferencia WHERE encargo_id = ?1' + (ej ? ' AND ejecucion_id = ?2' : '')).bind(...(ej ? [enc, ej] : [enc])).first();
    return J({ grupos: results, total: tot.n || 0, aceptacion: { aceptado: (tot.pendientes || 0) === 0, sin_clasificar: tot.pendientes || 0 } }, 200, C);
  }

  if (p === '/api/kernel/clasificar' && m === 'POST') {
    const d = await cuerpo(request);
    if (!d || !d.diferencia_id || !CUBETAS.includes(d.cubeta) || !d.motivo) return J({ error: 'Se espera { diferencia_id, cubeta, motivo, criterio_id? }' }, 400, C);
    await db.prepare('UPDATE diferencia SET cubeta = ?1, motivo = ?2, quien = ?3, clasificado_por_usuario_id = ?4, criterio_id = ?5, clasificado_en = ?6 WHERE id = ?7')
      .bind(d.cubeta, d.motivo, u.nombre || u.email, u.id, d.criterio_id || null, new Date().toISOString(), d.diferencia_id).run();
    return J({ ok: true }, 200, C);
  }

  // Clasificación en bloque: todas las diferencias sin clasificar que cumplen el filtro (p. ej. las 1,029 del hallazgo 1).
  if (p === '/api/kernel/clasificar-grupo' && m === 'POST') {
    const d = await cuerpo(request);
    if (!d || !d.encargo_id || !CUBETAS.includes(d.cubeta) || !d.motivo) return J({ error: 'Se espera { encargo_id, cubeta, motivo, regla_id?, rubro?, corrida_id?, diferencia_c?, criterio_id? }' }, 400, C);
    const filtros = ['encargo_id = ?1', 'cubeta IS NULL'];
    const args = [d.encargo_id];
    for (const k of ['regla_id', 'rubro', 'corrida_id', 'diferencia_c']) if (d[k] !== undefined && d[k] !== null && d[k] !== '') { args.push(d[k]); filtros.push(k + ' = ?' + args.length); }
    if (filtros.length === 2) return J({ error: 'Pon al menos un filtro (regla, rubro, corrida o importe)' }, 400, C);
    if (d.ejecucion_id) { args.push(d.ejecucion_id); filtros.push('ejecucion_id = ?' + args.length); }
    const n0 = args.length;
    const r = await db.prepare('UPDATE diferencia SET cubeta = ?' + (n0 + 1) + ', motivo = ?' + (n0 + 2) + ', quien = ?' + (n0 + 3) + ', clasificado_por_usuario_id = ?' + (n0 + 4) +
      ', criterio_id = ?' + (n0 + 5) + ', clasificado_en = ?' + (n0 + 6) + ' WHERE id IN (SELECT id FROM v_diferencia WHERE ' + filtros.join(' AND ') + ')')
      .bind(...args, d.cubeta, d.motivo, u.nombre || u.email, u.id, d.criterio_id || null, new Date().toISOString()).run();
    return J({ ok: true, clasificadas: r.meta?.changes ?? null }, 200, C);
  }

  // ── Ingesta en el servidor (T8) ──
  if (p === '/api/kernel/ingestas' && m === 'POST') {
    let encargo_id, r2_key, perfil = 'prime', archivo_nombre;
    const tipoCont = request.headers.get('Content-Type') || '';
    if (tipoCont.includes('multipart/form-data')) {
      const fd = await request.formData();
      const f = fd.get('file');
      encargo_id = fd.get('encargo_id'); perfil = fd.get('perfil') || perfil;
      if (!f || !f.name || !encargo_id) return J({ error: 'Faltan campos: file, encargo_id' }, 400, C);
      if (f.size > 95 * 1024 * 1024) return J({ error: 'El archivo excede 95MB' }, 413, C);
      archivo_nombre = f.name;
      r2_key = 'encargos/' + encargo_id + '/fuentes/' + Date.now() + '_' + f.name.replace(/[^\w.\- ]+/g, '_');
      await env.DOCS.put(r2_key, f.stream(), { httpMetadata: { contentType: f.type || 'application/octet-stream' } });
    } else {
      const d = await cuerpo(request);
      if (!d || !d.encargo_id || !d.r2_key) return J({ error: 'Se espera multipart (file, encargo_id) o JSON { encargo_id, r2_key }' }, 400, C);
      ({ encargo_id, r2_key } = d); perfil = d.perfil || perfil; archivo_nombre = d.archivo_nombre;
    }
    if (!PERFILES[perfil]) return J({ error: 'Perfil desconocido: ' + perfil }, 400, C);
    let id;
    try { id = await crearIngesta(env, { encargo_id, r2_key, perfil, archivo_nombre, usuario_id: u.id }); }
    catch (e) { return J({ error: e.message }, 400, C); }
    // Arranca ya; el cron continúa cada minuto si no termina en esta invocación.
    if (ctx && ctx.waitUntil) ctx.waitUntil(avanzar(env, { ingesta_id: id, presupuesto_ms: 25000 }));
    return J({ ok: true, id, r2_key }, 201, C);
  }
  if (p === '/api/kernel/ingestas' && m === 'GET') {
    const enc = url.searchParams.get('encargo_id');
    if (!enc) return J({ error: 'encargo_id requerido' }, 400, C);
    const { results } = await db.prepare('SELECT id, archivo_nombre, estado, lotes_total, lotes_hechos, renglones, ejecucion_id, substr(error, 1, 300) AS error, creado_en, actualizado_en FROM ingesta WHERE encargo_id = ?1 ORDER BY creado_en DESC').bind(enc).all();
    return J({ ingestas: results }, 200, C);
  }
  if (p === '/api/kernel/ingesta' && m === 'GET') {
    const i = await estadoIngesta(db, url.searchParams.get('id'));
    return i ? J({ ingesta: i }, 200, C) : J({ error: 'Ingesta no existe' }, 404, C);
  }
  if (p === '/api/kernel/ingesta/avanzar' && m === 'POST') {
    const d = await cuerpo(request);
    if (!d || !d.id) return J({ error: 'id requerido' }, 400, C);
    const r = await avanzar(env, { ingesta_id: d.id, presupuesto_ms: 20000 });
    return J({ ...r, ingesta: await estadoIngesta(db, d.id) }, 200, C);
  }
  if (p === '/api/kernel/ingesta/reintentar' && m === 'POST') {
    const d = await cuerpo(request);
    const estado = d && d.id ? await reintentar(db, d.id) : false;
    if (!estado) return J({ error: 'Sólo se reintenta una ingesta en error' }, 400, C);
    if (ctx && ctx.waitUntil) ctx.waitUntil(avanzar(env, { ingesta_id: d.id, presupuesto_ms: 25000 }));
    return J({ ok: true, estado }, 200, C);
  }

  // ── Calendario de nómina del encargo (módulo 5) ──
  if (p === '/api/kernel/calendario' && m === 'GET') {
    const { results } = await db.prepare('SELECT * FROM calendario_nomina WHERE encargo_id = ?1 ORDER BY fecha_pago, corrida_id').bind(url.searchParams.get('encargo_id')).all();
    return J({ calendario: results }, 200, C);
  }
  if (p === '/api/kernel/calendario' && m === 'POST') {
    const d = await cuerpo(request);
    if (!d || !d.encargo_id || !Array.isArray(d.corridas) || !d.fuente) return J({ error: 'Se espera { encargo_id, fuente, corridas: [{ corrida_id, periodicidad, desde, hasta, fecha_pago, ordinaria }] }' }, 400, C);
    for (const c of d.corridas) {
      if (!c.corrida_id || !PERIODICIDADES.includes(c.periodicidad) || ![c.desde, c.hasta, c.fecha_pago].every(x => FECHA.test(x || '')))
        return J({ error: 'Corrida inválida', corrida: c }, 400, C);
    }
    const st = d.corridas.map(c => db.prepare('INSERT INTO calendario_nomina (encargo_id, corrida_id, periodicidad, desde, hasta, fecha_pago, ordinaria, fuente) VALUES (?1,?2,?3,?4,?5,?6,?7,?8) ' +
      'ON CONFLICT (encargo_id, corrida_id) DO UPDATE SET periodicidad = excluded.periodicidad, desde = excluded.desde, hasta = excluded.hasta, fecha_pago = excluded.fecha_pago, ordinaria = excluded.ordinaria, fuente = excluded.fuente')
      .bind(d.encargo_id, c.corrida_id, c.periodicidad, c.desde, c.hasta, c.fecha_pago, c.ordinaria === false || c.ordinaria === 0 ? 0 : 1, d.fuente));
    for (let i = 0; i < st.length; i += 50) await db.batch(st.slice(i, i + 50));
    return J({ ok: true, corridas: st.length }, 200, C);
  }

  // ── Registros patronales: entidad del centro de trabajo y prima de riesgo ──
  if (p === '/api/kernel/registros' && m === 'GET') {
    const { results } = await db.prepare('SELECT * FROM registro_patronal WHERE empresa_id = ?1 ORDER BY registro').bind(Number(url.searchParams.get('empresa_id'))).all();
    return J({ registros: results }, 200, C);
  }
  if (p === '/api/kernel/registros' && m === 'POST') {
    const d = await cuerpo(request);
    if (!d || !d.empresa_id || !Array.isArray(d.registros) || !d.fuente) return J({ error: 'Se espera { empresa_id, fuente, registros: [{ registro, entidad?, prima_rt_pct?, prima_desde?, prima_hasta? }] }' }, 400, C);
    for (const r of d.registros) {
      if (!/^[A-Z0-9]{11}$/.test(String(r.registro || '').toUpperCase())) return J({ error: 'Registro patronal inválido', registro: r }, 400, C);
      if (r.entidad && !ENTIDADES.includes(r.entidad)) return J({ error: 'Entidad inválida (usa la clave: ' + ENTIDADES.join(', ') + ')', registro: r }, 400, C);
      if (r.prima_rt_pct && !/^\d+(\.\d+)?$/.test(String(r.prima_rt_pct))) return J({ error: 'Prima inválida', registro: r }, 400, C);
    }
    const st = d.registros.map(r => db.prepare('INSERT INTO registro_patronal (empresa_id, registro, entidad, prima_rt_pct, prima_desde, prima_hasta, fuente) VALUES (?1,?2,?3,?4,?5,?6,?7) ' +
      "ON CONFLICT (empresa_id, registro) DO UPDATE SET entidad = coalesce(excluded.entidad, entidad), prima_rt_pct = coalesce(excluded.prima_rt_pct, prima_rt_pct), " +
      "prima_desde = coalesce(excluded.prima_desde, prima_desde), prima_hasta = coalesce(excluded.prima_hasta, prima_hasta), fuente = excluded.fuente, actualizado_en = datetime('now')")
      .bind(Number(d.empresa_id), String(r.registro).toUpperCase(), r.entidad || null, r.prima_rt_pct ? String(r.prima_rt_pct) : null, r.prima_desde || null, r.prima_hasta || null, d.fuente));
    for (let i = 0; i < st.length; i += 50) await db.batch(st.slice(i, i + 50));
    return J({ ok: true, registros: st.length }, 200, C);
  }

  if (p === '/api/kernel/criterios' && m === 'GET') {
    return J({ criterios: (await db.prepare('SELECT * FROM bitacora_criterio ORDER BY id').all()).results }, 200, C);
  }

  return J({ error: 'Not found' }, 404, C);
}
