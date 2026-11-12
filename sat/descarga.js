// descarga.js — Descarga directa del SAT para un encargo: e.firma guardada, cola de solicitudes y entrega a la ingesta.
//
//   pendiente ─► solicitada ─► lista ─► descargada ─► entregada
//     │ autentica y        │ verifica      │ baja cada paquete   │ XML: un ZIP por solicitud → ingesta_cfdi (xml_nomina)
//     │ pide al SAT        │ con espera    │ a R2 (una vez)      │ metadata: un .txt → ingesta_cfdi (metadata_sat)
//     ▼                    ▼ creciente     ▼                     ▼
//   rechazada           sin_datos / vencida                    el cruce nómina ↔ CFDI corre como con un ZIP subido a mano
//
// La tarea programada (cada minuto) avanza un paso de la solicitud más atrasada. Nada aquí califica: sólo trae
// los comprobantes. Cada paquete se guarda en R2 la primera vez que se baja (el SAT limita las descargas).
import { leerCertificado } from './der.js';
import { validarEfirma, crearFirma, cifrarLlave, descifrarLlave } from './efirma.js';
import { autenticar, solicitar, verificar, descargar, ErrorSat } from './cliente.js';
import { CODIGOS, ESTADOS_SOLICITUD } from './soap.js';
import { escritorR2, huellaR2, unirZips, metadataDePaquetes } from './paquetes.js';
import { crearIngestaCfdi } from '../ingesta/cfdi.js';
import { metadatosFuente } from '../servicio/expediente.js';
import { sha256Hex, nuevoId } from '../kernel/src/sello.js';

export const ACTIVOS = ['pendiente', 'solicitada', 'lista', 'descargada'];
const CANDADO_MS = 10 * 60000;      // bajar un paquete grande puede tardar
const MAX_INTENTOS = 8;             // fallos transitorios seguidos antes de dejarla en error
const MAX_DESCARGAS = 2;            // veces que se pide un mismo paquete al SAT
const DIAS_ANTES = 7, DIAS_DESPUES = 15; // margen sobre el periodo del encargo: el SAT filtra por fecha de emisión, el portal por fecha de pago

const iso = (ms) => new Date(ms).toISOString();
const http = (env) => env.SAT_FETCH || fetch;
const ahora = (env) => (env.SAT_AHORA ? env.SAT_AHORA() : Date.now());
/** Hora del centro de México (UTC−6, sin horario de verano desde 2022), como la espera el SAT. */
export const horaMexico = (ms) => iso(ms - 6 * 3600000).slice(0, 19);
const masDias = (fecha, d) => iso(Date.parse(fecha + 'T00:00:00Z') + d * 86400000).slice(0, 10);
const masSegundos = (f, s) => iso(Date.parse(f + 'Z') + s * 1000).slice(0, 19);

async function bitacora(db, empresa_id, accion, detalle, usuario_id = null) {
  await db.prepare('INSERT INTO sat_bitacora (empresa_id, accion, detalle, usuario_id) VALUES (?1,?2,?3,?4)').bind(empresa_id, accion, String(detalle || '').slice(0, 500), usuario_id).run();
}

// ── e.firma ──
const CRED_PUBLICA = 'empresa_id, rfc, titular, serie, vigente_desde, vigente_hasta, huella_cert, subida_por, subida_en';

export async function estadoCredencial(env, empresa_id) {
  const c = await env.DB.prepare('SELECT ' + CRED_PUBLICA + ' FROM sat_credencial WHERE empresa_id = ?1').bind(Number(empresa_id)).first();
  const hoy = iso(ahora(env));
  return { secreto_configurado: typeof env.SAT_LLAVE_MAESTRA === 'string' && env.SAT_LLAVE_MAESTRA.length >= 32,
    credencial: c ? { ...c, vencida: c.vigente_hasta < hoy, dias_para_vencer: Math.floor((Date.parse(c.vigente_hasta) - Date.parse(hoy)) / 86400000) } : null };
}

