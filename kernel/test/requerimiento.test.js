// Requerimiento de información (módulo 23) y el encargo visto por el cliente (módulos 25 y 27).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseDatos, r2Local } from './util.js';
import { archivosPrueba, CAL } from './fixtures-cfdi.mjs';
import { avanzar } from '../../ingesta/trabajos.js';
import { rutasRequerimiento } from '../../api/requerimiento.js';
import { rutasDictamen } from '../../api/dictamen.js';
import { rutasKernel } from '../../api/kernel.js';
import { rutasCfdi } from '../../api/cfdi.js';

const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
const ADMIN = { id: 2, nombre: 'Revisor', rol: 'admin' };
const SOCIO = { id: 3, nombre: 'Ana (PRIME)', rol: 'socio', empresa_id: 1 };
const OTRO = { id: 4, nombre: 'Otro', rol: 'socio', empresa_id: 2 };

async function entorno() {
  const db = baseDatos();
  const DOCS = r2Local();
  const env = { DB: db, DOCS };
  db.raw.exec("INSERT INTO empresas (id, nombre, slug, rfc) VALUES (1, 'PRIMEWIRELESS', 'prime', 'PHO190128QD8'), (2, 'OTRA', 'otra', 'OTR010101AAA')");
  db.raw.exec("INSERT INTO usuarios (id, email, password_hash, nombre, rol, empresa_id) VALUES (2,'rev@hrm','x','Revisor','admin',NULL), (3,'ana@prime','x','Ana (PRIME)','socio',1), (4,'o@o','x','Otro','socio',2)");
  db.raw.exec("INSERT INTO encargo (id, empresa_id, nivel, periodo_desde, periodo_hasta, ejercicio, origen_nomina, aplica_ajuste_mensual) VALUES ('enc_r', 1, 'B5+', '2026-08-01', '2026-08-31', 2026, 'cliente', 0)");
  for (const c of CAL) db.raw.prepare("INSERT INTO calendario_nomina (encargo_id, corrida_id, periodicidad, desde, hasta, fecha_pago, ordinaria, fuente) VALUES ('enc_r',?,?,?,?,?,?,'prueba')")
    .run(c.corrida_id, c.periodicidad, c.desde, c.hasta, c.fecha_pago, c.ordinaria ? 1 : 0);
  db.raw.exec("INSERT INTO registro_patronal (empresa_id, registro, entidad, fuente) VALUES (1, 'Y6079749104', 'CDMX', 'prueba')");
  const pend = [];
  const ctx = { waitUntil: (p) => pend.push(p) };
  const llamar = async (metodo, ruta, body, u = ADMIN) => {
    const init = { method: metodo };
    if (body instanceof FormData) init.body = body; else if (body) init.body = JSON.stringify(body);
    const req = new Request('https://x' + ruta, init);
    const r = (await rutasRequerimiento(req.clone(), env, u, {}, J, ctx)) || (await rutasCfdi(req.clone(), env, u, {}, J, ctx)) || (await rutasDictamen(req.clone(), env, u, {}, J)) || (await rutasKernel(req, env, u, {}, J, ctx));
    return { status: r.status, json: await r.json() };
  };
  return { db, env, llamar, pend };
}
const archivo = (enc, fuente, nombre, bytes) => { const fd = new FormData(); fd.append('encargo_id', enc); fd.append('fuente_clave', fuente); fd.append('file', new Blob([bytes]), nombre); return fd; };

