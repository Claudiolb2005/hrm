-- 0009_maestro_afiliacion.sql — Maestro de empleados del cliente y cruce de afiliación (D7 cualitativo).
-- Aplicar:  wrangler d1 execute hrm-nomina-portal --remote --file=migrations/0009_maestro_afiliacion.sql
--
-- Del maestro sólo se guarda lo que el cruce usa (N7): número de empleado, RFC, fechas y grupo de nómina.
PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO fuente (clave, descripcion, anexo) VALUES
('maestro_empleados', 'Maestro de empleados del periodo: fechas de alta y de baja (incluida la baja ante el IMSS) por trabajador', NULL);

CREATE TABLE IF NOT EXISTS maestro_carga (
  id                    TEXT PRIMARY KEY,
  encargo_id            TEXT NOT NULL REFERENCES encargo(id),
  perfil                TEXT NOT NULL,
  r2_key                TEXT NOT NULL,
  archivo_nombre        TEXT,
  archivo_sha256        TEXT NOT NULL,
  registros             INTEGER NOT NULL,
  prenomina_ingesta_id  TEXT REFERENCES ingesta(id),
  ejecucion_id          TEXT REFERENCES ejecucion(id),
  corte_actual          TEXT,
  reporte_json          TEXT CHECK (reporte_json IS NULL OR json_valid(reporte_json)),
  creado_por            INTEGER REFERENCES usuarios(id),
  creado_en             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS colaborador_maestro (
  carga_id          TEXT NOT NULL REFERENCES maestro_carga(id),
  num_empleado      TEXT NOT NULL,
  rfc               TEXT,
  fecha_alta        TEXT,
  fecha_antiguedad  TEXT,
  fecha_baja        TEXT,
  fecha_baja_imss   TEXT,
  grupo             TEXT,
  hoja              TEXT NOT NULL,
  PRIMARY KEY (carga_id, num_empleado)
);
CREATE TRIGGER IF NOT EXISTS colaborador_maestro_inmutable_u BEFORE UPDATE ON colaborador_maestro
BEGIN SELECT RAISE(ABORT, 'El maestro cargado no cambia: se carga uno nuevo'); END;

CREATE TABLE IF NOT EXISTS cruce_afiliacion (
  id                    TEXT PRIMARY KEY,
  encargo_id            TEXT NOT NULL REFERENCES encargo(id),
  carga_id              TEXT NOT NULL REFERENCES maestro_carga(id),
  prenomina_ingesta_id  TEXT NOT NULL REFERENCES ingesta(id),
  corte                 TEXT NOT NULL,
  tipo                  TEXT NOT NULL CHECK (tipo IN ('pago_despues_de_baja','pago_antes_de_alta')),
  colaborador_id        TEXT NOT NULL,
  corrida_id            TEXT NOT NULL,
  fecha_evento          TEXT NOT NULL,
  fuente_fecha          TEXT NOT NULL,
  percepciones_c        INTEGER NOT NULL,
  cubeta                TEXT CHECK (cubeta IN ('proceso_mal','explicada','criterio_sin_resolver')),
  motivo                TEXT,
  quien                 TEXT,
  clasificado_por_usuario_id INTEGER REFERENCES usuarios(id),
  criterio_id           TEXT REFERENCES bitacora_criterio(id),
  clasificado_en        TEXT,
  CHECK (cubeta IS NULL OR (motivo IS NOT NULL AND quien IS NOT NULL)),
  CHECK (cubeta IS NOT 'criterio_sin_resolver' OR criterio_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_afiliacion ON cruce_afiliacion (carga_id, corte, tipo);
CREATE TRIGGER IF NOT EXISTS afiliacion_importes_fijos BEFORE UPDATE ON cruce_afiliacion
WHEN NEW.percepciones_c <> OLD.percepciones_c OR NEW.tipo <> OLD.tipo OR NEW.colaborador_id <> OLD.colaborador_id OR NEW.corrida_id <> OLD.corrida_id OR NEW.fecha_evento <> OLD.fecha_evento
BEGIN SELECT RAISE(ABORT, 'El caso de afiliación no cambia: sólo se clasifica'); END;
CREATE TRIGGER IF NOT EXISTS afiliacion_no_se_borra BEFORE DELETE ON cruce_afiliacion
BEGIN SELECT RAISE(ABORT, 'El caso de afiliación no se borra'); END;
CREATE TRIGGER IF NOT EXISTS afiliacion_separacion_personas BEFORE UPDATE OF cubeta ON cruce_afiliacion
WHEN NEW.clasificado_por_usuario_id IS NOT NULL
 AND NEW.clasificado_por_usuario_id = (SELECT operador_nomina_usuario_id FROM encargo WHERE id = NEW.encargo_id)
BEGIN SELECT RAISE(ABORT, 'Quien operó la nómina del periodo no puede clasificar ni cerrar hallazgos'); END;

CREATE TABLE IF NOT EXISTS hallazgo_afiliacion (
  hallazgo_id  TEXT NOT NULL REFERENCES hallazgo(id),
  caso_id      TEXT NOT NULL REFERENCES cruce_afiliacion(id),
  PRIMARY KEY (hallazgo_id, caso_id)
);
CREATE TRIGGER IF NOT EXISTS hallazgo_afiliacion_proceso_mal BEFORE INSERT ON hallazgo_afiliacion
WHEN (SELECT cubeta FROM cruce_afiliacion WHERE id = NEW.caso_id) IS NOT 'proceso_mal'
BEGIN SELECT RAISE(ABORT, 'Sólo un caso clasificado como «proceso actual mal» es hallazgo'); END;
CREATE TRIGGER IF NOT EXISTS hallazgo_afiliacion_mismo_encargo BEFORE INSERT ON hallazgo_afiliacion
WHEN (SELECT encargo_id FROM hallazgo WHERE id = NEW.hallazgo_id) <> (SELECT encargo_id FROM cruce_afiliacion WHERE id = NEW.caso_id)
BEGIN SELECT RAISE(ABORT, 'El caso es de otro encargo'); END;
CREATE TRIGGER IF NOT EXISTS hallazgo_afiliacion_no_se_borra BEFORE DELETE ON hallazgo_afiliacion
BEGIN SELECT RAISE(ABORT, 'El vínculo hallazgo ↔ caso no se borra'); END;
CREATE TRIGGER IF NOT EXISTS afiliacion_con_hallazgo BEFORE UPDATE OF cubeta ON cruce_afiliacion
WHEN OLD.cubeta = 'proceso_mal' AND NEW.cubeta IS NOT 'proceso_mal' AND EXISTS (SELECT 1 FROM hallazgo_afiliacion WHERE caso_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'El caso ya sustenta un hallazgo: se resuelve el hallazgo, no se reclasifica el caso'); END;

-- El efecto derivado suma diferencias del kernel, cruces con el CFDI y pagos de afiliación.
DROP VIEW IF EXISTS v_hallazgo;
CREATE VIEW v_hallazgo AS
SELECT h.*, e.empresa_id,
  (SELECT count(*) FROM hallazgo_diferencia x WHERE x.hallazgo_id = h.id) + (SELECT count(*) FROM hallazgo_cruce x WHERE x.hallazgo_id = h.id)
    + (SELECT count(*) FROM hallazgo_afiliacion x WHERE x.hallazgo_id = h.id) AS diferencias,
  CASE WHEN EXISTS (SELECT 1 FROM hallazgo_diferencia x WHERE x.hallazgo_id = h.id) OR EXISTS (SELECT 1 FROM hallazgo_cruce x WHERE x.hallazgo_id = h.id)
         OR EXISTS (SELECT 1 FROM hallazgo_afiliacion x WHERE x.hallazgo_id = h.id) THEN
    coalesce((SELECT sum(abs(v.diferencia_c)) FROM hallazgo_diferencia x JOIN v_diferencia v ON v.id = x.diferencia_id WHERE x.hallazgo_id = h.id), 0) +
    coalesce((SELECT sum(abs(coalesce(c.nomina_c, 0) - coalesce(c.cfdi_c, 0))) FROM hallazgo_cruce x JOIN cruce_cfdi c ON c.id = x.cruce_id WHERE x.hallazgo_id = h.id), 0) +
    coalesce((SELECT sum(a.percepciones_c) FROM hallazgo_afiliacion x JOIN cruce_afiliacion a ON a.id = x.caso_id WHERE x.hallazgo_id = h.id), 0)
  END AS efecto_derivado_c,
  (SELECT count(DISTINCT h2.encargo_id) FROM hallazgo h2 JOIN encargo e2 ON e2.id = h2.encargo_id
     WHERE h2.clave_recurrencia = h.clave_recurrencia AND e2.empresa_id = e.empresa_id AND e2.periodo_hasta <= e.periodo_hasta
       AND h2.estatus <> 'superado') AS periodos
FROM hallazgo h JOIN encargo e ON e.id = h.encargo_id;
