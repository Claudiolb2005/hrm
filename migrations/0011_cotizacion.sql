-- 0011_cotizacion.sql — Cotizaciones de honorarios (módulo 26; D9). Sólo HRM.
-- Aplicar:  wrangler d1 execute hrm-nomina-portal --remote --file=migrations/0011_cotizacion.sql
CREATE TABLE IF NOT EXISTS cotizacion (
  id             TEXT PRIMARY KEY,
  empresa_id     INTEGER REFERENCES empresas(id),
  encargo_id     TEXT REFERENCES encargo(id),
  prospecto      TEXT,                                -- cliente que todavía no está en el portal
  tarifa         TEXT NOT NULL,
  insumos_json   TEXT NOT NULL CHECK (json_valid(insumos_json)),
  resultado_json TEXT NOT NULL CHECK (json_valid(resultado_json)),
  iguala_mensual INTEGER NOT NULL,
  diagnostico    INTEGER NOT NULL,
  creado_por     INTEGER REFERENCES usuarios(id),
  creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (empresa_id IS NOT NULL OR prospecto IS NOT NULL)
);
CREATE TRIGGER IF NOT EXISTS cotizacion_inmutable BEFORE UPDATE ON cotizacion
BEGIN SELECT RAISE(ABORT, 'Una cotización guardada no cambia: se guarda otra'); END;
INSERT OR IGNORE INTO bitacora_criterio (id, tema, decision, fundamento, quien, fecha, estado, observaciones) VALUES
('C12', 'Cotizador: redondeo y complementos', 'B5+ se redondea al millar más cercano (medio hacia arriba); el diagnóstico es k × la iguala sin redondear, también al millar. RFC adicional (+35 %) y modalidad preventiva (+30 %) suman a la iguala mensual; REPSE, contrato colectivo, SBC variable, ejercicio anterior (+55 % del diagnóstico), horas de requerimiento y saldos a favor se cotizan como montos de una vez.',
 'Nómina Verificada v2; Revisión del maestro v0.3 (N2, N3, T7)', 'Sistema (por ratificar con HRM)', '2026-10-15', 'por_confirmar',
 'El documento no dice si los complementos fijos son mensuales o de una vez; el cotizador los separa para que se vea.');
