const { calcFechaFin, calcEstado, formatDate, parseDate } = require('./dates');

/**
 * Detecta si agregar newDepId como dependencia de sourceId crearía un ciclo.
 * Hace BFS desde newDepId siguiendo sus propias dependencias en tabla `dependencias`.
 * Si llega a sourceId → ciclo detectado.
 */
async function detectCycle(conn, sourceId, newDepId) {
  const visited = new Set();
  const queue   = [parseInt(newDepId)];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === parseInt(sourceId)) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const [rows] = await conn.execute(
      'SELECT id_predecesora FROM dependencias WHERE id_tarea = ?', [current]
    );
    for (const row of rows) {
      queue.push(row.id_predecesora);
    }
  }
  return false;
}

/**
 * Propaga cambios en cascada a todas las tareas que dependen de taskId.
 * Usa BFS con un Set de visitados para evitar loops.
 * Lee dependencias desde tabla normalizada.
 * Devuelve array con todas las tareas actualizadas.
 */
async function propagateTasks(conn, taskId, visited = new Set()) {
  if (visited.has(taskId)) return [];
  visited.add(taskId);

  // Tareas que tienen taskId como predecesora (en tabla normalizada)
  const [dependents] = await conn.execute(
    `SELECT t.*,
            c.cantidad, c.valor_unitario, c.fecha_solicitud, c.fecha_arribo_necesaria, 
            c.fecha_oc_emitida, c.fecha_comprometida, c.fecha_entregado
     FROM tareas t
     JOIN dependencias d ON d.id_tarea = t.id_tarea
     LEFT JOIN compras c ON c.id_tarea = t.id_tarea
     WHERE d.id_predecesora = ?`,
    [taskId]
  );

  const affected = [];

  for (const dep of dependents) {
    // Obtener todos los predecesores de esta tarea
    const [predRows] = await conn.execute(
      `SELECT t.id_tarea, t.es_compra, t.fecha_fin_proyectada,
              c.fecha_arribo_necesaria, c.fecha_comprometida, c.fecha_entregado
       FROM tareas t
       LEFT JOIN compras c ON c.id_tarea = t.id_tarea
       JOIN dependencias d ON d.id_predecesora = t.id_tarea
       WHERE d.id_tarea = ?`,
      [dep.id_tarea]
    );

    if (predRows.length === 0) continue;

    // La tarea dependiente inicia AL DÍA SIGUIENTE de la última predecesora proyectada
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

    maxFin.setUTCDate(maxFin.getUTCDate() + 1);

    // Si tipo_dias es laboral y cae en domingo, saltear al lunes
    if (dep.tipo_dias === 'laboral' && maxFin.getUTCDay() === 0) {
      maxFin.setUTCDate(maxFin.getUTCDate() + 1);
    }

    const newProyectada = formatDate(maxFin);
    const newFinProy    = formatDate(calcFechaFin(maxFin, dep.duracion_dias, dep.tipo_dias));

    await conn.execute(
      `UPDATE tareas
       SET fecha_inicio_proyectada = ?, fecha_fin_proyectada = ?
       WHERE id_tarea = ?`,
      [newProyectada, newFinProy, dep.id_tarea]
    );

    const updated = { ...dep, fecha_inicio_proyectada: newProyectada, fecha_fin_proyectada: newFinProy };
    affected.push(updated);

    // Recursión para dependientes de este dependiente
    const subAffected = await propagateTasks(conn, dep.id_tarea, visited);
    affected.push(...subAffected);
  }

  return affected;
}

module.exports = { detectCycle, propagateTasks };
