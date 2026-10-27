// Lectura del SUA y cruce kernel ↔ emisión del IMSS ↔ pago, de punta a punta.
// Archivos sintéticos con el layout del SUA y de la emisión (CDEMMO99/CDEBMO99/CDEMPA99); ninguno es de un cliente.
// Los importes de la emisión se calcularon aparte (Python, Decimal, redondeo por rama y por tramo) con UMA 117.31 y prima 0.5%.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseDatos, r2Local, catalogoSemilla, correr } from './util.js';
import { leerArchivoSUA, leerEmision, leerPatronEmision, esArchivoSUA, RAMAS, RAMAS_IMSS } from '../../ingesta/sua-formato.js';
import { itemsSUA, cruzarSUA, tramosDe, periodosDe } from '../../ingesta/sua.js';
import { procesarRegistroSUA } from '../../ingesta/sua-d1.js';
import { rutasSua } from '../../api/sua.js';
import { ejecutar } from '../src/index.js';

const REG = 'B2673542109', RFCP = 'PHO190128QD8';
const z = (v, n) => String(v).padStart(n, '0');
const linea = (n) => Array(n).fill(' ');
const poner = (a, pos, s) => { for (let i = 0; i < s.length; i++) a[pos + i] = s[i]; };
const IMSS7 = ['cuota_fija', 'excedente', 'dinero', 'gmp', 'rt', 'iv', 'guarderias'];

// Emisión por tramo (patrón y obrero separados), calculada fuera del kernel.
const E = {
  A: { cuota_fija: 74187, excedente_pat: 5049, excedente_obr: 1836, dinero_pat: 10850, dinero_obr: 3875, gmp_pat: 16275, gmp_obr: 5813, rt: 7750, iv_pat: 27125, iv_obr: 9688, guarderias: 15500 },
  B1: { cuota_fija: 43076, excedente_pat: 952, excedente_obr: 346, dinero_pat: 5040, dinero_obr: 1800, gmp_pat: 7560, gmp_obr: 2700, rt: 3600, iv_pat: 12600, iv_obr: 4500, guarderias: 7200 },
  B2: { cuota_fija: 31111, excedente_pat: 1402, excedente_obr: 510, dinero_pat: 4095, dinero_obr: 1463, gmp_pat: 6143, gmp_obr: 2194, rt: 2925, iv_pat: 10238, iv_obr: 3656, guarderias: 5850 },
  C31: { cuota_fija: 74187, excedente_pat: 0, excedente_obr: 0, dinero_pat: 6510, dinero_obr: 2325, gmp_pat: 9765, gmp_obr: 3488, rt: 4650, iv_pat: 16275, iv_obr: 5813, guarderias: 9300 },
  C26: { cuota_fija: 62221, excedente_pat: 0, excedente_obr: 0, dinero_pat: 5460, dinero_obr: 1950, gmp_pat: 8190, gmp_obr: 2925, rt: 3900, iv_pat: 13650, iv_obr: 4875, guarderias: 7800 },
  D31: { cuota_fija: 74187, excedente_pat: 8459, excedente_obr: 3076, dinero_pat: 13020, dinero_obr: 4650, gmp_pat: 19530, gmp_obr: 6975, rt: 9300, iv_pat: 32550, iv_obr: 11625, guarderias: 18600 },
  D30: { cuota_fija: 71794, excedente_pat: 8186, excedente_obr: 2977, dinero_pat: 12600, dinero_obr: 4500, gmp_pat: 18900, gmp_obr: 6750, rt: 9000, iv_pat: 31500, iv_obr: 11250, guarderias: 18000 },
};
const R = {
  A: { retiro: 62000, ceav_patronal: 232903, ceav_obrera: 34875, infonavit: 155000 },
  B1: { retiro: 39200, ceav_patronal: 124676, ceav_obrera: 22050, infonavit: 98000 },
  B2: { retiro: 11700, ceav_patronal: 38686, ceav_obrera: 6581, infonavit: 29250 },
  C62: { retiro: 37200, ceav_patronal: 112084, ceav_obrera: 20925, infonavit: 93000 },
  C57: { retiro: 37200, ceav_patronal: 103045, ceav_obrera: 19238, infonavit: 93000 },
  D62: { retiro: 74400, ceav_patronal: 279484, ceav_obrera: 41850, infonavit: 186000 },
  D61: { retiro: 73200, ceav_patronal: 274976, ceav_obrera: 41175, infonavit: 183000 },
};
const juntar = (e) => ({ cuota_fija: e.cuota_fija, excedente: e.excedente_pat + e.excedente_obr, dinero: e.dinero_pat + e.dinero_obr, gmp: e.gmp_pat + e.gmp_obr,
  rt: e.rt, iv: e.iv_pat + e.iv_obr, guarderias: e.guarderias });
