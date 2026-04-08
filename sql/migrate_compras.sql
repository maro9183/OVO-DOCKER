-- ============================================================
-- Migración: Módulo de Compras
-- Ejecutar en instancias ya desplegadas (Lubuntu u otros)
-- Es idempotente: usa CREATE TABLE IF NOT EXISTS
-- ============================================================

USE ovo2;

CREATE TABLE IF NOT EXISTS compras (
  id_compra               INT AUTO_INCREMENT PRIMARY KEY,
  id_tarea                INT DEFAULT NULL,
  producto                VARCHAR(255) NOT NULL,
  descripcion             TEXT,
  cantidad                INT DEFAULT 1,
  valor_unitario          DECIMAL(12,2) DEFAULT 0.00,
  valor_total             DECIMAL(12,2) DEFAULT 0.00,
  id_solicitante          INT DEFAULT NULL,
  id_responsable          INT DEFAULT NULL,
  estado                  ENUM('solicitada','solicitando presupuesto','presupuesto recibido','OC emitida','fecha comprometida','entregado') DEFAULT 'solicitada',
  dias_arribo             INT DEFAULT 0,
  fecha_solicitud         DATE DEFAULT NULL,
  fecha_presupuesto_solic DATE DEFAULT NULL,
  fecha_presupuesto_recib DATE DEFAULT NULL,
  fecha_oc_emitida        DATE DEFAULT NULL,
  fecha_comprometida      DATE DEFAULT NULL,
  fecha_entregado         DATE DEFAULT NULL,
  fecha_arribo_estimada   DATE DEFAULT NULL,
  fecha_arribo_necesaria  DATE DEFAULT NULL,
  notas                   TEXT,
  links_facturas          TEXT,
  fecha_creacion          DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_tarea)       REFERENCES tareas(id_tarea)      ON DELETE SET NULL,
  FOREIGN KEY (id_solicitante) REFERENCES responsables(id_resp)  ON DELETE SET NULL,
  FOREIGN KEY (id_responsable) REFERENCES responsables(id_resp)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT 'Tabla compras creada o ya existente.' AS resultado;
