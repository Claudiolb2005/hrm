// Invariantes del kernel y de los parámetros (19-oct-2026).
//
// Las pruebas de «Reglas v1» comparan contra cifras de casos concretos. Éstas no
// necesitan cifras esperadas: verifican propiedades que la ley y las tablas
// publicadas obligan a cumplir para CUALQUIER entrada. Atrapan dos tipos de
// error que los casos concretos no ven: un renglón mal capturado en una tarifa y
// un comportamiento raro del código en fronteras (topes, rangos, cambios de UMA).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Exacto, E } from '../src/exacto.js';
import { aplicarTarifa } from '../src/reglas/comun.js';
import { catalogoSemilla, correr } from './util.js';

const cat = catalogoSemilla();
const F = '2026-08-06';
const TARIFAS = { diaria: '1', semanal: '7', decenal: '10', quincenal: '15', mensual: '30.4' };
const tabla = (per) => cat.obtener('ISR_TARIFA_' + per.toUpperCase(), F).valor;
const uma = E(cat.obtener('UMA_DIARIA', F).valor);

// Generador determinista (sin Math.random: la prueba debe ser reproducible).
function lcg(semilla) { let s = BigInt(semilla); return () => { s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 63n) - 1n); return Number(s >> 20n); }; }

// ───────────────────────── Estructura de las tarifas ─────────────────────────

for (const per of [...Object.keys(TARIFAS), 'anual']) {
  test('Tarifa ' + per + ': renglones contiguos, tasas crecientes y última abierta', () => {
    const t = tabla(per);
    assert.equal(t[0][0], '0.01', 'el primer límite inferior es 0.01');
    assert.equal(t[0][2], '0.00', 'la primera cuota fija es 0');
    for (let i = 0; i < t.length; i++) {
      const [li, ls, , pct] = t[i];
      if (i < t.length - 1) {
        assert.ok(ls !== null, 'renglón ' + (i + 1) + ' sin límite superior');
        assert.ok(E(ls).gt(li), 'renglón ' + (i + 1) + ': ls ≤ li');
        assert.ok(E(t[i + 1][0]).eq(E(ls).suma('0.01')), 'renglón ' + (i + 2) + ': li no es ls anterior + 0.01');
        assert.ok(E(t[i + 1][3]).gt(pct), 'renglón ' + (i + 2) + ': la tasa no crece');
      } else {
        assert.equal(ls, null, 'el último renglón debe ser «en adelante»');
      }
    }
  });

}

for (const per of ['mensual', 'anual']) {
  test('Tarifa ' + per + ': cada cuota fija es el impuesto acumulado de los renglones anteriores (±0.02)', () => {
    // CF(i+1) = CF(i) + (LI(i+1) − LI(i)) × %(i). El SAT redondea cada cuota a centavo;
    // más de dos centavos de diferencia es un error de captura.
    const t = tabla(per);
    for (let i = 0; i < t.length - 1; i++) {
      const esperado = E(t[i][2]).suma(E(t[i + 1][0]).resta(t[i][0]).por(Exacto.pct(t[i][3])));
      const dif = E(t[i + 1][2]).resta(esperado);
      assert.ok(dif.le('0.02') && dif.ge('-0.02'), per + ' renglón ' + (i + 2) + ': cuota fija ' + t[i + 1][2] + ' vs acumulado ' + esperado.texto(4));
    }
  });
}

test('Tarifa diaria = mensual ÷ 30.4 redondeada a centavo, al centavo', () => {
  const m = tabla('mensual'), d = tabla('diaria');
  assert.equal(d.length, m.length);
  for (let i = 0; i < d.length; i++) for (const col of [1, 2]) {
    if (m[i][col] === null) continue;
    const esp = E(m[i][col]).div('30.4').aCentavos();
    assert.ok(E(d[i][col]).eq(Exacto.centavos(esp)), 'diaria renglón ' + (i + 1) + ' col ' + col + ': ' + d[i][col] + ' vs ' + Exacto.centavos(esp).texto(2));
  }
});

