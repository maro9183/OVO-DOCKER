const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getPool } = require('../db');
const { requireAuth, requirePermission } = require('../middleware/auth');

// Solo usuarios con rol ALL (Admin) pueden acceder a gestión de usuarios
router.use(requireAuth);
router.use(requirePermission('ALL'));

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const db = getPool();
    const [rows] = await db.query('SELECT id_usuario, email, nombre, permisos, proyectos, activo, fecha_creacion FROM usuarios ORDER BY nombre ASC');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// POST /api/users
router.post('/', async (req, res) => {
  const { email, password, nombre, permisos, proyectos } = req.body;
  if (!email || !password || !nombre) return res.status(400).json({ error: 'Mail, password y nombre son requeridos' });

  try {
    const db = getPool();
    const [existing] = await db.query('SELECT id_usuario FROM usuarios WHERE email = ?', [email]);
    if (existing.length > 0) return res.status(400).json({ error: 'El email ya existe' });

    const hash = await bcrypt.hash(password, 10);
    const pms = permisos || 'READ';
    const proys = proyectos || '';

    const [result] = await db.query(
      'INSERT INTO usuarios (email, password_hash, nombre, permisos, proyectos) VALUES (?, ?, ?, ?, ?)',
      [email, hash, nombre, pms, proys]
    );
    res.json({ id: result.insertId, email, nombre, permisos: pms, proyectos: proys });
  } catch (e) {
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// PUT /api/users/:id
router.put('/:id', async (req, res) => {
  const userId = req.params.id;
  const { nombre, permisos, proyectos, activo, password } = req.body;
  
  try {
    const db = getPool();
    
    // Updates basico sin contraseña
    let sql = 'UPDATE usuarios SET nombre=?, permisos=?, proyectos=?, activo=? WHERE id_usuario=?';
    let params = [nombre, permisos, proyectos, activo ? 1 : 0, userId];

    if (password && password.trim() !== '') {
      const hash = await bcrypt.hash(password, 10);
      sql = 'UPDATE usuarios SET nombre=?, permisos=?, proyectos=?, activo=?, password_hash=? WHERE id_usuario=?';
      params = [nombre, permisos, proyectos, activo ? 1 : 0, hash, userId];
    }

    await db.query(sql, params);
    
    // Devolvemos el usuario modificado
    const [updated] = await db.query('SELECT id_usuario, email, nombre, permisos, proyectos, activo FROM usuarios WHERE id_usuario=?', [userId]);
    res.json(updated[0]);
  } catch (e) {
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  const userId = req.params.id;
  // Prevenir borrarse a sí mismo
  if (req.user.id == userId) {
    return res.status(400).json({ error: 'No puedes borrar tu propio usuario' });
  }
  try {
    const db = getPool();
    await db.query('DELETE FROM usuarios WHERE id_usuario = ?', [userId]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

module.exports = router;