const sumar = (...xs) => Object.fromEntries(Object.keys(xs[0]).map(k => [k, xs.reduce((s, x) => s + x[k], 0)]));

// Trabajadores: A un tramo; B modificación de salario el 19-ago; C 5 días de incapacidad; D el SUA paga un día menos;
// E como B pero con 3 días de incapacidad sin fechas (no se sabe qué SBC descontar).
const W = [
  { k: 'A', nss: '11111111111', rfc: 'AAAA800101AA1', sbc: 50000, dias: 31, inc: 0, dbim: 62, ibim: 0, ema: [['49', null, 31, 50000, E.A]], eba: [['49', null, 62, 50000, R.A]],
    pag: { ...juntar(E.A), ...R.A } },
  { k: 'B', nss: '22222222222', rfc: 'BBBB800101BB2', sbc: 45000, dias: 31, inc: 0, dbim: 62, ibim: 0,
    ema: [['49', null, 18, 40000, E.B1], ['47', '19-08-2026', 13, 45000, E.B2]], eba: [['47', '01-07-2026', 49, 40000, R.B1], ['47', '19-08-2026', 13, 45000, R.B2]],
    pag: { ...sumar(juntar(E.B1), juntar(E.B2)), ...sumar(R.B1, R.B2) } },
  { k: 'C', nss: '33333333333', rfc: 'CCCC800101CC3', sbc: 30000, dias: 31, inc: 5, dbim: 62, ibim: 5, ema: [['49', null, 31, 30000, E.C31]], eba: [['49', null, 62, 30000, R.C62]],
    pag: { ...juntar(E.C26), ...R.C57 } },
  { k: 'D', nss: '44444444444', rfc: 'DDDD800101DD4', sbc: 60000, dias: 31, inc: 0, dbim: 62, ibim: 0, ema: [['49', null, 31, 60000, E.D31]], eba: [['49', null, 62, 60000, R.D62]],
    pag: { ...juntar(E.D30), ...R.D61 } },
  { k: 'E', nss: '55555555555', rfc: 'EEEE800101EE5', sbc: 45000, dias: 31, inc: 3, dbim: 62, ibim: 3,
    ema: [['49', null, 18, 40000, E.B1], ['47', '19-08-2026', 13, 45000, E.B2]], eba: [['47', '01-07-2026', 49, 40000, R.B1], ['47', '19-08-2026', 13, 45000, R.B2]],
    pag: { ...sumar(juntar(E.B1), juntar(E.B2)), ...sumar(R.B1, R.B2) } },
];

