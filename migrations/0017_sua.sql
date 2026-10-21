-- 0017_sua.sql — Lectura del SUA en el portal (kernel 0.11.0, 21-oct-2026).
-- Aplicar:  wrangler d1 execute hrm-nomina-portal --remote --file=migrations/0017_sua.sql
--
-- Por registro patronal y mes: el archivo de pago .SUA (lo pagado), la emisión del IMSS EMA/EBA (lo emitido)
-- y el cálculo del kernel (lo debido) con los tramos de SBC de la emisión y las incapacidades del SUA.
-- Lo que la base hace cumplir:
--   · La lectura y el cruce son sólo-agregar: los importes no cambian después de leídos; sólo se clasifican.
--   · Un cruce clasificado lleva motivo; «criterio sin resolver» lleva su criterio de la bitácora.
--   · Quien operó la nómina del periodo no clasifica (N1).
-- Minimización (N7): del trabajador se guardan RFC, número de empleado (si se liga a la prenómina) y los
-- últimos 4 dígitos del NSS. Nombres y CURP no se guardan; el archivo original queda en R2 como evidencia.
PRAGMA foreign_keys = ON;

-- Reglas con tramos de SBC (1.2.0 / 1.1.0): redondeo por rama y por tramo, como la emisión y el SUA.
UPDATE regla SET version = '1.2.0', fundamento = 'LSS arts. 25, 36, 71 a 74, 106, 107, 147 y 211; criterios C8, C14, C21 y C24' WHERE id = 'CALC-IMSS-001';
UPDATE regla SET version = '1.2.0', fundamento = 'LSS arts. 36 y 168; Segundo Transitorio DOF 16-dic-2020; criterios C4, C8, C13 y C14' WHERE id = 'CALC-RCV-001';
UPDATE regla SET version = '1.1.0', fundamento = 'Ley del INFONAVIT art. 29 fr. II' WHERE id = 'CALC-INF-001';

UPDATE bitacora_criterio SET tema = 'Redondeo de cuotas IMSS, RCV e INFONAVIT', decision = 'Cada rama de IMSS, RCV e INFONAVIT se redondea a centavo por trabajador y por tramo de SBC (alta, modificación o baja dentro del periodo), y los tramos se suman. Así calculan la emisión del IMSS y el SUA.',
  observaciones = '20-oct: siete casos dorados (D29a, D30a, D31a/b, D32b, D41a/b) se habían calculado sumando y redondeando al final, con 1 ¢ de diferencia; se recalcularon por rama. 21-oct: comprobado contra el SUA y la emisión de agosto 2026 de PrimeWireless (30 registros, 3,677 trabajadores): con redondeo por tramo el kernel reproduce la emisión al centavo en todas las ramas; con un solo redondeo por trabajador quedaban ±1 ¢ en 2,258 renglones con varios tramos.'
WHERE id = 'C24';

INSERT OR IGNORE INTO bitacora_criterio (id, tema, decision, fundamento, quien, fecha, estado, observaciones) VALUES
('C26', 'Cuotas debidas: tramos de la emisión e incapacidades del SUA',
 'El kernel calcula IMSS, RCV e INFONAVIT con los tramos de SBC de la emisión del IMSS (EMA del mes, EBA del bimestre) y las incapacidades del SUA, porque la emisión no las descuenta. Si dentro del periodo cambia el SBC y el SUA no trae las fechas de la incapacidad, el cálculo queda limitado en vez de suponer qué días restar.',
 'LSS arts. 31, 39 y 42; criterio C8', 'Sistema (por ratificar con HRM)', '2026-10-21', 'por_confirmar',
 'Agosto 2026: la emisión cobra $141,668.33 más de IMSS y $239,039.82 más de RCV que el SUA por incapacidades; el kernel coincide con el SUA en esos 1,231 renglones.');

