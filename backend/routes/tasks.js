const express = require('express');
const router  = express.Router();
const { getPool }                    = require('../db');
const { calcFechaFin, calcEstado, formatDate, parseDate } = require('../logic/dates');
const { detectCycle, propagateTasks } = require('../logic/propagate');
const { requirePermission, requireProjectAccess } = require('../middleware/auth');

// ─── Helpers ────────────────────────────────────────────────────────────────

async function calcEffectiveStart(conn, dependencias, fecha_inicio, tipo_dias) {
  const depIds = (dependencias || '').split(',').map(d => d.trim()).filter(Boolean);
  if (depIds.length === 0) return { effectiveStart: fecha_inicio, fechaInicioProy: null };

  const ph = depIds.map(() => '?').join(',');
  const [depTasks] = await conn.execute(
    `SELECT fecha_fin FROM tareas WHERE id_tarea IN (${ph})`, depIds
  );
  if (depTasks.length === 0) return { effectiveStart: fecha_inicio, fechaInicioProy: null };

  const maxFin = depTasks.reduce((max, t) => {
    const d = parseDate(t.fecha_fin);
    return d && d > max ? d : max;
  }, new Date(0));

  // La tarea dependiente comienza AL DÍA SIGUIENTE de la última dependencia
  maxFin.setUTCDate(maxFin.getUTCDate() + 1);
  
  // Si cae domingo y es calendario laboral, lo pateamos a lunes
  if (tipo_dias === 'laboral' && maxFin.getUTCDay() === 0) {
    maxFin.setUTCDate(maxFin.getUTCDate() + 1);
  }

  const fechaInicioProy = formatDate(maxFin);
  return { effectiveStart: maxFin, fechaInicioProy };
}

