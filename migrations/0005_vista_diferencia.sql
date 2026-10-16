-- 0005_vista_diferencia.sql — La vista de diferencias expone si el cálculo quedó limitado y su lote.
DROP VIEW IF EXISTS v_diferencia;
CREATE VIEW v_diferencia AS
SELECT d.id, d.cubeta, d.motivo, d.quien, d.criterio_id, d.clasificado_en, c.encargo_id, c.ejercicio, c.corrida_id, c.colaborador_id, c.rubro,
       c.valor_calculado_c AS kernel_c, m.valor_c AS cliente_c, (m.valor_c - c.valor_calculado_c) AS diferencia_c,
       c.regla_id, c.version_parametros, c.ejecucion_id, c.limitado, c.lote, m.renglon_origen
FROM diferencia d JOIN calculo_kernel c ON c.id = d.calculo_kernel_id JOIN movimiento_nomina m ON m.id = d.movimiento_id;