function archivoSUA(ws = W, reg = REG) {
  const r = [];
  const a02 = linea(295); poner(a02, 0, '02' + reg + ' ' + RFCP + '202608' + '758739' + 'PRIMEWIRELESS HOLDINGS S DE RL DE CV'); r.push(a02.join(''));
  for (const w of ws) {
    const a = linea(295);
    poner(a, 0, '03' + reg + ' ' + RFCP + '202608' + w.nss + w.rfc.padEnd(13) + 'XXXX800101HDGXXX01');
    poner(a, 94, 'NOMBRE$DE$PRUEBA');
    poner(a, 144, z(w.sbc, 7) + '10' + z(w.dias, 2) + z(w.inc, 2) + '00');
    IMSS7.forEach((k, i) => poner(a, 159 + 7 * i, z(w.pag[k], 7)));
    poner(a, 208, z(0, 7) + z(w.dbim, 2) + z(w.ibim, 2) + '00' + z(w.pag.retiro, 7) + z(0, 7) + z(w.pag.ceav_patronal, 7) + z(w.pag.ceav_obrera, 7) + z(0, 14) + z(w.pag.infonavit, 7) + z(0, 7));
    r.push(a.join(''));
  }
  const a04 = linea(295); poner(a04, 0, '04' + reg + '22222222222' + '07' + '20260819' + '        ' + '00' + z(45000, 7) + '99999999999072026'); r.push(a04.join(''));
  const s = (k) => ws.reduce((t, w) => t + w.pag[k], 0);
  const a05 = linea(295);
  poner(a05, 0, '05' + reg + ' ' + RFCP + '202608758739' + [...IMSS7.map(s), s('retiro'), s('ceav_patronal') + s('ceav_obrera'), 0].map(v => z(v, 10)).join(''));
  r.push(a05.join(''));
  const a06 = linea(295); poner(a06, 0, '06' + reg + ' ' + RFCP + '202608758739'); r.push(a06.join(''));
  return r.join('');
}
const fechaE = (f) => f || '01-01-1900';
function cdemmo(ws = W) {
  const pre = REG.slice(0, 8) + '10' + '1001' + REG.slice(0, 8);
  return ws.flatMap(w => w.ema.map(([cod, f, d, sbc, c]) => pre + 'A' + w.nss + cod + fechaE(f) + z(d, 2) + z(sbc, 6) +
    ['cuota_fija', 'excedente_pat', 'excedente_obr', 'dinero_pat', 'dinero_obr', 'gmp_pat', 'gmp_obr', 'rt', 'iv_pat', 'iv_obr', 'guarderias'].map(k => z(c[k], 8)).join(''))).join('\r\n') + '\r\n';
}
const dec = (c, n) => (Math.floor(c / 100) + '.' + z(c % 100, 2)).padStart(n, '0');
function cdebmo(ws = W) {
  const pre = REG.slice(0, 8) + '10' + '1001' + REG.slice(0, 6);
  return ws.flatMap(w => w.eba.map(([cod, f, d, sbc, c]) => pre + 'A' + w.nss + cod + fechaE(f) + z(d, 2) + z(sbc, 6) + z(c.retiro, 8) + z(c.ceav_patronal, 8) + z(c.ceav_obrera, 8) +
    '0000.00' + dec(c.infonavit, 9) + '00000.00')).join('\r\n') + '\r\n';
}
const cdempa = (reg = REG, mes = '08') => REG.slice(0, 8) + '10' + '1001' + REG.slice(0, 8) + 'P' + reg + '0' + 'PRIMEWIRELESS HOLDINGS S DE RL DE CV'.padEnd(50) + 'C261098760' + mes + '2026' + '00.50000' + '013000000500\r\n';
const enc = (s) => new TextEncoder().encode(s);

test('lee el archivo de pago del SUA: patrón, trabajadores, movimientos y cuadre de los 03 contra el 05', () => {
  const t = archivoSUA();
  assert.ok(esArchivoSUA(t));
  const s = leerArchivoSUA(t);
  assert.deepEqual(s.patron, { registro: REG, rfc: RFCP, periodo: '2026-08', folio: '758739', razon_social: 'PRIMEWIRELESS HOLDINGS S DE RL DE CV' });
  assert.equal(s.trabajadores.length, 5);
  const c = s.trabajadores.find(w => w.nss === '33333333333');
  assert.deepEqual([c.rfc, c.sbc_c, c.mes.dias, c.mes.incapacidades, c.bimestre.incapacidades], ['CCCC800101CC3', 30000, 31, 5, 5]);
  assert.deepEqual(c.pagado_c, W[2].pag);
  assert.equal(s.cuadra, true);
  assert.deepEqual(s.movimientos[0], { nss: '22222222222', tipo: '07', fecha: '2026-08-19', folio: null, dias: 0, sbc_c: 45000 }, 'el 04 se lee sólo en sus primeros 51 caracteres');
  // Un 03 alterado ya no cuadra con el 05.
  const roto = t.slice(0, 295 + 159) + '9' + t.slice(295 + 160);
  assert.equal(leerArchivoSUA(roto).cuadra, false);
  assert.throws(() => leerArchivoSUA('hola'), /No es un archivo de pago/);
  const otro = archivoSUA(W, 'Z4225442103');
  assert.throws(() => leerArchivoSUA(otro.slice(0, 295) + t.slice(295)), /registro patronal distinto/);
});

