// Expediente de defensa (N6), inventario de datos (N7.3), saldos a favor (sección 7) y seguimiento (módulo 25).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rutasKernel } from '../../api/kernel.js';
import { rutasDictamen } from '../../api/dictamen.js';
import { rutasExpediente } from '../../api/expediente.js';
import { conservarHasta, categoriaDe, metadatosFuente, INVENTARIO } from '../../servicio/expediente.js';
import { saldosAFavor } from '../src/index.js';
import { baseDatos, r2Local } from './util.js';

const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
const ADMIN = { id: 2, nombre: 'Revisor', rol: 'admin' };
const SOCIO = { id: 3, nombre: 'Socio', rol: 'socio', empresa_id: 1 };

test('N6: cinco años después de la anual del ejercicio, o lo que diga el contrato si es más', () => {
  assert.equal(conservarHasta(2026), '2032-03-31');
  assert.equal(conservarHasta(2026, '2030-01-01'), '2032-03-31');
  assert.equal(conservarHasta(2026, '2035-12-31'), '2035-12-31');
  assert.equal(categoriaDe('encargos/e1/fuentes/1_prenomina.xlsx'), 'prenomina');
  assert.equal(categoriaDe('encargos/e1/cfdi/1_xml.zip'), 'xml_y_metadata');
  assert.equal(categoriaDe('encargos/e1/maestro/1_hc.xlsx'), 'maestro_empleados');
  assert.equal(categoriaDe('ingestas/i1/lote_0001.json'), 'renglones_canonicos');
  // N7: el inventario dice lo que no se guarda.
  assert.ok(INVENTARIO.some(i => /CURP/.test(i.datos) && i.categoria === 'No se guardan'));
});

test('sección 7: lo pagado de más por rubro y quién lo recupera; lo del kernel no cuenta', () => {
  const s = saldosAFavor([
    { rubro: 'isr', cubeta: 'proceso_mal', n: 3, exceso_c: 1500 },
    { rubro: 'isr', cubeta: null, n: 1, exceso_c: 200 },
    { rubro: 'imss', cubeta: 'criterio_sin_resolver', n: 2, exceso_c: 900 },
    { rubro: 'isr', cubeta: 'kernel_mal', n: 9, exceso_c: 99999 },
  ]);
  const isr = s.partidas.find(p => p.rubro === 'isr');
  assert.deepEqual([isr.importe_c, isr.casos, isr.sin_clasificar_c], [1700, 4, 200]);
  assert.equal(s.partidas.find(p => p.rubro === 'imss').sujeto_a_criterio_c, 900);
  assert.equal(s.total_trabajadores_c + s.total_empresa_c, 2600);
});

async function entorno() {
  const db = baseDatos(), r2 = r2Local(), env = { DB: db, DOCS: r2 };
  db.raw.exec("INSERT INTO empresas (id, nombre, slug, rfc) VALUES (1, 'PRIMEWIRELESS', 'prime', 'PHO110101AAA')");
  db.raw.exec("INSERT INTO usuarios (id, email, password_hash, nombre, rol, empresa_id) VALUES (2,'rev@hrm','x','Revisor','admin',NULL), (3,'s@p','x','Socio','socio',1)");
  const llamar = async (metodo, ruta, body, u = ADMIN) => {
    const req = new Request('https://x' + ruta, { method: metodo, body: body ? JSON.stringify(body) : undefined });
    const r = (await rutasExpediente(req.clone(), env, u, {}, J)) || (await rutasDictamen(req.clone(), env, u, {}, J)) || (await rutasKernel(req, env, u, {}, J));
    return { status: r.status, json: await r.json() };
  };
  return { db, r2, llamar };
}
const FUENTES = { prenomina: { estado: 'completa', sha256: 'f'.repeat(64) }, catalogo_conceptos_cliente: { estado: 'completa' }, xml_nomina: { estado: 'completa', sha256: 'x'.repeat(64) } };

async function encargo(llamar, id, desde, hasta, isr_cliente_c) {
  await llamar('POST', '/api/kernel/encargos', { id, empresa_id: 1, nivel: 'B5+', periodo_desde: desde, periodo_hasta: hasta, ejercicio: 2026, origen_nomina: 'cliente' });
  await llamar('POST', '/api/kernel/encargo/config', { encargo_id: id, carga_patronal_c: 2775600000, carga_patronal_fuente: 'SUA' });
  const ej = await llamar('POST', '/api/kernel/ejecutar', { encargo_id: id, corrida_id: 'SEM', fuentes: FUENTES,
    items: [{ regla_id: 'CALC-ISR-SEM-001', colaborador_id: '1073134', entrada: { base_gravable_c: 220668, fecha_pago: desde.slice(0, 8) + '06' } }] });
  await llamar('POST', '/api/kernel/movimientos', { encargo_id: id, archivo_sha256: id.padEnd(64, 'p'), movimientos: [{ corrida_id: 'SEM', colaborador_id: '1073134', rubro: 'isr', valor_c: isr_cliente_c }] });
  await llamar('POST', '/api/kernel/reconciliar', { ejecucion_id: ej.json.ejecucion.id });
  return ej.json.ejecucion.id;
}

