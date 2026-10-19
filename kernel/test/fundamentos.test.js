// Pruebas del andamiaje: aritmética, catálogo con vigencias y base temporal,
// matriz regla↔fuente (T3), tres estados, sello e inmutabilidad (T2), reconciliación (T1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { E, Exacto, Catalogo, Contexto, verificarMatriz, exigirMatriz, listaPBC, filasReglaFuente, REGLAS_V1,
  ejecutar, verificarSello, reconciliar, clasificar, aceptacion, resultadoPrueba, subsidioPeriodo } from '../src/index.js';
import { catalogoSemilla, filasSemilla, correr } from './util.js';

const cat = catalogoSemilla();

// ── Aritmética
test('redondeo único medio hacia arriba, sin float', () => {
  assert.equal(E('4466.235').aCentavos(), 446624);
  assert.equal(E('26.94475').aCentavos(), 2694);
  assert.equal(E('0.1').suma('0.2').eq('0.3'), true);
  assert.equal(E('-1.005').aCentavos(), -100); // floor(x·100 + ½)
  assert.equal(E('5.25009').trunc2().texto(2), '5.25');
  assert.throws(() => Exacto.de(0.1), /no entero/);
});

// ── Catálogo
test('tarifas ISR 2026: renglones contiguos (li = ls anterior + 0.01) y última abierta', () => {
  for (const f of filasSemilla().filter(f => f.tipo === 'tarifa')) {
    for (let i = 1; i < f.valor.length; i++) assert.ok(E(f.valor[i][0]).eq(E(f.valor[i - 1][1]).suma('0.01')), f.id + ' renglón ' + (i + 1));
    assert.equal(f.valor.at(-1)[1], null);
  }
});

test('subsidio derivado: monto = % × UMA × 30.4 (enero 536.21, feb–dic 535.65)', () => {
  for (const [fecha, esperado] of [['2026-01-15', 53621], ['2026-08-06', 53565]]) {
    const pct = E(cat.obtener('SUBSIDIO_PORCENTAJE_UMA', fecha).valor);
    const uma = E(cat.obtener('UMA_DIARIA', fecha).valor);
    assert.equal(pct.div(100).por(uma).por('30.4').aCentavos(), esperado);
    assert.equal(E(cat.obtener('SUBSIDIO_MONTO_MENSUAL', fecha).valor).aCentavos(), esperado);
  }
});

test('subsidio por periodo coincide con la tabla V2 (divisor 30.4)', () => {
  const tabla = { semanal: [7, 12347, 12334], catorcenal: [14, 24694, 24668], quincenal: [15, 26458, 26430], mensual: ['30.4', 53621, 53565] };
  for (const [per, [dias, ene, feb]] of Object.entries(tabla)) {
    const a = subsidioPeriodo(new Contexto(cat), { base: E(0), dias: String(dias), fecha_pago: '2026-01-20' });
    const b = subsidioPeriodo(new Contexto(cat), { base: E(0), dias: String(dias), fecha_pago: '2026-08-20' });
    assert.equal(a.subsidio_c, ene, per + ' enero');
    assert.equal(b.subsidio_c, feb, per + ' feb–dic');
  }
  const t = subsidioPeriodo(new Contexto(cat), { base: E(0), dias: '7', fecha_pago: '2026-08-20' });
  assert.equal(t.tope_periodo.aCentavos(), 264634, 'tope semanal 2,646.34 (corrección 1)');
});

test('vigencias traslapadas se rechazan al cargar', () => {
  const f = filasSemilla();
  const dup = { ...f.find(x => x.id === 'UMA_DIARIA@2026'), id: 'UMA_DIARIA@otra', vigencia_desde: '2026-06-01' };
  assert.throws(() => new Catalogo([...f, dup]), /traslapadas/);
});

