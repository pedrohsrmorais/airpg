'use strict';

/**
 * AIRPG — Gerador de NPCs
 *
 * Gera ~500 NPCs distribuídos pela ilha:
 *   - Porto de Vael (região 1):        ~350 NPCs
 *   - Aldeia dos Caçadores (região 2):  ~50 NPCs
 *   - Aldeia de Aure (região 3):        ~60 NPCs
 *   - Aldeia Costeira de Marev (região 4): ~55 NPCs
 *   - Vila de Drak (região 5):          ~45 NPCs
 *   - Ruínas de Keth (região 6):        ~10 NPCs (exploradores/cultistas)
 *
 * Uso: node seed/npcs.js
 * Atenção: requer que seed/map.js já tenha rodado.
 */

const mysql = require('mysql2/promise');
require('dotenv').config({ path: `${__dirname}/../.env` });

const DB_CONFIG = {
  host:     process.env.DB_HOST     || 'localhost',
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || 'alfaiate10',
  database: process.env.DB_NAME     || 'airpg',
};

const WORLD_ID = 1;

/* ── Tabelas de dados ─────────────────────────────────────────────────────── */

const FIRST_NAMES_M = [
  'Aldric','Brennan','Caelan','Doran','Elric','Fendrel','Gareth','Hadwin',
  'Idris','Jareth','Kellen','Loric','Maren','Navan','Orin','Petyr','Quinn',
  'Raelin','Soren','Torin','Ulric','Valen','Wren','Xander','Yoris','Zane',
  'Borin','Caius','Daven','Elan','Faren','Garen','Havin','Ivar','Jorin',
  'Kavar','Lander','Marlo','Norvin','Orlan','Pryor','Ravin','Salin','Tavor',
];

const FIRST_NAMES_F = [
  'Aelith','Bryn','Calla','Daria','Elara','Fiera','Gwen','Hessa','Iona',
  'Jael','Kira','Lyra','Mira','Nara','Orla','Petra','Quelle','Rena',
  'Sable','Tessa','Ursa','Vira','Willa','Xena','Yara','Zora','Annis',
  'Beryl','Cira','Deva','Erin','Falla','Gisel','Hala','Ilara','Janeth',
  'Kalin','Lessa','Morin','Nessa','Opal','Priya','Raina','Selene','Tavia',
];

const LAST_NAMES = [
  'Ashford','Blackwood','Coldwater','Dunmore','Elderborn','Frostmark',
  'Greymoor','Harwick','Ironside','Jadewine','Kellmark','Linborne',
  'Morrow','Nettlewick','Orestone','Pendwick','Queensbury','Ravenmore',
  'Stonegate','Thistledown','Underholm','Varwick','Wellbrook','Xander',
  'Yarwick','Zorwell','Ashton','Blackthorn','Crossley','Dawnwood',
  'Everett','Fairbrook','Goldsworth','Highmark','Ironshard','Jadewick',
  'Kessler','Longbow','Markwood','Northgate','Oakwood','Pinecrest',
];

const DEITIES = ['Ereth','Tharkon','Mira','Soleth','Draevon','Kezan','Lune','Vorath'];

const FACTIONS = ['none','merchants_guild','temple_of_ereth','city_guard','miners_union','fishermens_guild','shadow_hand','free_settlers'];

