# ⚔ AIRPG — As Terras de Eldoria

RPG persistente multiplayer com narração por IA, sistema de loot, economia e combate por turnos.

---

## Estrutura

```
AIRPG/
├── backend/
│   ├── config/db.config.js       MySQL pool (root / alfaiate10 / airpg)
│   ├── data/items.json            Catálogo de 28 itens (referência do game designer)
│   ├── db/init.mysql              Schema + seed completo
│   ├── public/                    Assets estáticos (logo.svg, hero-bg.svg)
│   ├── src/
│   │   ├── controllers/           authController, characterController, interactionController,
│   │   │                          inventoryController, lootController, marketController,
│   │   │                          movementController, worldController, itemSeederController
│   │   ├── middlewares/
│   │   │   ├── auth.middleware.js   JWT Bearer token
│   │   │   └── user.middleware.js   Garante que o usuário acessa só seu personagem
│   │   ├── routes/api.routes.js
│   │   └── services/
│   │       ├── aiService.js         Anthropic SDK (parseIntent, narrate, validateWorldPickup)
│   │       ├── diceEngine.js        d20, vantagem/desvantagem, críticos
│   │       └── scheduler.js         Turn timeout (30min), offline chars, restock
│   ├── server.js                  Express + Socket.IO + serve React dist
│   ├── package.json
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── pages/                 LoginPage, DashboardPage, CharacterPage,
    │   │                          WorldPage, InventoryPage, MarketPage
    │   ├── components/            Navbar, LoadingScreen
    │   ├── context/AuthContext    JWT auth state
    │   └── services/api.js        Axios
    ├── index.html
    └── package.json
```

---

## Configuração do Banco de Dados

### Pré-requisitos
- MySQL 8.0+
- Usuário: `root`, Senha: `alfaiate10`

### Criar e popular o banco

```bash
mysql -u root -palfaiate10 < backend/db/init.mysql
```

Isso cria:
- Database `airpg`
- Todas as tabelas (users, worlds, regions, locations, characters, item_catalog, markets, market_stock, transactions, loot_events, interaction_sessions, etc.)
- Seed: usuário admin, mundo "As Terras de Eldoria", 3 regiões, 6 localizações, 2 mercados

### Seed de itens

Após o servidor estar rodando:
```bash
curl -X POST http://localhost:3030/api/admin/seed-items \
  -H "Authorization: Bearer <token_admin>"
```

Ou via frontend: faça login como admin e chame o endpoint.

---

## Instalação

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Edite .env: ANTHROPIC_API_KEY=sk-ant-...
npm start
```

### Frontend

```bash
cd frontend
npm install
npm run build
```

O `dist/` gerado é servido automaticamente pelo backend em `/`.

### Desenvolvimento (frontend com hot reload)

```bash
# Terminal 1
cd backend && npm start

# Terminal 2
cd frontend && npm run dev
# Acesse http://localhost:5173
```

---

## Variáveis de Ambiente (backend/.env)

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3030` | Porta do servidor |
| `DB_HOST` | `127.0.0.1` | Host do MySQL |
| `DB_USER` | `root` | Usuário MySQL |
| `DB_PASSWORD` | `alfaiate10` | Senha MySQL |
| `DB_NAME` | `airpg` | Nome do banco |
| `JWT_SECRET` | `airpg_secret_change_me` | **Mude em produção!** |
| `JWT_EXPIRES` | `7d` | Expiração do token |
| `ANTHROPIC_API_KEY` | — | Chave da API Anthropic |
| `AI_MODEL` | `claude-opus-4-5` | Modelo da IA |
| `CLIENT_ORIGIN` | `*` | Origin do frontend (CORS) |

---

## Usuário Admin (pré-seed)

| Campo | Valor |
|---|---|
| Email | `admin@intellsn.com.br` |
| Senha | `admin123` |
| Role | `admin` |

---

## API — Endpoints principais

### Auth
| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/auth/register` | Cadastrar usuário |
| POST | `/api/auth/login` | Login, retorna JWT |
| GET  | `/api/auth/me` | Dados do usuário logado |

### Personagens
| Método | Rota | Descrição |
|---|---|---|
| GET  | `/api/characters` | Listar meus personagens |
| POST | `/api/characters` | Criar personagem |
| GET  | `/api/characters/:id` | Ficha completa |
| POST | `/api/characters/:id/move` | Mover para localização |
| POST | `/api/characters/:id/loot` | Evento de loot |
| POST | `/api/characters/:id/pickup` | Guardar objeto do mundo |

### Inventário
| Método | Rota |
|---|---|
| GET    | `/api/characters/:id/inventory` |
| PATCH  | `/api/characters/:id/inventory/:itemId/equip` |
| DELETE | `/api/characters/:id/inventory/:itemId` |

### Mercado
| Método | Rota |
|---|---|
| GET  | `/api/markets/:marketId` |
| POST | `/api/markets/:marketId/buy` |
| POST | `/api/markets/:marketId/sell` |

### Interações (Combate / Diálogo)
| Método | Rota |
|---|---|
| POST | `/api/worlds/:wId/interactions` |
| POST | `/api/worlds/:wId/interactions/:sId/turn` |
| POST | `/api/worlds/:wId/interactions/:sId/ooc` |
| POST | `/api/worlds/:wId/interactions/:sId/end` |

---

## WebSocket — Canais

| Canal | Propósito |
|---|---|
| `world:<worldId>` | Eventos públicos do mundo |
| `session:<id>` | DM narra; jogadores veem ações uns dos outros |
| `session:<id>:ooc` | Chat privado entre jogadores (DM não vê) |

---

## Sistema de Loot

Cada item no `item_catalog` tem:
- `drop_chance` — chance percentual de aparecer em um loot
- `market_chance` — chance percentual de aparecer em mercados no restock
- `drop_contexts` — array de contextos válidos (`chest`, `corpse`, `pickpocket`, `search`)
- `sell_modifier` — multiplicador do preço base ao VENDER (default 0.50 → metade do preço)
- `buy_modifier` — multiplicador do preço base ao COMPRAR (2.00 para itens mágicos)

Itens com `is_world_item = 1` são criados pelo jogador ao pegar objetos do cenário e não aparecem em mercados.

---

## Tecnologias

- **Backend**: Node.js, Express, Socket.IO, MySQL2, JWT, bcryptjs
- **IA**: Anthropic SDK (claude-opus-4-5)
- **Frontend**: React 18, Vite, React Router, Socket.IO Client, Axios
- **Fontes**: Cinzel (títulos), Crimson Text (corpo)
