const express = require('express');
const bcrypt = require('bcryptjs');
const { client } = require('../db');
const { signToken, requireAuth } = require('../auth');

const router = express.Router();

// Rate limit: max 10 intentos de login por IP cada 15 minutos
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX = 10;

function checkLoginRateLimit(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const attempts = (loginAttempts.get(ip) || []).filter((t) => t > now - LOGIN_WINDOW_MS);
  if (attempts.length >= LOGIN_MAX) {
    return res.status(429).json({ error: 'Demasiados intentos. Esperá 15 minutos.' });
  }
  attempts.push(now);
  loginAttempts.set(ip, attempts);
  next();
}

router.post('/login', checkLoginRateLimit, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y clave son requeridos' });
  }

  const { rows } = await client.execute({
    sql: 'SELECT * FROM users WHERE username = ?',
    args: [username.trim().toLowerCase()],
  });
  const user = rows[0];
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Usuario o clave incorrectos' });
  }

  res.json({
    token: signToken(user),
    user: {
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      mustChangePassword: !!user.must_change_password,
    },
  });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'La nueva clave debe tener al menos 4 caracteres' });
  }

  const { rows } = await client.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [req.user.sub] });
  const user = rows[0];
  if (!user || !bcrypt.compareSync(currentPassword || '', user.password_hash)) {
    return res.status(401).json({ error: 'Clave actual incorrecta' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  await client.execute({
    sql: 'UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?',
    args: [newHash, user.id],
  });

  const updated = { ...user, password_hash: newHash, must_change_password: 0 };
  res.json({ token: signToken(updated) });
});

module.exports = router;
