'use strict';

/**
 * AIRPG — Gerador do mapa da Ilha de Eldoria
 *
 * Cria 1 cidade principal + 4 vilas ao redor de uma ilha.
 * Insere regiões, locais e conexões entre regiões no banco.
 *
 * Uso: node seed/map.js
 */

const mysql = require('mysql2/promise');
require('dotenv').config({ path: `${__dirname}/../.env` });

const DB_CONFIG = {
  host:     process.env.DB_HOST     || 'localhost',
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || 'alfaiate10',
  database: process.env.DB_NAME     || 'airpg',
  multipleStatements: true,
};

/* ── Definição da ilha ──────────────────────────────────────────────────────── */

const WORLD_ID = 1;

/**
 * Regiões da ilha. O layout:
 *
 *          [5] Vila dos Montes (mountain)
 *               /       \
 *   [2] Bosque Brumoso   [3] Planícies de Aure
 *               \       /
 *          [1] Porto de Vael (city)  ←→  [4] Aldeia Costeira
 *                     |
 *               [6] Ruínas de Keth (ruins frontier)
 *
 * Coordenadas em unidades de mapa (0-400 × 0-400)
 */
const REGIONS = [
  {
    id:           1,
    name:         'Porto de Vael',
    type:         'city',
    description:  'A cidade costeira central da ilha. Centro de comércio, política e cultura. Abriga as famílias mais influentes e os mercadores mais ricos.',
    min_x: 140, max_x: 260,
    min_y: 200, max_y: 320,
    danger_level: 1,
    resources:   JSON.stringify({ fish: 'abundant', stone: 'common', timber: 'common', iron: 'scarce' }),
    encounters:  JSON.stringify({ guards: 'common', merchants: 'abundant', thieves: 'rare' }),
    population_capacity: 400,
  },
  {
    id:           2,
    name:         'Bosque Brumoso',
    type:         'forest',
    description:  'Uma floresta densa e úmida no oeste da ilha. Cheia de caçadores e coletores. Dizem que criaturas estranhas habitam o interior.',
    min_x: 0,   max_x: 140,
    min_y: 100, max_y: 300,
    danger_level: 3,
    resources:   JSON.stringify({ timber: 'abundant', herbs: 'abundant', game: 'common', mushrooms: 'common' }),
    encounters:  JSON.stringify({ wolves: 'common', bandits: 'uncommon', hunters: 'common', unknown_creatures: 'rare' }),
    population_capacity: 80,
  },
  {
    id:           3,
    name:         'Planícies de Aure',
    type:         'plains',
    description:  'Vastas planícies ao leste da cidade. Campos de trigo e pastos. A maioria dos alimentos da ilha vem daqui.',
    min_x: 260, max_x: 400,
    min_y: 150, max_y: 320,
    danger_level: 1,
    resources:   JSON.stringify({ grain: 'abundant', cattle: 'common', vegetables: 'abundant', wool: 'common' }),
    encounters:  JSON.stringify({ farmers: 'abundant', merchants: 'common', bandits: 'rare' }),
    population_capacity: 70,
  },
  {
    id:           4,
    name:         'Aldeia Costeira de Marev',
    type:         'coast',
    description:  'Uma pequena aldeia de pescadores ao norte da costa. Vida simples, vento salgado e segredos do mar.',
    min_x: 260, max_x: 400,
    min_y: 0,   max_y: 150,
    danger_level: 2,
    resources:   JSON.stringify({ fish: 'abundant', salt: 'common', pearls: 'rare', driftwood: 'common' }),
    encounters:  JSON.stringify({ fishermen: 'abundant', sailors: 'common', sea_creatures: 'rare' }),
    population_capacity: 60,
  },
  {
    id:           5,
    name:         'Vila dos Montes de Drak',
    type:         'mountain',
    description:  'Uma vila de mineradores no norte montanhoso. Ferro, cobre e pedras preciosas emergem dessas colinas — assim como os problemas.',
    min_x: 100, max_x: 260,
    min_y: 0,   max_y: 100,
    danger_level: 3,
    resources:   JSON.stringify({ iron: 'abundant', copper: 'common', gemstones: 'uncommon', coal: 'common' }),
    encounters:  JSON.stringify({ miners: 'abundant', goblins: 'uncommon', cave_creatures: 'rare', bandits: 'uncommon' }),
    population_capacity: 50,
  },
  {
    id:           6,
    name:         'Ruínas de Keth',
    type:         'mixed',
    description:  'As ruínas de uma civilização antiga ao sul da ilha. Muito poucos vivem aqui — apenas os corajosos, os desesperados e os loucos.',
    min_x: 100, max_x: 300,
    min_y: 320, max_y: 400,
    danger_level: 5,
    resources:   JSON.stringify({ artifacts: 'rare', obsidian: 'uncommon', cursed_items: 'rare' }),
    encounters:  JSON.stringify({ undead: 'common', cultists: 'uncommon', ruins_explorers: 'rare', ancient_guardians: 'rare' }),
    population_capacity: 30,
  },
];

