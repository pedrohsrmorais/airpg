'use strict';

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const path       = require('path');
const { Server } = require('socket.io');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');

const apiRoutes          = require('./src/routes/api.routes');
const { initSchedulers } = require('./src/services/scheduler');

// ── App ──────────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN || '*', credentials: true }
});

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })); // CSP off so SPA assets load
app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// Inject io into every request
app.use((req, _res, next) => { req.io = io; next(); });

// ── API ──────────────────────────────────────────────────────────────────────
app.use('/api', apiRoutes);

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date() }));

// ── Serve React SPA ──────────────────────────────────────────────────────────
const DIST = path.join(__dirname, '../frontend/dist');
app.use(express.static(DIST));
app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));

// ── Error handler ────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

// ── Socket.IO ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[ws] connected ${socket.id}`);

  socket.on('join_world', ({ worldId, characterId }) => {
    socket.join(`world:${worldId}`);
    socket.data = { ...socket.data, worldId, characterId };
  });

  socket.on('leave_world', ({ worldId }) => socket.leave(`world:${worldId}`));

  socket.on('join_session', ({ sessionId }) => {
    socket.join(`session:${sessionId}`);
    socket.join(`session:${sessionId}:ooc`);
  });

  socket.on('leave_session', ({ sessionId }) => {
    socket.leave(`session:${sessionId}`);
    socket.leave(`session:${sessionId}:ooc`);
  });

  socket.on('disconnect', () => console.log(`[ws] disconnected ${socket.id}`));
});

// ── Schedulers ───────────────────────────────────────────────────────────────
initSchedulers(io);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3030;
server.listen(PORT, () => {
  console.log(`\n⚔  AIRPG rodando em http://localhost:${PORT}\n`);
});

module.exports = { app, io };
