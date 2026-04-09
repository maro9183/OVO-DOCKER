const express = require('express');
const router  = express.Router();
const { getPool }                    = require('../db');
const { calcFechaFin, calcEstado, formatDate, parseDate } = require('../logic/dates');
const { detectCycle, propagateTasks } = require('../logic/propagate');
const { recalcParentBounds } = require('../logic/recalc');
const { requirePermission, requireProjectAccess } = require('../middleware/auth');

// ─── CONFIGURACIÓN CENTRALIZADA (Production-Grade) ──────────────────────────

const TASK_COLUMNS = [
  'id_tarea', 'id_proyecto', 'id_parent', 'id_subresp', 'id_resp', 
  'tarea', 'descripcion', 'fecha_inicio', 'fecha_fin', 
  'fecha_inicio_proyectada', 'fecha_fin_proyectada', 'fecha_real_iniciada',
  'duracion_dias', 'fecha_completada', 'estado', 'responsable', 
  'avance', 'dependencias', 'costo_tarea', 'fecha_creacion', 
  'notificado', 'recursos', 'tipo_dias', 'auto_retrasada', 'es_compra'
];

const TIMING_FIELDS = ['tarea', 'descripcion', 'fecha_inicio', 'duracion_dias', 'tipo_dias', 'avance'];

const UPDATE_WHITELIST = [
  ...TASK_COLUMNS.filter(c => !['id_tarea', 'fecha_creacion'].includes(c)),
  'dependencias', 'recursos', 'compraData'
];

function validateWhitelist(payload, whitelist) {
  const keys = Object.keys(payload);
  if (keys.length === 0) {
    const err = new Error('El cuerpo de la petición no puede estar vacío');
    err.status = 400;
    throw err;
  }
  for (const key of keys) {
    if (!whitelist.includes(key)) {
      const err = new Error(`Campo no permitido: ${key}`);
      err.status = 400;
      throw err;
    }
  }
}

/**
 * Parsea un string CSV de IDs (mezcla de números y pur_ID) a un array.
 */
function parseCsvIds(val) {
  if (!val) return [];
  return val.toString().split(',').map(s => {
    const trimmed = s.trim();
    return isNaN(trimmed) ? trimmed : parseInt(trimmed);
  }).filter(Boolean);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function calcEffectiveStart(conn, tareaId, fecha_inicio, tipo_dias) {
  if (!tareaId) return { effectiveStart: fecha_inicio, fechaInicioProy: null };
  const [predRows] = await conn.execute(
    `SELECT d.id_predecesora, t.id_tarea, t.es_compra, t.fecha_fin_proyectada,
            c.fecha_arribo_necesaria, c.fecha_comprometida, c.fecha_entregado
     FROM dependencias d
     LEFT JOIN tareas t ON d.id_predecesora = t.id_tarea
     LEFT JOIN compras c ON d.id_predecesora = CONCAT('pur_', c.id_compra) OR t.id_tarea = c.id_tarea
     WHERE d.id_tarea = ?`, [tareaId]
  );
  if (predRows.length === 0) return { effectiveStart: fecha_inicio, fechaInicioProy: null };
  const maxFin = predRows.reduce((max, row) => {
    let refDate;
    if (row.es_compra || !row.id_tarea) {
      const d1 = parseDate(row.fecha_arribo_necesaria) || new Date(0);
      const d2 = parseDate(row.fecha_comprometida) || new Date(0);
      const d3 = parseDate(row.fecha_entregado) || new Date(0);
      refDate = new Date(Math.max(d1, d2, d3));
    } else { refDate = parseDate(row.fecha_fin_proyectada) || new Date(0); }
    return refDate > max ? refDate : max;
  }, new Date(0));
  maxFin.setUTCDate(maxFin.getUTCDate() + 1);
  if (tipo_dias === 'laboral' && maxFin.getUTCDay() === 0) maxFin.setUTCDate(maxFin.getUTCDate() + 1);
  const fechaInicioProy = formatDate(maxFin);
  return { effectiveStart: maxFin, fechaInicioProy };
}

async function syncDependencias(conn, tareaId, nuevasPredIds) {
  // Ahora la tabla física soporta IDs mixtos (ej. 'pur_1' y '24')
  const allowedIds = nuevasPredIds.filter(id => id !== undefined && id !== null && id !== '').map(String);

  const [current] = await conn.execute('SELECT id_predecesora FROM dependencias WHERE id_tarea = ?', [tareaId]);
  const currentIds = current.map(r => String(r.id_predecesora));
  
  const toAdd    = allowedIds.filter(id => !currentIds.includes(id));
  const toRemove = currentIds.filter(id => !allowedIds.includes(id));
  
  for (const id of toRemove) await conn.execute('DELETE FROM dependencias WHERE id_tarea = ? AND id_predecesora = ?', [tareaId, id]);
  for (const id of toAdd) await conn.execute('INSERT IGNORE INTO dependencias (id_tarea, id_predecesora) VALUES (?, ?)', [tareaId, id]);
}

async function syncRecursos(conn, tareaId, nuevosRecIds) {
  const [current] = await conn.execute('SELECT id_recurso FROM tarea_recursos WHERE id_tarea = ?', [tareaId]);
  const currentIds = current.map(r => r.id_recurso);
  const toDelete = currentIds.filter(id => !nuevosRecIds.includes(id));
  const toAdd    = nuevosRecIds.filter(id => !currentIds.includes(id));
  for (const id of toDelete) await conn.execute('DELETE FROM tarea_recursos WHERE id_tarea = ? AND id_recurso = ?', [tareaId, id]);
  for (const id of toAdd) await conn.execute('INSERT INTO tarea_recursos (id_tarea, id_recurso) VALUES (?, ?)', [tareaId, id]);
}

async function applyLazyRescheduling(pool, projectIds = null) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let sql = `SELECT id_tarea FROM tareas WHERE fecha_completada IS NULL AND fecha_fin_proyectada < CURDATE()`;
    let params = [];
    if (projectIds && projectIds.length > 0) {
      sql += ` AND id_proyecto IN (${projectIds.map(() => '?').join(',')})`;
      params = projectIds;
    }
    const [overdue] = await conn.execute(sql, params);
    if (overdue.length > 0) {
      for (const row of overdue) {
        await conn.execute(`UPDATE tareas SET fecha_fin_proyectada = CURDATE(), auto_retrasada = 1 WHERE id_tarea = ?`, [row.id_tarea]);
        await propagateTasks(conn, row.id_tarea);
      }
    }
    await conn.commit();
  } catch (err) { await conn.rollback(); } finally { conn.release(); }
}

