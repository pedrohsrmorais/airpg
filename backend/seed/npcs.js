'use strict';

/**
 * AIRPG — Gerador de NPCs
 *
 * Gera ~570 NPCs distribuídos pela ilha de Eldoria:
 *   Região 1 — Porto de Vael        (~350 NPCs, cidade portuária)
 *   Região 2 — Bosque Brumoso       (~50 NPCs,  caçadores e foragidos)
 *   Região 3 — Planícies de Aure    (~60 NPCs,  agricultores)
 *   Região 4 — Aldeia de Marev      (~55 NPCs,  pescadores costeiros)
 *   Região 5 — Vila de Drak         (~45 NPCs,  mineradores)
 *   Região 6 — Ruínas de Keth       (~10 NPCs,  exploradores/cultistas)
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

const MUNDO_ID = 1;

/* ══════════════════════════════════════════════════════════════════════════════
   TABELAS DE DADOS
══════════════════════════════════════════════════════════════════════════════ */

const NOMES_MASCULINOS = [
  'Aldric','Brennan','Caelan','Doran','Elric','Fendrel','Gareth','Hadwin',
  'Idris','Jareth','Kellen','Loric','Maren','Navan','Orin','Petyr','Quinn',
  'Raelin','Soren','Torin','Ulric','Valen','Wren','Xander','Yoris','Zane',
  'Borin','Caius','Daven','Elan','Faren','Garen','Havin','Ivar','Jorin',
  'Kavar','Lander','Marlo','Norvin','Orlan','Pryor','Ravin','Salin','Tavor',
  'Aldmar','Brenk','Cador','Deth','Erlan','Falco','Gorvan','Helsin',
];

const NOMES_FEMININOS = [
  'Aelith','Bryn','Calla','Daria','Elara','Fiera','Gwen','Hessa','Iona',
  'Jael','Kira','Lyra','Mira','Nara','Orla','Petra','Quelle','Rena',
  'Sable','Tessa','Ursa','Vira','Willa','Xena','Yara','Zora','Annis',
  'Beryl','Cira','Deva','Erin','Falla','Gisel','Hala','Ilara','Janeth',
  'Kalin','Lessa','Morin','Nessa','Opal','Priya','Raina','Selene','Tavia',
  'Aldine','Brenna','Celia','Dalla','Eska','Freya','Gunna','Helka',
];

const SOBRENOMES = [
  'Ashford','Boscopal','Caldeirão','Dunmore','Elderborn','Geada',
  'Morropedr','Harwick','Ferroado','Vineiva','Kellmark','Linborne',
  'Morrow','Nettlewick','Pedreira','Pendwick','Ravemar','Ravenmore',
  'Portão','Cardo','Underholm','Varwick','Poço','Xander',
  'Yarwick','Zorwell','Cinza','Espinho','Crossley','Dawnwood',
  'Everett','Fairbrook','Goldsworth','Northgate','Oakwood','Pinecrest',
  'Salteiro','Fontemar','Morroalto','Pedreiro','Vallbrook','Ironshard',
];

const DIVINDADES = [
  'Ereth',  // deusa da ordem e comércio
  'Tharkon',// deus da guerra e honra
  'Mira',   // deusa da cura e natureza
  'Soleth', // deus do sol e colheita
  'Draevon',// deus do mar e viagens
  'Kezan',  // deus das sombras e segredos
  'Lune',   // deusa da lua e magia
  'Vorath', // deus do fogo e forja
];

const FACÇÕES = [
  'nenhuma',
  'guilda_mercadores',
  'templo_de_ereth',
  'guarda_cidade',
  'uniao_mineiros',
  'guilda_pescadores',
  'mao_sombria',
  'colonos_livres',
];

/* ══════════════════════════════════════════════════════════════════════════════
   PROFISSÕES POR REGIÃO
   Cada profissão tem: role, weight (probabilidade relativa), e o recurso
   que produz no simulador (produz_recurso) com quantidades min/max por ciclo
   e o intervalo de ticks entre produções.
══════════════════════════════════════════════════════════════════════════════ */