/** Valida el par .cer/.key con su contraseña y lo guarda cifrado. Sustituye la e.firma anterior de la empresa. */
export async function guardarCredencial(env, { empresa_id, cer, key, contrasena, usuario_id }) {
  const db = env.DB;
  empresa_id = Number(empresa_id);
  const emp = await db.prepare('SELECT id, rfc FROM empresas WHERE id = ?1').bind(empresa_id).first();
  if (!emp) throw new Error('Empresa no existe');
  const { cert, pkcs8, avisos } = await validarEfirma({ cer, key, contrasena, hoy: iso(ahora(env)) });
  if (emp.rfc && String(emp.rfc).trim().toUpperCase() !== cert.rfc) avisos.push('El RFC de la e.firma (' + cert.rfc + ') no es el registrado para la empresa (' + String(emp.rfc).trim().toUpperCase() + '): se descargará lo emitido por ' + cert.rfc);
  const c = await cifrarLlave(env.SAT_LLAVE_MAESTRA, pkcs8, { empresa_id, rfc: cert.rfc });
  pkcs8.fill(0);
  const huella = await sha256Hex(cert.der);
  await db.prepare('INSERT INTO sat_credencial (empresa_id, rfc, titular, serie, vigente_desde, vigente_hasta, certificado_b64, huella_cert, llave_cifrada, iv, subida_por, subida_en) ' +
    "VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11, datetime('now')) ON CONFLICT (empresa_id) DO UPDATE SET rfc = excluded.rfc, titular = excluded.titular, serie = excluded.serie, " +
    'vigente_desde = excluded.vigente_desde, vigente_hasta = excluded.vigente_hasta, certificado_b64 = excluded.certificado_b64, huella_cert = excluded.huella_cert, ' +
    'llave_cifrada = excluded.llave_cifrada, iv = excluded.iv, subida_por = excluded.subida_por, subida_en = excluded.subida_en')
    .bind(empresa_id, cert.rfc, cert.titular, cert.serie_sat || cert.serie, cert.vigente_desde, cert.vigente_hasta, cert.b64, huella, c.llave_cifrada, c.iv, usuario_id ?? null).run();
  await bitacora(db, empresa_id, 'efirma_cargada', 'RFC ' + cert.rfc + ', certificado ' + (cert.serie_sat || cert.serie) + ', vigente hasta ' + cert.vigente_hasta.slice(0, 10), usuario_id);
  return { ...(await estadoCredencial(env, empresa_id)), avisos };
}

export async function borrarCredencial(env, empresa_id, usuario_id) {
  empresa_id = Number(empresa_id);
  const act = await env.DB.prepare("SELECT count(*) AS n FROM sat_solicitud WHERE empresa_id = ?1 AND estado IN ('pendiente','solicitada','lista')").bind(empresa_id).first();
  const r = await env.DB.prepare('DELETE FROM sat_credencial WHERE empresa_id = ?1').bind(empresa_id).run();
  if ((r.meta?.changes ?? 0) === 0) return { borrada: false };
  await bitacora(env.DB, empresa_id, 'efirma_borrada', act.n ? act.n + ' solicitudes en curso quedan detenidas' : '', usuario_id);
  return { borrada: true, solicitudes_detenidas: act.n };
}

async function firmaDe(env, empresa_id) {
  const c = await env.DB.prepare('SELECT * FROM sat_credencial WHERE empresa_id = ?1').bind(Number(empresa_id)).first();
  if (!c) throw new ErrorSat('La empresa no tiene e.firma cargada');
  if (c.vigente_hasta < iso(ahora(env))) throw new ErrorSat('El certificado de la e.firma venció el ' + c.vigente_hasta.slice(0, 10));
  const pkcs8 = await descifrarLlave(env.SAT_LLAVE_MAESTRA, c, { empresa_id: Number(empresa_id), rfc: c.rfc }).catch(e => { throw new ErrorSat(e.message); });
  const firma = await crearFirma(leerCertificado(Uint8Array.from(atob(c.certificado_b64), ch => ch.charCodeAt(0))), pkcs8);
  pkcs8.fill(0);
  return firma;
}

