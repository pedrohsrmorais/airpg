'use strict';

const { processTurn }   = require('../controllers/interactionController');
const { autonomousIntent } = require('./aiService');
const db = require('../../config/db.config');

const TICK_MS         = 60_000;
const OFFLINE_TICK_MS = 5 * 60_000;
const DEFAULT_AUTO    = 'defend';

function initSchedulers(io) {

  // ── Turn timeout ─────────────────────────────────────────────
  setInterval(async () => {
    try {
      const [expired] = await db.execute(
        `SELECT * FROM interaction_sessions
          WHERE status = 'active' AND turn_deadline < NOW()`
      );

      for (const session of expired) {
        if (!session.current_actor_id) continue;
        try {
          const result = await processTurn(
            db, io, session, session.current_actor_id, DEFAULT_AUTO, true
          );
          io.to(`session:${session.id}`).emit('turn_auto', {
            sessionId:    session.id,
            character_id: session.current_actor_id,
            narration:    result.narration,
            reason:       'timeout_30min',
          });
        } catch (err) {
          console.error(`[scheduler] turn auto error session ${session.id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[scheduler] tick error:', err.message);
    }
  }, TICK_MS);

  // ── Autonomous offline characters ────────────────────────────
  setInterval(async () => {
    try {
      const [chars] = await db.execute(
        `SELECT c.*, r.name AS region_name, r.type AS region_type,
                l.name AS loc_name, l.type AS loc_type
           FROM characters c
           LEFT JOIN regions   r ON r.id = c.region_id
           LEFT JOIN locations l ON l.id = c.location_id
          WHERE c.autonomous_mode = 1 AND c.is_alive = 1`
      );

      for (const char of chars) {
        try {
          const intent = await autonomousIntent(char, {
            region:   { name: char.region_name, type: char.region_type },
            location: { name: char.loc_name,    type: char.loc_type },
          });

          io.to(`world:${char.world_id}`).emit('autonomous_action', {
            character: char.name,
            action:    intent.action,
            reason:    intent.reason,
          });
          console.log(`[scheduler] autonomous: ${char.name} → ${intent.action}`);
        } catch (err) {
          console.error(`[scheduler] autonomous error char ${char.id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[scheduler] offline tick error:', err.message);
    }
  }, OFFLINE_TICK_MS);

  // ── Market restock ───────────────────────────────────────────
  setInterval(async () => {
    try {
      const [markets] = await db.execute(
        `SELECT * FROM markets
          WHERE last_restock IS NULL
             OR TIMESTAMPDIFF(HOUR, last_restock, NOW()) >= restock_hours`
      );

      for (const market of markets) {
        try {
          const [catalog] = await db.execute(
            'SELECT * FROM item_catalog WHERE market_chance > 0 AND is_world_item = 0 AND is_quest_item = 0'
          );

          for (const item of catalog) {
            const chance = parseFloat(item.market_chance) || 0;
            if (Math.random() * 100 <= chance) {
              const [[ex]] = await db.execute(
                'SELECT * FROM market_stock WHERE market_id = ? AND item_catalog_id = ?',
                [market.id, item.id]
              );
              if (ex) {
                await db.execute(
                  'UPDATE market_stock SET quantity = quantity + 1 WHERE market_id = ? AND item_catalog_id = ?',
                  [market.id, item.id]
                );
              } else {
                await db.execute(
                  'INSERT INTO market_stock (market_id, item_catalog_id, quantity) VALUES (?,?,?)',
                  [market.id, item.id, 1]
                );
              }
            }
          }

          await db.execute('UPDATE markets SET last_restock = NOW() WHERE id = ?', [market.id]);
          console.log(`[scheduler] market ${market.id} restocked.`);
        } catch (err) {
          console.error(`[scheduler] restock error market ${market.id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[scheduler] restock tick error:', err.message);
    }
  }, 60 * 60 * 1000); // every hour

  console.log('[scheduler] initialized ✓');
}

module.exports = { initSchedulers };