test('base temporal por día cotizado: semana 26-ene → 1-feb lleva 6 días UMA 2025 y 1 día UMA 2026', () => {
  const { r } = correr(cat, 'CALC-IMSS-001', { sbc_c: 61588, periodo: { desde: '2026-01-26', hasta: '2026-02-01' }, incapacidades: 0, prima_rt: { pct: '0.50' } });
  assert.deepEqual(r.traza.dias_por_uma, { '113.14': 6, '117.31': 1 });
  // cuota fija = 20.40% × (6 × 113.14 + 117.31) = 162.41
  assert.equal(r.traza.ramas_c.cuota_fija_pat, E('0.204').por(E('113.14').por(6).suma('117.31')).aCentavos());
});

test('incapacidades como número en semana con cambio de UMA → limitación, no supuesto', () => {
  const { ctx } = correr(cat, 'CALC-IMSS-001', { sbc_c: 61588, periodo: { desde: '2026-01-26', hasta: '2026-02-01' }, incapacidades: 2, prima_rt: { pct: '0.50' } });
  assert.ok(ctx.limitaciones.some(l => l.motivo === 'dato_faltante'));
});

test('parámetro en nivel C marca limitación (nada en C a producción, por construcción)', () => {
  const { ctx } = correr(cat, 'CALC-ISN-001', { registro: 'R', entidad: 'TAB', mes: '2026-08', conceptos: [] });
  assert.ok(ctx.limitaciones.some(l => l.motivo === 'parametro_nivel_C'));
});

// ── Matriz regla ↔ fuente (T3)
test('arranque: todas las reglas v1 declaran fuentes; una regla sin fuentes no deja arrancar', () => {
  assert.deepEqual(verificarMatriz(REGLAS_V1), []);
  const mala = { id: 'CALC-X-001', version: '1.0.0', fuentes: [], calcular() {} };
  assert.match(verificarMatriz([...REGLAS_V1, mala])[0], /sin fuentes/);
  assert.throws(() => exigirMatriz([...REGLAS_V1, mala]), /no arranca/);
  assert.equal(REGLAS_V1.length, 12);
});

test('una sola fuente para matriz y lista PBC', () => {
  const pbc = listaPBC();
  const prenomina = pbc.find(p => p.clave === 'prenomina');
  assert.ok(prenomina.obligatoria_para.includes('CALC-ISR-SEM-001'));
  assert.equal(filasReglaFuente().length, REGLAS_V1.reduce((s, r) => s + r.fuentes.length, 0));
});

// ── Tres estados (T3) y paquete deliberadamente incompleto
const ITEM_IMSS = (id) => ({ regla_id: 'CALC-IMSS-001', colaborador_id: id, entrada: { sbc_c: 61588, periodo: { desde: '2026-07-27', hasta: '2026-08-02' }, incapacidades: 0, prima_rt: { pct: '0.50' } } });
const FUENTES_IMSS = { sua_ema: { estado: 'completa', sha256: 'a'.repeat(64) }, prima_rt_registro: { estado: 'completa' }, faltas_incapacidades: { estado: 'completa' } };

test('paquete deliberadamente incompleto → exactamente las limitaciones esperadas', async () => {
  const sinSua = { ...FUENTES_IMSS }; delete sinSua.sua_ema;
  const r = await ejecutar({ catalogo: cat, encargo_id: 'enc_prueba', fuentes: sinSua, items: [ITEM_IMSS('1067513')] });
  assert.equal(r.resultados[0].estado, 'limitacion_alcance');
  assert.deepEqual(r.resultados[0].limitaciones, [{ motivo: 'fuente_obligatoria_faltante', detalle: 'sua_ema' }]);
  assert.equal(r.calculos.length, 0);
});