const PROFESSIONS = {
  1: [ // Porto de Vael
    { role: 'merchant',       weight: 12 },
    { role: 'guard',          weight: 10 },
    { role: 'innkeeper',      weight: 5 },
    { role: 'blacksmith',     weight: 4 },
    { role: 'sailor',         weight: 8 },
    { role: 'fisherman',      weight: 7 },
    { role: 'priest',         weight: 4 },
    { role: 'thief',          weight: 3 },
    { role: 'nobleman',       weight: 3 },
    { role: 'craftsman',      weight: 8 },
    { role: 'farmer',         weight: 4 },
    { role: 'beggar',         weight: 3 },
    { role: 'bard',           weight: 3 },
    { role: 'scribe',         weight: 3 },
    { role: 'healer',         weight: 3 },
    { role: 'dock_worker',    weight: 8 },
    { role: 'servant',        weight: 6 },
    { role: 'child',          weight: 8 },
    { role: 'elder',          weight: 4 },
    { role: 'adventurer',     weight: 2 },
  ],
  2: [ // Bosque Brumoso
    { role: 'hunter',         weight: 30 },
    { role: 'herbalist',      weight: 15 },
    { role: 'woodcutter',     weight: 20 },
    { role: 'trapper',        weight: 15 },
    { role: 'elder',          weight: 5 },
    { role: 'child',          weight: 10 },
    { role: 'outlaw',         weight: 5 },
  ],
  3: [ // Planícies de Aure
    { role: 'farmer',         weight: 40 },
    { role: 'miller',         weight: 10 },
    { role: 'shepherd',       weight: 15 },
    { role: 'merchant',       weight: 5 },
    { role: 'priest',         weight: 5 },
    { role: 'child',          weight: 15 },
    { role: 'elder',          weight: 5 },
    { role: 'guard',          weight: 5 },
  ],
  4: [ // Aldeia Costeira de Marev
    { role: 'fisherman',      weight: 40 },
    { role: 'sailor',         weight: 20 },
    { role: 'net_maker',      weight: 10 },
    { role: 'innkeeper',      weight: 5 },
    { role: 'smuggler',       weight: 5 },
    { role: 'child',          weight: 10 },
    { role: 'elder',          weight: 5 },
    { role: 'lighthouse_keeper', weight: 5 },
  ],
  5: [ // Vila dos Montes de Drak
    { role: 'miner',          weight: 40 },
    { role: 'blacksmith',     weight: 15 },
    { role: 'guard',          weight: 10 },
    { role: 'merchant',       weight: 8 },
    { role: 'innkeeper',      weight: 5 },
    { role: 'child',          weight: 10 },
    { role: 'elder',          weight: 5 },
    { role: 'outlaw',         weight: 7 },
  ],
  6: [ // Ruínas de Keth
    { role: 'adventurer',     weight: 30 },
    { role: 'scholar',        weight: 25 },
    { role: 'cultist',        weight: 25 },
    { role: 'outlaw',         weight: 20 },
  ],
};

const INNATE_TRAITS = [
  'brave','cowardly','honest','deceitful','generous','greedy','kind','cruel',
  'curious','incurious','patient','impatient','loyal','treacherous','proud',
  'humble','ambitious','content','cautious','reckless','cheerful','gloomy',
  'suspicious','trusting','stubborn','flexible','passionate','reserved',
  'protective','selfish',
];

const SKILLS_BY_ROLE = {
  merchant:        ['bargaining','appraisal','persuasion','accounting'],
  guard:           ['swordsmanship','alertness','intimidation','patrol'],
  innkeeper:       ['cooking','hospitality','gossip','accounting'],
  blacksmith:      ['metalworking','swordsmanship','appraisal','endurance'],
  sailor:          ['navigation','swimming','rope_work','weather_reading'],
  fisherman:       ['fishing','swimming','weather_reading','net_casting'],
  priest:          ['theology','healing','persuasion','ritual'],
  thief:           ['stealth','lockpicking','sleight_of_hand','deception'],
  nobleman:        ['etiquette','politics','riding','accounting'],
  craftsman:       ['crafting','appraisal','bargaining','endurance'],
  farmer:          ['agriculture','animal_handling','endurance','weather_reading'],
  beggar:          ['begging','stealth','gossip','survival'],
  bard:            ['performance','persuasion','gossip','history'],
  scribe:          ['writing','reading','history','languages'],
  healer:          ['medicine','herbalism','diagnosis','empathy'],
  dock_worker:     ['endurance','rope_work','swimming','loading'],
  servant:         ['cooking','cleaning','discretion','etiquette'],
  hunter:          ['tracking','archery','stealth','skinning'],
  herbalist:       ['herbalism','medicine','foraging','botany'],
  woodcutter:      ['axe_skill','endurance','navigation','survival'],
  trapper:         ['trapping','tracking','stealth','survival'],
  miner:           ['mining','endurance','geology','explosives'],
  miller:          ['milling','agriculture','machinery','accounting'],
  shepherd:        ['animal_handling','weather_reading','endurance','navigation'],
  net_maker:       ['crafting','fishing','rope_work','trade'],
  smuggler:        ['stealth','navigation','deception','bribing'],
  lighthouse_keeper: ['navigation','signaling','rope_work','endurance'],
  outlaw:          ['combat','stealth','survival','intimidation'],
  adventurer:      ['combat','survival','exploration','first_aid'],
  scholar:         ['research','history','magic_theory','languages'],
  cultist:         ['ritual','stealth','deception','dark_magic'],
  elder:           ['wisdom','history','gossip','medicine'],
  child:           [],
  trapper:         ['trapping','tracking','survival','knife_skills'],
};

