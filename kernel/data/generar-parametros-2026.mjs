// generar-parametros-2026.mjs — Genera data/parametros-2026.json (semilla del catálogo).
//
// ESTA ES UNA SEMILLA DE ARRANQUE, NO EL CATÁLOGO RECTOR. El catálogo rector es el
// «Catálogo de parámetros de nómina 2026 (corte 12-oct-2026)» revisado por Rafael
// González (13-oct): 162 renglones. Esta semilla carga sólo:
//   · Tarifas ISR 2026 transcritas del Anexo 8 RMF 2026 (SAT, DOF 28-dic-2025) → nivel A.
//   · Cifras que la «Revisión del maestro v0.3» (13/14-oct) cita del catálogo → el
//     nivel que la revisión les da; si no lo dice por renglón, B.
//   · Derivados por fórmula → nivel D.
// Lo que la revisión deja abierto entra en nivel C y produce limitación al alcance.
// Al llegar el archivo del catálogo, se reemplaza esta semilla renglón por renglón.
//
// Uso: node kernel/data/generar-parametros-2026.mjs

import { writeFileSync } from 'node:fs';

const ANEXO8 = 'SAT · Anexo 8 RMF 2026, DOF 28-dic-2025 (sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rmf/anexos/Anexo-8-RMF-2026_DOF-28122025.pdf)';
const CAT = 'Catálogo de parámetros de nómina 2026 (corte 12-oct-2026, rev. R. González 13-oct) citado en Revisión del maestro v0.3';
const REGLAS = 'Reglas v1 · Revisión del maestro v0.3 (14-oct-2026)';
const filas = [];
const add = f => filas.push(f);

// ── Tarifas ISR 2026 (art. 96 LISR; Anexo 8 RMF 2026). [li, ls|null, cuota fija, % excedente]
const TARIFAS = {
  DIARIA: [['0.01','27.78','0.00','1.92'],['27.79','235.81','0.53','6.40'],['235.82','414.41','13.85','10.88'],['414.42','481.73','33.28','16.00'],['481.74','576.76','44.05','17.92'],['576.77','1163.25','61.08','21.36'],['1163.26','1833.44','186.35','23.52'],['1833.45','3500.35','343.98','30.00'],['3500.36','4667.13','844.05','32.00'],['4667.14','14001.38','1217.42','34.00'],['14001.39',null,'4391.07','35.00']],
  SEMANAL: [['0.01','194.46','0.00','1.92'],['194.47','1650.67','3.71','6.40'],['1650.68','2900.87','96.95','10.88'],['2900.88','3372.11','232.96','16.00'],['3372.12','4037.32','308.35','17.92'],['4037.33','8142.75','427.56','21.36'],['8142.76','12834.08','1304.45','23.52'],['12834.09','24502.45','2407.86','30.00'],['24502.46','32669.91','5908.35','32.00'],['32669.92','98009.66','8521.94','34.00'],['98009.67',null,'30737.49','35.00']],
  DECENAL: [['0.01','277.80','0.00','1.92'],['277.81','2358.10','5.30','6.40'],['2358.11','4144.10','138.50','10.88'],['4144.11','4817.30','332.80','16.00'],['4817.31','5767.60','440.50','17.92'],['5767.61','11632.50','610.80','21.36'],['11632.51','18334.40','1863.50','23.52'],['18334.41','35003.50','3439.80','30.00'],['35003.51','46671.30','8440.50','32.00'],['46671.31','140013.80','12174.20','34.00'],['140013.81',null,'43910.70','35.00']],
  QUINCENAL: [['0.01','416.70','0.00','1.92'],['416.71','3537.15','7.95','6.40'],['3537.16','6216.15','207.75','10.88'],['6216.16','7225.95','499.20','16.00'],['7225.96','8651.40','660.75','17.92'],['8651.41','17448.75','916.20','21.36'],['17448.76','27501.60','2795.25','23.52'],['27501.61','52505.25','5159.70','30.00'],['52505.26','70006.95','12660.75','32.00'],['70006.96','210020.70','18261.30','34.00'],['210020.71',null,'65866.05','35.00']],
  MENSUAL: [['0.01','844.59','0.00','1.92'],['844.60','7168.51','16.22','6.40'],['7168.52','12598.02','420.95','10.88'],['12598.03','14644.64','1011.68','16.00'],['14644.65','17533.64','1339.14','17.92'],['17533.65','35362.83','1856.84','21.36'],['35362.84','55736.68','5665.16','23.52'],['55736.69','106410.50','10457.09','30.00'],['106410.51','141880.66','25659.23','32.00'],['141880.67','425641.99','37009.69','34.00'],['425642.00',null,'133488.54','35.00']],
  ANUAL: [['0.01','10135.11','0.00','1.92'],['10135.12','86022.11','194.59','6.40'],['86022.12','151176.19','5051.37','10.88'],['151176.20','175735.66','12140.13','16.00'],['175735.67','210403.69','16069.64','17.92'],['210403.70','424353.97','22282.14','21.36'],['424353.98','668840.14','67981.92','23.52'],['668840.15','1276925.98','125485.07','30.00'],['1276925.99','1702567.97','307910.81','32.00'],['1702567.98','5107703.92','444116.23','34.00'],['5107703.93',null,'1601862.46','35.00']],
};
for (const [per, tabla] of Object.entries(TARIFAS)) {
  add({ id: 'ISR_TARIFA_' + per + '@2026', clave: 'ISR_TARIFA_' + per, tipo: 'tarifa', valor: tabla,
    vigencia_desde: '2026-01-01', vigencia_hasta: '2026-12-31', base_temporal: 'fecha_pago',
    fundamento: per === 'ANUAL' ? 'LISR art. 152 y 97' : 'LISR art. 96', fuente: ANEXO8, nivel: 'A',
    notas: 'Transcrita del Anexo 8 publicado. Cotejar contra el renglón del catálogo de R. González.' });
}
// Catorcenal: el Anexo 8 no la publica; criterio C1 (tarifa por día × 14). No se carga tabla.

