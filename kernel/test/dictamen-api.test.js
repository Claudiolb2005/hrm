// Rutas de hallazgos y dictamen contra SQLite con la forma de D1: la base hace cumplir T6 y T7.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rutasKernel } from '../../api/kernel.js';
import { rutasDictamen } from '../../api/dictamen.js';
import { baseDatos } from './util.js';

const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
const ADMIN = { id: 2, nombre: 'Revisor', rol: 'admin' };
const SOCIO = { id: 3, nombre: 'Socio', rol: 'socio', empresa_id: 1 };
const OTRO = { id: 4, nombre: 'Otro', rol: 'socio', empresa_id: 2 };

async function entorno() {
  const db = baseDatos();
  db.raw.exec("INSERT INTO empresas (id, nombre, slug, rfc) VALUES (1, 'PRIMEWIRELESS', 'prime', 'PHO110101AAA'), (2, 'PRIME SERVICIOS', 'prime-s', 'PSE110101BBB'), (3, 'AJENA', 'ajena', 'AJE110101CCC')");
  db.raw.exec("INSERT INTO usuarios (id, email, password_hash, nombre, rol, empresa_id) VALUES (2,'rev@hrm','x','Revisor','admin',NULL), (3,'s@p','x','Socio','socio',1), (4,'o@p','x','Otro','socio',2)");
  const llamar = async (metodo, ruta, body, u = ADMIN) => {
    const req = new Request('https://x' + ruta, { method: metodo, body: body ? JSON.stringify(body) : undefined });
    const r = (await rutasDictamen(req.clone(), { DB: db }, u, {}, J)) || (await rutasKernel(req, { DB: db }, u, {}, J));
    return { status: r.status, json: await r.json() };
  };
  return { db, llamar };
}

const FUENTES = { prenomina: { estado: 'completa', sha256: 'f'.repeat(64) }, catalogo_conceptos_cliente: { estado: 'completa' } };

async function encargoConDiferencia(llamar, { id = 'enc1', empresa_id = 1, fuentes = FUENTES, desde = '2026-08-01', hasta = '2026-08-31' } = {}) {
  await llamar('POST', '/api/kernel/encargos', { id, empresa_id, nivel: 'B5+', periodo_desde: desde, periodo_hasta: hasta, ejercicio: 2026, origen_nomina: 'cliente' });
  const ej = await llamar('POST', '/api/kernel/ejecutar', { encargo_id: id, corrida_id: 'SEM31', fuentes,
    items: [{ regla_id: 'CALC-ISR-SEM-001', colaborador_id: '1073134', entrada: { base_gravable_c: 220668, fecha_pago: '2026-08-06' } },
            { regla_id: 'CALC-ISR-SEM-001', colaborador_id: '1067513', entrada: { base_gravable_c: 776068, fecha_pago: '2026-08-06' } }] });
  await llamar('POST', '/api/kernel/movimientos', { encargo_id: id, archivo_sha256: 'p'.repeat(64), movimientos: [
    { corrida_id: 'SEM31', colaborador_id: '1073134', rubro: 'isr', valor_c: 2942 },
    { corrida_id: 'SEM31', colaborador_id: '1067513', rubro: 'isr', valor_c: 122287 + 1 }] }); // +0.01: ruido
  const rec = await llamar('POST', '/api/kernel/reconciliar', { ejecucion_id: ej.json.ejecucion.id });
  return { ejecucion_id: ej.json.ejecucion.id, rec: rec.json };
}

test('T4 en la reconciliación: el centavo es ruido; los −4.68 no', async () => {
  const { llamar } = await entorno();
  const { rec } = await encargoConDiferencia(llamar);
  assert.equal(rec.diferencias, 1);
  assert.equal(rec.dentro_de_tolerancia, 1);
});

