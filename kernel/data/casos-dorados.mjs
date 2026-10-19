// casos-dorados.mjs — Casos dorados para que quien sabe nómina (Rafael González)
// escriba la cifra esperada A MANO, sin ver lo que da el kernel (T1).
//
// Este archivo define SOLO las entradas. La plantilla .xlsx se genera de aquí
// (scripts/plantilla-casos-dorados.py); las cifras que capture Rafael regresan a
// data/casos-dorados-esperados.json (scripts/importar-casos-dorados.py) y la prueba
// test/casos-dorados.test.js compara kernel vs Rafael renglón por renglón.
// Ningún renglón trae datos personales: trabajadores ficticios.
//
// `salida`: qué importe se le pide a Rafael. Para reglas con varias salidas hay un
// renglón por salida, con el mismo caso.

const p = (pesos) => Math.round(pesos * 100);
const SEM = { desde: '2026-08-03', hasta: '2026-08-09' };       // semana sin cambio de UMA
const CRUCE_UMA = { desde: '2026-01-29', hasta: '2026-02-04' };  // 3 días UMA 2025 + 4 días UMA 2026
const AGO = { desde: '2026-08-01', hasta: '2026-08-31' };
const PRIMA = { pct: '0.54355' };

/** Salidas posibles y cómo se leen del resultado del kernel. */
export const SALIDAS = {
  isr_retenido: { etiqueta: 'ISR a retener (después de subsidio)', leer: (r) => r.valor_c },
  isr_antes_subsidio: { etiqueta: 'ISR según tarifa (antes de subsidio)', leer: (r) => r.extra.isr_antes_subsidio_c },
  subsidio: { etiqueta: 'Subsidio para el empleo del periodo', leer: (r) => r.valor_c },
  isr_ultima_nomina: { etiqueta: 'ISR a retener en la última nómina del mes (ajuste)', leer: (r) => r.valor_c },
  base_gravable: { etiqueta: 'Base gravable de ISR (después de exenciones)', leer: (r) => r.valor_c },
  exento_total: { etiqueta: 'Total exento de ISR', leer: (r) => r.traza.exento_total_c },
  imss_obrera: { etiqueta: 'Cuotas IMSS obreras (sin RCV)', leer: (r) => r.extra.obrera_c },
  imss_patronal: { etiqueta: 'Cuotas IMSS patronales (sin RCV ni INFONAVIT)', leer: (r) => r.extra.patronal_c },
  retiro: { etiqueta: 'Retiro patronal 2%', leer: (r) => r.extra.retiro_c },
  ceav_patronal: { etiqueta: 'Cesantía y vejez patronal', leer: (r) => r.extra.ceav_pat_c },
  ceav_obrera: { etiqueta: 'Cesantía y vejez obrera', leer: (r) => r.extra.ceav_obr_c },
  infonavit: { etiqueta: 'Aportación patronal INFONAVIT 5%', leer: (r) => r.valor_c },
  isn: { etiqueta: 'Impuesto sobre nóminas del mes', leer: (r) => r.valor_c },
  isr_pago_anual: { etiqueta: 'ISR del pago (PTU / aguinaldo, RLISR art. 174)', leer: (r) => r.valor_c },
  isr_separacion: { etiqueta: 'ISR de la separación (LISR art. 95)', leer: (r) => r.valor_c },
};

const casos = [];
const caso = (id, regla, titulo, entrada, legible, salidas) => {
  salidas.forEach((s, i) => casos.push({ id: salidas.length > 1 ? id + 'abc'[i] : id, caso: id, regla, salida: s, titulo, legible, entrada }));
};

// ── ISR y subsidio por periodo ──
caso('D01', 'CALC-ISR-SEM-001', 'Salario mínimo general, semana completa', { base_gravable_c: p(315.04 * 7), fecha_pago: '2026-08-07' },
  'Semanal · base gravable $2,205.28 (7 días × SM $315.04) · pago 7-ago-2026', ['isr_antes_subsidio', 'isr_retenido']);
caso('D02', 'CALC-SUB-001', 'Subsidio: base exactamente en el tope semanal', { base_para_tope_c: p(2646.33), periodicidad: 'semanal', fecha_pago: '2026-08-07' },
  'Semanal · base para el tope $2,646.33 · pago 7-ago-2026 (tope mensual $11,492.66)', ['subsidio']);
