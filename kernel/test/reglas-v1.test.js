// Nivel 1 (T1): unitarias del kernel contra la ley. La verdad es la ley; las cifras
// esperadas son los casos de prueba de «Reglas v1» (Revisión del maestro v0.3,
// 14-oct-2026), escritos por quien sabe nómina. Si el caso y el código discrepan,
// gana el caso — salvo cuando el caso no es reproducible con su propia regla, lo
// que se documenta aquí como diferencia para la bitácora de criterios.
// Casos por número de empleado, sin nombres (N7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogoSemilla, correr } from './util.js';

const cat = catalogoSemilla();
const SEM31 = { desde: '2026-07-27', hasta: '2026-08-02' };
const PAGO_SEM = '2026-08-06';
const PAGO_CAT = '2026-08-14';

test('CALC-ISR-SEM-001 · emp 1067513 sem 31: base 7,760.68 → ISR 1,222.87 (= nómina)', () => {
  const { r, ctx } = correr(cat, 'CALC-ISR-SEM-001', { base_gravable_c: 776068, fecha_pago: PAGO_SEM });
  assert.equal(r.valor_c, 122287);
  assert.equal(r.traza.tarifa.renglon, 6);
  assert.equal(r.traza.tarifa.limite_inferior, '4037.33');
  assert.equal(r.traza.tarifa.cuota_fija, '427.56');
  assert.equal(r.extra.subsidio_c, 0, 'base sobre el tope semanal 2,646.34');
  assert.deepEqual(ctx.limitaciones, []);
});

test('CALC-EXE-001 + SEM · emp 1067513: la prima dominical 78.81 queda exenta y la base es 7,760.68', () => {
  const { r } = correr(cat, 'CALC-EXE-001', { fecha_pago: PAGO_SEM, percepciones: [
    { concepto: 'sueldo', monto_c: 220668 }, { concepto: 'comisiones', monto_c: 548600 },
    { concepto: 'incentivos', monto_c: 6800 }, { concepto: 'prima_dominical', monto_c: 7881, domingos: 1 }] });
  assert.equal(r.valor_c, 776068);
  assert.equal(r.traza.exento_total_c, 7881);
});

test('CALC-ISR-CAT-001 · emp 191 catorcena 16: base 14,406.00 → 2,207.47 por la regla C1', () => {
  const { r } = correr(cat, 'CALC-ISR-CAT-001', { base_gravable_c: 1440600, fecha_pago: PAGO_CAT });
  assert.equal(r.valor_c, 220747);
  assert.equal(r.traza.tarifa.renglon, 6);
  assert.equal(r.traza.tarifa.cuota_fija, '61.08');
  // La nómina retuvo 2,207.49. No es redondeo: es el método. Proyectar a mensual
  // (× 30.4 / 14, tarifa mensual, regresar) da 2,207.4878 → 2,207.49 exacto.
  // Va a la cubeta «criterio sin resolver» de C1 (ver data/criterios.json).
});

test('CALC-SUB-001 · emp 1073134 sem 31: subsidio 123.34; ISR 157.44 → 34.10 (nómina 29.42, hallazgo 1)', () => {
  const sub = correr(cat, 'CALC-SUB-001', { base_para_tope_c: 220668, periodicidad: 'semanal', fecha_pago: PAGO_SEM });
  assert.equal(sub.r.valor_c, 12334);
  const isr = correr(cat, 'CALC-ISR-SEM-001', { base_gravable_c: 220668, fecha_pago: PAGO_SEM });
  assert.equal(isr.r.extra.isr_antes_subsidio_c, 15744);
  assert.equal(isr.r.valor_c, 3410);
  assert.notEqual(isr.r.valor_c, 2942, 'la nómina aplicó 128.02 (15.59% de enero)');
});

