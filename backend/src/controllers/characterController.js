'use strict';

const db = require('../../config/db.config');

// GET /characters  (returns only the user's own characters)
async function list(req, res, next) {
  try {
    const [rows] = await db.execute(
      `SELECT c.*, w.name AS world_name
         FROM characters c
         LEFT JOIN worlds w ON w.id = c.world_id
        WHERE c.user_id = ?
        ORDER BY c.updated_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

// GET /characters/:characterId
async function get(req, res, next) {
  try {
    const [[char]] = await db.execute(
      `SELECT c.*, w.name AS world_name, r.name AS region_name, l.name AS location_name
         FROM characters c
         LEFT JOIN worlds    w ON w.id = c.world_id
         LEFT JOIN regions   r ON r.id = c.region_id
         LEFT JOIN locations l ON l.id = c.location_id
        WHERE c.id = ? AND c.user_id = ?`,
      [req.params.characterId, req.user.id]
    );
    if (!char) return res.status(404).json({ error: 'Personagem não encontrado.' });
    res.json(char);
  } catch (err) { next(err); }
}

// POST /characters
async function create(req, res, next) {
  try {
    const {
      name, world_id, race = 'Human', char_class = 'Fighter',
      background = '', strength = 10, dexterity = 10, constitution = 10,
      intelligence = 10, wisdom = 10, charisma = 10, gold = 50
    } = req.body;

    if (!name || !world_id) {
      return res.status(400).json({ error: 'name e world_id são obrigatórios.' });
    }

    // Grab a starting location from the world
    const [[loc]] = await db.execute(
      `SELECT l.id AS location_id, l.region_id, l.pos_x, l.pos_y
         FROM locations l
         JOIN regions r ON r.id = l.region_id
        WHERE r.world_id = ? AND l.is_safe = 1
        LIMIT 1`,
      [world_id]
    );

    const [result] = await db.execute(
      `INSERT INTO characters
         (user_id, world_id, name, race, class, background,
          strength, dexterity, constitution, intelligence, wisdom, charisma,
          gold, region_id, location_id, pos_x, pos_y)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        req.user.id, world_id, name, race, char_class, background,
        strength, dexterity, constitution, intelligence, wisdom, charisma,
        gold,
        loc?.region_id || null, loc?.location_id || null,
        loc?.pos_x || 0, loc?.pos_y || 0
      ]
    );

    const [[created]] = await db.execute('SELECT * FROM characters WHERE id = ?', [result.insertId]);
    res.status(201).json(created);
  } catch (err) { next(err); }
}

// PATCH /characters/:characterId
async function update(req, res, next) {
  try {
    const allowed = ['background', 'gold', 'autonomous_mode'];
    const fields  = [];
    const values  = [];

    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        fields.push(`${k} = ?`);
        values.push(req.body[k]);
      }
    }

    if (!fields.length) return res.status(400).json({ error: 'Nenhum campo válido para atualizar.' });

    values.push(req.params.characterId, req.user.id);
    await db.execute(
      `UPDATE characters SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );
    const [[updated]] = await db.execute('SELECT * FROM characters WHERE id = ?', [req.params.characterId]);
    res.json(updated);
  } catch (err) { next(err); }
}

module.exports = { list, get, create, update };
