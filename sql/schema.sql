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

CREATE TABLE IF NOT EXISTS subresponsables (
  id_subresp INT AUTO_INCREMENT PRIMARY KEY,
  id_lead    INT NOT NULL,
  nombre     VARCHAR(255) NOT NULL,
  correo     VARCHAR(255) UNIQUE NOT NULL,
  FOREIGN KEY (id_lead) REFERENCES responsables(id_resp) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tareas (
  id_tarea                INT AUTO_INCREMENT PRIMARY KEY,
  id_proyecto             INT NOT NULL,
  id_parent               INT DEFAULT NULL,
  id_subresp              INT DEFAULT NULL,
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
  FOREIGN KEY (id_proyecto) REFERENCES proyectos(id_proyecto) ON DELETE CASCADE,
  FOREIGN KEY (id_parent)   REFERENCES tareas(id_tarea)       ON DELETE CASCADE,
  FOREIGN KEY (id_subresp)  REFERENCES subresponsables(id_subresp) ON DELETE SET NULL
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
  es_admin        TINYINT(1) DEFAULT 0,
  activo          TINYINT(1) DEFAULT 1,
  fecha_creacion  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- DATOS DE USUARIOS (Conservar Administrador)
-- ============================================================
INSERT IGNORE INTO usuarios (id_usuario, email, password_hash, nombre, permisos, proyectos, es_admin) VALUES
(1, 'admin@ovo2.com', '$2b$10$1zlV9usuJ4q0s5Gb8pmSkuG.2hEJDPZx7P/Esb26zKKh4osNZGtgS', 'Administrador', 'ALL', 'ALL', 1);

-- ============================================================
-- PROYECTOS REALES
-- ============================================================
INSERT INTO proyectos (id_proyecto, proyecto, nombre_proyecto, descripcion, color) VALUES
(1, 'P0001', 'Galpon 12', NULL, 'Red'),
(2, 'P0002', 'Ampliación servicios G12', NULL, 'Blue'),
(3, 'P0003', 'TGBT Postura 1', NULL, 'Green'),
(4, 'P0004', 'Grupos PPH', 'Planta procesadora de huevos', 'Black'),
(5, 'P0005', 'Ampliación servicios PPH', NULL, 'Orange'),
(6, 'P0006', 'Ampliación PPH', NULL, 'Purple'),
(7, 'P0007', 'Efluentes', NULL, 'Yellow');

-- ============================================================
-- RESPONSABLES REALES
-- ============================================================
INSERT INTO responsables (id_resp, nombre, correo, rol, equipo) VALUES
(1, 'FAdamoli', 'FAdamoli@ovobrand.com.ar', 'Technician', 'Civil'),
(2, 'JPLinari', 'JPLinari@ovobrand.com.ar', 'Manager', 'Compras'),
(3, 'GMorano', 'GMorano@ovobrand.com.ar', 'Technician', 'Mantenimiento'),
(4, 'FCaputo', 'FCaputo@ovobrand.com.ar', NULL, 'Industrial');

-- ============================================================
-- RECURSOS REALES
-- ============================================================
INSERT INTO recursos (id_recurso, nombre, area, rol, valor_hora) VALUES
(1, 'Juan', 'Mantenimiento', 'Electricista', 20000.00),
(2, 'Pedro', 'Mantenimiento', 'Mecánico', 20000.00),
(3, 'Lucas', 'Proyectos', 'LP', 25000.00),
(4, 'Mariano', 'Proyectos', 'LP', 25000.00),
(5, 'Germán', 'Gerencia', 'Gerente', 50000.00);

-- ============================================================
-- TAREAS REALES
-- ============================================================
INSERT INTO tareas (id_tarea, id_proyecto, tarea, descripcion, fecha_inicio, fecha_inicio_proyectada, duracion_dias, fecha_fin, estado, responsable, avance, dependencias, costo_tarea, recursos, fecha_creacion) VALUES
(1,1,'T0001','Obra civil G12','2026-03-01','2026-03-01',130,'2026-07-09','En proceso','GMorano@ovobrand.com.ar',5,NULL,3500000.00,'2 , 4','2026-03-26'),
(2,1,'T0002','Compra de materiales / cables','2026-07-15','2026-07-15',15,'2026-07-30','No comenzada','JPLinari@ovobrand.com.ar',0,NULL,2500000.00,'2','2026-03-26'),
(3,1,'T0003','Instalación electrica','2026-08-10','2026-08-10',100,'2026-11-18','No comenzada','GMorano@ovobrand.com.ar',0,'2',4500000.00,NULL,'2026-03-26'),
(4,2,'T0004','Ampliación sala de grupos POSTURA 2','2026-03-01','2026-03-01',60,'2026-04-30','En proceso','FAdamoli@ovobrand.com.ar',0,NULL,0,NULL,'2026-03-26'),
(5,2,'T0005','Armado de la tgbt','2026-04-01','2026-04-01',90,'2026-06-30','No comenzada','GMorano@ovobrand.com.ar',0,NULL,0,NULL,'2026-03-29'),
(6,2,'T0006','Montaje de la TGBT (Tablero general de baja tensión)','2026-07-01','2026-07-01',3,'2026-07-04','No comenzada','GMorano@ovobrand.com.ar',0,'5',2500000.00,NULL,NOW()),
(8,2,'T0008','Compra de los grupos','2026-04-01','2026-04-01',10,'2026-04-11','No comenzada','JPLinari@ovobrand.com.ar',0,NULL,3500000.00,NULL,NOW()),
(9,2,'T0009','Fabricación de grupos','2026-04-11','2026-04-11',140,'2026-08-29','No comenzada','GMorano@ovobrand.com.ar',0,'8',0,NULL,NOW()),
(10,2,'T0010','Montaje de grupos / coneccionado','2026-09-01','2026-09-01',10,'2026-09-11','No comenzada','GMorano@ovobrand.com.ar',0,'9',0,NULL,NOW()),
(11,2,'T0011','Tendido de potencia y bandejas al G12','2026-07-05','2026-07-05',20,'2026-07-25','No comenzada','GMorano@ovobrand.com.ar',0,'6',0,NULL,NOW()),
(12,3,'T0012','Ampliación sala de grupos POSTURA 1','2026-04-01','2026-04-01',15,'2026-04-16','No comenzada','FAdamoli@ovobrand.com.ar',0,NULL,0,NULL,NOW()),
(13,3,'T0013','Compra de los grupos','2026-04-01','2026-04-01',10,'2026-04-11','No comenzada','JPLinari@ovobrand.com.ar',0,NULL,0,NULL,NOW()),
(14,3,'T0014','Fabricación de grupos','2026-04-01','2026-04-01',90,'2026-06-30','No comenzada',NULL,0,NULL,0,NULL,NOW()),
(15,3,'T0015','Instalación de nuevos grupos','2026-04-01','2026-04-01',10,'2026-04-11','No comenzada','GMorano@ovobrand.com.ar',0,NULL,0,NULL,NOW()),
(33,2,'T0037','Cableado de los grupos (montaje bandejas, conexionado a TGBT)','2026-07-05','2026-07-05',10,'2026-07-15','No comenzada','GMorano@ovobrand.com.ar',0,'6',0,NULL,NOW());