test('CALC-ISR-AJM-001 · emp 191 catorcena 17: ajuste mensual 2,058.41 (= nómina)', () => {
  const { r } = correr(cat, 'CALC-ISR-AJM-001', { bases_mes_c: [1440600, 1440600], isr_retenido_previo_mes_c: 220749, fecha_pago: '2026-08-28', aplica_ajuste_mensual: true });
  assert.equal(r.traza.isr_mes_c, 426590);
  assert.equal(r.valor_c, 205841);
});

test('CALC-ISR-AJM-001 · sin ajuste declarado en el perfil no aplica', () => {
  const { r } = correr(cat, 'CALC-ISR-AJM-001', { bases_mes_c: [1440600], isr_retenido_previo_mes_c: 0, fecha_pago: '2026-08-28', aplica_ajuste_mensual: false });
  assert.equal(r.no_aplica, true);
});

test('CALC-ISR-EXT-001 · bono semanal emp 1071756: 19,695.34 → 4,466.24 (= nómina)', () => {
  const { r, ctx } = correr(cat, 'CALC-ISR-EXT-001', { pago_gravable_c: 1969534, periodicidad: 'semanal', fecha_pago: PAGO_SEM });
  assert.equal(r.valor_c, 446624); // 4,466.235 exacto: el redondeo único medio hacia arriba importa
  assert.ok(ctx.criterios.has('C5'));
});

test('CALC-ISR-EXT-001 · bono catorcenal emp 89: 200,000.00 → 62,868.17 por la regla C1', () => {
  const { r } = correr(cat, 'CALC-ISR-EXT-001', { pago_gravable_c: 20000000, periodicidad: 'catorcenal', fecha_pago: PAGO_CAT });
  // El caso escrito dice «4,490.58 diario × 14 = 62,868.21»: la multiplicación da 62,868.12
  // y la regla exacta da 4,490.5835 × 14 = 62,868.169 → 62,868.17. La nómina (62,868.21)
  // se explica casi por la proyección mensual (62,868.2158). Diferencia documentada en C1.
  assert.equal(r.valor_c, 6286817);
});

test('CALC-EXE-001 · emp 390062 sem 31: prima dominical 135.79 de un domingo → 117.31 exentos, 18.48 gravables', () => {
  const { r } = correr(cat, 'CALC-EXE-001', { fecha_pago: PAGO_SEM, percepciones: [{ concepto: 'prima_dominical', monto_c: 13579, domingos: 1 }] });
  const c = r.traza.conceptos[0];
  assert.equal(c.exento_c, 11731);
  assert.equal(c.gravable_c, 1848);
});

test('CALC-ISR-SEM-001 · emp 390062: base 8,483.53 → 1,384.60 (= nómina)', () => {
  assert.equal(correr(cat, 'CALC-ISR-SEM-001', { base_gravable_c: 848353, fecha_pago: PAGO_SEM }).r.valor_c, 138460);
});

test('CALC-EXE-001 · fondo de ahorro empresa: exento sólo si cumple requisitos (P2, hallazgo 5)', () => {
  const p = [{ concepto: 'fondo_ahorro_empresa', monto_c: 49427 }];
  const cumple = correr(cat, 'CALC-EXE-001', { fecha_pago: PAGO_SEM, percepciones: p, perfil: { fondo_ahorro_cumple_requisitos: true } });
  assert.equal(cumple.r.valor_c, 0);
  const noCumple = correr(cat, 'CALC-EXE-001', { fecha_pago: PAGO_SEM, percepciones: p, perfil: { fondo_ahorro_cumple_requisitos: false } });
  assert.equal(noCumple.r.valor_c, 49427);
  const sinDato = correr(cat, 'CALC-EXE-001', { fecha_pago: PAGO_SEM, percepciones: p });
  assert.equal(sinDato.r.valor_c, 49427);
  assert.equal(sinDato.ctx.limitaciones[0].motivo, 'dato_faltante');
});