const PROFISSOES = {
  1: [ // Porto de Vael — cidade portuária
    { role: 'mercador',        weight: 12 },
    { role: 'guarda',          weight: 10 },
    { role: 'estalajadeiro',   weight: 5  },
    { role: 'ferreiro',        weight: 4  },
    { role: 'marinheiro',      weight: 8  },
    { role: 'pescador',        weight: 7  },
    { role: 'sacerdote',       weight: 4  },
    { role: 'ladrao',          weight: 3  },
    { role: 'nobre',           weight: 3  },
    { role: 'artesao',         weight: 8  },
    { role: 'lavrador',        weight: 4  },
    { role: 'mendigo',         weight: 3  },
    { role: 'bardo',           weight: 3  },
    { role: 'escriba',         weight: 3  },
    { role: 'curandeiro',      weight: 3  },
    { role: 'estivador',       weight: 8  },
    { role: 'servo',           weight: 6  },
    { role: 'crianca',         weight: 8  },
    { role: 'anciao',          weight: 4  },
    { role: 'aventureiro',     weight: 2  },
  ],
  2: [ // Bosque Brumoso — caçadores
    { role: 'cacador',         weight: 30 },
    { role: 'herborista',      weight: 15 },
    { role: 'lenhador',        weight: 20 },
    { role: 'armadilheiro',    weight: 15 },
    { role: 'anciao',          weight: 5  },
    { role: 'crianca',         weight: 10 },
    { role: 'fora_da_lei',     weight: 5  },
  ],
  3: [ // Planícies de Aure — agricultores
    { role: 'lavrador',        weight: 40 },
    { role: 'moleiro',         weight: 10 },
    { role: 'pastor',          weight: 15 },
    { role: 'mercador',        weight: 5  },
    { role: 'sacerdote',       weight: 5  },
    { role: 'crianca',         weight: 15 },
    { role: 'anciao',          weight: 5  },
    { role: 'guarda',          weight: 5  },
  ],
  4: [ // Aldeia Costeira de Marev — pesca
    { role: 'pescador',        weight: 40 },
    { role: 'marinheiro',      weight: 20 },
    { role: 'fabricante_redes',weight: 10 },
    { role: 'estalajadeiro',   weight: 5  },
    { role: 'contrabandista',  weight: 5  },
    { role: 'crianca',         weight: 10 },
    { role: 'anciao',          weight: 5  },
    { role: 'guarda_farol',    weight: 5  },
  ],
  5: [ // Vila dos Montes de Drak — mineradores
    { role: 'minerador',       weight: 40 },
    { role: 'ferreiro',        weight: 15 },
    { role: 'guarda',          weight: 10 },
    { role: 'mercador',        weight: 8  },
    { role: 'estalajadeiro',   weight: 5  },
    { role: 'crianca',         weight: 10 },
    { role: 'anciao',          weight: 5  },
    { role: 'fora_da_lei',     weight: 7  },
  ],
  6: [ // Ruínas de Keth — exploradores
    { role: 'aventureiro',     weight: 30 },
    { role: 'estudioso',       weight: 25 },
    { role: 'cultista',        weight: 25 },
    { role: 'fora_da_lei',     weight: 20 },
  ],
};

/* ══════════════════════════════════════════════════════════════════════════════
   PRODUÇÃO DE RECURSOS POR PROFISSÃO
   ticks_intervalo: a cada quantos ticks o NPC gera o recurso
   qtd_min / qtd_max: quantidade gerada por ciclo
   recurso: chave do item no inventário
══════════════════════════════════════════════════════════════════════════════ */

const PRODUCAO_POR_PROFISSAO = {
  // ── Produtores de comida ──────────────────────────────────────────
  cacador:         { recurso: 'carne_caca',     ticks_intervalo: 2,  qtd_min: 1, qtd_max: 4  },
  armadilheiro:    { recurso: 'carne_caca',     ticks_intervalo: 3,  qtd_min: 1, qtd_max: 3  },
  pescador:        { recurso: 'peixe_fresco',   ticks_intervalo: 2,  qtd_min: 2, qtd_max: 6  },
  lavrador:        { recurso: 'cereal',         ticks_intervalo: 10, qtd_min: 5, qtd_max: 15 },
  pastor:          { recurso: 'carne_ovelha',   ticks_intervalo: 8,  qtd_min: 1, qtd_max: 3  },
  moleiro:         { recurso: 'farinha',        ticks_intervalo: 6,  qtd_min: 3, qtd_max: 8  },
  herborista:      { recurso: 'erva_medicinal', ticks_intervalo: 4,  qtd_min: 2, qtd_max: 5  },
  // ── Produtores de materiais ───────────────────────────────────────
  minerador:       { recurso: 'minerio_ferro',  ticks_intervalo: 3,  qtd_min: 2, qtd_max: 5  },
  lenhador:        { recurso: 'madeira',        ticks_intervalo: 3,  qtd_min: 3, qtd_max: 7  },
  ferreiro:        { recurso: 'ferro_trabalhado',ticks_intervalo: 4, qtd_min: 1, qtd_max: 3  },
  fabricante_redes:{ recurso: 'rede_pesca',     ticks_intervalo: 8,  qtd_min: 1, qtd_max: 2  },
  // ── Fonte de água ─────────────────────────────────────────────────
  // Água vem de fontes públicas — gerenciado pelo mapa, não por profissão
};