/* ── Utilidades ──────────────────────────────────────────────────────────────── */

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedPick(items) {
  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item.role;
  }
  return items[items.length - 1].role;
}

function genName(gender) {
  const first = gender === 'male'
    ? pick(FIRST_NAMES_M)
    : pick(FIRST_NAMES_F);
  return `${first} ${pick(LAST_NAMES)}`;
}

function genAge(role) {
  if (role === 'child') return rand(6, 15);
  if (role === 'elder') return rand(62, 80);
  if (['nobleman','merchant','priest'].includes(role)) return rand(30, 60);
  return rand(18, 55);
}

function genGold(role, age) {
  const base = {
    nobleman: rand(500, 2000),
    merchant: rand(200, 800),
    blacksmith: rand(100, 400),
    innkeeper: rand(150, 500),
    guard: rand(30, 100),
    priest: rand(50, 200),
    sailor: rand(20, 80),
    craftsman: rand(50, 200),
    farmer: rand(20, 80),
    fisherman: rand(20, 70),
    hunter: rand(15, 60),
    miner: rand(30, 100),
    thief: rand(10, 150),
    smuggler: rand(50, 300),
    scholar: rand(30, 120),
    beggar: rand(0, 10),
    child: rand(0, 5),
    servant: rand(5, 25),
    dock_worker: rand(10, 40),
    bard: rand(10, 50),
  };
  return base[role] ?? rand(10, 60);
}

function genPersonality() {
  const count = rand(2, 4);
  const traits = [];
  const pool = [...INNATE_TRAITS];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    traits.push(pool.splice(idx, 1)[0]);
  }
  return { traits, acquired: [], dark: [] };
}

function genSkills(role) {
  const pool = SKILLS_BY_ROLE[role] || [];
  const result = {};
  for (const skill of pool) {
    result[skill] = rand(1, 5);
  }
  return result;
}

function genInventory(role, gold) {
  const inv = [];
  // Cada profissão tem itens básicos
  const startingItems = {
    blacksmith:  [{ item_key: 'hammer', quantity: 1 }, { item_key: 'iron_ingot', quantity: rand(3,8) }],
    guard:       [{ item_key: 'shortsword', quantity: 1 }, { item_key: 'leather_armor', quantity: 1 }],
    merchant:    [{ item_key: 'merchant_scale', quantity: 1 }, { item_key: 'trade_ledger', quantity: 1 }],
    farmer:      [{ item_key: 'pitchfork', quantity: 1 }, { item_key: 'seeds', quantity: rand(5,15) }],
    fisherman:   [{ item_key: 'fishing_rod', quantity: 1 }, { item_key: 'net', quantity: rand(1,3) }],
    hunter:      [{ item_key: 'hunting_bow', quantity: 1 }, { item_key: 'arrows', quantity: rand(10,30) }],
    healer:      [{ item_key: 'healing_herb', quantity: rand(5,15) }, { item_key: 'bandage', quantity: rand(3,8) }],
    miner:       [{ item_key: 'pickaxe', quantity: 1 }, { item_key: 'lantern', quantity: 1 }],
    priest:      [{ item_key: 'holy_symbol', quantity: 1 }, { item_key: 'prayer_book', quantity: 1 }],
    sailor:      [{ item_key: 'rope', quantity: rand(2,5) }, { item_key: 'sailors_knife', quantity: 1 }],
    bard:        [{ item_key: 'lute', quantity: 1 }],
    scholar:     [{ item_key: 'scroll', quantity: rand(2,6) }, { item_key: 'ink_and_quill', quantity: 1 }],
    thief:       [{ item_key: 'lockpick', quantity: rand(2,5) }, { item_key: 'dagger', quantity: 1 }],
  };
  return startingItems[role] || [];
}