test('CALC-EXE-001 · separación: un solo tope de 90 UMA por año para las tres (hallazgo 6)', () => {
  const { r } = correr(cat, 'CALC-EXE-001', { fecha_pago: PAGO_SEM, separacion: { fecha_ingreso: '2023-01-10', fecha_baja: '2026-08-05' },
    percepciones: [{ concepto: 'indemnizacion', monto_c: 3000000 }, { concepto: 'prima_antiguedad', monto_c: 1500000 }] });
  // 3 años 6 meses 26 días → fracción > 6 meses: 4 años × 90 × 117.31 = 42,231.60 compartidos
  assert.equal(r.traza.exento_total_c, 4223160);
  assert.equal(r.traza.conceptos[1].consumido_antes_c, 3000000);
  assert.equal(r.traza.base_para_tope_subsidio_c, 0, 'separación no cuenta para el tope del subsidio');
});

test('CALC-EXE-001 · aguinaldo con tope anual y acumulado previo (entrada, no supuesto)', () => {
  const { r } = correr(cat, 'CALC-EXE-001', { fecha_pago: '2026-12-15', consumido: { aguinaldo: 200000 }, percepciones: [{ concepto: 'aguinaldo', monto_c: 500000 }] });
  assert.equal(r.traza.conceptos[0].exento_c, 151930); // 3,519.30 − 2,000.00
});

test('CALC-IMSS-001 · emp 1067513 sem 31, registro A0185335104 prima 0.50%: obrera 61.28, patronal 403.41 (= nómina)', () => {
  const { r, ctx } = correr(cat, 'CALC-IMSS-001', { sbc_c: 61588, periodo: SEM31, incapacidades: 0,
    prima_rt: { pct: '0.50', vigencia_desde: '2026-03-01', vigencia_hasta: '2027-02-28', registro: 'A0185335104' } });
  assert.equal(r.extra.obrera_c, 6128);
  assert.equal(r.extra.patronal_c, 40341);
  assert.deepEqual(r.traza.ramas_c, { cuota_fija_pat: 16752, excedente_pat: 2032, excedente_obr: 739, dinero_pat: 3018, dinero_obr: 1078,
    gmp_pat: 4527, gmp_obr: 1617, rt_pat: 2156, iv_pat: 7545, iv_obr: 2694, guarderias_pat: 4311 });
  assert.deepEqual(ctx.limitaciones, []);
});

test('CALC-RCV-001 · emp 1067513: 5.25 UMA → 7.513%; patronal 410.12, obrera 48.50 (= nómina)', () => {
  const { r } = correr(cat, 'CALC-RCV-001', { sbc_c: 61588, periodo: SEM31, incapacidades: 0 });
  assert.equal(r.extra.retiro_c, 8622);
  assert.equal(r.extra.ceav_pat_c, 32390);
  assert.equal(r.extra.patronal_c, 41012);
  assert.equal(r.extra.ceav_obr_c, 4850);
  assert.deepEqual(r.traza.rango_ceav, { '5.25→7.513%': 7 });
});

test('CALC-INF-001 · emp 1067513: 5% × 4,311.16 = 215.56 (= nómina)', () => {
  assert.equal(correr(cat, 'CALC-INF-001', { sbc_c: 61588, periodo: SEM31 }).r.valor_c, 21556);
});

test('CALC-ISN-001 · Y6079749104 CDMX agosto: con el cuadro 471,623.37; queda limitado (cuadro sin fundamento, V8)', () => {
  // Desde 0.9.0 el sueldo grava en la semilla (nivel B) y la liquidación está exenta en CDMX según el cuadro (nivel C).
  const { r, ctx } = correr(cat, 'CALC-ISN-001', { registro: 'Y6079749104', entidad: 'CDMX', mes: '2026-08',
    conceptos: [{ concepto: 'sueldo', monto_c: 1179058427 }, { concepto: 'liquidacion', monto_c: 78768305 }] });
  assert.equal(r.valor_c, 47162337);
  assert.equal(r.traza.base_c, 1179058427);
  assert.ok(ctx.limitaciones.some(l => l.motivo === 'parametro_nivel_C'));
  // Regla de hoy (todo grava salvo PTU): 12,578,267.32 × 4% = 503,130.69, igual al informe → diferencia −31,507.32
  assert.equal(50313069 - r.valor_c, 3150732);
});