caso('D03', 'CALC-SUB-001', 'Subsidio: un centavo arriba del tope semanal', { base_para_tope_c: p(2646.34), periodicidad: 'semanal', fecha_pago: '2026-08-07' },
  'Semanal · base para el tope $2,646.34 · pago 7-ago-2026', ['subsidio']);
caso('D04', 'CALC-ISR-SEM-001', 'Frontera de renglón: límite superior del renglón 5 semanal', { base_gravable_c: p(4037.32), fecha_pago: '2026-08-07' },
  'Semanal · base $4,037.32 · pago 7-ago-2026', ['isr_retenido']);
caso('D05', 'CALC-ISR-SEM-001', 'Frontera de renglón: límite inferior del renglón 6 semanal', { base_gravable_c: p(4037.33), fecha_pago: '2026-08-07' },
  'Semanal · base $4,037.33 · pago 7-ago-2026', ['isr_retenido']);
caso('D06', 'CALC-ISR-SEM-001', 'Último renglón de la tarifa (35%)', { base_gravable_c: p(120000), fecha_pago: '2026-08-07' },
  'Semanal · base $120,000.00 · pago 7-ago-2026', ['isr_retenido']);
caso('D07', 'CALC-ISR-SEM-001', 'Quincenal ordinario con subsidio', { base_gravable_c: p(4950.00), periodicidad: 'quincenal', fecha_pago: '2026-08-14' },
  'Quincenal · base $4,950.00 · pago 14-ago-2026', ['isr_antes_subsidio', 'isr_retenido']);
caso('D08', 'CALC-ISR-SEM-001', 'Mensual ordinario', { base_gravable_c: p(23500.00), periodicidad: 'mensual', fecha_pago: '2026-08-31' },
  'Mensual · base $23,500.00 · pago 31-ago-2026', ['isr_retenido']);
caso('D09', 'CALC-ISR-SEM-001', 'Decenal ordinario', { base_gravable_c: p(6200.00), periodicidad: 'decenal', fecha_pago: '2026-08-10' },
  'Decenal · base $6,200.00 · pago 10-ago-2026', ['isr_retenido']);
caso('D10', 'CALC-ISR-CAT-001', 'Catorcenal medio (método C1 a confirmar)', { base_gravable_c: p(14406.00), fecha_pago: '2026-08-14' },
  'Catorcenal · base $14,406.00 · pago 14-ago-2026 · ANOTE el método que usa (diaria × 14 o proyección mensual)', ['isr_retenido']);
caso('D11', 'CALC-ISR-CAT-001', 'Catorcenal de salario mínimo con subsidio', { base_gravable_c: p(315.04 * 14), fecha_pago: '2026-08-14' },
  'Catorcenal · base $4,410.56 (14 × SM) · pago 14-ago-2026', ['isr_antes_subsidio', 'isr_retenido']);
caso('D12', 'CALC-SUB-001', 'Subsidio en la quinta semana del mes (tope mensual acumulado)', { base_para_tope_c: p(2205.28), periodicidad: 'semanal', fecha_pago: '2026-08-28', subsidio_previo_mes_c: p(493.36) },
  'Semanal · 5ª semana de agosto · base para el tope $2,205.28 · ya se entregaron $493.36 de subsidio en las 4 semanas previas del mes', ['subsidio']);
caso('D13', 'CALC-SUB-001', 'Subsidio en enero (monto anterior al cambio de UMA)', { base_para_tope_c: p(2205.28), periodicidad: 'semanal', fecha_pago: '2026-01-23' },
  'Semanal · base para el tope $2,205.28 · pago 23-ene-2026', ['subsidio']);
caso('D14', 'CALC-ISR-AJM-001', 'Ajuste mensual de catorcenal (dos catorcenas en el mes)', { bases_mes_c: [p(14406.00), p(14406.00)], isr_retenido_previo_mes_c: p(2207.47), fecha_pago: '2026-08-28', aplica_ajuste_mensual: true },
  'Mensual (ajuste) · bases del mes $14,406.00 + $14,406.00 · ISR ya retenido en la 1ª catorcena $2,207.47 · pago de la 2ª 28-ago-2026', ['isr_ultima_nomina']);