test('del hallazgo al dictamen: bloqueos, cédula, materialidad, opinión, huella y versión 2', async () => {
  const { db, llamar } = await entorno();
  const { ejecucion_id } = await encargoConDiferencia(llamar, { fuentes: { ...FUENTES, xml_nomina: { estado: 'completa', sha256: 'x'.repeat(64) } } });

  let pr = await llamar('GET', '/api/kernel/dictamen/propuesta?encargo_id=enc1&ejecucion_id=' + ejecucion_id);
  assert.match(pr.json.bloqueos.join(' '), /sin clasificar/);
  assert.equal((await llamar('POST', '/api/kernel/dictamen/emitir', { encargo_id: 'enc1', ejecucion_id })).status, 409);

  await llamar('POST', '/api/kernel/clasificar-grupo', { encargo_id: 'enc1', regla_id: 'CALC-ISR-SEM-001', diferencia_c: -468, cubeta: 'proceso_mal', motivo: 'Subsidio 15.59% (hallazgo 1)' });
  pr = await llamar('GET', '/api/kernel/dictamen/propuesta?encargo_id=enc1&ejecucion_id=' + ejecucion_id);
  assert.match(pr.json.bloqueos.join(' '), /sin hallazgo/);
  const pend = await llamar('GET', '/api/kernel/hallazgos/pendientes?encargo_id=enc1');
  assert.equal(pend.json.pendientes[0].suma_abs_c, 468);

  // Cédula incompleta se rechaza; la completa liga la diferencia.
  assert.equal((await llamar('POST', '/api/kernel/hallazgos', { encargo_id: 'enc1', titulo: 'x' })).status, 400);
  const h = await llamar('POST', '/api/kernel/hallazgos', { encargo_id: 'enc1', titulo: 'Subsidio con el porcentaje de enero', modulo: '4.3', tipo: 'cuantitativo',
    riesgo: 'medio', criterio: 'Decreto DOF 31-dic-2025: 15.02 % de la UMA desde febrero', condicion: 'Aplica 15.59 %: $128.02 por semana en lugar de $123.34',
    regla_id: 'CALC-ISR-SEM-001', rubro: 'isr', diferencias: { regla_id: 'CALC-ISR-SEM-001', motivo: 'Subsidio 15.59% (hallazgo 1)' } });
  assert.equal(h.status, 201, JSON.stringify(h.json));
  assert.equal(h.json.diferencias, 1);
  assert.equal(h.json.id, 'enc1-H01');
  // La diferencia que sustenta el hallazgo ya no cambia de cubeta en silencio; el hallazgo no se borra.
  assert.throws(() => db.raw.exec("UPDATE diferencia SET cubeta = 'kernel_mal' WHERE id IN (SELECT diferencia_id FROM hallazgo_diferencia)"), /sustenta un hallazgo/);
  assert.throws(() => db.raw.exec("DELETE FROM hallazgo"), /no se borra/);

  // Sin carga patronal la materialidad queda indeterminada y no se emite.
  pr = await llamar('GET', '/api/kernel/dictamen/propuesta?encargo_id=enc1&ejecucion_id=' + ejecucion_id);
  assert.match(pr.json.bloqueos.join(' '), /carga patronal/);
  await llamar('POST', '/api/kernel/encargo/config', { encargo_id: 'enc1', carga_patronal_c: 2775600000, carga_patronal_fuente: 'SUA agosto 2026' });
  pr = await llamar('GET', '/api/kernel/dictamen/propuesta?encargo_id=enc1&ejecucion_id=' + ejecucion_id);
  assert.deepEqual(pr.json.bloqueos, []);
  assert.equal(pr.json.umbral.umbral_c, 13878000);
  assert.equal(pr.json.hallazgos[0].efecto_max_c, 468);
  assert.equal(pr.json.hallazgos[0].material, false);
  assert.equal(pr.json.propuesta.opinion, 'conforme_con_observaciones');

  // Cambiar la opinión exige motivo; emitir v1.
  assert.equal((await llamar('POST', '/api/kernel/dictamen/emitir', { encargo_id: 'enc1', ejecucion_id, opinion: 'conforme' })).status, 400);
  const v1 = await llamar('POST', '/api/kernel/dictamen/emitir', { encargo_id: 'enc1', ejecucion_id });
  assert.equal(v1.status, 201, JSON.stringify(v1.json));
  assert.equal(v1.json.opinion, 'conforme_con_observaciones');
  assert.throws(() => db.raw.exec("UPDATE dictamen SET opinion = 'conforme'"), /inmutable/);

  // El cliente ve su dictamen íntegro; otro cliente no.
  const vista = await llamar('GET', '/api/dictamen?id=' + v1.json.id, null, SOCIO);
  assert.equal(vista.json.integro, true);
  assert.equal(vista.json.dictamen.contenido.s6_cedulas[0].titulo, 'Subsidio con el porcentaje de enero');
  assert.match(vista.json.dictamen.contenido.portada.nota_alcance, /No constituye ni sustituye/);
  assert.equal((await llamar('GET', '/api/dictamen?id=' + v1.json.id, null, OTRO)).status, 404);
  assert.equal((await llamar('GET', '/api/dictamenes', null, SOCIO)).json.dictamenes.length, 1);
  assert.equal((await llamar('GET', '/api/dictamenes', null, OTRO)).json.dictamenes.length, 0);
  assert.equal((await llamar('GET', '/api/kernel/hallazgos?encargo_id=enc1', null, SOCIO)).status, 403);

  // Reproceso: sin motivo no; con motivo emite v2 y el hallazgo queda confirmado (no desaparece).
  assert.equal((await llamar('POST', '/api/kernel/dictamen/emitir', { encargo_id: 'enc1', ejecucion_id })).status, 400);
  const v2 = await llamar('POST', '/api/kernel/dictamen/emitir', { encargo_id: 'enc1', ejecucion_id, motivo_version: 'El cliente entregó los XML corregidos', disparado_por: 'cliente' });
  assert.equal(v2.status, 201, JSON.stringify(v2.json));
  assert.deepEqual(v2.json.transiciones.map(t => t.despues), ['confirmado']);
  const vs = (await llamar('GET', '/api/dictamen?id=' + v2.json.id, null, SOCIO)).json.versiones;
  assert.deepEqual(vs.map(v => v.version), [1, 2]);
  const bit = (await llamar('GET', '/api/kernel/hallazgo?id=enc1-H01')).json.bitacora;
  assert.ok(bit.some(b => b.campo === 'estatus' && b.despues === 'confirmado'));

  // Cierre y regla de 60 días, en la base.
  assert.equal((await llamar('POST', '/api/kernel/encargo/cerrar', { encargo_id: 'enc1' })).status, 200);
  db.raw.exec("DROP TRIGGER encargo_cierre_fijo"); db.raw.exec("UPDATE encargo SET cerrado_en = '2026-01-01T00:00:00Z' WHERE id = 'enc1'");
  const v3 = await llamar('POST', '/api/kernel/dictamen/emitir', { encargo_id: 'enc1', ejecucion_id, motivo_version: 'HRM detectó un error propio', disparado_por: 'hrm' });
  assert.equal(v3.status, 400);
  assert.match(v3.json.error, /encargo nuevo/);
});

