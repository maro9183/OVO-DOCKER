-- ============================================================
-- MIGRACIÓN 02: Normalizar recursos (TEXT → tabla relacional tarea_recursos)
-- ============================================================

CREATE TABLE IF NOT EXISTS tarea_recursos (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  id_tarea   INT NOT NULL,
  id_recurso INT NOT NULL,
  horas_plan DECIMAL(10,2) DEFAULT 0,
  horas_real DECIMAL(10,2) DEFAULT 0,
  FOREIGN KEY (id_tarea)   REFERENCES tareas(id_tarea)   ON DELETE CASCADE,
  FOREIGN KEY (id_recurso) REFERENCES recursos(id_recurso) ON DELETE CASCADE,
  UNIQUE KEY uq_tarea_recurso (id_tarea, id_recurso)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP PROCEDURE IF EXISTS migrar_recursos;
DELIMITER //
CREATE PROCEDURE migrar_recursos()
BEGIN
  DECLARE done INT DEFAULT FALSE;
  DECLARE v_id_tarea INT;
  DECLARE v_recursos TEXT;
  DECLARE v_recId VARCHAR(20);
  DECLARE v_pos INT;
  DECLARE v_recStr TEXT;

  DECLARE cur CURSOR FOR
    SELECT id_tarea, recursos FROM tareas
    WHERE recursos IS NOT NULL AND recursos != '';

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO v_id_tarea, v_recursos;
    IF done THEN LEAVE read_loop; END IF;

    SET v_recStr = CONCAT(TRIM(v_recursos), ',');
    SET v_pos = 1;

    WHILE v_recStr != '' AND v_pos > 0 DO
      SET v_pos  = LOCATE(',', v_recStr);
      SET v_recId = TRIM(SUBSTRING(v_recStr, 1, v_pos - 1));
      SET v_recStr = SUBSTRING(v_recStr, v_pos + 1);

      IF v_recId != '' AND v_recId REGEXP '^[0-9]+$' THEN
        IF EXISTS (SELECT 1 FROM recursos WHERE id_recurso = CAST(v_recId AS UNSIGNED)) THEN
          INSERT IGNORE INTO tarea_recursos (id_tarea, id_recurso)
          VALUES (v_id_tarea, CAST(v_recId AS UNSIGNED));
        END IF;
      END IF;
    END WHILE;
  END LOOP;
  CLOSE cur;
END //
DELIMITER ;
CALL migrar_recursos();
DROP PROCEDURE IF EXISTS migrar_recursos;

SELECT * FROM tarea_recursos LIMIT 10;
