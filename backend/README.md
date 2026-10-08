# ⚔ AIRPG — Backend

Node.js/Express API com Socket.IO, MySQL e narração por IA (Anthropic SDK).

---

## Sumário

- [Stack](#stack)
- [Instalação](#instalação)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Banco de Dados](#banco-de-dados)
- [Estrutura de Arquivos](#estrutura-de-arquivos)
- [API — Referência Completa](#api--referência-completa)
  - [Auth](#auth)
  - [Worlds](#worlds)
  - [Characters](#characters)
  - [Inventory](#inventory)
  - [Loot & World Pickup](#loot--world-pickup)
  - [Markets](#markets)
  - [Interactions (Combate)](#interactions-combate)
  - [Admin](#admin)
- [WebSocket — Canais](#websocket--canais)
- [Serviços](#serviços)
- [Middlewares](#middlewares)
- [Scheduler (tarefas automáticas)](#scheduler-tarefas-automáticas)

---

## Stack

| Tecnologia | Versão | Uso |
|---|---|---|
| Node.js | 18+ | Runtime |
| Express | 4 | HTTP framework |
| Socket.IO | 4 | WebSocket em tempo real |
| MySQL2 | 3 | Banco de dados |
| Anthropic SDK | latest | IA como Mestre (DM) |
| bcryptjs | 2 | Hash de senhas |
| jsonwebtoken | 9 | Autenticação JWT |
| helmet | 7 | Segurança HTTP |

---

## Instalação

```bash
cd backend
npm install
cp .env.example .env
# Edite .env com sua ANTHROPIC_API_KEY
npm start
```

O servidor sobe na porta `3030` por padrão e serve o `frontend/dist/` estaticamente.

### Desenvolvimento

```bash
npm run dev   # nodemon com hot reload
```

---

## Variáveis de Ambiente

Arquivo: `backend/.env` (copiar de `.env.example`)

| Variável | Padrão | Obrigatório | Descrição |
|---|---|---|---|
| `PORT` | `3030` | — | Porta HTTP |
| `NODE_ENV` | `development` | — | Ambiente |
| `DB_HOST` | `127.0.0.1` | ✓ | Host MySQL |
| `DB_PORT` | `3306` | — | Porta MySQL |
| `DB_USER` | `root` | ✓ | Usuário MySQL |
| `DB_PASSWORD` | `alfaiate10` | ✓ | Senha MySQL |
| `DB_NAME` | `airpg` | ✓ | Nome do banco |
| `JWT_SECRET` | `change_me` | ✓ | Segredo JWT — **mude em produção** |
| `JWT_EXPIRES` | `7d` | — | Validade do token |
| `ANTHROPIC_API_KEY` | — | ✓ | Chave da API Anthropic |
| `AI_MODEL` | `claude-opus-4-5` | — | Modelo de IA usado pelo DM |
| `CLIENT_ORIGIN` | `*` | — | Origin permitida no CORS |

---

## Banco de Dados

### Pré-requisitos

- MySQL 8.0+
- Usuário: `root`, Senha: `alfaiate10`

### Criar schema e popular

```bash
mysql -u root -palfaiate10 < db/init.mysql
```

Cria o banco `airpg` com todas as tabelas e seed inicial:
- Usuário admin: `admin@intellsn.com.br` / `admin123`
- Mundo "As Terras de Eldoria" com 3 regiões e 6 localizações
- 2 mercados (Mercado de Valdrin, Ferraria do Anão)

### Seed de itens (28 itens mágicos)

Após o servidor estar rodando:

```bash
curl -X POST http://localhost:3030/api/admin/seed-items \
  -H "Authorization: Bearer <token_admin>"
```

### Tabelas principais

| Tabela | Descrição |
|---|---|
| `users` | Contas de jogadores |
| `worlds` | Mundos persistentes |
| `regions` | Regiões dentro de um mundo |
| `locations` | Localizações dentro de regiões (pos_x, pos_y) |
| `characters` | Personagens dos jogadores (atributos, HP, gold, posição) |
| `item_catalog` | Catálogo global de itens com drop/market chance |
| `character_inventory` | Itens no inventário de cada personagem |
| `markets` | Mercados em localizações específicas |
| `market_stock` | Estoque atual de cada mercado |
| `transactions` | Histórico de compras/vendas |
| `loot_events` | Histórico de loots |
| `interaction_sessions` | Sessões de combate/diálogo ativas |
| `interaction_participants` | Participantes de cada sessão |
| `interaction_turns` | Histórico de turnos |

---

## Estrutura de Arquivos

```
backend/
├── config/
│   └── db.config.js          # Pool MySQL2 com JSON typecasting
├── data/
│   └── items.json             # Catálogo de 28 itens (referência)
├── db/
│   └── init.mysql             # Schema + seed completo
├── public/
│   ├── logo.svg               # Logo AIRPG (escudo + espada)
│   └── hero-bg.svg            # Background noturno com castelo
├── src/
│   ├── controllers/
│   │   ├── authController.js         # register, login, me
│   │   ├── characterController.js    # list, get, create, update
│   │   ├── interactionController.js  # create, getSession, submitTurn, oocChat, end
│   │   ├── inventoryController.js    # list, drop, equip, unequip
│   │   ├── itemSeederController.js   # seedItems (admin)
│   │   ├── lootController.js         # loot, pickupWorldItem
│   │   ├── marketController.js       # get, listByWorld, buy, sell, restock
│   │   ├── movementController.js     # move
│   │   └── worldController.js        # list, get, locations, nearby
│   ├── middlewares/
│   │   ├── auth.middleware.js         # Verifica JWT Bearer
│   │   └── user.middleware.js         # Verifica ownership do personagem
│   ├── routes/
│   │   └── api.routes.js              # Todas as rotas em um arquivo
│   └── services/
│       ├── aiService.js               # Anthropic SDK (5 funções de IA)
│       ├── diceEngine.js              # d20, advantage/disadvantage, críticos
│       └── scheduler.js              # Turn timeout, offline chars, restock
└── server.js                         # Express + Socket.IO + static serve
```

---

## API — Referência Completa

**Base URL:** `http://localhost:3030/api`

**Autenticação:** `Authorization: Bearer <token>` em todas as rotas marcadas com 🔒

---

### Auth

#### `POST /auth/register`

Cria um novo usuário.

**Body:**
```json
{
  "email": "heroi@eldoria.com",
  "password": "senha123",
  "username": "Kael Shadowmere"
}
```

**Resposta 201:**
```json
{
  "token": "eyJhbGci...",
  "user": { "id": 1, "email": "...", "username": "...", "role": "player" }
}
```

---

#### `POST /auth/login`

Autentica e retorna token JWT.

**Body:**
```json
{ "email": "heroi@eldoria.com", "password": "senha123" }
```

**Resposta 200:**
```json
{
  "token": "eyJhbGci...",
  "user": { "id": 1, "email": "...", "username": "...", "role": "player" }
}
```

---

#### `GET /auth/me` 🔒

Retorna dados do usuário logado.

**Resposta 200:**
```json
{ "id": 1, "email": "...", "username": "...", "role": "player", "created_at": "..." }
```

---

### Worlds

#### `GET /worlds`

Lista todos os mundos disponíveis.

**Resposta 200:** Array de `{ id, name, description, created_at }`

---

#### `GET /worlds/:worldId`

Retorna mundo com suas regiões.

**Resposta 200:**
```json
{
  "id": 1,
  "name": "As Terras de Eldoria",
  "description": "...",
  "regions": [
    { "id": 1, "name": "Floresta Sombria", "type": "forest", ... }
  ]
}
```

---

#### `GET /worlds/:worldId/regions/:regionId/locations`

Lista localizações de uma região.

**Resposta 200:** Array de `{ id, name, description, pos_x, pos_y, is_safe, ... }`

---

#### `GET /worlds/:worldId/nearby?characterId=X&radius=5`

Retorna personagens próximos (dentro do raio em unidades de mapa).

**Query params:**
- `characterId` (obrigatório) — ID do personagem referência
- `radius` (default: 5) — raio de busca

**Resposta 200:**
```json
[
  { "id": 2, "name": "Lira", "race": "Elf", "class": "Wizard", "distance": 3.2 }
]
```

---

#### `GET /worlds/:worldId/markets` 🔒

Lista todos os mercados em um mundo com nome da localização.

---

### Characters

#### `GET /characters` 🔒

Lista apenas os personagens do usuário autenticado.

**Resposta 200:**
```json
[
  {
    "id": 1, "name": "Kael", "race": "Human", "class": "Fighter",
    "level": 1, "current_hp": 12, "max_hp": 12, "gold": 50,
    "world_name": "As Terras de Eldoria", ...
  }
]
```

---

#### `POST /characters` 🔒

Cria um novo personagem. É atribuído automaticamente à localização inicial segura do mundo.

**Body:**
```json
{
  "name": "Kael Shadowmere",
  "world_id": 1,
  "race": "Human",
  "char_class": "Fighter",
  "background": "Era uma noite de tempestade...",
  "strength": 16, "dexterity": 12, "constitution": 14,
  "intelligence": 8, "wisdom": 10, "charisma": 10,
  "gold": 50
}
```

Campos opcionais com defaults: `race="Human"`, `char_class="Fighter"`, `background=""`, todos os atributos `=10`, `gold=50`.

**Resposta 201:** Objeto completo do personagem criado.

---

#### `GET /characters/:characterId` 🔒🛡

Retorna ficha completa do personagem com nome do mundo, região e localização.

> 🛡 = requer que o personagem pertença ao usuário autenticado (ou role `admin`)

---

#### `PATCH /characters/:characterId` 🔒🛡

Atualiza campos editáveis do personagem.

**Body** (campos opcionais):
```json
{
  "background": "Nova história...",
  "gold": 100,
  "autonomous_mode": true
}
```

---

#### `POST /characters/:characterId/move` 🔒🛡

Move o personagem para outra localização. Emite `character_moved` no canal WebSocket do mundo.

**Body:**
```json
{
  "location_id": 3,
  "pos_x": 15.5,
  "pos_y": 22.0
}
```

`pos_x` e `pos_y` são opcionais; se omitidos, usa a posição padrão da localização.

---

### Inventory

#### `GET /characters/:characterId/inventory` 🔒🛡

Lista todos os itens no inventário com dados completos do catálogo.

**Resposta 200:**
```json
[
  {
    "id": 1, "character_id": 1, "item_catalog_id": 5,
    "quantity": 1, "equipped": true, "slot": "main_hand",
    "name": "Espada Longa", "type": "weapon", "rarity": "common",
    "base_value": 15, "weight": 3.0, ...
  }
]
```

---

#### `DELETE /characters/:characterId/inventory/:itemId` 🔒🛡

Descarta (remove) um item do inventário.

**Resposta 200:** `{ "message": "Item descartado." }`

---

#### `PATCH /characters/:characterId/inventory/:itemId/equip` 🔒🛡

Equipa um item em um slot. Desequipa automaticamente o item anterior no mesmo slot.

**Body:**
```json
{ "slot": "main_hand" }
```

Slots válidos: `main_hand`, `off_hand`, `body`, `head`, `hands`, `feet`, `neck`, `ring`

---

#### `PATCH /characters/:characterId/inventory/:itemId/unequip` 🔒🛡

Desequipa um item.

---

### Loot & World Pickup

#### `POST /characters/:characterId/loot` 🔒🛡

Executa um evento de loot. Rola contra `drop_chance` de cada item no catálogo para o contexto dado. Também rola gold baseado no contexto.

**Body:**
```json
{
  "context": "chest",
  "source_name": "Baú abandonado"
}
```

Contextos válidos: `chest`, `corpse`, `pickpocket`, `search`

**Gold por contexto:**
- `chest`: `3d10+5` (min ~8, max ~35)
- `corpse`: `1d6` (min 1, max 6)
- `pickpocket`: `1d10+2` (min 3, max 12)
- `search`: `1d4` (min 1, max 4)

**Resposta 200:**
```json
{
  "items": [{ "id": 3, "name": "Poção de Cura", ... }],
  "gold": 12,
  "narration": "Entre as trevas do baú empoeirado, vossos dedos encontraram..."
}
```

---

#### `POST /characters/:characterId/pickup` 🔒🛡

Pega um objeto do cenário. A IA valida se é carregável e cria o item com `is_world_item=1` (nunca aparece em mercados ou loots futuros).

**Body:**
```json
{ "description": "Um vaso de cerâmica antiga com inscrições élvicas" }
```

**Resposta 200:**
```json
{
  "valid": true,
  "item": { "id": 42, "name": "Vaso de Cerâmica Élvica", "weight": 0.8, ... },
  "narration": "Com cuidado, você embala o vaso antigo..."
}
```

**Resposta 400** (IA rejeitou):
```json
{ "error": "Este objeto não pode ser carregado: é um ser vivo." }
```

---

### Markets

#### `GET /markets/:marketId` 🔒

Retorna mercado com estoque atual. Preço calculado como `COALESCE(price_override, base_value × buy_modifier)`.

**Resposta 200:**
```json
{
  "id": 1, "name": "Mercado de Valdrin", "type": "general",
  "stock": [
    {
      "item_catalog_id": 5, "name": "Espada Longa", "quantity": 3,
      "price": 30.0, "rarity": "common", ...
    }
  ]
}
```

---

#### `POST /markets/:marketId/buy` 🔒

Compra um item do mercado. Operação atômica (transaction MySQL).

**Body:**
```json
{
  "character_id": 1,
  "item_catalog_id": 5,
  "quantity": 1
}
```

**Resposta 200:**
```json
{ "message": "Compra realizada.", "gold_remaining": 20 }
```

**Erros possíveis:** gold insuficiente (400), estoque insuficiente (400), item não encontrado (404).

---

#### `POST /markets/:marketId/sell` 🔒

Vende um item do inventário. Preço = `base_value × sell_modifier` (padrão 0.5×). Itens de quest (`is_quest_item=1`) não podem ser vendidos.

**Body:**
```json
{
  "character_id": 1,
  "inventory_item_id": 7
}
```

**Resposta 200:**
```json
{ "message": "Venda realizada.", "gold_received": 7.5 }
```

---

#### `POST /markets/:marketId/restock` 🔒

Força restock manual do mercado. Rola `market_chance` para cada item do catálogo. Normalmente chamado pelo scheduler automaticamente a cada hora.

---

### Interactions (Combate)

#### `POST /worlds/:worldId/interactions` 🔒

Cria uma nova sessão de combate/diálogo. Rola iniciativa (`1d20 + mod DEX`) para todos os participantes e ordena por ordem decrescente.

Emite via Socket.IO:
- `session_started` → canal `world:<worldId>` (todos no mundo veem)
- `your_turn` → canal `session:<sessionId>` (participantes)

**Body:**
```json
{
  "type": "combat",
  "initiator_id": 1,
  "participants": [2, 3]
}
```

Tipos válidos: `combat`, `dialogue`

**Resposta 201:**
```json
{
  "session_id": 5,
  "participants": [{ "id": 1, "name": "Kael", "initiative": 17 }],
  "first_actor": { "id": 1, "name": "Kael" }
}
```

---

#### `GET /worlds/:worldId/interactions/:sessionId` 🔒

Retorna dados da sessão com participantes e turno atual.

---

#### `POST /worlds/:worldId/interactions/:sessionId/turn` 🔒

Submete a ação do turno atual. Fluxo:
1. Valida que é a vez do personagem
2. Emite `player_action_declared` imediatamente (outros veem o que você declarou)
3. IA interpreta intent (`parseIntent`)
4. Motor de dados executa a ação (`runEngine`):
   - **attack**: `attackRoll(strMod, AC 12)` → dano se acertar → aplica HP
   - **defend**: AC +2 por 1 turno
   - **flee**: `attributeCheck(DEX, DC 12)` → sai ou fica
   - **narrative_action**: free action narrada pela IA
5. IA narra o resultado (`narrate`)
6. Persiste ação em `interaction_turns`
7. Avança ao próximo ator vivo (`advanceTurn`)
8. Emite `turn_result` e `your_turn` via Socket.IO

**Body:**
```json
{
  "character_id": 1,
  "input": "Ataco o goblin com minha espada longa"
}
```

**Resposta 200:**
```json
{
  "narration": "Com um grito de guerra, Kael avança...",
  "result": { "action": "attack", "hit": true, "damage": 8, ... }
}
```

---

#### `POST /worlds/:worldId/interactions/:sessionId/ooc` 🔒

Envia mensagem OOC (Out Of Character). Emite apenas no canal `session:<id>:ooc` — a IA nunca vê.

**Body:**
```json
{ "character_id": 1, "message": "Posso usar poção agora?" }
```

---

#### `POST /worlds/:worldId/interactions/:sessionId/end` 🔒

Encerra a sessão manualmente. Emite `session_ended` no canal da sessão.

---

### Admin

#### `POST /admin/seed-items` 🔒 (role: admin)

Popula o `item_catalog` com os 28 itens de `data/items.json`. Idempotente — itens existentes são ignorados.

---

## WebSocket — Canais

Conexão: `io({ auth: { token: '<jwt>' } })`

### Eventos do cliente → servidor

| Evento | Payload | Descrição |
|---|---|---|
| `join_world` | `{ worldId, characterId }` | Entra no canal do mundo |
| `leave_world` | `{ worldId }` | Sai do canal do mundo |
| `join_session` | `{ sessionId }` | Entra na sessão de combate (entra em ambos `session:<id>` e `session:<id>:ooc`) |
| `leave_session` | `{ sessionId }` | Sai da sessão |

### Eventos do servidor → cliente

| Evento | Canal | Payload | Descrição |
|---|---|---|---|
| `session_started` | `world:<id>` | `{ sessionId, type, participants, first_actor, deadline }` | Combate iniciado |
| `character_moved` | `world:<id>` | `{ characterId, region_id, location_id, pos_x, pos_y }` | Personagem se moveu |
| `autonomous_action` | `world:<id>` | `{ character, action, reason }` | Personagem offline agiu |
| `player_action_declared` | `session:<id>` | `{ character_name, input, turn }` | Jogador declarou ação |
| `turn_result` | `session:<id>` | `{ character_name, narration, result }` | IA narrou resultado do turno |
| `your_turn` | `session:<id>` | `{ character_id, character_name, turn, deadline }` | Vez de agir |
| `turn_auto` | `session:<id>` | `{ narration }` | Turno automático (timeout) |
| `session_ended` | `session:<id>` | `{ last_narration }` | Sessão encerrada |
| `ooc_message` | `session:<id>:ooc` | `{ character_name, message }` | Mensagem OOC privada |

---

## Serviços

### `aiService.js`

Wrapper sobre o Anthropic SDK. Todas as funções retornam texto/JSON em português.

| Função | Entrada | Saída | Uso |
|---|---|---|---|
| `parseIntent(input, context)` | texto livre + contexto da cena | `{ action, target, item, details }` | Interpretar ação do jogador |
| `narrate(engineResult, context)` | resultado do motor | texto narrativo (3 frases) | Narrar resultado do turno |
| `validateWorldPickup(desc, charCtx)` | descrição do objeto | `{ valid, reason, suggested_name, estimated_weight, estimated_value }` | Validar coleta de objeto do mundo |
| `narrateLoot(lootResult, context)` | resultado do loot | texto narrativo (2-3 frases) | Narrar evento de loot |
| `autonomousIntent(character, context)` | dados do personagem | `{ action, reason }` | ação autônoma para chars offline |

### `diceEngine.js`

| Função | Descrição |
|---|---|
| `roll(formula)` | Rola fórmula: `"2d6+3"`, `"1d20 adv"`, `"1d20 dis"` |
| `attributeCheck(attrValue, dc)` | Teste de atributo com modificador vs DC |
| `attackRoll(attackBonus, targetAC)` | Rolagem de ataque com detecção de crítico/falha |
| `damageRoll(formula, isCrit)` | Dano (crítico dobra os dados) |

---

## Middlewares

### `auth.middleware.js`

Verifica `Authorization: Bearer <token>` em rotas protegidas. Decodifica JWT e anexa `req.user = { id, email, role }`.

Retorna `401` se token ausente ou inválido, `403` se expirado.

### `user.middleware.js`

Verifica que `characters.user_id === req.user.id`. Admins (`role = 'admin'`) ignoram a checagem.

Retorna `403 Acesso negado` se o personagem pertencer a outro usuário.

---

## Scheduler (tarefas automáticas)

Iniciado em `server.js` via `initSchedulers(io)`. Três loops:

| Loop | Intervalo | O que faz |
|---|---|---|
| Turn timeout | 1 min | Para sessões ativas com `turn_deadline < NOW()`, executa `defend` automático e emite `turn_auto` |
| Offline chars | 5 min | Para personagens com `autonomous_mode = 1` e sem atividade recente, chama `autonomousIntent` e emite `autonomous_action` |
| Market restock | 1 hora | Para mercados onde `TIMESTAMPDIFF(HOUR, last_restock, NOW()) >= restock_hours`, executa `restock` |
