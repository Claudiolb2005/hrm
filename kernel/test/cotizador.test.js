// Cotizador (módulo 26): tabla B1–B4, fórmula B5+, piso, diagnóstico y ratios contra el costo total.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cotizar } from '../../servicio/cotizador.js';

test('los cuatro perfiles de Nómina Verificada v2 dan lo que dice la revisión', () => {
  for (const [C, R, K, esperado] of [[1500, 4, 2, 101000], [2500, 6, 3, 144000], [5000, 15, 6, 263000], [3597, 30, 14, 267000]])
    assert.equal(cotizar({ colaboradores: C, registros: R, corridas_mes: K }).iguala_formula, esperado, C + ' colaboradores');
});

test('cliente real: 0.96 % de la carga, $74 por colaborador, diagnóstico $1,070,000 y 0.063 % del costo anual', () => {
  const q = cotizar({ colaboradores: 3597, registros: 30, corridas_mes: 14, carga_patronal_mensual_c: 2775564100, percepciones_mensuales_c: 11425000000 });
  assert.equal(q.nivel, 'B5+');
  assert.equal(q.iguala_mensual, 267000);
  assert.equal(q.ratios.iguala_pct_carga_patronal, '0.962');
  assert.equal(q.ratios.iguala_por_colaborador, 74);
  assert.equal(q.diagnostico, 1070000, '4.0 × 267,492 al millar');
  assert.equal(q.ratios.diagnostico_pct_costo_total_anual, '0.063');
});

test('tabla B1–B4, diagnóstico 5.2 ×, piso y complementos', () => {
  const b1 = cotizar({ colaboradores: 45, registros: 1, corridas_mes: 2 });
  assert.deepEqual([b1.nivel, b1.iguala_mensual, b1.diagnostico], ['B1', 6900, 36000]);
  const piso = cotizar({ colaboradores: 1000, registros: 1, corridas_mes: 2, carga_patronal_mensual_c: 1000000000 });
  assert.equal(piso.nivel, 'B4');
  assert.equal(piso.iguala_mensual, 85000, '0.85 % de $10 M manda sobre los $52,000 de tabla');
  const c = cotizar({ colaboradores: 120, registros: 1, corridas_mes: 2, rfc_adicionales: 1, preventiva: true, repse: true, ejercicios_anteriores: 2 });
  assert.equal(c.iguala_mensual, 14500 + 5075 + 4350);
  assert.equal(c.una_vez.find(x => /REPSE/.test(x.concepto)).importe, 28000);
  assert.equal(c.una_vez.find(x => /Ejercicio/.test(x.concepto)).importe, 75000 * 0.55 * 2);
  assert.equal(cotizar({ colaboradores: 30 }).cotizable, false);
  assert.match(cotizar({ colaboradores: 2000, registros: 5, corridas_mes: 4, rfc_adicionales: 1 }).motivo, /suma de las fórmulas/);
});

import { baseDatos, r2Local } from './util.js';
import { archivosPrueba, CAL } from './fixtures-cfdi.mjs';
import { crearIngesta, avanzar } from '../../ingesta/trabajos.js';
import { rutasCotizador } from '../../api/cotizador.js';

test('perfil del encargo desde sus datos; la cotización guardada no cambia', async () => {
  const db = baseDatos(), DOCS = r2Local(), env = { DB: db, DOCS };
  db.raw.exec("INSERT INTO empresas (id, nombre, slug) VALUES (1, 'PRIMEWIRELESS', 'prime')");
  db.raw.exec("INSERT INTO usuarios (id, email, password_hash, nombre, rol) VALUES (2,'rev@hrm','x','Revisor','admin')");
  db.raw.exec("INSERT INTO encargo (id, empresa_id, nivel, periodo_desde, periodo_hasta, ejercicio, origen_nomina, carga_patronal_c) VALUES ('enc_q', 1, 'B5+', '2026-08-01', '2026-08-31', 2026, 'cliente', 2775564100)");
  for (const c of CAL) db.raw.prepare("INSERT INTO calendario_nomina (encargo_id, corrida_id, periodicidad, desde, hasta, fecha_pago, ordinaria, fuente) VALUES ('enc_q',?,?,?,?,?,?,'prueba')")
    .run(c.corrida_id, c.periodicidad, c.desde, c.hasta, c.fecha_pago, c.ordinaria ? 1 : 0);
  await DOCS.put('p.xlsx', archivosPrueba().prenomina);
  const pre = await crearIngesta(env, { encargo_id: 'enc_q', r2_key: 'p.xlsx' });
  for (let i = 0; i < 10; i++) { const r = await avanzar(env, { ingesta_id: pre }); if (['terminado', 'error'].includes(r.estado)) break; }
  const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s });
  const llamar = async (m, ruta, body, u = { id: 2, rol: 'admin' }) => { const r = await rutasCotizador(new Request('https://x' + ruta, { method: m, body: body ? JSON.stringify(body) : undefined }), env, u, {}, J); return { status: r.status, json: await r.json() }; };
  const p = (await llamar('GET', '/api/kernel/cotizador/perfil?encargo_id=enc_q')).json.perfil;
  assert.deepEqual([p.colaboradores, p.registros, p.corridas_mes, p.carga_patronal_mensual_c], [4, 1, 3, 2775564100]);
  assert.equal((await llamar('POST', '/api/kernel/cotizador', { insumos: p })).status, 400, 'menos de 40 colaboradores');
  const g = await llamar('POST', '/api/kernel/cotizador', { insumos: { ...p, colaboradores: 3597, registros: 30, corridas_mes: 14 }, guardar: true, empresa_id: 1, encargo_id: 'enc_q' });
  assert.equal(g.status, 201);
  assert.equal(g.json.cotizacion.iguala_mensual, 267000);
  assert.throws(() => db.raw.exec('UPDATE cotizacion SET iguala_mensual = 1'), /no cambia/);
  assert.equal((await llamar('GET', '/api/kernel/cotizaciones')).json.cotizaciones.length, 1);
  assert.equal((await llamar('GET', '/api/kernel/cotizaciones', null, { id: 3, rol: 'socio' })).status, 403);
});
