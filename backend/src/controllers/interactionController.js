'use strict';

const db   = require('../../config/db.config');
const dice = require('../services/diceEngine');
const ai   = require('../services/aiService');

const sessionRoom = (id) => `session:${id}`;
const sessionOOC  = (id) => `session:${id}:ooc`;

// ── POST /worlds/:worldId/interactions ───────────────────────────────────────
async function create(req, res, next) {
  try {
    const { type = 'combat', initiator_id, participants = [] } = req.body;
    const worldId = req.params.worldId;

    if (!initiator_id) return res.status(400).json({ error: 'initiator_id obrigatório.' });

    const allIds = [initiator_id, ...participants];

    // Fetch participants + roll initiative
    const participantsData = [];
    for (const cid of allIds) {
      const [[char]] = await db.execute(
        'SELECT id, name, dexterity FROM characters WHERE id = ? AND world_id = ? AND is_alive = 1',
        [cid, worldId]
      );
      if (!char) return res.status(400).json({ error: `Personagem ${cid} não encontrado.` });
      const dexMod  = Math.floor((char.dexterity - 10) / 2);
      const initRoll = dice.roll('1d20');
      participantsData.push({ ...char, initiative: initRoll.total + dexMod });
    }

    // Sort by initiative (highest first)
    participantsData.sort((a, b) => b.initiative - a.initiative);
    const firstActor = participantsData[0];

    const deadline = new Date(Date.now() + 30 * 60 * 1000);

    // Create session
    const [result] = await db.execute(
      `INSERT INTO interaction_sessions
         (world_id, type, status, current_actor_id, turn_deadline, turn_number)
       VALUES (?,?,?,?,?,?)`,
      [worldId, type, 'active', firstActor.id, deadline, 1]
    );
    const sessionId = result.insertId;

    // Insert participants
    for (const p of participantsData) {
      await db.execute(
        'INSERT INTO interaction_participants (session_id, character_id, initiative) VALUES (?,?,?)',
        [sessionId, p.id, p.initiative]
      );
    }

    // Emit to world channel
    req.io.to(`world:${worldId}`).emit('session_started', {
      sessionId,
      type,
      participants: participantsData.map(p => ({ id: p.id, name: p.name, initiative: p.initiative })),
      first_actor:  { id: firstActor.id, name: firstActor.name },
      deadline:     deadline.toISOString(),
    });

    // Emit your_turn to session channel
    req.io.to(sessionRoom(sessionId)).emit('your_turn', {
      character_id:   firstActor.id,
      character_name: firstActor.name,
      turn:           1,
      deadline:       deadline.toISOString(),
    });

    res.status(201).json({ session_id: sessionId, participants: participantsData, first_actor: firstActor });
  } catch (err) { next(err); }
}

// ── POST /worlds/:worldId/interactions/:sessionId/turn ───────────────────────
async function submitTurn(req, res, next) {
  try {
    const { character_id, input } = req.body;
    const { sessionId } = req.params;

    const [[session]] = await db.execute(
      'SELECT * FROM interaction_sessions WHERE id = ? AND status = ?',
      [sessionId, 'active']
    );
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada ou inativa.' });
    if (session.current_actor_id !== parseInt(character_id)) {
      return res.status(400).json({ error: 'Não é a vez deste personagem.' });
    }

    const [[char]] = await db.execute('SELECT * FROM characters WHERE id = ?', [character_id]);

    // Immediately emit declaration so other players see it
    req.io.to(sessionRoom(sessionId)).emit('player_action_declared', {
      character_id:   parseInt(character_id),
      character_name: char.name,
      input,
      turn:           session.turn_number,
    });

    const result = await processTurn(db, req.io, session, character_id, input, false);
    res.json(result);
  } catch (err) { next(err); }
}

