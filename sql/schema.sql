-- ============================================================
-- GANTT PROJECT TRACKER - Unified Schema (Ovo2)
-- updated with REAL DATA and Normalized Structure
-- ============================================================

-- 1. Bases de datos y configuraciones iniciales
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 2. Estructura de Tablas

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
  id_resp                 INT DEFAULT NULL,
  tarea                   VARCHAR(100),
  descripcion             TEXT,
  fecha_inicio            DATE,
  fecha_inicio_proyectada DATE,
  fecha_fin_proyectada    DATE,
  fecha_real_iniciada     DATE,
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
  auto_retrasada          TINYINT(1) DEFAULT 0,
  es_compra               TINYINT(1) DEFAULT 0,
  FOREIGN KEY (id_proyecto) REFERENCES proyectos(id_proyecto) ON DELETE CASCADE,
  FOREIGN KEY (id_parent)   REFERENCES tareas(id_tarea)       ON DELETE CASCADE,
  FOREIGN KEY (id_subresp)  REFERENCES subresponsables(id_subresp) ON DELETE SET NULL,
  FOREIGN KEY (id_resp)     REFERENCES responsables(id_resp) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dependencias (
  id_dependencia INT AUTO_INCREMENT PRIMARY KEY,
  id_tarea       INT NOT NULL,
  id_predecesora VARCHAR(50) NOT NULL,
  tipo           VARCHAR(10) DEFAULT 'FS',
  lag_dias       INT DEFAULT 0,
  FOREIGN KEY (id_tarea) REFERENCES tareas(id_tarea) ON DELETE CASCADE,
  UNIQUE KEY uq_dep (id_tarea, id_predecesora)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

CREATE TABLE IF NOT EXISTS compras (
  id_compra               INT AUTO_INCREMENT PRIMARY KEY,
  id_tarea                INT DEFAULT NULL,
  id_proyecto             INT DEFAULT NULL,
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
  dependencias            TEXT,
  links_facturas          TEXT,
  fecha_creacion          DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_tarea)       REFERENCES tareas(id_tarea)      ON DELETE SET NULL,
  FOREIGN KEY (id_proyecto)    REFERENCES proyectos(id_proyecto) ON DELETE SET NULL,
  FOREIGN KEY (id_solicitante) REFERENCES responsables(id_resp)  ON DELETE SET NULL,
  FOREIGN KEY (id_responsable) REFERENCES responsables(id_resp)  ON DELETE SET NULL
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
  permisos        VARCHAR(255) DEFAULT 'READ',
  proyectos       TEXT,
  es_admin        TINYINT(1) DEFAULT 0,
  activo          TINYINT(1) DEFAULT 1,
  fecha_creacion  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Inserción de DATOS REALES

TRUNCATE TABLE dependencias;
TRUNCATE TABLE tarea_recursos;
TRUNCATE TABLE compras;
TRUNCATE TABLE notas;
TRUNCATE TABLE tareas;
TRUNCATE TABLE subresponsables;
TRUNCATE TABLE responsables;
TRUNCATE TABLE recursos;
TRUNCATE TABLE proyectos;

INSERT IGNORE INTO proyectos (id_proyecto, proyecto, nombre_proyecto, descripcion, color) VALUES 
(1,'P0001','Galpon 12',NULL,'Red'),
(2,'P0002','Ampliación servicios G12',NULL,'Blue'),
(3,'P0003','TGBT Postura 1',NULL,'Green'),
(4,'P0004','Grupos PPH','Planta procesadora de huevos','Black'),
(5,'P0005','Ampliación servicios PPH',NULL,'Orange'),
(6,'P0006','Ampliación PPH',NULL,'Purple'),
(7,'P0007','Efluentes',NULL,'Yellow');

INSERT IGNORE INTO responsables (id_resp, nombre, correo, rol, equipo, foto) VALUES 
(1,'FAdamoli','FAdamoli@ovobrand.com.ar','Technician','Civil',NULL),
(2,'JPLinari','JPLinari@ovobrand.com.ar','Manager','Compras',NULL),
(3,'GMorano','GMorano@ovobrand.com.ar','Technician','Mantenimiento',NULL),
(4,'FCaputo','FCaputo@ovobrand.com.ar',NULL,'Industrial',NULL);

INSERT IGNORE INTO recursos (id_recurso, nombre, area, rol, valor_hora) VALUES 
(1,'Juan','Mantenimiento','Electricista',20000.00),
(2,'Pedro','Mantenimiento','Mecánico',20000.00),
(3,'Lucas','Proyectos','LP',25000.00),
(4,'Mariano','Proyectos','LP',25000.00),
(5,'Germán','Gerencia','Gerente',50000.00);

INSERT IGNORE INTO subresponsables (id_subresp, id_lead, nombre, correo) VALUES 
(1,3,'Mariano','mariano@ovobrand.com');

-- Inserción de tareas con transformación de id_resp y fechas baseline
INSERT INTO tareas (id_tarea, id_proyecto, id_parent, id_subresp, id_resp, tarea, descripcion, fecha_inicio, fecha_inicio_proyectada, fecha_fin_proyectada, fecha_real_iniciada, duracion_dias, fecha_fin, fecha_completada, estado, responsable, avance, dependencias, recursos, costo_tarea, tipo_dias) VALUES 
(1,1,NULL,NULL,3,'T0001','Obra civil G12','2026-03-01','2026-03-01','2026-06-24','2026-03-01',116,'2026-06-24',NULL,'En progreso','GMorano@ovobrand.com.ar',5.00,NULL,'4,2',3500000.00,'calendario'),
(2,1,NULL,NULL,2,'T0002','Compra de materiales / cables','2026-07-15','2026-07-15','2026-07-30',NULL,15,'2026-07-30',NULL,'No comenzada','JPLinari@ovobrand.com.ar',0.00,NULL,'2',2500000.00,'calendario'),
(3,1,NULL,NULL,3,'T0003','Instalación electrica','2026-08-10','2026-08-10','2026-11-18',NULL,100,'2026-11-18',NULL,'No comenzada','GMorano@ovobrand.com.ar',0.00,'2',NULL,4500000.00,'calendario'),
(4,2,NULL,NULL,1,'T0004','Ampliación sala de grupos POSTURA 2','2026-03-01','2026-03-01','2026-04-30','2026-03-01',61,'2026-04-30',NULL,'En progreso','FAdamoli@ovobrand.com.ar',3.00,NULL,NULL,0.00,'calendario'),
(5,2,NULL,NULL,3,'T0005','Armado de la tgbt','2026-04-01','2026-04-01','2026-06-30',NULL,91,'2026-06-30',NULL,'No comenzada','GMorano@ovobrand.com.ar',0.00,NULL,NULL,0.00,'calendario'),
(6,2,NULL,NULL,3,'T0006','Montaje de la TGBT (Tablero general de baja tensión)','2026-07-01','2026-07-01','2026-07-02',NULL,3,'2026-07-02',NULL,'No comenzada','GMorano@ovobrand.com.ar',0.00,'5',NULL,2500000.00,'calendario'),
(7,2,NULL,NULL,3,'T0007','Recableado TGBT','2026-07-04','2026-07-03','2026-07-11',NULL,10,'2026-07-11',NULL,'No comenzada','GMorano@ovobrand.com.ar',0.00,'6',NULL,0.00,'calendario'),
(8,2,NULL,NULL,2,'T0008','Compra de los grupos','2026-04-01','2026-04-01','2026-04-11',NULL,10,'2026-04-11',NULL,'No comenzada','JPLinari@ovobrand.com.ar',0.00,NULL,NULL,3500000.00,'calendario'),
(9,2,NULL,NULL,3,'T0009','Fabricación de grupos','2026-04-11','2026-04-11','2026-08-29',NULL,140,'2026-08-29',NULL,'No comenzada','GMorano@ovobrand.com.ar',0.00,'8',NULL,0.00,'calendario'),
(10,2,NULL,NULL,3,'T0010','Montaje de grupos / coneccionado','2026-09-01','2026-09-01','2026-09-11',NULL,10,'2026-09-11',NULL,'No comenzada','GMorano@ovobrand.com.ar',0.00,'9',NULL,0.00,'calendario'),
(11,2,NULL,NULL,3,'T0011','Tendido de potencia y bandejas al G12','2026-07-05','2026-07-03','2026-07-21',NULL,20,'2026-07-21',NULL,'No comenzada','GMorano@ovobrand.com.ar',0.00,'6',NULL,0.00,'calendario'),
(12,3,NULL,NULL,1,'T0012','Ampliación sala de grupos POSTURA 1','2026-04-01','2026-04-01','2026-04-16',NULL,15,'2026-04-16',NULL,'No comenzada','FAdamoli@ovobrand.com.ar',0.00,NULL,NULL,0.00,'calendario'),
(13,3,NULL,NULL,2,'T0013','Compra de los grupos','2026-04-01','2026-04-01','2026-04-11',NULL,10,'2026-04-11',NULL,'No comenzada','JPLinari@ovobrand.com.ar',0.00,NULL,NULL,0.00,'calendario'),
(14,3,NULL,NULL,NULL,'T0014','Fabricación de grupos','2026-04-01','2026-04-01','2026-06-30',NULL,90,'2026-06-30',NULL,'No comenzada',NULL,0.00,NULL,NULL,0.00,'calendario'),
(15,3,NULL,NULL,3,'T0015','Instalación de nuevos grupos','2026-04-01','2026-04-01','2026-04-11',NULL,10,'2026-04-11',NULL,'No comenzada','GMorano@ovobrand.com.ar',0.00,NULL,NULL,0.00,'calendario'),
(16,4,NULL,NULL,NULL,'T0016','Ampliación sala de grupos PPH','2026-04-01','2026-04-01','2026-04-21',NULL,20,'2026-04-21',NULL,'No comenzada',NULL,0.00,NULL,NULL,0.00,'calendario'),
(17,4,NULL,NULL,NULL,'T0017','Compra de los grupos','2026-04-01','2026-04-01','2026-04-11',NULL,10,'2026-04-11',NULL,'No comenzada',NULL,0.00,NULL,NULL,0.00,'calendario'),
(18,4,NULL,NULL,NULL,'T0018','Fabricación de grupos','2026-04-01','2026-04-01','2026-06-30',NULL,90,'2026-06-30',NULL,'No comenzada',NULL,0.00,NULL,NULL,0.00,'calendario'),
(19,4,NULL,NULL,3,'T0019','Instalación de nuevos grupos','2026-04-01','2026-04-01','2026-04-11',NULL,10,'2026-04-11',NULL,'No comenzada','GMorano@ovobrand.com.ar',0.00,NULL,NULL,0.00,'calendario'),
(20,5,NULL,NULL,NULL,'T0020','Caldera','2026-04-01','2026-04-01','2026-04-01',NULL,1,'2026-04-01',NULL,'No comenzada',NULL,0.00,NULL,NULL,0.00,'calendario'),
(21,5,NULL,NULL,NULL,'T0021','Armado de equipos frio','2026-04-01','2026-04-01','2026-08-29',NULL,150,'2026-08-29',NULL,'No comenzada',NULL,0.00,NULL,NULL,0.00,'calendario'),
(22,5,NULL,NULL,NULL,'T0022','Frío (VMC)','2026-04-01','2026-04-01','2026-06-30',NULL,90,'2026-06-30',NULL,'No comenzada',NULL,0.00,NULL,NULL,0.00,'calendario'),
(23,6,NULL,NULL,NULL,'T0023','Equipos sanovo','2026-04-01','2026-04-01','2026-09-18',NULL,170,'2026-09-18',NULL,'No comenzada',NULL,0.00,NULL,NULL,0.00,'calendario'),
(24,6,NULL,NULL,NULL,'T0024','Tendido electrico','2026-04-13','2026-04-13','2026-05-10',NULL,28,'2026-05-10',NULL,'No comenzada',NULL,0.00,NULL,NULL,0.00,'calendario'),
(25,6,NULL,NULL,NULL,'T0025','Tanques / Nueva sala','2026-04-01','2026-04-01','2026-08-19',NULL,140,'2026-08-19',NULL,'No comenzada',NULL,0.00,NULL,NULL,0.00,'calendario'),
(26,6,NULL,NULL,NULL,'T0026','Tendido electrico','2026-04-01','2026-04-01','2026-04-11',NULL,10,'2026-04-11',NULL,'No comenzada',NULL,0.00,NULL,NULL,0.00,'calendario'),
(27,6,NULL,NULL,NULL,'T0027','Instalción electrica','2026-04-01','2026-04-01','2026-05-11',NULL,40,'2026-05-11',NULL,'No comenzada',NULL,0.00,NULL,NULL,0.00,'calendario'),
(28,1,NULL,NULL,NULL,'T0028','Montaje mecánica (jaulas, niagras, alimento, recojida de guano)','2026-06-20','2026-06-20','2026-10-28',NULL,130,'2026-10-28',NULL,'No comenzada',NULL,0.00,NULL,NULL,0.00,'calendario'),
(29,1,NULL,NULL,NULL,'T0029','Fabricación de recogida de guano','2026-05-01','2026-05-01','2026-09-08',NULL,130,'2026-09-08',NULL,'No comenzada',NULL,0.00,NULL,NULL,0.00,'calendario'),
(30,1,NULL,NULL,NULL,'T0030','Montaje recogida de guano','2026-09-10','2026-09-10','2026-09-30',NULL,20,'2026-09-30',NULL,'No comenzada',NULL,0.00,NULL,NULL,0.00,'calendario'),
(31,1,NULL,NULL,NULL,'T0031','Fabricación cadena de transporte de huevos','2026-05-01','2026-05-01','2026-08-29',NULL,120,'2026-08-29',NULL,'No comenzada',NULL,0.00,NULL,NULL,0.00,'calendario'),
(32,1,NULL,NULL,NULL,'T0032','Montaje cadena de transporte de huevos','2026-09-01','2026-09-01','2026-10-31',NULL,60,'2026-10-31',NULL,'No comenzada',NULL,0.00,'31',NULL,0.00,'calendario'),
(33,2,NULL,NULL,3,'T0037','Cableado de los grupos (montaje bandejas, conexionado a TGBT)','2026-07-05','2026-07-03','2026-07-11',NULL,10,'2026-07-11',NULL,'No comenzada','GMorano@ovobrand.com.ar',0.00,'6',NULL,0.00,'calendario'),
(36,1,1,1,3,'Prueba','Obra civil','2026-03-01','2026-03-01','2026-06-24','2026-03-01',116,'2026-06-24',NULL,'En progreso','GMorano@ovobrand.com.ar',10.00,NULL,NULL,0.00,'calendario');

-- Inserción de dependencias normalizadas (FS = Finish to Start)
INSERT INTO dependencias (id_tarea, id_predecesora, tipo) VALUES 
(3, 2, 'FS'),
(6, 5, 'FS'),
(7, 6, 'FS'),
(9, 8, 'FS'),
(10, 9, 'FS'),
(11, 6, 'FS'),
(32, 31, 'FS'),
(33, 6, 'FS');

-- Inserción de recursos por tarea (Normalizado)
INSERT INTO tarea_recursos (id_tarea, id_recurso) VALUES 
(1, 4),
(1, 2),
(2, 2);

-- Usuarios iniciales
INSERT IGNORE INTO usuarios (id_usuario, email, password_hash, nombre, permisos, proyectos, activo, fecha_creacion, es_admin) VALUES 
(1, 'admin@ovo2.com', '$2b$10$OW9VCxm2P28LbIV8iE8npOk5kYyXoc/SkAK.kRoHbys4ZSXxUGuAW', 'Administrador', 'ALL', 'ALL', 1, '2026-04-02 18:37:59', 1),
(3, 'GMorano@ovobrand.com.ar', '$2b$10$niet03sbVulknGemlyN1f.EKAGAPwXhfsldbx2Mok5u1Uyj0pAiGy', 'GermanMorano', 'ALL', 'ALL', 1, '2026-04-02 19:19:49', 0);

SET FOREIGN_KEY_CHECKS = 1;