/** Prueba la e.firma contra el SAT: sólo autentica (no pide nada). */
export async function probarConexion(env, empresa_id, usuario_id) {
  const firma = await firmaDe(env, empresa_id);
  const tok = await autenticar(firma, { http: http(env), ahora: ahora(env) });
  await bitacora(env.DB, Number(empresa_id), 'prueba_conexion', 'El SAT aceptó la e.firma de ' + firma.rfc, usuario_id);
  return { ok: true, rfc: firma.rfc, expira: tok.expira };
}

// ── Solicitudes ──
/** Rango de fechas de emisión que cubre el encargo, con margen y sin pasar de la hora actual. */
export function rangoDeEncargo(enc, ahoraMs) {
  const tope = horaMexico(ahoraMs - 10 * 60000);
  const desde = masDias(enc.periodo_desde, -DIAS_ANTES) + 'T00:00:00';
  let hasta = masDias(enc.periodo_hasta, DIAS_DESPUES) + 'T23:59:59';
  if (hasta > tope) hasta = tope;
  return { desde, hasta };
}

const fechaOk = (s) => typeof s === 'string' && /^\d{4}-\d\d-\d\d(T\d\d:\d\d:\d\d)?$/.test(s) && !Number.isNaN(Date.parse(s.length === 10 ? s + 'T00:00:00Z' : s + 'Z'));

/** Pide al SAT la metadata y los XML de nómina emitidos en el periodo del encargo. Devuelve las solicitudes creadas. */
export async function crearSolicitudes(env, { encargo_id, tipos = ['metadata', 'xml'], desde, hasta, usuario_id }) {
  const db = env.DB;
  const enc = await db.prepare('SELECT id, empresa_id, periodo_desde, periodo_hasta, estado FROM encargo WHERE id = ?1').bind(String(encargo_id || '')).first();
  if (!enc) throw new Error('Encargo no existe');
  if (enc.estado !== 'abierto') throw new Error('El encargo está cerrado: ya no recibe archivos');
  if (!Array.isArray(tipos) || !tipos.length || tipos.some(t => !['metadata', 'xml'].includes(t))) throw new Error('tipos: metadata, xml o ambos');
  const { credencial, secreto_configurado } = await estadoCredencial(env, enc.empresa_id);
  if (!secreto_configurado) throw new Error('Falta el secreto SAT_LLAVE_MAESTRA del Worker');
  if (!credencial) throw new Error('La empresa no tiene e.firma cargada');
  if (credencial.vencida) throw new Error('El certificado de la e.firma venció el ' + credencial.vigente_hasta.slice(0, 10));
  const r = rangoDeEncargo(enc, ahora(env));
  if (desde !== undefined && desde !== null && desde !== '') { if (!fechaOk(desde)) throw new Error('desde: AAAA-MM-DD'); r.desde = desde.length === 10 ? desde + 'T00:00:00' : desde; }
  if (hasta !== undefined && hasta !== null && hasta !== '') { if (!fechaOk(hasta)) throw new Error('hasta: AAAA-MM-DD'); r.hasta = hasta.length === 10 ? hasta + 'T23:59:59' : hasta; }
  const tope = horaMexico(ahora(env));
  if (r.hasta > tope) r.hasta = tope;
  if (!(r.desde < r.hasta)) throw new Error('El periodo pedido todavía no empieza o está al revés (' + r.desde + ' a ' + r.hasta + ')');
  if (Date.parse(r.hasta + 'Z') - Date.parse(r.desde + 'Z') > 370 * 86400000) throw new Error('Pide como máximo un año por solicitud');
  const enCurso = await db.prepare("SELECT tipo FROM sat_solicitud WHERE encargo_id = ?1 AND estado IN ('pendiente','solicitada','lista','descargada')").bind(enc.id).all();
  const ocupados = new Set(enCurso.results.map(x => x.tipo));
  const pedir = [...new Set(tipos)].filter(t => !ocupados.has(t));
  if (!pedir.length) throw new Error('Ya hay una descarga en curso para este encargo: espera a que termine');
  const lote = nuevoId('lot');
  const creadas = [];
  for (const tipo of pedir) {
    // El SAT acepta dos veces la misma solicitud de XML «de por vida»: si este periodo ya se pidió, se corre un segundo el inicio.
    const previas = await db.prepare('SELECT count(*) AS n FROM sat_solicitud WHERE rfc = ?1 AND tipo = ?2 AND fecha_final = ?3 AND substr(fecha_inicial, 1, 16) = ?4 AND id_solicitud_sat IS NOT NULL')
      .bind(credencial.rfc, tipo, r.hasta, r.desde.slice(0, 16)).first();
    const id = nuevoId('sat');
    await db.prepare('INSERT INTO sat_solicitud (id, empresa_id, encargo_id, lote_id, tipo, rfc, fecha_inicial, fecha_final, proxima_accion, creado_por) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)')
      .bind(id, enc.empresa_id, enc.id, lote, tipo, credencial.rfc, tipo === 'xml' ? masSegundos(r.desde, previas.n) : r.desde, r.hasta, iso(ahora(env)), usuario_id ?? null).run();
    creadas.push(id);
  }
  return { lote_id: lote, solicitudes: creadas, desde: r.desde, hasta: r.hasta, omitidas: [...new Set(tipos)].filter(t => ocupados.has(t)) };
}