/* ══════════════════════════════════════════════════════════════════════════════
   TRAÇOS DE PERSONALIDADE INATOS
══════════════════════════════════════════════════════════════════════════════ */

const TRACOS_INATOS = [
  'corajoso','covarde','honesto','desonesto','generoso','ganancioso',
  'gentil','cruel','curioso','desinteressado','paciente','impaciente',
  'leal','traicoeiro','orgulhoso','humilde','ambicioso','satisfeito',
  'cauteloso','imprudente','alegre','melancolico','desconfiado','confiante',
  'teimoso','flexivel','apaixonado','reservado','protetor','egoista',
];

/* ══════════════════════════════════════════════════════════════════════════════
   HABILIDADES POR PROFISSÃO
══════════════════════════════════════════════════════════════════════════════ */

const HABILIDADES_POR_PROFISSAO = {
  mercador:         ['negociacao','avaliacao','persuasao','contabilidade'],
  guarda:           ['esgrima','vigilancia','intimidacao','patrulha'],
  estalajadeiro:    ['culinaria','hospitalidade','fofoca','contabilidade'],
  ferreiro:         ['metalurgia','esgrima','avaliacao','resistencia'],
  marinheiro:       ['navegacao','natacao','trabalho_cordas','leitura_tempo'],
  pescador:         ['pesca','natacao','leitura_tempo','lancamento_redes'],
  sacerdote:        ['teologia','cura','persuasao','ritual'],
  ladrao:           ['furtividade','arrombar','prestidigitacao','enganacao'],
  nobre:            ['etiqueta','politica','equitacao','contabilidade'],
  artesao:          ['artesanato','avaliacao','negociacao','resistencia'],
  lavrador:         ['agricultura','trato_animais','resistencia','leitura_tempo'],
  mendigo:          ['mendicancia','furtividade','fofoca','sobrevivencia'],
  bardo:            ['performance','persuasao','fofoca','historia'],
  escriba:          ['escrita','leitura','historia','idiomas'],
  curandeiro:       ['medicina','herbologia','diagnostico','empatia'],
  estivador:        ['resistencia','trabalho_cordas','natacao','carga'],
  servo:            ['culinaria','limpeza','discrição','etiqueta'],
  cacador:          ['rastreamento','arco','furtividade','esfola'],
  herborista:       ['herbologia','medicina','coleta','botanica'],
  lenhador:         ['machado','resistencia','navegacao','sobrevivencia'],
  armadilheiro:     ['armadilhas','rastreamento','furtividade','sobrevivencia'],
  minerador:        ['mineracao','resistencia','geologia','explosivos'],
  moleiro:          ['moagem','agricultura','maquinaria','contabilidade'],
  pastor:           ['trato_animais','leitura_tempo','resistencia','navegacao'],
  fabricante_redes: ['artesanato','pesca','trabalho_cordas','comercio'],
  contrabandista:   ['furtividade','navegacao','enganacao','suborno'],
  guarda_farol:     ['navegacao','sinalizacao','trabalho_cordas','resistencia'],
  fora_da_lei:      ['combate','furtividade','sobrevivencia','intimidacao'],
  aventureiro:      ['combate','sobrevivencia','exploracao','primeiros_socorros'],
  estudioso:        ['pesquisa','historia','teoria_magica','idiomas'],
  cultista:         ['ritual','furtividade','enganacao','magia_sombria'],
  anciao:           ['sabedoria','historia','fofoca','medicina'],
  crianca:          [],
};

/* ══════════════════════════════════════════════════════════════════════════════
   INVENTÁRIO INICIAL POR PROFISSÃO
══════════════════════════════════════════════════════════════════════════════ */