test('D13: sin XML originales la propuesta es sin opinión y el revisor no puede cambiarla', async () => {
  const { llamar } = await entorno();
  const { ejecucion_id } = await encargoConDiferencia(llamar);
  await llamar('POST', '/api/kernel/clasificar-grupo', { encargo_id: 'enc1', diferencia_c: -468, cubeta: 'proceso_mal', motivo: 'Subsidio 15.59%' });
  await llamar('POST', '/api/kernel/hallazgos', { encargo_id: 'enc1', titulo: 'Subsidio', modulo: '4.3', tipo: 'cuantitativo', riesgo: 'medio', criterio: 'Decreto', condicion: '15.59 %', diferencias: { rubro: 'isr' } });
  await llamar('POST', '/api/kernel/encargo/config', { encargo_id: 'enc1', carga_patronal_c: 100000000 });
  const pr = await llamar('GET', '/api/kernel/dictamen/propuesta?encargo_id=enc1&ejecucion_id=' + ejecucion_id);
  assert.equal(pr.json.propuesta.opinion, 'sin_opinion');
  assert.deepEqual(pr.json.propuesta.faltan_fuentes, ['xml_nomina']);
  const r = await llamar('POST', '/api/kernel/dictamen/emitir', { encargo_id: 'enc1', ejecucion_id, opinion: 'conforme', motivo_cambio: 'El revisor lo considera suficiente' });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /D13/);
});