test('CALC-ISN-001 · Chihuahua: 4% + universitario 6% del impuesto + extraordinarias 0.30% y 0.15% de la base (C23)', () => {
  const e = { registro: 'X', entidad: 'CHIH', mes: '2026-08', conceptos: [{ concepto: 'sueldo', monto_c: 100000 }] };
  const { r, ctx } = correr(cat, 'CALC-ISN-001', e);
  assert.equal(r.extra.impuesto_c, 4000);
  assert.deepEqual(r.traza.adicional.componentes.map(c => c.valor_c), [240, 300, 150]);
  assert.equal(r.valor_c, 4690);
  assert.ok(ctx.criterios.has('C23'));
  assert.ok(ctx.limitaciones.some(l => l.motivo === 'dato_faltante' && /municipio/.test(l.detalle)));
  const jz = correr(cat, 'CALC-ISN-001', { ...e, municipio: 'Juárez' });
  assert.ok(jz.ctx.limitaciones.some(l => l.motivo === 'parametro_faltante'));
  const de = correr(cat, 'CALC-ISN-001', { ...e, municipio: 'Delicias' });
  assert.ok(!de.ctx.limitaciones.some(l => /municip|Expo/.test(l.detalle || '')));
  assert.equal(de.r.valor_c, 4690);
});

test('CALC-ISN-001 · Veracruz: adicional sin componentes sigue limitado y no se suma', () => {
  const { r, ctx } = correr(cat, 'CALC-ISN-001', { registro: 'X', entidad: 'VER', mes: '2026-08', conceptos: [{ concepto: 'sueldo', monto_c: 100000 }] });
  assert.equal(r.traza.adicional.calculado, false);
  assert.equal(r.valor_c, r.extra.impuesto_c);
  assert.ok(ctx.limitaciones.some(l => l.detalle === 'ISN_ADICIONAL:VER@2026'));
});

// ── 0.9.0: PTU (RLISR art. 174, C17), separación (LISR art. 95, C16) y cuadro ISN de 32 entidades.
// Cifras calculadas a mano con aritmética decimal fuera del kernel (tarifa mensual del Anexo 8).
test('CALC-ISR-174-001 · PTU 10,000 con SD 400: exento 15 UMA, gravado 8,240.35, ISR 1,049.17', () => {
  const ex = correr(cat, 'CALC-EXE-001', { fecha_pago: '2026-08-12', percepciones: [{ concepto: 'ptu', monto_c: 1000000 }], consumido: { ptu: 0 } }).r;
  assert.equal(ex.valor_c, 824035);
  const { r, ctx } = correr(cat, 'CALC-ISR-174-001', { pago_gravable_c: ex.valor_c, salario_diario_c: 40000, fecha_pago: '2026-08-12', concepto: 'ptu' });
  assert.equal(r.valor_c, 104917);
  assert.equal(r.traza.sueldo_mensual, '12160');
  assert.ok(ctx.criterios.has('C17'));
  assert.equal(correr(cat, 'CALC-ISR-174-001', { pago_gravable_c: 0, salario_diario_c: 40000, fecha_pago: '2026-08-12' }).r.valor_c, 0);
});

test('CALC-ISR-174-001 · con sueldo mensual dado no usa el criterio del salario diario', () => {
  const { r, ctx } = correr(cat, 'CALC-ISR-174-001', { pago_gravable_c: 824035, sueldo_mensual_c: 1216000, fecha_pago: '2026-08-12' });
  assert.equal(r.valor_c, 104917);
  assert.ok(!ctx.criterios.has('C17'));
});

test('CALC-ISR-SEP-001 · gravado 50,000 con SD 500 (sueldo 15,000): tasa 9.35%, ISR 4,676.06', () => {
  const { r, ctx } = correr(cat, 'CALC-ISR-SEP-001', { separacion_gravable_c: 5000000, salario_diario_c: 50000, fecha_pago: '2026-08-20' });
  assert.equal(r.valor_c, 467606);
  assert.equal(r.traza.sueldo_mensual, '15000');
  assert.ok(ctx.criterios.has('C16'));
  assert.match(r.traza.metodo, /tasa del último sueldo/);
});

