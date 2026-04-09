-- Migration: Add auto_retrasada to tareas
-- Idempotency check using INFORMATION_SCHEMA
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tareas' AND COLUMN_NAME = 'auto_retrasada' AND TABLE_SCHEMA = DATABASE());
SET @s = IF(@col_exists = 0, 'ALTER TABLE tareas ADD COLUMN auto_retrasada TINYINT(1) DEFAULT 0 AFTER tipo_dias', 'SELECT "Column auto_retrasada already exists"');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
