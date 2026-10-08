# AIRPG — Sistema de Seed

Esta pasta contém os scripts que geram o estado inicial do mundo simulado de **As Terras de Eldoria**.

## Ordem de execução

```bash
# 1. Garantir que o banco está iniciado
mysql -u root -p < db/init.mysql

# 2. Gerar mapa (regiões, locais, conexões)
node seed/map.js

# 3. Gerar NPCs (depende do mapa para os locais)
node seed/npcs.js
```

---

## Arquivos

| Arquivo | Descrição |
|---|---|
| `map.js` | Gera as 6 regiões da ilha, seus locais e conexões entre regiões |
| `npcs.js` | Gera ~570 NPCs distribuídos pelas regiões, com relações sociais |
| `objectives.json` | Catálogo de tipos de objetivos que um NPC pode ter |

---

## Layout da Ilha

```
     [5] Vila de Drak (mineradores)
          /              \
[2] Bosque Brumoso    [4] Aldeia de Marev (pesca)
       (caçadores)        /
          \              /
      [1] Porto de Vael (cidade, ~350 NPCs)
          /              \
[3] Planícies de Aure   [6] Ruínas de Keth
      (agricultores)         (exploradres/cultistas)
```

### Regiões

| # | Nome | Tipo | NPCs | Perigo |
|---|------|------|------|--------|
| 1 | Porto de Vael | city | ~350 | ★☆☆☆☆ |
| 2 | Bosque Brumoso | forest | ~50 | ★★★☆☆ |
| 3 | Planícies de Aure | plains | ~60 | ★☆☆☆☆ |
| 4 | Aldeia de Marev | coast | ~55 | ★★☆☆☆ |
| 5 | Vila de Drak | mountain | ~45 | ★★★☆☆ |
| 6 | Ruínas de Keth | mixed | ~10 | ★★★★★ |

---

## Sistema de NPCs

### O que é um NPC vivo

No AIRPG, cada NPC não é apenas um "personagem com diálogo". Ele é uma entidade simulada com:

- **Identidade própria** — nome, idade, gênero, profissão, religião, facção
- **Psicologia em camadas** — traços inatos, traços adquiridos (temporários) e traços sombrios (permanentes se não resolvidos)
- **Objetivos com pré-condições** — um NPC com o objetivo "casar a filha" precisa ter uma filha viva e em idade de casar
- **Grafo social** — relações com outros NPCs, com tipo estrutural (pai/filho/cônjuge/empregador) + afinidade (-100 a +100) + tags relacionais emergentes
- **Inventário e propriedades** — itens concretos, casas, lojas, terras
- **Ouro** — que troca de mãos em transações reais com outros NPCs e jogadores

### Estrutura de um NPC no banco

```json
{
  "id": 42,
  "name": "Aelith Blackwood",
  "gender": "female",
  "age": 34,
  "role": "innkeeper",
  "gold": 312,
  "religion": "Ereth",
  "faction": "merchants_guild",
  "reputation": 67,

  "personality": {
    "traits": ["generous", "suspicious", "patient"],
    "acquired": [
      { "trait": "worried_about_debt", "expires_at_day": 120 }
    ],
    "dark": []
  },

  "skills": {
    "cooking": 4,
    "hospitality": 5,
    "gossip": 3,
    "accounting": 2
  },

  "inventory": [
    { "item_key": "innkeeper_keys", "quantity": 1 },
    { "item_key": "cooking_pot", "quantity": 2 }
  ],

  "properties": [
    { "type": "shop", "name": "Estalagem do Galo", "region_id": 1, "value": 450 }
  ],

  "objectives": [
    {
      "type": "pay_debt",
      "status": "active",
      "priority": 7,
      "payload": {
        "creditor_npc_id": 17,
        "amount_total": 200,
        "amount_paid": 50,
        "deadline_world_day": 180
      }
    }
  ],

  "knowledge": [
    "The Morvek family controls the harbor fees",
    "A stranger arrived from the north three days ago"
  ]
}
```

### Tabelas do banco

#### `npcs`

Tabela principal. Campos além dos básicos (id, world_id, region_id, etc.):

| Campo | Tipo | Descrição |
|---|---|---|
| `gender` | VARCHAR | `male` / `female` |
| `age` | TINYINT | 6–80 |
| `role` | VARCHAR | Profissão/papel social |
| `gold` | INT | Ouro atual |
| `religion` | VARCHAR | Divindade cultuada |
| `faction` | VARCHAR | Facção de pertencimento |
| `reputation` | INT | 0–100, reputação na comunidade |
| `personality` | JSON | `{ traits, acquired, dark }` |
| `skills` | JSON | `{ skill_name: level(1-5) }` |
| `inventory` | JSON | Array de `{ item_key, quantity }` |
| `properties` | JSON | Array de propriedades imóveis |
| `objectives` | JSON | Cache dos objetivos ativos |

#### `npc_objectives`

Tabela relacional de objetivos (mais queryable que JSON):

| Campo | Tipo | Descrição |
|---|---|---|
| `npc_id` | INT | FK para `npcs` |
| `type` | VARCHAR | Tipo do objetivo (ver `objectives.json`) |
| `status` | ENUM | `active / completed / failed / blocked` |
| `priority` | TINYINT | 1–10 |
| `requires_npc_id` | INT | NPC pré-condição (pode ser NULL) |
| `payload` | JSON | Dados específicos do objetivo |
| `expires_at_world_day` | INT | Expiração em dia do mundo (NULL = sem prazo) |

#### `npc_relations`

Relações NPC-para-NPC (diferente da antiga `npc_relationships` que era NPC→Jogador):

