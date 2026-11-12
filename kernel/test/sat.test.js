// Descarga directa del SAT (0020): e.firma, sobres firmados, cliente del servicio, paquetes y entrega a la ingesta.
// No se toca al SAT: la forma de cada petición se fija contra las grabadas de la referencia pública y el servicio se
// simula con un servidor en memoria que SÍ verifica la firma de cada sobre con la llave pública del certificado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, randomBytes, generateKeyPairSync, createVerify, createHash, X509Certificate } from 'node:crypto';
import { baseDatos, r2Local, zipArchivos } from './util.js';
import { CONTRASENA, FIEL_CER, FIEL_KEY, CSD_CER, ESPERADO, bytes } from './fixtures-sat.mjs';
import { CAL, PAQUETE, META, archivosPrueba } from './fixtures-cfdi.mjs';
import worker from '../../worker.js';
import { descifrar3desCbc } from '../../sat/des.js';
import { leerCertificado } from '../../sat/der.js';
import { abrirLlave, validarEfirma, crearFirma, cifrarLlave, descifrarLlave, correspondeAlCertificado } from '../../sat/efirma.js';
import { sobreAutenticar, sobreSolicitar, sobreVerificar, sobreDescargar, leerToken, leerSolicitud, leerVerificacion, fallaSoap, EXTREMOS } from '../../sat/soap.js';
import { autenticar, descargar, ErrorSat } from '../../sat/cliente.js';
import { escritorR2, unirZips, metadataDePaquetes } from '../../sat/paquetes.js';
import { guardarCredencial, estadoCredencial, crearSolicitudes, avanzarSat, reintentarSat, listarSolicitudes, rangoDeEncargo, horaMexico, esperaVerificacion } from '../../sat/descarga.js';
import { abrirZip, fuenteBuffer } from '../../ingesta/xlsx.js';
import { crearIngesta, avanzar } from '../../ingesta/trabajos.js';
import { avanzarCfdi, estadoIngestaCfdi } from '../../ingesta/cfdi.js';
import { PERMISOS_CARGA } from '../../api/permisos.js';

const SECRETO = 'secreto-de-prueba-de-32-caracteres-o-mas';
const HOY = Date.parse('2026-11-12T16:00:00Z');
const cer = bytes(FIEL_CER), key = bytes(FIEL_KEY);
const val = (x, t) => (new RegExp('<' + t + '>([^<]+)</' + t + '>').exec(x) || [])[1];
async function firmaPrueba() { const { cert, pkcs8 } = await validarEfirma({ cer, key, contrasena: CONTRASENA, hoy: '2026-11-12T00:00:00Z' }); return crearFirma(cert, pkcs8); }

test('3DES-CBC propio descifra igual que OpenSSL', () => {
  for (let i = 0; i < 40; i++) {
    const k = randomBytes(24), iv = randomBytes(8), m = randomBytes(1 + (i * 37) % 400);
    const c = createCipheriv('des-ede3-cbc', k, iv);
    const ct = Buffer.concat([c.update(m), c.final()]);
    assert.ok(Buffer.from(descifrar3desCbc(new Uint8Array(k), new Uint8Array(iv), new Uint8Array(ct))).equals(m));
  }
  assert.throws(() => descifrar3desCbc(new Uint8Array(24), new Uint8Array(8), new Uint8Array(7)), /inválidos/);
});

test('certificado: RFC, serie, emisor y vigencia; distingue la e.firma del sello', () => {
  const c = leerCertificado(cer);
  const ref = new X509Certificate(Buffer.from(cer));
  assert.equal(c.rfc, 'EKU9003173C9');
  assert.equal(c.titular, 'ESCUELA KEMPER URGATE SA DE CV');
  assert.equal(c.serie, BigInt('0x' + ref.serialNumber).toString(10));
  assert.equal(c.serie_sat, '30001000000500003415');
  assert.equal(c.vigente_hasta, new Date(ref.validTo).toISOString().replace('.000Z', 'Z'));
  assert.match(c.emisor, /^CN=AC UAT,O=SERVICIO DE ADMINISTRACION TRIBUTARIA,.*unstructuredName=responsable: ACDMA-SAT$/);
  assert.equal(c.es_efirma, true);
  assert.equal(leerCertificado(bytes(CSD_CER)).es_efirma, false, 'el sello (CSD) no es e.firma');
  const pem = '-----BEGIN CERTIFICATE-----\n' + FIEL_CER.replace(/(.{64})/g, '$1\n') + '\n-----END CERTIFICATE-----\n';
  assert.equal(leerCertificado(new TextEncoder().encode(pem)).rfc, 'EKU9003173C9', 'también en PEM');
  assert.throws(() => leerCertificado(new Uint8Array([1, 2, 3])), /no es un certificado/);
});

test('llave privada: abre el .key del SAT (3DES) y uno con AES; contraseña equivocada o par distinto se rechazan', async () => {
  const cert = leerCertificado(cer);
  const pkcs8 = await abrirLlave(key, CONTRASENA);
  assert.equal(await correspondeAlCertificado(pkcs8, cert), true);
  await assert.rejects(abrirLlave(key, 'otra'), /contraseña de la llave privada no es correcta/);
  await assert.rejects(abrirLlave(cer, CONTRASENA), /no es una llave privada/);
  const otro = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const aes = otro.privateKey.export({ type: 'pkcs8', format: 'der', cipher: 'aes-256-cbc', passphrase: 'ñandú 123' });
  const claro = await abrirLlave(new Uint8Array(aes), 'ñandú 123');
  assert.ok(Buffer.from(claro).equals(otro.privateKey.export({ type: 'pkcs8', format: 'der' })), 'PBES2 con AES-256 y contraseña con acentos');
  assert.equal(await correspondeAlCertificado(claro, cert), false);
  await assert.rejects(validarEfirma({ cer, key: new Uint8Array(aes), contrasena: 'ñandú 123', hoy: '2026-11-12T00:00:00Z' }), /no corresponde al \.cer/);
  await assert.rejects(validarEfirma({ cer, key, contrasena: CONTRASENA, hoy: '2027-06-01T00:00:00Z' }), /venció el 2027-05-17/);
  const csd = await validarEfirma({ cer: bytes(CSD_CER), key, contrasena: CONTRASENA, hoy: '2026-11-12T00:00:00Z' }).catch(e => e);
  assert.match(String(csd.message || ''), /no corresponde/, 'el .key de la e.firma no es par del sello');
});