// ── Generales
add({ id: 'UMA_DIARIA@2025', clave: 'UMA_DIARIA', tipo: 'escalar', valor: '113.14', vigencia_desde: '2025-02-01', vigencia_hasta: '2026-01-31',
  base_temporal: 'dia_cotizado', fundamento: 'Ley para Determinar el Valor de la UMA, arts. 4 y 5', fuente: CAT, nivel: 'B',
  notas: 'Rige enero 2026. En ISR y exenciones se consulta a la fecha de pago; en IMSS/RCV/INFONAVIT por día cotizado.' });
add({ id: 'UMA_DIARIA@2026', clave: 'UMA_DIARIA', tipo: 'escalar', valor: '117.31', vigencia_desde: '2026-02-01', vigencia_hasta: '2027-01-31',
  base_temporal: 'dia_cotizado', fundamento: 'Ley para Determinar el Valor de la UMA, arts. 4 y 5', fuente: CAT, nivel: 'B',
  notas: 'Corte de vigencia 1-feb. En ISR y exenciones se consulta a la fecha de pago.' });
add({ id: 'UMA_MES_DIVISOR@2026', clave: 'UMA_MES_DIVISOR', tipo: 'escalar', valor: '30.4', vigencia_desde: '2025-01-01', vigencia_hasta: null,
  base_temporal: 'fecha_pago', fundamento: 'Ley UMA art. 4 (UMA mensual = diaria × 30.4)', fuente: CAT, nivel: 'B' });
add({ id: 'SM_GENERAL@2026', clave: 'SALARIO_MINIMO_GENERAL', tipo: 'escalar', valor: '315.04', vigencia_desde: '2026-01-01', vigencia_hasta: '2026-12-31',
  base_temporal: 'dia_cotizado', fundamento: 'Resolución CONASAMI 2026', fuente: CAT, nivel: 'B' });
add({ id: 'SM_FRONTERA@2026', clave: 'SALARIO_MINIMO_FRONTERA', tipo: 'escalar', valor: '440.87', vigencia_desde: '2026-01-01', vigencia_hasta: '2026-12-31',
  base_temporal: 'dia_cotizado', fundamento: 'Resolución CONASAMI 2026', fuente: CAT, nivel: 'B' });

// ── Subsidio para el empleo (V2). Decreto DOF 31-dic-2025.
add({ id: 'SUBSIDIO_PCT@2026-01', clave: 'SUBSIDIO_PORCENTAJE_UMA', tipo: 'escalar', valor: '15.59', vigencia_desde: '2026-01-01', vigencia_hasta: '2026-01-31',
  base_temporal: 'fecha_pago', fundamento: 'Decreto subsidio para el empleo, DOF 31-dic-2025', fuente: CAT, nivel: 'B', notas: 'Sobre la UMA mensual 2025 (enero).' });
