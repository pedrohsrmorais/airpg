'use strict';

/**
 * AIRPG — Motor de Simulação do Mundo
 *
 * Roda ticks de tempo que fazem o mundo viver:
 *   - NPCs comercializam, discutem, formam amizades, se casam, morrem
 *   - Relações de afinidade se propagam pelo grafo social
 *   - Objetivos avançam, falham ou desbloqueiam novos objetivos
 *   - Traços adquiridos expiram; traços sombrios emergem de traumas não resolvidos
 *   - Eventos são registrados em npc_events com cadeia causal
 *
 * Uso:
 *   node src/services/worldSimulator.js              # roda em loop contínuo
 *   node src/services/worldSimulator.js --ticks=720  # roda N ticks e para
 *   node src/services/worldSimulator.js --headless   # sem log no console
 *
 * 1 tick = 1 hora do mundo
 * 24 ticks = 1 dia do mundo
 * 720 ticks = 30 dias
 */

require('dotenv').config({ path: `${__dirname}/../../.env` });

const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

/* ─────────────────────────────── CONFIG ─────────────────────────────────── */

const DB_CONFIG = {
  host:     process.env.DB_HOST     || 'localhost',
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || 'alfaiate10',
  database: process.env.DB_NAME     || 'airpg',
};

const WORLD_ID       = 1;
const TICK_INTERVAL  = 5000;   // 5 segundos por tick (ajuste conforme quiser)
const HOURS_PER_TICK = 1;      // 1 hora do mundo por tick real

// Flags de linha de comando
const args         = process.argv.slice(2);
const MAX_TICKS    = (() => { const f = args.find(a => a.startsWith('--ticks=')); return f ? parseInt(f.split('=')[1]) : Infinity; })();
const HEADLESS     = args.includes('--headless');
const LOG_FILE     = path.join(__dirname, '../../../logs/simulation.jsonl');

/* ─────────────────────────────── PROBABILIDADES ─────────────────────────── */

// Por tick, quantas chances de cada evento ocorrer (por NPC elegível)
const PROB = {
  trade:         0.04,   // 4% de um NPC comercializar com vizinho por tick
  argument:      0.02,
  friendship:    0.01,
  romance:       0.005,
  marriage:      0.003,
  death_old_age: 0.001,  // só NPCs > 70 anos
  theft:         0.005,  // só role thief/outlaw
  gift:          0.015,
  gossip:        0.03,
  help:          0.02,
};

/* ─────────────────────────────── LOGGER ─────────────────────────────────── */

let logStream = null;

function initLogger() {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
}

function log(obj) {
  if (!HEADLESS) console.log(JSON.stringify(obj));
  if (logStream) logStream.write(JSON.stringify(obj) + '\n');
}

/* ─────────────────────────────── HELPERS ─────────────────────────────────── */