test('requerimiento: sale de la matriz, la nómina y los XML son indispensables, y se marca solo al leer', async () => {
  const { env, llamar, pend } = await entorno();
  const g = await llamar('POST', '/api/kernel/requerimiento/generar', { encargo_id: 'enc_r', responsable: 'Ana, Nóminas', fecha_compromiso: '2026-09-05' });
  assert.equal(g.status, 201);
  const req = g.json.requerimiento;
  const de = (k) => req.find(r => r.fuente_clave === k);
  assert.equal(de('prenomina').esencial, 1);
  assert.equal(de('xml_nomina').esencial, 1);
  assert.equal(de('sua_ema').obligatoria, 1, 'IMSS la exige');
  assert.equal(de('convenio_fondo_ahorro').obligatoria, 0, 'opcional en la matriz');
  assert.equal(de('prenomina').estado_efectivo, 'pendiente');
  assert.equal(de('prenomina').vencida, true, 'la fecha comprometida ya pasó');
  assert.equal((await llamar('POST', '/api/kernel/requerimiento/generar', { encargo_id: 'enc_r' })).json.requerimiento.length, req.length, 'generar dos veces no duplica');

  // El cliente ve su encargo y sube la prenómina; otro cliente no lo ve.
  assert.equal((await llamar('GET', '/api/encargos', null, SOCIO)).json.encargos.length, 1);
  assert.equal((await llamar('GET', '/api/encargo?id=enc_r', null, OTRO)).status, 404);
  assert.equal((await llamar('POST', '/api/encargo/archivo', archivo('enc_r', 'prenomina', 'p.xlsx', archivosPrueba().prenomina), OTRO)).status, 404);
  assert.equal((await llamar('POST', '/api/encargo/archivo', archivo('enc_r', 'no_existe', 'p.xlsx', new Uint8Array(3)), SOCIO)).status, 400);
  const up = await llamar('POST', '/api/encargo/archivo', archivo('enc_r', 'prenomina', 'prenomina_agosto.xlsx', archivosPrueba().prenomina), SOCIO);
  assert.equal(up.status, 201);
  let e = await llamar('GET', '/api/encargo?id=enc_r', null, SOCIO);
  assert.equal(e.json.requerimiento.find(r => r.fuente_clave === 'prenomina').estado_efectivo, 'entregada');

  // HRM rechaza con motivo o procesa: procesar crea la ingesta y la prenómina queda marcada por su lectura.
  assert.equal((await llamar('POST', '/api/kernel/requerimiento/archivo/revisar', { id: up.json.id, revision: 'rechazado' })).status, 400, 'rechazar exige motivo');
  assert.equal((await llamar('POST', '/api/kernel/requerimiento/archivo/procesar', { id: up.json.id }, SOCIO)).status, 403);
  const pr = await llamar('POST', '/api/kernel/requerimiento/archivo/procesar', { id: up.json.id });
  assert.equal(pr.status, 200, JSON.stringify(pr.json));
  await Promise.all(pend);
  for (let i = 0; i < 10; i++) { const r = await avanzar(env, { ingesta_id: pr.json.ingesta_id }); if (['terminado', 'error'].includes(r.estado)) break; }
  e = await llamar('GET', '/api/encargo?id=enc_r', null, SOCIO);
  const p = e.json.requerimiento.find(r => r.fuente_clave === 'prenomina');
  assert.equal(p.estado_efectivo, 'completa');
  assert.equal(p.evidencia.por, 'ingesta de la prenómina');
  assert.equal((await llamar('POST', '/api/kernel/requerimiento/archivo/procesar', { id: up.json.id })).status, 409, 'no se procesa dos veces');

  // «No aplica» exige nota.
  assert.equal((await llamar('POST', '/api/kernel/requerimiento/item', { encargo_id: 'enc_r', fuente_clave: 'convenio_fondo_ahorro', estado: 'no_aplica' })).status, 400);
  assert.equal((await llamar('POST', '/api/kernel/requerimiento/item', { encargo_id: 'enc_r', fuente_clave: 'convenio_fondo_ahorro', estado: 'no_aplica', nota: 'Sin fondo de ahorro en agosto' })).status, 200);
});