const INVENTARIO_INICIAL = {
  ferreiro:         [{ item: 'martelo', qtd: 1 }, { item: 'lingote_ferro', qtd: rand(3,8) }],
  guarda:           [{ item: 'espada_curta', qtd: 1 }, { item: 'armadura_couro', qtd: 1 }],
  mercador:         [{ item: 'balanca_comerciante', qtd: 1 }, { item: 'livro_contas', qtd: 1 }],
  lavrador:         [{ item: 'forcado', qtd: 1 }, { item: 'sementes', qtd: rand(5,15) }, { item: 'cereal', qtd: rand(2,6) }],
  pescador:         [{ item: 'vara_pesca', qtd: 1 }, { item: 'rede', qtd: rand(1,3) }, { item: 'peixe_fresco', qtd: rand(1,4) }],
  cacador:          [{ item: 'arco_caca', qtd: 1 }, { item: 'flechas', qtd: rand(10,30) }, { item: 'carne_caca', qtd: rand(1,3) }],
  curandeiro:       [{ item: 'erva_medicinal', qtd: rand(5,15) }, { item: 'atadura', qtd: rand(3,8) }],
  minerador:        [{ item: 'picareta', qtd: 1 }, { item: 'lanterna', qtd: 1 }, { item: 'minerio_ferro', qtd: rand(1,3) }],
  sacerdote:        [{ item: 'simbolo_sagrado', qtd: 1 }, { item: 'livro_oracoes', qtd: 1 }],
  marinheiro:       [{ item: 'corda', qtd: rand(2,5) }, { item: 'faca_marinheiro', qtd: 1 }],
  bardo:            [{ item: 'alaude', qtd: 1 }],
  estudioso:        [{ item: 'pergaminho', qtd: rand(2,6) }, { item: 'tinta_e_pena', qtd: 1 }],
  ladrao:           [{ item: 'gazuas', qtd: rand(2,5) }, { item: 'adaga', qtd: 1 }],
  herborista:       [{ item: 'erva_medicinal', qtd: rand(3,8) }, { item: 'cesta_coleta', qtd: 1 }],
  lenhador:         [{ item: 'machado', qtd: 1 }, { item: 'madeira', qtd: rand(2,5) }],
  armadilheiro:     [{ item: 'armadilha_ferro', qtd: rand(2,4) }, { item: 'carne_caca', qtd: rand(1,2) }],
  moleiro:          [{ item: 'saco_farinha', qtd: rand(2,5) }, { item: 'farinha', qtd: rand(3,8) }],
  pastor:           [{ item: 'cajado', qtd: 1 }, { item: 'carne_ovelha', qtd: rand(1,2) }],
};

