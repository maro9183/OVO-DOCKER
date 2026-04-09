const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');
require('dotenv').config();

let pool;

/**
 * Motor de Migraciones Robusto e Idempotente
 * Ejecuta scripts SQL en orden numérico dentro de transacciones.
 */
async function runMigrations(connection) {
  console.log('🔍 Revisando migraciones...');
  
  // 1. Crear tabla de control si no existe
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(50) PRIMARY KEY,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. Leer archivos de la carpeta /migrations
  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.warn('⚠️ Carpeta /migrations no encontrada.');
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  // 3. Obtener migraciones ya ejecutadas
  const [executedRows] = await connection.query('SELECT version FROM schema_migrations');
  const executedVersions = new Set(executedRows.map(r => r.version));

  // 4. Ejecutar pendientes en orden
  for (const file of files) {
    // Validación estricta de naming
    if (!/^\d{3}_.*\.sql$/.test(file)) {
      throw new Error(`CRÍTICO: El archivo de migración "${file}" no cumple el formato 00N_description.sql`);
    }

    if (executedVersions.has(file)) continue;

    console.log(`🚀 Ejecutando migración: ${file}`);
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    // Ejecución transaccional por archivo
    await connection.beginTransaction();
    try {
      // Nota: habilitamos múltiples statements para permitir scripts complejos
      // Aunque con mysql2/promise y execute es mejor enviarlo todo junto si la conexión lo permite
      await connection.query(sql);
      
      await connection.query('INSERT INTO schema_migrations (version) VALUES (?)', [file]);
      await connection.commit();
      console.log(`✅ Migración ${file} completada con éxito`);
    } catch (err) {
      await connection.rollback();
      console.error(`❌ Error en migración ${file}:`, err.message);
      throw err; // Detener ejecución de migraciones
    }
  }
}

async function initDB() {
  const dbName = process.env.DB_NAME || 'ovo2';
  const maxRetries = 10;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      // Conexión inicial para asegurar base de datos y migraciones
      const config = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        multipleStatements: true // Crítico para scripts de migración
      };

      const tempConn = await mysql.createConnection(config);
      console.log(`📡 Conectado a MySQL (${config.host})...`);

      await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await tempConn.query(`USE \`${dbName}\``);

      // Ejecutar el motor de migraciones
      await runMigrations(tempConn);

      await tempConn.end();

      // Inicializar Pool principal
      pool = mysql.createPool({
        ...config,
        database: dbName,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        dateStrings: true
      });

      console.log(`✅ Base de datos '${dbName}' y migraciones listas.`);
      return pool;
    } catch (err) {
      retries++;
      if (err.code === 'ECONNREFUSED' && retries < maxRetries) {
        console.log(`⏳ DB no lista. Reintentando... (${retries}/${maxRetries})`);
        await new Promise(res => setTimeout(res, 3000));
      } else {
        throw err;
      }
    }
  }
}

function getPool() {
  if (!pool) throw new Error('DB no inicializada.');
  return pool;
}

module.exports = { initDB, getPool };
