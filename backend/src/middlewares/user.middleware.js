'use strict';

const db = require('../../config/db.config');

/**
 * Ensures the character in :characterId belongs to the authenticated user.
 * Must come AFTER authMiddleware.
 */
async function userOwnsCharacter(req, res, next) {
  const characterId = parseInt(req.params.characterId || req.body.character_id);
  if (!characterId) return next();

  try {
    const [[char]] = await db.execute(
      'SELECT id, user_id FROM characters WHERE id = ?',
      [characterId]
    );

    if (!char) {
      return res.status(404).json({ error: 'Personagem não encontrado.' });
    }

    // Admins can access anything
    if (req.user.role === 'admin') return next();

    if (char.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Acesso negado: este personagem não é seu.' });
    }

    req.character = char;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = userOwnsCharacter;
