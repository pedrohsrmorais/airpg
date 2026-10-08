# ⚔ AIRPG — Frontend

React 18 SPA com Vite, Socket.IO Client e tema dark fantasy.

---

## Sumário

- [Stack](#stack)
- [Instalação](#instalação)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Estrutura de Arquivos](#estrutura-de-arquivos)
- [Rotas](#rotas)
- [Páginas](#páginas)
- [Componentes](#componentes)
- [Context / Estado Global](#context--estado-global)
- [Serviços](#serviços)
- [Estilos](#estilos)
- [WebSocket](#websocket)

---

## Stack

| Tecnologia | Versão | Uso |
|---|---|---|
| React | 18 | UI |
| Vite | 5 | Build/dev server |
| React Router | 6 | Navegação SPA |
| Axios | 1 | HTTP client |
| Socket.IO Client | 4 | WebSocket em tempo real |
| Fontes | Google Fonts | Cinzel (títulos), Crimson Text (corpo) |

---

## Instalação

```bash
cd frontend
npm install
```

### Build para produção

```bash
npm run build
# Gera frontend/dist/ — servido automaticamente pelo backend em /
```

### Desenvolvimento com hot reload

```bash
npm run dev
# Acesse http://localhost:5173
# O backend deve estar rodando em http://localhost:3030
```

---

## Variáveis de Ambiente

Arquivo: `frontend/.env` (opcional)

| Variável | Padrão | Descrição |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3030/api` | URL base da API |

Se não definida, o `api.js` usa `/api` (relativo — funciona quando servido pelo backend).

---

## Estrutura de Arquivos

```
frontend/
├── index.html                  # Entry point HTML (carrega fontes Google)
├── vite.config.js              # Config Vite (proxy /api → :3030 em dev)
├── src/
│   ├── main.jsx                # ReactDOM.createRoot + BrowserRouter
│   ├── App.jsx                 # Roteamento + ProtectedRoute + PublicRoute
│   ├── context/
│   │   └── AuthContext.jsx     # JWT auth state (login, register, logout, me)
│   ├── services/
│   │   └── api.js              # Axios instance com base URL e interceptors
│   ├── components/
│   │   ├── Navbar.jsx          # Barra de navegação fixa com links e logout
│   │   └── LoadingScreen.jsx   # Tela de loading com animação de espada
│   ├── pages/
│   │   ├── LoginPage.jsx       # Login + registro com visual RPG cinematográfico
│   │   ├── CharacterSelectPage.jsx  # Seleção e criação de personagem
│   │   ├── DashboardPage.jsx   # Grid de personagens com criação inline
│   │   ├── CharacterPage.jsx   # Ficha completa: atributos, equipamentos, ações
│   │   ├── WorldPage.jsx       # Chat ao vivo com Socket.IO, combate, OOC
│   │   ├── InventoryPage.jsx   # Inventário com equip/drop + world pickup
│   │   └── MarketPage.jsx      # Compra/venda com tabs
│   └── styles/
│       ├── global.css          # Tokens CSS, reset, tipografia, scrollbar
│       ├── login.css           # Estilos exclusivos da tela de login
│       └── dashboard.css       # Cards de personagem, grid, formulário
```

---

## Rotas

Definidas em `App.jsx`:

| Path | Componente | Proteção | Descrição |
|---|---|---|---|
| `/login` | `LoginPage` | Público (redireciona se logado) | Login e cadastro |
| `/characters` | `CharacterSelectPage` | 🔒 Privado | Seleção e criação de personagem |
| `/dashboard` | `DashboardPage` | 🔒 Privado | Grid de todos os personagens |
| `/character/:id` | `CharacterPage` | 🔒 Privado | Ficha do personagem |
| `/world/:worldId` | `WorldPage` | 🔒 Privado | Mundo ao vivo (Socket.IO) |
| `/inventory/:characterId` | `InventoryPage` | 🔒 Privado | Inventário e equipamentos |
| `/market/:marketId` | `MarketPage` | 🔒 Privado | Mercado (compra/venda) |
| `*` | Redirect | — | Redireciona para `/characters` |

**ProtectedRoute**: redireciona para `/login` se não autenticado.  
**PublicRoute**: redireciona para `/characters` se já autenticado.

---

## Páginas

### `LoginPage.jsx`

Tela de entrada com visual cinematográfico de MMORPG.

**Features:**
- Background em camadas (névoa, partículas, ruínas, lua)
- 12 partículas de brasa animadas flutuando
- Logo SVG (escudo + espada) com pulso dourado
- Animação de entrada do card (`card-appear`)
- Dois modos: `login` e `register` (toggle animado)
- Validação de formulário com mensagens de erro estilizadas

**State:** `mode`, `email`, `password`, `username`, `error`, `loading`

**Após login bem-sucedido:** navega para `/characters`

---

### `CharacterSelectPage.jsx`

Tela de seleção de personagem — estilo tela de seleção de RPG.

**Features:**
- Cards de personagem com portrait, atributos e HP bar
- Botão de "Entrar no Mundo" por personagem
- Modal de criação de novo personagem com seleção de raça/classe
- Atributos configuráveis (FOR, DEX, CON, INT, SAB, CAR)

**State:** `characters`, `worlds`, `creating`, `form`, `loading`, `error`

**Após selecionar personagem:** navega para `/world/:worldId?character=:characterId`

---

### `DashboardPage.jsx`

Grade de todos os personagens do usuário.

**Features:**
- Card por personagem com HP bar, gold, raça/classe
- Badge "☠ Morto" para personagens com `is_alive = 0`
- Formulário inline de criação de personagem
- Click no card navega para `/character/:id`

**API calls:** `GET /characters`, `GET /worlds`, `POST /characters`

---

### `CharacterPage.jsx`

Ficha completa do personagem.

**Features:**
- Atributos com modificadores calculados (`floor((attr-10)/2)`)
- Itens equipados por slot
- HP bar animada
- Links para inventário, mundo e mercado

**API calls:** `GET /characters/:id`, `GET /characters/:id/inventory`

---

### `WorldPage.jsx`

Interface principal de jogo — tempo real via Socket.IO.

**Features:**
- Chat de eventos com cores por tipo de mensagem:
  - `system` (dourado) — alertas do sistema
  - `narration` (branco) — narração da IA
  - `declared` (azul aço) — ação declarada pelo jogador
  - `ooc` (marrom) — mensagens OOC privadas
  - `auto` (cinza) — turno automático
  - `error` (vermelho) — erros
  - `world` (muted) — eventos do mundo
- Sidebar com personagens próximos e botão "Atacar"
- Sidebar com regiões do mundo (ativa destacada)
- Inputs de ação e OOC visíveis apenas durante sessão ativa
- Badge "⚔ Em combate" durante sessão

**Socket events ouvidos:** `session_started`, `player_action_declared`, `turn_result`, `your_turn`, `turn_auto`, `session_ended`, `ooc_message`, `character_moved`, `autonomous_action`

**API calls:** `GET /worlds/:id`, `GET /characters/:id`, `GET /worlds/:id/nearby`, `POST /worlds/:id/interactions`, `POST /worlds/:id/interactions/:sid/turn`, `POST /worlds/:id/interactions/:sid/ooc`

---

### `InventoryPage.jsx`

Inventário completo com ações por item.

**Features:**
- Ícones por tipo (`weapon`, `armor`, `consumable`, etc.)
- Badge de raridade com cor (`common`, `uncommon`, `rare`, `epic`, `legendary`)
- Equip/Unequip com seleção de slot
- Drop (descarte) de item
- Formulário de world pickup (pegar objeto do cenário via IA)

**API calls:** `GET /characters/:id/inventory`, `PATCH /inventory/:itemId/equip`, `PATCH /inventory/:itemId/unequip`, `DELETE /inventory/:itemId`, `POST /characters/:id/pickup`

---

### `MarketPage.jsx`

Interface de comércio com duas abas.

**Features:**
- Aba Comprar: lista estoque com preço `base_value × buy_modifier`
- Aba Vender: lista inventário com preço `base_value × sell_modifier`
- Confirmação via `confirm()` antes de cada transação
- Gold atualizado em tempo real após transação
- Itens de quest (`is_quest_item`) ocultos na aba Vender

**API calls:** `GET /markets/:id`, `GET /characters/:id`, `GET /characters/:id/inventory`, `POST /markets/:id/buy`, `POST /markets/:id/sell`

---

## Componentes

### `Navbar.jsx`

Barra fixa no topo (60px de altura, `z-index: 100`).

**Props:** `character` (opcional) — exibe links de Mundo e Inventário se passado.

**Links exibidos:**
- Sempre: `⚔ AIRPG` (logo/home) → `/dashboard`
- Sempre: `Personagens` → `/dashboard`
- Com personagem: `Mundo` → `/world/:worldId`
- Com personagem: `Inventário` → `/inventory/:id`
- Sempre: username do usuário + botão "Sair"

### `LoadingScreen.jsx`

Tela de loading com espada animada. Exibida durante verificação de token JWT no boot.

---

## Context / Estado Global

### `AuthContext.jsx`

Provider em `App.jsx` que envolve toda a aplicação.

**State exposto via `useAuth()`:**

| Campo | Tipo | Descrição |
|---|---|---|
| `user` | `object \| null` | Dados do usuário (`id`, `email`, `username`, `role`) |
| `loading` | `boolean` | `true` enquanto verifica token JWT no boot |
| `login(email, pass)` | `async fn` | Chama `POST /auth/login`, salva token |
| `register(email, pass, username)` | `async fn` | Chama `POST /auth/register`, salva token |
| `logout()` | `fn` | Remove token, limpa state |

**Persistência:** Token salvo em `localStorage` sob a chave `airpg_token`.

---

## Serviços

### `api.js`

Instância Axios com:
- `baseURL`: `import.meta.env.VITE_API_URL` ou `/api`
- Header `Authorization: Bearer <token>` injetado automaticamente do `localStorage`
- Todas as requisições usam esta instância

---

## Estilos

### Design System (tokens CSS em `global.css`)

```css
--bg-darkest: #0a0804    /* fundo principal */
--bg-panel:   #231c14    /* painéis */
--bg-card:    #2e2418    /* cards */
--gold:       #c9a84c    /* cor principal dourada */
--gold-light: #e8cb7a    /* destaque dourado */
--gold-dark:  #8a6d28    /* dourado escuro */
--crimson:    #8b1a1a    /* vermelho sangue */
--text-main:  #e8dcc8    /* texto principal */
--text-dim:   #a09080    /* texto secundário */
--text-muted: #6a5a48    /* texto terciário */
--border:     #3d3020    /* bordas */
--border-gold:#6b521c    /* bordas douradas */
```

### Fontes

Carregadas via Google Fonts em `index.html`:
- **Cinzel** — títulos, labels, botões (display serif)
- **Crimson Text** — corpo, inputs, narrações (legibility serif)

### Animações chave

| Nome | Uso | Duração |
|---|---|---|
| `float-up` | Partículas de brasa na login | 6s infinito |
| `glow-pulse` | Logo SVG na login | 4s infinito |
| `card-appear` | Entrada do card de login | 0.6s |
| `sword-spin` | LoadingScreen | 1.5s infinito |

---

## WebSocket

Conexão em `WorldPage.jsx`:

```js
const sock = io({ auth: { token: localStorage.getItem('airpg_token') } });
sock.emit('join_world', { worldId, characterId });
sock.emit('join_session', { sessionId }); // durante combate
```

O servidor valida o token JWT na conexão. Canais:
- `world:<id>` — eventos públicos do mundo
- `session:<id>` — narração e ações do combate
- `session:<id>:ooc` — chat privado entre jogadores