caso('D15', 'CALC-ISR-AJM-001', 'Ajuste mensual con retención en exceso (resultado negativo)', { bases_mes_c: [p(3000), p(3000), p(3000), p(1500)], isr_retenido_previo_mes_c: p(900.00), fecha_pago: '2026-08-28', aplica_ajuste_mensual: true },
  'Mensual (ajuste) · 4 semanales con bases $3,000, $3,000, $3,000 y $1,500 · ya retenidos $900.00 · ¿cuánto resulta y cómo se trata el negativo?', ['isr_ultima_nomina']);
caso('D16', 'CALC-ISR-EXT-001', 'Bono pagado en corrida aparte (criterio C5)', { pago_gravable_c: p(10000.00), periodicidad: 'semanal', fecha_pago: '2026-08-07' },
  'Bono semanal en corrida aparte · gravable $10,000.00 · pago 7-ago-2026 · tarifa semanal sobre el bono solo', ['isr_retenido']);

// ── Exenciones (LISR art. 93) ──
const F = '2026-08-07';
caso('D17', 'CALC-EXE-001', 'Aguinaldo de 15 días sin exención consumida', { fecha_pago: '2026-12-11', consumido: { aguinaldo: 0 }, percepciones: [{ concepto: 'aguinaldo', monto_c: p(6000) }] },
  'Aguinaldo $6,000.00 · pago 11-dic-2026 · sin exención de aguinaldo/gratificación usada en el año', ['exento_total', 'base_gravable']);
caso('D18', 'CALC-EXE-001', 'Aguinaldo con exención parcialmente consumida', { fecha_pago: '2026-12-11', consumido: { aguinaldo: p(1200) }, percepciones: [{ concepto: 'aguinaldo', monto_c: p(6000) }] },
  'Aguinaldo $6,000.00 · pago 11-dic-2026 · ya se exentaron $1,200.00 en el año (gratificación de marzo)', ['exento_total']);
caso('D19', 'CALC-EXE-001', 'Prima vacacional', { fecha_pago: F, consumido: { prima_vacacional: 0 }, percepciones: [{ concepto: 'prima_vacacional', monto_c: p(2400) }] },
  'Prima vacacional $2,400.00 · pago 7-ago-2026 · nada exento antes en el año', ['exento_total']);
caso('D20', 'CALC-EXE-001', 'PTU', { fecha_pago: '2026-05-29', consumido: { ptu: 0 }, percepciones: [{ concepto: 'ptu', monto_c: p(20000) }] },
  'PTU $20,000.00 · pago 29-may-2026', ['exento_total']);
caso('D21', 'CALC-EXE-001', 'Tiempo extra semanal arriba de 5 UMA', { fecha_pago: F, consumido: { tiempo_extra: 0 }, semanas_periodo: 1, percepciones: [{ concepto: 'tiempo_extra', monto_c: p(1500) }] },
  'Tiempo extra doble $1,500.00 en una semana (dentro de los límites de 3 h diarias y 3 veces por semana) · pago 7-ago-2026', ['exento_total']);
caso('D22', 'CALC-EXE-001', 'Tiempo extra en catorcena', { fecha_pago: '2026-08-14', consumido: { tiempo_extra: 0 }, semanas_periodo: 2, percepciones: [{ concepto: 'tiempo_extra', monto_c: p(2600) }] },
  'Tiempo extra doble $2,600.00 en una catorcena (2 semanas) · pago 14-ago-2026', ['exento_total']);
caso('D23', 'CALC-EXE-001', 'Prima dominical de dos domingos', { fecha_pago: F, percepciones: [{ concepto: 'prima_dominical', monto_c: p(300), domingos: 2 }] },
  'Prima dominical $300.00 por 2 domingos trabajados · pago 7-ago-2026', ['exento_total']);
caso('D24', 'CALC-EXE-001', 'Indemnización y prima de antigüedad (tope único)', { fecha_pago: '2026-08-07', separacion: { fecha_ingreso: '2020-03-02', fecha_baja: '2026-08-05' },
  percepciones: [{ concepto: 'indemnizacion', monto_c: p(45000) }, { concepto: 'prima_antiguedad', monto_c: p(15000) }] },
  'Ingreso 2-mar-2020, baja 5-ago-2026 · indemnización $45,000.00 + prima de antigüedad $15,000.00 · pago 7-ago-2026', ['exento_total', 'base_gravable']);
