const express = require('express');
const router  = express.Router();
const { getPool } = require('../db');
const { requirePermission } = require('../middleware/auth');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function addDaysToDate(dateStr, days) {
  if (!dateStr || !days) return null;
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + parseInt(days));
  return d.toISOString().split('T')[0];
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Calcula los campos automáticos según el estado de la compra.
 * Recibe el body de la request y el registro actual de la BD.
 */
function applyStateDates(body, current = {}) {
  const estado = body.estado;
  const out = { ...body };

  // Calcular valor_total siempre
  const cant = parseFloat(out.cantidad ?? current.cantidad ?? 1);
  const vu   = parseFloat(out.valor_unitario ?? current.valor_unitario ?? 0);
  if (!isNaN(cant) && !isNaN(vu)) {
    out.valor_total = +(cant * vu).toFixed(2);
  }

  if (!estado) return out;

  const prev = current.estado;

  // Timestamps automáticos al entrar en cada estado (solo si estaban vacíos)
  if (estado === 'solicitando presupuesto') {
    if (!current.fecha_presupuesto_solic && !out.fecha_presupuesto_solic) {
      out.fecha_presupuesto_solic = todayStr();
    }
    if (!current.fecha_solicitud && !out.fecha_solicitud) {
      out.fecha_solicitud = todayStr();
    }
  }

  if (estado === 'presupuesto recibido') {
    if (!current.fecha_presupuesto_recib && !out.fecha_presupuesto_recib) {
      out.fecha_presupuesto_recib = todayStr();
    }
  }

  if (estado === 'OC emitida') {
    if (!current.fecha_oc_emitida && !out.fecha_oc_emitida) {
      out.fecha_oc_emitida = todayStr();
    }
  }

  if (estado === 'fecha comprometida') {
    if (!current.fecha_comprometida && !out.fecha_comprometida) {
      out.fecha_comprometida = todayStr();
    }
  }

  if (estado === 'entregado') {
    if (!current.fecha_entregado && !out.fecha_entregado) {
      out.fecha_entregado = todayStr();
    }
  }

  // Recalcular fecha_arribo_estimada cuando fecha_oc_emitida o dias_arribo cambian
  const ocDate   = out.fecha_oc_emitida   ?? current.fecha_oc_emitida;
  const diasArrib = out.dias_arribo        ?? current.dias_arribo;
  if (ocDate && diasArrib > 0) {
    out.fecha_arribo_estimada = addDaysToDate(ocDate, diasArrib);
  }

  return out;
}

// ─── JOIN base query ──────────────────────────────────────────────────────────
const SELECT_BASE = `
  SELECT c.*,
    rs.nombre AS solicitante_nombre, rs.correo AS solicitante_correo,
    rr.nombre AS responsable_nombre, rr.correo AS responsable_correo,
    t.descripcion AS tarea_nombre, COALESCE(c.id_proyecto, t.id_proyecto) AS id_proyecto
  FROM compras c
  LEFT JOIN responsables rs ON c.id_solicitante = rs.id_resp
  LEFT JOIN responsables rr ON c.id_responsable = rr.id_resp
  LEFT JOIN tareas t ON c.id_tarea = t.id_tarea
`;