test('CALC-ISR-SEP-001 · gravado menor al sueldo mensual se acumula al ordinario: 6,000 → 1,194.43', () => {
  const { r } = correr(cat, 'CALC-ISR-SEP-001', { separacion_gravable_c: 600000, salario_diario_c: 50000, fecha_pago: '2026-08-20' });
  assert.equal(r.valor_c, 119443);
  assert.match(r.traza.metodo, /se acumula/);
});

test('CALC-EXE-001 + CALC-ISR-SEP-001 · fracción mayor a 6 meses cuenta como año: 10 meses = 1 año exento', () => {
  // Caso de agosto (sin datos personales): ingreso 2025-09-25, baja 2026-08-03; PRIME contó 0 años.
  const ex = correr(cat, 'CALC-EXE-001', { fecha_pago: '2026-08-03', percepciones: [{ concepto: 'indemnizacion', monto_c: 2351722 }],
    consumido: { separacion: 0 }, separacion: { fecha_ingreso: '2025-09-25', fecha_baja: '2026-08-03' } }).r;
  assert.equal(ex.traza.exento_total_c, 1055790); // 90 × 117.31 × 1
  assert.equal(ex.traza.base_para_tope_subsidio_c, 0);
});

test('CALC-ISN-001 · cuadro de 32 entidades: PTU exenta en Aguascalientes y gravada en Baja California Sur', () => {
  const ags = correr(cat, 'CALC-ISN-001', { registro: 'X', entidad: 'AGS', mes: '2026-08', conceptos: [{ concepto: 'sueldo', monto_c: 1000000 }, { concepto: 'ptu', monto_c: 500000 }] }).r;
  assert.equal(ags.traza.base_c, 1000000);
  assert.equal(ags.valor_c, 25000); // 2.5%
  const bcs = correr(cat, 'CALC-ISN-001', { registro: 'X', entidad: 'BCS', mes: '2026-08', conceptos: [{ concepto: 'sueldo', monto_c: 1000000 }, { concepto: 'ptu', monto_c: 500000 }] }).r;
  assert.equal(bcs.traza.base_c, 1500000);
  assert.equal(bcs.valor_c, 45000); // 3%
});

test('CALC-ISN-001 · fondo de ahorro de PRIME en CDMX: exento condicionado → grava y limita (C18)', () => {
  const { r, ctx } = correr(cat, 'CALC-ISN-001', { registro: 'X', entidad: 'CDMX', mes: '2026-08', conceptos: [{ concepto: 'fondo_ahorro_empresa', monto_c: 100000 }] });
  assert.equal(r.traza.base_c, 100000);
  assert.ok(ctx.limitaciones.some(l => l.motivo === 'exento_hasta_requiere_detalle'));
});

test('ISN: las 32 entidades tienen tasa 2026 y el cuadro trae cada concepto en las 32', () => {
  const ENT = ['AGS', 'BC', 'BCS', 'CAMP', 'CHIS', 'CHIH', 'CDMX', 'COAH', 'COL', 'DGO', 'GTO', 'GRO', 'HGO', 'JAL', 'MEX', 'MICH',
    'MOR', 'NAY', 'NL', 'OAX', 'PUE', 'QRO', 'QROO', 'SLP', 'SIN', 'SON', 'TAB', 'TAMS', 'TLAX', 'VER', 'YUC', 'ZAC'];
  for (const e of ENT) {
    assert.ok(cat.buscar('ISN_TASA', '2026-08-01', e), 'tasa ' + e);
    for (const c of ['sueldo', 'ptu', 'liquidacion', 'aguinaldo', 'gratificacion', 'fondo_ahorro_empresa', 'vacaciones']) assert.ok(cat.buscar('ISN_CONCEPTO:' + c, '2026-08-01', e), c + ' ' + e);
  }
});