const COLS_PUBLICAS = 'id, encargo_id, lote_id, tipo, rfc, fecha_inicial, fecha_final, estado, id_solicitud_sat, cod_estatus, mensaje, estado_sat, codigo_estado_sat, numero_cfdis, ' +
  'verificaciones, solicitada_en, lista_en, proxima_accion, ingesta_cfdi_id, substr(error, 1, 400) AS error, intentos, creado_en, actualizado_en';

export async function listarSolicitudes(db, encargo_id) {
  const { results } = await db.prepare('SELECT ' + COLS_PUBLICAS + ', (SELECT count(*) FROM sat_paquete p WHERE p.solicitud_id = s.id) AS paquetes, ' +
    "(SELECT count(*) FROM sat_paquete p WHERE p.solicitud_id = s.id AND p.estado = 'descargado') AS paquetes_descargados, " +
    '(SELECT sum(tamano) FROM sat_paquete p WHERE p.solicitud_id = s.id) AS bytes FROM sat_solicitud s WHERE encargo_id = ?1 ORDER BY creado_en DESC, tipo').bind(String(encargo_id || '')).all();
  return results;
}

/** Espera entre verificaciones: corta al principio, larga después (el SAT puede tardar horas). */
export function esperaVerificacion(n) { return n < 5 ? 2 * 60000 : n < 15 ? 5 * 60000 : n < 40 ? 15 * 60000 : 30 * 60000; }

async function fijar(db, id, campos) {
  const ks = Object.keys(campos);
  await db.prepare('UPDATE sat_solicitud SET ' + ks.map((k, i) => k + ' = ?' + (i + 2)).join(', ') + ", actualizado_en = datetime('now') WHERE id = ?1").bind(id, ...ks.map(k => campos[k])).run();
}

async function pasoPendiente(env, s, firma, token) {
  const r = await solicitar(firma, token, { tipo: s.tipo === 'xml' ? 'CFDI' : 'Metadata', fecha_inicial: s.fecha_inicial, fecha_final: s.fecha_final, tipo_comprobante: s.tipo_comprobante }, { http: http(env) });
  const t = ahora(env);
  if (r.cod_estatus === 5000 && r.id_solicitud) {
    await fijar(env.DB, s.id, { estado: 'solicitada', id_solicitud_sat: r.id_solicitud, cod_estatus: r.cod_estatus, mensaje: r.mensaje, solicitada_en: iso(t), proxima_accion: iso(t + esperaVerificacion(0)), intentos: 0, error: null });
    await bitacora(env.DB, s.empresa_id, 'solicitud', (s.tipo === 'xml' ? 'XML' : 'Metadata') + ' de nómina emitida del ' + s.fecha_inicial + ' al ' + s.fecha_final + ' · ' + r.id_solicitud, s.creado_por);
    return 'solicitada';
  }
  if (r.cod_estatus === 5002 && s.intentos < 3) { // periodo agotado: se corre un segundo y se vuelve a pedir
    await fijar(env.DB, s.id, { fecha_inicial: masSegundos(s.fecha_inicial, 1), cod_estatus: r.cod_estatus, mensaje: r.mensaje, intentos: s.intentos + 1, proxima_accion: iso(t) });
    return 'pendiente';
  }
  if (r.cod_estatus === 404 || r.cod_estatus === 5006) throw new ErrorSat((CODIGOS[r.cod_estatus] || r.mensaje) + ' (' + r.cod_estatus + ')', { transitorio: true });
  await fijar(env.DB, s.id, { estado: 'rechazada', cod_estatus: r.cod_estatus, mensaje: r.mensaje, error: 'El SAT no aceptó la solicitud: ' + (CODIGOS[r.cod_estatus] || r.mensaje || 'sin motivo') + ' (' + r.cod_estatus + ')' });
  return 'rechazada';
}

