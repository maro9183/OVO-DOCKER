const express = require('express');
const router  = express.Router();
const { getPool }                    = require('../db');
const { calcFechaFin, calcEstado, formatDate, parseDate } = require('../logic/dates');
const { detectCycle, propagateTasks } = require('../logic/propagate');
const { recalcParentBounds } = require('../logic/recalc');
const { requirePermission, requireProjectAccess } = require('../middleware/auth');

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Calcula la fecha de inicio efectiva basada en los predecesores
 * en la tabla normalizada `dependencias`.
 */
async function calcEffectiveStart(conn, tareaId, fecha_inicio, tipo_dias) {
  if (!tareaId) return { effectiveStart: fecha_inicio, fechaInicioProy: null };

   const [predRows] = await conn.execute(
    `SELECT t.id_tarea, t.es_compra, t.fecha_fin_proyectada,
            c.fecha_arribo_necesaria, c.fecha_comprometida, c.fecha_entregado
     FROM tareas t
     LEFT JOIN compras c ON c.id_tarea = t.id_tarea
     JOIN dependencias d ON d.id_predecesora = t.id_tarea
     WHERE d.id_tarea = ?`,
    [tareaId]
  );

  if (predRows.length === 0) return { effectiveStart: fecha_inicio, fechaInicioProy: null };

  const maxFin = predRows.reduce((max, t) => {
    let refDate;
    if (t.es_compra) {
      const d1 = parseDate(t.fecha_arribo_necesaria) || new Date(0);
      const d2 = parseDate(t.fecha_comprometida) || new Date(0);
      const d3 = parseDate(t.fecha_entregado) || new Date(0);
      refDate = new Date(Math.max(d1, d2, d3));
    } else {
      refDate = parseDate(t.fecha_fin_proyectada) || new Date(0);
    }
    return refDate > max ? refDate : max;
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

/**
 * Sincroniza la tabla `dependencias` para una tarea dada.
 * Recibe un array de IDs predecesoras (ints).
 * Elimina las que ya no están y agrega las nuevas.
 */
async function syncDependencias(conn, tareaId, nuevasPredIds) {
  // Obtener actuales
  const [current] = await conn.execute(
    'SELECT id_predecesora FROM dependencias WHERE id_tarea = ?', [tareaId]
  );
  const currentIds = current.map(r => r.id_predecesora);

  const toAdd    = nuevasPredIds.filter(id => !currentIds.includes(id));
  const toRemove = currentIds.filter(id => !nuevasPredIds.includes(id));

  for (const id of toRemove) {
    await conn.execute(
      'DELETE FROM dependencias WHERE id_tarea = ? AND id_predecesora = ?',
      [tareaId, id]
    );
  }
  for (const id of toAdd) {
    await conn.execute(
      'INSERT IGNORE INTO dependencias (id_tarea, id_predecesora) VALUES (?, ?)',
      [tareaId, id]
    );
  }
}

/**
 * Sincroniza la tabla `tarea_recursos` para una tarea dada.
 * Recibe un array de IDs recursos (ints).
 */
async function syncRecursos(conn, tareaId, nuevosRecIds) {
  const [current] = await conn.execute(
    'SELECT id_recurso FROM tarea_recursos WHERE id_tarea = ?', [tareaId]
  );
  const currentIds = current.map(r => r.id_recurso);

  const toDelete = currentIds.filter(id => !nuevosRecIds.includes(id));
  const toAdd    = nuevosRecIds.filter(id => !currentIds.includes(id));

  for (const id of toDelete) {
    await conn.execute('DELETE FROM tarea_recursos WHERE id_tarea = ? AND id_recurso = ?', [tareaId, id]);
  }
  for (const id of toAdd) {
    await conn.execute('INSERT INTO tarea_recursos (id_tarea, id_recurso) VALUES (?, ?)', [tareaId, id]);
  }
}

/**
 * Lazy Rescheduling: Reprograma tareas vencidas no completadas a la fecha de hoy.
 */
async function applyLazyRescheduling(pool, projectIds = null) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Tareas no completadas cuya fecha_fin_proyectada < hoy
    let sql = `SELECT id_tarea FROM tareas WHERE fecha_completada IS NULL AND fecha_fin_proyectada < CURDATE()`;
    let params = [];
    if (projectIds && projectIds.length > 0) {
      sql += ` AND id_proyecto IN (${projectIds.map(() => '?').join(',')})`;
      params = projectIds;
    }
    const [overdue] = await conn.execute(sql, params);
    
    if (overdue.length > 0) {
      console.log(`[LazyRescheduling] Reprogramando ${overdue.length} tareas...`);
      for (const row of overdue) {
        // Marcamos la tarea como auto-retrasada y movemos su fin a hoy
        // (Nota: Esto es una simplificación, en un motor real se movería el inicio y duracion relacional)
        await conn.execute(
          `UPDATE tareas SET fecha_fin_proyectada = CURDATE(), auto_retrasada = 1 WHERE id_tarea = ?`, 
          [row.id_tarea]
        );
        // Propagamos el cambio a los descendientes
        await propagateTasks(conn, row.id_tarea);
      }
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    console.error("Error en Lazy Rescheduling:", err);
  } finally {
    conn.release();
  }
}

/**
 * Lee las dependencias de la tabla y las devuelve como string CSV
 * para mantener compatibilidad con el frontend actual.
 */
async function getDependenciasStr(conn, tareaId) {
  const [rows] = await conn.execute(
    'SELECT id_predecesora FROM dependencias WHERE id_tarea = ? ORDER BY id_predecesora',
    [tareaId]
  );
  return rows.map(r => r.id_predecesora).join(',') || null;
}

// ─── GET /api/tasks (con Filtros y Rescheduling) ────────────────────────────
router.get('/', async (req, res) => {
  try {
    // Aplicar reprogramación al vuelo para todas las tareas visibles (Lazy)
    await applyLazyRescheduling(getPool());

    let sql = `SELECT t.*, 
               c.cantidad, c.valor_unitario, c.fecha_solicitud, c.fecha_arribo_necesaria, 
               c.fecha_oc_emitida, c.fecha_comprometida, c.fecha_entregado,
               (SELECT COUNT(*) FROM notas n WHERE n.tarea = t.id_tarea) as note_count,
               sr.nombre as subresponsable_nombre,
               (SELECT GROUP_CONCAT(id_predecesora ORDER BY id_predecesora) FROM dependencias WHERE id_tarea = t.id_tarea) AS dependencias,
               (SELECT GROUP_CONCAT(id_recurso ORDER BY id_recurso) FROM tarea_recursos WHERE id_tarea = t.id_tarea) AS recursos
               FROM tareas t
               LEFT JOIN subresponsables sr ON t.id_subresp = sr.id_subresp
               LEFT JOIN compras c ON t.id_tarea = c.id_tarea
               ORDER BY t.fecha_inicio, t.id_tarea`;
    let params = [];

    // Filtro por usuario
    if (req.user && req.user.proyectos !== 'ALL') {
      const allowedIds = req.user.proyectos.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x));
      if (allowedIds.length === 0) return res.json([]);

      sql = `SELECT t.*,
             c.cantidad, c.valor_unitario, c.fecha_solicitud, c.fecha_arribo_necesaria, 
             c.fecha_oc_emitida, c.fecha_comprometida, c.fecha_entregado,
             (SELECT COUNT(*) FROM notas n WHERE n.tarea = t.id_tarea) as note_count,
             sr.nombre as subresponsable_nombre,
             (SELECT GROUP_CONCAT(id_predecesora ORDER BY id_predecesora) FROM dependencias WHERE id_tarea = t.id_tarea) AS dependencias,
             (SELECT GROUP_CONCAT(id_recurso ORDER BY id_recurso) FROM tarea_recursos WHERE id_tarea = t.id_tarea) AS recursos
             FROM tareas t
             LEFT JOIN subresponsables sr ON t.id_subresp = sr.id_subresp
             LEFT JOIN compras c ON t.id_tarea = c.id_tarea
             WHERE t.id_proyecto IN (${allowedIds.join(',')})
             ORDER BY t.fecha_inicio, t.id_tarea`;
    }

    const [rows] = await getPool().execute(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/tasks/:projectId (con Rescheduling) ──────────────────────────
router.get('/project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    // Aplicar reprogramación al vuelo solo para este proyecto (Lazy)
    await applyLazyRescheduling(getPool(), [projectId]);

    const [rows] = await getPool().execute(
      `SELECT t.*,
       c.cantidad, c.valor_unitario, c.fecha_solicitud, c.fecha_arribo_necesaria, 
       c.fecha_oc_emitida, c.fecha_comprometida, c.fecha_entregado,
       (SELECT COUNT(*) FROM notas n WHERE n.tarea = t.id_tarea) as note_count,
       sr.nombre as subresponsable_nombre,
       (SELECT GROUP_CONCAT(id_predecesora ORDER BY id_predecesora) FROM dependencias WHERE id_tarea = t.id_tarea) AS dependencias,
       (SELECT GROUP_CONCAT(id_recurso ORDER BY id_recurso) FROM tarea_recursos WHERE id_tarea = t.id_tarea) AS recursos
       FROM tareas t
       LEFT JOIN subresponsables sr ON t.id_subresp = sr.id_subresp
       LEFT JOIN compras c ON t.id_tarea = c.id_tarea
       WHERE t.id_proyecto = ?
       ORDER BY t.fecha_inicio, t.id_tarea`,
      [req.params.projectId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/tasks/:id ──────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await getPool().execute(
      `SELECT t.*,
       c.cantidad, c.valor_unitario, c.fecha_solicitud, c.fecha_arribo_necesaria, 
       c.fecha_oc_emitida, c.fecha_comprometida, c.fecha_entregado,
       (SELECT GROUP_CONCAT(id_predecesora ORDER BY id_predecesora) FROM dependencias WHERE id_tarea = t.id_tarea) AS dependencias,
       (SELECT GROUP_CONCAT(id_recurso ORDER BY id_recurso) FROM tarea_recursos WHERE id_tarea = t.id_tarea) AS recursos
       FROM tareas t 
       LEFT JOIN compras c ON t.id_tarea = c.id_tarea
       WHERE t.id_tarea = ?`,
      [req.params.id]
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
      id_proyecto, id_parent = null, id_subresp = null, id_resp = null,
      tarea, descripcion, fecha_inicio,
      duracion_dias = 1, responsable = null,
      avance = 0, dependencias = '', recursos = '',
      tipo_dias = 'calendario', notificado = 0,
      costo_tarea = 0
    } = req.body;

    if (!id_proyecto || !tarea || !fecha_inicio)
      return res.status(400).json({ error: 'id_proyecto, tarea y fecha_inicio son requeridos' });

    // Parsear dependencias del cuerpo (string CSV → array de IDs)
    const depIds = (dependencias || '').split(',').map(d => parseInt(d.trim())).filter(id => !isNaN(id));

    // Parsear recursos
    const recIds = (recursos || '').split(',').map(r => parseInt(r.trim())).filter(id => !isNaN(id));

    // Insert de tarea. Se configuran inicialmente los baseline y proyectados igual al input.
    let fechaFinBase = formatDate(calcFechaFin(new Date(fecha_inicio), duracion_dias, tipo_dias));
    const isCompra = req.body.es_compra ? 1 : 0;

    const [result] = await conn.execute(
      `INSERT INTO tareas
         (id_proyecto, id_parent, id_subresp, id_resp, tarea, descripcion, 
          fecha_inicio, fecha_fin, fecha_inicio_proyectada, fecha_fin_proyectada, 
          duracion_dias, estado, responsable, avance, tipo_dias, notificado, costo_tarea, 
          fecha_real_iniciada, fecha_completada, es_compra)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id_proyecto, id_parent, id_subresp, id_resp || null, tarea, descripcion || null,
        fecha_inicio, fechaFinBase, fecha_inicio, fechaFinBase,
        duracion_dias, calcEstado(avance), responsable, avance, tipo_dias, notificado, costo_tarea,
        req.body.fecha_real_iniciada || null, req.body.fecha_completada || null, isCompra
      ]
    );

    const newTaskId = result.insertId;

    // Upsert a la tabla compras si es compra
    if (isCompra && req.body.compraData) {
      const cd = req.body.compraData;
      await conn.execute(
        `INSERT INTO compras 
         (id_tarea, id_proyecto, producto, cantidad, valor_unitario, fecha_solicitud, fecha_arribo_necesaria, fecha_oc_emitida, fecha_comprometida, fecha_entregado) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newTaskId, id_proyecto, descripcion || tarea, cd.cantidad, cd.valor_unitario,
          cd.fecha_solicitud || null, cd.fecha_arribo_necesaria || null, 
          cd.fecha_oc_emitida || null, cd.fecha_comprometida || null, cd.fecha_entregado || null
        ]
      );
    }

    // Insertar dependencias y recursos en tablas normalizadas
    await syncDependencias(conn, newTaskId, depIds);
    await syncRecursos(conn, newTaskId, recIds);

    // Verificar ciclos y reglas de negocio ANTES de calcular fechas
    for (const depId of depIds) {
      if (await detectCycle(conn, newTaskId, depId)) {
        await conn.rollback();
        return res.status(400).json({ error: `La dependencia ${depId} crea un ciclo` });
      }
      
      // Regla: Una compra no puede depender de una tarea
      if (isCompra) {
          const [depTask] = await conn.execute('SELECT es_compra FROM tareas WHERE id_tarea = ?', [depId]);
          if (depTask.length && !depTask[0].es_compra) {
              await conn.rollback();
              return res.status(400).json({ error: "Una compra no puede depender de una tarea de obra. Solo se permiten dependencias entre compras o tareas dependiendo de compras." });
          }
      }
    }

    // Calcular fecha de inicio efectiva basada en predecesores y recalcular proyección
    const { effectiveStart, fechaInicioProy } = await calcEffectiveStart(conn, newTaskId, fecha_inicio, tipo_dias);
    const fechaFinProy = formatDate(calcFechaFin(effectiveStart, duracion_dias, tipo_dias));

    // Actualizar con fechas proyectadas calculadas
    await conn.execute(
      `UPDATE tareas SET fecha_inicio_proyectada = ?, fecha_fin_proyectada = ? WHERE id_tarea = ?`,
      [fechaInicioProy, fechaFinProy, newTaskId]
    );

    // Si tiene padre, recalcular sus fechas
    let updatedSummary = [];
    if (id_parent) {
      updatedSummary = await recalcParentBounds(conn, id_parent);
    }

    await conn.commit();

    const [newTask] = await getPool().execute(
      `SELECT t.*,
       c.cantidad, c.valor_unitario, c.fecha_solicitud, c.fecha_arribo_necesaria, 
       c.fecha_oc_emitida, c.fecha_comprometida, c.fecha_entregado,
       (SELECT GROUP_CONCAT(id_predecesora ORDER BY id_predecesora) FROM dependencias WHERE id_tarea = t.id_tarea) AS dependencias,
       (SELECT GROUP_CONCAT(id_recurso ORDER BY id_recurso) FROM tarea_recursos WHERE id_tarea = t.id_tarea) AS recursos
       FROM tareas t 
       LEFT JOIN compras c ON t.id_tarea = c.id_tarea
       WHERE t.id_tarea = ?`,
      [newTaskId]
    );
    res.status(201).json({ task: newTask[0], updatedTasks: [newTask[0], ...updatedSummary] });
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

    const task = { ...cur[0], ...req.body };

    // Permisos: Sólo admins editán baseline (fecha_inicio).
    if (!req.user || !req.user.es_admin) {
      task.fecha_inicio  = cur[0].fecha_inicio;
    }

    // Parsear dependencias / recursos
    let depIds = null;
    if (req.body.dependencias !== undefined) {
      depIds = (req.body.dependencias || '').split(',').map(d => parseInt(d.trim())).filter(id => !isNaN(id));
      for (const depId of depIds) {
        if (await detectCycle(conn, parseInt(id), depId)) {
          await conn.rollback();
          return res.status(400).json({ error: `La dependencia ${depId} crea un ciclo` });
        }

        // Regla: Una compra no puede depender de una tarea
        if (task.es_compra) {
            const [depTask] = await conn.execute('SELECT es_compra FROM tareas WHERE id_tarea = ?', [depId]);
            if (depTask.length && !depTask[0].es_compra) {
                await conn.rollback();
                return res.status(400).json({ error: "Una compra no puede depender de una tarea de obra." });
            }
        }
      }
      await syncDependencias(conn, parseInt(id), depIds);
    }

    if (req.body.recursos !== undefined) {
      const recIds = (req.body.recursos || '').split(',').map(r => parseInt(r.trim())).filter(id => !isNaN(id));
      await syncRecursos(conn, parseInt(id), recIds);
    }

    // Calcular effectiveStart proyectado
    const { effectiveStart, fechaInicioProy } = await calcEffectiveStart(conn, parseInt(id), task.fecha_inicio, task.tipo_dias);
    const fechaFinProy = formatDate(calcFechaFin(effectiveStart, task.duracion_dias, task.tipo_dias));
    const estado = calcEstado(task.avance);

    // Si es admin recalculamos la línea base fecha_fin usando su fecha_inicio editada.
    let fechaFinBase = cur[0].fecha_fin;
    if (req.user && req.user.es_admin) {
      fechaFinBase = formatDate(calcFechaFin(new Date(task.fecha_inicio), task.duracion_dias, task.tipo_dias));
    }

    const isCompra = req.body.es_compra ? 1 : 0;

    await conn.execute(
      `UPDATE tareas SET
         id_proyecto=?, id_parent=?, id_subresp=?, id_resp=?, tarea=?, descripcion=?,
         fecha_inicio=?, fecha_fin=?, 
         fecha_inicio_proyectada=?, fecha_fin_proyectada=?,
         duracion_dias=?, estado=?, responsable=?, avance=?,
         tipo_dias=?, notificado=?,
         fecha_real_iniciada=?, fecha_completada=?,
         costo_tarea=?, es_compra=?, auto_retrasada=0
       WHERE id_tarea=?`,
      [
        task.id_proyecto, task.id_parent || null, task.id_subresp || null, task.id_resp || null, task.tarea, task.descripcion || null,
        task.fecha_inicio, fechaFinBase,
        fechaInicioProy, fechaFinProy,
        task.duracion_dias, estado, task.responsable || null, task.avance,
        task.tipo_dias, task.notificado ? 1 : 0,
        task.fecha_real_iniciada || null, task.fecha_completada || null,
        task.costo_tarea !== undefined ? task.costo_tarea : 0,
        isCompra, id
      ]
    );

    // Upsert a la tabla compras si es compra
    if (isCompra && req.body.compraData) {
      const cd = req.body.compraData;
      await conn.execute(
        `INSERT INTO compras 
         (id_tarea, id_proyecto, producto, cantidad, valor_unitario, fecha_solicitud, fecha_arribo_necesaria, fecha_oc_emitida, fecha_comprometida, fecha_entregado) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
         producto=VALUES(producto), cantidad=VALUES(cantidad), valor_unitario=VALUES(valor_unitario),
         fecha_solicitud=VALUES(fecha_solicitud), fecha_arribo_necesaria=VALUES(fecha_arribo_necesaria),
         fecha_oc_emitida=VALUES(fecha_oc_emitida), fecha_comprometida=VALUES(fecha_comprometida),
         fecha_entregado=VALUES(fecha_entregado)`,
        [
          id, task.id_proyecto, task.descripcion || task.tarea, cd.cantidad, cd.valor_unitario,
          cd.fecha_solicitud || null, cd.fecha_arribo_necesaria || null, 
          cd.fecha_oc_emitida || null, cd.fecha_comprometida || null, cd.fecha_entregado || null
        ]
      );
    }

    // Recalcular resúmenes
    let summaryTasks = [];
    if (task.id_parent) {
      summaryTasks.push(...await recalcParentBounds(conn, task.id_parent));
    }
    if (cur[0].id_parent && cur[0].id_parent !== task.id_parent) {
      summaryTasks.push(...await recalcParentBounds(conn, cur[0].id_parent));
    }

    const updatedTasks = await propagateTasks(conn, parseInt(id));
    
    // FETCH FINAL (incluye info de compra unificada para el Gantt si hace falta)
    const [updatedRow] = await conn.execute(
      `SELECT t.*,
       c.cantidad, c.valor_unitario, c.fecha_solicitud, c.fecha_arribo_necesaria, 
       c.fecha_oc_emitida, c.fecha_comprometida, c.fecha_entregado,
       sr.nombre as subresponsable_nombre,
       (SELECT GROUP_CONCAT(id_predecesora ORDER BY id_predecesora) FROM dependencias WHERE id_tarea = t.id_tarea) AS dependencias,
       (SELECT GROUP_CONCAT(id_recurso ORDER BY id_recurso) FROM tarea_recursos WHERE id_tarea = t.id_tarea) AS recursos
       FROM tareas t 
       LEFT JOIN subresponsables sr ON t.id_subresp = sr.id_subresp
       LEFT JOIN compras c ON c.id_tarea = t.id_tarea
       WHERE t.id_tarea = ?`,
      [id]
    );

    await conn.commit();
    res.json({ task: updatedRow[0], updatedTasks: [updatedRow[0], ...updatedTasks, ...summaryTasks] });
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

    // Necesitamos el id_parent antes de borrar para recalcular
    const [toDel] = await conn.execute('SELECT id_parent FROM tareas WHERE id_tarea = ?', [id]);
    const oldParentId = toDel.length ? toDel[0].id_parent : null;

    // Las FK con ON DELETE CASCADE en la tabla dependencias limpian automáticamente
    await conn.execute('DELETE FROM tareas WHERE id_tarea = ?', [id]);

    // Recalcular padre si existía
    if (oldParentId) {
      await recalcParentBounds(conn, oldParentId);
    }

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally { conn.release(); }
});

module.exports = router;