// ─── GET /api/tasks ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    let sql = 'SELECT * FROM tareas ORDER BY fecha_inicio, id_tarea';
    let params = [];
    
    // Filtro por usuario
    if (req.user && req.user.proyectos !== 'ALL') {
      const allowedIds = req.user.proyectos.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x));
      if (allowedIds.length === 0) return res.json([]); // Ningun proyecto disponible
      
      sql = `SELECT * FROM tareas WHERE id_proyecto IN (${allowedIds.join(',')}) ORDER BY fecha_inicio, id_tarea`;
    }
    
    const [rows] = await getPool().execute(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/tasks/:id ──────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await getPool().execute(
      'SELECT * FROM tareas WHERE id_tarea = ?', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/tasks/:id/notes ────────────────────────────────────────────────
router.get('/:id/notes', async (req, res) => {
  try {
    const [rows] = await getPool().execute(
      'SELECT * FROM notas WHERE tarea = ? ORDER BY fecha_hora DESC', [req.params.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/tasks ─────────────────────────────────────────────────────────
router.post('/', requirePermission('CREATE'), requireProjectAccess, async (req, res) => {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();

    const {
      id_proyecto, tarea, descripcion, fecha_inicio,
      duracion_dias = 1, responsable = null,
      avance = 0, dependencias = '', recursos = '',
      tipo_dias = 'calendario', notificado = 0,
      costo_tarea = 0
    } = req.body;

    if (!id_proyecto || !tarea || !fecha_inicio)
      return res.status(400).json({ error: 'id_proyecto, tarea y fecha_inicio son requeridos' });

    const { effectiveStart, fechaInicioProy } = await calcEffectiveStart(
      conn, dependencias, fecha_inicio, tipo_dias
    );
    const fechaFin = formatDate(calcFechaFin(effectiveStart, duracion_dias, tipo_dias));
    const estado   = calcEstado(avance);

    const [result] = await conn.execute(
      `INSERT INTO tareas
         (id_proyecto, tarea, descripcion, fecha_inicio, fecha_inicio_proyectada,
          duracion_dias, fecha_fin, estado, responsable, avance,
          dependencias, recursos, tipo_dias, notificado, costo_tarea)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id_proyecto, tarea, descripcion || null, fecha_inicio, fechaInicioProy,
       duracion_dias, fechaFin, estado, responsable,
       avance, dependencias || null, recursos || null, tipo_dias, notificado, costo_tarea]
    );

    await conn.commit();
    const [newTask] = await getPool().execute(
      'SELECT * FROM tareas WHERE id_tarea = ?', [result.insertId]
    );
    res.status(201).json({ task: newTask[0], updatedTasks: [newTask[0]] });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally { conn.release(); }
});

// ─── PUT /api/tasks/:id ──────────────────────────────────────────────────────
router.put('/:id', requirePermission('UPDATE'), requireProjectAccess, async (req, res) => {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;

    const [cur] = await conn.execute('SELECT * FROM tareas WHERE id_tarea = ?', [id]);
    if (!cur.length) { await conn.rollback(); return res.status(404).json({ error: 'Tarea no encontrada' }); }

    const task   = { ...cur[0], ...req.body };

    // Validar ciclos si cambiaron las dependencias
    if (req.body.dependencias !== undefined && req.body.dependencias !== cur[0].dependencias) {
      const newDeps = (req.body.dependencias || '').split(',').map(d => d.trim()).filter(Boolean);
      for (const depId of newDeps) {
        if (await detectCycle(conn, parseInt(id), parseInt(depId))) {
          await conn.rollback();
          return res.status(400).json({ error: `La dependencia ${depId} crea un ciclo` });
        }
      }
    }

    const { effectiveStart, fechaInicioProy } = await calcEffectiveStart(
      conn, task.dependencias, task.fecha_inicio, task.tipo_dias
    );
    const fechaFin = formatDate(calcFechaFin(effectiveStart, task.duracion_dias, task.tipo_dias));
    const estado   = calcEstado(task.avance);

    await conn.execute(
      `UPDATE tareas SET
         id_proyecto=?, tarea=?, descripcion=?,
         fecha_inicio=?, fecha_inicio_proyectada=?,
         duracion_dias=?, fecha_fin=?,
         estado=?, responsable=?, avance=?,
         dependencias=?, recursos=?,
         tipo_dias=?, notificado=?,
         fecha_iniciada=?, fecha_finalizada=?,
         costo_tarea=?
       WHERE id_tarea=?`,
      [
        task.id_proyecto, task.tarea, task.descripcion || null,
        task.fecha_inicio, fechaInicioProy,
        task.duracion_dias, fechaFin,
        estado, task.responsable || null, task.avance,
        task.dependencias || null, task.recursos || null,
        task.tipo_dias, task.notificado ? 1 : 0,
        task.fecha_iniciada || null, task.fecha_finalizada || null,
        task.costo_tarea !== undefined ? task.costo_tarea : 0,
        id
      ]
    );

    const updatedTasks = await propagateTasks(conn, parseInt(id));
    const [updatedRow] = await conn.execute('SELECT * FROM tareas WHERE id_tarea = ?', [id]);

    await conn.commit();
    res.json({ task: updatedRow[0], updatedTasks: [updatedRow[0], ...updatedTasks] });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally { conn.release(); }
});

// ─── DELETE /api/tasks/:id ───────────────────────────────────────────────────
router.delete('/:id', requirePermission('DELETE'), async (req, res) => {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;

    // Limpiar este ID de los campos dependencias de otras tareas
    await conn.execute(
      `UPDATE tareas
       SET dependencias = NULLIF(
         TRIM(BOTH ',' FROM
           REPLACE(
             REPLACE(CONCAT(',', IFNULL(dependencias,''), ','), CONCAT(',',?-0,','), ','),
           ',,', ',')),
         '')
       WHERE FIND_IN_SET(?, IFNULL(dependencias,'')) > 0`,
      [id, id]
    );

    await conn.execute('DELETE FROM tareas WHERE id_tarea = ?', [id]);
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally { conn.release(); }
});

module.exports = router;
