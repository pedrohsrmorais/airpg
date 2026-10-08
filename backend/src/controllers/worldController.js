'use strict';

const db = require('../../config/db.config');

// GET /worlds
async function list(req, res, next) {
  try {
    const [rows] = await db.execute(
      'SELECT id, name, description, created_at FROM worlds ORDER BY name'
    );
    res.json(rows);
  } catch (err) { next(err); }
}

// GET /worlds/:worldId
async function get(req, res, next) {
  try {
    const [[world]] = await db.execute('SELECT * FROM worlds WHERE id = ?', [req.params.worldId]);
    if (!world) return res.status(404).json({ error: 'Mundo não encontrado.' });

    const [regions] = await db.execute(
      'SELECT * FROM regions WHERE world_id = ? ORDER BY name',
      [req.params.worldId]
    );

    res.json({ ...world, regions });
  } catch (err) { next(err); }
}

// GET /worlds/:worldId/regions/:regionId/locations
async function locations(req, res, next) {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM locations WHERE region_id = ? ORDER BY name',
      [req.params.regionId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

// GET /worlds/:worldId/nearby?characterId=X&radius=5
async function nearby(req, res, next) {
  try {
    const { characterId, radius = 5 } = req.query;
    if (!characterId) return res.status(400).json({ error: 'characterId é obrigatório.' });

    const [[self]] = await db.execute(
      'SELECT pos_x, pos_y, location_id FROM characters WHERE id = ? AND world_id = ?',
      [characterId, req.params.worldId]
    );
    if (!self) return res.status(404).json({ error: 'Personagem não encontrado neste mundo.' });

    const [others] = await db.execute(
      `SELECT id, name, race, class, pos_x, pos_y, is_alive,
              SQRT(POW(pos_x - ?, 2) + POW(pos_y - ?, 2)) AS distance
         FROM characters
        WHERE world_id = ? AND id <> ? AND is_alive = 1
       HAVING distance <= ?
        ORDER BY distance`,
      [self.pos_x, self.pos_y, req.params.worldId, characterId, radius]
    );

    res.json(others);
  } catch (err) { next(err); }
}

module.exports = { list, get, locations, nearby };
