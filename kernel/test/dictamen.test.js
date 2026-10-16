// Tolerancia (T4), materialidad (T5), opinión (módulo 19, D13), reproceso (T6) y consolidado de grupo (T7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toleranciaAgregada, aplicarTolerancia, toleranciaPorGrupo, umbralMaterialidad, evaluarMaterialidad, estadoModulos, proponerOpinion,
  opinionFinal, consolidarOpiniones, validarReproceso, transicionHallazgos, armarContenido, huellaContenido, verificarDictamen, moduloDeRegla } from '../src/index.js';

test('T4: agregado = máx($5.00, colaboradores × $0.50); con PRIME (3,597) da $1,798.50', () => {
  assert.equal(toleranciaAgregada(3), 500);
  assert.equal(toleranciaAgregada(3597), 179850);
});

test('T4: 3,597 diferencias de $0.49 son ruido; la tolerancia no oculta un sesgo mayor', () => {
  const ds = Array.from({ length: 3597 }, (_, i) => ({ diferencia_c: 49, id: i }));
  const r = aplicarTolerancia(ds, { colaboradores: 3597 });
  assert.equal(r.fuera.length, 0);
  assert.equal(r.toleradas, 3597);
  assert.equal(r.suma_tolerada_c, 176253);
  // 100 colaboradores con $0.49 en el mismo sentido: $49 > $50? no; con 20 colaboradores el agregado es $10 y rompe
  const r2 = aplicarTolerancia(ds.slice(0, 30), { colaboradores: 20 });
  assert.equal(r2.rompe_agregado, true);
  assert.equal(r2.fuera.length, 30);
  assert.ok(r2.fuera.every(d => d.por_agregado));
});

test('T4: el ruido con signos opuestos se cancela; lo que excede $0.50 siempre sale', () => {
  const ds = [{ diferencia_c: 30 }, { diferencia_c: -30 }, { diferencia_c: 2 }, { diferencia_c: -468 }];
  const r = aplicarTolerancia(ds, { colaboradores: 4 });
  assert.deepEqual(r.fuera.map(d => d.diferencia_c), [-468]);
  assert.equal(r.toleradas, 3);
  assert.equal(r.suma_tolerada_c, 2);
});

test('T4: la tolerancia no aplica a entero — la diferencia es cero o es hallazgo', () => {
  const r = aplicarTolerancia([{ diferencia_c: 1 }], { colaboradores: 5000, entero: true });
  assert.equal(r.fuera.length, 1);
  assert.equal(r.entero, true);
});

test('T4: por grupo rubro × corrida, con colaboradores distintos del grupo', () => {
  const calculos = [{ rubro: 'isr', corrida_id: 'SEM31', colaborador_id: 'a' }, { rubro: 'isr', corrida_id: 'SEM31', colaborador_id: 'b' },
    { rubro: 'isn_enterado', corrida_id: null, colaborador_id: 'a' }];
  const difs = [{ rubro: 'isr', corrida_id: 'SEM31', diferencia_c: 2 }, { rubro: 'isr', corrida_id: 'SEM31', diferencia_c: -468 },
    { rubro: 'isn_enterado', corrida_id: null, diferencia_c: 1 }];
  const r = toleranciaPorGrupo(difs, calculos, { rubros_entero: ['isn_enterado'] });
  assert.equal(r.fuera.length, 2);
  assert.equal(r.toleradas, 1);
  assert.equal(r.resumen.find(x => x.rubro === 'isr').colaboradores, 2);
});

test('T5: umbral 0.5 % de la carga del periodo dictaminado, con piso de $10,000', () => {
  assert.equal(umbralMaterialidad({ carga_patronal_c: 2775600000 }).umbral_c, 13878000); // PRIME: $138,780 al mes
  const chica = umbralMaterialidad({ carga_patronal_c: 22240000 }); // 45 colaboradores: 0.5 % = $1,112
  assert.equal(chica.porcentaje_c, 111200);
  assert.equal(chica.umbral_c, 1000000);
  assert.equal(chica.manda, 'piso');
  assert.equal(umbralMaterialidad({ carga_patronal_c: 101 }).porcentaje_c, 1, 'medio hacia arriba: 0.505 → 1');
  assert.equal(umbralMaterialidad({}).umbral_c, null);
  // El mismo hallazgo de $800,000: material contra el mes, no contra el ejercicio
  const h = { tipo: 'cuantitativo', efecto_max_c: 80000000 };
  assert.equal(evaluarMaterialidad(h, { umbral_c: 13878000 }).material, true);
  assert.equal(evaluarMaterialidad(h, { umbral_c: umbralMaterialidad({ carga_patronal_c: 2775600000 * 12 }).umbral_c }).material, false);
});