async function pasoSolicitada(env, s, firma, token) {
  const v = await verificar(firma, token, s.id_solicitud_sat, { http: http(env) });
  const t = ahora(env);
  const base = { cod_estatus: v.cod_estatus, mensaje: v.mensaje, estado_sat: v.estado_solicitud, codigo_estado_sat: v.codigo_estado_solicitud, numero_cfdis: v.numero_cfdis, verificaciones: s.verificaciones + 1, intentos: 0, error: null };
  if (v.cod_estatus !== null && v.cod_estatus !== 5000) {
    if (v.cod_estatus === 404 || v.cod_estatus === 5006) throw new ErrorSat((CODIGOS[v.cod_estatus] || v.mensaje) + ' (' + v.cod_estatus + ')', { transitorio: true });
    await fijar(env.DB, s.id, { ...base, estado: 'rechazada', error: 'El SAT no dejó verificar la solicitud: ' + (CODIGOS[v.cod_estatus] || v.mensaje) + ' (' + v.cod_estatus + ')' });
    return 'rechazada';
  }
  if (v.estado_solicitud === 3) {
    if (!v.paquetes.length) { await fijar(env.DB, s.id, { ...base, estado: 'sin_datos', lista_en: iso(t) }); return 'sin_datos'; }
    const st = v.paquetes.map((p, i) => env.DB.prepare('INSERT OR IGNORE INTO sat_paquete (solicitud_id, id_paquete, n) VALUES (?1,?2,?3)').bind(s.id, p, i + 1));
    await env.DB.batch(st);
    await fijar(env.DB, s.id, { ...base, estado: 'lista', lista_en: iso(t), proxima_accion: iso(t) });
    return 'lista';
  }
  if (v.estado_solicitud === 1 || v.estado_solicitud === 2) {
    // Tres días sin respuesta: se da por vencida (la referencia pública reporta casos de hasta 72 horas).
    if (s.solicitada_en && t - Date.parse(s.solicitada_en) > 96 * 3600000) { await fijar(env.DB, s.id, { ...base, estado: 'vencida', error: 'El SAT no terminó la solicitud en cuatro días' }); return 'vencida'; }
    await fijar(env.DB, s.id, { ...base, proxima_accion: iso(t + esperaVerificacion(s.verificaciones + 1)) });
    return 'solicitada';
  }
  if (v.estado_solicitud === 5 && v.codigo_estado_solicitud === 5004) { await fijar(env.DB, s.id, { ...base, estado: 'sin_datos', lista_en: iso(t) }); return 'sin_datos'; }
  if (v.estado_solicitud === 6) { await fijar(env.DB, s.id, { ...base, estado: 'vencida', error: 'La solicitud venció en el SAT antes de bajarse: hay que pedirla otra vez' }); return 'vencida'; }
  const cod = v.codigo_estado_solicitud;
  await fijar(env.DB, s.id, { ...base, estado: 'rechazada', error: 'El SAT dejó la solicitud como «' + (ESTADOS_SOLICITUD[v.estado_solicitud] || v.estado_solicitud) + '»: ' + (CODIGOS[cod] || 'sin motivo') + ' (' + cod + ')' +
    (cod === 5003 ? '. Pide el periodo en partes más chicas' : '') });
  return 'rechazada';
}

