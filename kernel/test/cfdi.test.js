// XML de nómina (B3), metadata del SAT y cruce nómina ↔ CFDI (módulo 4.2), de punta a punta.
// Comprobantes sintéticos con la forma del Anexo 20 y la guía de nómina 1.2; ninguno es de un cliente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseDatos, r2Local } from './util.js';
import { cfdiXml, U, CAL, archivosPrueba } from './fixtures-cfdi.mjs';
import { crearIngesta, avanzar, estadoIngesta } from '../../ingesta/trabajos.js';
import { crearIngestaCfdi, avanzarCfdi, estadoIngestaCfdi, reintentarCfdi } from '../../ingesta/cfdi.js';
import { leerCfdi, asignarCorrida, leerMetadataSat } from '../../ingesta/cfdi-xml.js';
import { cruzarNominaCfdi, emparejarExtras } from '../../ingesta/cruce.js';
import { rutasDictamen } from '../../api/dictamen.js';
import { rutasCfdi } from '../../api/cfdi.js';
import { rutasKernel } from '../../api/kernel.js';

test('lee el CFDI de nómina con cualquier prefijo y reporta lo que no cuadra dentro del comprobante', () => {
  const base = { uuid: U(1), emp: '1067513', ffp: '2026-08-02', fip: '2026-07-27', fpago: '2026-08-06', percep: 783949, isr: 122287 };
  const c = leerCfdi(cfdiXml(base));
  assert.equal(c.uuid, U(1));
  assert.equal(c.num_empleado, '1067513');
  assert.equal(c.registro_patronal, 'Y6079749104');
  assert.equal(c.total_percepciones_c, 783949);
  assert.equal(c.isr_retenido_c, 122287);
  assert.equal(c.total_c, 661662);
  assert.deepEqual(c.errores, []);
  assert.equal(leerCfdi(cfdiXml({ ...base, prefijo: 'n12' })).isr_retenido_c, 122287, 'el prefijo se resuelve por su espacio de nombres');
  assert.match(leerCfdi(cfdiXml({ ...base, total: 1 })).errores.join(' '), /Total 1 ≠/);
  assert.equal(leerCfdi(cfdiXml({ ...base, version: '3.3' })).version, '3.3');
  assert.throws(() => leerCfdi('<hola/>'), /No es un CFDI/);
});

test('D5: la corrida sale de FechaFinalPago y la periodicidad; sin coincidencia única no se adivina', () => {
  assert.equal(asignarCorrida({ tipo_nomina: 'O', periodicidad_pago: '02', fecha_final_pago: '2026-08-02' }, CAL).corrida_id, 'SEM31');
  assert.equal(asignarCorrida({ tipo_nomina: 'O', periodicidad_pago: '03', fecha_final_pago: '2026-08-09' }, CAL).corrida_id, 'CAT16');
  assert.equal(asignarCorrida({ tipo_nomina: 'O', periodicidad_pago: '02', fecha_final_pago: '2026-08-09' }, CAL).corrida_id, null);
  assert.equal(asignarCorrida({ tipo_nomina: 'E', periodicidad_pago: '99', fecha_pago: '2026-08-13', fecha_final_pago: '2026-08-09' }, CAL).corrida_id, 'BONO_SEM_32');
  assert.match(asignarCorrida({ tipo_nomina: 'E', fecha_pago: '2026-08-20', fecha_final_pago: '2026-08-16' }, CAL).motivo, /ninguna corrida extra/);
});

test('metadata del SAT: estatus 1 vigente, 0 cancelado; renglones que no se entienden se cuentan', () => {
  const t = 'Uuid~RfcEmisor~NombreEmisor~RfcReceptor~NombreReceptor~RfcPac~FechaEmision~FechaCertificacionSat~Monto~EfectoComprobante~Estatus~FechaCancelacion\n' +
    U(1).toLowerCase() + '~PHO190128QD8~X~XAXX010101000~Y~SAT970701NN3~2026-08-06~2026-08-06~6616.62~N~1~\n' + U(2) + '~PHO190128QD8~X~R~Y~P~f~f~1~N~0~2026-08-20\nbasura';
  const m = leerMetadataSat(t);
  assert.deepEqual(m.registros.map(r => [r.uuid, r.estatus]), [[U(1), 'vigente'], [U(2), 'cancelado']]);
  assert.equal(m.errores.length, 1);
});