test('T5: cualitativo siempre es material; la recurrencia en 3 periodos también', () => {
  assert.deepEqual(evaluarMaterialidad({ tipo: 'cualitativo', motivo_cualitativo: 'retencion_no_enterada', efecto_max_c: 1 }, { umbral_c: 1000000 }).motivos,
    ['cualitativo: Retención no enterada']);
  assert.throws(() => evaluarMaterialidad({ tipo: 'cualitativo', motivo_cualitativo: 'otro' }, { umbral_c: 1 }), /motivo/);
  const h1 = { tipo: 'cuantitativo', efecto_max_c: 375000 }; // hallazgo 1: ~$3,750 al mes
  assert.equal(evaluarMaterialidad(h1, { umbral_c: 13878000, periodos: 2 }).material, false);
  assert.deepEqual(evaluarMaterialidad(h1, { umbral_c: 13878000, periodos: 3 }).motivos, ['recurrencia: 3 periodos']);
  assert.equal(evaluarMaterialidad(h1, { umbral_c: null }).indeterminado, true);
});

const resultados = [
  { regla_id: 'CALC-ISR-SEM-001', estado: 'completo', esperado: 10, efectivo: 10 },
  { regla_id: 'CALC-SUB-001', estado: 'completo', esperado: 10, efectivo: 10 },
  { regla_id: 'CALC-ISN-001', estado: 'universo_parcial', esperado: 10, efectivo: 8 },
  { regla_id: 'CALC-IMSS-001', estado: 'limitacion_alcance', esperado: 10, efectivo: 0 },
];

test('módulos: el peor estado de sus reglas manda; sin reglas es fuera de alcance', () => {
  const ms = estadoModulos(resultados);
  const de = (k) => ms.find(m => m.modulo === k);
  assert.equal(moduloDeRegla('CALC-EXE-001'), '4.3');
  assert.equal(de('4.3').estado, 'completo');
  assert.equal(de('4.8').estado, 'universo_parcial');
  assert.equal(de('4.5').estado, 'limitacion_alcance');
  assert.equal(de('4.13').estado, 'fuera_de_alcance');
  assert.equal(estadoModulos(resultados, [{ modulo: '4.11', motivo: 'Finiquitos sin regla en la v1' }]).find(m => m.modulo === '4.11').estado, 'limitacion_alcance');
});

const soloISR = estadoModulos(resultados.slice(0, 2));
const ambas = { prenomina: true, xml_nomina: true };

test('opinión 1: sin XML originales no hay opinión, aunque todo cuadre (D13)', () => {
  const p = proponerOpinion({ fuentes: { prenomina: true }, modulos: soloISR, hallazgos: [] });
  assert.equal(p.opinion, 'sin_opinion');
  assert.deepEqual(p.faltan_fuentes, ['xml_nomina']);
  assert.throws(() => opinionFinal(p, { opinion: 'conforme', motivo: 'el revisor lo considera suficiente' }), /D13/);
});

test('opinión 5 y 4: conforme sin hallazgos; con observaciones si ninguno es material', () => {
  assert.equal(proponerOpinion({ fuentes: ambas, modulos: soloISR, hallazgos: [] }).opinion, 'conforme');
  const p = proponerOpinion({ fuentes: ambas, modulos: soloISR, hallazgos: [{ id: 'H1', modulo: '4.3', material: false }] });
  assert.equal(p.opinion, 'conforme_con_observaciones');
  assert.equal(p.semaforo['4.3'].color, 'amarillo');
});

test('opinión 3: un material o una limitación en un rubro → con salvedades nombrando el rubro', () => {
  const p = proponerOpinion({ fuentes: ambas, modulos: soloISR, hallazgos: [{ id: 'H1', modulo: '4.3', material: true, titulo: 'Subsidio 15.59 %' }] });
  assert.equal(p.opinion, 'con_salvedades');
  assert.equal(p.semaforo['4.3'].color, 'rojo');
  const q = proponerOpinion({ fuentes: ambas, modulos: estadoModulos(resultados), hallazgos: [] });
  assert.equal(q.opinion, 'con_salvedades');
  assert.deepEqual(q.salvedades.map(s => s.modulo).sort(), ['4.5', '4.8']);
  assert.equal(q.semaforo['4.5'].color, 'gris');
});

test('opinión 2: materiales en 3 módulos, o a nivel neto, es adverso', () => {
  const ms = estadoModulos([...resultados.slice(0, 2), { regla_id: 'CALC-ISN-001', estado: 'completo' }, { regla_id: 'CALC-RCV-001', estado: 'completo' }]);
  const hs = ['4.3', '4.5', '4.8'].map((m, i) => ({ id: 'H' + i, modulo: m, material: true }));
  assert.equal(proponerOpinion({ fuentes: ambas, modulos: ms, hallazgos: hs }).opinion, 'adverso');
  assert.equal(proponerOpinion({ fuentes: ambas, modulos: ms, hallazgos: hs.slice(0, 2) }).opinion, 'con_salvedades');
  assert.equal(proponerOpinion({ fuentes: ambas, modulos: ms, hallazgos: [{ id: 'N', modulo: '4.2', material: true, alcance_neto: true }] }).opinion, 'adverso');
});

