// no-regresion-reporte.mjs — Nivel 2 (T1) sobre un informe ya publicado en el portal.
//
// Los informes de 2025 se cargaron desde el PDF de supervisión: son cifras
// agregadas (por periodo, por registro y por estado), no renglones por trabajador.
// Con eso no se puede recalcular el ISR ni el IMSS de nadie. Lo que SÍ se puede:
//   1. Pasar el ISN de cada estado por el kernel (CALC-ISN-001) con la base y la
//      tasa del informe, y cotejar la tasa contra el catálogo de parámetros.
//   2. Verificar al centavo la aritmética interna de cada sección y el cuadre
//      entre secciones (lo que el informe dice que suma, ¿suma?).
//   3. Detectar renglones duplicados o con entidad equivocada.
// Los datos reales no se versionan (README): el script recibe el JSON exportado de D1.
//
// Uso: node scripts/no-regresion-reporte.mjs <periodo.json>
import { readFileSync } from 'node:fs';
import { Catalogo, Contexto, reglaPorId } from '../src/index.js';

const c = (pesos) => Math.round(Number(pesos) * 100); // los informes vienen en pesos con 2 decimales
const $ = (cent) => (cent / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ENTIDAD = { 'AGUASCALIENTES': 'AGS', 'BAJA CALIFORNIA': 'BC', 'BAJA CALIFORNIA SUR': 'BCS', 'CAMPECHE': 'CAMP', 'CHIAPAS': 'CHIS', 'CHIHUAHUA': 'CHIH',
  'CDMX': 'CDMX', 'COAHUILA': 'COAH', 'COLIMA': 'COL', 'DURANGO': 'DGO', 'GUANAJUATO': 'GTO', 'GUERRERO': 'GRO', 'HIDALGO': 'HGO', 'JALISCO': 'JAL',
  'EDO MEXICO': 'MEX', 'MICHOACAN': 'MICH', 'MORELOS': 'MOR', 'NAYARIT': 'NAY', 'NUEVO LEON': 'NL', 'OAXACA': 'OAX', 'PUEBLA': 'PUE', 'QUERETARO': 'QRO',
  'QUINTANA ROO': 'QROO', 'SAN LUIS POTOSI': 'SLP', 'SINALOA': 'SIN', 'SONORA': 'SON', 'TABASCO': 'TAB', 'TAMAULIPAS ZONA FRONTERA': 'TAMS',
  'TAMAULIPAS (CD VICTORIA)': 'TAMS', 'TLAXCALA': 'TLAX', 'VERACRUZ': 'VER', 'YUCATAN': 'YUC', 'ZACATECAS': 'ZAC' };

export function revisarInforme(inf, filasParametros) {
  const fecha = inf.periodo.anio + '-' + String(['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'].indexOf(inf.periodo.mes) + 1).padStart(2, '0');
  const hallazgos = [], ok = [];
  const cuadra = (nombre, a, b, tol = 0) => {
    const d = a - b;
    (Math.abs(d) <= tol ? ok : hallazgos).push({ prueba: nombre, esperado: $(b), informe: $(a), diferencia: $(d) });
  };

  // ── 1. ISN por estado a través del kernel ──
  const base = new Catalogo(filasParametros);
  const tasas = [], extra = [];
  for (const r of inf.sec10 || []) {
    const ent = ENTIDAD[r.e];
    if (!ent) { hallazgos.push({ prueba: 'ISN · entidad sin clave', detalle: r.e }); continue; }
    const enCat = base.buscar('ISN_TASA', fecha + '-01', ent);
    tasas.push({ estado: r.e, informe: String(r.tasa), catalogo: enCat ? enCat.valor : null, nivel: enCat ? enCat.nivel : null });
    if (enCat && Number(enCat.valor) !== Number(r.tasa)) hallazgos.push({ prueba: 'ISN · tasa del informe ≠ catálogo', detalle: r.e + ': informe ' + r.tasa + '%, catálogo ' + enCat.valor + '% (' + enCat.id + ')' });
    if (!enCat && !extra.some(f => f.entidad === ent)) extra.push({ id: 'INFORME:ISN_TASA:' + ent + '@' + inf.periodo.anio, clave: 'ISN_TASA', entidad: ent, valor: String(r.tasa),
      vigencia_desde: inf.periodo.anio + '-01-01', vigencia_hasta: inf.periodo.anio + '-12-31', base_temporal: 'mes_causacion',
      fundamento: 'Tasa tomada del propio informe (sin cotejar)', fuente: 'Informe de supervisión ' + inf.periodo.mes + ' ' + inf.periodo.anio, nivel: 'C' });
  }
  const cat = new Catalogo([...filasParametros, ...extra]);
  const isn = [];
  let sumaKernel = 0;
  for (const r of inf.sec10 || []) {
    const ent = ENTIDAD[r.e]; if (!ent) continue;
    const ctx = new Contexto(cat);
    const k = reglaPorId('CALC-ISN-001').calcular({ registro: r.e, entidad: ent, mes: fecha, conceptos: [{ concepto: 'base_informe', monto_c: c(r.base) }] }, ctx);
    sumaKernel += k.valor_c;
    isn.push({ estado: r.e, base: $(c(r.base)), tasa: k.traza.tasa_pct, kernel: $(k.valor_c), informe: $(c(r.imp)), dif_c: c(r.imp) - k.valor_c });
    cuadra('ISN ' + r.e + ': base × tasa (kernel)', c(r.imp), k.valor_c);
  }
  if (inf.sec10) {
    const sumaInf = inf.sec10.reduce((s, r) => s + c(r.imp), 0);
    cuadra('ISN: suma por estado (sec10) = total ISN (sec8)', sumaInf, c(inf.sec8.isn_total), 0);
    cuadra('ISN: suma por estado (sec10) = total del periodo', sumaInf, c(inf.periodo.total_isn), 0);
    cuadra('ISN: kernel vs total del informe', sumaKernel, c(inf.sec8.isn_total), 0);
    cuadra('ISN: suma de periodos (sec8) = total ISN', inf.sec8.periodos.reduce((s, p) => s + c(p.isn), 0), c(inf.sec8.isn_total));
    const empIsn = inf.sec10.reduce((s, r) => s + r.emp, 0);
    ok.push({ prueba: 'ISN: colaboradores por estado (sec10)', informe: String(empIsn) });
  }

  // ── 2. Aritmética interna ──
  const s1 = inf.sec1;
  if (s1) {
    cuadra('sec1: percepciones − deducciones = neto', c(s1.percepciones) - c(s1.deducciones), c(s1.total_neto));
    cuadra('sec1: neto − CFDI = diferencia CFDI', c(s1.total_neto) - c(s1.cfdi_total), c(s1.cfdi_dif));
    cuadra('sec1: neto − dispersión = diferencia dispersión', c(s1.total_neto) - c(s1.disp_total), c(s1.disp_dif));
  }
  if (inf.sec2 && s1) {
    cuadra('sec2: suma neto por corrida = neto (sec1)', inf.sec2.reduce((s, p) => s + c(p.nom), 0), c(s1.total_neto));
    cuadra('sec2: suma CFDI por corrida = CFDI (sec1)', inf.sec2.reduce((s, p) => s + c(p.cfdi), 0), c(s1.cfdi_total));
    cuadra('sec2: suma dispersión por corrida = dispersión (sec1)', inf.sec2.reduce((s, p) => s + c(p.disp), 0), c(s1.disp_total));
  }
  const tabla = (sec, campos, totalCampo, totales) => {
    if (!sec) return;
    for (const p of sec.periodos) cuadra(totalCampo.sec + ' ' + p.p + ': suma de rubros = total', campos.reduce((s, f) => s + c(p[f]), 0), c(p.total));
    for (const [f, t] of Object.entries(totales)) cuadra(totalCampo.sec + ': columna ' + f + ' = ' + t, sec.periodos.reduce((s, p) => s + c(p[f]), 0), c(sec[t]));
    cuadra(totalCampo.sec + ': suma de totales = ' + totalCampo.t, sec.periodos.reduce((s, p) => s + c(p.total), 0), c(sec[totalCampo.t]));
  };
  tabla(inf.sec7, ['isr', 'imss', 'info', 'fon'], { sec: 'sec7', t: 'total_trabajador' }, { isr: 'total_isr', imss: 'total_imss', info: 'total_info', fon: 'total_fon' });
  tabla(inf.sec8, ['imss', 'rcv', 'info', 'isn'], { sec: 'sec8', t: 'total_patron' }, { imss: 'total_imss', rcv: 'total_rcv', info: 'total_info', isn: 'isn_total' });
  if (inf.sec7) cuadra('sec7: ISR nómina − ISR SAT = diferencia', c(inf.sec7.isr_nomina) - c(inf.sec7.isr_sat), c(inf.sec7.isr_dif));
  if (inf.sec11) {
    for (const p of inf.sec11.periodos) cuadra('sec11 ' + p.p + ': provisión − nómina = variación', c(p.prov) - c(p.nom), c(p.var));
    cuadra('sec11: suma provisiones = provisión global', inf.sec11.periodos.reduce((s, p) => s + c(p.prov), 0), c(inf.sec11.provision_global));
    cuadra('sec11: suma nómina = nómina ajustada', inf.sec11.periodos.reduce((s, p) => s + c(p.nom), 0), c(inf.sec11.nomina_ajustada));
    cuadra('sec11: provisión − nómina ajustada = diferencia', c(inf.sec11.provision_global) - c(inf.sec11.nomina_ajustada), c(inf.sec11.diferencia));
  }

  // ── 3. Registros patronales: duplicados y cuadre contra la carga patronal ──
  if (inf.sec9) {
    const vistos = new Map();
    for (const r of inf.sec9) {
      const k = r.emp + '|' + r.t;
      if (vistos.has(k)) hallazgos.push({ prueba: 'sec9: registro con cifras idénticas a otro', detalle: r.rp + ' (' + r.e + ') = ' + vistos.get(k) + ': ' + r.emp + ' colaboradores, ' + $(c(r.t)) + '. Copia de renglón: el registro no tiene cifras propias' });
      else vistos.set(k, r.rp + ' (' + r.e + ')');
    }
    const t9 = inf.sec9.reduce((s, r) => s + c(r.t), 0);
    const imssRcvInfo = c(inf.sec8.total_imss) + c(inf.sec8.total_rcv) + c(inf.sec8.total_info);
    cuadra('sec9: suma por registro = IMSS + RCV + INFONAVIT patronal (sec8)', t9, imssRcvInfo);
  }
  return { periodo: inf.periodo.mes + ' ' + inf.periodo.anio, ok: ok.length, hallazgos, isn, tasas };
}

if (process.argv[1] && process.argv[1].endsWith('no-regresion-reporte.mjs')) {
  const inf = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const filas = JSON.parse(readFileSync(new URL('../data/parametros-2026.json', import.meta.url))).filas;
  const r = revisarInforme(inf, filas);
  console.log(JSON.stringify(r, null, 1));
}