-- ── Una lectura por registro patronal y mes ──
CREATE TABLE IF NOT EXISTS ingesta_sua (
  id                    TEXT PRIMARY KEY,
  encargo_id            TEXT NOT NULL REFERENCES encargo(id),
  periodo               TEXT NOT NULL,                       -- AAAA-MM del pago
  registro              TEXT NOT NULL,                       -- registro patronal (11)
  folio                 TEXT,
  r2_prefijo            TEXT NOT NULL,
  archivos_json         TEXT NOT NULL CHECK (json_valid(archivos_json)),   -- { sua, ema, eba, ema_pa: { nombre, sha256, tamano } }
  trabajadores          INTEGER NOT NULL,
  prima_rt_pct          TEXT,
  cuadre_interno        INTEGER NOT NULL,                    -- 1 = la suma de los 03 cuadra con el 05
  prenomina_ingesta_id  TEXT REFERENCES ingesta(id),
  ejecucion_id          TEXT REFERENCES ejecucion(id),
  reporte_json          TEXT NOT NULL CHECK (json_valid(reporte_json)),
  creado_por            INTEGER REFERENCES usuarios(id),
  creado_en             TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ingesta_sua ON ingesta_sua (encargo_id, periodo, registro, creado_en);
CREATE TRIGGER IF NOT EXISTS ingesta_sua_inmutable BEFORE UPDATE ON ingesta_sua
BEGIN SELECT RAISE(ABORT, 'La lectura del SUA no cambia: se sube de nuevo'); END;
CREATE TRIGGER IF NOT EXISTS ingesta_sua_no_se_borra BEFORE DELETE ON ingesta_sua
BEGIN SELECT RAISE(ABORT, 'La lectura del SUA no se borra'); END;

-- ── Cruce kernel ↔ emisión ↔ pago, por trabajador y rama: sólo lo que no coincide ──
CREATE TABLE IF NOT EXISTS cruce_sua (
  id                    TEXT PRIMARY KEY,
  ingesta_sua_id        TEXT NOT NULL REFERENCES ingesta_sua(id),
  encargo_id            TEXT NOT NULL REFERENCES encargo(id),
  tipo                  TEXT NOT NULL CHECK (tipo IN ('diferencia','sin_emision','sin_pago')),
  causa                 TEXT NOT NULL CHECK (causa IN ('incapacidad','sua_distinto_imss','calculo_limitado','kernel_distinto','sin_emision','sin_pago')),
  colaborador_id        TEXT NOT NULL,
  rfc                   TEXT,
  nss_final             TEXT,
  rama                  TEXT NOT NULL CHECK (rama IN ('cuota_fija','excedente','dinero','gmp','rt','iv','guarderias','retiro','ceav_patronal','ceav_obrera','infonavit')),
  kernel_c              INTEGER,
  emitido_c             INTEGER,
  pagado_c              INTEGER,
  limitado              INTEGER NOT NULL DEFAULT 0,
  detalle_json          TEXT CHECK (detalle_json IS NULL OR json_valid(detalle_json)),
  cubeta                TEXT CHECK (cubeta IN ('proceso_mal','explicada','criterio_sin_resolver')),
  motivo                TEXT,
  quien                 TEXT,
  clasificado_por_usuario_id INTEGER REFERENCES usuarios(id),
  criterio_id           TEXT REFERENCES bitacora_criterio(id),
  clasificado_en        TEXT,
  CHECK (cubeta IS NULL OR (motivo IS NOT NULL AND quien IS NOT NULL)),
  CHECK (cubeta IS NOT 'criterio_sin_resolver' OR criterio_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_cruce_sua ON cruce_sua (ingesta_sua_id, causa, rama);
CREATE TRIGGER IF NOT EXISTS cruce_sua_importes_fijos BEFORE UPDATE ON cruce_sua
WHEN NEW.kernel_c IS NOT OLD.kernel_c OR NEW.emitido_c IS NOT OLD.emitido_c OR NEW.pagado_c IS NOT OLD.pagado_c OR NEW.tipo <> OLD.tipo
  OR NEW.causa <> OLD.causa OR NEW.rama <> OLD.rama OR NEW.colaborador_id <> OLD.colaborador_id
BEGIN SELECT RAISE(ABORT, 'Los importes del cruce del SUA no cambian: sólo se clasifica'); END;
CREATE TRIGGER IF NOT EXISTS cruce_sua_no_se_borra BEFORE DELETE ON cruce_sua
BEGIN SELECT RAISE(ABORT, 'El cruce del SUA no se borra'); END;
CREATE TRIGGER IF NOT EXISTS cruce_sua_separacion_personas BEFORE UPDATE OF cubeta ON cruce_sua
WHEN NEW.clasificado_por_usuario_id IS NOT NULL
 AND NEW.clasificado_por_usuario_id = (SELECT operador_nomina_usuario_id FROM encargo WHERE id = NEW.encargo_id)
BEGIN SELECT RAISE(ABORT, 'Quien operó la nómina del periodo no puede clasificar ni cerrar hallazgos'); END;
