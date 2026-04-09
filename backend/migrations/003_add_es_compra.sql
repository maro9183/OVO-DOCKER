-- Migration: Add es_compra to tareas
-- Idempotency check using INFORMATION_SCHEMA
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tareas' AND COLUMN_NAME = 'es_compra' AND TABLE_SCHEMA = DATABASE());
SET @s = IF(@col_exists = 0, 'ALTER TABLE tareas ADD COLUMN es_compra TINYINT(1) DEFAULT 0 AFTER auto_retrasada', 'SELECT "Column es_compra already exists"');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
