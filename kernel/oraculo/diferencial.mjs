// diferencial.mjs — Prueba diferencial kernel (JS) ↔ oráculo independiente (Python).
//
// El oráculo se escribió desde la ley y la especificación, sin ver el código del
// kernel. Si los dos coinciden al centavo en miles de casos —aleatorios y de
// frontera— la probabilidad de que ambos tengan el MISMO error de lógica es baja.
// Lo que esta prueba NO cubre: un parámetro mal capturado (ambos leen el mismo
// archivo) ni un criterio mal decidido (ambos siguen la misma especificación).
// Para eso están el cotejo contra el DOF y los casos dorados de Rafael.
//
// Uso:  node oraculo/diferencial.mjs [n=3000] [semilla=20261019]
// Sale con código 1 si hay una sola diferencia.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Catalogo, Contexto, reglaPorId } from '../src/index.js';

const AQUI = new URL('./', import.meta.url);

export function generarCasos(n = 3000, semilla = 20261019) {
  let s = BigInt(semilla);
  const r = () => { s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 63n) - 1n); return Number(s >> 20n); };
  const elige = (xs) => xs[r() % xs.length];
  const fechas = ['2026-01-15', '2026-01-30', '2026-02-06', '2026-03-13', '2026-06-30', '2026-08-06', '2026-08-14', '2026-08-28', '2026-11-27', '2026-12-18'];
  // Bases: mezcla de montos típicos y valores pegados a las fronteras de tarifa y de tope.
  const tarifa = JSON.parse(readFileSync(new URL('../data/parametros-2026.json', import.meta.url))).filas;
  const fronteras = {};
  for (const per of ['DIARIA', 'SEMANAL', 'DECENAL', 'QUINCENAL', 'MENSUAL']) {
    const t = tarifa.find(f => f.clave === 'ISR_TARIFA_' + per).valor;
    fronteras[per.toLowerCase()] = t.flatMap(([li, ls]) => [li, ls].filter(Boolean).map(v => Math.round(Number(v) * 100)));
  }
  fronteras.catorcenal = fronteras.diaria.map(c => c * 14);
  const base = (per) => {
    const k = r() % 10;
    if (k < 3) { const f = elige(fronteras[per]); return Math.max(0, f + (r() % 5) - 2); }
    if (k < 4) return r() % 50000;
    const escala = { diaria: 500000, semanal: 3000000, decenal: 4000000, catorcenal: 6000000, quincenal: 6000000, mensual: 12000000 }[per];
    return r() % escala;
  };
  const periodos = [
    { desde: '2026-07-27', hasta: '2026-08-02' }, { desde: '2026-01-26', hasta: '2026-02-08' },
    { desde: '2026-08-01', hasta: '2026-08-31' }, { desde: '2026-08-03', hasta: '2026-08-16' }, { desde: '2026-01-29', hasta: '2026-02-04' },
  ];
  const casos = [];
  for (let i = 0; i < n; i++) {
    const k = i % 11, id = 'c' + i, fecha_pago = elige(fechas);
    if (k === 0) {
      const periodicidad = elige(['semanal', 'decenal', 'quincenal', 'mensual', 'diaria']);
      casos.push({ id, regla: 'CALC-ISR-SEM-001', entrada: { base_gravable_c: base(periodicidad), fecha_pago, periodicidad } });
    } else if (k === 1) {
      const b = base('catorcenal');
      casos.push({ id, regla: 'CALC-ISR-CAT-001', entrada: { base_gravable_c: b, base_para_tope_c: r() % 3 ? b : Math.max(0, b - (r() % 100000)), fecha_pago } });
    } else if (k === 2) {
      const periodicidad = elige(['semanal', 'decenal', 'catorcenal', 'quincenal', 'mensual']);
      casos.push({ id, regla: 'CALC-SUB-001', entrada: { base_para_tope_c: base(periodicidad), periodicidad, fecha_pago, subsidio_previo_mes_c: r() % 4 ? 0 : r() % 60000 } });
    } else if (k === 3) {
      const periodicidad = elige(['semanal', 'catorcenal', 'quincenal']);
      casos.push({ id, regla: 'CALC-ISR-EXT-001', entrada: { pago_gravable_c: r() % 40000000, periodicidad, fecha_pago } });
    } else if (k === 4) {
      const nom = 1 + (r() % 5), bases_mes_c = Array.from({ length: nom }, () => r() % 4000000);
      casos.push({ id, regla: 'CALC-ISR-AJM-001', entrada: { bases_mes_c, isr_retenido_previo_mes_c: r() % 500000, fecha_pago, aplica_ajuste_mensual: r() % 6 !== 0 } });
    } else if (k === 5 || k === 6 || k === 7) {
      const regla = ['CALC-IMSS-001', 'CALC-RCV-001', 'CALC-INF-001'][k - 5];
      const periodo = elige(periodos);
      let sbc_c = r() % 5 === 0 ? 300000 + (r() % 400000) : 27800 + (r() % 120000);
      // Criterios C13/C14: SBC = salario mínimo exacto, o salario diario mínimo con SBC integrado.
      const extra = {};
      const sm = r() % 8;
      if (sm === 0) sbc_c = 31504;
      else if (sm === 1) { extra.salario_diario_c = 31504; sbc_c = 33057; }
      else if (sm === 2) { extra.zona_salarial = 'frontera'; if (r() % 2) sbc_c = 44087; else { extra.salario_diario_c = 44087; sbc_c = 31504; } }
      else if (sm === 3) extra.salario_diario_c = 31504 + 1 + (r() % 50000);
      let incapacidades = 0;
      const t = r() % 4;
      if (t === 1) incapacidades = r() % 3;
      if (t === 2) incapacidades = [periodo.desde];
      // Incapacidad como número con cambio de UMA: el kernel limita, el número sigue comparable.
      casos.push({ id, regla, entrada: { sbc_c, ...extra, periodo, incapacidades, prima_rt: { pct: elige(['0.50', '0.54355', '2.59840', '7.58875', '15.00']) } } });
    } else if (k === 9 || k === 10) {
      // RLISR art. 174 (C17) y LISR art. 95 (C16).
      const sd = 31504 + (r() % 270000);
      const sueldo = r() % 4 === 0 ? { sueldo_mensual_c: 950000 + (r() % 9000000) } : { salario_diario_c: sd };
      const sm = sueldo.sueldo_mensual_c ?? sd * (k === 9 ? 30.4 : 30);
      const t = r() % 10;
      let g;
      if (t === 0) g = 0;
      else if (t < 3 && k === 10) g = Math.max(0, Math.round(sm) + (r() % 7) - 3);   // gravado ≈ sueldo
      else if (t < 4) g = r() % 2000000;
      else g = r() % 100000000;
      if (k === 9) casos.push({ id, regla: 'CALC-ISR-174-001', entrada: { pago_gravable_c: g, fecha_pago, ...sueldo, concepto: elige(['ptu', 'aguinaldo', 'prima_vacacional']) } });
      else casos.push({ id, regla: 'CALC-ISR-SEP-001', entrada: { separacion_gravable_c: g, fecha_pago, ...sueldo } });
    } else {
      const conceptos = ['sueldo', 'aguinaldo', 'prima_vacacional', 'ptu', 'tiempo_extra', 'prima_dominical', 'gratificacion', 'fondo_ahorro_empresa', 'dia_festivo'];
      const percepciones = conceptos.filter(() => r() % 3 === 0).map(c => ({ concepto: c, monto_c: r() % 3000000, domingos: 1 + (r() % 4) }));
      if (r() % 5 === 0) percepciones.push({ concepto: elige(['indemnizacion', 'liquidacion', 'prima_antiguedad']), monto_c: r() % 80000000 });
      const consumido = { aguinaldo: r() % 400000, prima_vacacional: r() % 200000, ptu: r() % 200000, tiempo_extra: r() % 80000 };
      const sep = percepciones.some(p => ['indemnizacion', 'liquidacion', 'prima_antiguedad'].includes(p.concepto))
        ? { fecha_ingreso: elige(['2010-03-15', '2019-02-01', '2023-02-07', '2025-12-01', '2023-01-31']), fecha_baja: fecha_pago } : undefined;
      casos.push({ id, regla: 'CALC-EXE-001', entrada: { fecha_pago, percepciones, consumido, semanas_periodo: 1 + (r() % 2),
        perfil: { fondo_ahorro_cumple_requisitos: elige([true, false]) }, ...(sep ? { separacion: sep } : {}) } });
    }
  }
  return casos;
}