test('lee la emisión del IMSS: un renglón por tramo de SBC; prima de riesgo del CDEMPA99', () => {
  const ema = leerEmision(cdemmo(), 'ema'), eba = leerEmision(cdebmo(), 'eba');
  assert.equal(ema.porNss.get('22222222222').length, 2);
  assert.deepEqual(ema.porNss.get('22222222222')[1], { codigo: '47', fecha: '2026-08-19', dias: 13, sbc_c: 45000, cuotas: E.B2 });
  assert.equal(ema.porNss.get('11111111111')[0].fecha, null, '01-01-1900 = desde el inicio del periodo');
  assert.deepEqual(eba.porNss.get('11111111111')[0].cuotas, { ...R.A, amortizacion: 0 });
  assert.deepEqual(leerPatronEmision(cdempa()), { registro: REG, periodo: '2026-08', prima_rt_pct: '0.50000' });
  assert.deepEqual(tramosDe(ema.porNss.get('22222222222'), periodosDe('2026-08').mes),
    [{ desde: '2026-08-01', hasta: '2026-08-18', sbc_c: 40000 }, { desde: '2026-08-19', hasta: '2026-08-31', sbc_c: 45000 }]);
  assert.throws(() => leerEmision('xx', 'ema'), /formato no reconocido/);
});

test('kernel con tramos: cada rama se redondea por tramo y se suma (C24); igual a calcular cada tramo aparte', () => {
  const cat = catalogoSemilla();
  const prima = { pct: '0.50' };
  const tramos = [{ desde: '2026-08-01', hasta: '2026-08-18', sbc_c: 40000 }, { desde: '2026-08-19', hasta: '2026-08-31', sbc_c: 45000 }];
  const junto = correr(cat, 'CALC-IMSS-001', { periodo: { desde: '2026-08-01', hasta: '2026-08-31' }, tramos, incapacidades: 0, prima_rt: prima }).r.traza.ramas_c;
  const t1 = correr(cat, 'CALC-IMSS-001', { sbc_c: 40000, periodo: { desde: '2026-08-01', hasta: '2026-08-18' }, incapacidades: 0, prima_rt: prima }).r.traza.ramas_c;
  const t2 = correr(cat, 'CALC-IMSS-001', { sbc_c: 45000, periodo: { desde: '2026-08-19', hasta: '2026-08-31' }, incapacidades: 0, prima_rt: prima }).r.traza.ramas_c;
  assert.deepEqual(junto, sumar(t1, t2));
  assert.equal(junto.cuota_fija_pat, E.B1.cuota_fija + E.B2.cuota_fija, 'coincide con la emisión del IMSS');
  const rcv = correr(cat, 'CALC-RCV-001', { periodo: { desde: '2026-07-01', hasta: '2026-08-31' }, incapacidades: 0,
    tramos: [{ desde: '2026-07-01', hasta: '2026-08-18', sbc_c: 40000 }, { desde: '2026-08-19', hasta: '2026-08-31', sbc_c: 45000 }] }).r.extra;
  assert.deepEqual([rcv.retiro_c, rcv.ceav_pat_c, rcv.ceav_obr_c], [R.B1.retiro + R.B2.retiro, R.B1.ceav_patronal + R.B2.ceav_patronal, R.B1.ceav_obrera + R.B2.ceav_obrera]);
  // Un solo SBC por tramos = la entrada clásica con sbc_c.
  const uno = correr(cat, 'CALC-INF-001', { periodo: { desde: '2026-07-01', hasta: '2026-08-31' }, tramos: [{ desde: '2026-07-01', hasta: '2026-08-31', sbc_c: 50000 }] }).r.valor_c;
  assert.equal(uno, correr(cat, 'CALC-INF-001', { sbc_c: 50000, periodo: { desde: '2026-07-01', hasta: '2026-08-31' } }).r.valor_c);
  assert.equal(uno, R.A.infonavit);
  // Baja a mitad del periodo: sólo cuentan los días del tramo.
  assert.equal(correr(cat, 'CALC-INF-001', { periodo: { desde: '2026-08-01', hasta: '2026-08-31' }, tramos: [{ desde: '2026-08-01', hasta: '2026-08-10', sbc_c: 50000 }] }).r.traza.dias, 10);
  // Incapacidad sin fechas con dos SBC: limitación, no suposición.
  const { ctx } = correr(cat, 'CALC-IMSS-001', { periodo: { desde: '2026-08-01', hasta: '2026-08-31' }, tramos, incapacidades: 3, prima_rt: prima });
  assert.match(JSON.stringify(ctx.limitaciones), /el SBC cambia dentro del periodo/);
  // Con fechas, no hay limitación.
  assert.equal(correr(cat, 'CALC-IMSS-001', { periodo: { desde: '2026-08-01', hasta: '2026-08-31' }, tramos, incapacidades: ['2026-08-02', '2026-08-03', '2026-08-20'], prima_rt: prima }).ctx.limitaciones.length, 0);
  assert.throws(() => correr(cat, 'CALC-INF-001', { periodo: { desde: '2026-08-01', hasta: '2026-08-31' }, tramos: [...tramos, { desde: '2026-08-18', hasta: '2026-08-18', sbc_c: 1 }] }), /traslapados/);
  assert.throws(() => correr(cat, 'CALC-INF-001', { periodo: { desde: '2026-08-01', hasta: '2026-08-31' }, tramos: [{ desde: '2026-07-31', hasta: '2026-08-31', sbc_c: 1 }] }), /fuera del periodo/);
});