caso('D25', 'CALC-EXE-001', 'Separación con fracción de exactamente 6 meses', { fecha_pago: '2026-08-07', separacion: { fecha_ingreso: '2023-02-01', fecha_baja: '2026-08-01' },
  percepciones: [{ concepto: 'indemnizacion', monto_c: p(80000) }] },
  'Ingreso 1-feb-2023, baja 1-ago-2026 (3 años 6 meses exactos) · indemnización $80,000.00', ['exento_total']);
caso('D26', 'CALC-EXE-001', 'Fondo de ahorro que cumple requisitos', { fecha_pago: F, perfil: { fondo_ahorro_cumple_requisitos: true }, percepciones: [{ concepto: 'fondo_ahorro_empresa', monto_c: p(494.27) }] },
  'Aportación patronal al fondo de ahorro $494.27 · el plan cumple fr. XI art. 93 y art. 27 LSS', ['exento_total']);
caso('D27', 'CALC-EXE-001', 'Semana mixta: sueldo, día festivo y prima dominical', { fecha_pago: F, consumido: { tiempo_extra: 0 }, semanas_periodo: 1,
  percepciones: [{ concepto: 'sueldo', monto_c: p(2800) }, { concepto: 'dia_festivo', monto_c: p(800) }, { concepto: 'prima_dominical', monto_c: p(100), domingos: 1 }] },
  'Sueldo $2,800.00 + día festivo laborado $800.00 + prima dominical $100.00 (1 domingo) · pago 7-ago-2026', ['base_gravable']);

// ── IMSS, RCV, INFONAVIT ──
caso('D28', 'CALC-IMSS-001', 'SBC de salario mínimo, semana completa', { sbc_c: p(330.57), periodo: SEM, incapacidades: 0, prima_rt: PRIMA },
  'SBC $330.57 · 3 a 9-ago-2026 (7 días) · sin incapacidades · prima RT 0.54355%', ['imss_obrera', 'imss_patronal']);
caso('D29', 'CALC-IMSS-001', 'SBC exactamente en 3 UMA (sin excedente)', { sbc_c: p(351.93), periodo: SEM, incapacidades: 0, prima_rt: PRIMA },
  'SBC $351.93 (3 × UMA 117.31) · 3 a 9-ago-2026 · prima RT 0.54355%', ['imss_obrera', 'imss_patronal']);
caso('D30', 'CALC-IMSS-001', 'SBC arriba del tope de 25 UMA', { sbc_c: p(5000.00), periodo: SEM, incapacidades: 0, prima_rt: PRIMA },
  'SBC $5,000.00 (tope 25 UMA = $2,932.75) · 3 a 9-ago-2026 · prima RT 0.54355%', ['imss_obrera', 'imss_patronal']);
caso('D31', 'CALC-IMSS-001', 'Dos días de incapacidad en la semana', { sbc_c: p(615.88), periodo: SEM, incapacidades: ['2026-08-04', '2026-08-05'], prima_rt: PRIMA },
  'SBC $615.88 · 3 a 9-ago-2026 · incapacidad por enfermedad general 4 y 5-ago · prima RT 0.54355%', ['imss_obrera', 'imss_patronal']);
caso('D32', 'CALC-IMSS-001', 'Semana que cruza el cambio de UMA (1-feb)', { sbc_c: p(615.88), periodo: CRUCE_UMA, incapacidades: [], prima_rt: PRIMA },
  'SBC $615.88 · 29-ene a 4-feb-2026 (3 días UMA $113.14 y 4 días UMA $117.31) · prima RT 0.54355%', ['imss_obrera', 'imss_patronal']);
caso('D33', 'CALC-IMSS-001', 'Mes completo, prima de riesgo clase V', { sbc_c: p(842.10), periodo: AGO, incapacidades: 0, prima_rt: { pct: '7.58875' } },
  'SBC $842.10 · agosto 2026 (31 días) · prima RT 7.58875%', ['imss_obrera', 'imss_patronal']);
caso('D41', 'CALC-IMSS-001', 'SBC igual al salario mínimo (criterios C13 y C14)', { sbc_c: p(315.04), periodo: SEM, incapacidades: 0, prima_rt: PRIMA },
  'SBC $315.04 (= SM general) · 3 a 9-ago-2026 · prima RT 0.54355% · ANOTE quién paga la cuota obrera (LSS art. 36)', ['imss_obrera', 'imss_patronal']);
caso('D42', 'CALC-RCV-001', 'CEAV con SBC igual al salario mínimo (criterio C13)', { sbc_c: p(315.04), periodo: AGO, incapacidades: 0 },
  'SBC $315.04 (= SM general) · agosto 2026 · ANOTE qué tasa de CEAV patronal aplica', ['ceav_patronal']);