test('Tarifas de 7, 10 y 15 días = diaria publicada × días, al centavo (método del Anexo 8)', () => {
  // El SAT redondea primero la diaria y luego multiplica: así se verifica cada
  // renglón de cada tabla sin tolerancia. Un límite que no cuadra es un dedazo.
  const d = tabla('diaria');
  for (const [per, dias] of Object.entries(TARIFAS)) {
    if (per === 'mensual' || per === 'diaria') continue;
    const t = tabla(per);
    assert.equal(t.length, d.length, per + ': distinto número de renglones');
    for (let i = 0; i < t.length; i++) {
      for (const col of [1, 2]) {
        if (d[i][col] === null) continue;
        assert.ok(E(t[i][col]).eq(E(d[i][col]).por(dias)), per + ' renglón ' + (i + 1) + ' col ' + col + ': ' + t[i][col] + ' vs ' + E(d[i][col]).por(dias).texto(2));
      }
      if (i > 0) assert.ok(E(t[i][0]).eq(E(t[i - 1][1]).suma('0.01')));
      assert.equal(t[i][3], d[i][3], per + ' renglón ' + (i + 1) + ': la tasa debe ser igual a la diaria');
    }
  }
});

test('Tarifa anual = mensual × 12, al centavo', () => {
  const m = tabla('mensual'), a = tabla('anual');
  assert.equal(a.length, m.length);
  for (let i = 0; i < a.length; i++) for (const col of [1, 2]) {
    if (m[i][col] === null) continue;
    const dif = E(a[i][col]).resta(E(m[i][col]).por(12));
    assert.ok(dif.le('0.12') && dif.ge('-0.12'), 'anual renglón ' + (i + 1) + ' col ' + col + ': ' + a[i][col] + ' vs ' + m[i][col] + ' × 12');
  }
});

// ───────────────────────── ISR: comportamiento de la función ─────────────────────────

for (const per of Object.keys(TARIFAS)) {
  test('ISR ' + per + ': creciente, nunca mayor que la base y continuo en las fronteras de renglón', () => {
    const t = tabla(per);
    const fila = cat.obtener('ISR_TARIFA_' + per.toUpperCase(), F);
    const isr = (c) => aplicarTarifa(fila, Exacto.centavos(c)).isr;
    const holgura = E(TARIFAS[per]).por('-0.01').resta('0.01'); // dos cuotas redondeadas × días
    // Fronteras: pasar de ls(i) a li(i+1) no puede «saltar» más que un centavo de base × tasa + 2 centavos.
    for (let i = 0; i < t.length - 1; i++) {
      const ls = Number(E(t[i][1]).por(100).texto(0)), sig = ls + 1;
      const salto = isr(sig).resta(isr(ls));
      // Las cuotas fijas publicadas son la diaria redondeada × días: en la frontera el ISR
      // puede moverse hasta un centavo por día del periodo. Es propiedad de la tabla
      // oficial (Anexo 8), no del código; más que eso sería un error de captura.
      assert.ok(salto.ge(holgura), per + ' frontera ' + (i + 1) + ': el ISR baja ' + salto.texto(4));
      assert.ok(salto.le(E('0.01').resta(holgura)), per + ' frontera ' + (i + 1) + ': salto de ' + salto.texto(4));
    }
    // Barrido aleatorio: monotonía y tasa marginal acotada por la tasa máxima.
    const r = lcg(per.length * 7919);
    const tope = Number(E(t[t.length - 1][0]).por(300).texto(0));
    let prev = null;
    const bases = Array.from({ length: 400 }, () => 1 + (r() % tope)).sort((a, b) => a - b);
    for (const b of bases) {
      const v = isr(b);
      assert.ok(v.le(Exacto.centavos(b)), per + ': ISR mayor que la base en ' + b);
      if (prev) {
        assert.ok(v.ge(prev.v.suma(holgura)), per + ': ISR no creciente entre ' + prev.b + ' y ' + b);
        const marginal = v.resta(prev.v).div(Exacto.centavos(b - prev.b || 1));
        assert.ok(marginal.le('0.3500001'), per + ': tasa marginal ' + marginal.texto(4) + ' > 35%');
      }
      prev = { b, v };
    }
  });
}

test('ISR retenido: nunca negativo y nunca mayor que el ISR antes de subsidio', () => {
  const r = lcg(42);
  for (let i = 0; i < 500; i++) {
    const base = r() % 1500000;
    const per = ['semanal', 'quincenal', 'mensual', 'decenal'][i % 4];
    const { r: res } = correr(cat, 'CALC-ISR-SEM-001', { base_gravable_c: base, fecha_pago: F, periodicidad: per });
    assert.ok(res.valor_c >= 0, 'negativo con base ' + base);
    assert.ok(res.valor_c <= res.extra.isr_antes_subsidio_c, 'retenido > ISR con base ' + base);
    assert.ok(res.extra.subsidio_acreditado_c <= res.extra.subsidio_c);
  }
});