test('cruce de tres lados: kernel = emisión sin incapacidades; con incapacidad el kernel coincide con el SUA; cada diferencia trae su causa', async () => {
  const sua = leerArchivoSUA(archivoSUA()), ema = leerEmision(cdemmo(), 'ema'), eba = leerEmision(cdebmo(), 'eba');
  const { items, personas, periodos } = itemsSUA({ sua, ema, eba, prima_rt: { pct: '0.50000' }, colaborador: (rfc) => (rfc === 'AAAA800101AA1' ? { colaborador_id: '1071121' } : null) });
  assert.equal(items.length, 15, 'IMSS, RCV e INFONAVIT por trabajador');
  const fuentes = Object.fromEntries(['sua_ema', 'sua_eba', 'prima_rt_registro', 'faltas_incapacidades'].map(k => [k, { sha256: 'x' }]));
  const r = await ejecutar({ catalogo: catalogoSemilla(), encargo_id: 'enc', fuentes, items });
  const { renglones, resumen } = cruzarSUA({ personas, ema, eba, calculos: r.calculos, periodos });
  const de = (id) => renglones.filter(x => x.colaborador_id === id);
  assert.deepEqual(de('1071121'), [], 'A: los tres lados iguales; ligado a la prenómina por RFC');
  assert.deepEqual(de('BBBB800101BB2'), [], 'B: con modificación de salario los tres lados iguales');
  const c = de('CCCC800101CC3');
  assert.deepEqual(new Set(c.map(x => x.causa)), new Set(['incapacidad']));
  assert.deepEqual(c.map(x => x.rama).sort(), ['ceav_obrera', 'ceav_patronal', 'cuota_fija', 'dinero', 'gmp', 'iv', 'guarderias', 'rt'].sort(), 'retiro e INFONAVIT no restan incapacidades (C8)');
  assert.ok(c.every(x => x.kernel_c === x.pagado_c && x.emitido_c > x.pagado_c));
  const d = de('DDDD800101DD4');
  assert.equal(d.length, 11);
  assert.ok(d.every(x => x.causa === 'sua_distinto_imss' && x.kernel_c === x.emitido_c && x.pagado_c < x.kernel_c));
  const e = de('EEEE800101EE5');
  assert.ok(e.length > 0 && e.every(x => x.causa === 'calculo_limitado' && x.limitado));
  assert.equal(resumen.retiro.kernel_c, resumen.retiro.emitido_c, 'el kernel reproduce la emisión');
  assert.equal(renglones.filter(x => x.causa === 'kernel_distinto').length, 0);
  // Un trabajador que el IMSS emitió y el SUA no paga.
  const sinA = leerArchivoSUA(archivoSUA(W.slice(1)));
  const x = itemsSUA({ sua: sinA, ema, eba, prima_rt: { pct: '0.5' } });
  const r2 = await ejecutar({ catalogo: catalogoSemilla(), encargo_id: 'enc', fuentes, items: x.items });
  const c2 = cruzarSUA({ personas: x.personas, ema, eba, calculos: r2.calculos, periodos: x.periodos });
  assert.equal(c2.renglones.filter(y => y.tipo === 'sin_pago').length, 11);
});

