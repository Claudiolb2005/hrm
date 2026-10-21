// sua-d1.js — Lectura del SUA en el servidor: guarda los archivos en R2, corre el kernel (ejecución sellada),
// cruza kernel ↔ emisión ↔ pago y deja el cruce en D1 para clasificarse. Un registro patronal por llamada:
// los archivos de un registro pesan kilobytes, así que cabe en una sola petición.
import { leerArchivoSUA, leerEmision, leerPatronEmision, textoLatin1, RAMAS } from './sua-formato.js';
import { itemsSUA, cruzarSUA } from './sua.js';
import { abrirEjecucion, calcularLote, cerrarEjecucion } from '../kernel/src/ejecutar.js';
import { cargarCatalogo, persistirEjecucion, insertarMultiple } from '../kernel/src/d1.js';
import { sha256Hex, nuevoId } from '../kernel/src/sello.js';

// Municipios de la zona libre de la frontera norte (salario mínimo de frontera; C13/C14).
const ZLFN = new Set(['TIJUANA', 'MEXICALI', 'TECATE', 'ENSENADA', 'PLAYAS DE ROSARITO', 'SAN QUINTIN', 'SAN FELIPE', 'SAN LUIS RIO COLORADO',
  'PUERTO PENASCO', 'GENERAL PLUTARCO ELIAS CALLES', 'CABORCA', 'ALTAR', 'SARIC', 'NOGALES', 'SANTA CRUZ', 'CANANEA', 'NACO', 'AGUA PRIETA',
  'JANOS', 'ASCENSION', 'JUAREZ', 'PRAXEDIS G. GUERRERO', 'GUADALUPE', 'COYAME DEL SOTOL', 'OJINAGA', 'MANUEL BENAVIDES', 'OCAMPO', 'ACUNA',
  'ZARAGOZA', 'JIMENEZ', 'PIEDRAS NEGRAS', 'NAVA', 'GUERRERO', 'HIDALGO', 'ANAHUAC', 'NUEVO LAREDO', 'MIGUEL ALEMAN', 'CAMARGO',
  'GUSTAVO DIAZ ORDAZ', 'REYNOSA', 'RIO BRAVO', 'VALLE HERMOSO', 'MATAMOROS', 'MIER']);
const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const CRUCE_COLS = 'id, ingesta_sua_id, encargo_id, tipo, causa, colaborador_id, rfc, nss_final, rama, kernel_c, emitido_c, pagado_c, limitado, detalle_json';

/** Liga RFC del SUA → número de empleado con la última prenómina terminada del encargo. */
async function ligaPrenomina(db, encargo_id) {
  const ing = await db.prepare("SELECT id FROM ingesta WHERE encargo_id = ?1 AND tipo = 'prenomina' AND estado = 'terminado' ORDER BY creado_en DESC LIMIT 1").bind(encargo_id).first();
  if (!ing) return { ingesta_id: null, buscar: () => null, total: 0 };
  const { results } = await db.prepare('SELECT DISTINCT rfc, colaborador_id FROM movimiento_nomina WHERE ingesta_id = ?1 AND rfc IS NOT NULL').bind(ing.id).all();
  const porRfc = new Map(), por10 = new Map();
  for (const r of results) {
    const rfc = String(r.rfc).toUpperCase();
    if (!porRfc.has(rfc)) porRfc.set(rfc, new Set());
    porRfc.get(rfc).add(r.colaborador_id);
    const k = rfc.slice(0, 10);
    if (!por10.has(k)) por10.set(k, new Set());
    por10.get(k).add(r.colaborador_id);
  }
  const unico = (s) => (s && s.size === 1 ? [...s][0] : null);
  return { ingesta_id: ing.id, total: porRfc.size,
    buscar: (rfc) => { if (!rfc) return null; const id = unico(porRfc.get(rfc)) || (rfc.length >= 10 ? unico(por10.get(rfc.slice(0, 10))) : null); return id ? { colaborador_id: id } : null; } };
}

/**
 * @param p.archivos { sua: {nombre, bytes}, ema: {...}, eba?: {...}, ema_pa?: {...} }  (bytes: Uint8Array)
 */