add({ id: 'SUBSIDIO_PCT@2026-02', clave: 'SUBSIDIO_PORCENTAJE_UMA', tipo: 'escalar', valor: '15.02', vigencia_desde: '2026-02-01', vigencia_hasta: '2026-12-31',
  base_temporal: 'fecha_pago', fundamento: 'Decreto subsidio para el empleo, DOF 31-dic-2025', fuente: CAT, nivel: 'B' });
add({ id: 'SUBSIDIO_MONTO@2026-01', clave: 'SUBSIDIO_MONTO_MENSUAL', tipo: 'escalar', valor: '536.21', vigencia_desde: '2026-01-01', vigencia_hasta: '2026-01-31',
  base_temporal: 'fecha_pago', fundamento: '15.59% × UMA 2025 × 30.4', fuente: CAT, nivel: 'D', deriva_de: ['SUBSIDIO_PCT@2026-01', 'UMA_DIARIA@2025', 'UMA_MES_DIVISOR@2026'] });
add({ id: 'SUBSIDIO_MONTO@2026-02', clave: 'SUBSIDIO_MONTO_MENSUAL', tipo: 'escalar', valor: '535.65', vigencia_desde: '2026-02-01', vigencia_hasta: '2026-12-31',
  base_temporal: 'fecha_pago', fundamento: '15.02% × UMA 2026 × 30.4', fuente: CAT, nivel: 'D', deriva_de: ['SUBSIDIO_PCT@2026-02', 'UMA_DIARIA@2026', 'UMA_MES_DIVISOR@2026'] });
add({ id: 'SUBSIDIO_TOPE@2026', clave: 'SUBSIDIO_TOPE_MENSUAL', tipo: 'escalar', valor: '11492.66', vigencia_desde: '2026-01-01', vigencia_hasta: '2026-12-31',
  base_temporal: 'fecha_pago', fundamento: 'Decreto subsidio para el empleo, DOF 31-dic-2025', fuente: CAT, nivel: 'B',
  notas: 'No cuentan para el tope: prima de antigüedad, retiro, indemnizaciones y demás pagos por separación.' });
add({ id: 'SUBSIDIO_DIVISOR@2026', clave: 'SUBSIDIO_DIVISOR_DIAS', tipo: 'escalar', valor: '30.4', vigencia_desde: '2026-01-01', vigencia_hasta: '2026-12-31',
  base_temporal: 'fecha_pago', fundamento: 'Decreto DOF 31-dic-2025; criterio C2', fuente: REGLAS, nivel: 'B',
  notas: 'Corrección 1 de la revisión: 30.4, no 30. Pendiente de confirmar con Rafael (C2).' });

// ── IMSS (LSS arts. 25, 71-74, 106, 107, 147, 211). Tasas como fracción en %.
add({ id: 'IMSS_CUOTAS@2026', clave: 'IMSS_CUOTAS', tipo: 'objeto', vigencia_desde: '2026-01-01', vigencia_hasta: '2026-12-31',
  base_temporal: 'dia_cotizado', fundamento: 'LSS arts. 25, 106, 107, 147 y 211', fuente: CAT, nivel: 'B',
  valor: {
    cuota_fija_pat: '20.40', excedente_pat: '1.10', excedente_obr: '0.40',
    dinero_pat: '0.70', dinero_obr: '0.25', gmp_pat: '1.05', gmp_obr: '0.375',
    iv_pat: '1.75', iv_obr: '0.625', guarderias_pat: '1.00'
  } });
add({ id: 'TOPE_SBC_UMA@2026', clave: 'TOPE_SBC_VECES_UMA', tipo: 'escalar', valor: '25', vigencia_desde: '2026-01-01', vigencia_hasta: null,
  base_temporal: 'dia_cotizado', fundamento: 'LSS art. 28', fuente: CAT, nivel: 'A' });
add({ id: 'UMBRAL_EXC_UMA@2026', clave: 'UMBRAL_EXCEDENTE_VECES_UMA', tipo: 'escalar', valor: '3', vigencia_desde: '2026-01-01', vigencia_hasta: null,
  base_temporal: 'dia_cotizado', fundamento: 'LSS art. 106 fr. II', fuente: CAT, nivel: 'A' });
add({ id: 'PRIMA_RT_RANGO@2026', clave: 'PRIMA_RT_RANGO', tipo: 'objeto', valor: { minima: '0.50', maxima: '15.00', variacion_max: '1.00' },
  vigencia_desde: '2026-01-01', vigencia_hasta: null, base_temporal: 'dato_entrada', fundamento: 'LSS art. 74', fuente: CAT, nivel: 'A',
  notas: 'Sólo validación de captura. La prima es dato de entrada por registro patronal, vigente 1-mar → último de febrero.' });

