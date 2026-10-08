'use strict';

const db = require('../../config/db.config');

// ── GET /markets/:marketId ────────────────────────────────────────────────────
async function get(req, res, next) {
  try {
    const [[market]] = await db.execute('SELECT * FROM markets WHERE id = ?', [req.params.marketId]);
    if (!market) return res.status(404).json({ error: 'Mercado não encontrado.' });

    const [stock] = await db.execute(
      `SELECT ms.*, ic.name, ic.description, ic.type, ic.subtype, ic.rarity,
              ic.base_value, ic.buy_modifier, ic.sell_modifier, ic.weight, ic.size,
              ic.properties, ic.requirements, ic.stackable,
              COALESCE(ms.price_override, ic.base_value * ic.buy_modifier) AS price
         FROM market_stock ms
         JOIN item_catalog ic ON ic.id = ms.item_catalog_id
        WHERE ms.market_id = ? AND ms.quantity > 0
        ORDER BY ic.type, ic.name`,
      [req.params.marketId]
    );

    res.json({ ...market, stock });
  } catch (err) { next(err); }
}

// ── GET /worlds/:worldId/markets  (list markets in a world) ──────────────────
async function listByWorld(req, res, next) {
  try {
    const [rows] = await db.execute(
      `SELECT m.*, l.name AS location_name
         FROM markets m
         JOIN locations l ON l.id = m.location_id
        WHERE m.world_id = ?`,
      [req.params.worldId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

// ── POST /markets/:marketId/buy ───────────────────────────────────────────────
// body: { character_id, item_catalog_id, quantity }
async function buy(req, res, next) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { character_id, item_catalog_id, quantity = 1 } = req.body;
    if (!character_id || !item_catalog_id) {
      return res.status(400).json({ error: 'character_id e item_catalog_id são obrigatórios.' });
    }

    // Fetch market stock
    const [[stock]] = await conn.execute(
      `SELECT ms.*, ic.name, ic.base_value, ic.buy_modifier, ic.stackable, ic.max_stack,
              COALESCE(ms.price_override, ic.base_value * ic.buy_modifier) AS final_price
         FROM market_stock ms
         JOIN item_catalog ic ON ic.id = ms.item_catalog_id
        WHERE ms.market_id = ? AND ms.item_catalog_id = ?`,
      [req.params.marketId, item_catalog_id]
    );

    if (!stock || stock.quantity < quantity) {
      await conn.rollback();
      return res.status(400).json({ error: 'Item indisponível ou quantidade insuficiente.' });
    }

    const totalCost = stock.final_price * quantity;

    // Check character gold
    const [[char]] = await conn.execute(
      'SELECT id, gold, world_id FROM characters WHERE id = ? FOR UPDATE',
      [character_id]
    );
    if (!char || char.gold < totalCost) {
      await conn.rollback();
      return res.status(400).json({ error: `Ouro insuficiente. Custo: ${totalCost.toFixed(0)} moedas.` });
    }

    // Deduct gold
    await conn.execute('UPDATE characters SET gold = gold - ? WHERE id = ?', [totalCost, character_id]);

    // Reduce stock
    await conn.execute(
      'UPDATE market_stock SET quantity = quantity - ? WHERE market_id = ? AND item_catalog_id = ?',
      [quantity, req.params.marketId, item_catalog_id]
    );

    // Add item to inventory
    if (stock.stackable) {
      const [[existing]] = await conn.execute(
        'SELECT * FROM character_inventory WHERE character_id = ? AND item_catalog_id = ?',
        [character_id, item_catalog_id]
      );
      if (existing) {
        const newQty = Math.min(existing.quantity + quantity, stock.max_stack || 99);
        await conn.execute(
          'UPDATE character_inventory SET quantity = ? WHERE id = ?',
          [newQty, existing.id]
        );
      } else {
        await conn.execute(
          'INSERT INTO character_inventory (character_id, item_catalog_id, quantity) VALUES (?,?,?)',
          [character_id, item_catalog_id, quantity]
        );
      }
    } else {
      for (let i = 0; i < quantity; i++) {
        await conn.execute(
          'INSERT INTO character_inventory (character_id, item_catalog_id, quantity) VALUES (?,?,?)',
          [character_id, item_catalog_id, 1]
        );
      }
    }

    // Log transaction
    await conn.execute(
      `INSERT INTO transactions
         (world_id, type, to_character, item_catalog_id, quantity, gold_amount, description)
       VALUES (?,?,?,?,?,?,?)`,
      [char.world_id, 'purchase', character_id, item_catalog_id, quantity, totalCost,
       `Compra no mercado ${req.params.marketId}`]
    );

    await conn.commit();

    res.json({
      success:    true,
      item_name:  stock.name,
      quantity,
      total_cost: totalCost,
      gold_remaining: char.gold - totalCost,
    });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

// ── POST /markets/:marketId/sell ──────────────────────────────────────────────
// body: { character_id, inventory_item_id }
async function sell(req, res, next) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { character_id, inventory_item_id } = req.body;

    const [[inv]] = await conn.execute(
      `SELECT ci.*, ic.name, ic.base_value, ic.sell_modifier, ic.is_quest_item
         FROM character_inventory ci
         JOIN item_catalog ic ON ic.id = ci.item_catalog_id
        WHERE ci.id = ? AND ci.character_id = ?`,
      [inventory_item_id, character_id]
    );

    if (!inv) return res.status(404).json({ error: 'Item não encontrado no inventário.' });
    if (inv.is_quest_item) return res.status(400).json({ error: 'Item de quest não pode ser vendido.' });

    const sellPrice = inv.base_value * inv.sell_modifier;

    // Add gold to character
    const [[char]] = await conn.execute(
      'SELECT id, gold, world_id FROM characters WHERE id = ? FOR UPDATE',
      [character_id]
    );
    await conn.execute('UPDATE characters SET gold = gold + ? WHERE id = ?', [sellPrice, character_id]);

    // Remove item from inventory (or reduce quantity)
    if (inv.stackable && inv.quantity > 1) {
      await conn.execute(
        'UPDATE character_inventory SET quantity = quantity - 1 WHERE id = ?',
        [inventory_item_id]
      );
    } else {
      await conn.execute('DELETE FROM character_inventory WHERE id = ?', [inventory_item_id]);
    }

    // Log transaction
    await conn.execute(
      `INSERT INTO transactions
         (world_id, type, from_character, item_catalog_id, quantity, gold_amount, description)
       VALUES (?,?,?,?,?,?,?)`,
      [char.world_id, 'sale', character_id, inv.item_catalog_id, 1, sellPrice,
       `Venda no mercado ${req.params.marketId}`]
    );

    await conn.commit();
    res.json({ success: true, item_name: inv.name, gold_received: sellPrice });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

// ── POST /markets/:marketId/restock  (admin / scheduler) ─────────────────────
async function restock(req, res, next) {
  try {
    const [catalog] = await db.execute(
      'SELECT * FROM item_catalog WHERE market_chance > 0 AND is_world_item = 0 AND is_quest_item = 0'
    );

    let added = 0;
    for (const item of catalog) {
      const chance = parseFloat(item.market_chance) || 0;
      if (Math.random() * 100 <= chance) {
        // Check if market already has it
        const [[existing]] = await db.execute(
          'SELECT * FROM market_stock WHERE market_id = ? AND item_catalog_id = ?',
          [req.params.marketId, item.id]
        );
        if (existing) {
          await db.execute(
            'UPDATE market_stock SET quantity = quantity + 1 WHERE market_id = ? AND item_catalog_id = ?',
            [req.params.marketId, item.id]
          );
        } else {
          await db.execute(
            'INSERT INTO market_stock (market_id, item_catalog_id, quantity) VALUES (?,?,?)',
            [req.params.marketId, item.id, 1]
          );
        }
        added++;
      }
    }

    await db.execute('UPDATE markets SET last_restock = NOW() WHERE id = ?', [req.params.marketId]);
    res.json({ message: `Restock concluído. ${added} item(ns) adicionado(s).` });
  } catch (err) { next(err); }
}

module.exports = { get, listByWorld, buy, sell, restock };
