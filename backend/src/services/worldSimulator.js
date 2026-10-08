'use strict';

/**
 * AIRPG — Motor de Simulação do Mundo
 *
 * Roda ticks de tempo que fazem o mundo viver:
 *   - NPCs produzem recursos conforme sua profissão e região
 *   - Fome e sede decaem a cada tick — NPCs compram comida/água quando precisam
 *   - NPCs com HP zerado morrem de inanição ou desidratação
 *   - Trocas econômicas: comida ↔ ouro, recursos ↔ ouro
 *   - Relações de afinidade se propagam pelo grafo social
 *   - Objetivos avançam, falham ou desbloqueiam novos
 *   - Traços adquiridos expiram; traços sombrios emergem de traumas não resolvidos
 *   - Eventos registrados em npc_events com cadeia causal
 *
 * Uso:
 *   node src/services/worldSimulator.js              # loop contínuo (Ctrl+C para parar)
 *   node src/services/worldSimulator.js --ticks=720  # roda N ticks e para
 *   node src/services/worldSimulator.js --headless   # sem log no console (só arquivo)
 *
 * 1 tick = 1 hora do mundo   |   24 ticks = 1 dia   |   720 ticks = 30 dias
 */

require('dotenv').config({ path: `${__dirname}/../../.env` });

const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

/* ══════════════════════════════════════════════════════════════════════════════
   CONFIGURAÇÃO
══════════════════════════════════════════════════════════════════════════════ */

const DB_CONFIG = {
  host:     process.env.DB_HOST     || 'localhost',
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || 'alfaiate10',
  database: process.env.DB_NAME     || 'airpg',
};

const MUNDO_ID       = 1;
const TICK_INTERVALO = 5000;   // 5 segundos por tick (ajuste conforme precisar)
const HORAS_POR_TICK = 1;      // 1 hora do mundo por tick real

// Flags de linha de comando
const args        = process.argv.slice(2);
const MAX_TICKS   = (() => { const f = args.find(a => a.startsWith('--ticks=')); return f ? parseInt(f.split('=')[1]) : Infinity; })();
const HEADLESS    = args.includes('--headless');
const ARQUIVO_LOG = path.join(__dirname, '../../../logs/simulacao.jsonl');

/* ══════════════════════════════════════════════════════════════════════════════
   SISTEMA DE PRODUÇÃO DE RECURSOS
   Define o que cada profissão produz, a cada quantos ticks, e em que quantidade.
══════════════════════════════════════════════════════════════════════════════ */

const PRODUCAO = {
  // ── Comida ────────────────────────────────────────────────────────────────
  cacador:          { recurso: 'carne_caca',      ticks: 2,  min: 1, max: 4,  vende_por: 4  },
  armadilheiro:     { recurso: 'carne_caca',      ticks: 3,  min: 1, max: 3,  vende_por: 4  },
  pescador:         { recurso: 'peixe_fresco',    ticks: 2,  min: 2, max: 6,  vende_por: 3  },
  lavrador:         { recurso: 'cereal',          ticks: 10, min: 5, max: 15, vende_por: 2  },
  pastor:           { recurso: 'carne_ovelha',    ticks: 8,  min: 1, max: 3,  vende_por: 6  },
  moleiro:          { recurso: 'farinha',         ticks: 6,  min: 3, max: 8,  vende_por: 3  },
  herborista:       { recurso: 'erva_medicinal',  ticks: 4,  min: 2, max: 5,  vende_por: 5  },
  // ── Materiais ─────────────────────────────────────────────────────────────
  minerador:        { recurso: 'minerio_ferro',   ticks: 3,  min: 2, max: 5,  vende_por: 8  },
  lenhador:         { recurso: 'madeira',         ticks: 3,  min: 3, max: 7,  vende_por: 3  },
  ferreiro:         { recurso: 'ferro_trabalhado',ticks: 4,  min: 1, max: 3,  vende_por: 20 },
  fabricante_redes: { recurso: 'rede_pesca',      ticks: 8,  min: 1, max: 2,  vende_por: 15 },
};

// Itens que contam como COMIDA (saciam fome)
const ITENS_COMIDA = new Set([
  'carne_caca','peixe_fresco','cereal','carne_ovelha','farinha',
  'pao','sopa','refeicao_taverna',
]);

// Itens que contam como ÁGUA
const ITENS_AGUA = new Set([
  'agua_fresca','odre_agua','suco_fruto',
]);

// Quanto de fome/sede cada item restaura
const VALOR_NUTRICIONAL = {
  carne_caca:       { fome: 35, sede: 0 },
  peixe_fresco:     { fome: 28, sede: 5 },
  cereal:           { fome: 20, sede: 0 },
  carne_ovelha:     { fome: 40, sede: 0 },
  farinha:          { fome: 15, sede: 0 },
  pao:              { fome: 25, sede: 0 },
  sopa:             { fome: 30, sede: 15 },
  refeicao_taverna: { fome: 50, sede: 20 },
  agua_fresca:      { fome: 0,  sede: 45 },
  odre_agua:        { fome: 0,  sede: 40 },
  suco_fruto:       { fome: 5,  sede: 30 },
};