test('sobres: las cuatro peticiones salen firmadas igual, byte por byte, que las de la referencia pública', async () => {
  const f = await firmaPrueba();
  const casos = [
    [await sobreSolicitar(f, { tipo: 'Metadata', fecha_inicial: '2019-01-01T00:00:00', fecha_final: '2019-01-01T00:04:00' }), ESPERADO.solicitar],
    [await sobreVerificar(f, ESPERADO.verificar.id), ESPERADO.verificar],
    [await sobreAutenticar(f, ESPERADO.autenticar), ESPERADO.autenticar],
    [await sobreDescargar(f, ESPERADO.descargar.id), ESPERADO.descargar],
  ];
  for (const [xml, e] of casos) {
    assert.equal(val(xml, 'DigestValue'), e.digest);
    assert.equal(val(xml, 'SignatureValue'), e.firma);
  }
  const n = await sobreSolicitar(f, { tipo: 'CFDI', fecha_inicial: '2026-09-01T00:00:00', fecha_final: '2026-09-30T23:59:59', tipo_comprobante: 'N' });
  assert.match(n, /<des:solicitud EstadoComprobante="Todos" FechaFinal="2026-09-30T23:59:59" FechaInicial="2026-09-01T00:00:00" RfcEmisor="EKU9003173C9" RfcSolicitante="EKU9003173C9" TipoComprobante="N" TipoSolicitud="CFDI">/,
    'emitidos de nómina, vigentes y cancelados, atributos en orden alfabético');
  await assert.rejects(async () => sobreSolicitar(f, { tipo: 'CFDI', fecha_inicial: '2026-09-30T00:00:00', fecha_final: '2026-09-30T00:00:00' }), /anterior a la final/);
  await assert.rejects(async () => sobreSolicitar(f, { tipo: 'PDF', fecha_inicial: '2026-09-01T00:00:00', fecha_final: '2026-09-30T00:00:00' }), /Metadata o CFDI/);
});

test('respuestas del SAT: token, solicitud, verificación con paquetes y falla SOAP', () => {
  assert.equal(leerToken('<s:Envelope><s:Header><u:Timestamp><u:Created>a</u:Created><u:Expires>b</u:Expires></u:Timestamp></s:Header><s:Body><AutenticaResponse xmlns="x"><AutenticaResult>tok%26x</AutenticaResult></AutenticaResponse></s:Body></s:Envelope>').valor, 'tok%26x');
  assert.deepEqual(leerSolicitud('<SolicitaDescargaEmitidosResult IdSolicitud="d49af78d" CodEstatus="5000" Mensaje="Solicitud Aceptada" />'), { cod_estatus: 5000, mensaje: 'Solicitud Aceptada', id_solicitud: 'd49af78d' });
  const v = leerVerificacion('<VerificaSolicitudDescargaResult CodEstatus="5000" EstadoSolicitud="3" CodigoEstadoSolicitud="5000" NumeroCFDIs="12345" Mensaje="Solicitud Aceptada">\n<IdsPaquetes>A_01</IdsPaquetes>\n<IdsPaquetes>A_02</IdsPaquetes></VerificaSolicitudDescargaResult>');
  assert.deepEqual([v.estado_solicitud, v.numero_cfdis, v.paquetes], [3, 12345, ['A_01', 'A_02']]);
  assert.deepEqual(leerVerificacion('<VerificaSolicitudDescargaResult CodEstatus="5000" EstadoSolicitud="5" CodigoEstadoSolicitud="5004" NumeroCFDIs="0" Mensaje="x" />').paquetes, []);
  assert.match(fallaSoap('<s:Fault><faultcode xmlns:a="x">a:InvalidSecurity</faultcode><faultstring xml:lang="en-US">An error occurred when verifying security for the message.</faultstring></s:Fault>').mensaje, /verifying security/);
  assert.equal(fallaSoap('<ok/>'), null);
});

test('guardado: la llave queda cifrada, atada a la empresa y al RFC, y no abre sin el secreto', async () => {
  const pkcs8 = await abrirLlave(key, CONTRASENA);
  const c = await cifrarLlave(SECRETO, pkcs8, { empresa_id: 1, rfc: 'EKU9003173C9' });
  assert.ok(!c.llave_cifrada.includes(Buffer.from(pkcs8).toString('base64').slice(0, 40)));
  assert.ok(Buffer.from(await descifrarLlave(SECRETO, c, { empresa_id: 1, rfc: 'EKU9003173C9' })).equals(Buffer.from(pkcs8)));
  await assert.rejects(descifrarLlave(SECRETO, c, { empresa_id: 2, rfc: 'EKU9003173C9' }), /no abre/);
  await assert.rejects(descifrarLlave(SECRETO + 'x', c, { empresa_id: 1, rfc: 'EKU9003173C9' }), /no abre/);
  await assert.rejects(cifrarLlave('corto', pkcs8, { empresa_id: 1, rfc: 'X' }), /SAT_LLAVE_MAESTRA/);
  await assert.rejects(cifrarLlave(undefined, pkcs8, { empresa_id: 1, rfc: 'X' }), /SAT_LLAVE_MAESTRA/);
});

