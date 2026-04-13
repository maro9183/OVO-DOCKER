const { calcFechaFin, calcEstado, formatDate, parseDate } = require('./dates');

/**
 * Detecta si agregar newDepId como dependencia de sourceId crearía un ciclo.
 */
async function detectCycle(conn, sourceId, newDepId) {
  const visited = new Set();
  const queue   = [String(newDepId)];
  const strSource = String(sourceId);

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === strSource) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const [rows] = await conn.execute(
      'SELECT id_predecesora FROM dependencias WHERE id_tarea = ?', [current]
    );
    for (const row of rows) {
      queue.push(String(row.id_predecesora));
    }
  }
  return false;
}

/**
 * Propaga cambios en cascada a todas las tareas que dependen de taskId.
 * Usa el esquema estricto: duration (inmutable), fecha_inicio_proyectada y fecha_fin_proyectada.
 */
async function propagateTasks(conn, taskId, visited = new Set()) {
  if (visited.has(taskId)) return [];
  visited.add(taskId);

  // Tareas que tienen taskId como predecesora
  // CAMBIO: Aseguramos traer 'duration' en lugar de 'duracion_dias'
  const [dependents] = await conn.execute(
    `SELECT t.id_tarea, t.duration, t.es_compra,
            c.cantidad, c.valor_unitario, c.fecha_solicitud, c.fecha_arribo_necesaria, 
            c.fecha_oc_emitida, c.fecha_comprometida, c.fecha_entregado
     FROM tareas t
     JOIN dependencias d ON d.id_tarea = t.id_tarea
     LEFT JOIN compras c ON c.id_tarea = t.id_tarea
     WHERE d.id_predecesora = ?`,
    [String(taskId)]
  );

  const affected = [];

  for (const dep of dependents) {
    // Obtener todos los predecesores de esta tarea hija
    const [predRows] = await conn.execute(
      `SELECT d.id_predecesora, t.id_tarea, t.es_compra, t.fecha_fin_proyectada, t.fecha_completada,
              c.fecha_arribo_necesaria, c.fecha_comprometida, c.fecha_entregado
       FROM dependencias d
       LEFT JOIN tareas t ON d.id_predecesora = t.id_tarea
       LEFT JOIN compras c ON d.id_predecesora = CONCAT('pur_', c.id_compra) OR t.id_tarea = c.id_tarea
       WHERE d.id_tarea = ?`,
      [dep.id_tarea]
    );

    if (predRows.length === 0) continue;

    // Buscar la fecha de fin más lejana de todos los predecesores
    const maxFin = predRows.reduce((max, row) => {
      let refDate;
      if (row.es_compra || !row.id_tarea) {
        const d1 = parseDate(row.fecha_arribo_necesaria) || new Date(0);
        const d2 = parseDate(row.fecha_comprometida) || new Date(0);
        const d3 = parseDate(row.fecha_entregado) || new Date(0);
        refDate = new Date(Math.max(d1, d2, d3));
      } else {
        // Priorizar la fecha completada (realidad) y si no, la proyectada
        refDate = parseDate(row.fecha_completada || row.fecha_fin_proyectada) || new Date(0);
      }
      return refDate > max ? refDate : max;
    }, new Date(0));

    // La tarea dependiente inicia AL DÍA SIGUIENTE calendario de la última predecesora
    maxFin.setUTCDate(maxFin.getUTCDate() + 1);

    const newProyectada = formatDate(maxFin);
    // Calculamos el fin sumando la duración inmutable (en días naturales)
    const newFinProy    = formatDate(calcFechaFin(maxFin, dep.duration));

    // UPDATE: Pisamos solo las proyectadas. NUNCA la fecha_inicio (Baseline) ni la duration.
    await conn.execute(
      `UPDATE tareas
       SET fecha_inicio_proyectada = ?, fecha_fin_proyectada = ?
       WHERE id_tarea = ?`,
      [newProyectada, newFinProy, dep.id_tarea]
    );

    const updated = { ...dep, fecha_inicio_proyectada: newProyectada, fecha_fin_proyectada: newFinProy };
    affected.push(updated);

    // Recursión para dependientes de este dependiente (el dominó sigue cayendo)
    const subAffected = await propagateTasks(conn, dep.id_tarea, visited);
    affected.push(...subAffected);
  }

  return affected;
}

module.exports = { detectCycle, propagateTasks };