/* ══════════════════════════════════════════════════════════════════════════════
   PROBABILIDADES DE EVENTOS SOCIAIS
   (por tick, por NPC elegível)
══════════════════════════════════════════════════════════════════════════════ */

const PROB = {
  comercio:     0.04,   // NPC comercializa com vizinho
  discussao:    0.02,
  amizade:      0.01,
  romance:      0.005,
  casamento:    0.003,
  morte_velhice:0.001,  // só NPCs > 70 anos
  roubo:        0.005,  // só ladrao/fora_da_lei
  presente:     0.015,
  fofoca:       0.03,
};

/* ══════════════════════════════════════════════════════════════════════════════
   LOGGER
══════════════════════════════════════════════════════════════════════════════ */

let fluxoLog = null;

function iniciarLogger() {
  const dir = path.dirname(ARQUIVO_LOG);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fluxoLog = fs.createWriteStream(ARQUIVO_LOG, { flags: 'a' });
}

function log(obj) {
  if (!HEADLESS) console.log(JSON.stringify(obj));
  if (fluxoLog) fluxoLog.write(JSON.stringify(obj) + '\n');
}

/* ══════════════════════════════════════════════════════════════════════════════
   UTILITÁRIOS
══════════════════════════════════════════════════════════════════════════════ */

function rolar(prob)          { return Math.random() < prob; }
function escolher(arr)        { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min, max)       { return Math.floor(Math.random() * (max - min + 1)) + min; }
function limitar(v, min, max) { return Math.max(min, Math.min(max, v)); }

/** Retorna NPCs vivos de uma região */
async function carregarNPCsRegiao(db, regiaoId) {
  const [rows] = await db.execute(
    `SELECT n.id, n.name, n.gender, n.age, n.role, n.gold,
            n.personality, n.skills, n.objectives, n.reputation,
            n.hp, n.max_hp, n.hunger, n.thirst,
            n.inventory, n.region_id, n.location_id
       FROM npcs n
      WHERE n.world_id = ? AND n.region_id = ? AND n.is_alive = 1`,
    [MUNDO_ID, regiaoId]
  );
  return rows;
}