// ── Paquetes ──
const trozos = (u8, n) => new ReadableStream({ start(c) { for (let i = 0; i < u8.length; i += n) c.enqueue(u8.subarray(i, i + n)); c.close(); } });
const respuestaPaquete = (zip, { cod = 5000, corte = 0 } = {}) => {
  const b64 = Buffer.from(zip).toString('base64');
  const xml = '<?xml version="1.0" encoding="UTF-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Header><h:respuesta CodEstatus="' + cod + '" Mensaje="Solicitud Aceptada" xmlns:h="http://DescargaMasivaTerceros.sat.gob.mx"/></s:Header>' +
    '<s:Body><RespuestaDescargaMasivaTercerosSalida xmlns="http://DescargaMasivaTerceros.sat.gob.mx">' + (zip.length ? '<Paquete>' + b64 + '</Paquete>' : '<Paquete />') + '</RespuestaDescargaMasivaTercerosSalida></s:Body></s:Envelope>';
  const u8 = new TextEncoder().encode(corte ? xml.slice(0, corte) : xml);
  return u8;
};

test('descarga de un paquete: se decodifica por partes, sin importar dónde corta la red', async () => {
  const f = await firmaPrueba();
  const zip = zipArchivos(PAQUETE);
  for (const n of [1, 3, 7, 64, 1000, 1 << 20]) {
    const partes = [];
    const r = await descargar(f, 't', 'P_01', async (u8) => { partes.push(u8.slice()); }, { http: async () => new Response(trozos(respuestaPaquete(zip), n)) });
    assert.deepEqual([r.cod_estatus, r.bytes], [5000, zip.length]);
    assert.ok(Buffer.concat(partes).equals(Buffer.from(zip)), 'trozos de ' + n);
  }
  const vacio = await descargar(f, 't', 'P', async () => {}, { http: async () => new Response(trozos(respuestaPaquete(new Uint8Array(0), { cod: 5004 }), 50)) });
  assert.deepEqual([vacio.cod_estatus, vacio.bytes], [5004, 0]);
  await assert.rejects(descargar(f, 't', 'P', async () => {}, { http: async () => new Response(trozos(respuestaPaquete(zip, { corte: 900 }), 100)) }), (e) => e instanceof ErrorSat && e.transitorio && /se cortó/.test(e.message));
  await assert.rejects(descargar(f, 't', 'P', async () => {}, { http: async () => { throw new Error('reset'); } }), (e) => e.transitorio && /No se pudo conectar/.test(e.message));
});

test('paquetes en R2: escritura por partes, unión de varios ZIP y metadata en un solo texto', async () => {
  const DOCS = r2Local();
  const w = escritorR2(DOCS, 'grande.bin', {}, { parte: 1000 });
  const dato = randomBytes(5300);
  for (let i = 0; i < dato.length; i += 333) await w.escribir(new Uint8Array(dato.subarray(i, i + 333)));
  assert.deepEqual(await w.cerrar(), { key: 'grande.bin', size: 5300 });
  assert.equal(DOCS.multipartes, 1, 'se subió por partes');
  assert.ok(Buffer.from(DOCS.mapa.get('grande.bin')).equals(dato));

  const nombres = Object.keys(PAQUETE);
  const A = Object.fromEntries(nombres.slice(0, 5).map(k => [k, PAQUETE[k]])), B = Object.fromEntries(nombres.slice(4).map(k => [k, PAQUETE[k]])); // uno repetido
  await DOCS.put('a.zip', zipArchivos(A)); await DOCS.put('b.zip', zipArchivos(B));
  const u = await unirZips(DOCS, ['a.zip', 'b.zip'], 'todo.zip');
  assert.deepEqual([u.entradas, u.repetidas], [nombres.length, 1]);
  const zip = await abrirZip(fuenteBuffer(DOCS.mapa.get('todo.zip')));
  assert.deepEqual([...zip.entradas.keys()].sort(), nombres.slice().sort());
  const { inflateRawSync } = await import('node:zlib');
  for (const e of zip.entradas.values()) {
    const b = DOCS.mapa.get('todo.zip');
    const ini = e.local + 30 + (b[e.local + 26] | (b[e.local + 27] << 8)) + (b[e.local + 28] | (b[e.local + 29] << 8));
    assert.equal(inflateRawSync(b.subarray(ini, ini + e.comprimido)).toString(), PAQUETE[e.nombre], e.nombre);
  }
  await DOCS.put('no.zip', new Uint8Array([1, 2, 3]));
  await assert.rejects(unirZips(DOCS, ['a.zip', 'no.zip'], 'x.zip'), /no es un ZIP válido/);
  assert.equal(DOCS.mapa.has('x.zip'), false);

  const [cab, ...filas] = META.split('\n');
  await DOCS.put('m1.zip', zipArchivos({ 'ID_01.txt': [cab, ...filas.slice(0, 2)].join('\r\n') + '\r\n', 'ID_01_tercero.txt': 'Uuid~RfcACuentaTerceros~NombreACuentaTerceros\nX~Y~Z', 'otro.txt': 'no es metadata' }));
  await DOCS.put('m2.zip', zipArchivos({ 'ID_02.txt': '﻿' + [cab, ...filas.slice(2)].join('\n') }));
  const md = await metadataDePaquetes(DOCS, ['m1.zip', 'm2.zip']);
  assert.equal(md.renglones, filas.length);
  assert.equal(md.texto, META + '\n', 'un encabezado y todos los renglones, sin los de terceros');
});