test('el revisor cambia la opinión sólo con motivo escrito', () => {
  const p = proponerOpinion({ fuentes: ambas, modulos: soloISR, hallazgos: [{ id: 'H1', modulo: '4.3', material: true }] });
  assert.throws(() => opinionFinal(p, { opinion: 'conforme_con_observaciones' }), /motivo/);
  const f = opinionFinal(p, { opinion: 'conforme_con_observaciones', motivo: 'El cliente corrigió y enteró en el mismo periodo' });
  assert.equal(f.cambiada, true);
  assert.equal(opinionFinal(p, {}).opinion, 'con_salvedades');
});

test('T7: el consolidado es la peor opinión y nombra el RFC que la determina', () => {
  const c = consolidarOpiniones([{ rfc: 'AAA010101AAA', opinion: 'conforme' }, { rfc: 'BBB010101BBB', opinion: 'con_salvedades' }, { rfc: 'CCC010101CCC', opinion: 'conforme_con_observaciones' }]);
  assert.equal(c.opinion, 'con_salvedades');
  assert.deepEqual(c.determinada_por, ['BBB010101BBB']);
  assert.equal(consolidarOpiniones([{ rfc: 'A', opinion: 'sin_opinion' }, { rfc: 'B', opinion: 'adverso' }]).opinion, 'adverso');
});

test('T6: reproceso con motivo y quién lo dispara; pasados 60 días del cierre es encargo nuevo', () => {
  const enc = { cerrado_en: '2026-09-01T00:00:00Z' };
  assert.equal(validarReproceso({ anterior: null, encargo: enc }).version, 1);
  assert.throws(() => validarReproceso({ anterior: { version: 1 }, encargo: enc, ahora: '2026-09-10T00:00:00Z', motivo: 'corto', disparado_por: 'cliente' }), /qué cambió/);
  assert.throws(() => validarReproceso({ anterior: { version: 1 }, encargo: enc, ahora: '2026-09-10T00:00:00Z', motivo: 'Llegaron los XML originales', disparado_por: 'otro' }), /cliente/);
  assert.equal(validarReproceso({ anterior: { version: 1 }, encargo: enc, ahora: '2026-10-31T00:00:00Z', motivo: 'Llegaron los XML originales', disparado_por: 'cliente' }).version, 2);
  assert.throws(() => validarReproceso({ anterior: { version: 2 }, encargo: enc, ahora: '2026-11-01T00:00:01Z', motivo: 'Llegaron los XML originales', disparado_por: 'hrm' }), /encargo nuevo/);
});

test('T6: los hallazgos de la versión anterior cambian de estado, nunca desaparecen', () => {
  const t = transicionHallazgos([{ id: 'H1', estatus: 'abierto' }, { id: 'H2', estatus: 'abierto' }, { id: 'H3', estatus: 'abierto' }],
    [{ id: 'H1' }, { id: 'H4', supera_a: 'H2' }]);
  assert.deepEqual(t.map(x => x.despues), ['confirmado', 'superado', 'resuelto_por_reproceso']);
});

test('contenido: título según origen, nota de alcance, huella estable y verificable', async () => {
  const modulos = estadoModulos(resultados.slice(0, 2));
  const hallazgos = [{ id: 'H1', numero: 1, titulo: 'Subsidio con el porcentaje de enero', modulo: '4.3', criterio: 'Decreto DOF 31-dic-2025', condicion: '15.59 % en lugar de 15.02 %',
    riesgo: 'medio', estatus: 'abierto', efecto_max_c: 375000, material: false, motivos_material: [] }];
  const propuesta = proponerOpinion({ fuentes: ambas, modulos, hallazgos });
  const base = { empresa: { id: 1, nombre: 'PrimeWireless', rfc: 'PHO000000AAA' }, ejecucion: { id: 'ejec_1', sello: 'abc', kernel_version: '0.3.0' },
    fuentes: ambas, modulos, hallazgos, propuesta, final: opinionFinal(propuesta), version: 1, tolerancia: {}, materialidad: {}, base_normativa: [] };
  const c1 = armarContenido({ ...base, encargo: { id: 'e', origen_nomina: 'cliente', periodo_desde: '2026-08-01', periodo_hasta: '2026-08-31', nivel: 'B5' } });
  assert.equal(c1.portada.titulo, 'Dictamen de supervisión de nómina');
  assert.match(c1.portada.nota_alcance, /No constituye ni sustituye el dictamen fiscal/);
  assert.match(c1.s9_opinion.frase, /^En nuestra opinión, la nómina de PrimeWireless/);
  const c2 = armarContenido({ ...base, encargo: { id: 'e', origen_nomina: 'la_casa', periodo_desde: '2026-08-01', periodo_hasta: '2026-08-31', nivel: 'B5' } });
  assert.equal(c2.portada.titulo, 'Revisión de control interno de nómina');
  assert.match(c2.s9_opinion.frase, /revisión de control interno/);
  const h = await huellaContenido(c1);
  assert.equal(h, await huellaContenido(JSON.parse(JSON.stringify(c1))));
  assert.equal(await verificarDictamen({ contenido_json: JSON.stringify(c1), huella_contenido: h }), true);
  c1.s9_opinion.opinion = 'conforme';
  assert.equal(await verificarDictamen({ contenido_json: JSON.stringify(c1), huella_contenido: h }), false);
});