test('cruce: suma por llave, coincidencia al centavo, sin CFDI y sin nómina', () => {
  const nom = [['1', 'SEM31', 'neto', 100], ['1', 'SEM31', 'isr', 10], ['2', 'SEM31', 'neto', 50], ['3', 'SEM31', 'neto', 0]]
    .map(([l, c, r, v], i) => ({ colaborador_llave: l, corrida_id: c, rubro: r, valor_c: v, movimiento_id: 'm' + i }));
  const f = [{ uuid: 'a', colaborador_llave: '1', corrida_id: 'SEM31', total_percepciones_c: 0, isr_retenido_c: 4, total_c: 60 },
    { uuid: 'b', colaborador_llave: '1', corrida_id: 'SEM31', total_percepciones_c: 0, isr_retenido_c: 6, total_c: 40 },
    { uuid: 'c', colaborador_llave: '9', corrida_id: 'SEM31', total_percepciones_c: 0, isr_retenido_c: 0, total_c: 5 }];
  const r = cruzarNominaCfdi(nom, f, { rubros: ['isr', 'neto'] });
  assert.equal(r.coincidencias, 1, 'dos CFDI del mismo pago se suman');
  assert.equal(r.multiples_cfdi, 1);
  assert.deepEqual(r.por_tipo, { sin_cfdi: 1, sin_nomina: 1 }, 'el renglón en cero no exige comprobante');
});

const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
const ADMIN = { id: 2, nombre: 'Revisor', rol: 'admin' };

async function preparar() {
  const db = baseDatos();
  const DOCS = r2Local();
  const env = { DB: db, DOCS };
  db.raw.exec("INSERT INTO empresas (id, nombre, slug, rfc) VALUES (1, 'PRIMEWIRELESS', 'prime', 'PHO190128QD8')");
  db.raw.exec("INSERT INTO usuarios (id, email, password_hash, nombre, rol) VALUES (2,'rev@hrm','x','Revisor','admin')");
  db.raw.exec("INSERT INTO encargo (id, empresa_id, nivel, periodo_desde, periodo_hasta, ejercicio, origen_nomina, aplica_ajuste_mensual) VALUES ('enc_c', 1, 'B5+', '2026-08-01', '2026-08-31', 2026, 'cliente', 0)");
  for (const c of CAL) db.raw.prepare("INSERT INTO calendario_nomina (encargo_id, corrida_id, periodicidad, desde, hasta, fecha_pago, ordinaria, fuente) VALUES ('enc_c',?,?,?,?,?,?,'prueba')")
    .run(c.corrida_id, c.periodicidad, c.desde, c.hasta, c.fecha_pago, c.ordinaria ? 1 : 0);
  db.raw.exec("INSERT INTO registro_patronal (empresa_id, registro, entidad, fuente) VALUES (1, 'Y6079749104', 'CDMX', 'prueba')");
  const ap = archivosPrueba();
  await DOCS.put('p.xlsx', ap.prenomina);
  await DOCS.put('x.zip', ap.zip);
  await DOCS.put('m.txt', ap.meta);
  const llamar = async (metodo, ruta, body) => {
    const req = new Request('https://x' + ruta, { method: metodo, body: body ? JSON.stringify(body) : undefined });
    const r = (await rutasCfdi(req.clone(), env, ADMIN, {}, J)) || (await rutasDictamen(req.clone(), env, ADMIN, {}, J)) || (await rutasKernel(req, env, ADMIN, {}, J));
    return { status: r.status, json: await r.json() };
  };
  return { db, env, llamar };
}
async function hasta(fn, id, fin) { let r; for (let i = 0; i < 20; i++) { r = await fn(id); if (fin.includes(r.estado)) return r; } return r; }

