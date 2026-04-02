const express = require('express');
const cors    = require('cors');
const path    = require('path');
require('dotenv').config();

const { initDB }       = require('./db');
const tasksRouter      = require('./routes/tasks');
const projectsRouter   = require('./routes/projects');
const resourcesRouter  = require('./routes/resources');
const responsablesRouter = require('./routes/responsables');
const notesRouter      = require('./routes/notes');
const authRouter       = require('./routes/auth');
const usersRouter      = require('./routes/users');
const { requireAuth }  = require('./middleware/auth');

const app = express();

app.use(cors());
app.use(express.json());

// Sirve el frontend como archivos estáticos
app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes
app.use('/api/auth',        authRouter);
app.use('/api/users',       usersRouter); // Este internamente valida requireAuth y permisos 'ALL'

// Protegemos el resto de las rutas con JWT
app.use('/api/tasks',       requireAuth, tasksRouter);
app.use('/api/projects',    requireAuth, projectsRouter);
app.use('/api/resources',   requireAuth, resourcesRouter);
app.use('/api/responsables', requireAuth, responsablesRouter);
app.use('/api/notes',       requireAuth, notesRouter);

// Fallback → index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ─── Arranque ────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀 Gantt Tracker corriendo en: http://localhost:${PORT}\n`);
    });
  })
  .catch(err => {
    console.error('❌ Error al inicializar la base de datos:', err.message);
    console.error('   Verificá las credenciales en el archivo .env');
    process.exit(1);
  });
