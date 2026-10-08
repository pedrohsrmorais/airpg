'use strict';

const db = require('../../config/db.config');

// GET /characters/:characterId/inventory
async function list(req, res, next) {
  try {
    const [items] = await db.execute(
      `SELECT ci.*, ic.name, ic.description, ic.type, ic.subtype, ic.rarity,
              ic.base_value, ic.sell_modifier, ic.buy_modifier, ic.weight, ic.size,
              ic.stackable, ic.properties, ic.is_world_item
         FROM character_inventory ci
         JOIN item_catalog ic ON ic.id = ci.item_catalog_id
        WHERE ci.character_id = ?
        ORDER BY ic.type, ic.name`,
      [req.params.characterId]
    );
    res.json(items);
  } catch (err) { next(err); }
}

// DELETE /characters/:characterId/inventory/:itemId  (drop item)
async function drop(req, res, next) {
  try {
    const { characterId, itemId } = req.params;

    const [[inv]] = await db.execute(
      'SELECT * FROM character_inventory WHERE id = ? AND character_id = ?',
      [itemId, characterId]
    );
    if (!inv) return res.status(404).json({ error: 'Item não encontrado no inventário.' });

    await db.execute('DELETE FROM character_inventory WHERE id = ?', [itemId]);
    res.json({ message: 'Item descartado.' });
  } catch (err) { next(err); }
}

// PATCH /characters/:characterId/inventory/:itemId/equip
async function equip(req, res, next) {
  try {
    const { characterId, itemId } = req.params;
    const { slot } = req.body; // e.g. 'main_hand', 'off_hand', 'body', 'head', etc.

    const [[inv]] = await db.execute(
      'SELECT ci.*, ic.type FROM character_inventory ci JOIN item_catalog ic ON ic.id = ci.item_catalog_id WHERE ci.id = ? AND ci.character_id = ?',
      [itemId, characterId]
    );
    if (!inv) return res.status(404).json({ error: 'Item não encontrado.' });

    // Unequip any currently equipped item in same slot
    if (slot) {
      await db.execute(
        'UPDATE character_inventory SET equipped = 0, slot = NULL WHERE character_id = ? AND slot = ?',
        [characterId, slot]
      );
    }

    await db.execute(
      'UPDATE character_inventory SET equipped = 1, slot = ? WHERE id = ?',
      [slot || null, itemId]
    );

    res.json({ message: `Item equipado no slot ${slot}.` });
  } catch (err) { next(err); }
}

// PATCH /characters/:characterId/inventory/:itemId/unequip
async function unequip(req, res, next) {
  try {
    const { characterId, itemId } = req.params;
    await db.execute(
      'UPDATE character_inventory SET equipped = 0, slot = NULL WHERE id = ? AND character_id = ?',
      [itemId, characterId]
    );
    res.json({ message: 'Item desequipado.' });
  } catch (err) { next(err); }
}

module.exports = { list, drop, equip, unequip };