test('XML de punta a punta: lee, asigna corrida, descarta cancelados y repetidos, cruza y alimenta el dictamen', async () => {
  const { db, env, llamar } = await preparar();
  // El cruce exige la prenómina terminada.
  const temprano = await crearIngestaCfdi(env, { encargo_id: 'enc_c', tipo: 'xml_nomina', r2_key: 'x.zip' });
  const e0 = await hasta((id) => avanzarCfdi(env, { ingesta_id: id }), temprano, ['terminado', 'error']);
  assert.equal(e0.estado, 'error');
  assert.match((await estadoIngestaCfdi(db, temprano)).error, /prenómina/);

  const pre = await crearIngesta(env, { encargo_id: 'enc_c', r2_key: 'p.xlsx' });
  assert.equal((await hasta((id) => avanzar(env, { ingesta_id: id }), pre, ['terminado', 'error'])).estado, 'terminado', (await estadoIngesta(db, pre)).error || '');
  const neto = db.raw.prepare("SELECT valor_c FROM movimiento_nomina WHERE ingesta_id = ? AND rubro = 'neto' AND colaborador_id = '1073134'").get(pre);
  assert.equal(neto.valor_c, 217726, 'la prenómina guarda el neto para el cruce');

  const meta = await crearIngestaCfdi(env, { encargo_id: 'enc_c', tipo: 'metadata_sat', r2_key: 'm.txt' });
  assert.equal((await hasta((id) => avanzarCfdi(env, { ingesta_id: id }), meta, ['terminado', 'error'])).estado, 'terminado');

  // El paquete leído antes del error se vuelve a cruzar sin releer los XML.
  assert.equal(await reintentarCfdi(db, temprano), 'cruzando');
  const r = await hasta((id) => avanzarCfdi(env, { ingesta_id: id }), temprano, ['terminado', 'error']);
  const st = await estadoIngestaCfdi(db, temprano);
  assert.equal(r.estado, 'terminado', st.error || '');
  const rep = st.reporte;
  assert.equal(rep.xml, 8);
  assert.equal(rep.otros_archivos, 1);
  assert.equal(rep.comprobantes, 8);
  assert.equal(rep.validos, 4, 'a, b, c y d');
  assert.equal(rep.invalidos, 1);
  assert.equal(rep.duplicados, 1);
  assert.equal(rep.cancelados, 1);
  assert.equal(rep.sin_estado_sat, 0);
  assert.equal(rep.cruce.coincidencias, 2, '1067513 y el bono de 1071756');
  assert.deepEqual(rep.cruce.por_tipo, { diferencia: 2, sin_cfdi: 1, sin_nomina: 1 });
  assert.equal(rep.modulo_4_2.estado, 'universo_parcial');
  assert.ok(rep.modulo_4_2.motivos.some(m => /UUID repetidos/.test(m)));
  const difs = db.raw.prepare("SELECT colaborador_llave, rubro, nomina_c, cfdi_c FROM cruce_cfdi WHERE tipo = 'diferencia' ORDER BY rubro").all();
  assert.deepEqual(difs.map(d => [d.colaborador_llave, d.rubro, d.nomina_c, d.cfdi_c]), [['1073134', 'isr', 2942, 2800], ['1073134', 'neto', 217726, 217868]]);

  // Clasificar cruces, crear cédulas y ver el módulo 4.2 en la propuesta.
  const g = await llamar('GET', '/api/kernel/cruces/grupos?ingesta_cfdi_id=' + temprano);
  assert.equal(g.json.aceptacion.sin_clasificar, 4);
  assert.equal((await llamar('POST', '/api/kernel/cruces/clasificar', { ingesta_cfdi_id: temprano, tipo: 'diferencia', cubeta: 'proceso_mal', motivo: 'ISR timbrado distinto de la nómina' })).json.clasificados, 2);
  await llamar('POST', '/api/kernel/cruces/clasificar', { ingesta_cfdi_id: temprano, tipo: 'sin_cfdi', cubeta: 'proceso_mal', motivo: 'Pago sin CFDI vigente' });
  await llamar('POST', '/api/kernel/cruces/clasificar', { ingesta_cfdi_id: temprano, tipo: 'sin_nomina', cubeta: 'explicada', motivo: 'Timbrado de otra razón social (pendiente de confirmar)' });
  assert.equal((await llamar('POST', '/api/kernel/cruces/clasificar', { ingesta_cfdi_id: temprano, tipo: 'sin_nomina', cubeta: 'criterio_sin_resolver', motivo: 'x' })).status, 400);

  // Las diferencias del kernel (subsidio −4.68) también van a cédula.
  await llamar('POST', '/api/kernel/clasificar-grupo', { encargo_id: 'enc_c', diferencia_c: -468, cubeta: 'proceso_mal', motivo: 'Subsidio 15.59 %' });
  await llamar('POST', '/api/kernel/hallazgos', { encargo_id: 'enc_c', titulo: 'Subsidio con el porcentaje de enero', modulo: '4.3', tipo: 'cuantitativo', riesgo: 'medio', criterio: 'Decreto', condicion: '15.59 %', diferencias: { rubro: 'isr' } });
  const pend = await llamar('GET', '/api/kernel/hallazgos/pendientes?encargo_id=enc_c');
  assert.equal(pend.json.cruces.length, 3, 'isr y neto de la diferencia, y el pago sin CFDI');
  const h1 = await llamar('POST', '/api/kernel/hallazgos', { encargo_id: 'enc_c', titulo: 'ISR timbrado distinto del retenido', modulo: '4.2', tipo: 'cuantitativo', riesgo: 'medio',
    criterio: 'LISR art. 99 fr. III; CFF art. 29', condicion: 'El CFDI reporta 28.00 y la nómina retuvo 29.42', cruces: { tipo: 'diferencia' } });
  assert.equal(h1.json.cruces, 2);
  const h2 = await llamar('POST', '/api/kernel/hallazgos', { encargo_id: 'enc_c', titulo: 'Pago de nómina sin CFDI vigente', modulo: '4.2', tipo: 'cualitativo', motivo_cualitativo: 'pago_sin_cfdi',
    riesgo: 'alto', criterio: 'LISR art. 99 fr. III', condicion: 'Un pago de la semana 31 sin comprobante vigente (el emitido está cancelado)', cruces: { tipo: 'sin_cfdi' } });
  assert.equal(h2.status, 201, JSON.stringify(h2.json));
  assert.throws(() => db.raw.exec("UPDATE cruce_cfdi SET cubeta = 'explicada' WHERE tipo = 'sin_cfdi'"), /sustenta un hallazgo/);
  assert.throws(() => db.raw.exec('UPDATE cruce_cfdi SET cfdi_c = 1'), /no cambian/);

  const hs = (await llamar('GET', '/api/kernel/hallazgos?encargo_id=enc_c')).json.hallazgos;
  assert.equal(hs.find(h => h.numero === 2).efecto_derivado_c, 142 + 142, 'el efecto se deriva de los cruces');

  // Volver a cruzar conserva la clasificación de lo que vuelve a encontrar.
  assert.equal(await reintentarCfdi(db, temprano, { recruzar: true }), 'cruzando');
  await hasta((id) => avanzarCfdi(env, { ingesta_id: id }), temprano, ['terminado', 'error']);
  assert.equal((await llamar('GET', '/api/kernel/cruces/grupos?ingesta_cfdi_id=' + temprano)).json.aceptacion.sin_clasificar, 0);

  // Calendario corregido después de leer los XML: «Volver a cruzar» reasigna la corrida con el calendario vigente.
  const sem31 = db.raw.prepare("SELECT hasta FROM calendario_nomina WHERE encargo_id = 'enc_c' AND corrida_id = 'SEM31'").get();
  const enSem31 = db.raw.prepare("SELECT count(*) AS n FROM comprobante WHERE ingesta_id = ? AND corrida_id = 'SEM31'").get(temprano).n;
  db.raw.prepare("UPDATE calendario_nomina SET hasta = '2026-08-01' WHERE encargo_id = 'enc_c' AND corrida_id = 'SEM31'").run();
  assert.equal(await reintentarCfdi(db, temprano, { recruzar: true }), 'cruzando');
  await hasta((id) => avanzarCfdi(env, { ingesta_id: id }), temprano, ['terminado', 'error']);
  assert.equal((await estadoIngestaCfdi(db, temprano)).reporte.corridas_reasignadas_por_calendario, enSem31, 'con el calendario mal, la SEM 31 se queda sin timbres');
  db.raw.prepare("UPDATE calendario_nomina SET hasta = ? WHERE encargo_id = 'enc_c' AND corrida_id = 'SEM31'").run(sem31.hasta);
  assert.equal(await reintentarCfdi(db, temprano, { recruzar: true }), 'cruzando');
  await hasta((id) => avanzarCfdi(env, { ingesta_id: id }), temprano, ['terminado', 'error']);
  assert.equal((await estadoIngestaCfdi(db, temprano)).reporte.corridas_reasignadas_por_calendario, 0);
  assert.equal((await llamar('GET', '/api/kernel/cruces/grupos?ingesta_cfdi_id=' + temprano)).json.aceptacion.sin_clasificar, 0, 'corregido el calendario, vuelve la clasificación');

  await llamar('POST', '/api/kernel/encargo/config', { encargo_id: 'enc_c', carga_patronal_c: 2775600000, carga_patronal_fuente: 'prueba' });
  const ej = (await estadoIngesta(db, pre)).ejecucion_id;
  const pr = await llamar('GET', '/api/kernel/dictamen/propuesta?encargo_id=enc_c&ejecucion_id=' + ej);
  assert.equal(pr.json.fuentes.xml_nomina, true, 'el paquete cruzado es la fuente B3');
  assert.deepEqual(pr.json.bloqueos, []);
  const m42 = pr.json.modulos.find(m => m.modulo === '4.2');
  assert.equal(m42.estado, 'universo_parcial');
  assert.equal(pr.json.propuesta.semaforo['4.2'].color, 'rojo', 'pago sin CFDI: cualitativo, siempre material');
  assert.equal(pr.json.propuesta.opinion, 'con_salvedades');
  const v1 = await llamar('POST', '/api/kernel/dictamen/emitir', { encargo_id: 'enc_c', ejecucion_id: ej });
  assert.equal(v1.status, 201, JSON.stringify(v1.json));
  const cont = JSON.parse(db.raw.prepare('SELECT contenido_json FROM dictamen').get().contenido_json);
  assert.equal(cont.s1_alcance.cfdi.validos, 4);
  assert.ok(cont.s6_cedulas.some(c => c.modulo === '4.2' && c.material));
});

