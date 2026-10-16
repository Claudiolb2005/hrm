-- 0007_cfdi_nomina.sql — XML de nómina (B3), estado ante el SAT y cruce nómina ↔ CFDI (módulo 4.2; D5, D13).
-- Aplicar:  wrangler d1 execute hrm-nomina-portal --remote --file=migrations/0007_cfdi_nomina.sql
--
-- Lo que la base hace cumplir:
--   · El comprobante y el cruce son sólo-agregar: los importes no cambian después de leídos.
--   · Un cruce clasificado como «explicada» o «criterio sin resolver» lleva motivo; el criterio, su id.
--   · Un hallazgo sólo agrupa cruces clasificados como «proceso actual mal», del mismo encargo.
PRAGMA foreign_keys = ON;

-- El RFC del renglón viaja con el movimiento: el cruce puede ir por número de empleado o por RFC.
ALTER TABLE movimiento_nomina ADD COLUMN rfc TEXT;

-- ── Cola de ingesta de comprobantes: ZIP de XML o metadata del SAT ──
CREATE TABLE IF NOT EXISTS ingesta_cfdi (
  id                    TEXT PRIMARY KEY,
  encargo_id            TEXT NOT NULL REFERENCES encargo(id),
  tipo                  TEXT NOT NULL CHECK (tipo IN ('xml_nomina','metadata_sat')),
  r2_key                TEXT NOT NULL,
  archivo_nombre        TEXT,
  archivo_sha256        TEXT,
  tamano                INTEGER,
  llave                 TEXT NOT NULL DEFAULT 'num_empleado' CHECK (llave IN ('num_empleado','rfc')),
  estado                TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','leyendo','cruzando','terminado','error')),
  lotes_total           INTEGER,
  lotes_hechos          INTEGER NOT NULL DEFAULT 0,
  entradas              INTEGER,
  prenomina_ingesta_id  TEXT REFERENCES ingesta(id),
  ejecucion_id          TEXT REFERENCES ejecucion(id),
  corte_actual          TEXT,                         -- último cruce corrido: lo vigente del cruce
  reporte_json          TEXT CHECK (reporte_json IS NULL OR json_valid(reporte_json)),
  error                 TEXT,
  intentos              INTEGER NOT NULL DEFAULT 0,
  tomado_hasta          TEXT,
  creado_por            INTEGER REFERENCES usuarios(id),
  creado_en             TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ingesta_cfdi_estado ON ingesta_cfdi (estado, actualizado_en);
CREATE TABLE IF NOT EXISTS ingesta_cfdi_lote (
  ingesta_id  TEXT NOT NULL REFERENCES ingesta_cfdi(id),
  n           INTEGER NOT NULL,
  desde       INTEGER NOT NULL,
  hasta       INTEGER NOT NULL,
  estado      TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','hecho')),
  PRIMARY KEY (ingesta_id, n)
);

-- ── Comprobante de nómina tal como viene en el XML ──
CREATE TABLE IF NOT EXISTS comprobante (
  ingesta_id           TEXT NOT NULL REFERENCES ingesta_cfdi(id),
  archivo              TEXT NOT NULL,                 -- entrada del ZIP
  encargo_id           TEXT NOT NULL REFERENCES encargo(id),
  uuid                 TEXT,
  colaborador_llave    TEXT,
  corrida_id           TEXT,
  motivo_sin_corrida   TEXT,
  tipo_nomina          TEXT,
  periodicidad_pago    TEXT,
  fecha_pago           TEXT,
  fecha_final_pago     TEXT,
  registro_patronal    TEXT,
  rfc_receptor         TEXT,
  num_empleado         TEXT,
  total_percepciones_c INTEGER,
  isr_retenido_c       INTEGER,
  total_c              INTEGER,
  n_errores            INTEGER NOT NULL DEFAULT 0,
  datos_json           TEXT NOT NULL CHECK (json_valid(datos_json)),
  PRIMARY KEY (ingesta_id, archivo)
);
CREATE INDEX IF NOT EXISTS idx_comprobante_uuid ON comprobante (encargo_id, uuid);
CREATE INDEX IF NOT EXISTS idx_comprobante_llave ON comprobante (ingesta_id, colaborador_llave, corrida_id);
CREATE TRIGGER IF NOT EXISTS comprobante_inmutable_u BEFORE UPDATE ON comprobante
BEGIN SELECT RAISE(ABORT, 'El comprobante leído no cambia'); END;
CREATE TRIGGER IF NOT EXISTS comprobante_inmutable_d BEFORE DELETE ON comprobante
BEGIN SELECT RAISE(ABORT, 'El comprobante leído no se borra'); END;

-- Estado ante el SAT (metadata de la descarga masiva). La última carga por UUID manda.
CREATE TABLE IF NOT EXISTS cfdi_estado_sat (
  encargo_id         TEXT NOT NULL REFERENCES encargo(id),
  uuid               TEXT NOT NULL,
  estatus            TEXT NOT NULL CHECK (estatus IN ('vigente','cancelado')),
  fecha_cancelacion  TEXT,
  rfc_emisor         TEXT,
  ingesta_id         TEXT NOT NULL REFERENCES ingesta_cfdi(id),
  PRIMARY KEY (encargo_id, uuid)
);

-- ── Cruce nómina ↔ CFDI: sólo lo que no coincide ──
CREATE TABLE IF NOT EXISTS cruce_cfdi (
  id                    TEXT PRIMARY KEY,
  encargo_id            TEXT NOT NULL REFERENCES encargo(id),
  ingesta_cfdi_id       TEXT NOT NULL REFERENCES ingesta_cfdi(id),
  prenomina_ingesta_id  TEXT NOT NULL REFERENCES ingesta(id),
  corte                 TEXT NOT NULL,                -- corrida del cruce que lo encontró por última vez
  tipo                  TEXT NOT NULL CHECK (tipo IN ('diferencia','sin_cfdi','sin_nomina')),
  colaborador_llave     TEXT NOT NULL,
  corrida_id            TEXT NOT NULL,
  rubro                 TEXT NOT NULL CHECK (rubro IN ('percepciones','isr','neto')),
  movimiento_id         TEXT,
  uuids                 TEXT,
  nomina_c              INTEGER,
  cfdi_c                INTEGER,
  cubeta                TEXT CHECK (cubeta IN ('proceso_mal','explicada','criterio_sin_resolver')),
  motivo                TEXT,
  quien                 TEXT,
  clasificado_por_usuario_id INTEGER REFERENCES usuarios(id),
  criterio_id           TEXT REFERENCES bitacora_criterio(id),
  clasificado_en        TEXT,
  CHECK (cubeta IS NULL OR (motivo IS NOT NULL AND quien IS NOT NULL)),
  CHECK (cubeta IS NOT 'criterio_sin_resolver' OR criterio_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_cruce_ingesta ON cruce_cfdi (ingesta_cfdi_id, corte, tipo, rubro);
CREATE TRIGGER IF NOT EXISTS cruce_importes_fijos BEFORE UPDATE ON cruce_cfdi
WHEN NEW.nomina_c IS NOT OLD.nomina_c OR NEW.cfdi_c IS NOT OLD.cfdi_c OR NEW.tipo <> OLD.tipo OR NEW.rubro <> OLD.rubro
  OR NEW.colaborador_llave <> OLD.colaborador_llave OR NEW.corrida_id <> OLD.corrida_id OR NEW.uuids IS NOT OLD.uuids
BEGIN SELECT RAISE(ABORT, 'Los importes del cruce no cambian: sólo se clasifica'); END;
CREATE TRIGGER IF NOT EXISTS cruce_no_se_borra BEFORE DELETE ON cruce_cfdi
BEGIN SELECT RAISE(ABORT, 'El cruce no se borra'); END;
CREATE TRIGGER IF NOT EXISTS cruce_separacion_personas BEFORE UPDATE OF cubeta ON cruce_cfdi
WHEN NEW.clasificado_por_usuario_id IS NOT NULL
 AND NEW.clasificado_por_usuario_id = (SELECT operador_nomina_usuario_id FROM encargo WHERE id = NEW.encargo_id)
BEGIN SELECT RAISE(ABORT, 'Quien operó la nómina del periodo no puede clasificar ni cerrar hallazgos'); END;

CREATE TABLE IF NOT EXISTS hallazgo_cruce (
  hallazgo_id  TEXT NOT NULL REFERENCES hallazgo(id),
  cruce_id     TEXT NOT NULL REFERENCES cruce_cfdi(id),
  PRIMARY KEY (hallazgo_id, cruce_id)
);
CREATE INDEX IF NOT EXISTS idx_hallazgo_cruce ON hallazgo_cruce (cruce_id);
CREATE TRIGGER IF NOT EXISTS hallazgo_cruce_proceso_mal BEFORE INSERT ON hallazgo_cruce
WHEN (SELECT cubeta FROM cruce_cfdi WHERE id = NEW.cruce_id) IS NOT 'proceso_mal'
BEGIN SELECT RAISE(ABORT, 'Sólo un cruce clasificado como «proceso actual mal» es hallazgo'); END;
CREATE TRIGGER IF NOT EXISTS hallazgo_cruce_mismo_encargo BEFORE INSERT ON hallazgo_cruce
WHEN (SELECT encargo_id FROM hallazgo WHERE id = NEW.hallazgo_id) <> (SELECT encargo_id FROM cruce_cfdi WHERE id = NEW.cruce_id)
BEGIN SELECT RAISE(ABORT, 'El cruce es de otro encargo'); END;
CREATE TRIGGER IF NOT EXISTS hallazgo_cruce_no_se_borra BEFORE DELETE ON hallazgo_cruce
BEGIN SELECT RAISE(ABORT, 'El vínculo hallazgo ↔ cruce no se borra'); END;
CREATE TRIGGER IF NOT EXISTS cruce_con_hallazgo BEFORE UPDATE OF cubeta ON cruce_cfdi
WHEN OLD.cubeta = 'proceso_mal' AND NEW.cubeta IS NOT 'proceso_mal' AND EXISTS (SELECT 1 FROM hallazgo_cruce WHERE cruce_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'El cruce ya sustenta un hallazgo: se resuelve el hallazgo, no se reclasifica el cruce'); END;

-- El efecto derivado del hallazgo suma diferencias del kernel y cruces nómina ↔ CFDI.
DROP VIEW IF EXISTS v_hallazgo;
CREATE VIEW v_hallazgo AS
SELECT h.*, e.empresa_id,
  (SELECT count(*) FROM hallazgo_diferencia x WHERE x.hallazgo_id = h.id) + (SELECT count(*) FROM hallazgo_cruce x WHERE x.hallazgo_id = h.id) AS diferencias,
  CASE WHEN EXISTS (SELECT 1 FROM hallazgo_diferencia x WHERE x.hallazgo_id = h.id) OR EXISTS (SELECT 1 FROM hallazgo_cruce x WHERE x.hallazgo_id = h.id) THEN
    coalesce((SELECT sum(abs(v.diferencia_c)) FROM hallazgo_diferencia x JOIN v_diferencia v ON v.id = x.diferencia_id WHERE x.hallazgo_id = h.id), 0) +
    coalesce((SELECT sum(abs(coalesce(c.nomina_c, 0) - coalesce(c.cfdi_c, 0))) FROM hallazgo_cruce x JOIN cruce_cfdi c ON c.id = x.cruce_id WHERE x.hallazgo_id = h.id), 0)
  END AS efecto_derivado_c,
  (SELECT count(DISTINCT h2.encargo_id) FROM hallazgo h2 JOIN encargo e2 ON e2.id = h2.encargo_id
     WHERE h2.clave_recurrencia = h.clave_recurrencia AND e2.empresa_id = e.empresa_id AND e2.periodo_hasta <= e.periodo_hasta
       AND h2.estatus <> 'superado') AS periodos
FROM hallazgo h JOIN encargo e ON e.id = h.encargo_id;

INSERT OR IGNORE INTO bitacora_criterio (id, tema, decision, fundamento, quien, fecha, estado, observaciones) VALUES
('C11', 'Cruce nómina ↔ CFDI sin tolerancia', 'Percepciones, ISR retenido y neto del CFDI se comparan al centavo contra la nómina, por colaborador y corrida. Es un cruce documental (dos salidas del mismo sistema), no un recálculo: la tolerancia de T4 no aplica.',
 'Revisión del maestro v0.3, T4 («la tolerancia aplica a cálculo»); D5', 'Sistema (por ratificar con HRM)', '2026-10-15', 'por_confirmar',
 'En agosto el ISR timbrado cuadra al centavo con la prenómina (Punto 1, 14-oct), lo que respalda cruzar sin tolerancia.');