function genProperties(role, gold) {
  if (['nobleman','merchant'].includes(role) && gold > 300) {
    return [{ type: 'house', name: 'Casa familiar', region_id: 1, value: rand(300, 1000) }];
  }
  if (['blacksmith','innkeeper'].includes(role)) {
    return [{ type: 'shop', name: `${role === 'blacksmith' ? 'Ferraria' : 'Estalagem'} pessoal`, region_id: 1, value: rand(200, 600) }];
  }
  if (['farmer'].includes(role)) {
    return [{ type: 'land', name: 'Parcela de terra', region_id: 3, value: rand(100, 400) }];
  }
  return [];
}

function genObjectives(role, age, regionId) {
  const objectives = [];

  // Objetivos por papel social
  if (age > 20 && age < 45 && !['child','elder'].includes(role)) {
    if (Math.random() < 0.35) {
      objectives.push({ type: 'find_spouse', status: 'active', priority: rand(3, 6), payload: { age_min: Math.max(18, age - 10), age_max: age + 10 } });
    }
  }
  if (['merchant','blacksmith','innkeeper','craftsman'].includes(role) && Math.random() < 0.3) {
    objectives.push({ type: 'accumulate_gold', status: 'active', priority: rand(3, 6), payload: { target_amount: rand(300, 1500), reason: 'security' } });
  }
  if (role === 'merchant' && Math.random() < 0.25) {
    objectives.push({ type: 'expand_business', status: 'active', priority: rand(4, 7), payload: { business_type: 'trade', expansion_goal: 'open_second_shop' } });
  }
  if (Math.random() < 0.15) {
    objectives.push({ type: 'learn_skill', status: 'active', priority: rand(1, 4), payload: { skill_name: pick(['brewing','cooking','woodworking','languages','healing']), progress: 0, target_level: rand(2, 4) } });
  }
  if (age > 40 && ['farmer','fisherman','craftsman','merchant'].includes(role) && Math.random() < 0.2) {
    objectives.push({ type: 'marry_off_child', status: 'blocked', priority: rand(4, 7), payload: { child_npc_id: null } });
  }

  return objectives;
}

function genRelationships(npcId, allNpcs, regionId) {
  // Retorna lista de relações para inserir depois que todos os NPCs existirem
  // Será preenchido na fase 2 do seed
  return [];
}

/* ── Gerador de NPC ──────────────────────────────────────────────────────────── */

function generateNPC(regionId, locationId, posX, posY) {
  const gender  = Math.random() < 0.48 ? 'male' : 'female';
  const role    = weightedPick(PROFESSIONS[regionId] || PROFESSIONS[1]);
  const age     = genAge(role);
  const name    = genName(gender);
  const gold    = genGold(role, age);
  const deity   = Math.random() < 0.8 ? pick(DEITIES) : null;
  const faction = Math.random() < 0.4 ? pick(FACTIONS) : 'none';

  return {
    world_id:    WORLD_ID,
    region_id:   regionId,
    location_id: locationId,
    pos_x:       posX + (Math.random() * 10 - 5),
    pos_y:       posY + (Math.random() * 10 - 5),
    name,
    gender,
    age,
    role,
    gold,
    religion:    deity,
    faction:     faction,
    personality: genPersonality(),
    skills:      genSkills(role),
    inventory:   genInventory(role, gold),
    properties:  genProperties(role, gold),
    objectives:  genObjectives(role, age, regionId),
    reputation:  rand(0, 100),
    is_alive:    1,
    is_hostile:  role === 'cultist' || role === 'outlaw' ? (Math.random() < 0.4 ? 1 : 0) : 0,
    description: `${name}, ${age} anos, ${role}.`,
    knowledge:   [],
    loot_table:  role !== 'child' ? JSON.stringify({ gold_min: Math.floor(gold * 0.1), gold_max: Math.floor(gold * 0.4) }) : null,
  };
}