const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
const ADMIN = { id: 2, nombre: 'Revisor', rol: 'admin' };

test('portal: guarda archivos en R2, sella la ejecución, deja el cruce para clasificar y no deja cambiar importes', async () => {
  const db = baseDatos();
  db.raw.exec("INSERT INTO empresas (id, nombre, slug, rfc) VALUES (1, 'PRIMEWIRELESS', 'prime', 'PHO190128QD8')");
  db.raw.exec("INSERT INTO usuarios (id, email, password_hash, nombre, rol) VALUES (2,'rev@hrm','x','Revisor','admin')");
  db.raw.exec("INSERT INTO encargo (id, empresa_id, nivel, periodo_desde, periodo_hasta, ejercicio, origen_nomina, aplica_ajuste_mensual) VALUES ('enc_s', 1, 'B5+', '2026-08-01', '2026-08-31', 2026, 'cliente', 0)");
  db.raw.exec("INSERT INTO registro_patronal (empresa_id, registro, entidad, municipio, prima_rt_pct, fuente) VALUES (1, 'B2673542109', 'DGO', 'DURANGO', '0.60000', 'prueba')");
  db.raw.exec("INSERT INTO ingesta (id, encargo_id, tipo, perfil, r2_key, estado) VALUES ('ing_p', 'enc_s', 'prenomina', 'prime', 'k', 'terminado')");
  db.raw.exec("INSERT INTO movimiento_nomina (id, encargo_id, ingesta_id, corrida_id, colaborador_id, rubro, valor_c, archivo_sha256, rfc) VALUES ('m1', 'enc_s', 'ing_p', 'SEM31', '1071121', 'neto', 1, 'x', 'AAAA800101AA1')");
  const env = { DB: db, DOCS: r2Local() };
  const archivos = { sua: { nombre: 'W2608641.SUA', bytes: enc(archivoSUA()) }, ema: { nombre: 'CDEMMO99.txt', bytes: enc(cdemmo()) },
    eba: { nombre: 'CDEBMO99.txt', bytes: enc(cdebmo()) }, ema_pa: { nombre: 'CDEMPA99.txt', bytes: enc(cdempa()) } };
  // Un SUA de agosto no entra a un encargo de septiembre aunque se haya elegido ese encargo (0019).
  db.raw.exec("INSERT INTO encargo (id, empresa_id, nivel, periodo_desde, periodo_hasta, ejercicio, origen_nomina, aplica_ajuste_mensual) VALUES ('enc_sep', 1, 'B5+', '2026-09-01', '2026-09-30', 2026, 'cliente', 0)");
  await assert.rejects(procesarRegistroSUA(env, { encargo_id: 'enc_sep', archivos }), /es de 2026-08 y el encargo cubre 2026-09/);
  await assert.rejects(procesarRegistroSUA(env, { encargo_id: 'enc_s', archivos: { ...archivos, eba: undefined } }), /falta el CDEBMO99/);
  await assert.rejects(procesarRegistroSUA(env, { encargo_id: 'enc_s', archivos: { ...archivos, ema_pa: { nombre: 'x', bytes: enc(cdempa(REG, '07')) } } }), /emisión es de 2026-07/);
  const { id, reporte } = await procesarRegistroSUA(env, { encargo_id: 'enc_s', archivos, usuario_id: 2 });
  assert.equal(reporte.trabajadores, 5);
  assert.equal(reporte.cuadre_interno.cuadra, true);
  assert.equal(reporte.ligados_prenomina, 1);
  assert.equal(reporte.prima_distinta, true, 'la prima de la emisión (0.5) no es la del registro (0.6)');
  assert.equal(env.DOCS.mapa.size, 4);
  const ej = db.raw.prepare('SELECT estado, sello FROM ejecucion WHERE id = ?').get(reporte.ejecucion.id);
  assert.equal(ej.estado, 'sellada');
  assert.ok(db.raw.prepare("SELECT count(*) AS n FROM calculo_kernel WHERE ejecucion_id = ? AND regla_id = 'CALC-IMSS-001'").get(reporte.ejecucion.id).n >= 10);

  const llamar = async (m, path, body) => {
    const r = await rutasSua(new Request('http://x' + path, { method: m, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env, ADMIN, {}, J);
    return { status: r.status, j: await r.json() };
  };
  const l = await llamar('GET', '/api/kernel/sua?encargo_id=enc_s');
  assert.equal(l.j.lecturas.length, 1);
  assert.equal(l.j.lecturas[0].pendientes, l.j.lecturas[0].renglones);
  const g = await llamar('GET', '/api/kernel/sua/grupos?encargo_id=enc_s&periodo=2026-08');
  assert.deepEqual([...new Set(g.j.grupos.map(x => x.causa))].sort(), ['calculo_limitado', 'incapacidad', 'sua_distinto_imss']);
  assert.equal(g.j.aceptacion.aceptado, false);
  const cl = await llamar('POST', '/api/kernel/sua/clasificar', { encargo_id: 'enc_s', periodo: '2026-08', causa: 'incapacidad', cubeta: 'explicada', motivo: 'La emisión no descuenta incapacidades (C26)' });
  assert.equal(cl.j.clasificados, 8);
  const cl2 = await llamar('POST', '/api/kernel/sua/clasificar', { encargo_id: 'enc_s', periodo: '2026-08', causa: 'sua_distinto_imss', cubeta: 'criterio_sin_resolver', motivo: 'x' });
  assert.equal(cl2.status, 400);
  const cs = await llamar('GET', '/api/kernel/sua/cruces?encargo_id=enc_s&periodo=2026-08&causa=sua_distinto_imss&rama=cuota_fija');
  assert.deepEqual([cs.j.cruces[0].kernel_c, cs.j.cruces[0].emitido_c, cs.j.cruces[0].pagado_c], [74187, 74187, 71794]);
  assert.equal(cs.j.cruces[0].nss_final, '4444');
  // Sólo agregar: los importes no cambian, nada se borra.
  assert.throws(() => db.raw.exec("UPDATE cruce_sua SET pagado_c = 1 WHERE ingesta_sua_id = '" + id + "'"), /no cambian/);
  assert.throws(() => db.raw.exec("DELETE FROM cruce_sua"), /no se borra/);
  assert.throws(() => db.raw.exec("UPDATE ingesta_sua SET trabajadores = 1"), /no cambia/);
  // Una segunda lectura del mismo registro sustituye a la primera en lo vigente.
  await procesarRegistroSUA(env, { encargo_id: 'enc_s', archivos, usuario_id: 2 });
  const l2 = await llamar('GET', '/api/kernel/sua?encargo_id=enc_s');
  assert.equal(l2.j.lecturas.length, 1);
  assert.notEqual(l2.j.lecturas[0].id, id);
  assert.equal((await rutasSua(new Request('http://x/api/kernel/sua?encargo_id=enc_s'), env, { id: 9, rol: 'socio' }, {}, J)).status, 403);
});
