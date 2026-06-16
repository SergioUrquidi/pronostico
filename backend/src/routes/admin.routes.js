const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.put('/matches/:id/result', (req, res) => {
  const { id } = req.params;
  const { home, away } = req.body || {};

  const match = db.prepare('SELECT id FROM matches WHERE id = ?').get(id);
  if (!match) return res.status(404).json({ error: 'Partido no encontrado' });

  if (home === null && away === null) {
    db.prepare('UPDATE matches SET home_score = NULL, away_score = NULL WHERE id = ?').run(id);
    return res.json({ ok: true });
  }

  const homeN = Number(home);
  const awayN = Number(away);
  if (!Number.isInteger(homeN) || !Number.isInteger(awayN) || homeN < 0 || awayN < 0) {
    return res.status(400).json({ error: 'Resultado invalido' });
  }

  db.prepare('UPDATE matches SET home_score = ?, away_score = ? WHERE id = ?').run(homeN, awayN, id);
  res.json({ ok: true });
});

router.put('/matches/:id/teams', (req, res) => {
  const { id } = req.params;
  const { home, away } = req.body || {};
  if (!home || !away) return res.status(400).json({ error: 'Equipos requeridos' });

  const match = db.prepare('SELECT id FROM matches WHERE id = ?').get(id);
  if (!match) return res.status(404).json({ error: 'Partido no encontrado' });

  db.prepare('UPDATE matches SET home = ?, away = ? WHERE id = ?').run(home.toUpperCase(), away.toUpperCase(), id);
  res.json({ ok: true });
});

router.put('/predictions/:matchId/:username', (req, res) => {
  const { matchId, username } = req.params;
  const { home, away } = req.body || {};
  const homeN = Number(home);
  const awayN = Number(away);
  if (!Number.isInteger(homeN) || !Number.isInteger(awayN) || homeN < 0 || awayN < 0) {
    return res.status(400).json({ error: 'Pronostico invalido' });
  }

  const match = db.prepare('SELECT id FROM matches WHERE id = ?').get(matchId);
  if (!match) return res.status(404).json({ error: 'Partido no encontrado' });

  const user = db.prepare("SELECT id FROM users WHERE username = ? AND role = 'player'").get(username);
  if (!user) return res.status(404).json({ error: 'Jugador no encontrado' });

  db.prepare(`
    INSERT INTO predictions (user_id, match_id, home_pred, away_pred, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, match_id) DO UPDATE SET
      home_pred = excluded.home_pred,
      away_pred = excluded.away_pred,
      updated_at = datetime('now')
  `).run(user.id, matchId, homeN, awayN);

  res.json({ ok: true });
});

router.get('/config', (_req, res) => {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get('lock_minutes_before_kickoff');
  res.json({ lockMinutesBeforeKickoff: row ? parseInt(row.value, 10) : 60 });
});

router.put('/config', (req, res) => {
  const { lockMinutesBeforeKickoff } = req.body || {};
  const n = Number(lockMinutesBeforeKickoff);
  if (!Number.isInteger(n) || n < 0) return res.status(400).json({ error: 'Valor invalido' });

  db.prepare(`
    INSERT INTO config (key, value) VALUES ('lock_minutes_before_kickoff', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(n));
  res.json({ ok: true });
});

module.exports = router;