// ── RCV (LSS art. 168; Segundo Transitorio DOF 16-dic-2020)
add({ id: 'RCV_CUOTAS@2026', clave: 'RCV_CUOTAS', tipo: 'objeto', valor: { retiro_pat: '2.00', ceav_obr: '1.125' },
  vigencia_desde: '2026-01-01', vigencia_hasta: '2026-12-31', base_temporal: 'dia_cotizado', fundamento: 'LSS art. 168', fuente: CAT, nivel: 'B' });
add({ id: 'CEAV_PATRONAL@2026', clave: 'CEAV_PATRONAL_TABLA', tipo: 'tabla_rangos', vigencia_desde: '2026-01-01', vigencia_hasta: '2026-12-31',
  base_temporal: 'dia_cotizado', fundamento: 'LSS art. 168 fr. II; Segundo Transitorio DOF 16-dic-2020', fuente: CAT, nivel: 'B',
  notas: 'Rango por SBC ÷ UMA truncado a dos decimales (criterio C4). Tasas exactas (corrección 6).',
  valor: [['1.00','3.150'],['1.50','3.676'],['2.00','4.851'],['2.50','5.556'],['3.00','6.026'],['3.50','6.361'],['4.00','6.613'],[null,'7.513']] });
add({ id: 'INFONAVIT_APORT@2026', clave: 'INFONAVIT_APORTACION', tipo: 'escalar', valor: '5', vigencia_desde: '2026-01-01', vigencia_hasta: null,
  base_temporal: 'dia_cotizado', fundamento: 'Ley del INFONAVIT art. 29 fr. II', fuente: CAT, nivel: 'B' });

// ── Exenciones ISR (CALC-EXE-001; LISR art. 93). V7 pendiente de cargar con fuente primaria.
const EXE = (concepto, valor, fundamento, nivel = 'B', notas) => add({ id: 'EXENCION:' + concepto + '@2026', clave: 'EXENCION:' + concepto,
  tipo: 'objeto', valor, vigencia_desde: '2026-01-01', vigencia_hasta: '2026-12-31', base_temporal: 'fecha_pago', fundamento, fuente: REGLAS, nivel, notas });
EXE('aguinaldo', { tipo: 'tope_uma', veces: '30', acumula: 'anio' }, 'LISR art. 93 fr. XIV');
EXE('gratificacion', { tipo: 'tope_uma', veces: '30', acumula: 'anio', grupo: 'aguinaldo' }, 'LISR art. 93 fr. XIV (gratificación general, comparte tope con aguinaldo)');
EXE('prima_vacacional', { tipo: 'tope_uma', veces: '15', acumula: 'anio' }, 'LISR art. 93 fr. XIV');
EXE('ptu', { tipo: 'tope_uma', veces: '15', acumula: 'anio' }, 'LISR art. 93 fr. XIV', 'B', 'La PTU de mayo pudo consumir el tope: el acumulado es entrada.');
EXE('prima_dominical', { tipo: 'uma_por_domingo', veces: '1' }, 'LISR art. 93 fr. XIV');
for (const c of ['tiempo_extra', 'dia_festivo', 'dia_descanso']) EXE(c, { tipo: 'pct_hasta_uma', porcentaje: '50', veces: '5', acumula: 'semana', grupo: 'tiempo_extra' }, 'LISR art. 93 fr. I');
for (const c of ['liquidacion', 'indemnizacion', 'prima_antiguedad']) EXE(c, { tipo: 'separacion', veces: '90', grupo: 'separacion' }, 'LISR art. 93 fr. XIII', 'B', 'Un solo tope para las tres, por año de servicio (hallazgo 6).');
EXE('fondo_ahorro_empresa', { tipo: 'requisitos', requisitos: 'LISR art. 93 fr. XI y art. 27 LSS' }, 'LISR art. 93 fr. XI', 'B', 'Exento sólo si el perfil del cliente acredita requisitos. PRIME: no los cumple (P2, hallazgo 5).');
EXE('subsidio_incapacidad', { tipo: 'pendiente', decision: 'fr. VIII: previsión social general; pendiente de decisión' }, 'LISR art. 93 fr. VIII', 'C', 'Decisión pendiente con Rafael.');