async function pasoLista(env, s, firma, token) {
  const db = env.DB;
  const p = await db.prepare("SELECT * FROM sat_paquete WHERE solicitud_id = ?1 AND estado = 'pendiente' ORDER BY n LIMIT 1").bind(s.id).first();
  if (!p) { await fijar(db, s.id, { estado: 'descargada', proxima_accion: iso(ahora(env)), intentos: 0, error: null }); return 'descargada'; }
  if (p.descargas >= MAX_DESCARGAS) {
    // Se conserva el motivo de la última falla: sin él no se sabe si falló el SAT, la red o el guardado.
    await fijar(db, s.id, { estado: 'error', error: 'El paquete ' + p.n + ' ya se pidió ' + p.descargas + ' veces al SAT sin completarse' + (s.error ? '. Última falla: ' + String(s.error).slice(0, 600) : '') });
    return 'error';
  }
  // Dentro de la carpeta de comprobantes del encargo: así el expediente los lista y les aplica el plazo de retención.
  const key = 'encargos/' + s.encargo_id + '/cfdi/sat/' + s.id + '/' + String(p.n).padStart(3, '0') + '_' + p.id_paquete.replace(/[^\w.-]+/g, '_') + '.zip';
  const w = escritorR2(env.DOCS, key, { httpMetadata: { contentType: 'application/zip' }, customMetadata: await metadatosFuente(db, s.encargo_id, 'sat_paquete_' + s.tipo) });
  let r;
  try {
    r = await descargar(firma, token, p.id_paquete, (u8) => w.escribir(u8), { http: http(env) });
    if (r.cod_estatus !== null && r.cod_estatus !== 5000) {
      throw new ErrorSat('El SAT no entregó el paquete ' + p.n + ': ' + (CODIGOS[r.cod_estatus] || r.mensaje) + ' (' + r.cod_estatus + ')', { transitorio: r.cod_estatus === 404 || r.cod_estatus === 5006 });
    }
    if (!r.bytes) throw new ErrorSat('El SAT entregó vacío el paquete ' + p.n, { transitorio: true });
    await w.cerrar();
  } catch (e) {
    await w.abortar();
    // Sólo cuenta como descarga gastada si el SAT llegó a mandar el paquete.
    if (w.bytes) await db.prepare('UPDATE sat_paquete SET descargas = descargas + 1 WHERE solicitud_id = ?1 AND id_paquete = ?2').bind(s.id, p.id_paquete).run();
    throw e;
  }
  const sha = await huellaR2(env.DOCS, key);
  await db.prepare("UPDATE sat_paquete SET estado = 'descargado', r2_key = ?3, tamano = ?4, sha256 = ?5, descargas = descargas + 1, descargado_en = ?6 WHERE solicitud_id = ?1 AND id_paquete = ?2")
    .bind(s.id, p.id_paquete, key, r.bytes, sha, iso(ahora(env))).run();
  await bitacora(db, s.empresa_id, 'descarga', 'Paquete ' + p.n + ' de la solicitud ' + s.id_solicitud_sat + ' · ' + r.bytes + ' bytes · sha256 ' + sha);
  await fijar(db, s.id, { proxima_accion: iso(ahora(env)), intentos: 0, error: null });
  return 'lista';
}