/** Registra evento no banco e retorna o id inserido */
async function registrarEvento(db, diaAtual, anoAtual, evento) {
  const [res] = await db.execute(
    `INSERT INTO npc_events
       (world_id, region_id, actor_npc_id, target_npc_id,
        event_type, payload, affinity_delta, world_year, world_day,
        propagated_from_event_id)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      MUNDO_ID,
      evento.regiao_id,
      evento.ator_id,
      evento.alvo_id    ?? null,
      evento.tipo,
      JSON.stringify(evento.dados ?? {}),
      evento.delta_afinidade ?? 0,
      anoAtual,
      diaAtual,
      evento.evento_pai_id ?? null,
    ]
  );
  return res.insertId;
}

/** Aplica delta de afinidade entre dois NPCs */
async function aplicarAfinidade(db, npcId, alvoId, delta, tipoRelacao = 'conhecido') {
  if (!npcId || !alvoId || npcId === alvoId) return;
  delta = Math.round(delta);
  if (delta === 0) return;

  const [[existente]] = await db.execute(
    `SELECT id, affinity FROM npc_relations
      WHERE npc_id = ? AND target_npc_id = ? LIMIT 1`,
    [npcId, alvoId]
  );

  if (existente) {
    const novaAfinidade = limitar(existente.affinity + delta, -100, 100);
    await db.execute(
      'UPDATE npc_relations SET affinity = ?, last_interaction_at = NOW() WHERE id = ?',
      [novaAfinidade, existente.id]
    );
  } else {
    const afinidadeInicial = limitar(delta, -100, 100);
    await db.execute(
      `INSERT INTO npc_relations
         (npc_id, target_npc_id, relation_type, affinity, tags, last_interaction_at)
       VALUES (?,?,?,?,?,NOW())
       ON DUPLICATE KEY UPDATE affinity = affinity + VALUES(affinity),
                               last_interaction_at = NOW()`,
      [npcId, alvoId, tipoRelacao, afinidadeInicial, JSON.stringify([])]
    );
  }
}

/**
 * Propaga afinidade pelo grafo social
 *   grau 1 (relação direta): peso 1.0  ← já aplicado em aplicarAfinidade
 *   grau 2 (amigo de amigo): peso 0.3
 */
async function propagarAfinidade(db, atorId, alvoId, delta) {
  if (Math.abs(delta) < 3) return;

  const [vizinhos] = await db.execute(
    `SELECT DISTINCT r1.target_npc_id AS vizinho_id
       FROM npc_relations r1
       JOIN npc_relations r2 ON r2.npc_id = r1.target_npc_id
                             AND r2.target_npc_id = ?
      WHERE r1.npc_id = ?
        AND r1.target_npc_id != ?
        AND r1.target_npc_id != ?
      LIMIT 20`,
    [alvoId, atorId, atorId, alvoId]
  );

  for (const { vizinho_id } of vizinhos) {
    const deltaPropagado = Math.round(delta * 0.3);
    if (deltaPropagado === 0) continue;
    await aplicarAfinidade(db, vizinho_id, alvoId, deltaPropagado);
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   SISTEMA DE NECESSIDADES VITAIS
══════════════════════════════════════════════════════════════════════════════ */

/**
 * A cada tick:
 *   - fome  -= 1  (fica com fome mais devagar)
 *   - sede  -= 2  (sede aumenta mais rápido — é o Nordeste aqui)
 *   - Se fome <= 0 ou sede <= 0: NPC perde HP
 *   - Se HP <= 0: morre
 */
async function processarNecessidades(db, estado) {
  const { diaAtual, anoAtual } = estado;

  // Processa em lote para evitar N queries no loop
  await db.execute(
    `UPDATE npcs
        SET hunger = GREATEST(0, hunger - 1),
            thirst = GREATEST(0, thirst - 2)
      WHERE world_id = ? AND is_alive = 1`,
    [MUNDO_ID]
  );

  // NPCs com fome ou sede zerada perdem HP
  await db.execute(
    `UPDATE npcs
        SET hp = GREATEST(0,
              hp
              - IF(hunger = 0, 3, 0)   -- perde 3 HP por tick sem comida
              - IF(thirst = 0, 5, 0)   -- perde 5 HP por tick sem água (mais urgente)
            )
      WHERE world_id = ? AND is_alive = 1 AND (hunger = 0 OR thirst = 0)`,
    [MUNDO_ID]
  );

  // Mata NPCs com HP zerado
  const [moribundos] = await db.execute(
    `SELECT id, name, region_id, hunger, thirst FROM npcs
      WHERE world_id = ? AND is_alive = 1 AND hp <= 0`,
    [MUNDO_ID]
  );

  for (const npc of moribundos) {
    await db.execute(
      'UPDATE npcs SET is_alive = 0, died_at_world_day = ? WHERE id = ?',
      [diaAtual, npc.id]
    );

    const causa = npc.thirst === 0 ? 'desidratacao' : 'inanicao';
    log({ tipo: 'morte', diaAtual, anoAtual, npc_id: npc.id, nome: npc.name, causa });
    await registrarEvento(db, diaAtual, anoAtual, {
      tipo: 'morte', regiao_id: npc.region_id,
      ator_id: npc.id, alvo_id: null,
      delta_afinidade: 0,
      dados: { nome: npc.name, causa },
    });

    // Propaga 'luto' para família
    const [familia] = await db.execute(
      `SELECT target_npc_id FROM npc_relations
        WHERE npc_id = ? AND relation_type IN ('conjuge','filho','pai')`,
      [npc.id]
    );
    for (const { target_npc_id } of familia) {
      const [[membro]] = await db.execute(
        'SELECT personality FROM npcs WHERE id = ? AND is_alive = 1', [target_npc_id]
      );
      if (!membro) continue;
      const p = membro.personality ?? { tracos: [], adquiridos: [], sombrios: [] };
      p.adquiridos = p.adquiridos ?? [];
      p.adquiridos.push({ traco: 'luto', adicionado_dia: diaAtual, expira_dia: diaAtual + 60 });
      await db.execute('UPDATE npcs SET personality = ? WHERE id = ?',
        [JSON.stringify(p), target_npc_id]);
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   SISTEMA DE PRODUÇÃO DE RECURSOS
══════════════════════════════════════════════════════════════════════════════ */

/**
 * A cada tick, cada NPC produtor adiciona recursos ao inventário conforme
 * o intervalo de ticks da sua profissão.
 * Também consome os recursos produzidos para saciar as próprias necessidades.
 */
async function processarProducao(db, estado) {
  const { tickAtual, diaAtual } = estado;

  for (const [profissao, config] of Object.entries(PRODUCAO)) {
    // Só produz nos ticks múltiplos do intervalo
    if (tickAtual % config.ticks !== 0) continue;

    const [npcs] = await db.execute(
      `SELECT id, name, region_id, inventory, hunger, thirst, gold FROM npcs
        WHERE world_id = ? AND is_alive = 1 AND role = ?`,
      [MUNDO_ID, profissao]
    );

    for (const npc of npcs) {
      const qtd = rand(config.min, config.max);
      const inventario = npc.inventory ?? [];

      // Adiciona ao inventário
      const idx = inventario.findIndex(i => i.item_key === config.recurso);
      if (idx >= 0) {
        inventario[idx].quantidade = (inventario[idx].quantidade || inventario[idx].quantity || 0) + qtd;
      } else {
        inventario.push({ item_key: config.recurso, quantidade: qtd });
      }

      await db.execute('UPDATE npcs SET inventory = ? WHERE id = ?',
        [JSON.stringify(inventario), npc.id]);

      log({ tipo: 'producao', npc_id: npc.id, profissao, recurso: config.recurso, qtd });
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   SISTEMA DE CONSUMO: COMER E BEBER
   NPCs com fome/sede baixa procuram comida/água no inventário ou compram
══════════════════════════════════════════════════════════════════════════════ */

async function processarConsumo(db, estado) {
  const { diaAtual, anoAtual } = estado;

  // Busca NPCs com necessidades baixas
  const [famintos] = await db.execute(
    `SELECT id, name, region_id, inventory, hunger, thirst, gold FROM npcs
      WHERE world_id = ? AND is_alive = 1 AND (hunger < 40 OR thirst < 30)
      LIMIT 200`,
    [MUNDO_ID]
  );

  for (const npc of famintos) {
    const inventario = npc.inventory ?? [];
    let comeuOuBebeu = false;

    // Tenta consumir do próprio inventário
    for (const item of inventario) {
      const chave = item.item_key;
      const qtdDisp = item.quantidade ?? item.quantity ?? 0;
      if (qtdDisp <= 0) continue;

      const nutri = VALOR_NUTRICIONAL[chave];
      if (!nutri) continue;

      const precisaComida = npc.hunger < 40 && nutri.fome > 0;
      const precisaAgua   = npc.thirst < 30 && nutri.sede > 0;

      if (precisaComida || precisaAgua) {
        // Consome 1 unidade
        item.quantidade = qtdDisp - 1;
        const novaFome  = limitar((npc.hunger || 0) + nutri.fome, 0, 100);
        const novaSede  = limitar((npc.thirst || 0) + nutri.sede, 0, 100);

        await db.execute(
          'UPDATE npcs SET inventory = ?, hunger = ?, thirst = ? WHERE id = ?',
          [JSON.stringify(inventario), novaFome, novaSede, npc.id]
        );

        // Atualiza valores locais para a próxima iteração
        npc.hunger = novaFome;
        npc.thirst = novaSede;
        comeuOuBebeu = true;
      }
    }

    // Se ainda está com fome/sede, tenta COMPRAR de um NPC produtor próximo
    if (!comeuOuBebeu && npc.gold >= 3) {
      await tentarComprarComida(db, npc, diaAtual, anoAtual);
    }
  }
}

/** NPC faminto tenta comprar comida de um produtor na mesma região */
async function tentarComprarComida(db, comprador, diaAtual, anoAtual) {
  // Produtores de comida na mesma região com estoque
  const [vendedores] = await db.execute(
    `SELECT id, name, inventory, gold FROM npcs
      WHERE world_id = ? AND is_alive = 1 AND region_id = ?
        AND role IN ('cacador','armadilheiro','pescador','lavrador','pastor','moleiro')
        AND id != ?
      LIMIT 10`,
    [MUNDO_ID, comprador.region_id, comprador.id]
  );

  for (const vendedor of vendedores) {
    const invVendedor = vendedor.inventory ?? [];
    const item = invVendedor.find(i => {
      const chave = i.item_key;
      const qtd   = i.quantidade ?? i.quantity ?? 0;
      return ITENS_COMIDA.has(chave) && qtd > 0;
    });
    if (!item) continue;

    const config = PRODUCAO[vendedor.role] ?? {};
    const preco  = config.vende_por ?? 3;
    if (comprador.gold < preco) continue;

    // Transfere item e ouro
    const qtdItem = item.quantidade ?? item.quantity ?? 0;
    item.quantidade = qtdItem - 1;

    const invComprador = comprador.inventory ?? [];
    const idxC = invComprador.findIndex(i => i.item_key === item.item_key);
    if (idxC >= 0) {
      invComprador[idxC].quantidade = (invComprador[idxC].quantidade ?? invComprador[idxC].quantity ?? 0) + 1;
    } else {
      invComprador.push({ item_key: item.item_key, quantidade: 1 });
    }

    await db.execute(
      `UPDATE npcs SET inventory = ?, gold = gold - ? WHERE id = ?`,
      [JSON.stringify(invComprador), preco, comprador.id]
    );
    await db.execute(
      `UPDATE npcs SET inventory = ?, gold = gold + ? WHERE id = ?`,
      [JSON.stringify(invVendedor), preco, vendedor.id]
    );
    await aplicarAfinidade(db, comprador.id, vendedor.id, +3, 'parceiro_comercial');
    await aplicarAfinidade(db, vendedor.id, comprador.id, +3, 'parceiro_comercial');

    await registrarEvento(db, diaAtual, anoAtual, {
      tipo: 'compra_comida', regiao_id: comprador.region_id,
      ator_id: comprador.id, alvo_id: vendedor.id,
      delta_afinidade: +3,
      dados: { item: item.item_key, preco, comprador: comprador.name, vendedor: vendedor.name },
    });

    break; // Comprou de um vendedor, chega
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   EVENTOS ECONÔMICOS E SOCIAIS
══════════════════════════════════════════════════════════════════════════════ */

/** Troca comercial geral (ouro ↔ ouro, NPC ganha/perde) */
async function eventoComercio(db, ator, alvo) {
  if (ator.gold < 5 && alvo.gold < 5) return null;
  const valor = Math.floor(Math.random() * Math.min(ator.gold, 30)) + 1;

  await db.execute('UPDATE npcs SET gold = gold - ? WHERE id = ?', [valor, ator.id]);
  await db.execute('UPDATE npcs SET gold = gold + ? WHERE id = ?', [valor, alvo.id]);
  await aplicarAfinidade(db, ator.id, alvo.id, +5, 'parceiro_comercial');
  await aplicarAfinidade(db, alvo.id, ator.id, +5, 'parceiro_comercial');

  return {
    tipo: 'comercio', regiao_id: ator.region_id,
    ator_id: ator.id, alvo_id: alvo.id, delta_afinidade: +5,
    dados: { valor, ator: ator.name, alvo: alvo.name },
  };
}

/** Discussão: afinidade cai, pode gerar traço 'ressentido' */
async function eventoDiscussao(db, ator, alvo, estado) {
  await aplicarAfinidade(db, ator.id, alvo.id, -10, 'rival');
  await aplicarAfinidade(db, alvo.id, ator.id, -10, 'rival');

  if (rolar(0.3)) {
    const p = alvo.personality ?? { tracos: [], adquiridos: [], sombrios: [] };
    p.adquiridos = p.adquiridos ?? [];
    p.adquiridos.push({ traco: 'ressentido', adicionado_dia: estado.diaAtual, expira_dia: estado.diaAtual + 30 });
    await db.execute('UPDATE npcs SET personality = ? WHERE id = ?',
      [JSON.stringify(p), alvo.id]);
  }

  return {
    tipo: 'discussao', regiao_id: ator.region_id,
    ator_id: ator.id, alvo_id: alvo.id, delta_afinidade: -10,
    dados: { ator: ator.name, alvo: alvo.name },
  };
}

/** Presente: afinidade sobe bastante, transfere ouro */
async function eventoPresente(db, ator, alvo) {
  if (ator.gold < 10) return null;
  const valor = Math.floor(Math.random() * 15) + 5;

  await db.execute('UPDATE npcs SET gold = gold - ? WHERE id = ?', [valor, ator.id]);
  await db.execute('UPDATE npcs SET gold = gold + ? WHERE id = ?', [valor, alvo.id]);
  await aplicarAfinidade(db, ator.id, alvo.id, +12, 'amigo');
  await aplicarAfinidade(db, alvo.id, ator.id, +15, 'amigo');

  return {
    tipo: 'presente', regiao_id: ator.region_id,
    ator_id: ator.id, alvo_id: alvo.id, delta_afinidade: +12,
    dados: { valor, ator: ator.name, alvo: alvo.name },
  };
}

/** Amizade: formaliza relação se afinidade já for alta */
async function eventoAmizade(db, ator, alvo) {
  const [[rel]] = await db.execute(
    `SELECT affinity FROM npc_relations
      WHERE npc_id = ? AND target_npc_id = ? LIMIT 1`,
    [ator.id, alvo.id]
  );
  if (!rel || rel.affinity < 20) return null;

  await aplicarAfinidade(db, ator.id, alvo.id, +8, 'amigo');
  await aplicarAfinidade(db, alvo.id, ator.id, +8, 'amigo');
  await db.execute(
    `UPDATE npc_relations SET relation_type = 'amigo'
      WHERE npc_id = ? AND target_npc_id = ? AND relation_type = 'conhecido'`,
    [ator.id, alvo.id]
  );
  await db.execute(
    `UPDATE npc_relations SET relation_type = 'amigo'
      WHERE npc_id = ? AND target_npc_id = ? AND relation_type = 'conhecido'`,
    [alvo.id, ator.id]
  );

  return {
    tipo: 'amizade', regiao_id: ator.region_id,
    ator_id: ator.id, alvo_id: alvo.id, delta_afinidade: +8,
    dados: { ator: ator.name, alvo: alvo.name },
  };
}

/** Romance entre adultos solteiros */
async function eventoRomance(db, ator, alvo) {
  if (ator.age < 18 || alvo.age < 18) return null;

  const [[casamento]] = await db.execute(
    `SELECT id FROM npc_relations
      WHERE (npc_id = ? OR npc_id = ?) AND relation_type = 'conjuge' LIMIT 1`,
    [ator.id, alvo.id]
  );
  if (casamento) return null;

  await aplicarAfinidade(db, ator.id, alvo.id, +20, 'par_romantico');
  await aplicarAfinidade(db, alvo.id, ator.id, +20, 'par_romantico');

  return {
    tipo: 'romance', regiao_id: ator.region_id,
    ator_id: ator.id, alvo_id: alvo.id, delta_afinidade: +20,
    dados: { ator: ator.name, alvo: alvo.name },
  };
}

/** Casamento: precisa de afinidade >= 60 e tipo 'par_romantico' */
async function eventoCasamento(db, ator, alvo, estado) {
  if (ator.age < 18 || alvo.age < 18) return null;

  const [[rel]] = await db.execute(
    `SELECT affinity, relation_type FROM npc_relations
      WHERE npc_id = ? AND target_npc_id = ? LIMIT 1`,
    [ator.id, alvo.id]
  );
  if (!rel || rel.affinity < 60 || rel.relation_type !== 'par_romantico') return null;

  for (const [a, b] of [[ator.id, alvo.id], [alvo.id, ator.id]]) {
    await db.execute(
      `UPDATE npc_relations SET relation_type = 'conjuge'
        WHERE npc_id = ? AND target_npc_id = ?`,
      [a, b]
    );
  }

  await db.execute(
    `UPDATE npc_objectives SET status = 'concluido', completed_at_world_day = ?
      WHERE npc_id IN (?,?) AND type = 'encontrar_conjuge' AND status = 'ativo'`,
    [estado.diaAtual, ator.id, alvo.id]
  );

  return {
    tipo: 'casamento', regiao_id: ator.region_id,
    ator_id: ator.id, alvo_id: alvo.id, delta_afinidade: +30,
    dados: { ator: ator.name, alvo: alvo.name },
  };
}

/** Morte por velhice (progressiva após 70 anos) */
async function eventoMorteVelhice(db, npc, estado) {
  if (npc.age < 70) return null;
  const chance = PROB.morte_velhice + (npc.age - 70) * 0.002;
  if (!rolar(chance)) return null;

  await db.execute(
    'UPDATE npcs SET is_alive = 0, died_at_world_day = ? WHERE id = ?',
    [estado.diaAtual, npc.id]
  );

  const [familia] = await db.execute(
    `SELECT target_npc_id FROM npc_relations
      WHERE npc_id = ? AND relation_type IN ('conjuge','filho')`,
    [npc.id]
  );
  for (const { target_npc_id } of familia) {
    const [[membro]] = await db.execute(
      'SELECT personality FROM npcs WHERE id = ? AND is_alive = 1', [target_npc_id]
    );
    if (!membro) continue;
    const p = membro.personality ?? { tracos: [], adquiridos: [], sombrios: [] };
    p.adquiridos = p.adquiridos ?? [];
    p.adquiridos.push({ traco: 'luto', adicionado_dia: estado.diaAtual, expira_dia: estado.diaAtual + 60 });
    await db.execute('UPDATE npcs SET personality = ? WHERE id = ?',
      [JSON.stringify(p), target_npc_id]);
    await aplicarAfinidade(db, target_npc_id, npc.id, -20);
  }

  return {
    tipo: 'morte', regiao_id: npc.region_id,
    ator_id: npc.id, alvo_id: null, delta_afinidade: 0,
    dados: { nome: npc.name, causa: 'velhice', idade: npc.age },
  };
}

/** Roubo: ladrao/fora_da_lei rouba ouro de NPC próximo */
async function eventoRoubo(db, ator, alvo) {
  if (!['ladrao','fora_da_lei'].includes(ator.role)) return null;
  if (alvo.gold < 10) return null;

  const roubado = Math.floor(alvo.gold * 0.1) + Math.floor(Math.random() * 20);
  await db.execute('UPDATE npcs SET gold = gold - ? WHERE id = ?', [roubado, alvo.id]);
  await db.execute('UPDATE npcs SET gold = gold + ? WHERE id = ?', [roubado, ator.id]);
  await aplicarAfinidade(db, alvo.id, ator.id, -30, 'inimigo');

  await db.execute(
    `UPDATE npc_relations
        SET tags = JSON_ARRAY_APPEND(COALESCE(tags, JSON_ARRAY()), '$', 'roubou_de_mim')
      WHERE npc_id = ? AND target_npc_id = ?`,
    [alvo.id, ator.id]
  );

  return {
    tipo: 'roubo', regiao_id: ator.region_id,
    ator_id: ator.id, alvo_id: alvo.id, delta_afinidade: -30,
    dados: { ator: ator.name, alvo: alvo.name, valor: roubado },
  };
}

/** Fofoca: NPC passa conhecimento para vizinho, afinidade sobe um pouco */
async function eventoFofoca(db, ator, alvo) {
  const [[atorFull]] = await db.execute(
    'SELECT knowledge FROM npcs WHERE id = ?', [ator.id]
  );
  const conhecimento = atorFull?.knowledge ?? [];
  if (!conhecimento.length) return null;

  const fato = escolher(conhecimento);
  const [[alvoFull]] = await db.execute(
    'SELECT knowledge FROM npcs WHERE id = ?', [alvo.id]
  );
  const conhecAlvo = alvoFull?.knowledge ?? [];
  if (conhecAlvo.includes(fato)) return null;

  conhecAlvo.push(fato);
  await db.execute('UPDATE npcs SET knowledge = ? WHERE id = ?',
    [JSON.stringify(conhecAlvo), alvo.id]);
  await aplicarAfinidade(db, ator.id, alvo.id, +2, 'conhecido');

  return {
    tipo: 'fofoca', regiao_id: ator.region_id,
    ator_id: ator.id, alvo_id: alvo.id, delta_afinidade: +2,
    dados: { ator: ator.name, alvo: alvo.name, fato },
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
   PROCESSAMENTO DIÁRIO
══════════════════════════════════════════════════════════════════════════════ */

/** Expira traços adquiridos e gera traços sombrios se necessário */
async function processarPersonalidadeDiaria(db, diaAtual) {
  const [npcs] = await db.execute(
    `SELECT id, personality, objectives FROM npcs
      WHERE world_id = ? AND is_alive = 1`, [MUNDO_ID]
  );

  for (const npc of npcs) {
    const p = npc.personality ?? { tracos: [], adquiridos: [], sombrios: [] };
    p.adquiridos = p.adquiridos ?? [];
    p.sombrios   = p.sombrios   ?? [];

    let alterado = false;

    // Expira traços adquiridos vencidos
    const antes = p.adquiridos.length;
    p.adquiridos = p.adquiridos.filter(t => !t.expira_dia || t.expira_dia > diaAtual);
    if (p.adquiridos.length !== antes) alterado = true;

    // Luto não resolvido por 90+ dias vira traço sombrio permanente
    if (!p.sombrios.includes('luto_cronico')) {
      const lutoLongo = p.adquiridos.find(
        t => t.traco === 'luto' && (diaAtual - (t.adicionado_dia ?? 0)) > 90
      );
      if (lutoLongo) {
        p.sombrios.push('luto_cronico');
        p.adquiridos = p.adquiridos.filter(t => t.traco !== 'luto');
        alterado = true;
      }
    }

    // Sem objetivos e sem vínculos sociais → 'sem_proposito'
    if (!p.sombrios.includes('sem_proposito')) {
      const objetivos = npc.objectives ?? [];
      const objAtivos = objetivos.filter(o => o.status === 'ativo');
      const [[contVinculos]] = await db.execute(
        `SELECT COUNT(*) AS cnt FROM npc_relations
          WHERE npc_id = ? AND relation_type IN ('amigo','conjuge') AND affinity > 30`,
        [npc.id]
      );
      if (objAtivos.length === 0 && contVinculos.cnt === 0) {
        p.sombrios.push('sem_proposito');
        alterado = true;
      }
    }

    if (alterado) {
      await db.execute('UPDATE npcs SET personality = ? WHERE id = ?',
        [JSON.stringify(p), npc.id]);
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   TICK PRINCIPAL
══════════════════════════════════════════════════════════════════════════════ */

async function executarTick(db, estado) {
  const { tickAtual, diaAtual, anoAtual } = estado;

  // ── 1. Necessidades vitais (fome, sede, HP) ──────────────────────────────
  await processarNecessidades(db, estado);

  // ── 2. Produção de recursos por profissão ────────────────────────────────
  await processarProducao(db, estado);

  // ── 3. Consumo: NPCs com fome/sede buscam comida no inventário ou compram
  await processarConsumo(db, estado);

  // ── 4. Eventos sociais e econômicos ──────────────────────────────────────
  const [regioes] = await db.execute(
    'SELECT id FROM regions WHERE world_id = ?', [MUNDO_ID]
  );

  let totalEventos = 0;

  for (const { id: regiaoId } of regioes) {
    const npcs = await carregarNPCsRegiao(db, regiaoId);
    if (npcs.length < 2) continue;

    for (const ator of npcs) {
      // Morte por velhice
      if (ator.age >= 70) {
        const ev = await eventoMorteVelhice(db, ator, estado);
        if (ev) {
          const evId = await registrarEvento(db, diaAtual, anoAtual, ev);
          log({ tick: tickAtual, diaAtual, anoAtual, eventoId: evId, ...ev });
          totalEventos++;
          continue;
        }
      }

      // Escolhe alvo aleatório na mesma região
      const outros = npcs.filter(n => n.id !== ator.id);
      if (!outros.length) continue;
      const alvo = escolher(outros);

      // Rolagem de eventos sociais (só o primeiro que cair positivo executa)
      let ev = null;
      if      (rolar(PROB.roubo)     && ['ladrao','fora_da_lei'].includes(ator.role))  ev = await eventoRoubo(db, ator, alvo);
      else if (rolar(PROB.comercio))                                                    ev = await eventoComercio(db, ator, alvo);
      else if (rolar(PROB.presente))                                                    ev = await eventoPresente(db, ator, alvo);
      else if (rolar(PROB.discussao))                                                   ev = await eventoDiscussao(db, ator, alvo, estado);
      else if (rolar(PROB.romance))                                                     ev = await eventoRomance(db, ator, alvo);
      else if (rolar(PROB.casamento))                                                   ev = await eventoCasamento(db, ator, alvo, estado);
      else if (rolar(PROB.amizade))                                                     ev = await eventoAmizade(db, ator, alvo);
      else if (rolar(PROB.fofoca))                                                      ev = await eventoFofoca(db, ator, alvo);

      if (ev) {
        const evId = await registrarEvento(db, diaAtual, anoAtual, ev);
        if (ev.delta_afinidade && ev.alvo_id) {
          await propagarAfinidade(db, ev.ator_id, ev.alvo_id, ev.delta_afinidade);
        }
        log({ tick: tickAtual, diaAtual, anoAtual, eventoId: evId, ...ev });
        totalEventos++;
      }
    }
  }

  // ── 5. Processamento diário (1 vez por dia) ───────────────────────────────
  if (tickAtual % 24 === 0) {
    await processarPersonalidadeDiaria(db, diaAtual);
    log({ tick: tickAtual, diaAtual, anoAtual, tipo: 'rollup_diario', totalEventos });
  }

  return totalEventos;
}

/* ══════════════════════════════════════════════════════════════════════════════
   LOOP PRINCIPAL
══════════════════════════════════════════════════════════════════════════════ */

async function main() {
  iniciarLogger();

  const db = await mysql.createConnection(DB_CONFIG);
  console.log('[mundoSimulador] Conectado ao banco ✓');

  const [[mundo]] = await db.execute(
    'SELECT * FROM worlds WHERE id = ?', [MUNDO_ID]
  );
  if (!mundo) {
    console.error('[mundoSimulador] Mundo #1 não encontrado no banco.');
    process.exit(1);
  }

  let tickAtual = 0;
  let diaAtual  = mundo.world_day  ?? 1;
  let anoAtual  = mundo.world_year ?? 1;
  let horaAtual = mundo.world_hour ?? 0;

  console.log(`[mundoSimulador] Iniciando em Ano ${anoAtual}, Dia ${diaAtual}, Hora ${horaAtual}`);
  console.log(`[mundoSimulador] MAX_TICKS=${MAX_TICKS === Infinity ? '∞' : MAX_TICKS}, INTERVALO=${TICK_INTERVALO}ms`);
  console.log('[mundoSimulador] ▶  Simulação rodando...\n');

  const tick = async () => {
    tickAtual++;
    horaAtual = (horaAtual + HORAS_POR_TICK) % 24;
    if (horaAtual === 0) {
      diaAtual++;
      if (diaAtual > 365) { diaAtual = 1; anoAtual++; }
    }

    const estado = { tickAtual, diaAtual, anoAtual, horaAtual };

    try {
      const totalEventos = await executarTick(db, estado);

      await db.execute(
        `UPDATE worlds SET world_day = ?, world_year = ?, world_hour = ?, updated_at = NOW() WHERE id = ?`,
        [diaAtual, anoAtual, horaAtual, MUNDO_ID]
      );

      if (!HEADLESS) {
        process.stdout.write(
          `\r[tick ${String(tickAtual).padStart(4,'0')}] ` +
          `Ano ${anoAtual}  Dia ${String(diaAtual).padStart(3,'0')}  ` +
          `Hora ${String(horaAtual).padStart(2,'0')}  ` +
          `eventos: ${String(totalEventos).padStart(3,' ')}   `
        );
      }
    } catch (err) {
      console.error(`\n[mundoSimulador] ❌ Erro no tick ${tickAtual}:`, err.message);
    }

    if (tickAtual >= MAX_TICKS) {
      console.log(`\n[mundoSimulador] ✅ ${MAX_TICKS} ticks concluídos. Encerrando.`);
      await db.end();
      process.exit(0);
    }
  };

  await tick();
  const intervalo = setInterval(tick, TICK_INTERVALO);

  // Graceful shutdown com Ctrl+C
  process.on('SIGINT', async () => {
    clearInterval(intervalo);
    console.log('\n[mundoSimulador] ⏹  Interrompido. Salvando estado...');
    await db.execute(
      'UPDATE worlds SET world_day = ?, world_year = ?, world_hour = ?, updated_at = NOW() WHERE id = ?',
      [diaAtual, anoAtual, horaAtual, MUNDO_ID]
    );
    await db.end();
    console.log('[mundoSimulador] Estado salvo. Até logo.');
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[mundoSimulador] FATAL:', err);
  process.exit(1);
});