// ── De punta a punta, con un SAT en memoria que verifica cada firma ──
function satSimulado({ paquetesXml, paquetesMeta, lento = 1 } = {}) {
  const pub = new X509Certificate(Buffer.from(cer)).publicKey;
  const s = { llamadas: [], solicitudes: new Map(), descargas: {}, fallar: null, estatusSolicitud: 5000, verificaciones: 0 };
  const sobre = (cuerpo) => '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>' + cuerpo + '</s:Body></s:Envelope>';
  const firmaValida = (xml, aDigerir) => {
    const si = /<SignedInfo>([\s\S]*?)<\/SignedInfo>/.exec(xml);
    if (!si) return false;
    if (createHash('sha1').update(aDigerir).digest('base64') !== val(xml, 'DigestValue')) return false;
    return createVerify('RSA-SHA1').update('<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">' + si[1] + '</SignedInfo>').verify(pub, val(xml, 'SignatureValue'), 'base64');
  };
  const sinFirma = (xml, nodo, hijo) => { const m = new RegExp('<des:' + hijo + ' ([^>]*)>').exec(xml); return '<des:' + nodo + ' xmlns:des="http://DescargaMasivaTerceros.sat.gob.mx"><des:' + hijo + ' ' + m[1] + '></des:' + hijo + '></des:' + nodo + '>'; };
  const attr = (xml, k) => (new RegExp(k + '="([^"]*)"').exec(xml) || [])[1];
  s.http = async (url, init) => {
    const xml = init.body, op = Object.keys(EXTREMOS).find(k => EXTREMOS[k] === url);
    s.llamadas.push(op);
    if (s.fallar && s.fallar(op)) return new Response('Service Unavailable', { status: 503 });
    const mal = new Response(sobre('<s:Fault><faultcode>a:InvalidSecurity</faultcode><faultstring>An error occurred when verifying security for the message.</faultstring></s:Fault>'), { status: 500 });
    if (op === 'autenticar') {
      const t = /<u:Timestamp u:Id="_0">([\s\S]*?)<\/u:Timestamp>/.exec(xml);
      if (!t || !firmaValida(xml, '<u:Timestamp xmlns:u="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd" u:Id="_0">' + t[1] + '</u:Timestamp>')) return mal;
      return new Response(sobre('<AutenticaResponse xmlns="http://DescargaMasivaTerceros.gob.mx"><AutenticaResult>TOKEN</AutenticaResult></AutenticaResponse>'));
    }
    if (init.headers.Authorization !== 'WRAP access_token="TOKEN"') return new Response('', { status: 401 });
    if (op === 'solicitar') {
      if (!firmaValida(xml, sinFirma(xml, 'SolicitaDescargaEmitidos', 'solicitud'))) return mal;
      const p = { tipo: attr(xml, 'TipoSolicitud'), ini: attr(xml, 'FechaInicial'), fin: attr(xml, 'FechaFinal'), tc: attr(xml, 'TipoComprobante'), emisor: attr(xml, 'RfcEmisor'), estado: attr(xml, 'EstadoComprobante') };
      const cod = typeof s.estatusSolicitud === 'function' ? s.estatusSolicitud(p) : s.estatusSolicitud;
      if (cod !== 5000) return new Response(sobre('<SolicitaDescargaEmitidosResponse xmlns="x"><SolicitaDescargaEmitidosResult CodEstatus="' + cod + '" Mensaje="No aceptada"/></SolicitaDescargaEmitidosResponse>'));
      const id = 'SOL-' + p.tipo + '-' + (s.solicitudes.size + 1);
      s.solicitudes.set(id, { ...p, vistas: 0 });
      return new Response(sobre('<SolicitaDescargaEmitidosResponse xmlns="x"><SolicitaDescargaEmitidosResult IdSolicitud="' + id + '" CodEstatus="5000" Mensaje="Solicitud Aceptada"/></SolicitaDescargaEmitidosResponse>'));
    }
    if (op === 'verificar') {
      if (!firmaValida(xml, sinFirma(xml, 'VerificaSolicitudDescarga', 'solicitud'))) return mal;
      const sol = s.solicitudes.get(attr(xml, 'IdSolicitud'));
      sol.vistas += 1; s.verificaciones += 1;
      const paqs = sol.tipo === 'CFDI' ? paquetesXml : paquetesMeta;
      const r = sol.vistas <= lento ? 'EstadoSolicitud="2" CodigoEstadoSolicitud="5000" NumeroCFDIs="0"' : !paqs.length ? 'EstadoSolicitud="5" CodigoEstadoSolicitud="5004" NumeroCFDIs="0"'
        : 'EstadoSolicitud="3" CodigoEstadoSolicitud="5000" NumeroCFDIs="' + (sol.tipo === 'CFDI' ? 8 : 5) + '"';
      const ids = sol.vistas > lento ? paqs.map((_, i) => '<IdsPaquetes>' + attr(xml, 'IdSolicitud') + '_0' + (i + 1) + '</IdsPaquetes>').join('') : '';
      return new Response(sobre('<VerificaSolicitudDescargaResponse xmlns="x"><VerificaSolicitudDescargaResult CodEstatus="5000" ' + r + ' Mensaje="Solicitud Aceptada">' + ids + '</VerificaSolicitudDescargaResult></VerificaSolicitudDescargaResponse>'));
    }
    if (!firmaValida(xml, sinFirma(xml, 'PeticionDescargaMasivaTercerosEntrada', 'peticionDescarga'))) return mal;
    const idp = attr(xml, 'IdPaquete'), [ids, n] = [idp.slice(0, -3), Number(idp.slice(-2))];
    s.descargas[idp] = (s.descargas[idp] || 0) + 1;
    const zip = (s.solicitudes.get(ids).tipo === 'CFDI' ? paquetesXml : paquetesMeta)[n - 1];
    if (s.cortar && s.cortar(idp, s.descargas[idp])) return new Response(trozos(respuestaPaquete(zip, { corte: 700 }), 200));
    return new Response(trozos(respuestaPaquete(zip), 777));
  };
  return s;
}

function paquetesDePrueba() {
  const nombres = Object.keys(PAQUETE);
  const [cab, ...filas] = META.split('\n');
  return { paquetesXml: [zipArchivos(Object.fromEntries(nombres.slice(0, 5).map(k => [k, PAQUETE[k]]))), zipArchivos(Object.fromEntries(nombres.slice(5).map(k => [k, PAQUETE[k]])))],
    paquetesMeta: [zipArchivos({ 'M_01.txt': [cab, ...filas].join('\n') + '\n' })] };
}