/** Conexões entre regiões */
const CONNECTIONS = [
  { from: 1, to: 2, hours: 3.0, danger: 'medium' },  // Porto → Bosque
  { from: 1, to: 3, hours: 2.5, danger: 'low' },     // Porto → Planícies
  { from: 1, to: 4, hours: 2.0, danger: 'low' },     // Porto → Aldeia Costeira
  { from: 1, to: 5, hours: 4.0, danger: 'medium' },  // Porto → Vila dos Montes
  { from: 1, to: 6, hours: 5.0, danger: 'high' },    // Porto → Ruínas
  { from: 2, to: 5, hours: 3.5, danger: 'high' },    // Bosque → Vila dos Montes
  { from: 3, to: 4, hours: 2.0, danger: 'low' },     // Planícies → Aldeia Costeira
  { from: 4, to: 5, hours: 3.0, danger: 'medium' },  // Aldeia Costeira → Vila dos Montes
  { from: 2, to: 6, hours: 6.0, danger: 'high' },    // Bosque → Ruínas
  { from: 3, to: 6, hours: 4.0, danger: 'high' },    // Planícies → Ruínas
];

/** Locais dentro de cada região */
const LOCATIONS_BY_REGION = {
  // Porto de Vael — cidade principal
  1: [
    { name: 'A Taverna do Porto',        type: 'tavern',       desc: 'Ponto de encontro de marinheiros e aventureiros. Rumores chegam aqui antes de qualquer lugar.',                pos_x: 170, pos_y: 240, actions: ['eat','drink','rest','talk','hire'] },
    { name: 'Mercado Central',           type: 'market',       desc: 'O coração comercial da cidade. Vendedores de toda a ilha se reúnem aqui.',                                    pos_x: 200, pos_y: 260, actions: ['buy','sell','trade','appraise'] },
    { name: 'Ferraria Gundar',           type: 'blacksmith',   desc: 'O mais velho ferreiro da ilha. Sua forja nunca apaga.',                                                        pos_x: 185, pos_y: 280, actions: ['buy','sell','repair','craft','commission'] },
    { name: 'Templo de Ereth',           type: 'temple',       desc: 'Templo dedicado à deusa da vida e renovação. Curandeiros e padres atendem aqui.',                            pos_x: 220, pos_y: 250, actions: ['pray','heal','donate','confess','marry'] },
    { name: 'Porto Sul',                 type: 'port',         desc: 'Docas movimentadas onde barcos chegam e partem. Peixe, mercadorias e estranhos.',                            pos_x: 200, pos_y: 310, actions: ['travel','trade','fish','hire_boat'] },
    { name: 'Prefeitura de Vael',        type: 'government',   desc: 'Sede da administração da cidade. Leis, impostos e disputas são resolvidos aqui.',                           pos_x: 210, pos_y: 230, actions: ['report_crime','pay_tax','register','seek_justice'] },
    { name: 'Casa de Câmbio Morvek',     type: 'bank',         desc: 'Os Morvek cobram bem, mas são confiáveis. Guardam ouro e financiam expedições.',                            pos_x: 195, pos_y: 245, actions: ['deposit','withdraw','exchange','borrow'] },
    { name: 'Bairro dos Tecelões',       type: 'residential',  desc: 'Ruas estreitas onde artesãos e famílias de classe média vivem. Muito barulho, muitas vidas.',               pos_x: 155, pos_y: 260, actions: ['explore','talk','buy_crafts'] },
    { name: 'Armazéns do Cais',          type: 'warehouse',    desc: 'Galpões onde mercadorias são estocadas. Cheiro de sal e madeira molhada.',                                   pos_x: 165, pos_y: 305, actions: ['investigate','steal','search','hide'] },
    { name: 'Praça das Festas',          type: 'plaza',        desc: 'Centro social da cidade. Mercados, shows e execuções acontecem aqui.',                                      pos_x: 200, pos_y: 215, actions: ['explore','talk','gamble','watch'] },
  ],

  // Bosque Brumoso
  2: [
    { name: 'Aldeia dos Caçadores',      type: 'village',      desc: 'Pequena aldeia onde famílias de caçadores vivem há gerações. Muito isolados e desconfiados.',              pos_x: 60,  pos_y: 180, actions: ['rest','trade','hire','gather_info'] },
    { name: 'Clareira da Pedra Cantante', type: 'clearing',    desc: 'Uma pedra no centro que vibra com magia antiga. Ninguém sabe por quê.',                                     pos_x: 90,  pos_y: 140, actions: ['investigate','pray','rest','sense_magic'] },
    { name: 'Posto de Observação',       type: 'outpost',      desc: 'Uma torre de madeira usada para vigiar os arredores da floresta.',                                          pos_x: 110, pos_y: 230, actions: ['observe','signal','rest','investigate'] },
  ],

  // Planícies de Aure
  3: [
    { name: 'Fazenda Dunmore',           type: 'farm',         desc: 'A maior fazenda da ilha. Os Dunmore são ricos e influentes, mas guardam segredos.',                         pos_x: 310, pos_y: 220, actions: ['work','trade','rest','talk'] },
    { name: 'Aldeia de Aure',            type: 'village',      desc: 'Uma aldeia agrícola pacífica. Festivais sazonais, muita cerveja de grãos.',                                 pos_x: 350, pos_y: 260, actions: ['eat','drink','rest','trade','talk','pray'] },
    { name: 'Moinho de Vento dos Irmãos Korel', type: 'mill', desc: 'Dois irmãos gerenciam o único moinho da planície. Sempre ocupados, sempre brigando entre si.',              pos_x: 290, pos_y: 290, actions: ['trade','grind_grain','talk'] },
  ],

  // Aldeia Costeira de Marev
  4: [
    { name: 'Aldeias das Redes',         type: 'village',      desc: 'Onde os pescadores vivem. Cheira a peixe o tempo todo, mas o pôr do sol é incrível.',                     pos_x: 330, pos_y: 80,  actions: ['rest','trade','fish','talk','buy_boat'] },
    { name: 'Praia das Cavernas',        type: 'beach',        desc: 'Cavernas marinhas escondidas na praia. Contrabandistas usam isso, dizem os locais.',                       pos_x: 380, pos_y: 50,  actions: ['investigate','hide','search','fish'] },
    { name: 'Farol de Marev',            type: 'lighthouse',   desc: 'O único farol da ilha. O faroleiro viu coisas no mar que não falam.',                                      pos_x: 395, pos_y: 70,  actions: ['observe','talk','rest','signal'] },
  ],

  // Vila dos Montes de Drak
  5: [
    { name: 'Vila de Drak',              type: 'village',      desc: 'Mineiros, ferreiros e suas famílias. Vida dura, homens duros. Muita bebida à noite.',                      pos_x: 175, pos_y: 60,  actions: ['rest','trade','eat','drink','hire','talk'] },
    { name: 'Boca da Mina Principal',    type: 'dungeon_entry', desc: 'A maior mina da ilha. Vai fundo, dicem que conecta com uma rede de cavernas antigas.',                    pos_x: 155, pos_y: 35,  actions: ['enter','investigate','mine','recruit'] },
    { name: 'Posto Avançado dos Mineradores', type: 'outpost', desc: 'Um acampamento improvisado mais próximo da mina. Trabalhadores passam a semana aqui.',                     pos_x: 200, pos_y: 20,  actions: ['rest','trade','hire','talk'] },
  ],

  // Ruínas de Keth
  6: [
    { name: 'Portal Quebrado',           type: 'ruins',        desc: 'Uma estrutura de pedra de arquitetura desconhecida. Às vezes pulsa com energia.',                          pos_x: 190, pos_y: 360, actions: ['investigate','sense_magic','enter','study'] },
    { name: 'Acampamento dos Buscadores', type: 'camp',        desc: 'Um grupo de acadêmicos e aventureiros mapeando as ruínas. Parecem nervosos.',                              pos_x: 210, pos_y: 345, actions: ['rest','talk','trade','hire','join'] },
    { name: 'Templo Subterrâneo',        type: 'dungeon',      desc: 'Descoberto recentemente. Nenhum dos que entraram saiu ainda para contar.',                                  pos_x: 175, pos_y: 380, actions: ['enter','investigate','sense_magic'] },
  ],
};

