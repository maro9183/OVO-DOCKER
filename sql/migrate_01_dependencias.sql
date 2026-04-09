-- ============================================================
-- MIGRACIÓN 01: Normalizar dependencias (TEXT → tabla relacional)
-- Ejecutar en la BD 'ovo2' del contenedor ovo2-db
-- Es seguro: NO droppea columnas existentes
-- ============================================================

-- 1. Crear tabla normalizada si no existe
CREATE TABLE IF NOT EXISTS dependencias (
  id_dependencia INT AUTO_INCREMENT PRIMARY KEY,
  id_tarea       INT NOT NULL,
  id_predecesora INT NOT NULL,
  tipo           VARCHAR(10) DEFAULT 'FS',
  lag_dias       INT DEFAULT 0,
  FOREIGN KEY (id_tarea)       REFERENCES tareas(id_tarea) ON DELETE CASCADE,
  FOREIGN KEY (id_predecesora) REFERENCES tareas(id_tarea) ON DELETE CASCADE,
  UNIQUE KEY uq_dep (id_tarea, id_predecesora)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Migrar datos existentes desde campo TEXT
-- Usamos procedimiento para compatibilidad con MySQL 8.0 sin JSON_TABLE en versiones viejas
DROP PROCEDURE IF EXISTS migrar_dependencias;

DELIMITER //
CREATE PROCEDURE migrar_dependencias()
BEGIN
  DECLARE done INT DEFAULT FALSE;
  DECLARE v_id_tarea INT;
  DECLARE v_dependencias TEXT;
  DECLARE v_depId VARCHAR(20);
  DECLARE v_pos INT;
  DECLARE v_next INT;
  DECLARE v_depStr TEXT;

  DECLARE cur CURSOR FOR
    SELECT id_tarea, dependencias FROM tareas
    WHERE dependencias IS NOT NULL AND dependencias != '';

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO v_id_tarea, v_dependencias;
    IF done THEN LEAVE read_loop; END IF;

    SET v_depStr = CONCAT(TRIM(v_dependencias), ',');
    SET v_pos = 1;

    WHILE v_depStr != '' AND v_pos > 0 DO
      SET v_pos  = LOCATE(',', v_depStr);
      SET v_depId = TRIM(SUBSTRING(v_depStr, 1, v_pos - 1));
      SET v_depStr = SUBSTRING(v_depStr, v_pos + 1);

      IF v_depId != '' AND v_depId REGEXP '^[0-9]+$' THEN
        -- Verificar que la tarea predecesora exista antes de insertar
        IF EXISTS (SELECT 1 FROM tareas WHERE id_tarea = CAST(v_depId AS UNSIGNED)) THEN
          INSERT IGNORE INTO dependencias (id_tarea, id_predecesora)
          VALUES (v_id_tarea, CAST(v_depId AS UNSIGNED));
        END IF;
      END IF;
    END WHILE;
  END LOOP;

  CLOSE cur;
END //
DELIMITER ;

CALL migrar_dependencias();
DROP PROCEDURE IF EXISTS migrar_dependencias;

-- 3. Verificar resultado
SELECT
  d.id_tarea,
  t1.descripcion AS tarea,
  d.id_predecesora,
  t2.descripcion AS predecesora
FROM dependencias d
JOIN tareas t1 ON d.id_tarea = t1.id_tarea
JOIN tareas t2 ON d.id_predecesora = t2.id_tarea
ORDER BY d.id_tarea;