test('fuente presente pero incompleta → universo parcial con cobertura declarada', async () => {
  const f = { ...FUENTES_IMSS, sua_ema: { estado: 'incompleta', universo_esperado: 3, universo_efectivo: 2, excluidos: [{ id: 'X', motivo: 'sin renglón en SUA' }] } };
  const r = await ejecutar({ catalogo: cat, encargo_id: 'enc_prueba', fuentes: f, items: [ITEM_IMSS('1'), ITEM_IMSS('2')] });
  assert.equal(r.resultados[0].estado, 'universo_parcial');
  assert.equal(r.resultados[0].cobertura.esperado, 3);
  assert.equal(r.resultados[0].cobertura.efectivo, 2);
  assert.equal(r.resultados[0].cobertura.excluidos.total, 0);
});

test('fuentes completas → completo; cada cálculo lleva versión de reglas, de parámetros y traza', async () => {
  const r = await ejecutar({ catalogo: cat, encargo_id: 'enc_prueba', corrida_id: 'SEM31', fuentes: FUENTES_IMSS, items: [ITEM_IMSS('1067513')] });
  assert.equal(r.resultados[0].estado, 'completo');
  assert.equal(r.calculos.length, 2); // imss_obrera e imss_patronal
  const c = r.calculos.find(x => x.rubro === 'imss_patronal');
  assert.equal(c.valor_calculado_c, 40341);
  assert.match(c.version_parametros, /^par-/);
  assert.match(c.version_catalogo_reglas, /^reg-/);
  assert.ok(c.traza.parametros.some(p => p.id === 'UMA_DIARIA@2026'));
  assert.match(r.ejecucion.kernel_huella, /^krn-/);
  assert.deepEqual(r.ejecucion.entradas_sha256, { sua_ema: 'a'.repeat(64) });
});

test('sello: verifica intacto y detecta cualquier alteración posterior', async () => {
  const r = await ejecutar({ catalogo: cat, encargo_id: 'enc_prueba', fuentes: FUENTES_IMSS, items: [ITEM_IMSS('1067513')] });
  assert.equal(await verificarSello(r), true);
  const alterado = { ...r, calculos: r.calculos.map((c, i) => i === 0 ? { ...c, valor_calculado_c: c.valor_calculado_c + 1 } : c) };
  assert.equal(await verificarSello(alterado), false);
});

// ── Reconciliación (T1 nivel 3)
test('reconciliación: diferencia derivada, tres cubetas, aceptación = cero sin clasificar', async () => {
  const r = await ejecutar({ catalogo: cat, encargo_id: 'enc_prueba', corrida_id: 'SEM31', fuentes: { prenomina: { estado: 'completa' }, catalogo_conceptos_cliente: { estado: 'completa' } },
    items: [{ regla_id: 'CALC-ISR-SEM-001', colaborador_id: '1073134', entrada: { base_gravable_c: 220668, fecha_pago: '2026-08-06' } },
            { regla_id: 'CALC-ISR-SEM-001', colaborador_id: '1067513', entrada: { base_gravable_c: 776068, fecha_pago: '2026-08-06' } }] });
  const cliente = [
    { colaborador_id: '1073134', rubro: 'isr', corrida_id: 'SEM31', valor_c: 2942, movimiento_ref: 'mov-1' },
    { colaborador_id: '1067513', rubro: 'isr', corrida_id: 'SEM31', valor_c: 122287, movimiento_ref: 'mov-2' },
  ];
  const rec = reconciliar(r.calculos, cliente);
  assert.equal(rec.coincidencias, 1);
  assert.equal(rec.diferencias.length, 1);
  assert.equal(rec.diferencias[0].diferencia_c, -468); // 29.42 − 34.10
  assert.equal(aceptacion(rec.diferencias).aceptado, false);
  const cl = clasificar(rec.diferencias[0], 'proceso_mal', { motivo: 'Subsidio al 15.59% en lugar de 15.02% (hallazgo 1)', quien: 'Rafael González' });
  assert.equal(aceptacion([cl]).aceptado, true);
  assert.equal(resultadoPrueba(r.resultados[0], rec), 'con_diferencias');
  assert.throws(() => clasificar(rec.diferencias[0], 'criterio_sin_resolver', { motivo: 'x', quien: 'y' }), /bitácora/);
});