/* ── Script principal ────────────────────────────────────────────────────────── */

async function main() {
  console.log('🗺️  AIRPG Map Seeder — Iniciando...\n');

  const conn = await mysql.createConnection(DB_CONFIG);

  try {
    // Desativar FK checks
    await conn.execute('SET foreign_key_checks = 0');

    // Limpar dados existentes (ordem reversa de FK)
    console.log('🧹 Limpando dados de mapa anteriores...');
    await conn.execute('DELETE FROM region_connections WHERE from_region_id IN (SELECT id FROM regions WHERE world_id = ?)', [WORLD_ID]);
    await conn.execute('DELETE FROM locations WHERE region_id IN (SELECT id FROM regions WHERE world_id = ?)', [WORLD_ID]);
    await conn.execute('DELETE FROM regions WHERE world_id = ?', [WORLD_ID]);

    // Inserir regiões
    console.log('📍 Inserindo regiões...');
    for (const r of REGIONS) {
      await conn.execute(
        `INSERT INTO regions (id, world_id, name, type, description, min_x, max_x, min_y, max_y, danger_level, resources, encounters)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [r.id, WORLD_ID, r.name, r.type, r.description, r.min_x, r.max_x, r.min_y, r.max_y, r.danger_level, r.resources, r.encounters]
      );
      console.log(`   ✓ ${r.name}`);
    }

    // Inserir conexões
    console.log('\n🔗 Inserindo conexões de regiões...');
    for (const c of CONNECTIONS) {
      await conn.execute(
        `INSERT INTO region_connections (from_region_id, to_region_id, travel_hours, danger, bidirectional)
         VALUES (?, ?, ?, ?, 1)`,
        [c.from, c.to, c.hours, c.danger]
      );
    }
    console.log(`   ✓ ${CONNECTIONS.length} conexões criadas`);

    // Inserir locais
    console.log('\n🏠 Inserindo locais...');
    let totalLocations = 0;
    for (const [regionId, locs] of Object.entries(LOCATIONS_BY_REGION)) {
      for (const loc of locs) {
        await conn.execute(
          `INSERT INTO locations (region_id, name, type, description, pos_x, pos_y, available_actions)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [Number(regionId), loc.name, loc.type, loc.desc, loc.pos_x, loc.pos_y, JSON.stringify(loc.actions)]
        );
        totalLocations++;
      }
      const region = REGIONS.find(r => r.id === Number(regionId));
      console.log(`   ✓ ${locs.length} locais em ${region?.name}`);
    }

    // Inserir mercados para locais de tipo market/blacksmith nas regiões semeadas
    console.log('\n🏪 Inserindo mercados...');
    const [marketLocations] = await conn.execute(
      `SELECT l.id, l.name, l.type, l.region_id
       FROM locations l
       JOIN regions r ON l.region_id = r.id
       WHERE r.world_id = ? AND l.type IN ('market','blacksmith','general_store')`,
      [WORLD_ID]
    );

    for (const loc of marketLocations) {
      const marketType = loc.type === 'blacksmith' ? 'blacksmith' : 'general';
      const goldReserve = marketType === 'general' ? 3000 : 1500;
      await conn.execute(
        `INSERT IGNORE INTO markets (location_id, world_id, name, type, gold_reserve)
         VALUES (?, ?, ?, ?, ?)`,
        [loc.id, WORLD_ID, loc.name, marketType, goldReserve]
      );
    }
    console.log(`   ✓ ${marketLocations.length} mercados criados`);

    await conn.execute('SET foreign_key_checks = 1');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Mapa gerado com sucesso!');
    console.log(`   Regiões:   ${REGIONS.length}`);
    console.log(`   Conexões:  ${CONNECTIONS.length}`);
    console.log(`   Locais:    ${totalLocations}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error('\n❌ Erro no seeder de mapa:', err.message);
  process.exit(1);
});