export async function procesarRegistroSUA(env, { encargo_id, archivos, usuario_id = null, ahora }) {
  const db = env.DB;
  const enc = await db.prepare('SELECT id, empresa_id, operador_nomina_usuario_id FROM encargo WHERE id = ?1').bind(encargo_id).first();
  if (!enc) throw new Error('Encargo no existe');
  if (!archivos || !archivos.sua || !archivos.ema) throw new Error('Faltan archivos: el .SUA y el CDEMMO99 (emisión mensual) son obligatorios');
  const sua = leerArchivoSUA(textoLatin1(archivos.sua.bytes));
  const { patron } = sua;
  const ema = leerEmision(textoLatin1(archivos.ema.bytes), 'ema');
  const par = Number(patron.periodo.slice(5, 7)) % 2 === 0;
  if (par && !archivos.eba) throw new Error('El pago de ' + patron.periodo + ' incluye el bimestre: falta el CDEBMO99 (EBA)');
  const eba = archivos.eba ? leerEmision(textoLatin1(archivos.eba.bytes), 'eba') : null;
  const pa = archivos.ema_pa ? leerPatronEmision(textoLatin1(archivos.ema_pa.bytes)) : null;
  if (pa && pa.registro !== patron.registro) throw new Error('La emisión es del registro ' + pa.registro + ' y el SUA del ' + patron.registro);
  if (pa && pa.periodo !== patron.periodo) throw new Error('La emisión es de ' + pa.periodo + ' y el SUA de ' + patron.periodo);
  if (!String(ema.prefijo_registro || '').startsWith(patron.registro.slice(0, 8))) throw new Error('El CDEMMO99 no es del registro ' + patron.registro);

  const rp = await db.prepare('SELECT entidad, municipio, prima_rt_pct, prima_desde, prima_hasta FROM registro_patronal WHERE empresa_id = ?1 AND registro = ?2').bind(enc.empresa_id, patron.registro).first();
  const prima = pa ? { pct: pa.prima_rt_pct, fuente: 'emision' } : rp && rp.prima_rt_pct ? { pct: rp.prima_rt_pct, vigencia_desde: rp.prima_desde || undefined, vigencia_hasta: rp.prima_hasta || undefined, fuente: 'registro_patronal' } : null;
  const zona = rp && ZLFN.has(sinAcentos(rp.municipio)) ? 'frontera' : 'general';
  const liga = await ligaPrenomina(db, encargo_id);

  // Evidencia en R2 y huellas de entrada.
  const prefijo = 'encargos/' + encargo_id + '/sua/' + patron.periodo + '/' + patron.registro + '/' + Date.now() + '/';
  const meta = {};
  for (const [k, f] of Object.entries(archivos)) {
    if (!f) continue;
    const sha = await sha256Hex(f.bytes);
    meta[k] = { nombre: f.nombre || k, sha256: sha, tamano: f.bytes.length };
    if (env.DOCS) await env.DOCS.put(prefijo + k + '_' + String(f.nombre || k).replace(/[^\w.\- ]+/g, '_'), f.bytes, { customMetadata: { encargo_id, tipo: 'sua_' + k, sha256: sha } });
  }

  const { items, personas, periodos } = itemsSUA({ sua, ema, eba, prima_rt: prima ? { pct: prima.pct, vigencia_desde: prima.vigencia_desde, vigencia_hasta: prima.vigencia_hasta } : null,
    colaborador: (rfc) => liga.buscar(rfc), zona_salarial: zona });
  const universo = sua.trabajadores.length;
  // Universo por regla: quien cotizó en el mes (IMSS) o en el bimestre (RCV e INFONAVIT) según la emisión o el SUA.
  // Una baja de julio está en el SUA de agosto sólo por el bimestre: no cuenta para el IMSS del mes.
  const cotizan = (emi, campo) => [...personas.entries()].filter(([nss, p]) => (emi && (emi.porNss.get(nss) || []).some(t => t.dias > 0)) || (p.w && p.w[campo].dias > 0)).length;
  const nMes = cotizan(ema, 'mes'), nBim = eba ? cotizan(eba, 'bimestre') : 0;
  const upr = { 'CALC-IMSS-001': nMes, 'CALC-RCV-001': nBim, 'CALC-INF-001': nBim };
  const fuentes = {
    sua_ema: { sha256: meta.ema.sha256, universo_por_regla: upr },
    faltas_incapacidades: { sha256: meta.sua.sha256, universo_por_regla: upr },
  };
  if (eba) fuentes.sua_eba = { sha256: meta.eba.sha256, universo_por_regla: upr };
  if (prima) fuentes.prima_rt_registro = { sha256: meta.ema_pa ? meta.ema_pa.sha256 : await sha256Hex(JSON.stringify(prima)) };

  const catalogo = await cargarCatalogo(db);
  const abierta = await abrirEjecucion({ catalogo, encargo_id, fuentes, ahora });
  const { lote, calculos } = await calcularLote({ catalogo, ejecucion: abierta, fuentes, items, lote: 1, ahora });
  const { ejecucion, resultados } = await cerrarEjecucion({ ejecucion: abierta, lotes: [lote], fuentes, ahora });
  await persistirEjecucion(db, { ejecucion, calculos, resultados, lotes: [lote] }, { catalogo, ejercicio: Number(patron.periodo.slice(0, 4)) });

  const excluidos = new Map();
  for (const c of Object.values(lote.cobertura)) for (const x of c.excluidos) excluidos.set(x.colaborador_id, x.motivo);
  const { renglones, resumen } = cruzarSUA({ personas, ema, eba, calculos, excluidos, periodos });

  const porCausa = {};
  for (const r of renglones) { const k = r.causa; porCausa[k] = porCausa[k] || { renglones: 0, pagado_menos_kernel_c: 0, pagado_menos_emitido_c: 0 }; porCausa[k].renglones += 1;
    porCausa[k].pagado_menos_kernel_c += (r.pagado_c ?? 0) - (r.kernel_c ?? 0); porCausa[k].pagado_menos_emitido_c += (r.pagado_c ?? 0) - (r.emitido_c ?? 0); }
  const ligados = [...personas.values()].filter(p => p.ligado).length;
  const reporte = {
    patron: { registro: patron.registro, rfc: patron.rfc, periodo: patron.periodo, folio: patron.folio },
    entidad: rp ? rp.entidad : null, municipio: rp ? rp.municipio : null, zona_salarial: zona,
    prima_rt: prima, prima_registro_patronal: rp ? rp.prima_rt_pct : null,
    prima_distinta: !!(prima && rp && rp.prima_rt_pct && Number(rp.prima_rt_pct) !== Number(prima.pct)),
    trabajadores: universo, cotizan: { mes: nMes, bimestre: nBim }, en_emision: { ema: ema.porNss.size, eba: eba ? eba.porNss.size : null },
    ligados_prenomina: ligados, prenomina_ingesta_id: liga.ingesta_id,
    cuadre_interno: { cuadra: sua.cuadra, control: sua.control },
    totales_por_rama: resumen, por_causa: porCausa,
    totales: Object.fromEntries(['kernel_c', 'emitido_c', 'pagado_c'].map(k => [k, RAMAS.reduce((s, r) => s + resumen[r][k], 0)])),
    amortizacion_infonavit_c: sua.trabajadores.reduce((s, w) => s + w.amortizacion_c, 0),
    actualizacion_imss_c: sua.trabajadores.reduce((s, w) => s + w.actualizacion_imss_c, 0),
    incapacidades: { dias_mes: sua.trabajadores.reduce((s, w) => s + w.mes.incapacidades, 0), dias_bimestre: sua.trabajadores.reduce((s, w) => s + w.bimestre.incapacidades, 0) },
    ausentismos: { dias_mes: sua.trabajadores.reduce((s, w) => s + w.mes.ausentismos, 0), dias_bimestre: sua.trabajadores.reduce((s, w) => s + w.bimestre.ausentismos, 0) },
    resultados: resultados.map(r => ({ regla_id: r.regla_id, estado: r.estado, esperado: r.cobertura.esperado, efectivo: r.cobertura.efectivo, excluidos: r.cobertura.excluidos.total })),
    ejecucion: { id: ejecucion.id, sello: ejecucion.sello, kernel_version: ejecucion.kernel_version, n_calculos: ejecucion.n_calculos },
    renglones_cruce: renglones.length,
  };

  const id = nuevoId('sua');
  await db.prepare('INSERT INTO ingesta_sua (id, encargo_id, periodo, registro, folio, r2_prefijo, archivos_json, trabajadores, prima_rt_pct, cuadre_interno, prenomina_ingesta_id, ejecucion_id, reporte_json, creado_por) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)')
    .bind(id, encargo_id, patron.periodo, patron.registro, patron.folio || null, prefijo, JSON.stringify(meta), universo, prima ? prima.pct : null, sua.cuadra ? 1 : 0,
      liga.ingesta_id, ejecucion.id, JSON.stringify(reporte), usuario_id).run();
  const filas = [];
  for (const [i, r] of renglones.entries()) {
    filas.push([id + ':' + i, id, encargo_id, r.tipo, r.causa, r.colaborador_id, r.rfc, r.nss_final, r.rama, r.kernel_c, r.emitido_c, r.pagado_c, r.limitado ? 1 : 0,
      JSON.stringify({ dias_mes: r.dias_mes, incapacidades_mes: r.incapacidades_mes, incapacidades_bim: r.incapacidades_bim, tramos: r.tramos, ligado: r.ligado })]);
  }
  const st = insertarMultiple(db, 'cruce_sua', CRUCE_COLS, filas, { ignorar: false });
  for (let i = 0; i < st.length; i += 50) await db.batch(st.slice(i, i + 50));
  return { id, reporte };
}