// ─── QUERY BUILDERS ──────────────────────────────────────────────────────────

const SELECT_BLOCK = TASK_COLUMNS.map(c => `t.${c}`).join(', ');
const EXTRA_FIELDS = `,
  (SELECT COUNT(*) FROM notas n WHERE n.tarea = t.id_tarea) as note_count,
  sr.nombre as subresponsable_nombre,
  COALESCE((SELECT GROUP_CONCAT(id_recurso ORDER BY id_recurso) FROM tarea_recursos WHERE id_tarea = t.id_tarea), "") AS recursos,
  c.cantidad, c.valor_unitario, c.fecha_solicitud, c.fecha_arribo_necesaria, 
  c.fecha_oc_emitida, c.fecha_comprometida, c.fecha_entregado
`;
const JOIN_PART = `
  LEFT JOIN subresponsables sr ON t.id_subresp = sr.id_subresp
  LEFT JOIN compras c ON c.id_tarea = t.id_tarea
`;

async function fetchTaskWithExtras(conn, id) {
  const [rows] = await conn.execute(`SELECT ${SELECT_BLOCK} ${EXTRA_FIELDS} FROM tareas t ${JOIN_PART} WHERE t.id_tarea = ?`, [id]);
  return rows[0];
}

// ─── ENDPOINTS ──────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    await applyLazyRescheduling(getPool());
    let sql = `SELECT ${SELECT_BLOCK} ${EXTRA_FIELDS} FROM tareas t ${JOIN_PART} ORDER BY t.fecha_inicio, t.id_tarea`;
    if (req.user && req.user.proyectos !== 'ALL') {
      const allowedIds = req.user.proyectos.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x));
      if (allowedIds.length === 0) return res.json([]);
      sql = sql.replace('ORDER BY', `WHERE t.id_proyecto IN (${allowedIds.join(',')}) ORDER BY`);
    }
    const [rows] = await getPool().execute(sql);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    await applyLazyRescheduling(getPool(), [projectId]);
    const [rows] = await getPool().execute(
      `SELECT ${SELECT_BLOCK} ${EXTRA_FIELDS} FROM tareas t ${JOIN_PART} WHERE t.id_proyecto = ? ORDER BY t.fecha_inicio, t.id_tarea`, 
      [projectId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const task = await fetchTaskWithExtras(getPool(), req.params.id);
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.json(task);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', requirePermission('CREATE'), requireProjectAccess, async (req, res) => {
  const conn = await getPool().getConnection();
  try {
    validateWhitelist(req.body, UPDATE_WHITELIST);
    await conn.beginTransaction();
    const { id_proyecto, id_parent = null, id_subresp = null, id_resp = null, tarea, fecha_inicio, duracion_dias = 1, avance = 0, tipo_dias = 'calendario' } = req.body;
    if (!id_proyecto || !tarea || !fecha_inicio) return res.status(400).json({ error: 'id_proyecto, tarea y fecha_inicio son requeridos' });
    const fechaFinBase = formatDate(calcFechaFin(new Date(fecha_inicio), duracion_dias, tipo_dias));
    const isCompra = req.body.es_compra ? 1 : 0;
    const [result] = await conn.execute(
      `INSERT INTO tareas (id_proyecto, id_parent, id_subresp, id_resp, tarea, descripcion, fecha_inicio, fecha_fin, fecha_inicio_proyectada, fecha_fin_proyectada, duracion_dias, estado, responsable, avance, tipo_dias, notificado, costo_tarea, es_compra) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id_proyecto, id_parent, id_subresp, id_resp, tarea, req.body.descripcion || null, fecha_inicio, fechaFinBase, fecha_inicio, fechaFinBase, duracion_dias, calcEstado(avance), req.body.responsable || null, avance, tipo_dias, req.body.notificado ? 1 : 0, req.body.costo_tarea || 0, isCompra]
    );
    const newTaskId = result.insertId;
    
    if (req.body.dependencias !== undefined) await syncDependencias(conn, newTaskId, parseCsvIds(req.body.dependencias));
    if (req.body.recursos !== undefined)     await syncRecursos(conn, newTaskId, parseCsvIds(req.body.recursos));
    
    const { effectiveStart, fechaInicioProy } = await calcEffectiveStart(conn, newTaskId, fecha_inicio, tipo_dias);
    const fechaFinProy = formatDate(calcFechaFin(effectiveStart, duracion_dias, tipo_dias));
    await conn.execute(`UPDATE tareas SET fecha_inicio_proyectada = ?, fecha_fin_proyectada = ? WHERE id_tarea = ?`, [fechaInicioProy, fechaFinProy, newTaskId]);
    let summaryTasks = [];
    if (id_parent) summaryTasks = await recalcParentBounds(conn, id_parent);
    await conn.commit();
    const newTask = await fetchTaskWithExtras(getPool(), newTaskId);
    res.status(201).json({ task: newTask, updatedTasks: [newTask, ...summaryTasks] });
  } catch (err) { await conn.rollback(); res.status(err.status || 500).json({ error: err.message }); } finally { conn.release(); }
});

router.put('/:id', requirePermission('UPDATE'), requireProjectAccess, async (req, res) => {
  const conn = await getPool().getConnection();
  try {
    const { id } = req.params;
    validateWhitelist(req.body, UPDATE_WHITELIST);
    await conn.beginTransaction();
    const [curRows] = await conn.execute(`SELECT ${TASK_COLUMNS.join(',')} FROM tareas WHERE id_tarea = ?`, [id]);
    if (!curRows.length) throw new Error('Tarea no encontrada');
    const cur = curRows[0];
    const updates = [];
    const values = [];
    const physicalWhitelist = TASK_COLUMNS.filter(c => !['id_tarea', 'fecha_creacion'].includes(c));
    let timingChanged = false;
    for (const key of Object.keys(req.body)) {
      if (physicalWhitelist.includes(key)) {
        updates.push(`${key} = ?`);
        values.push(req.body[key] === undefined ? null : req.body[key]);
        if (TIMING_FIELDS.includes(key)) timingChanged = true;
      }
    }
    if (timingChanged) updates.push('auto_retrasada = 0');
    if (updates.length > 0) await conn.execute(`UPDATE tareas SET ${updates.join(', ')} WHERE id_tarea = ?`, [...values, id]);
    
    if (req.body.dependencias !== undefined) await syncDependencias(conn, parseInt(id), parseCsvIds(req.body.dependencias));
    if (req.body.recursos !== undefined)     await syncRecursos(conn, parseInt(id), parseCsvIds(req.body.recursos));

    const updatedTask = { ...cur, ...req.body };
    const { effectiveStart, fechaInicioProy } = await calcEffectiveStart(conn, id, updatedTask.fecha_inicio, updatedTask.tipo_dias);
    const fechaFinProy = formatDate(calcFechaFin(effectiveStart, updatedTask.duracion_dias, updatedTask.tipo_dias));
    await conn.execute(`UPDATE tareas SET fecha_inicio_proyectada = ?, fecha_fin_proyectada = ? WHERE id_tarea = ?`, [fechaInicioProy, fechaFinProy, id]);
    const updatedTasks = await propagateTasks(conn, parseInt(id));
    let summaryTasks = [];
    if (updatedTask.id_parent) summaryTasks = await recalcParentBounds(conn, updatedTask.id_parent);
    await conn.commit();
    const newTask = await fetchTaskWithExtras(getPool(), id);
    res.json({ task: newTask, updatedTasks: [newTask, ...updatedTasks, ...summaryTasks] });
  } catch (err) {
    console.error('ERROR EN UPDATE TASK:', err);
    await conn.rollback(); 
    res.status(err.status || 500).json({ error: err.message }); 
  } finally { 
    conn.release(); 
  }
});

router.delete('/:id', requirePermission('DELETE'), async (req, res) => {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [toDel] = await conn.execute('SELECT id_parent FROM tareas WHERE id_tarea = ?', [req.params.id]);
    await conn.execute('DELETE FROM tareas WHERE id_tarea = ?', [req.params.id]);
    if (toDel.length && toDel[0].id_parent) await recalcParentBounds(conn, toDel[0].id_parent);
    await conn.commit();
    res.json({ success: true });
  } catch (err) { await conn.rollback(); res.status(500).json({ error: err.message }); } finally { conn.release(); }
});

module.exports = router;