/** Entrega a la ingesta de comprobantes lo que ya está en R2. No usa la e.firma. */
async function pasoDescargada(env, s) {
  const db = env.DB;
  const { results: ps } = await db.prepare('SELECT n, r2_key FROM sat_paquete WHERE solicitud_id = ?1 ORDER BY n').bind(s.id).all();
  const keys = ps.map(p => p.r2_key);
  if (s.tipo === 'xml') {
    // Los XML esperan a la metadata del mismo lote: así el cruce ya sabe cuáles están cancelados.
    const m = await db.prepare("SELECT estado FROM sat_solicitud WHERE lote_id = ?1 AND tipo = 'metadata' AND id <> ?2").bind(s.lote_id, s.id).first();
    if (m && ACTIVOS.includes(m.estado)) { await fijar(db, s.id, { proxima_accion: iso(ahora(env) + 60000) }); return 'descargada'; }
    if (m && m.estado === 'entregada') {
      const ing = await db.prepare("SELECT i.estado FROM sat_solicitud x JOIN ingesta_cfdi i ON i.id = x.ingesta_cfdi_id WHERE x.lote_id = ?1 AND x.tipo = 'metadata'").bind(s.lote_id).first();
      if (ing && ['pendiente', 'leyendo'].includes(ing.estado)) { await fijar(db, s.id, { proxima_accion: iso(ahora(env) + 60000) }); return 'descargada'; }
    }
  }
  const mes = s.fecha_final.slice(0, 7);
  const meta = { customMetadata: await metadatosFuente(db, s.encargo_id, s.tipo === 'xml' ? 'xml_nomina' : 'metadata_sat') };
  let key, nombre, detalle;
  if (s.tipo === 'xml') {
    nombre = 'SAT_' + s.rfc + '_nomina_' + s.fecha_inicial.slice(0, 10) + '_a_' + s.fecha_final.slice(0, 10) + '.zip';
    key = 'encargos/' + s.encargo_id + '/cfdi/' + ahora(env) + '_' + nombre;
    if (keys.length === 1) { key = keys[0]; detalle = 'un paquete, tal como lo entregó el SAT'; } // sin copia
    else {
      const u = await unirZips(env.DOCS, keys, key, { httpMetadata: { contentType: 'application/zip' }, ...meta });
      detalle = u.entradas + ' archivos en ' + keys.length + ' paquetes' + (u.repetidas ? ', ' + u.repetidas + ' repetidos entre paquetes' : '');
    }
  } else {
    const md = await metadataDePaquetes(env.DOCS, keys);
    if (!md.renglones) { await fijar(db, s.id, { estado: 'sin_datos', error: null }); return 'sin_datos'; }
    nombre = 'SAT_' + s.rfc + '_metadata_' + s.fecha_inicial.slice(0, 10) + '_a_' + s.fecha_final.slice(0, 10) + '.txt';
    key = 'encargos/' + s.encargo_id + '/cfdi/' + ahora(env) + '_' + nombre;
    await env.DOCS.put(key, md.texto, { httpMetadata: { contentType: 'text/plain; charset=utf-8' }, ...meta });
    detalle = md.renglones + ' comprobantes';
  }
  // Misma llave de cruce que el último paquete de XML del encargo (número de empleado si no hay ninguno).
  const prev = await db.prepare("SELECT llave FROM ingesta_cfdi WHERE encargo_id = ?1 AND tipo = 'xml_nomina' ORDER BY creado_en DESC LIMIT 1").bind(s.encargo_id).first();
  const ingesta_id = await crearIngestaCfdi(env, { encargo_id: s.encargo_id, tipo: s.tipo === 'xml' ? 'xml_nomina' : 'metadata_sat', r2_key: key, archivo_nombre: nombre, llave: (prev && prev.llave) || 'num_empleado', usuario_id: s.creado_por });
  await fijar(db, s.id, { estado: 'entregada', r2_key: key, ingesta_cfdi_id: ingesta_id, intentos: 0, error: null });
  await bitacora(db, s.empresa_id, 'entrega', (s.tipo === 'xml' ? 'XML' : 'Metadata') + ' de ' + mes + ' entregada a la ingesta ' + ingesta_id + ' · ' + detalle);
  return 'entregada';
}

async function tomar(db, id, t) {
  const r = await db.prepare('UPDATE sat_solicitud SET tomado_hasta = ?2 WHERE id = ?1 AND (tomado_hasta IS NULL OR tomado_hasta < ?3)').bind(id, iso(t + CANDADO_MS), iso(t)).run();
  return (r.meta?.changes ?? r.changes ?? 0) === 1;
}

/**
 * Avanza la solicitud indicada o la más atrasada. Un paso de red por llamada (pedir, verificar o bajar un paquete);
 * la entrega a la ingesta se encadena si queda presupuesto. Devuelve { id, estado }.
 */
