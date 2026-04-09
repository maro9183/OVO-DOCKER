-- ============================================================
-- MIGRACIÓN 03: Agregar FK a tabla responsables en tareas
-- ============================================================

ALTER TABLE tareas ADD COLUMN id_resp INT DEFAULT NULL;
ALTER TABLE tareas ADD FOREIGN KEY (id_resp) REFERENCES responsables(id_resp) ON DELETE SET NULL;

-- Actualizar basado en el correo que está guardado actualmente
UPDATE tareas t
JOIN responsables r ON r.correo = t.responsable
SET t.id_resp = r.id_resp;

-- Mostrar filas que no pudieron ser vinculadas (por si acaso)
SELECT id_tarea, responsable FROM tareas WHERE id_resp IS NULL AND responsable IS NOT NULL AND responsable != '';
