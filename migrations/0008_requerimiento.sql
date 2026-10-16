-- 0008_requerimiento.sql — Requerimiento de información (módulo 23) y seguimiento con el cliente (módulos 25 y 27).
-- Aplicar:  wrangler d1 execute hrm-nomina-portal --remote --file=migrations/0008_requerimiento.sql
--
-- La lista se deriva de la matriz regla ↔ fuente (T3): lo que pide el sistema es lo que sus reglas necesitan.
-- Una limitación al alcance nombra el documento, el responsable y la fecha en que se pidió: viven aquí.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS requerimiento (
  encargo_id        TEXT NOT NULL REFERENCES encargo(id),
  fuente_clave      TEXT NOT NULL REFERENCES fuente(clave),
  esencial          INTEGER NOT NULL DEFAULT 0 CHECK (esencial IN (0,1)),   -- sin ella no hay opinión (D13)
  obligatoria       INTEGER NOT NULL DEFAULT 0 CHECK (obligatoria IN (0,1)),
  responsable       TEXT,                                                    -- quién la entrega del lado del cliente
  solicitado_en     TEXT NOT NULL,
  fecha_compromiso  TEXT,
  estado            TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','entregada','completa','incompleta','no_aplica')),
  nota              TEXT,
  actualizado_en    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (encargo_id, fuente_clave)
);

CREATE TABLE IF NOT EXISTS requerimiento_archivo (
  id                 TEXT PRIMARY KEY,
  encargo_id         TEXT NOT NULL REFERENCES encargo(id),
  fuente_clave       TEXT NOT NULL REFERENCES fuente(clave),
  r2_key             TEXT NOT NULL,
  nombre             TEXT NOT NULL,
  tamano             INTEGER,
  subido_por         INTEGER REFERENCES usuarios(id),
  subido_en          TEXT NOT NULL DEFAULT (datetime('now')),
  revision           TEXT CHECK (revision IN ('aceptado','rechazado')),
  nota_revision      TEXT,
  revisado_por       INTEGER REFERENCES usuarios(id),
  revisado_en        TEXT,
  ingesta_id         TEXT,                                                   -- ingesta (prenómina o CFDI) que lo procesó
  CHECK (revision IS NULL OR revisado_por IS NOT NULL),
  CHECK (revision IS NOT 'rechazado' OR nota_revision IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_req_archivo ON requerimiento_archivo (encargo_id, fuente_clave);
CREATE TRIGGER IF NOT EXISTS req_archivo_no_se_borra BEFORE DELETE ON requerimiento_archivo
BEGIN SELECT RAISE(ABORT, 'Lo que entregó el cliente no se borra: se rechaza con motivo'); END;