caso('D34', 'CALC-RCV-001', 'RCV de salario mínimo (rango 2.51–3.00 UMA)', { sbc_c: p(330.57), periodo: AGO, incapacidades: 0 },
  'SBC $330.57 · agosto 2026 (31 días)', ['retiro', 'ceav_patronal', 'ceav_obrera']);
caso('D35', 'CALC-RCV-001', 'RCV en el rango más alto con incapacidades', { sbc_c: p(1500.00), periodo: AGO, incapacidades: ['2026-08-10', '2026-08-11', '2026-08-12'] },
  'SBC $1,500.00 · agosto 2026 · incapacidad 10 a 12-ago', ['retiro', 'ceav_patronal', 'ceav_obrera']);
caso('D36', 'CALC-RCV-001', 'RCV en frontera de rango: SBC = 4.01 UMA', { sbc_c: p(470.41), periodo: AGO, incapacidades: 0 },
  'SBC $470.41 (4.01 UMA) · agosto 2026', ['ceav_patronal']);
caso('D37', 'CALC-INF-001', 'INFONAVIT del mes con incapacidades', { sbc_c: p(615.88), periodo: AGO, incapacidades: ['2026-08-10', '2026-08-11'] },
  'SBC $615.88 · agosto 2026 · incapacidad 10 y 11-ago', ['infonavit']);
caso('D38', 'CALC-INF-001', 'INFONAVIT arriba del tope', { sbc_c: p(4000.00), periodo: AGO },
  'SBC $4,000.00 · agosto 2026', ['infonavit']);

// ── ISN ──
caso('D39', 'CALC-ISN-001', 'ISN de un registro en CDMX con separación', { registro: 'R-PRUEBA', entidad: 'CDMX', mes: '2026-08',
  conceptos: [{ concepto: 'sueldo', monto_c: p(850000) }, { concepto: 'comisiones', monto_c: p(420000) }, { concepto: 'indemnizacion', monto_c: p(60000) }, { concepto: 'prima_antiguedad', monto_c: p(12000) }] },
  'CDMX · agosto 2026 · sueldos $850,000 + comisiones $420,000 + indemnizaciones $60,000 + primas de antigüedad $12,000', ['isn']);
caso('D40', 'CALC-ISN-001', 'ISN en Chihuahua con adicionales', { registro: 'R-PRUEBA', entidad: 'CHIH', mes: '2026-08', conceptos: [{ concepto: 'sueldo', monto_c: p(500000) }] },
  'Chihuahua · agosto 2026 · sueldos $500,000 · ANOTE si incluye impuesto universitario y extraordinarias', ['isn']);

// ── Pagos anuales y por separación (0.9.0; criterios C16 y C17) ──
caso('D43', 'CALC-ISR-174-001', 'PTU de una baja con el método del art. 174 (C17)', { pago_gravable_c: p(8240.35), salario_diario_c: p(400), fecha_pago: '2026-08-12', concepto: 'ptu' },
  'PTU pagada $10,000 (exentos 15 UMA = $1,759.65 → gravado $8,240.35) · salario diario $400 · pago 12-ago-2026 · ANOTE el sueldo mensual que usa (SD × 30.4 o SD × 30)', ['isr_pago_anual']);
caso('D44', 'CALC-ISR-SEP-001', 'Indemnización con el art. 95 (C16)', { separacion_gravable_c: p(50000), salario_diario_c: p(500), fecha_pago: '2026-08-20' },
  'Separación: gravado $50,000 (ya sin los 90 UMA por año) · salario diario $500 · pago 20-ago-2026 · ANOTE si usa SD × 30 como último sueldo mensual', ['isr_separacion']);
caso('D45', 'CALC-EXE-001', 'Años de servicio: 1 año 7 meses cuenta como 2', { fecha_pago: '2026-08-20', percepciones: [{ concepto: 'indemnizacion', monto_c: p(60000) }],
  consumido: { separacion: 0 }, separacion: { fecha_ingreso: '2025-01-23', fecha_baja: '2026-08-20' } },
  'Indemnización $60,000 · ingreso 23-ene-2025, baja 20-ago-2026 · ¿cuántos años exentos (90 UMA × años)?', ['exento_total']);

export const CASOS_DORADOS = casos;
