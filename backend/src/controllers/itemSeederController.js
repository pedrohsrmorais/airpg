'use strict';

const path = require('path');
const fs   = require('fs');
const db   = require('../../config/db.config');

// POST /admin/seed-items  — seeds items.json into item_catalog
async function seedItems(req, res, next) {
  try {
    const filePath = path.join(__dirname, '../../data/items.json');
    const items    = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    let inserted = 0;
    let skipped  = 0;

    for (const item of items) {
      const [[existing]] = await db.execute(
        'SELECT id FROM item_catalog WHERE item_key = ?',
        [item.item_key]
      );
      if (existing) { skipped++; continue; }

      await db.execute(
        `INSERT INTO item_catalog
           (item_key, name, description, lore, type, subtype, rarity, material,
            base_value, sell_modifier, buy_modifier, is_tradeable,
            weight, size, stackable, max_stack,
            drop_chance, market_chance, drop_contexts,
            properties, requirements,
            is_world_item, is_quest_item, is_unique)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          item.item_key, item.name, item.description, item.lore || null,
          item.type, item.subtype || null, item.rarity, item.material || null,
          item.base_value, item.sell_modifier ?? 0.50, item.buy_modifier ?? 2.00,
          item.is_tradeable ?? 1,
          item.weight || 1.0, item.size || 'medium',
          item.stackable ? 1 : 0, item.max_stack || null,
          item.drop_chance ?? 0, item.market_chance ?? 0,
          JSON.stringify(item.drop_contexts || []),
          JSON.stringify(item.properties || {}),
          JSON.stringify(item.requirements || {}),
          item.is_world_item ? 1 : 0,
          item.is_quest_item ? 1 : 0,
          item.is_unique ? 1 : 0,
        ]
      );
      inserted++;
    }

    res.json({ message: `Seed concluído. ${inserted} inseridos, ${skipped} pulados.` });
  } catch (err) { next(err); }
}

module.exports = { seedItems };