test('cualitativo sin diferencias, cierre con motivo y separación de personas', async () => {
  const { llamar } = await entorno();
  await llamar('POST', '/api/kernel/encargos', { id: 'enc1', empresa_id: 1, nivel: 'B5+', periodo_desde: '2026-08-01', periodo_hasta: '2026-08-31', ejercicio: 2026, origen_nomina: 'cliente' });
  assert.equal((await llamar('POST', '/api/kernel/hallazgos', { encargo_id: 'enc1', titulo: 'Prima de Coahuila', modulo: '4.6', tipo: 'cuantitativo', riesgo: 'alto', criterio: 'LSS art. 74', condicion: 'SUA 2.1114 % vs nómina 0.524 %' })).status, 400,
    'cuantitativo sin diferencias necesita su valuación');
  const h = await llamar('POST', '/api/kernel/hallazgos', { encargo_id: 'enc1', titulo: 'Retención de ISR no enterada', modulo: '4.3', tipo: 'cualitativo', motivo_cualitativo: 'retencion_no_enterada',
    riesgo: 'alto', criterio: 'CFF art. 108', condicion: 'Retenido $1,000 sin entero en la declaración provisional', efecto_max_c: 100000 });
  assert.equal(h.status, 201);
  await llamar('POST', '/api/kernel/encargo/config', { encargo_id: 'enc1', carga_patronal_c: 2775600000 });
  const l = await llamar('GET', '/api/kernel/hallazgos?encargo_id=enc1');
  assert.equal(l.json.hallazgos[0].material, true, 'cualitativo: siempre material aunque sea $1,000');
  assert.equal((await llamar('POST', '/api/kernel/hallazgo', { id: h.json.id, estatus: 'confirmado' })).status, 400);
  assert.equal((await llamar('POST', '/api/kernel/hallazgo', { id: h.json.id, estatus: 'corregido' })).status, 400, 'cerrar exige motivo');
  assert.equal((await llamar('POST', '/api/kernel/hallazgo', { id: h.json.id, estatus: 'corregido', motivo: 'Acuse del entero complementario del 10-sep' })).status, 200);
});

test('T7: un cliente en un solo grupo; el consolidado es la peor opinión y exige todos los RFC', async () => {
  const { db, llamar } = await entorno();
  assert.equal((await llamar('POST', '/api/kernel/grupos', { id: 'g_prime', nombre: 'Grupo PRIME', empresas: [1, 2] })).status, 201);
  assert.equal((await llamar('POST', '/api/kernel/grupos', { id: 'g_otro', nombre: 'Otro', empresas: [2, 3] })).status, 409);
  const xml = { ...FUENTES, xml_nomina: { estado: 'completa', sha256: 'x'.repeat(64) } };
  const a = await encargoConDiferencia(llamar, { id: 'encA', empresa_id: 1, fuentes: xml });
  const b = await encargoConDiferencia(llamar, { id: 'encB', empresa_id: 2, fuentes: xml });
  assert.equal((await llamar('POST', '/api/kernel/encargos-grupo', { id: 'eg1', grupo_id: 'g_prime', nivel: 'B5+', periodo_desde: '2026-08-01', periodo_hasta: '2026-08-31', encargos: ['encA', 'encB'] })).json.error || 201, 201);
  // Encargo de otro periodo no entra al contenedor.
  await llamar('POST', '/api/kernel/encargos', { id: 'encC', empresa_id: 1, nivel: 'B5+', periodo_desde: '2026-09-01', periodo_hasta: '2026-09-30', ejercicio: 2026, origen_nomina: 'cliente' });
  assert.throws(() => db.raw.exec("UPDATE encargo SET encargo_grupo_id = 'eg1' WHERE id = 'encC'"), /encargo de grupo/);
  assert.equal((await llamar('POST', '/api/kernel/dictamen/consolidado', { encargo_grupo_id: 'eg1' })).status, 409, 'faltan individuales');
  for (const [enc, ej, salvedad] of [['encA', a.ejecucion_id, false], ['encB', b.ejecucion_id, true]]) {
    await llamar('POST', '/api/kernel/clasificar-grupo', { encargo_id: enc, diferencia_c: -468, cubeta: 'proceso_mal', motivo: 'Subsidio 15.59%' });
    await llamar('POST', '/api/kernel/hallazgos', { encargo_id: enc, titulo: 'Subsidio', modulo: '4.3', tipo: 'cuantitativo', riesgo: 'medio', criterio: 'Decreto', condicion: '15.59 %', diferencias: { rubro: 'isr' } });
    await llamar('POST', '/api/kernel/encargo/config', { encargo_id: enc, carga_patronal_c: salvedad ? 1000 : 2775600000, materialidad_piso_c: salvedad ? 100 : 1000000 });
    const r = await llamar('POST', '/api/kernel/dictamen/emitir', { encargo_id: enc, ejecucion_id: ej });
    assert.equal(r.status, 201, JSON.stringify(r.json));
  }
  const c = await llamar('POST', '/api/kernel/dictamen/consolidado', { encargo_grupo_id: 'eg1' });
  assert.equal(c.status, 201, JSON.stringify(c.json));
  assert.equal(c.json.opinion, 'con_salvedades');
  assert.deepEqual(c.json.determinada_por, ['PSE110101BBB']);
});