// ── ISN: tasas por entidad (32 entidades en el catálogo; aquí sólo las que cita la revisión).
const ISN = (ent, valor, desde, hasta, nivel, notas) => add({ id: 'ISN_TASA:' + ent + '@' + desde.slice(0, 4), clave: 'ISN_TASA', entidad: ent, tipo: 'escalar', valor,
  vigencia_desde: desde, vigencia_hasta: hasta, base_temporal: 'mes_causacion', fundamento: 'Ley de hacienda / código fiscal de la entidad', fuente: CAT, nivel, notas });
const subieron = { BCS: ['2.5', '3'], CHIS: ['2', '3'], CHIH: ['3', '4'], COL: ['2', '3'], MOR: ['2.5', '3'], YUC: ['3', '3.75'] };
for (const [e, [t25, t26]] of Object.entries(subieron)) {
  ISN(e, t25, '2025-01-01', '2025-12-31', 'B');
  ISN(e, t26, '2026-01-01', '2026-12-31', 'B', e === 'YUC' ? '3% efectivo para micro y pequeñas con estímulo.' : undefined);
}
ISN('CDMX', '4', '2026-01-01', '2026-12-31', 'B');
ISN('SON', '3', '2026-01-01', '2026-12-31', 'B');
ISN('VER', '3', '2026-01-01', '2026-12-31', 'B');
ISN('JAL', '3', '2026-01-01', '2026-12-31', 'B');
ISN('TLAX', '3', '2026-01-01', '2026-12-31', 'B');
ISN('TAB', '3.5', '2026-01-01', '2026-12-31', 'C', 'Por confirmar en qué supuesto aplica 3% y en cuál 3.5%.');
ISN('SIN', '3', '2026-01-01', '2026-12-31', 'C', 'Tarifa progresiva 2.4%–3% por tramos; el 3% plano es lo que aplica la nómina.');
const ADI = (ent, valor, notas) => add({ id: 'ISN_ADICIONAL:' + ent + '@2026', clave: 'ISN_ADICIONAL', entidad: ent, tipo: 'objeto', valor,
  vigencia_desde: '2026-01-01', vigencia_hasta: '2026-12-31', base_temporal: 'mes_causacion', fundamento: 'Ley de la entidad (por confirmar)', fuente: CAT, nivel: 'C', notas });
ADI('CHIH', { descripcion: 'Impuesto Universitario 6% del impuesto; contribuciones extraordinarias 10% y 5%' }, 'Exposición +$15,218 a +$43,751/mes en PRIME.');
ADI('SON', { descripcion: '1% adicional para patrones con 100 o más trabajadores' }, 'Exposición +$31,527/mes en PRIME.');
ADI('VER', { descripcion: '15% adicional sobre el impuesto' }, 'Exposición +$13,742/mes en PRIME.');
ADI('JAL', { descripcion: '5% especial: ¿asimilados o consejeros?' }, 'Sólo aplica si hay esos pagos.');
ADI('TLAX', { descripcion: 'Condonación 2026: ¿a quién aplica?' }, 'Por confirmar.');

// ── ISN: trato por concepto × entidad (cuadro de R. González). Sin fundamento por celda (V8) → nivel C.
const ISNC = (ent, concepto, trato) => add({ id: 'ISN_CONCEPTO:' + concepto + ':' + ent + '@2026', clave: 'ISN_CONCEPTO:' + concepto, entidad: ent, tipo: 'objeto',
  valor: { trato }, vigencia_desde: '2026-01-01', vigencia_hasta: '2026-12-31', base_temporal: 'mes_causacion',
  fundamento: 'Pendiente por celda (V8)', fuente: 'Cuadro de conceptos de ISN por estado (R. González)', nivel: 'C' });
for (const c of ['liquidacion', 'indemnizacion', 'prima_antiguedad', 'fondo_ahorro_empresa']) ISNC('CDMX', c, 'exento');

filas.sort((a, b) => a.id.localeCompare(b.id));
const out = new URL('./parametros-2026.json', import.meta.url);
writeFileSync(out, JSON.stringify({ descripcion: 'Semilla del catálogo de parámetros 2026 — ver generar-parametros-2026.mjs', generado: '2026-10-15', filas }, null, 1) + '\n');
// Misma semilla como módulo ES, para que el Worker la importe sin depender de import attributes.
writeFileSync(new URL('./parametros-2026.js', import.meta.url), '// Generado por generar-parametros-2026.mjs — no editar a mano.\nexport default ' + JSON.stringify({ filas }) + ';\n');
console.log('parametros-2026.json/.js:', filas.length, 'renglones');