test('pagos extra: el bono timbrado como ordinaria de la semana se cruza contra su renglón, no contra el recibo semanal', () => {
  const ORD = new Set(['SEM31', 'SEM32', 'SEM33', 'SEM34']);
  // Caso real 1067222 (agosto 2026): recibo SEM 32 de $881.47 y bono de $32,028.29, ambos con FechaFinalPago 09-ago.
  const nom = [
    { colaborador_llave: '1067222', corrida_id: 'SEM32', rubro: 'neto', valor_c: 88147, movimiento_id: 'm1' },
    { colaborador_llave: '1067222', corrida_id: 'BONOS_SEM', rubro: 'neto', valor_c: 3202829, movimiento_id: 'm2' },
    // Finiquito pagado en dos CFDI (ordinario sin renglón semanal + extraordinario sin corrida).
    { colaborador_llave: '555001', corrida_id: 'FINIQUITOS', rubro: 'neto', valor_c: 1500000, movimiento_id: 'm3' },
    // Bono sin CFDI propio: el único recibo semanal del colaborador nunca se mueve aunque el importe coincida.
    { colaborador_llave: '777', corrida_id: 'SEM33', rubro: 'neto', valor_c: 50000, movimiento_id: 'm4' },
    { colaborador_llave: '777', corrida_id: 'BONOS_SEM', rubro: 'neto', valor_c: 50000, movimiento_id: 'm5' },
  ];
  const cf = [
    { uuid: '3B81', colaborador_llave: '1067222', corrida_id: 'SEM32', total_c: 88147, total_percepciones_c: 560000, isr_retenido_c: 0 },
    { uuid: 'DB3A', colaborador_llave: '1067222', corrida_id: 'SEM32', total_c: 3202829, total_percepciones_c: 4460979, isr_retenido_c: 0 },
    { uuid: 'F1', colaborador_llave: '555001', corrida_id: 'SEM34', total_c: 400000, total_percepciones_c: 0, isr_retenido_c: 0 },
    { uuid: 'F2', colaborador_llave: '555001', corrida_id: null, total_c: 1100000, total_percepciones_c: 0, isr_retenido_c: 0 },
    { uuid: 'S7', colaborador_llave: '777', corrida_id: 'SEM33', total_c: 50000, total_percepciones_c: 0, isr_retenido_c: 0 },
  ];
  const e = emparejarExtras(nom, cf, ORD);
  const a = Object.fromEntries(e.cfdis.map(c => [c.uuid, c.corrida_id]));
  assert.deepEqual(a, { '3B81': 'SEM32', DB3A: 'BONOS_SEM', F1: 'FINIQUITOS', F2: 'FINIQUITOS', S7: 'SEM33' });
  assert.equal(e.reasignados.length, 3);
  const r = cruzarNominaCfdi(nom, e.cfdis.filter(c => c.corrida_id), { rubros: ['neto'] });
  assert.equal(r.coincidencias, 4, 'SEM32, bono, finiquito y SEM33');
  assert.deepEqual(r.cruces.map(c => [c.tipo, c.colaborador_llave, c.corrida_id]), [['sin_cfdi', '777', 'BONOS_SEM']]);
});