async function preparar(opciones = {}) {
  const db = baseDatos();
  const DOCS = r2Local();
  const sat = satSimulado({ ...paquetesDePrueba(), ...opciones });
  const reloj = { t: HOY };
  const env = { DB: db, DOCS, SAT_LLAVE_MAESTRA: SECRETO, SAT_FETCH: sat.http, SAT_AHORA: () => reloj.t };
  db.raw.exec("INSERT INTO empresas (id, nombre, slug, rfc) VALUES (1, 'PRIMEWIRELESS', 'prime', 'PHO190128QD8'), (2, 'OTRA', 'otra', 'EKU9003173C9')");
  db.raw.exec("INSERT INTO usuarios (id, email, password_hash, nombre, rol, empresa_id, perfil) VALUES (2,'rev@hrm','x','Revisor','admin',NULL,NULL), (3,'ana@prime','x','Ana','socio',1,NULL), (5,'carga@prime','x','Carga PRIME','socio',1,'carga')");
  db.raw.exec("INSERT INTO encargo (id, empresa_id, nivel, periodo_desde, periodo_hasta, ejercicio, origen_nomina, aplica_ajuste_mensual) VALUES ('enc_c', 1, 'B5+', '2026-08-01', '2026-08-31', 2026, 'cliente', 0)");
  for (const c of CAL) db.raw.prepare("INSERT INTO calendario_nomina (encargo_id, corrida_id, periodicidad, desde, hasta, fecha_pago, ordinaria, fuente) VALUES ('enc_c',?,?,?,?,?,?,'prueba')")
    .run(c.corrida_id, c.periodicidad, c.desde, c.hasta, c.fecha_pago, c.ordinaria ? 1 : 0);
  db.raw.exec("INSERT INTO registro_patronal (empresa_id, registro, entidad, fuente) VALUES (1, 'Y6079749104', 'CDMX', 'prueba')");
  const cred = () => guardarCredencial(env, { empresa_id: 1, cer, key, contrasena: CONTRASENA, usuario_id: 2 });
  // Corre la cola como lo haría la tarea programada, adelantando el reloj hasta la siguiente acción.
  const correr = async (max = 60) => {
    for (let i = 0; i < max; i++) {
      const r = await avanzarSat(env);
      if (r.estado === 'sin_trabajo') {
        const sig = db.raw.prepare("SELECT min(proxima_accion) AS p FROM sat_solicitud WHERE estado IN ('pendiente','solicitada','lista','descargada')").get().p;
        if (!sig) return;
        reloj.t = Date.parse(sig) + 1000;
      }
      await avanzarCfdi(env, { presupuesto_ms: 5000 });
    }
  };
  return { db, DOCS, env, sat, reloj, cred, correr };
}
const estados = (db) => Object.fromEntries(db.raw.prepare('SELECT tipo, estado FROM sat_solicitud ORDER BY creado_en, tipo').all().map(x => [x.tipo, x.estado]));

test('e.firma: se valida, se guarda cifrada y nunca sale por la API', async () => {
  const { db, env, cred } = await preparar();
  assert.equal((await estadoCredencial(env, 1)).credencial, null);
  await assert.rejects(guardarCredencial(env, { empresa_id: 1, cer, key, contrasena: 'mala', usuario_id: 2 }), /contraseña/);
  await assert.rejects(guardarCredencial({ ...env, SAT_LLAVE_MAESTRA: undefined }, { empresa_id: 1, cer, key, contrasena: CONTRASENA }), /SAT_LLAVE_MAESTRA/);
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM sat_credencial').get().n, 0);
  const r = await cred();
  assert.equal(r.credencial.rfc, 'EKU9003173C9');
  assert.equal(r.credencial.serie, '30001000000500003415');
  assert.equal(r.credencial.vencida, false);
  assert.match(r.avisos.join(' '), /no es el registrado para la empresa \(PHO190128QD8\)/);
  assert.deepEqual(Object.keys(r.credencial).filter(k => /llave|iv|certificado/.test(k)), [], 'el estado no incluye la llave');
  const fila = db.raw.prepare('SELECT * FROM sat_credencial').get();
  const claro = Buffer.from(await abrirLlave(key, CONTRASENA)).toString('base64');
  assert.ok(!JSON.stringify(fila).includes(claro.slice(0, 60)) && !JSON.stringify(fila).includes(CONTRASENA), 'ni la llave en claro ni la contraseña están en la base');
  assert.equal(db.raw.prepare("SELECT accion FROM sat_bitacora").get().accion, 'efirma_cargada');
  assert.throws(() => db.raw.exec('DELETE FROM sat_bitacora'), /no se borra/);
  assert.throws(() => db.raw.exec("UPDATE sat_bitacora SET detalle = 'x'"), /no se modifica/);
});

