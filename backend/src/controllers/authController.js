'use strict';

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const db     = require('../../config/db.config');

const JWT_SECRET  = process.env.JWT_SECRET  || 'airpg_secret_change_me';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';
const SALT_ROUNDS = 12;

// POST /auth/register
async function register(req, res, next) {
  try {
    const { email, password, username } = req.body;
    if (!email || !password || !username) {
      return res.status(400).json({ error: 'email, password e username são obrigatórios.' });
    }

    const [[existing]] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ error: 'E-mail já cadastrado.' });

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const [result] = await db.execute(
      'INSERT INTO users (email, password_hash, username) VALUES (?, ?, ?)',
      [email, hash, username]
    );

    const token = jwt.sign(
      { id: result.insertId, email, role: 'player' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.status(201).json({
      token,
      user: { id: result.insertId, email, username, role: 'player' }
    });
  } catch (err) {
    next(err);
  }
}

// POST /auth/login
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email e password são obrigatórios.' });
    }

    const [[user]] = await db.execute(
      'SELECT id, email, username, password_hash, role FROM users WHERE email = ?',
      [email]
    );

    if (!user) return res.status(401).json({ error: 'Credenciais inválidas.' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Credenciais inválidas.' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, username: user.username, role: user.role }
    });
  } catch (err) {
    next(err);
  }
}

// GET /auth/me
async function me(req, res, next) {
  try {
    const [[user]] = await db.execute(
      'SELECT id, email, username, role, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json(user);
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, me };