export async function avanzarSat(env, { solicitud_id, forzar = false, presupuesto_ms = 20000 } = {}) {
  const db = env.DB;
  const t0 = ahora(env), limite = Date.now() + presupuesto_ms;
  const s0 = solicitud_id
    ? await db.prepare('SELECT * FROM sat_solicitud WHERE id = ?1').bind(solicitud_id).first()
    : await db.prepare("SELECT * FROM sat_solicitud WHERE estado IN ('pendiente','solicitada','lista','descargada') AND proxima_accion <= ?1 AND (tomado_hasta IS NULL OR tomado_hasta < ?1) ORDER BY proxima_accion LIMIT 1").bind(iso(t0)).first();
  if (!s0) return { estado: 'sin_trabajo' };
  if (!ACTIVOS.includes(s0.estado)) return { id: s0.id, estado: s0.estado };
  if (!forzar && s0.proxima_accion > iso(t0)) return { id: s0.id, estado: s0.estado, espera_hasta: s0.proxima_accion };
  if (!(await tomar(db, s0.id, t0))) return { id: s0.id, estado: s0.estado, ocupado: true };
  let estado = s0.estado;
  try {
    let firma = null, token = null;
    for (let pasos = 0; pasos < 12 && ACTIVOS.includes(estado); pasos++) {
      const s = await db.prepare('SELECT * FROM sat_solicitud WHERE id = ?1').bind(s0.id).first();
      if (estado === 'descargada') { const sig = await pasoDescargada(env, s); if (sig === estado) break; estado = sig; continue; }
      if (!firma) {
        firma = await firmaDe(env, s.empresa_id);
        if (firma.rfc !== s.rfc) throw new ErrorSat('La e.firma cargada es de ' + firma.rfc + ' y esta solicitud se hizo con ' + s.rfc + ': hay que pedirla de nuevo');
        token = (await autenticar(firma, { http: http(env), ahora: ahora(env) })).valor;
      }
      const sig = estado === 'pendiente' ? await pasoPendiente(env, s, firma, token) : estado === 'solicitada' ? await pasoSolicitada(env, s, firma, token) : await pasoLista(env, s, firma, token);
      // Tras pedir o verificar se espera; los paquetes se siguen bajando mientras haya presupuesto.
      const seguir = (estado === 'lista' && (sig === 'lista' || sig === 'descargada')) || (estado === 'solicitada' && sig === 'lista') || (estado === 'pendiente' && sig === 'pendiente');
      estado = sig;
      if (!seguir || Date.now() > limite) break;
    }
    return { id: s0.id, estado };
  } catch (e) {
    const transitorio = e instanceof ErrorSat ? e.transitorio : true;
    const s = await db.prepare('SELECT estado, intentos FROM sat_solicitud WHERE id = ?1').bind(s0.id).first();
    const msg = String(e && e.message || e).slice(0, 1000);
    if (ACTIVOS.includes(s.estado)) {
      if (transitorio && s.intentos + 1 < MAX_INTENTOS) await fijar(db, s0.id, { intentos: s.intentos + 1, error: msg, proxima_accion: iso(ahora(env) + Math.min(60, 2 ** s.intentos * 2) * 60000) });
      else await fijar(db, s0.id, { estado: 'error', intentos: s.intentos + 1, error: msg });
    }
    const fin = await db.prepare('SELECT estado FROM sat_solicitud WHERE id = ?1').bind(s0.id).first();
    return { id: s0.id, estado: fin.estado, error: msg };
  } finally {
    await db.prepare('UPDATE sat_solicitud SET tomado_hasta = NULL WHERE id = ?1').bind(s0.id).run();
  }
}

/** Una solicitud en error vuelve a la etapa en que quedó. Las rechazadas, vencidas o sin datos se piden de nuevo (otra solicitud). */
export async function reintentarSat(env, id) {
  const db = env.DB;
  const s = await db.prepare('SELECT * FROM sat_solicitud WHERE id = ?1').bind(String(id || '')).first();
  if (!s || s.estado !== 'error') return false;
  const pend = await db.prepare("SELECT count(*) AS n, sum(estado = 'pendiente') AS p FROM sat_paquete WHERE solicitud_id = ?1").bind(s.id).first();
  const estado = !s.id_solicitud_sat ? 'pendiente' : !pend.n ? 'solicitada' : pend.p ? 'lista' : 'descargada';
  if (estado === 'lista') await db.prepare("UPDATE sat_paquete SET descargas = 0 WHERE solicitud_id = ?1 AND estado = 'pendiente'").bind(s.id).run();
  await fijar(db, s.id, { estado, intentos: 0, error: null, proxima_accion: iso(ahora(env)), tomado_hasta: null });
  return estado;
}