// Qué se compara de cada regla (los extras que ambos devuelven).
const CAMPOS = {
  'CALC-ISR-SEM-001': (k) => ({ valor_c: k.valor_c, isr_antes_subsidio_c: k.extra.isr_antes_subsidio_c, subsidio_c: k.extra.subsidio_c }),
  'CALC-ISR-CAT-001': (k) => ({ valor_c: k.valor_c, isr_antes_subsidio_c: k.extra.isr_antes_subsidio_c, subsidio_c: k.extra.subsidio_c }),
  'CALC-SUB-001': (k) => ({ valor_c: k.valor_c }),
  'CALC-ISR-EXT-001': (k) => ({ valor_c: k.valor_c }),
  'CALC-ISR-AJM-001': (k) => ({ valor_c: k.valor_c }),
  'CALC-IMSS-001': (k) => ({ valor_c: k.valor_c, patronal_c: k.extra.patronal_c, obrera_c: k.extra.obrera_c }),
  'CALC-RCV-001': (k) => ({ valor_c: k.valor_c, retiro_c: k.extra.retiro_c, ceav_pat_c: k.extra.ceav_pat_c, ceav_obr_c: k.extra.ceav_obr_c, retencion_ceav_obr_c: k.extra.retencion_ceav_obr_c }),
  'CALC-INF-001': (k) => ({ valor_c: k.valor_c }),
  'CALC-ISR-174-001': (k) => ({ valor_c: k.valor_c }),
  'CALC-ISR-SEP-001': (k) => ({ valor_c: k.valor_c }),
  'CALC-EXE-001': (k) => ({ valor_c: k.valor_c, exento_total_c: k.traza.exento_total_c, base_para_tope_subsidio_c: k.extra.base_para_tope_subsidio_c }),
};