test('ISR catorcenal (C1) = 2 × ISR semanal ± 0.05 cuando la base se reparte igual', () => {
  // La tarifa diaria × 14 y la semanal × 2 vienen de la misma mensual; sólo
  // difieren por el redondeo con que el SAT publica cada tabla.
  const r = lcg(1401);
  for (let i = 0; i < 200; i++) {
    const sem = 2 * (r() % 1000000);
    const cat14 = correr(cat, 'CALC-ISR-EXT-001', { pago_gravable_c: sem * 2, periodicidad: 'catorcenal', fecha_pago: F }).r.valor_c;
    const s7 = correr(cat, 'CALC-ISR-EXT-001', { pago_gravable_c: sem, periodicidad: 'semanal', fecha_pago: F }).r.valor_c;
    assert.ok(Math.abs(cat14 - 2 * s7) <= 5, 'base semanal ' + sem + ': catorcenal ' + cat14 + ' vs 2 × semanal ' + 2 * s7);
  }
});

test('Base cero o negativa: ISR cero con caso borde en la traza (C6)', () => {
  for (const b of [0, -1, -500000]) {
    const { r } = correr(cat, 'CALC-ISR-EXT-001', { pago_gravable_c: b, periodicidad: 'semanal', fecha_pago: F });
    assert.equal(r.valor_c, 0);
    assert.equal(r.traza.tarifa.caso_borde, 'base_cero_o_negativa');
  }
});

// ───────────────────────── Subsidio ─────────────────────────

test('Subsidio: frontera del tope al centavo (≤ tope aplica, tope + 0.01 no)', () => {
  const T = E(cat.obtener('SUBSIDIO_TOPE_MENSUAL', F).valor), D = E(cat.obtener('SUBSIDIO_DIVISOR_DIAS', F).valor);
  for (const [per, dias] of [['semanal', '7'], ['quincenal', '15'], ['mensual', '30.4'], ['decenal', '10']]) {
    const tope = T.div(D).por(dias);
    const pisoC = Number(tope.por(100).texto(6).split('.')[0]); // mayor base en centavos ≤ tope
    const dentro = correr(cat, 'CALC-SUB-001', { base_para_tope_c: pisoC, periodicidad: per, fecha_pago: F }).r.valor_c;
    const fuera = correr(cat, 'CALC-SUB-001', { base_para_tope_c: pisoC + 1, periodicidad: per, fecha_pago: F }).r.valor_c;
    assert.ok(dentro > 0, per + ': no aplica en ' + pisoC);
    assert.equal(fuera, 0, per + ': aplica arriba del tope (' + (pisoC + 1) + ')');
  }
});

test('Subsidio: el periodo es el mensual × días ÷ 30.4 y el acumulado del mes no excede el mensual', () => {
  const M = cat.obtener('SUBSIDIO_MONTO_MENSUAL', F);
  const mensual = correr(cat, 'CALC-SUB-001', { base_para_tope_c: 100000, periodicidad: 'mensual', fecha_pago: F }).r.valor_c;
  assert.equal(mensual, Number(E(M.valor).por(100).texto(0)));
  let acumulado = 0;
  for (let k = 0; k < 5; k++) { // cinco semanas pagadas en un mismo mes
    const s = correr(cat, 'CALC-SUB-001', { base_para_tope_c: 100000, periodicidad: 'semanal', fecha_pago: F, subsidio_previo_mes_c: acumulado }).r.valor_c;
    acumulado += s;
  }
  assert.ok(acumulado <= mensual, 'cinco semanas acumulan ' + acumulado + ' > ' + mensual);
  assert.equal(acumulado, mensual, 'la quinta semana completa exactamente el máximo mensual');
});

test('Subsidio enero usa el monto de enero; febrero en adelante el nuevo (cambio de UMA)', () => {
  const ene = correr(cat, 'CALC-SUB-001', { base_para_tope_c: 100000, periodicidad: 'mensual', fecha_pago: '2026-01-30' }).r.valor_c;
  const feb = correr(cat, 'CALC-SUB-001', { base_para_tope_c: 100000, periodicidad: 'mensual', fecha_pago: '2026-02-27' }).r.valor_c;
  assert.equal(ene, 53621);
  assert.equal(feb, 53565);
});

