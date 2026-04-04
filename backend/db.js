const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');
require('dotenv').config();

let pool;

const TABLES = [
  `CREATE TABLE IF NOT EXISTS proyectos (
    id_proyecto     INT AUTO_INCREMENT PRIMARY KEY,
    proyecto        VARCHAR(50)  NOT NULL,
    nombre_proyecto VARCHAR(255) NOT NULL,
    descripcion     TEXT,
    color           VARCHAR(20)  DEFAULT '#6366f1'
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS recursos (
    id_recurso  INT AUTO_INCREMENT PRIMARY KEY,
    nombre      VARCHAR(255) NOT NULL,
    area        VARCHAR(100),
    rol         VARCHAR(100),
    valor_hora  DECIMAL(10,2) DEFAULT 0.00
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS subresponsables (
    id_subresp INT AUTO_INCREMENT PRIMARY KEY,
    id_lead    INT NOT NULL,
    nombre     VARCHAR(255) NOT NULL,
    correo     VARCHAR(255) UNIQUE NOT NULL,
    FOREIGN KEY (id_lead) REFERENCES responsables(id_resp) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS tareas (
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
    FOREIGN KEY (id_parent)   REFERENCES tareas(id_tarea)       ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS notas (
    id_nota    INT AUTO_INCREMENT PRIMARY KEY,
    tarea      INT NOT NULL,
    nota       TEXT,
    adjunto    VARCHAR(500),
    link       VARCHAR(500),
    autor      VARCHAR(255),
    fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tarea) REFERENCES tareas(id_tarea) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario      INT AUTO_INCREMENT PRIMARY KEY,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    nombre          VARCHAR(255) NOT NULL,
    permisos        VARCHAR(255) DEFAULT 'READ',
    proyectos       TEXT,
    es_admin        TINYINT(1) DEFAULT 0,
    activo          TINYINT(1) DEFAULT 1,
    fecha_creacion  DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `INSERT IGNORE INTO usuarios (id_usuario, email, password_hash, nombre, permisos, proyectos, es_admin) VALUES
  (1, 'admin@ovo2.com', '$2b$10$1zlV9usuJ4q0s5Gb8pmSkuG.2hEJDPZx7P/Esb26zKKh4osNZGtgS', 'Administrador', 'ALL', 'ALL', 1)`
];

async function initDB() {
  const dbName = process.env.DB_NAME || 'ovo2';

 // Conexión temporal sin BD para crearla
const tempConn = await mysql.createConnection({
  host    : process.env.DB_HOST     || 'localhost',
  port    : parseInt(process.env.DB_PORT || '3306'),
  user    : process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || ''
});

// 🔥 CAMBIO ACÁ
await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
await tempConn.query(`USE \`${dbName}\``);

// 🔥 Y ACÁ
for (const sql of TABLES) {
  await tempConn.query(sql);
}

await tempConn.end();

  // Pool principal
  pool = mysql.createPool({
    host            : process.env.DB_HOST     || 'localhost',
    port            : parseInt(process.env.DB_PORT || '3306'),
    user            : process.env.DB_USER     || 'root',
    password        : process.env.DB_PASSWORD || '',
    database        : dbName,
    waitForConnections: true,
    connectionLimit : 10,
    queueLimit      : 0,
    dateStrings     : true   // fechas como strings, sin problemas de timezone
  });

  console.log(`✅ Base de datos '${dbName}' lista`);
  return pool;
}

function getPool() {
  if (!pool) throw new Error('DB no inicializada. Llamar a initDB() primero.');
  return pool;
}

module.exports = { initDB, getPool };