test('el cliente ve sólo hallazgos publicados, propone responsable y fecha, y no puede cerrarlos', async () => {
  const { db, env, llamar, pend } = await entorno();
  await llamar('POST', '/api/kernel/requerimiento/generar', { encargo_id: 'enc_r', responsable: 'Ana', fecha_compromiso: '2026-12-31' });
  const up = await llamar('POST', '/api/encargo/archivo', archivo('enc_r', 'prenomina', 'p.xlsx', archivosPrueba().prenomina), SOCIO);
  const pr = await llamar('POST', '/api/kernel/requerimiento/archivo/procesar', { id: up.json.id });
  await Promise.all(pend);
  for (let i = 0; i < 10; i++) { const r = await avanzar(env, { ingesta_id: pr.json.ingesta_id }); if (['terminado', 'error'].includes(r.estado)) break; }
  await llamar('POST', '/api/kernel/clasificar-grupo', { encargo_id: 'enc_r', diferencia_c: -468, cubeta: 'proceso_mal', motivo: 'Subsidio 15.59 %' });
  const h = await llamar('POST', '/api/kernel/hallazgos', { encargo_id: 'enc_r', titulo: 'Subsidio con el porcentaje de enero', modulo: '4.3', tipo: 'cuantitativo', riesgo: 'medio',
    criterio: 'Decreto DOF 31-dic-2025', condicion: '15.59 % en lugar de 15.02 %', recomendacion: 'Actualizar el parámetro', diferencias: { rubro: 'isr' } });
  // En papel de trabajo: el cliente todavía no lo ve.
  assert.equal((await llamar('GET', '/api/encargo?id=enc_r', null, SOCIO)).json.hallazgos.length, 0);
  assert.equal((await llamar('POST', '/api/encargo/hallazgo', { id: h.json.id, responsable: 'x' }, SOCIO)).status, 404);

  await llamar('POST', '/api/kernel/encargo/config', { encargo_id: 'enc_r', carga_patronal_c: 2775600000, carga_patronal_fuente: 'prueba' });
  const ej = db.raw.prepare("SELECT ejecucion_id FROM ingesta WHERE encargo_id = 'enc_r'").get().ejecucion_id;
  const prop = await llamar('GET', '/api/kernel/dictamen/propuesta?encargo_id=enc_r&ejecucion_id=' + ej);
  assert.equal(prop.json.propuesta.opinion, 'sin_opinion', 'faltan los XML');
  assert.ok(prop.json.requerimiento.some(r => r.fuente === 'xml_nomina' && r.responsable === 'Ana' && r.solicitado_en), 'la limitación nombra documento, responsable y fecha');
  const v1 = await llamar('POST', '/api/kernel/dictamen/emitir', { encargo_id: 'enc_r', ejecucion_id: ej });
  assert.equal(v1.status, 201, JSON.stringify(v1.json));
  const cont = JSON.parse(db.raw.prepare('SELECT contenido_json FROM dictamen').get().contenido_json);
  assert.ok(cont.s1_alcance.requerimiento_pendiente.some(r => r.fuente === 'xml_nomina'));

  const vis = (await llamar('GET', '/api/encargo?id=enc_r', null, SOCIO)).json;
  assert.equal(vis.hallazgos.length, 1);
  assert.equal(vis.dictamenes.length, 1);
  const r = await llamar('POST', '/api/encargo/hallazgo', { id: h.json.id, responsable: 'Nóminas PRIME', fecha_compromiso: '2026-11-15', comentario: 'Ya pedimos el cambio al proveedor', en_correccion: true }, SOCIO);
  assert.equal(r.json.cambios, 3);
  const hz = db.raw.prepare('SELECT responsable, estatus FROM hallazgo WHERE id = ?').get(h.json.id);
  assert.deepEqual([hz.responsable, hz.estatus], ['Nóminas PRIME', 'en_correccion']);
  const bit = db.raw.prepare('SELECT quien FROM hallazgo_bitacora WHERE hallazgo_id = ? AND campo = ?').get(h.json.id, 'responsable');
  assert.equal(bit.quien, 'Cliente: Ana (PRIME)');
  assert.equal((await llamar('POST', '/api/encargo/hallazgo', { id: h.json.id, comentario: 'Adjuntamos evidencia por correo' }, SOCIO)).json.cambios, 1);
  assert.equal((await llamar('POST', '/api/encargo/hallazgo', { id: h.json.id, responsable: 'x' }, OTRO)).status, 404);
  assert.equal((await llamar('GET', '/api/kernel/requerimiento?encargo_id=enc_r', null, SOCIO)).status, 403);
});
