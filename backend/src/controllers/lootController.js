'use strict';

const db    = require('../../config/db.config');
const dice  = require('../services/diceEngine');
const ai    = require('../services/aiService');

// ── helpers ───────────────────────────────────────────────────────────────────

function rollDrops(catalog, context) {
  const found = [];
  for (const item of catalog) {
    // Check if this context is in drop_contexts (if specified)
    if (item.drop_contexts && Array.isArray(item.drop_contexts)) {
      if (!item.drop_contexts.includes(context)) continue;
    }
    const chance = parseFloat(item.drop_chance) || 0;
    if (Math.random() * 100 <= chance) {
      found.push(item);
    }
  }
  return found;
}

async function addItemsToInventory(characterId, items) {
  for (const item of items) {
    // Check if stackable and already exists
    if (item.stackable) {
      const [[existing]] = await db.execute(
        'SELECT * FROM character_inventory WHERE character_id = ? AND item_catalog_id = ?',
        [characterId, item.id]
      );
      if (existing) {
        const newQty = Math.min((existing.quantity || 1) + 1, item.max_stack || 99);
        await db.execute(
          'UPDATE character_inventory SET quantity = ? WHERE id = ?',
          [newQty, existing.id]
        );
        continue;
      }
    }
    await db.execute(
      'INSERT INTO character_inventory (character_id, item_catalog_id, quantity) VALUES (?,?,?)',
      [characterId, item.id, 1]
    );
  }
}

// ── POST /characters/:characterId/loot ───────────────────────────────────────
// body: { context: 'chest'|'corpse'|'pickpocket'|'search', source_name: 'Goblin morto' }
async function loot(req, res, next) {
  try {
    const { context = 'search', source_name = 'Fonte desconhecida' } = req.body;
    const characterId = req.params.characterId;

    // Fetch all droppable items for this context
    const [catalog] = await db.execute(
      `SELECT * FROM item_catalog
        WHERE is_world_item = 0 AND is_quest_item = 0 AND drop_chance > 0
        ORDER BY RAND()`
    );

    const foundItems = rollDrops(catalog, context);

    // Roll gold based on context
    const goldTable = { chest: '3d10+5', corpse: '1d6', pickpocket: '1d10', search: '1d4', quest: '5d10+10' };
    const goldRoll  = dice.roll(goldTable[context] || '1d6');
    const goldFound = goldRoll.total;

    // Add items to inventory
    if (foundItems.length > 0) {
      await addItemsToInventory(characterId, foundItems);
    }

    // Add gold to character
    await db.execute(
      'UPDATE characters SET gold = gold + ? WHERE id = ?',
      [goldFound, characterId]
    );

    // Log loot event
    const [lootResult] = await db.execute(
      `INSERT INTO loot_events
         (character_id, context, source_name, found_items, gold_found, rolls, narration)
       VALUES (?,?,?,?,?,?,?)`,
      [
        characterId, context, source_name,
        JSON.stringify(foundItems.map(i => ({ id: i.id, name: i.name }))),
        goldFound,
        JSON.stringify({ gold: goldRoll }),
        '' // filled below
      ]
    );

    // Log transactions for each item found
    const [[char]] = await db.execute('SELECT world_id FROM characters WHERE id = ?', [characterId]);
    for (const item of foundItems) {
      await db.execute(
        `INSERT INTO transactions
           (world_id, type, to_character, item_catalog_id, quantity, gold_amount, description)
         VALUES (?,?,?,?,?,?,?)`,
        [char.world_id, 'loot', characterId, item.id, 1, 0, `Loot: ${context} — ${source_name}`]
      );
    }

    // AI narration
    const narration = await ai.narrateLoot(
      { foundItems: foundItems.map(i => i.name), goldFound, context, source_name },
      { characterId }
    ).catch(() => `Você encontrou ${foundItems.length} item(ns) e ${goldFound} moedas de ouro.`);

    // Update narration on loot event
    await db.execute(
      'UPDATE loot_events SET narration = ? WHERE id = ?',
      [narration, lootResult.insertId]
    );

    res.json({
      context,
      source_name,
      found_items: foundItems.map(i => ({ id: i.id, name: i.name, rarity: i.rarity, type: i.type })),
      gold_found:  goldFound,
      narration,
    });
  } catch (err) { next(err); }
}

// ── POST /characters/:characterId/pickup ──────────────────────────────────────
// Player picks up a world object: "eu quero guardar esse vaso"
// body: { description: 'um vaso antigo de cerâmica' }
async function pickupWorldItem(req, res, next) {
  try {
    const { description } = req.body;
    const characterId = req.params.characterId;

    if (!description) {
      return res.status(400).json({ error: 'description é obrigatório.' });
    }

    const [[char]] = await db.execute('SELECT * FROM characters WHERE id = ?', [characterId]);
    if (!char) return res.status(404).json({ error: 'Personagem não encontrado.' });

    // AI validates if the object is carry-able
    const validation = await ai.validateWorldPickup(description, {
      name: char.name, class: char.class
    });

    if (!validation.valid) {
      return res.json({
        success: false,
        reason: validation.reason,
        narration: `O Mestre decreta: "${validation.reason}"`,
      });
    }

    // Insert as a custom world item in item_catalog (is_world_item = 1)
    const itemKey = `world_${Date.now()}_${characterId}`;
    const [inserted] = await db.execute(
      `INSERT INTO item_catalog
         (item_key, name, description, type, rarity, base_value, sell_modifier, buy_modifier,
          weight, size, stackable, drop_chance, market_chance, is_world_item, is_quest_item, is_unique)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        itemKey,
        validation.suggested_name || description.slice(0, 64),
        description,
        'misc', 'common',
        validation.estimated_value || 5,
        0.50, 1.00,
        validation.estimated_weight || 1.0,
        'small', 0,
        0, 0,   // drop_chance = 0, market_chance = 0
        1, 0, 0 // is_world_item = 1
      ]
    );

    // Add to character inventory
    await db.execute(
      'INSERT INTO character_inventory (character_id, item_catalog_id, quantity) VALUES (?,?,?)',
      [characterId, inserted.insertId, 1]
    );

    res.json({
      success: true,
      item: {
        id:   inserted.insertId,
        name: validation.suggested_name || description,
        description,
        estimated_value:  validation.estimated_value,
        estimated_weight: validation.estimated_weight,
      },
      narration: `${char.name} guarda cuidadosamente ${validation.suggested_name || 'o objeto'} em sua mochila.`,
    });
  } catch (err) { next(err); }
}

module.exports = { loot, pickupWorldItem };
