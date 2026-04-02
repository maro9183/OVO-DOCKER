-- ============================================================
-- GANTT PROJECT TRACKER - Schema
-- La base de datos 'ovo2' es creada automáticamente por el servidor
-- ============================================================

CREATE TABLE IF NOT EXISTS proyectos (
  id_proyecto     INT AUTO_INCREMENT PRIMARY KEY,
  proyecto        VARCHAR(50)  NOT NULL,
  nombre_proyecto VARCHAR(255) NOT NULL,
  descripcion     TEXT,
  color           VARCHAR(20)  DEFAULT '#6366f1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS recursos (
  id_recurso  INT AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(255) NOT NULL,
  area        VARCHAR(100),
  rol         VARCHAR(100),
  valor_hora  DECIMAL(10,2) DEFAULT 0.00
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS responsables (
  id_resp INT AUTO_INCREMENT PRIMARY KEY,
  nombre  VARCHAR(255) NOT NULL,
  correo  VARCHAR(255) UNIQUE NOT NULL,
  rol     VARCHAR(100),
  equipo  VARCHAR(100),
  foto    VARCHAR(500)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tareas (
  id_tarea                INT AUTO_INCREMENT PRIMARY KEY,
  id_proyecto             INT NOT NULL,
  tarea                   VARCHAR(100),
  descripcion             TEXT,
  fecha_inicio            DATE,
  fecha_inicio_proyectada DATE,
  duracion_dias           INT DEFAULT 1,
  fecha_fin               DATE,
  fecha_completada        DATE,
  estado                  VARCHAR(50) DEFAULT 'No comenzada',
  responsable             VARCHAR(255),
  avance                  DECIMAL(5,2) DEFAULT 0.00,
  dependencias            TEXT,
  costo_tarea             DECIMAL(10,2) DEFAULT 0.00,
  fecha_creacion          DATETIME DEFAULT CURRENT_TIMESTAMP,
  notificado              TINYINT(1) DEFAULT 0,
  recursos                TEXT,
  fecha_iniciada          DATETIME,
  fecha_finalizada        DATETIME,
  tipo_dias               ENUM('calendario','laboral') DEFAULT 'calendario',
  FOREIGN KEY (id_proyecto) REFERENCES proyectos(id_proyecto) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notas (
  id_nota    INT AUTO_INCREMENT PRIMARY KEY,
  tarea      INT NOT NULL,
  nota       TEXT,
  adjunto    VARCHAR(500),
  link       VARCHAR(500),
  autor      VARCHAR(255),
  fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tarea) REFERENCES tareas(id_tarea) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS usuarios (
  id_usuario      INT AUTO_INCREMENT PRIMARY KEY,
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  nombre          VARCHAR(255) NOT NULL,
  permisos        VARCHAR(255) DEFAULT 'READ',  -- Ej: 'READ', 'CREATE,READ,UPDATE,DELETE', 'ALL'
  proyectos       TEXT,                         -- Ej: '1,2,3', 'ALL'
  activo          TINYINT(1) DEFAULT 1,
  fecha_creacion  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- DATOS DE EJEMPLO
-- ============================================================
INSERT IGNORE INTO proyectos (id_proyecto, proyecto, nombre_proyecto, descripcion, color) VALUES
(1, 'G12',  'Construcción G12',    'Proyecto edificio G12',          '#6366f1'),
(2, 'OFI',  'Oficinas Centro',     'Remodelación oficinas centrales', '#10b981'),
(3, 'INF',  'Infraestructura TI',  'Renovación servidores y red',     '#f59e0b');

INSERT IGNORE INTO responsables (nombre, correo, rol, equipo) VALUES
('German Morano',  'morano.german@gmail.com',  'Jefe de Proyecto', 'Construcción'),
('Ana García',     'ana.garcia@empresa.com',   'Arquitecta',       'Diseño'),
('Luis Pérez',     'luis.perez@empresa.com',   'Técnico',          'TI');

INSERT IGNORE INTO usuarios (id_usuario, email, password_hash, nombre, permisos, proyectos) VALUES
(1, 'admin@ovo2.com', '$2b$10$1zlV9usuJ4q0s5Gb8pmSkuG.2hEJDPZx7P/Esb26zKKh4osNZGtgS', 'Administrador', 'ALL', 'ALL');

INSERT IGNORE INTO tareas
  (id_tarea, id_proyecto, tarea, descripcion, fecha_inicio, duracion_dias, fecha_fin,
   estado, responsable, avance, dependencias, tipo_dias) VALUES
(1, 1, 'T0001', 'Cimientos',     '2026-04-05', 20, '2026-04-25', 'No comenzada', 'morano.german@gmail.com', 0,    NULL, 'calendario'),
(2, 1, 'T0002', 'Estructura',    '2026-04-05', 15, '2026-05-10', 'No comenzada', 'morano.german@gmail.com', 0,    '1',  'calendario'),
(3, 1, 'T0003', 'Terminaciones', '2026-04-05', 10, '2026-05-20', 'No comenzada', 'ana.garcia@empresa.com',  0,    '2',  'laboral');