/* ── Gerador de relações familiares ─────────────────────────────────────────── */

function buildFamilyRelations(npcs) {
  const relations = [];
  const adults = npcs.filter(n => n.age >= 20 && n.age <= 55 && n.is_alive);
  const children = npcs.filter(n => n.age < 18 && n.is_alive);
  const byRegion = {};

  for (const n of adults) {
    if (!byRegion[n.region_id]) byRegion[n.region_id] = [];
    byRegion[n.region_id].push(n);
  }

  // Criar casais (30% dos adultos)
  const couples = new Set();
  for (const [regionId, regionAdults] of Object.entries(byRegion)) {
    const males   = regionAdults.filter(n => n.gender === 'male');
    const females = regionAdults.filter(n => n.gender === 'female');
    const pairCount = Math.floor(Math.min(males.length, females.length) * 0.3);

    for (let i = 0; i < pairCount; i++) {
      if (i >= males.length || i >= females.length) break;
      const m = males[i];
      const f = females[i];
      if (couples.has(m.idx) || couples.has(f.idx)) continue;
      couples.add(m.idx);
      couples.add(f.idx);

      relations.push({ npc_id: m.idx, target_npc_id: f.idx, relation_type: 'spouse', affinity: rand(40, 90), tags: JSON.stringify(['married']) });
      relations.push({ npc_id: f.idx, target_npc_id: m.idx, relation_type: 'spouse', affinity: rand(40, 90), tags: JSON.stringify(['married']) });
    }
  }

  // Criar relações pai/filho (alguns casais têm filhos)
  const coupleList = [...couples];
  for (let i = 0; i < coupleList.length; i += 2) {
    if (i + 1 >= coupleList.length) break;
    const parent1Idx = coupleList[i];
    const parent2Idx = coupleList[i + 1];
    const parent1 = npcs[parent1Idx];
    const parent2 = npcs[parent2Idx];
    if (!parent1 || !parent2) continue;

    const regionChildren = children.filter(c => c.region_id === parent1.region_id);
    const childCount = Math.min(rand(0, 3), regionChildren.length);
    for (let j = 0; j < childCount; j++) {
      const child = regionChildren[j];
      if (!child) break;
      relations.push({ npc_id: parent1.idx, target_npc_id: child.idx, relation_type: 'parent', affinity: rand(60, 95), tags: JSON.stringify(['family']) });
      relations.push({ npc_id: child.idx,   target_npc_id: parent1.idx, relation_type: 'child', affinity: rand(50, 90), tags: JSON.stringify(['family']) });
      relations.push({ npc_id: parent2.idx, target_npc_id: child.idx, relation_type: 'parent', affinity: rand(60, 95), tags: JSON.stringify(['family']) });
      relations.push({ npc_id: child.idx,   target_npc_id: parent2.idx, relation_type: 'child', affinity: rand(50, 90), tags: JSON.stringify(['family']) });
    }
  }

  // Criar amizades (20% dos NPCs têm 1-3 amigos próximos na mesma região)
  for (const npc of adults) {
    const regionMates = (byRegion[npc.region_id] || []).filter(n => n.idx !== npc.idx);
    const friendCount = rand(0, 3);
    const chosen = regionMates.sort(() => Math.random() - 0.5).slice(0, friendCount);
    for (const friend of chosen) {
      const existing = relations.find(r => r.npc_id === npc.idx && r.target_npc_id === friend.idx);
      if (!existing) {
        relations.push({ npc_id: npc.idx, target_npc_id: friend.idx, relation_type: 'friend', affinity: rand(20, 70), tags: JSON.stringify([]) });
      }
    }
  }

  // Criar rivalidades (5% têm um rival)
  for (const npc of adults) {
    if (Math.random() < 0.05) {
      const regionMates = (byRegion[npc.region_id] || []).filter(n => n.idx !== npc.idx && n.role === npc.role);
      if (regionMates.length > 0) {
        const rival = pick(regionMates);
        relations.push({ npc_id: npc.idx, target_npc_id: rival.idx, relation_type: 'rival', affinity: rand(-70, -20), tags: JSON.stringify(['rival','competitor']) });
      }
    }
  }

  // Criar relações empregador/empregado
  const employers = adults.filter(n => ['merchant','innkeeper','blacksmith','nobleman','farmer'].includes(n.role));
  const employees = adults.filter(n => ['servant','dock_worker','craftsman','guard'].includes(n.role));
  for (const emp of employers) {
    const workerCount = rand(0, 2);
    const available = employees.filter(n => n.region_id === emp.region_id);
    const chosen = available.sort(() => Math.random() - 0.5).slice(0, workerCount);
    for (const worker of chosen) {
      relations.push({ npc_id: emp.idx,    target_npc_id: worker.idx, relation_type: 'employer', affinity: rand(10, 50), tags: JSON.stringify(['employer']) });
      relations.push({ npc_id: worker.idx, target_npc_id: emp.idx,    relation_type: 'employee', affinity: rand(10, 40), tags: JSON.stringify(['employee']) });
    }
  }

  return relations;
}