test('el dictamen lleva seguimiento de lo abierto antes, saldos a favor y plazo de conservación; el expediente lo inventaría', async () => {
  const { db, r2, llamar } = await entorno();
  // Agosto: retuvo de menos 10.00 → hallazgo, dictamen emitido.
  const e1 = await encargo(llamar, 'ago', '2026-08-01', '2026-08-31', 3410 - 1000);
  await llamar('POST', '/api/kernel/clasificar-grupo', { encargo_id: 'ago', regla_id: 'CALC-ISR-SEM-001', diferencia_c: -1000, cubeta: 'proceso_mal', motivo: 'Tabla vieja' });
  const h = await llamar('POST', '/api/kernel/hallazgos', { encargo_id: 'ago', titulo: 'ISR con la tabla anterior', modulo: '4.3', tipo: 'cuantitativo', riesgo: 'alto',
    criterio: 'LISR art. 96', condicion: 'Retiene de menos', regla_id: 'CALC-ISR-SEM-001', rubro: 'isr', responsable: 'Nóminas', fecha_compromiso: '2026-09-15',
    diferencias: { regla_id: 'CALC-ISR-SEM-001', motivo: 'Tabla vieja' } });
  assert.equal(h.status, 201, JSON.stringify(h.json));
  const d1 = await llamar('POST', '/api/kernel/dictamen/emitir', { encargo_id: 'ago', ejecucion_id: e1 });
  assert.equal(d1.status, 201, JSON.stringify(d1.json));
  const c1 = (await llamar('GET', '/api/dictamen?id=' + d1.json.id, null, SOCIO)).json.dictamen.contenido;
  assert.equal(c1.conservacion.archivos_fuente_hasta, '2032-03-31');
  assert.deepEqual(c1.s11_seguimiento, []);

  // Septiembre: retuvo de más 5.00 → saldo a favor del trabajador; el hallazgo de agosto sigue abierto y vencido.
  const e2 = await encargo(llamar, 'sep', '2026-09-01', '2026-09-30', 3410 + 500);
  const pr = await llamar('GET', '/api/kernel/dictamen/propuesta?encargo_id=sep&ejecucion_id=' + e2);
  const isr = pr.json.saldos.partidas.find(p => p.rubro === 'isr');
  assert.equal(isr.importe_c, 500);
  assert.equal(isr.sin_clasificar_c, 500);
  assert.equal(pr.json.seguimiento.length, 1);
  assert.equal(pr.json.seguimiento[0].titulo, 'ISR con la tabla anterior');
  assert.equal(pr.json.seguimiento[0].vencido, true);

  // Expediente: archivos con metadatos de retención; el contrato puede alargar el plazo.
  await r2.put('encargos/sep/fuentes/1_prenomina.xlsx', 'xx', { customMetadata: await metadatosFuente(db, 'sep', 'prenomina') });
  await r2.put('encargos/sep/cfdi/1_xml.zip', 'yyyy', { customMetadata: await metadatosFuente(db, 'sep', 'xml_nomina') });
  assert.equal(r2.meta.get('encargos/sep/cfdi/1_xml.zip').conservar_hasta, '2032-03-31');
  assert.equal((await llamar('GET', '/api/kernel/expediente?encargo_id=sep', null, SOCIO)).status, 403);
  let x = await llamar('GET', '/api/kernel/expediente?encargo_id=sep');
  assert.equal(x.json.archivos_fuente.total, 2);
  assert.equal(x.json.archivos_fuente.por_categoria.xml_y_metadata.bytes, 4);
  assert.ok(x.json.papeles_de_trabajo.conteos.ejecuciones >= 1);
  assert.equal(x.json.archivos_fuente.vencidos, 0);
  assert.equal((await llamar('POST', '/api/kernel/expediente/retencion', { encargo_id: 'sep', retencion_contrato_hasta: '31/12/2035' })).status, 400);
  assert.equal((await llamar('POST', '/api/kernel/expediente/retencion', { encargo_id: 'sep', retencion_contrato_hasta: '2035-12-31' })).status, 200);
  x = await llamar('GET', '/api/kernel/expediente?encargo_id=sep');
  assert.equal(x.json.archivos_fuente.conservar_hasta, '2035-12-31');
  assert.equal((await metadatosFuente(db, 'sep', 'maestro_empleados')).conservar_hasta, '2035-12-31');
});
