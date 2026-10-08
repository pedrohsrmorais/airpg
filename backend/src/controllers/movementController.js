'use strict';

const db = require('../../config/db.config');

// POST /characters/:characterId/move
async function move(req, res, next) {
  try {
    const { location_id, pos_x, pos_y } = req.body;
    const characterId = req.params.characterId;

    if (!location_id) {
      return res.status(400).json({ error: 'location_id é obrigatório.' });
    }

    const [[loc]] = await db.execute(
      'SELECT * FROM locations WHERE id = ?',
      [location_id]
    );
    if (!loc) return res.status(404).json({ error: 'Localização não encontrada.' });

    await db.execute(
      `UPDATE characters
          SET region_id = ?, location_id = ?,
              pos_x = ?, pos_y = ?, updated_at = NOW()
        WHERE id = ?`,
      [loc.region_id, location_id, pos_x ?? loc.pos_x, pos_y ?? loc.pos_y, characterId]
    );

    const [[char]] = await db.execute('SELECT * FROM characters WHERE id = ?', [characterId]);

    // Notify world channel
    req.io.to(`world:${char.world_id}`).emit('character_moved', {
      characterId: char.id,
      region_id:   char.region_id,
      location_id: char.location_id,
      pos_x:       char.pos_x,
      pos_y:       char.pos_y,
    });

    res.json(char);
  } catch (err) { next(err); }
}

module.exports = { move };