/* ══════════════════════════════════════════════════════════════════════════════
   UTILITÁRIOS
══════════════════════════════════════════════════════════════════════════════ */

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function escolher(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function escolherPonderado(itens) {
  const total = itens.reduce((soma, i) => soma + i.weight, 0);
  let rolar = Math.random() * total;
  for (const item of itens) {
    rolar -= item.weight;
    if (rolar <= 0) return item.role;
  }
  return itens[itens.length - 1].role;
}

function gerarNome(genero) {
  const primeiro = genero === 'masculino'
    ? escolher(NOMES_MASCULINOS)
    : escolher(NOMES_FEMININOS);
  return `${primeiro} ${escolher(SOBRENOMES)}`;
}

function gerarIdade(profissao) {
  if (profissao === 'crianca') return rand(6, 15);
  if (profissao === 'anciao')  return rand(62, 80);
  if (['nobre','mercador','sacerdote'].includes(profissao)) return rand(30, 60);
  return rand(18, 55);
}

function gerarOuro(profissao) {
  const base = {
    nobre:            rand(500, 2000),
    mercador:         rand(200, 800),
    ferreiro:         rand(100, 400),
    estalajadeiro:    rand(150, 500),
    guarda:           rand(30, 100),
    sacerdote:        rand(50, 200),
    marinheiro:       rand(20, 80),
    artesao:          rand(50, 200),
    lavrador:         rand(20, 80),
    pescador:         rand(20, 70),
    cacador:          rand(15, 60),
    minerador:        rand(30, 100),
    ladrao:           rand(10, 150),
    contrabandista:   rand(50, 300),
    estudioso:        rand(30, 120),
    mendigo:          rand(0, 10),
    crianca:          rand(0, 5),
    servo:            rand(5, 25),
    estivador:        rand(10, 40),
    bardo:            rand(10, 50),
  };
  return base[profissao] ?? rand(10, 60);
}

function gerarPersonalidade() {
  const qtd = rand(2, 4);
  const tracos = [];
  const pool = [...TRACOS_INATOS];
  for (let i = 0; i < qtd; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    tracos.push(pool.splice(idx, 1)[0]);
  }
  return { tracos, adquiridos: [], sombrios: [] };
}

function gerarHabilidades(profissao) {
  const pool = HABILIDADES_POR_PROFISSAO[profissao] || [];
  const resultado = {};
  for (const hab of pool) {
    resultado[hab] = rand(1, 5);
  }
  return resultado;
}

function gerarInventario(profissao) {
  const items = INVENTARIO_INICIAL[profissao] || [];
  // Normaliza para o formato { item_key, quantidade }
  return items.map(i => ({ item_key: i.item, quantidade: i.qtd }));
}

function gerarPropriedades(profissao, ouro, regiaoId) {
  if (['nobre','mercador'].includes(profissao) && ouro > 300) {
    return [{ tipo: 'casa', nome: 'Casa familiar', regiao_id: regiaoId, valor: rand(300, 1000) }];
  }
  if (['ferreiro','estalajadeiro'].includes(profissao)) {
    const nome = profissao === 'ferreiro' ? 'Ferraria pessoal' : 'Estalagem pessoal';
    return [{ tipo: 'comercio', nome, regiao_id: regiaoId, valor: rand(200, 600) }];
  }
  if (profissao === 'lavrador') {
    return [{ tipo: 'terra', nome: 'Parcela de terra', regiao_id: 3, valor: rand(100, 400) }];
  }
  return [];
}

function gerarObjetivos(profissao, idade, regiaoId) {
  const objetivos = [];

  // Solteiro adulto jovem — busca cônjuge
  if (idade > 20 && idade < 45 && !['crianca','anciao'].includes(profissao)) {
    if (Math.random() < 0.35) {
      objetivos.push({
        tipo: 'encontrar_conjuge',
        status: 'ativo',
        prioridade: rand(3, 6),
        dados: { idade_min: Math.max(18, idade - 10), idade_max: idade + 10 },
      });
    }
  }

  // Profissionais querem acumular ouro
  if (['mercador','ferreiro','estalajadeiro','artesao'].includes(profissao) && Math.random() < 0.3) {
    objetivos.push({
      tipo: 'acumular_ouro',
      status: 'ativo',
      prioridade: rand(3, 6),
      dados: { meta: rand(300, 1500), motivo: 'seguranca' },
    });
  }

  // Mercador quer expandir negócio
  if (profissao === 'mercador' && Math.random() < 0.25) {
    objetivos.push({
      tipo: 'expandir_negocio',
      status: 'ativo',
      prioridade: rand(4, 7),
      dados: { tipo_negocio: 'comercio', meta: 'abrir_segunda_loja' },
    });
  }

  // Desejo de aprender algo novo
  if (Math.random() < 0.15) {
    objetivos.push({
      tipo: 'aprender_habilidade',
      status: 'ativo',
      prioridade: rand(1, 4),
      dados: {
        habilidade: escolher(['fermentacao','culinaria','marcenaria','idiomas','cura']),
        progresso: 0,
        nivel_alvo: rand(2, 4),
      },
    });
  }

  // Pai/mãe adulto quer casar o filho
  if (idade > 40 && ['lavrador','pescador','artesao','mercador'].includes(profissao) && Math.random() < 0.2) {
    objetivos.push({
      tipo: 'casar_filho',
      status: 'bloqueado',
      prioridade: rand(4, 7),
      dados: { npc_filho_id: null }, // resolvido após seed dos NPCs
    });
  }

  // Agricultores e pastores querem garantir comida para o inverno
  if (['lavrador','pastor','pescador'].includes(profissao) && Math.random() < 0.3) {
    objetivos.push({
      tipo: 'estocar_comida',
      status: 'ativo',
      prioridade: rand(5, 8),
      dados: { meta_unidades: rand(20, 60), estocado: 0 },
    });
  }

  return objetivos;
}

/* ══════════════════════════════════════════════════════════════════════════════
   GERADOR DE NPC
══════════════════════════════════════════════════════════════════════════════ */

function gerarNPC(regiaoId, localId, posX, posY) {
  const genero    = Math.random() < 0.48 ? 'masculino' : 'feminino';
  const profissao = escolherPonderado(PROFISSOES[regiaoId] || PROFISSOES[1]);
  const idade     = gerarIdade(profissao);
  const nome      = gerarNome(genero);
  const ouro      = gerarOuro(profissao);
  const divindade = Math.random() < 0.8 ? escolher(DIVINDADES) : null;
  const faccao    = Math.random() < 0.4 ? escolher(FACÇÕES)  : 'nenhuma';

  // Necessidades vitais — começam em valores aleatórios razoáveis
  const hp    = rand(80, 100);
  const fome  = rand(50, 100);  // 0 = faminto, 100 = satisfeito
  const sede  = rand(50, 100);  // 0 = desidratado, 100 = hidratado

  return {
    mundo_id:    MUNDO_ID,
    regiao_id:   regiaoId,
    local_id:    localId,
    pos_x:       posX + (Math.random() * 10 - 5),
    pos_y:       posY + (Math.random() * 10 - 5),
    nome,
    genero,
    idade,
    profissao,
    ouro,
    religiao:    divindade,
    faccao,
    personalidade: gerarPersonalidade(),
    habilidades:   gerarHabilidades(profissao),
    inventario:    gerarInventario(profissao),
    propriedades:  gerarPropriedades(profissao, ouro, regiaoId),
    objetivos:     gerarObjetivos(profissao, idade, regiaoId),
    reputacao:     rand(0, 100),
    hp,
    max_hp:        100,
    fome,
    sede,
    is_alive:      1,
    is_hostile:    ['cultista','fora_da_lei'].includes(profissao) ? (Math.random() < 0.4 ? 1 : 0) : 0,
    descricao:     `${nome}, ${idade} anos, ${profissao}.`,
    conhecimento:  [],
    loot_table:    profissao !== 'crianca'
      ? JSON.stringify({ ouro_min: Math.floor(ouro * 0.1), ouro_max: Math.floor(ouro * 0.4) })
      : null,
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
   CONSTRUTOR DE RELAÇÕES SOCIAIS
══════════════════════════════════════════════════════════════════════════════ */

function construirRelacoes(npcs) {
  const relacoes  = [];
  const adultos   = npcs.filter(n => n.idade >= 20 && n.idade <= 55 && n.is_alive);
  const criancas  = npcs.filter(n => n.idade < 18  && n.is_alive);
  const porRegiao = {};

  for (const n of adultos) {
    if (!porRegiao[n.regiao_id]) porRegiao[n.regiao_id] = [];
    porRegiao[n.regiao_id].push(n);
  }

  // ── Casais (30% dos adultos) ─────────────────────────────────────────────
  const jaCasados = new Set();
  for (const [, regionAdultos] of Object.entries(porRegiao)) {
    const homens   = regionAdultos.filter(n => n.genero === 'masculino');
    const mulheres = regionAdultos.filter(n => n.genero === 'feminino');
    const pares    = Math.floor(Math.min(homens.length, mulheres.length) * 0.3);

    for (let i = 0; i < pares; i++) {
      if (i >= homens.length || i >= mulheres.length) break;
      const h = homens[i];
      const m = mulheres[i];
      if (jaCasados.has(h.idx) || jaCasados.has(m.idx)) continue;
      jaCasados.add(h.idx);
      jaCasados.add(m.idx);

      const afinidade = rand(40, 90);
      relacoes.push({ npc_id: h.idx, alvo_npc_id: m.idx, tipo_relacao: 'conjuge', afinidade, tags: JSON.stringify(['casados']) });
      relacoes.push({ npc_id: m.idx, alvo_npc_id: h.idx, tipo_relacao: 'conjuge', afinidade, tags: JSON.stringify(['casados']) });
    }
  }

  // ── Filhos ───────────────────────────────────────────────────────────────
  const listaPareja = [...jaCasados];
  for (let i = 0; i < listaPareja.length; i += 2) {
    if (i + 1 >= listaPareja.length) break;
    const pai1 = npcs.find(n => n.idx === listaPareja[i]);
    const pai2 = npcs.find(n => n.idx === listaPareja[i + 1]);
    if (!pai1 || !pai2) continue;

    const criancasRegiao = criancas.filter(c => c.regiao_id === pai1.regiao_id);
    const qtd = Math.min(rand(0, 3), criancasRegiao.length);
    for (let j = 0; j < qtd; j++) {
      const filho = criancasRegiao[j];
      if (!filho) break;
      for (const pai of [pai1, pai2]) {
        relacoes.push({ npc_id: pai.idx,   alvo_npc_id: filho.idx, tipo_relacao: 'pai',   afinidade: rand(60, 95), tags: JSON.stringify(['familia']) });
        relacoes.push({ npc_id: filho.idx, alvo_npc_id: pai.idx,   tipo_relacao: 'filho', afinidade: rand(50, 90), tags: JSON.stringify(['familia']) });
      }
    }
  }

  // ── Amizades (0–3 amigos por adulto na mesma região) ─────────────────────
  for (const npc of adultos) {
    const conhecidos = (porRegiao[npc.regiao_id] || []).filter(n => n.idx !== npc.idx);
    const qtdAmigos  = rand(0, 3);
    const escolhidos = conhecidos.sort(() => Math.random() - 0.5).slice(0, qtdAmigos);
    for (const amigo of escolhidos) {
      const jaExiste = relacoes.find(r => r.npc_id === npc.idx && r.alvo_npc_id === amigo.idx);
      if (!jaExiste) {
        relacoes.push({ npc_id: npc.idx, alvo_npc_id: amigo.idx, tipo_relacao: 'amigo', afinidade: rand(20, 70), tags: JSON.stringify([]) });
      }
    }
  }

  // ── Rivalidades (5% dos adultos na mesma profissão) ──────────────────────
  for (const npc of adultos) {
    if (Math.random() < 0.05) {
      const rivais = (porRegiao[npc.regiao_id] || []).filter(n => n.idx !== npc.idx && n.profissao === npc.profissao);
      if (rivais.length > 0) {
        const rival = escolher(rivais);
        relacoes.push({ npc_id: npc.idx, alvo_npc_id: rival.idx, tipo_relacao: 'rival', afinidade: rand(-70, -20), tags: JSON.stringify(['rival','competidor']) });
      }
    }
  }

  // ── Empregador / empregado ───────────────────────────────────────────────
  const empregadores = adultos.filter(n => ['mercador','estalajadeiro','ferreiro','nobre','lavrador'].includes(n.profissao));
  const empregados   = adultos.filter(n => ['servo','estivador','artesao','guarda'].includes(n.profissao));
  for (const emp of empregadores) {
    const disponiveis = empregados.filter(n => n.regiao_id === emp.regiao_id);
    const escolhidos  = disponiveis.sort(() => Math.random() - 0.5).slice(0, rand(0, 2));
    for (const trabalhador of escolhidos) {
      relacoes.push({ npc_id: emp.idx,         alvo_npc_id: trabalhador.idx, tipo_relacao: 'empregador', afinidade: rand(10, 50), tags: JSON.stringify(['empregador']) });
      relacoes.push({ npc_id: trabalhador.idx, alvo_npc_id: emp.idx,         tipo_relacao: 'empregado',  afinidade: rand(10, 40), tags: JSON.stringify(['empregado']) });
    }
  }

  return relacoes;
}

/* ══════════════════════════════════════════════════════════════════════════════
   SCRIPT PRINCIPAL
══════════════════════════════════════════════════════════════════════════════ */

const DISTRIBUICAO = [
  { regiao_id: 1, qtd: 350 },
  { regiao_id: 2, qtd: 50  },
  { regiao_id: 3, qtd: 60  },
  { regiao_id: 4, qtd: 55  },
  { regiao_id: 5, qtd: 45  },
  { regiao_id: 6, qtd: 10  },
];

async function main() {
  console.log('👥 AIRPG NPC Seeder — Iniciando...\n');

  const conn = await mysql.createConnection(DB_CONFIG);

  try {
    // Buscar locais por região
    const [locaisRows] = await conn.execute(
      'SELECT id, region_id, pos_x, pos_y FROM locations WHERE region_id IN (1,2,3,4,5,6)'
    );
    const locaisPorRegiao = {};
    for (const loc of locaisRows) {
      if (!locaisPorRegiao[loc.region_id]) locaisPorRegiao[loc.region_id] = [];
      locaisPorRegiao[loc.region_id].push(loc);
    }

    // Limpar NPCs existentes
    console.log('🧹 Limpando NPCs anteriores...');
    await conn.execute('DELETE FROM npc_relations WHERE 1=1');
    await conn.execute('DELETE FROM npc_objectives WHERE 1=1');
    await conn.execute('DELETE FROM npcs WHERE world_id = ?', [MUNDO_ID]);

    // Gerar NPCs
    const todosNPCs = [];
    for (const { regiao_id, qtd } of DISTRIBUICAO) {
      const locais = locaisPorRegiao[regiao_id] || [];
      if (locais.length === 0) {
        console.warn(`   ⚠ Região ${regiao_id} sem locais. Pulando.`);
        continue;
      }
      for (let i = 0; i < qtd; i++) {
        const local = escolher(locais);
        todosNPCs.push(gerarNPC(regiao_id, local.id, parseFloat(local.pos_x), parseFloat(local.pos_y)));
      }
    }

    console.log(`\n🧑‍🤝‍🧑 Inserindo ${todosNPCs.length} NPCs...`);

    // Inserir NPCs — com hp, max_hp, fome, sede
    const idsInseridos = [];
    for (const npc of todosNPCs) {
      const [resultado] = await conn.execute(
        `INSERT INTO npcs
           (world_id, region_id, location_id, pos_x, pos_y,
            name, gender, age, role,
            gold, religion, faction,
            personality, skills, inventory, properties, objectives,
            reputation, hp, max_hp, hunger, thirst,
            is_alive, is_hostile, description, knowledge, loot_table)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          npc.mundo_id, npc.regiao_id, npc.local_id,
          npc.pos_x.toFixed(4), npc.pos_y.toFixed(4),
          npc.nome, npc.genero, npc.idade, npc.profissao,
          npc.ouro, npc.religiao, npc.faccao,
          JSON.stringify(npc.personalidade),
          JSON.stringify(npc.habilidades),
          JSON.stringify(npc.inventario),
          JSON.stringify(npc.propriedades),
          JSON.stringify(npc.objetivos),
          npc.reputacao, npc.hp, npc.max_hp, npc.fome, npc.sede,
          npc.is_alive, npc.is_hostile,
          npc.descricao,
          JSON.stringify(npc.conhecimento),
          npc.loot_table,
        ]
      );
      idsInseridos.push(resultado.insertId);
    }

    // Marcar índice real do banco em cada NPC
    for (let i = 0; i < todosNPCs.length; i++) {
      todosNPCs[i].idx = idsInseridos[i];
    }

    // Inserir objetivos na tabela npc_objectives
    console.log('\n🎯 Inserindo objetivos...');
    let totalObjetivos = 0;
    for (const npc of todosNPCs) {
      for (const obj of npc.objetivos) {
        await conn.execute(
          `INSERT INTO npc_objectives (npc_id, type, status, priority, payload)
           VALUES (?,?,?,?,?)`,
          [npc.idx, obj.tipo, obj.status, obj.prioridade, JSON.stringify(obj.dados)]
        );
        totalObjetivos++;
      }
    }

    // Construir relações sociais
    console.log('\n💞 Construindo relações sociais...');
    const relacoes = construirRelacoes(todosNPCs);
    for (const rel of relacoes) {
      await conn.execute(
        `INSERT IGNORE INTO npc_relations
           (npc_id, target_npc_id, relation_type, affinity, tags)
         VALUES (?,?,?,?,?)`,
        [rel.npc_id, rel.alvo_npc_id, rel.tipo_relacao, rel.afinidade, rel.tags]
      );
    }

    // Resolver objetivos dependentes (casar_filho precisa do id real do filho)
    console.log('\n🔗 Resolvendo objetivos dependentes...');
    const pais = todosNPCs.filter(n => n.objetivos.some(o => o.tipo === 'casar_filho'));
    for (const pai of pais) {
      const [filhosRows] = await conn.execute(
        `SELECT npc_id FROM npc_relations
          WHERE npc_id = ? AND tipo_relacao = 'pai' LIMIT 1`,
        [pai.idx]
      );
      // Tenta a coluna correta
      const [filhosRows2] = await conn.execute(
        `SELECT target_npc_id FROM npc_relations
          WHERE npc_id = ? AND relation_type = 'pai' LIMIT 1`,
        [pai.idx]
      );
      const filhoId = filhosRows2[0]?.target_npc_id;
      if (filhoId) {
        await conn.execute(
          `UPDATE npc_objectives
              SET status = 'ativo',
                  requires_npc_id = ?,
                  payload = JSON_SET(payload, '$.npc_filho_id', ?)
            WHERE npc_id = ? AND type = 'casar_filho'`,
          [filhoId, filhoId, pai.idx]
        );
      }
    }

    // Relatório final
    const contagem = {};
    for (const { regiao_id, qtd } of DISTRIBUICAO) {
      const npcsRegiao = todosNPCs.filter(n => n.regiao_id === regiao_id);
      const profissoesCont = {};
      for (const n of npcsRegiao) {
        profissoesCont[n.profissao] = (profissoesCont[n.profissao] || 0) + 1;
      }
      const top3 = Object.entries(profissoesCont)
        .sort((a,b) => b[1] - a[1])
        .slice(0, 3)
        .map(([p, c]) => `${p}(${c})`)
        .join(', ');
      contagem[regiao_id] = { total: npcsRegiao.length, top3 };
    }

    console.log('\n' + '━'.repeat(45));
    console.log('✅ NPCs gerados com sucesso!');
    console.log(`   NPCs criados:    ${todosNPCs.length}`);
    console.log(`   Objetivos:       ${totalObjetivos}`);
    console.log(`   Relações:        ${relacoes.length}`);
    console.log('');
    for (const [rid, dados] of Object.entries(contagem)) {
      console.log(`   Região ${rid}: ${dados.total} NPCs — ${dados.top3}`);
    }
    console.log('━'.repeat(45) + '\n');

  } catch (err) {
    console.error('❌ Erro no seeder de NPCs:', err.message);
    console.error(err);
  } finally {
    await conn.end();
  }
}

main();