test('de punta a punta: pide metadata y XML, espera al SAT, baja y une los paquetes, y el cruce nómina ↔ CFDI corre igual que con un ZIP subido a mano', async () => {
  const { db, DOCS, env, sat, cred, correr } = await preparar();
  await cred();
  await DOCS.put('p.xlsx', archivosPrueba().prenomina);
  const pre = await crearIngesta(env, { encargo_id: 'enc_c', r2_key: 'p.xlsx' });
  for (let i = 0; i < 20 && (await avanzar(env, { ingesta_id: pre })).estado !== 'terminado'; i++);

  const r = await crearSolicitudes(env, { encargo_id: 'enc_c', usuario_id: 2 });
  assert.deepEqual([r.desde, r.hasta, r.solicitudes.length], ['2026-07-25T00:00:00', '2026-09-15T23:59:59', 2], 'periodo del encargo con margen: 7 días antes y 15 después');
  await assert.rejects(crearSolicitudes(env, { encargo_id: 'enc_c' }), /Ya hay una descarga en curso/);
  await correr();
  assert.deepEqual(estados(db), { metadata: 'entregada', xml: 'entregada' });

  // Lo que se pidió al SAT: emitidos de nómina, vigentes y cancelados, con el RFC de la e.firma.
  assert.deepEqual([...sat.solicitudes.values()].map(x => [x.tipo, x.ini, x.fin, x.tc, x.emisor, x.estado]).sort(),
    [['CFDI', '2026-07-25T00:00:00', '2026-09-15T23:59:59', 'N', 'EKU9003173C9', 'Todos'], ['Metadata', '2026-07-25T00:00:00', '2026-09-15T23:59:59', 'N', 'EKU9003173C9', 'Todos']]);
  assert.deepEqual(Object.values(sat.descargas), [1, 1, 1], 'cada paquete se baja una sola vez');
  assert.equal(sat.verificaciones, 4, 'una vez «en proceso» y otra terminada, por solicitud');

  // Paquetes originales en R2 con su huella, y bitácora de cada uso de la e.firma.
  const paqs = db.raw.prepare("SELECT s.tipo, p.n, p.r2_key, p.tamano, p.sha256, p.descargas FROM sat_paquete p JOIN sat_solicitud s ON s.id = p.solicitud_id ORDER BY s.tipo, p.n").all();
  assert.equal(paqs.length, 3);
  for (const p of paqs) {
    assert.equal(p.sha256, createHash('sha256').update(DOCS.mapa.get(p.r2_key)).digest('hex'));
    assert.equal(DOCS.meta.get(p.r2_key).encargo_id, 'enc_c');
  }
  assert.deepEqual(db.raw.prepare('SELECT accion, count(*) AS n FROM sat_bitacora GROUP BY accion ORDER BY accion').all().map(x => [x.accion, x.n]),
    [['descarga', 3], ['efirma_cargada', 1], ['entrega', 2], ['solicitud', 2]]);

  // La ingesta de comprobantes recibió un .txt y un solo ZIP; el cruce da lo mismo que la prueba de cfdi.test.js.
  const ings = db.raw.prepare('SELECT id, tipo, archivo_nombre, estado, r2_key FROM ingesta_cfdi ORDER BY tipo').all();
  assert.deepEqual(ings.map(i => [i.tipo, i.archivo_nombre, i.estado]), [['metadata_sat', 'SAT_EKU9003173C9_metadata_2026-07-25_a_2026-09-15.txt', 'terminado'], ['xml_nomina', 'SAT_EKU9003173C9_nomina_2026-07-25_a_2026-09-15.zip', 'terminado']]);
  assert.ok(ings.every(i => i.r2_key.startsWith('encargos/enc_c/cfdi/')));
  assert.ok(paqs.every(p => p.r2_key.startsWith('encargos/enc_c/cfdi/sat/')), 'los paquetes originales quedan en el expediente del encargo');
  assert.equal(ings[0].r2_key.includes('/cfdi/sat/'), false);
  const rep = (await estadoIngestaCfdi(db, ings[1].id)).reporte;
  assert.deepEqual([rep.xml, rep.otros_archivos, rep.validos, rep.invalidos, rep.duplicados, rep.cancelados, rep.sin_estado_sat], [8, 1, 4, 1, 1, 1, 0]);
  assert.equal(rep.cruce.coincidencias, 2);
  assert.deepEqual(rep.cruce.por_tipo, { diferencia: 2, sin_cfdi: 1, sin_nomina: 1 });

  const lista = await listarSolicitudes(db, 'enc_c');
  assert.deepEqual(lista.map(x => [x.tipo, x.paquetes, x.paquetes_descargados, x.numero_cfdis]).sort(), [['metadata', 1, 1, 5], ['xml', 2, 2, 8]]);
  assert.ok(lista.every(x => !('llave_cifrada' in x)));
  // Una solicitud enviada no cambia de periodo.
  assert.throws(() => db.raw.exec("UPDATE sat_solicitud SET fecha_inicial = '2020-01-01T00:00:00'"), /ya enviada al SAT no cambia/);
});

test('el SAT falla o tarda: reintenta con espera, no gasta descargas y deja el motivo', async () => {
  const { db, env, sat, reloj, cred, correr } = await preparar({ lento: 3 });
  await cred();
  // Sin XML: sólo metadata. El SAT está caído al pedir.
  sat.fallar = (op) => op === 'solicitar';
  const { solicitudes: [id] } = await crearSolicitudes(env, { encargo_id: 'enc_c', tipos: ['metadata'], usuario_id: 2 });
  let r = await avanzarSat(env, { solicitud_id: id });
  assert.equal(r.estado, 'pendiente');
  assert.match(r.error, /503/);
  let s = db.raw.prepare('SELECT * FROM sat_solicitud WHERE id = ?').get(id);
  assert.equal(s.intentos, 1);
  assert.ok(Date.parse(s.proxima_accion) > reloj.t, 'se reintenta más tarde');
  assert.equal((await avanzarSat(env, { solicitud_id: id })).espera_hasta, s.proxima_accion, 'antes de tiempo no se llama al SAT');
  sat.fallar = null;
  await correr();
  s = db.raw.prepare('SELECT * FROM sat_solicitud WHERE id = ?').get(id);
  assert.deepEqual([s.estado, s.verificaciones, s.intentos, s.error], ['entregada', 4, 0, null]);
  assert.deepEqual([esperaVerificacion(0), esperaVerificacion(10), esperaVerificacion(30), esperaVerificacion(100)].map(x => x / 60000), [2, 5, 15, 30]);

  // Un paquete que se corta a media descarga: no queda nada a medias en R2 y la segunda vez entra.
  const b = await preparar();
  await b.cred();
  b.sat.cortar = (idp, vez) => vez === 1;
  await crearSolicitudes(b.env, { encargo_id: 'enc_c', tipos: ['xml'], usuario_id: 2 });
  await b.correr();
  assert.deepEqual(estados(b.db), { xml: 'entregada' });
  assert.deepEqual(b.db.raw.prepare('SELECT n, descargas FROM sat_paquete ORDER BY n').all().map(p => [p.n, p.descargas]), [[1, 2], [2, 2]]);
  assert.equal([...b.DOCS.mapa.keys()].filter(k => k.includes('/cfdi/sat/')).length, 2);

  // Si se corta siempre, se detiene al llegar al límite de descargas en lugar de insistir.
  const c = await preparar();
  await c.cred();
  c.sat.cortar = () => true;
  const { solicitudes: [idc] } = await crearSolicitudes(c.env, { encargo_id: 'enc_c', tipos: ['xml'], usuario_id: 2 });
  await c.correr();
  const sc = c.db.raw.prepare('SELECT estado, error FROM sat_solicitud WHERE id = ?').get(idc);
  assert.equal(sc.estado, 'error');
  assert.match(sc.error, /ya se pidió 2 veces/);
  assert.ok(Object.values(c.sat.descargas).every(n => n <= 2));
  c.sat.cortar = null;
  assert.equal(await reintentarSat(c.env, idc), 'lista');
  await c.correr();
  assert.deepEqual(estados(c.db), { xml: 'entregada' });
});