function roll(prob) { return Math.random() < prob; }
function pick(arr)  { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

/** Retorna todos NPCs vivos de uma região com suas relações carregadas */
async function loadRegionNPCs(db, regionId) {
  const [rows] = await db.execute(
    `SELECT n.id, n.name, n.gender, n.age, n.role, n.gold, n.religion, n.faction,
            n.personality, n.skills, n.objectives, n.reputation,
            n.region_id, n.location_id
       FROM npcs n
      WHERE n.world_id = ? AND n.region_id = ? AND n.is_alive = 1`,
    [WORLD_ID, regionId]
  );
  return rows;
}

async function loadRelations(db, npcIds) {
  if (!npcIds.length) return [];
  const placeholders = npcIds.map(() => '?').join(',');
  const [rows] = await db.execute(
    `SELECT * FROM npc_relations
      WHERE npc_id IN (${placeholders}) OR target_npc_id IN (${placeholders})`,
    [...npcIds, ...npcIds]
  );
  return rows;
}

/** Registra evento no banco e retorna o id inserido */
async function recordEvent(db, worldDay, worldYear, event) {
  const [res] = await db.execute(
    `INSERT INTO npc_events
       (world_id, region_id, actor_npc_id, target_npc_id,
        event_type, payload, affinity_delta, world_year, world_day,
        propagated_from_event_id)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      WORLD_ID,
      event.region_id,
      event.actor_id,
      event.target_id   ?? null,
      event.type,
      JSON.stringify(event.payload ?? {}),
      event.affinity_delta ?? 0,
      worldYear,
      worldDay,
      event.parent_event_id ?? null,
    ]
  );
  return res.insertId;
}

/** Aplica delta de afinidade entre dois NPCs (cria ou atualiza a relação) */
async function applyAffinity(db, npcId, targetId, delta, relationType = 'acquaintance') {
  if (!npcId || !targetId || npcId === targetId) return;
  delta = Math.round(delta);
  if (delta === 0) return;

  // Verifica se relação já existe
  const [[existing]] = await db.execute(
    `SELECT id, affinity FROM npc_relations
      WHERE npc_id = ? AND target_npc_id = ? LIMIT 1`,
    [npcId, targetId]
  );

  if (existing) {
    const newAff = clamp(existing.affinity + delta, -100, 100);
    await db.execute(
      'UPDATE npc_relations SET affinity = ?, last_interaction_at = NOW() WHERE id = ?',
      [newAff, existing.id]
    );
  } else {
    const startAff = clamp(delta, -100, 100);
    await db.execute(
      `INSERT INTO npc_relations
         (npc_id, target_npc_id, relation_type, affinity, tags, last_interaction_at)
       VALUES (?,?,?,?,?,NOW())
       ON DUPLICATE KEY UPDATE affinity = affinity + VALUES(affinity),
                               last_interaction_at = NOW()`,
      [npcId, targetId, relationType, startAff, JSON.stringify([])]
    );
  }
}

/**
 * Propaga afinidade pelo grafo social.
 *   grau 1 (relação direta): peso 1.0  (já aplicado em applyAffinity)
 *   grau 2 (amigo de amigo): peso 0.3
 */
async function propagateAffinity(db, actorId, targetId, delta, eventId) {
  if (Math.abs(delta) < 3) return; // propagação trivial ignorada

  // Busca vizinhos grau 2 do actor que também conhecem o target
  const [neighbors] = await db.execute(
    `SELECT DISTINCT r1.target_npc_id AS neighbor_id
       FROM npc_relations r1
       JOIN npc_relations r2 ON r2.npc_id = r1.target_npc_id
                             AND r2.target_npc_id = ?
      WHERE r1.npc_id = ?
        AND r1.target_npc_id != ?
        AND r1.target_npc_id != ?
      LIMIT 20`,
    [targetId, actorId, actorId, targetId]
  );

  for (const { neighbor_id } of neighbors) {
    const propagatedDelta = Math.round(delta * 0.3);
    if (propagatedDelta === 0) continue;
    await applyAffinity(db, neighbor_id, targetId, propagatedDelta);
  }
}

/* ─────────────────────────────── EVENTOS ─────────────────────────────────── */

/** Dois NPCs comercializam: trocam ouro, afinidade sobe um pouco */
async function eventTrade(db, actor, target, state) {
  if (actor.gold < 5 && target.gold < 5) return null;
  const amount = Math.floor(Math.random() * Math.min(actor.gold, 30)) + 1;

  await db.execute('UPDATE npcs SET gold = gold - ? WHERE id = ?', [amount, actor.id]);
  await db.execute('UPDATE npcs SET gold = gold + ? WHERE id = ?', [amount, target.id]);
  await applyAffinity(db, actor.id, target.id, +5, 'trade_partner');
  await applyAffinity(db, target.id, actor.id, +5, 'trade_partner');

  return {
    type: 'trade', region_id: actor.region_id,
    actor_id: actor.id, target_id: target.id,
    affinity_delta: +5,
    payload: { amount, actor_name: actor.name, target_name: target.name },
  };
}

/** Dois NPCs brigam: afinidade cai, chance de criar traço adquirido */
async function eventArgument(db, actor, target, state) {
  await applyAffinity(db, actor.id,  target.id, -10, 'rival');
  await applyAffinity(db, target.id, actor.id,  -10, 'rival');

  // 30% de chance: target fica com traço adquirido 'resentful' por 30 dias
  if (roll(0.3)) {
    const personality = target.personality ?? { traits: [], acquired: [], dark: [] };
    personality.acquired = personality.acquired ?? [];
    personality.acquired.push({ trait: 'resentful', expires_at_day: state.worldDay + 30 });
    await db.execute('UPDATE npcs SET personality = ? WHERE id = ?',
      [JSON.stringify(personality), target.id]);
  }

  return {
    type: 'argument', region_id: actor.region_id,
    actor_id: actor.id, target_id: target.id,
    affinity_delta: -10,
    payload: { actor_name: actor.name, target_name: target.name },
  };
}

/** Um NPC dá um presente a outro: afinidade sobe bastante */
async function eventGift(db, actor, target, state) {
  if (actor.gold < 10) return null;
  const amount = Math.floor(Math.random() * 15) + 5;
  await db.execute('UPDATE npcs SET gold = gold - ? WHERE id = ?', [amount, actor.id]);
  await db.execute('UPDATE npcs SET gold = gold + ? WHERE id = ?', [amount, target.id]);
  await applyAffinity(db, actor.id,  target.id, +12, 'friend');
  await applyAffinity(db, target.id, actor.id,  +15, 'friend');

  return {
    type: 'gift', region_id: actor.region_id,
    actor_id: actor.id, target_id: target.id,
    affinity_delta: +12,
    payload: { amount, actor_name: actor.name, target_name: target.name },
  };
}

/** Dois NPCs se tornam amigos (afinidade já alta → formaliza a relação) */
async function eventFriendship(db, actor, target, state) {
  // Verifica se já têm afinidade positiva suficiente
  const [[rel]] = await db.execute(
    `SELECT affinity FROM npc_relations
      WHERE npc_id = ? AND target_npc_id = ? LIMIT 1`,
    [actor.id, target.id]
  );
  const affinity = rel?.affinity ?? 0;
  if (affinity < 20) return null; // precisa de base positiva

  await applyAffinity(db, actor.id,  target.id, +8, 'friend');
  await applyAffinity(db, target.id, actor.id,  +8, 'friend');

  // Atualiza relation_type para 'friend' se ainda for acquaintance
  await db.execute(
    `UPDATE npc_relations SET relation_type = 'friend'
      WHERE npc_id = ? AND target_npc_id = ? AND relation_type = 'acquaintance'`,
    [actor.id, target.id]
  );
  await db.execute(
    `UPDATE npc_relations SET relation_type = 'friend'
      WHERE npc_id = ? AND target_npc_id = ? AND relation_type = 'acquaintance'`,
    [target.id, actor.id]
  );

  return {
    type: 'friendship', region_id: actor.region_id,
    actor_id: actor.id, target_id: target.id,
    affinity_delta: +8,
    payload: { actor_name: actor.name, target_name: target.name },
  };
}

/** Romance entre NPCs solteiros adultos */
async function eventRomance(db, actor, target, state) {
  if (actor.age < 18 || target.age < 18) return null;

  // Verifica se algum já é casado
  const [[marriage]] = await db.execute(
    `SELECT id FROM npc_relations
      WHERE (npc_id = ? OR npc_id = ?) AND relation_type = 'spouse' LIMIT 1`,
    [actor.id, target.id]
  );
  if (marriage) return null;

  await applyAffinity(db, actor.id,  target.id, +20, 'romantic_partner');
  await applyAffinity(db, target.id, actor.id,  +20, 'romantic_partner');

  return {
    type: 'romance', region_id: actor.region_id,
    actor_id: actor.id, target_id: target.id,
    affinity_delta: +20,
    payload: { actor_name: actor.name, target_name: target.name },
  };
}

/** Casamento: precisa de parceiros românticos com alta afinidade */
async function eventMarriage(db, actor, target, state) {
  if (actor.age < 18 || target.age < 18) return null;

  const [[rel]] = await db.execute(
    `SELECT affinity, relation_type FROM npc_relations
      WHERE npc_id = ? AND target_npc_id = ? LIMIT 1`,
    [actor.id, target.id]
  );
  if (!rel || rel.affinity < 60 || rel.relation_type !== 'romantic_partner') return null;

  // Formaliza como cônjuges
  for (const [a, b] of [[actor.id, target.id], [target.id, actor.id]]) {
    await db.execute(
      `UPDATE npc_relations SET relation_type = 'spouse'
        WHERE npc_id = ? AND target_npc_id = ?`,
      [a, b]
    );
  }

  // Completa objetivo find_spouse se existir
  await db.execute(
    `UPDATE npc_objectives SET status = 'completed', completed_at_world_day = ?
      WHERE npc_id IN (?,?) AND type = 'find_spouse' AND status = 'active'`,
    [state.worldDay, actor.id, target.id]
  );

  return {
    type: 'marriage', region_id: actor.region_id,
    actor_id: actor.id, target_id: target.id,
    affinity_delta: +30,
    payload: { actor_name: actor.name, target_name: target.name },
  };
}

/** Morte por velhice */
async function eventDeathOldAge(db, actor, state) {
  if (actor.age < 70) return null;
  // Chance aumenta progressivamente depois dos 70
  const extraChance = (actor.age - 70) * 0.002;
  if (!roll(PROB.death_old_age + extraChance)) return null;

  await db.execute(
    'UPDATE npcs SET is_alive = 0, died_at_world_day = ? WHERE id = ?',
    [state.worldDay, actor.id]
  );

  // Gera traço 'grieving' em cônjuge e filhos
  const [family] = await db.execute(
    `SELECT target_npc_id FROM npc_relations
      WHERE npc_id = ? AND relation_type IN ('spouse','child') AND target_npc_id IS NOT NULL`,
    [actor.id]
  );
  for (const { target_npc_id } of family) {
    const [[member]] = await db.execute(
      'SELECT personality FROM npcs WHERE id = ? AND is_alive = 1', [target_npc_id]
    );
    if (!member) continue;
    const p = member.personality ?? { traits: [], acquired: [], dark: [] };
    p.acquired = p.acquired ?? [];
    p.acquired.push({ trait: 'grieving', expires_at_day: state.worldDay + 60 });
    await db.execute('UPDATE npcs SET personality = ? WHERE id = ?',
      [JSON.stringify(p), target_npc_id]);
    await applyAffinity(db, target_npc_id, actor.id, -20); // perda reflete na relação
  }

  return {
    type: 'death', region_id: actor.region_id,
    actor_id: actor.id, target_id: null,
    affinity_delta: 0,
    payload: { actor_name: actor.name, cause: 'old_age', age: actor.age },
  };
}

/** Roubo: thief/outlaw rouba ouro de um NPC próximo */
async function eventTheft(db, actor, target, state) {
  if (!['thief','outlaw'].includes(actor.role)) return null;
  if (target.gold < 10) return null;

  const stolen = Math.floor(target.gold * 0.1) + Math.floor(Math.random() * 20);
  await db.execute('UPDATE npcs SET gold = gold - ? WHERE id = ?', [stolen, target.id]);
  await db.execute('UPDATE npcs SET gold = gold + ? WHERE id = ?', [stolen, actor.id]);
  await applyAffinity(db, target.id, actor.id, -30, 'enemy');

  // Tag relacional emergente
  await db.execute(
    `UPDATE npc_relations SET tags = JSON_ARRAY_APPEND(COALESCE(tags, JSON_ARRAY()), '$', 'stole_from_me')
      WHERE npc_id = ? AND target_npc_id = ?`,
    [target.id, actor.id]
  );

  return {
    type: 'theft', region_id: actor.region_id,
    actor_id: actor.id, target_id: target.id,
    affinity_delta: -30,
    payload: { actor_name: actor.name, target_name: target.name, amount: stolen },
  };
}

/** Fofoca: NPC compartilha conhecimento com vizinho */
async function eventGossip(db, actor, target, state) {
  const [[actorFull]] = await db.execute(
    'SELECT knowledge FROM npcs WHERE id = ?', [actor.id]
  );
  const knowledge = actorFull?.knowledge ?? [];
  if (!knowledge.length) return null;

  const piece = pick(knowledge);
  const [[targetFull]] = await db.execute(
    'SELECT knowledge FROM npcs WHERE id = ?', [target.id]
  );
  const targetKnowledge = targetFull?.knowledge ?? [];
  if (targetKnowledge.includes(piece)) return null; // já sabe

  targetKnowledge.push(piece);
  await db.execute('UPDATE npcs SET knowledge = ? WHERE id = ?',
    [JSON.stringify(targetKnowledge), target.id]);
  await applyAffinity(db, actor.id, target.id, +2, 'acquaintance');

  return {
    type: 'gossip', region_id: actor.region_id,
    actor_id: actor.id, target_id: target.id,
    affinity_delta: +2,
    payload: { actor_name: actor.name, target_name: target.name, knowledge_piece: piece },
  };
}

/* ─────────────────────────────── PROCESSAMENTO DIÁRIO ──────────────────── */

/** Expira traços adquiridos e gera traços sombrios se necessário */
async function processDailyPersonality(db, worldDay) {
  const [npcs] = await db.execute(
    `SELECT id, personality, objectives FROM npcs
      WHERE world_id = ? AND is_alive = 1`, [WORLD_ID]
  );

  for (const npc of npcs) {
    const p = npc.personality ?? { traits: [], acquired: [], dark: [] };
    p.acquired = p.acquired ?? [];
    p.dark     = p.dark     ?? [];

    let changed = false;

    // Expira traços adquiridos
    const before = p.acquired.length;
    p.acquired = p.acquired.filter(t => !t.expires_at_day || t.expires_at_day > worldDay);
    if (p.acquired.length !== before) changed = true;

    // Luto não resolvido por 90+ dias vira traço sombrio permanente
    const hasChronicGrief = p.dark.includes('chronic_grief');
    const longGrief = p.acquired.find(
      t => t.trait === 'grieving' && (worldDay - (t.added_at_day ?? 0)) > 90
    );
    if (longGrief && !hasChronicGrief) {
      p.dark.push('chronic_grief');
      p.acquired = p.acquired.filter(t => t.trait !== 'grieving');
      changed = true;
    }

    // NPC sem objetivos e sem amigos → purposeless
    const hasPurposeless = p.dark.includes('purposeless');
    if (!hasPurposeless) {
      const objectives = npc.objectives ?? [];
      const activeObj  = objectives.filter(o => o.status === 'active');
      const [[friendCount]] = await db.execute(
        `SELECT COUNT(*) AS cnt FROM npc_relations
          WHERE npc_id = ? AND relation_type IN ('friend','spouse') AND affinity > 30`,
        [npc.id]
      );
      if (activeObj.length === 0 && friendCount.cnt === 0) {
        p.dark.push('purposeless');
        changed = true;
      }
    }

    if (changed) {
      await db.execute('UPDATE npcs SET personality = ? WHERE id = ?',
        [JSON.stringify(p), npc.id]);
    }
  }
}

/* ─────────────────────────────── TICK PRINCIPAL ────────────────────────── */

async function runTick(db, state) {
  const { tickNumber, worldDay, worldYear } = state;

  // Carrega regiões ativas (por ora todas; depois filtra por presença de jogadores)
  const [regions] = await db.execute(
    'SELECT id FROM regions WHERE world_id = ?', [WORLD_ID]
  );

  let totalEvents = 0;

  for (const { id: regionId } of regions) {
    const npcs = await loadRegionNPCs(db, regionId);
    if (npcs.length < 2) continue;

    // Cada NPC pode ser ator de um evento neste tick
    for (const actor of npcs) {
      // ── Morte por velhice ─────────────────────────────────────────
      if (actor.age >= 70) {
        const ev = await eventDeathOldAge(db, actor, state);
        if (ev) {
          const evId = await recordEvent(db, worldDay, worldYear, ev);
          log({ tick: tickNumber, worldDay, worldYear, eventId: evId, ...ev });
          totalEvents++;
          continue; // NPC morreu, pula outros eventos
        }
      }

      // Escolhe um alvo aleatório na mesma região
      const others = npcs.filter(n => n.id !== actor.id && n.is_alive !== 0);
      if (!others.length) continue;
      const target = pick(others);

      // ── Rolagem de eventos ────────────────────────────────────────
      let ev = null;

      if      (roll(PROB.theft)      && actor.role === 'thief')   ev = await eventTheft(db, actor, target, state);
      else if (roll(PROB.trade))                                   ev = await eventTrade(db, actor, target, state);
      else if (roll(PROB.gift))                                    ev = await eventGift(db, actor, target, state);
      else if (roll(PROB.argument))                                ev = await eventArgument(db, actor, target, state);
      else if (roll(PROB.romance))                                 ev = await eventRomance(db, actor, target, state);
      else if (roll(PROB.marriage))                                ev = await eventMarriage(db, actor, target, state);
      else if (roll(PROB.friendship))                              ev = await eventFriendship(db, actor, target, state);
      else if (roll(PROB.gossip))                                  ev = await eventGossip(db, actor, target, state);

      if (ev) {
        const evId = await recordEvent(db, worldDay, worldYear, ev);
        // Propaga afinidade grau 2
        if (ev.affinity_delta && ev.target_id) {
          await propagateAffinity(db, ev.actor_id, ev.target_id, ev.affinity_delta, evId);
        }
        log({ tick: tickNumber, worldDay, worldYear, eventId: evId, ...ev });
        totalEvents++;
      }
    }
  }

  // Processamento diário (uma vez por dia)
  if (tickNumber % 24 === 0) {
    await processDailyPersonality(db, worldDay);
    log({ tick: tickNumber, worldDay, worldYear, type: 'daily_rollup', totalEvents });
  }

  return totalEvents;
}

/* ─────────────────────────────── LOOP PRINCIPAL ─────────────────────────── */

async function main() {
  initLogger();

  const db = await mysql.createConnection(DB_CONFIG);
  console.log('[worldSimulator] Conectado ao banco ✓');

  // Carrega estado atual do mundo
  const [[world]] = await db.execute(
    'SELECT * FROM worlds WHERE id = ?', [WORLD_ID]
  );
  if (!world) {
    console.error('[worldSimulator] Mundo #1 não encontrado no banco.');
    process.exit(1);
  }

  let tickNumber  = 0;
  let worldDay    = world.world_day   ?? 1;
  let worldYear   = world.world_year  ?? 1;
  let worldHour   = world.world_hour  ?? 0;

  console.log(`[worldSimulator] Iniciando em Ano ${worldYear}, Dia ${worldDay}, Hora ${worldHour}`);
  console.log(`[worldSimulator] MAX_TICKS=${MAX_TICKS === Infinity ? '∞' : MAX_TICKS}, TICK_INTERVAL=${TICK_INTERVAL}ms`);
  console.log('[worldSimulator] ▶  Simulação rodando...\n');

  const tick = async () => {
    tickNumber++;
    worldHour = (worldHour + HOURS_PER_TICK) % 24;
    if (worldHour === 0) {
      worldDay++;
      if (worldDay > 365) { worldDay = 1; worldYear++; }
    }

    const state = { tickNumber, worldDay, worldYear, worldHour };

    try {
      const evCount = await runTick(db, state);

      // Persiste estado do mundo no banco a cada hora
      await db.execute(
        `UPDATE worlds SET world_day = ?, world_year = ?, world_hour = ?, updated_at = NOW() WHERE id = ?`,
        [worldDay, worldYear, worldHour, WORLD_ID]
      );

      if (!HEADLESS) {
        process.stdout.write(
          `\r[tick ${String(tickNumber).padStart(4,'0')}] ` +
          `Ano ${worldYear}  Dia ${String(worldDay).padStart(3,'0')}  ` +
          `Hora ${String(worldHour).padStart(2,'0')}  ` +
          `eventos: ${String(evCount).padStart(3,' ')}   `
        );
      }
    } catch (err) {
      console.error(`\n[worldSimulator] ❌ Erro no tick ${tickNumber}:`, err.message);
    }

    if (tickNumber >= MAX_TICKS) {
      console.log(`\n[worldSimulator] ✅ ${MAX_TICKS} ticks concluídos. Encerrando.`);
      await db.end();
      process.exit(0);
    }
  };

  // Primeiro tick imediato, depois a cada TICK_INTERVAL
  await tick();
  const interval = setInterval(tick, TICK_INTERVAL);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    clearInterval(interval);
    console.log('\n[worldSimulator] ⏹  Interrompido. Salvando estado...');
    await db.execute(
      'UPDATE worlds SET world_day = ?, world_year = ?, world_hour = ?, updated_at = NOW() WHERE id = ?',
      [worldDay, worldYear, worldHour, WORLD_ID]
    );
    await db.end();
    console.log('[worldSimulator] Estado salvo. Até logo.');
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[worldSimulator] FATAL:', err);
  process.exit(1);
});
