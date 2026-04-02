# Gantt Tracker

Sistema interactivo de seguimiento de proyectos con diagrama de Gantt.

## Stack
- **Frontend**: HTML + Vanilla JS + dhtmlx-gantt (GPL)
- **Backend**: Node.js + Express
- **Base de datos**: MySQL 8

## Estructura

```
OVO2/
├── backend/          → API Node.js/Express
│   ├── .env          → Credenciales DB (editar antes de arrancar)
│   ├── server.js     → Entrada principal
│   ├── db.js         → Pool MySQL + auto-creación de BD
│   ├── logic/
│   │   ├── dates.js      → Cálculo fechas (calendario / laboral)
│   │   └── propagate.js  → Propagación cascada + detección de ciclos
│   └── routes/
│       ├── tasks.js
│       ├── projects.js
│       ├── resources.js
│       ├── responsables.js
│       └── notes.js
├── frontend/         → HTML/CSS/JS estático servido por Express
│   ├── index.html
│   ├── css/app.css
│   └── js/
│       ├── api.js
│       ├── gantt-init.js
│       └── ui.js
└── sql/schema.sql    → Schema de referencia (la BD se crea automáticamente)
```

## Instalación y arranque

### 1. Configurar credenciales
Editá `backend/.env`:
```
DB_HOST=localhost
DB_PORT=3306
DB_NAME=ovo2
DB_USER=root
DB_PASSWORD=tu_password
PORT=3000
```

### 2. Instalar dependencias
```bash
cd backend
npm install
```

### 3. Arrancar el servidor
```bash
npm start        # producción
npm run dev      # desarrollo con hot-reload (nodemon)
```

La base de datos `ovo2` y todas las tablas **se crean automáticamente** al arrancar.

### 4. Abrir en el navegador
```
http://localhost:3000
```

## Features

- ✅ Diagrama de Gantt interactivo (drag & drop, resize, progress drag)
- ✅ Creación / edición / eliminación de tareas
- ✅ Dependencias Finish-to-Start con propagación en cascada
- ✅ Detección y prevención de ciclos de dependencias
- ✅ Por tarea: elección entre días **calendario** o **laborales (Lun-Sáb)**
- ✅ Cálculo automático de `fecha_fin` y `fecha_inicio_proyectada`
- ✅ Estados automáticos: No comenzada / En progreso / Finalizada
- ✅ Gestión de proyectos con colores
- ✅ Notas por tarea
- ✅ Transacciones MySQL (consistencia)
- ✅ Diseño dark premium responsive

## API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /api/projects | Lista proyectos |
| POST | /api/projects | Crear proyecto |
| GET | /api/projects/:id/tasks | Tareas de un proyecto |
| GET | /api/tasks | Todas las tareas |
| POST | /api/tasks | Crear tarea |
| PUT | /api/tasks/:id | Actualizar + propagar |
| DELETE | /api/tasks/:id | Eliminar tarea |
| GET | /api/tasks/:id/notes | Notas de una tarea |
| POST | /api/notes | Agregar nota |
| DELETE | /api/notes/:id | Eliminar nota |
| GET | /api/resources | Recursos |
| GET | /api/responsables | Responsables |
