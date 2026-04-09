-- Migration: Add id_proyecto to compras
-- Idempotency check using INFORMATION_SCHEMA
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'compras' AND COLUMN_NAME = 'id_proyecto' AND TABLE_SCHEMA = DATABASE());
SET @s = IF(@col_exists = 0, 'ALTER TABLE compras ADD COLUMN id_proyecto INT DEFAULT NULL AFTER id_tarea', 'SELECT "Column id_proyecto already exists"');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add Foreign Key if it doesn't exist
SET @fk_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_NAME = 'compras' AND CONSTRAINT_NAME = 'compras_ibfk_id_proyecto' AND TABLE_SCHEMA = DATABASE());
SET @s2 = IF(@fk_exists = 0, 'ALTER TABLE compras ADD CONSTRAINT compras_ibfk_id_proyecto FOREIGN KEY (id_proyecto) REFERENCES proyectos(id_proyecto) ON DELETE SET NULL', 'SELECT "FK already exists"');
PREPARE stmt2 FROM @s2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