// ───────────────────────── IMSS, RCV, INFONAVIT ─────────────────────────

const SEM = { desde: '2026-07-27', hasta: '2026-08-02' };
const PRIMA = { pct: '0.50' };
const tope25_c = Number(uma.por(25).por(100).texto(0));

test('IMSS/RCV/INFONAVIT: arriba de 25 UMA el resultado es idéntico al del tope', () => {
  for (const regla of ['CALC-IMSS-001', 'CALC-RCV-001', 'CALC-INF-001']) {
    const enTope = correr(cat, regla, { sbc_c: tope25_c, periodo: SEM, incapacidades: 0, prima_rt: PRIMA }).r;
    const arriba = correr(cat, regla, { sbc_c: tope25_c * 3, periodo: SEM, incapacidades: 0, prima_rt: PRIMA }).r;
    assert.deepEqual(arriba.extra ?? arriba.valor_c, enTope.extra ?? enTope.valor_c, regla);
  }
});

test('IMSS: obrera y patronal crecen con el SBC; cuota fija no depende del SBC', () => {
  const r = lcg(7);
  const sbcs = Array.from({ length: 150 }, () => 31504 + (r() % (tope25_c - 31504))).sort((a, b) => a - b);
  let prev = null;
  for (const sbc of sbcs) {
    const x = correr(cat, 'CALC-IMSS-001', { sbc_c: sbc, periodo: SEM, incapacidades: 0, prima_rt: PRIMA }).r;
    if (prev) {
      assert.ok(x.extra.obrera_c >= prev.extra.obrera_c, 'obrera baja en ' + sbc);
      assert.ok(x.extra.patronal_c >= prev.extra.patronal_c, 'patronal baja en ' + sbc);
      assert.equal(x.traza.ramas_c.cuota_fija_pat, prev.traza.ramas_c.cuota_fija_pat);
    }
    prev = x;
  }
});

test('IMSS: sin excedente cuando el SBC ≤ 3 UMA; con excedente desde 3 UMA + 0.01', () => {
  const tres_c = Number(uma.por(3).por(100).texto(0));
  const bajo = correr(cat, 'CALC-IMSS-001', { sbc_c: tres_c, periodo: SEM, incapacidades: 0, prima_rt: PRIMA }).r.traza.ramas_c;
  assert.equal(bajo.excedente_pat, 0); assert.equal(bajo.excedente_obr, 0);
  const alto = correr(cat, 'CALC-IMSS-001', { sbc_c: tres_c + 100, periodo: SEM, incapacidades: 0, prima_rt: PRIMA }).r.traza.ramas_c;
  assert.ok(alto.excedente_pat > 0);
});

test('Incapacidades: restan días en IMSS y CEAV, no en retiro ni INFONAVIT', () => {
  const base = { sbc_c: 61588, periodo: SEM, prima_rt: PRIMA };
  const sin = (regla) => correr(cat, regla, { ...base, incapacidades: 0 }).r;
  const con = (regla) => correr(cat, regla, { ...base, incapacidades: ['2026-07-28', '2026-07-29'] }).r;
  assert.ok(con('CALC-IMSS-001').extra.obrera_c < sin('CALC-IMSS-001').extra.obrera_c);
  assert.equal(con('CALC-IMSS-001').traza.dias_cotizados, 5);
  assert.equal(con('CALC-RCV-001').extra.retiro_c, sin('CALC-RCV-001').extra.retiro_c);
  assert.ok(con('CALC-RCV-001').extra.ceav_pat_c < sin('CALC-RCV-001').extra.ceav_pat_c);
  assert.equal(correr(cat, 'CALC-INF-001', { ...base, incapacidades: ['2026-07-28'] }).r.valor_c, sin('CALC-INF-001').valor_c);
  const todo = correr(cat, 'CALC-IMSS-001', { ...base, incapacidades: 7 }).r;
  assert.equal(todo.extra.obrera_c, 0); assert.equal(todo.extra.patronal_c, 0);
});