export function correrKernel(casos) {
  const cat = new Catalogo(JSON.parse(readFileSync(new URL('../data/parametros-2026.json', import.meta.url))).filas);
  return casos.map(c => {
    try {
      const k = reglaPorId(c.regla).calcular(structuredClone(c.entrada), new Contexto(cat));
      return { id: c.id, ...(k.no_aplica ? { valor_c: null } : CAMPOS[c.regla](k)) };
    } catch (e) { return { id: c.id, error: e.message }; }
  });
}

export function correrOraculo(casos) {
  const p = spawnSync('python3', ['-I', fileURLToPath(new URL('oraculo.py', AQUI))], { input: JSON.stringify({ casos }), maxBuffer: 1 << 28, encoding: 'utf8' });
  if (p.status !== 0) throw new Error('oráculo: ' + p.stderr);
  return JSON.parse(p.stdout).resultados;
}

export function comparar(casos, kern, orac) {
  const porId = new Map(orac.map(o => [o.id, o]));
  const difs = [];
  const porRegla = {};
  for (let i = 0; i < casos.length; i++) {
    const c = casos[i], k = kern[i], o = porId.get(c.id);
    porRegla[c.regla] = porRegla[c.regla] || { casos: 0, diferencias: 0 };
    porRegla[c.regla].casos++;
    const campos = Object.keys(k).filter(x => x !== 'id');
    const malos = k.error || !o || o.error ? ['error'] : campos.filter(f => (o[f] ?? null) !== (k[f] ?? null));
    if (malos.length) {
      porRegla[c.regla].diferencias++;
      difs.push({ id: c.id, regla: c.regla, entrada: c.entrada, kernel: k, oraculo: o, campos: malos });
    }
  }
  return { porRegla, difs };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const n = Number(process.argv[2] || 3000), semilla = Number(process.argv[3] || 20261019);
  const casos = generarCasos(n, semilla);
  const { porRegla, difs } = comparar(casos, correrKernel(casos), correrOraculo(casos));
  console.log('Prueba diferencial kernel ↔ oráculo · ' + n + ' casos · semilla ' + semilla);
  for (const [r, v] of Object.entries(porRegla)) console.log('  ' + r.padEnd(18) + String(v.casos).padStart(6) + ' casos   ' + (v.diferencias ? v.diferencias + ' DIFERENCIAS' : 'al centavo'));
  for (const d of difs.slice(0, 15)) console.log(JSON.stringify(d));
  process.exit(difs.length ? 1 : 0);
}