// ─── GET /api/purchases ───────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const [rows] = await getPool().execute(SELECT_BASE + ' ORDER BY c.fecha_creacion DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/purchases/task/:taskId ─────────────────────────────────────────
// IMPORTANTE: esta ruta debe ir ANTES de /:id para no confundirse
router.get('/task/:taskId', async (req, res) => {
  try {
    const [rows] = await getPool().execute(
      SELECT_BASE + ' WHERE c.id_tarea = ? ORDER BY c.fecha_creacion DESC',
      [req.params.taskId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/purchases/:id ───────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await getPool().execute(
      SELECT_BASE + ' WHERE c.id_compra = ?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Compra no encontrada' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/purchases ──────────────────────────────────────────────────────
router.post('/', requirePermission('CREATE'), async (req, res) => {
  try {
    const data = applyStateDates(req.body, {});

    const {
      id_tarea = null,
      id_proyecto = null,
      producto,
      descripcion = null,
      cantidad = 1,
      valor_unitario = 0,
      valor_total = 0,
      id_solicitante = null,
      id_responsable = null,
      estado = 'solicitada',
      dias_arribo = 0,
      fecha_solicitud = null,
      fecha_presupuesto_solic = null,
      fecha_presupuesto_recib = null,
      fecha_oc_emitida = null,
      fecha_comprometida = null,
      fecha_entregado = null,
      fecha_arribo_estimada = null,
      fecha_arribo_necesaria = null,
      notas = null,
      links_facturas = null
    } = data;

    if (!producto) return res.status(400).json({ error: 'El campo producto es requerido' });

    const [result] = await getPool().execute(
      `INSERT INTO compras
        (id_tarea, id_proyecto, producto, descripcion, cantidad, valor_unitario, valor_total,
         id_solicitante, id_responsable, estado, dias_arribo,
         fecha_solicitud, fecha_presupuesto_solic, fecha_presupuesto_recib,
         fecha_oc_emitida, fecha_comprometida, fecha_entregado,
         fecha_arribo_estimada, fecha_arribo_necesaria, notas, links_facturas)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id_tarea, id_proyecto, producto, descripcion, cantidad, valor_unitario, valor_total,
       id_solicitante, id_responsable, estado, dias_arribo,
       fecha_solicitud, fecha_presupuesto_solic, fecha_presupuesto_recib,
       fecha_oc_emitida, fecha_comprometida, fecha_entregado,
       fecha_arribo_estimada, fecha_arribo_necesaria, notas, links_facturas]
    );

    const [newRow] = await getPool().execute(
      SELECT_BASE + ' WHERE c.id_compra = ?',
      [result.insertId]
    );
    res.status(201).json(newRow[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PUT /api/purchases/:id ───────────────────────────────────────────────────
router.put('/:id', requirePermission('UPDATE'), async (req, res) => {
  try {
    const { id } = req.params;
    const [cur] = await getPool().execute('SELECT * FROM compras WHERE id_compra = ?', [id]);
    if (!cur.length) return res.status(404).json({ error: 'Compra no encontrada' });

    const data = applyStateDates(req.body, cur[0]);

    // Merge con datos actuales (PATCH-style)
    const merged = { ...cur[0], ...data };

    await getPool().execute(
      `UPDATE compras SET
        id_tarea = ?, id_proyecto = ?, producto = ?, descripcion = ?, cantidad = ?,
        valor_unitario = ?, valor_total = ?, id_solicitante = ?, id_responsable = ?,
        estado = ?, dias_arribo = ?,
        fecha_solicitud = ?, fecha_presupuesto_solic = ?, fecha_presupuesto_recib = ?,
        fecha_oc_emitida = ?, fecha_comprometida = ?, fecha_entregado = ?,
        fecha_arribo_estimada = ?, fecha_arribo_necesaria = ?,
        notas = ?, links_facturas = ?
       WHERE id_compra = ?`,
      [
        merged.id_tarea || null, merged.id_proyecto || null, merged.producto, merged.descripcion || null,
        merged.cantidad, merged.valor_unitario, merged.valor_total,
        merged.id_solicitante || null, merged.id_responsable || null,
        merged.estado, merged.dias_arribo,
        merged.fecha_solicitud || null, merged.fecha_presupuesto_solic || null,
        merged.fecha_presupuesto_recib || null, merged.fecha_oc_emitida || null,
        merged.fecha_comprometida || null, merged.fecha_entregado || null,
        merged.fecha_arribo_estimada || null, merged.fecha_arribo_necesaria || null,
        merged.notas || null, merged.links_facturas || null,
        id
      ]
    );

    const [updated] = await getPool().execute(
      SELECT_BASE + ' WHERE c.id_compra = ?', [id]
    );
    res.json(updated[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── DELETE /api/purchases/:id ────────────────────────────────────────────────
router.delete('/:id', requirePermission('DELETE'), async (req, res) => {
  try {
    const { id } = req.params;
    const [cur] = await getPool().execute('SELECT id_compra FROM compras WHERE id_compra = ?', [id]);
    if (!cur.length) return res.status(404).json({ error: 'Compra no encontrada' });
    await getPool().execute('DELETE FROM compras WHERE id_compra = ?', [id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