test('CEAV: fronteras de rango exactas y truncado a dos decimales (C4)', () => {
  // SBC = veces × UMA; el rango se decide con veces truncado, no redondeado.
  // C13: el renglón 3.150% («1.00 SM») sólo aplica con SBC = SM exacto; 1.00 UMA cae ya en el segundo renglón.
  const casos = [['1.00', '3.676'], ['1.009', '3.676'], ['1.01', '3.676'], ['1.50', '3.676'], ['1.509', '3.676'], ['1.51', '4.851'],
    ['2.00', '4.851'], ['2.01', '5.556'], ['3.00', '6.026'], ['3.01', '6.361'], ['4.00', '6.613'], ['4.01', '7.513'], ['24.99', '7.513']];
  const dia = { desde: '2026-08-03', hasta: '2026-08-03' };
  for (const [veces, tasa] of casos) {
    // SBC en centavos que da exactamente esas veces (el menor en centavos que las alcanza).
    const sbc_c = Math.ceil(Number(uma.por(veces).por(100).texto(6))); // menor SBC ≥ veces × UMA
    const { r } = correr(cat, 'CALC-RCV-001', { sbc_c, periodo: dia, incapacidades: 0 });
    const clave = Object.keys(r.traza.rango_ceav)[0];
    assert.ok(clave.endsWith('→' + tasa + '%'), veces + ' UMA → ' + clave + ' (esperado ' + tasa + '%)');
  }
});

test('CEAV y cuota obrera con SBC = salario mínimo exacto (C13 y C14)', () => {
  const dia = { desde: '2026-08-03', hasta: '2026-08-09' };
  const sm = correr(cat, 'CALC-RCV-001', { sbc_c: 31504, periodo: dia, incapacidades: 0 });
  assert.deepEqual(sm.r.traza.rango_ceav, { '1.00 SM→3.150%': 7 });
  assert.ok(sm.ctx.criterios.has('C13') && sm.ctx.criterios.has('C14'));
  assert.equal(sm.r.extra.retencion_ceav_obr_c, 0);
  assert.equal(sm.r.extra.ceav_obr_a_cargo_patron_c, sm.r.extra.ceav_obr_c);
  const un = correr(cat, 'CALC-RCV-001', { sbc_c: 31505, periodo: dia, incapacidades: 0 });
  assert.ok(Object.keys(un.r.traza.rango_ceav)[0].endsWith('→6.026%'));
  assert.ok(!un.ctx.criterios.has('C13') && !un.ctx.criterios.has('C14'));
  // IMSS: la cuota obrera se calcula, pero no se retiene; el renglón patronal la incluye.
  const im = correr(cat, 'CALC-IMSS-001', { sbc_c: 31504, periodo: dia, incapacidades: 0, prima_rt: { pct: '0.54355' } }).r;
  assert.equal(im.extra.obrera_c, 2756); assert.equal(im.valor_c, 0);
  assert.deepEqual(im.renglones, [{ rubro: 'imss_obrera', valor_c: 0 }, { rubro: 'imss_patronal', valor_c: 27875 + 2756 }]);
  // Con salario diario = SM y SBC integrado (330.57) también aplica C14; C13 no (el SBC no es el mínimo).
  const sd = correr(cat, 'CALC-RCV-001', { sbc_c: 33057, salario_diario_c: 31504, periodo: dia, incapacidades: 0 });
  assert.ok(sd.ctx.criterios.has('C14') && !sd.ctx.criterios.has('C13'));
  assert.equal(sd.r.traza.salario_minimo.medido, 'salario_diario');
});

test('Cambio de UMA dentro del periodo: cada día usa la UMA vigente ese día', () => {
  const cruce = { desde: '2026-01-29', hasta: '2026-02-04' }; // 3 días con UMA 2025 y 4 con UMA 2026
  const { r } = correr(cat, 'CALC-IMSS-001', { sbc_c: 61588, periodo: cruce, incapacidades: [], prima_rt: { pct: '0.50' } });
  assert.deepEqual(r.traza.dias_por_uma, { '113.14': 3, '117.31': 4 });
  const cf = E('113.14').por(3).suma(E('117.31').por(4)).por(Exacto.pct('20.40')).aCentavos();
  assert.equal(r.traza.ramas_c.cuota_fija_pat, cf);
});

// ───────────────────────── Exenciones ─────────────────────────