test('respuestas del SAT que no son paquetes: sin comprobantes, rechazo, periodo agotado y firma inválida', async () => {
  const a = await preparar({ paquetesXml: [], paquetesMeta: [] });
  await a.cred();
  await crearSolicitudes(a.env, { encargo_id: 'enc_c', usuario_id: 2 });
  await a.correr();
  assert.deepEqual(estados(a.db), { metadata: 'sin_datos', xml: 'sin_datos' });
  assert.equal(a.db.raw.prepare('SELECT count(*) AS n FROM ingesta_cfdi').get().n, 0);

  // 5002 (periodo agotado): se corre un segundo el inicio y entra.
  const b = await preparar();
  await b.cred();
  b.sat.estatusSolicitud = (p) => (p.ini.endsWith(':00') ? 5002 : 5000);
  const { solicitudes: [id] } = await crearSolicitudes(b.env, { encargo_id: 'enc_c', tipos: ['xml'], usuario_id: 2 });
  await b.correr();
  const s = b.db.raw.prepare('SELECT estado, fecha_inicial FROM sat_solicitud WHERE id = ?').get(id);
  assert.deepEqual([s.estado, s.fecha_inicial], ['entregada', '2026-07-25T00:00:01']);
  // Y la siguiente vez que se pide el mismo periodo ya sale corrido, sin gastar otra solicitud idéntica.
  const otra = await crearSolicitudes(b.env, { encargo_id: 'enc_c', tipos: ['xml'], usuario_id: 2 });
  assert.equal(b.db.raw.prepare('SELECT fecha_inicial FROM sat_solicitud WHERE id = ?').get(otra.solicitudes[0]).fecha_inicial, '2026-07-25T00:00:01');

  const c = await preparar();
  await c.cred();
  c.sat.estatusSolicitud = 5001;
  const { solicitudes: [idc] } = await crearSolicitudes(c.env, { encargo_id: 'enc_c', tipos: ['metadata'], usuario_id: 2 });
  await c.correr();
  const sc = c.db.raw.prepare('SELECT estado, error FROM sat_solicitud WHERE id = ?').get(idc);
  assert.equal(sc.estado, 'rechazada');
  assert.match(sc.error, /Tercero no autorizado \(5001\)/);
  assert.equal(await reintentarSat(c.env, idc), false, 'una rechazada no se reintenta: se pide de nuevo');

  // Una e.firma que el SAT no reconoce: error definitivo, no se insiste.
  const d = await preparar();
  await d.cred();
  const otro = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pk = new Uint8Array(otro.privateKey.export({ type: 'pkcs8', format: 'der' }));
  const mal = await cifrarLlave(SECRETO, pk, { empresa_id: 1, rfc: 'EKU9003173C9' });
  d.db.raw.prepare('UPDATE sat_credencial SET llave_cifrada = ?, iv = ?').run(mal.llave_cifrada, mal.iv);
  const { solicitudes: [idd] } = await crearSolicitudes(d.env, { encargo_id: 'enc_c', tipos: ['metadata'], usuario_id: 2 });
  const rd = await avanzarSat(d.env, { solicitud_id: idd });
  assert.equal(rd.estado, 'error');
  assert.match(rd.error, /rechazó la petición \(autenticar\)/);
  assert.deepEqual(d.sat.llamadas, ['autenticar']);
});

test('reglas de las solicitudes: periodo, encargo cerrado, sin e.firma, hora de México', async () => {
  const { db, env, cred, reloj } = await preparar();
  await assert.rejects(crearSolicitudes(env, { encargo_id: 'enc_c' }), /no tiene e\.firma/);
  await cred();
  await assert.rejects(crearSolicitudes(env, { encargo_id: 'no' }), /Encargo no existe/);
  await assert.rejects(crearSolicitudes(env, { encargo_id: 'enc_c', tipos: ['pdf'] }), /tipos/);
  await assert.rejects(crearSolicitudes(env, { encargo_id: 'enc_c', desde: '2026-13-40' }), /desde/);
  await assert.rejects(crearSolicitudes(env, { encargo_id: 'enc_c', desde: '2026-09-01', hasta: '2026-08-01' }), /al revés/);
  await assert.rejects(crearSolicitudes(env, { encargo_id: 'enc_c', desde: '2024-01-01' }), /máximo un año/);
  const r = await crearSolicitudes(env, { encargo_id: 'enc_c', tipos: ['metadata'], desde: '2026-08-01', hasta: '2026-08-31' });
  assert.deepEqual([r.desde, r.hasta], ['2026-08-01T00:00:00', '2026-08-31T23:59:59']);
  db.raw.exec("UPDATE encargo SET estado = 'cerrado'");
  await assert.rejects(crearSolicitudes(env, { encargo_id: 'enc_c', tipos: ['xml'] }), /cerrado/);
  // Un encargo del mes en curso no pide fechas futuras: el tope es la hora del centro de México.
  assert.equal(horaMexico(Date.parse('2026-11-12T03:30:00Z')), '2026-11-11T21:30:00');
  assert.deepEqual(rangoDeEncargo({ periodo_desde: '2026-11-01', periodo_hasta: '2026-11-30' }, reloj.t), { desde: '2026-10-25T00:00:00', hasta: '2026-11-12T09:50:00' });
  db.raw.exec("UPDATE sat_credencial SET vigente_hasta = '2026-01-01T00:00:00Z'; UPDATE encargo SET estado = 'abierto'");
  await assert.rejects(crearSolicitudes(env, { encargo_id: 'enc_c', tipos: ['xml'] }), /venció/);
});