/* ── Script principal ────────────────────────────────────────────────────────── */

const DISTRIBUTION = [
  { region_id: 1, count: 350 },
  { region_id: 2, count: 50  },
  { region_id: 3, count: 60  },
  { region_id: 4, count: 55  },
  { region_id: 5, count: 45  },
  { region_id: 6, count: 10  },
];

async function main() {
  console.log('👥 AIRPG NPC Seeder — Iniciando...\n');

  const conn = await mysql.createConnection(DB_CONFIG);

  try {
    // Buscar locais por região
    const [locationRows] = await conn.execute(
      'SELECT id, region_id, pos_x, pos_y FROM locations WHERE region_id IN (1,2,3,4,5,6)'
    );
    const locationsByRegion = {};
    for (const loc of locationRows) {
      if (!locationsByRegion[loc.region_id]) locationsByRegion[loc.region_id] = [];
      locationsByRegion[loc.region_id].push(loc);
    }

    // Limpar NPCs existentes
    console.log('🧹 Limpando NPCs anteriores...');
    await conn.execute('DELETE FROM npc_relations WHERE 1=1');
    await conn.execute('DELETE FROM npc_objectives WHERE 1=1');
    await conn.execute('DELETE FROM npcs WHERE world_id = ?', [WORLD_ID]);

    // Gerar NPCs
    const allNPCs = [];
    for (const { region_id, count } of DISTRIBUTION) {
      const locs = locationsByRegion[region_id] || [];
      if (locs.length === 0) {
        console.warn(`   ⚠ Região ${region_id} sem locais. Pulando.`);
        continue;
      }
      for (let i = 0; i < count; i++) {
        const loc = pick(locs);
        allNPCs.push(generateNPC(region_id, loc.id, parseFloat(loc.pos_x), parseFloat(loc.pos_y)));
      }
    }

    console.log(`\n🧑‍🤝‍🧑 Inserindo ${allNPCs.length} NPCs...`);

    // Inserir NPCs no banco
    const insertedIds = [];
    for (const npc of allNPCs) {
      const [result] = await conn.execute(
        `INSERT INTO npcs
           (world_id, region_id, location_id, pos_x, pos_y, name, gender, age, role,
            gold, religion, faction, personality, skills, inventory, properties,
            objectives, reputation, is_alive, is_hostile, description, knowledge, loot_table)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          npc.world_id, npc.region_id, npc.location_id,
          npc.pos_x.toFixed(4), npc.pos_y.toFixed(4),
          npc.name, npc.gender, npc.age, npc.role,
          npc.gold, npc.religion, npc.faction,
          JSON.stringify(npc.personality),
          JSON.stringify(npc.skills),
          JSON.stringify(npc.inventory),
          JSON.stringify(npc.properties),
          JSON.stringify(npc.objectives),
          npc.reputation,
          npc.is_alive, npc.is_hostile,
          npc.description,
          JSON.stringify(npc.knowledge),
          npc.loot_table,
        ]
      );
      insertedIds.push(result.insertId);
    }

    // Marcar índice para referência nas relações
    for (let i = 0; i < allNPCs.length; i++) {
      allNPCs[i].idx = insertedIds[i];
    }

    // Gerar objetivos separados (tabela npc_objectives)
    console.log('\n🎯 Inserindo objetivos...');
    let objCount = 0;
    for (let i = 0; i < allNPCs.length; i++) {
      const npc = allNPCs[i];
      for (const obj of npc.objectives) {
        await conn.execute(
          `INSERT INTO npc_objectives (npc_id, type, status, priority, payload)
           VALUES (?,?,?,?,?)`,
          [npc.idx, obj.type, obj.status, obj.priority, JSON.stringify(obj.payload)]
        );
        objCount++;
      }
    }

    // Construir e inserir relações
    console.log('\n💞 Construindo relações sociais...');
    const relations = buildFamilyRelations(allNPCs);
    let relCount = 0;
    for (const rel of relations) {
      if (!rel.npc_id || !rel.target_npc_id) continue;
      try {
        await conn.execute(
          `INSERT IGNORE INTO npc_relations
             (npc_id, target_npc_id, relation_type, affinity, tags, is_known_to_player)
           VALUES (?,?,?,?,?,?)`,
          [rel.npc_id, rel.target_npc_id, rel.relation_type, rel.affinity, rel.tags, JSON.stringify({})]
        );
        relCount++;
      } catch (e) {
        // ignorar duplicatas
      }
    }

    // Resolver objetivo marry_off_child: tentar associar filhos reais
    console.log('\n🔗 Resolvendo objetivos dependentes...');
    const parentRelations = relations.filter(r => r.relation_type === 'parent');
    for (const pr of parentRelations) {
      const parentNpc = allNPCs.find(n => n.idx === pr.npc_id);
      if (!parentNpc) continue;
      const marriageObj = parentNpc.objectives.find(o => o.type === 'marry_off_child');
      if (marriageObj && marriageObj.payload.child_npc_id === null) {
        marriageObj.payload.child_npc_id = pr.target_npc_id;
        await conn.execute(
          `UPDATE npc_objectives SET status='active', payload=? WHERE npc_id=? AND type='marry_off_child'`,
          [JSON.stringify(marriageObj.payload), pr.npc_id]
        );
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ NPCs gerados com sucesso!');
    console.log(`   NPCs criados:    ${allNPCs.length}`);
    console.log(`   Objetivos:       ${objCount}`);
    console.log(`   Relações:        ${relCount}`);
    console.log('');

    // Estatísticas por região
    for (const { region_id, count } of DISTRIBUTION) {
      const r = allNPCs.filter(n => n.region_id === region_id);
      const roleCount = r.reduce((acc, n) => { acc[n.role] = (acc[n.role] || 0) + 1; return acc; }, {});
      const top3 = Object.entries(roleCount).sort((a,b) => b[1]-a[1]).slice(0,3).map(([r,c]) => `${r}(${c})`).join(', ');
      console.log(`   Região ${region_id}: ${r.length} NPCs — ${top3}`);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error('\n❌ Erro no seeder de NPCs:', err.message);
  console.error(err.stack);
  process.exit(1);
});