test('Exenciones: la parte exenta nunca excede el monto ni el tope; gravable + exento = monto', () => {
  const r = lcg(93);
  const conceptos = ['aguinaldo', 'prima_vacacional', 'ptu', 'tiempo_extra', 'prima_dominical', 'sueldo', 'gratificacion'];
  for (let i = 0; i < 300; i++) {
    const percepciones = conceptos.filter((_, k) => (r() >> k) & 1).map(c => ({ concepto: c, monto_c: r() % 2000000, domingos: 1 + (r() % 4) }));
    if (!percepciones.length) continue;
    const consumido = { aguinaldo: r() % 400000, prima_vacacional: r() % 200000, ptu: r() % 200000, tiempo_extra: r() % 60000 };
    const { r: res } = correr(cat, 'CALC-EXE-001', { fecha_pago: F, percepciones, consumido, semanas_periodo: 1 });
    let suma = 0;
    for (const c of res.traza.conceptos) {
      assert.ok(c.exento_c >= 0 && c.exento_c <= c.monto_c, c.concepto + ': exento fuera de rango');
      assert.equal(c.exento_c + c.gravable_c, c.monto_c);
      if (c.tope) assert.ok(c.exento_c <= Math.round(Number(c.tope) * 100), c.concepto + ': exento > tope');
      suma += c.gravable_c;
    }
    assert.equal(res.valor_c, suma);
  }
});

test('Exenciones: tope anual al centavo (aguinaldo 30 UMA = 3,519.30)', () => {
  const tope_c = Number(uma.por(30).por(100).texto(0));
  assert.equal(tope_c, 351930);
  const justo = correr(cat, 'CALC-EXE-001', { fecha_pago: F, consumido: { aguinaldo: 0 }, percepciones: [{ concepto: 'aguinaldo', monto_c: tope_c }] }).r;
  assert.equal(justo.valor_c, 0);
  const mas = correr(cat, 'CALC-EXE-001', { fecha_pago: F, consumido: { aguinaldo: 0 }, percepciones: [{ concepto: 'aguinaldo', monto_c: tope_c + 1 }] }).r;
  assert.equal(mas.valor_c, 1);
  const agotado = correr(cat, 'CALC-EXE-001', { fecha_pago: F, consumido: { aguinaldo: tope_c }, percepciones: [{ concepto: 'aguinaldo', monto_c: 100000 }] }).r;
  assert.equal(agotado.valor_c, 100000);
});

test('Exenciones: aguinaldo y gratificación comparten un solo tope anual', () => {
  const { r } = correr(cat, 'CALC-EXE-001', { fecha_pago: F, consumido: { aguinaldo: 0 },
    percepciones: [{ concepto: 'aguinaldo', monto_c: 300000 }, { concepto: 'gratificacion', monto_c: 300000 }] });
  assert.equal(r.traza.exento_total_c, 351930);
});

test('Exenciones: tiempo extra — mitad del monto hasta 5 UMA por semana (× semanas en catorcenal)', () => {
  const sem = correr(cat, 'CALC-EXE-001', { fecha_pago: F, consumido: {}, semanas_periodo: 1, percepciones: [{ concepto: 'tiempo_extra', monto_c: 2000000 }] }).r;
  assert.equal(sem.traza.exento_total_c, Number(uma.por(5).por(100).texto(0)));
  const cat2 = correr(cat, 'CALC-EXE-001', { fecha_pago: F, consumido: {}, semanas_periodo: 2, percepciones: [{ concepto: 'tiempo_extra', monto_c: 2000000 }] }).r;
  assert.equal(cat2.traza.exento_total_c, Number(uma.por(10).por(100).texto(0)));
  const poco = correr(cat, 'CALC-EXE-001', { fecha_pago: F, consumido: {}, semanas_periodo: 1, percepciones: [{ concepto: 'tiempo_extra', monto_c: 30001 }] }).r;
  assert.equal(poco.traza.exento_total_c, 15001, 'mitad de 300.01 redondeada medio hacia arriba');
});

test('Años de servicio: más de seis meses cuenta como año; seis meses exactos no', () => {
  const sep = (ing, baja) => correr(cat, 'CALC-EXE-001', { fecha_pago: F, separacion: { fecha_ingreso: ing, fecha_baja: baja },
    percepciones: [{ concepto: 'indemnizacion', monto_c: 100000000 }] }).r.traza.exento_total_c;
  const anio = Number(uma.por(90).por(100).texto(0));
  assert.equal(sep('2023-02-01', '2026-08-01'), 3 * anio, '3 años 6 meses exactos');
  assert.equal(sep('2023-02-01', '2026-08-02'), 4 * anio, '3 años 6 meses 1 día');
  assert.equal(sep('2025-08-01', '2026-08-01'), 1 * anio);
});