test('API: sólo HRM; el perfil carga y el socio no ven ni usan la e.firma', async () => {
  const { db, env, sat } = await preparar();
  const sesiones = new Map([['t_carga', { id: 5, rol: 'socio', perfil: 'carga', empresa_id: 1 }], ['t_socio', { id: 3, rol: 'socio', perfil: null, empresa_id: 1 }], ['t_admin', { id: 2, nombre: 'Revisor', rol: 'admin' }]]);
  env.SESSIONS = { get: async (t) => sesiones.has(t) ? JSON.stringify(sesiones.get(t)) : null, put: async () => {}, delete: async () => {} };
  const pendientes = [];
  const pedir = async (tk, m, ruta, cuerpo) => {
    const init = { method: m, headers: { Authorization: 'Bearer ' + tk } };
    if (cuerpo instanceof FormData) init.body = cuerpo;
    else if (cuerpo) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(cuerpo); }
    const r = await worker.fetch(new Request('https://clientes-hrm.com' + ruta, init), env, { waitUntil(p) { pendientes.push(p); } });
    return { status: r.status, j: await r.json().catch(() => null) };
  };
  assert.deepEqual(Object.keys(PERMISOS_CARGA).filter(k => k.includes('/sat/')), [], 'ninguna ruta del SAT está en la lista blanca del perfil carga');
  for (const tk of ['t_carga', 't_socio']) {
    assert.equal((await pedir(tk, 'GET', '/api/kernel/sat/credencial?empresa_id=1')).status, 403);
    assert.equal((await pedir(tk, 'POST', '/api/kernel/sat/solicitudes', { encargo_id: 'enc_c' })).status, 403);
    assert.equal((await pedir(tk, 'GET', '/api/kernel/sat/solicitudes?encargo_id=enc_c')).status, 403);
  }
  assert.equal((await pedir('nadie', 'GET', '/api/kernel/sat/credencial?empresa_id=1')).status, 401);

  const fd = (pwd) => { const f = new FormData(); f.append('empresa_id', '1'); f.append('cer', new File([cer], 'e.cer')); f.append('key', new File([key], 'e.key')); f.append('contrasena', pwd); return f; };
  const mala = await pedir('t_admin', 'POST', '/api/kernel/sat/credencial', fd('nope'));
  assert.deepEqual([mala.status, /contraseña/.test(mala.j.error)], [400, true]);
  const ok = await pedir('t_admin', 'POST', '/api/kernel/sat/credencial', fd(CONTRASENA));
  assert.equal(ok.status, 201);
  const est = await pedir('t_admin', 'GET', '/api/kernel/sat/credencial?empresa_id=1');
  assert.equal(est.j.credencial.rfc, 'EKU9003173C9');
  assert.ok(!/llave_cifrada|certificado_b64|"iv"/.test(JSON.stringify(est.j)));
  assert.equal((await pedir('t_admin', 'POST', '/api/kernel/sat/probar', { empresa_id: 1 })).j.rfc, 'EKU9003173C9');

  const s = await pedir('t_admin', 'POST', '/api/kernel/sat/solicitudes', { encargo_id: 'enc_c', tipos: ['metadata'] });
  assert.equal(s.status, 201);
  await Promise.all(pendientes);
  const l = await pedir('t_admin', 'GET', '/api/kernel/sat/solicitudes?encargo_id=enc_c');
  assert.deepEqual(l.j.solicitudes.map(x => [x.tipo, x.estado, x.id_solicitud_sat]), [['metadata', 'solicitada', 'SOL-Metadata-1']]);
  assert.equal((await pedir('t_admin', 'POST', '/api/kernel/sat/reintentar', { id: s.j.solicitudes[0] })).status, 400);
  assert.equal((await pedir('t_admin', 'POST', '/api/kernel/sat/avanzar', { id: s.j.solicitudes[0] })).j.estado, 'solicitada');
  const bit = await pedir('t_admin', 'GET', '/api/kernel/sat/bitacora?empresa_id=1');
  assert.deepEqual(bit.j.bitacora.map(b => [b.accion, b.usuario]).reverse(), [['efirma_cargada', 'Revisor'], ['prueba_conexion', 'Revisor'], ['solicitud', 'Revisor']]);
  assert.equal((await pedir('t_admin', 'GET', '/api/kernel/sat/nada')).status, 404);

  // Borrar la e.firma detiene lo que estaba en curso.
  const borrar = await pedir('t_admin', 'POST', '/api/kernel/sat/credencial/borrar', { empresa_id: 1 });
  assert.deepEqual([borrar.j.borrada, borrar.j.solicitudes_detenidas], [true, 1]);
  const fin = await avanzarSat(env, { solicitud_id: s.j.solicitudes[0], forzar: true });
  assert.deepEqual([fin.estado, /no tiene e\.firma/.test(fin.error)], ['error', true]);
  assert.ok(sat.llamadas.length > 0);
});

test('la página de auditoría trae la tarjeta del SAT sólo para HRM y su JavaScript es válido', async () => {
  const { paginaKernel } = await import('../../paginas/kernel.js');
  const vm = await import('node:vm');
  const h = paginaKernel({ CSS: '', LOGO: '', AUTH_ADMIN: 'var tk="x",U={rol:"admin"};', LOGOUT_FN: 'function logout(){}' });
  const html = typeof h === 'string' ? h : await h.text();
  assert.match(html, /<div class="k-card solo-admin" id="cardSat">/);
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
  assert.match(html, /function cargarSat\(\)\{\s*if\(CARGA\)return;/);
});