| Campo | Tipo | Descrição |
|---|---|---|
| `npc_id` | INT | NPC de origem |
| `target_npc_id` | INT | NPC alvo |
| `relation_type` | ENUM | `spouse / parent / child / sibling / friend / rival / employer / employee / acquaintance / enemy / romantic_partner / trade_partner` |
| `affinity` | SMALLINT | -100 a +100 |
| `tags` | JSON | Array de tags relacionais: `["saved_my_life", "killed_my_daughter"]` |
| `is_known_to_player` | JSON | Mapa `{ character_id: bool }` — jogadores que descobriram essa relação |
| `last_interaction_at` | DATETIME | Último evento entre esses NPCs |

#### `npc_events`

Log causal de eventos entre NPCs — a "memória do mundo":

| Campo | Tipo | Descrição |
|---|---|---|
| `world_id` | INT | Mundo onde ocorreu |
| `region_id` | INT | Região onde ocorreu |
| `actor_npc_id` | INT | NPC que agiu |
| `target_npc_id` | INT | NPC que sofreu a ação |
| `event_type` | VARCHAR | `trade / marriage / death / theft / argument / betrayal / ...` |
| `payload` | JSON | Dados do evento |
| `affinity_delta` | SMALLINT | Mudança de afinidade causada |
| `world_year` | INT | Ano do mundo |
| `world_day` | INT | Dia do mundo |
| `propagated_from_event_id` | INT | Evento pai (para cadeia causal) |

### Sistema de personalidade

NPCs têm três camadas psicológicas:

**Traços inatos** (`personality.traits`) — definidos no seed, estáveis ao longo do tempo. Exemplos: `brave`, `greedy`, `loyal`.

**Traços adquiridos** (`personality.acquired`) — emergem de eventos, têm prazo de vida (TTL em dias do mundo). Exemplos:
- `worried_about_debt` — adquirido quando uma dívida está vencendo
- `grieving` — adquirido após a morte de um familiar
- `heartbroken` — após rejeição romântica

**Traços sombrios** (`personality.dark`) — permanentes se não forem resolvidos. Emergem de traumas não tratados. Exemplos:
- `blood_rage` — após perder um familiar para violência sem vingança
- `guilt_ridden` — após causar dano sério a outro NPC
- `chronic_grief` — luto não resolvido após muito tempo
- `purposeless` — NPC sem objetivos e sem laços sociais

### Sistema de objetivos

Objetivos são estruturados com pré-condições relacionais. Exemplo:

```json
{
  "type": "marry_off_child",
  "status": "active",
  "priority": 6,
  "payload": {
    "child_npc_id": 87,
    "desired_status": "merchant_class",
    "candidates": []
  }
}
```

Se o `child_npc_id` morrer, o objetivo passa para `failed` e pode gerar o objetivo `avenge_death`.

Veja o catálogo completo em `objectives.json`. As categorias são:
- **social** — casar, reconciliar, cortejar, reconectar família
- **economic** — pagar dívida, juntar ouro, expandir negócio, obter item
- **personal** — aprender habilidade, superar perda, partir para outro local
- **conflict** — vingar morte, expor corrupção, recuperar propriedade
- **spiritual** — peregrinação, redenção, conversão
- **civic** — tornar-se líder, construir edificação, fundar guilda

### Propagação de afinidade

O motor de simulação usa propagação de vizinhança:
- **Grau 1** (relação direta) — peso 1.0
- **Grau 2** (amigo de amigo) — peso 0.3
- **Grau 3+** — não propaga

Exemplo: Marido (A) mata inimigo (C) que era amigo (grau 1) de Esposa (B). Esposa B fica -30 * 0.3 = -9 de afinidade com Marido A.

### Zonas de ativação

NPCs só processam eventos quando há um jogador a menos de ~200 unidades de distância. Fora disso, ficam como linhas estáticas no banco.

O servidor mantém um `Set<regionId>` de regiões ativas. A cada tick:
1. Verifica quais regiões têm jogadores
2. Processa apenas NPCs dessas regiões
3. Acumula eventos para as outras regiões (processados em batch quando ativadas)

### Testes sem jogadores

Para testar a simulação sem jogadores:

```bash
# Rodar o motor de simulação em modo headless
node src/services/worldSimulator.js --ticks=720 --headless
```

Isso simula 720 ticks (30 dias do mundo) e gera um log de eventos em `logs/simulation.jsonl`.

---

## Referência de profissões

| Role | Encontrado em | Habilidades características |
|---|---|---|
| `merchant` | Cidade, vilas | bargaining, appraisal, persuasion |
| `guard` | Cidade, minas | swordsmanship, alertness, intimidation |
| `innkeeper` | Cidade, vilas | cooking, hospitality, gossip |
| `blacksmith` | Cidade, minas | metalworking, swordsmanship |
| `sailor` | Cidade, costa | navigation, swimming, weather_reading |
| `fisherman` | Cidade, costa | fishing, swimming, net_casting |
| `farmer` | Planícies, vilas | agriculture, animal_handling, endurance |
| `hunter` | Floresta | tracking, archery, stealth |
| `miner` | Minas | mining, endurance, geology |
| `priest` | Cidade, vilas | theology, healing, persuasion |
| `healer` | Cidade | medicine, herbalism, diagnosis |
| `thief` | Cidade | stealth, lockpicking, sleight_of_hand |
| `bard` | Cidade | performance, persuasion, gossip |
| `scholar` | Ruínas | research, history, magic_theory |
| `cultist` | Ruínas | ritual, stealth, dark_magic |
| `outlaw` | Floresta, minas | combat, stealth, survival |
| `noble` | Cidade | etiquette, politics, accounting |
| `elder` | Toda região | wisdom, history, gossip |
| `child` | Toda região | (nenhuma) |
