-- 0020 — Descarga directa del SAT (Web Service de Descarga Masiva v1.5), 12-nov-2026.
--
-- El portal pide al SAT los CFDI de nómina emitidos por el cliente y su metadata (vigentes y cancelados), los
-- guarda en R2 y los entrega a la ingesta que ya existe (ingesta_cfdi): sustituye bajar los XML en One Facture y
-- subirlos a mano. Decisión de Claudio, 12-nov-2026: conexión directa con la e.firma del cliente guardada cifrada.
--
-- Lo que la base hace cumplir:
--   · Una e.firma por empresa. La llave privada sólo está cifrada (AES-256-GCM); la llave de cifrado es un
--     secreto del Worker (SAT_LLAVE_MAESTRA), no está en D1. La contraseña del .key no se guarda.
--   · Cada uso de la e.firma queda en la bitácora, que no se modifica ni se borra.
--   · Una solicitud ya enviada al SAT no cambia de periodo, tipo ni RFC.
-- Aditiva: no toca tablas existentes.
-- Aplicar:  wrangler d1 execute hrm-nomina-portal --remote --file=migrations/0020_sat_descarga.sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sat_credencial (
  empresa_id       INTEGER PRIMARY KEY REFERENCES empresas(id),
  rfc              TEXT NOT NULL,
  titular          TEXT,
  serie            TEXT NOT NULL,                 -- número de serie del certificado (el de 20 dígitos del SAT cuando viene así)
  vigente_desde    TEXT,
  vigente_hasta    TEXT NOT NULL,
  certificado_b64  TEXT NOT NULL,                 -- el .cer (público)
  huella_cert      TEXT NOT NULL,                 -- SHA-256 del .cer
  llave_cifrada    TEXT NOT NULL,                 -- PKCS#8 cifrado con AES-256-GCM, en base64
  iv               TEXT NOT NULL,
  subida_por       INTEGER REFERENCES usuarios(id),
  subida_en        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sat_solicitud (
  id                 TEXT PRIMARY KEY,
  empresa_id         INTEGER NOT NULL REFERENCES empresas(id),
  encargo_id         TEXT NOT NULL REFERENCES encargo(id),
  lote_id            TEXT NOT NULL,               -- la metadata y los XML pedidos juntos comparten lote
  tipo               TEXT NOT NULL CHECK (tipo IN ('metadata','xml')),
  rfc                TEXT NOT NULL,
  fecha_inicial      TEXT NOT NULL,               -- AAAA-MM-DDTHH:MM:SS, fecha de emisión del comprobante
  fecha_final        TEXT NOT NULL,
  tipo_comprobante   TEXT NOT NULL DEFAULT 'N',
  -- pendiente: por enviar · solicitada: el SAT la está armando · lista: hay paquetes por bajar ·
  -- descargada: paquetes en R2 · entregada: ya está en la ingesta de comprobantes · sin_datos: el SAT no encontró nada
  estado             TEXT NOT NULL DEFAULT 'pendiente'
                     CHECK (estado IN ('pendiente','solicitada','lista','descargada','entregada','sin_datos','rechazada','vencida','error')),
  id_solicitud_sat   TEXT,
  cod_estatus        INTEGER,
  mensaje            TEXT,
  estado_sat         INTEGER,                     -- EstadoSolicitud: 1 aceptada, 2 en proceso, 3 terminada, 4 error, 5 rechazada, 6 vencida
  codigo_estado_sat  INTEGER,
  numero_cfdis       INTEGER,
  verificaciones     INTEGER NOT NULL DEFAULT 0,
  solicitada_en      TEXT,
  lista_en           TEXT,
  proxima_accion     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  r2_key             TEXT,                        -- lo que se entregó a la ingesta
  ingesta_cfdi_id    TEXT REFERENCES ingesta_cfdi(id),
  error              TEXT,
  intentos           INTEGER NOT NULL DEFAULT 0,  -- fallos seguidos del paso actual
  tomado_hasta       TEXT,
  creado_por         INTEGER REFERENCES usuarios(id),
  creado_en          TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sat_solicitud_cola ON sat_solicitud (estado, proxima_accion);
CREATE INDEX IF NOT EXISTS idx_sat_solicitud_encargo ON sat_solicitud (encargo_id, creado_en);
CREATE TRIGGER IF NOT EXISTS sat_solicitud_enviada_fija BEFORE UPDATE ON sat_solicitud
WHEN OLD.id_solicitud_sat IS NOT NULL AND (NEW.fecha_inicial <> OLD.fecha_inicial OR NEW.fecha_final <> OLD.fecha_final OR NEW.tipo <> OLD.tipo
  OR NEW.rfc <> OLD.rfc OR NEW.encargo_id <> OLD.encargo_id OR NEW.id_solicitud_sat IS NOT OLD.id_solicitud_sat)
BEGIN SELECT RAISE(ABORT, 'Una solicitud ya enviada al SAT no cambia: se hace otra'); END;

CREATE TABLE IF NOT EXISTS sat_paquete (
  solicitud_id   TEXT NOT NULL REFERENCES sat_solicitud(id),
  id_paquete     TEXT NOT NULL,
  n              INTEGER NOT NULL,
  estado         TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','descargado')),
  r2_key         TEXT,
  tamano         INTEGER,
  sha256         TEXT,
  descargas      INTEGER NOT NULL DEFAULT 0,      -- el SAT entrega cada paquete un número limitado de veces
  descargado_en  TEXT,
  PRIMARY KEY (solicitud_id, id_paquete)
);

-- Bitácora de la e.firma: quién la cargó o borró y cada vez que se usó ante el SAT.
CREATE TABLE IF NOT EXISTS sat_bitacora (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id  INTEGER NOT NULL REFERENCES empresas(id),
  accion      TEXT NOT NULL CHECK (accion IN ('efirma_cargada','efirma_borrada','prueba_conexion','solicitud','descarga','entrega')),
  detalle     TEXT,
  usuario_id  INTEGER REFERENCES usuarios(id),    -- NULL: lo hizo la tarea programada
  en          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sat_bitacora ON sat_bitacora (empresa_id, id);
CREATE TRIGGER IF NOT EXISTS sat_bitacora_fija_u BEFORE UPDATE ON sat_bitacora
BEGIN SELECT RAISE(ABORT, 'La bitácora de la e.firma no se modifica'); END;
CREATE TRIGGER IF NOT EXISTS sat_bitacora_fija_d BEFORE DELETE ON sat_bitacora
BEGIN SELECT RAISE(ABORT, 'La bitácora de la e.firma no se borra'); END;