// ── processTurn (internal) ────────────────────────────────────────────────────
async function processTurn(db, io, session, characterId, input, isAuto = false) {
  const [[char]] = await db.execute(
    `SELECT c.*,
            ic_w.name       AS weapon_name,
            ic_w.properties AS weapon_props,
            ic_a.properties AS armor_props,
            ic_a.base_value AS armor_base
       FROM characters c
       LEFT JOIN character_inventory ci_w ON ci_w.character_id = c.id AND ci_w.equipped = 1 AND ci_w.slot = 'main_hand'
       LEFT JOIN item_catalog ic_w ON ic_w.id = ci_w.item_catalog_id
       LEFT JOIN character_inventory ci_a ON ci_a.character_id = c.id AND ci_a.equipped = 1 AND ci_a.slot = 'body'
       LEFT JOIN item_catalog ic_a ON ic_a.id = ci_a.item_catalog_id
      WHERE c.id = ?`,
    [characterId]
  );

  // Last 10 turns for AI context
  const [history] = await db.execute(
    `SELECT ia.*, c.name AS character_name
       FROM interaction_actions ia
       JOIN characters c ON c.id = ia.character_id
      WHERE ia.session_id = ?
      ORDER BY ia.turn_number DESC LIMIT 10`,
    [session.id]
  );

  // Parse intent
  const intent = await ai.parseIntent(input, {
    character: { name: char.name, class: char.class, hp: char.current_hp, max_hp: char.max_hp },
    history:   history.reverse().map(h => ({ turn: h.turn_number, char: h.character_name, action: h.input_text })),
    session:   { type: session.type, turn: session.turn_number },
  }).catch(() => ({ action: 'other', raw: input }));

  // Engine
  const engineResult = await runEngine(db, session, char, intent);

  // Narrate
  const narration = await ai.narrate(engineResult, {
    character: char.name,
    action:    intent,
    history:   history.slice(-3),
    session:   { type: session.type },
  }).catch(() => `${char.name} age...`);

  // Persist action
  await db.execute(
    `INSERT INTO interaction_actions
       (session_id, character_id, turn_number, input_text, parsed_intent, result, narration, is_auto)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      session.id, characterId, session.turn_number,
      input, JSON.stringify(intent), JSON.stringify(engineResult),
      narration, isAuto ? 1 : 0,
    ]
  );

  // Apply HP changes
  if (engineResult.damage && engineResult.target_id) {
    await db.execute(
      'UPDATE characters SET current_hp = GREATEST(0, current_hp - ?) WHERE id = ?',
      [engineResult.damage, engineResult.target_id]
    );
    // Check death
    const [[target]] = await db.execute('SELECT current_hp FROM characters WHERE id = ?', [engineResult.target_id]);
    if (target.current_hp <= 0) {
      await db.execute('UPDATE characters SET is_alive = 0 WHERE id = ?', [engineResult.target_id]);
    }
  }

  // Advance turn
  const nextActor = await advanceTurn(db, session);

  // Emit turn_result
  const turnResultPayload = {
    session_id:     session.id,
    turn:           session.turn_number,
    character_id:   parseInt(characterId),
    character_name: char.name,
    narration,
    engine_result:  engineResult,
    is_auto:        isAuto,
  };
  io.to(sessionRoom(session.id)).emit('turn_result', turnResultPayload);

  if (nextActor) {
    const newDeadline = new Date(Date.now() + 30 * 60 * 1000);
    io.to(sessionRoom(session.id)).emit('your_turn', {
      character_id:   nextActor.id,
      character_name: nextActor.name,
      turn:           session.turn_number + 1,
      deadline:       newDeadline.toISOString(),
    });
  }

  return { ...turnResultPayload, next_actor: nextActor };
}

async function runEngine(db, session, char, intent) {
  const action = intent.action || 'other';

  if (action === 'flee') {
    const check = dice.attributeCheck(char.dexterity, 12);
    return { action: 'flee', success: check.success, rolls: [check], effects: [{ type: 'flee', success: check.success }] };
  }

  if (action === 'defend') {
    return { action: 'defend', success: true, rolls: [], effects: [{ type: 'defend', ac_bonus: 2 }] };
  }

  if (action === 'attack') {
    const strMod = Math.floor((char.strength - 10) / 2);
    const atkBonus = strMod + Math.floor((char.level || 1) / 4 + 1);
    const targetAC = 12; // default enemy AC
    const attack   = dice.attackRoll(atkBonus, targetAC);

    if (attack.fumble) {
      return { action: 'attack', success: false, hit: false, rolls: [attack], effects: [{ type: 'fumble' }] };
    }
    if (!attack.hit) {
      return { action: 'attack', success: false, hit: false, rolls: [attack], effects: [{ type: 'miss' }] };
    }

    const damageFormula = char.weapon_props?.damage || '1d4';
    const dmg = dice.damageRoll(damageFormula, attack.critical);
    const totalDmg = dmg.total + strMod;

    return {
      action: 'attack', success: true, hit: true,
      rolls: [attack, dmg],
      damage: Math.max(1, totalDmg),
      critical: attack.critical,
      weapon: char.weapon_name || 'punho',
      effects: [{ type: 'damage', amount: Math.max(1, totalDmg) }]
    };
  }

  // Narrative / other actions
  return {
    action: 'narrative_action', success: true, rolls: [],
    effects: [{ type: 'narrative_action', action: intent.raw || action }]
  };
}

async function advanceTurn(db, session) {
  const [participants] = await db.execute(
    `SELECT ip.character_id, c.name, c.is_alive
       FROM interaction_participants ip
       JOIN characters c ON c.id = ip.character_id
      WHERE ip.session_id = ?
      ORDER BY ip.initiative DESC`,
    [session.id]
  );

  const alive = participants.filter(p => p.is_alive);
  if (alive.length < 2) {
    await db.execute(
      'UPDATE interaction_sessions SET status = ? WHERE id = ?',
      ['ended', session.id]
    );
    return null;
  }

  const currentIdx = alive.findIndex(p => p.character_id === session.current_actor_id);
  const nextIdx    = (currentIdx + 1) % alive.length;
  const next       = alive[nextIdx];

  const deadline = new Date(Date.now() + 30 * 60 * 1000);
  await db.execute(
    `UPDATE interaction_sessions
        SET current_actor_id = ?, turn_deadline = ?, turn_number = turn_number + 1
      WHERE id = ?`,
    [next.character_id, deadline, session.id]
  );

  return { id: next.character_id, name: next.name };
}

// ── POST /worlds/:worldId/interactions/:sessionId/ooc ────────────────────────
async function oocChat(req, res, next) {
  try {
    const { character_id, message } = req.body;
    const { sessionId } = req.params;

    const [[char]] = await db.execute('SELECT id, name FROM characters WHERE id = ?', [character_id]);
    if (!char) return res.status(404).json({ error: 'Personagem não encontrado.' });

    const payload = {
      type:           'ooc',
      character_id:   parseInt(character_id),
      character_name: char.name,
      message,
      ts:             new Date().toISOString(),
    };

    // Only emit to OOC channel — AI never sees this
    req.io.to(sessionOOC(sessionId)).emit('ooc_message', payload);
    res.json(payload);
  } catch (err) { next(err); }
}

// ── POST /worlds/:worldId/interactions/:sessionId/end ────────────────────────
async function end(req, res, next) {
  try {
    const { sessionId } = req.params;
    const { last_narration = 'A sessão foi encerrada.' } = req.body;

    await db.execute(
      'UPDATE interaction_sessions SET status = ? WHERE id = ?',
      ['ended', sessionId]
    );

    req.io.to(sessionRoom(sessionId)).emit('session_ended', {
      session_id:     parseInt(sessionId),
      last_narration,
    });

    res.json({ message: 'Sessão encerrada.' });
  } catch (err) { next(err); }
}

// ── GET /worlds/:worldId/interactions/:sessionId ─────────────────────────────
async function getSession(req, res, next) {
  try {
    const [[session]] = await db.execute(
      'SELECT * FROM interaction_sessions WHERE id = ?',
      [req.params.sessionId]
    );
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada.' });

    const [actions] = await db.execute(
      `SELECT ia.*, c.name AS character_name
         FROM interaction_actions ia
         JOIN characters c ON c.id = ia.character_id
        WHERE ia.session_id = ?
        ORDER BY ia.turn_number`,
      [req.params.sessionId]
    );

    res.json({ ...session, actions });
  } catch (err) { next(err); }
}

module.exports = { create, submitTurn, processTurn, oocChat, end, getSession };
