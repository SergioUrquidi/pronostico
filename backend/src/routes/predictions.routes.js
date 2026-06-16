const express = require('express');
const { client } = require('../db');
const { requireAuth } = require('../auth');
const { isLocked } = require('./matches.routes');

const router = express.Router();

router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await client.execute({
    sql: 'SELECT match_id, home_pred, away_pred FROM predictions WHERE user_id = ?',
    args: [req.user.sub],
  });
  const byMatch = {};
  for (const r of rows) byMatch[r.match_id] = { home: r.home_pred, away: r.away_pred };
  res.json(byMatch);
});

router.get('/all', requireAuth, async (_req, res) => {
  const { rows: matches } = await client.execute('SELECT id, kickoff_at_utc FROM matches');
  const lockedFlags = await Promise.all(matches.map((m) => isLocked(m.kickoff_at_utc)));
  const lockedMatchIds = new Set(matches.filter((_, i) => lockedFlags[i]).map((m) => m.id));

  const { rows } = await client.execute(
    `SELECT p.match_id, p.home_pred, p.away_pred, u.username, u.display_name
     FROM predictions p JOIN users u ON u.id = p.user_id
     WHERE u.role = 'player'`
  );

  const byMatch = {};
  for (const r of rows) {
    if (!lockedMatchIds.has(r.match_id)) continue;
    if (!byMatch[r.match_id]) byMatch[r.match_id] = {};
    byMatch[r.match_id][r.username] = {
      displayName: r.display_name,
      home: r.home_pred,
      away: r.away_pred,
    };
  }
  res.json(byMatch);
});

router.put('/:matchId', requireAuth, async (req, res) => {
  const { matchId } = req.params;
  const { home, away } = req.body || {};

  const homeN = Number(home);
  const awayN = Number(away);
  if (!Number.isInteger(homeN) || !Number.isInteger(awayN) || homeN < 0 || awayN < 0) {
    return res.status(400).json({ error: 'Resultado invalido' });
  }

  const { rows } = await client.execute({ sql: 'SELECT * FROM matches WHERE id = ?', args: [matchId] });
  const match = rows[0];
  if (!match) return res.status(404).json({ error: 'Partido no encontrado' });

  if (await isLocked(match.kickoff_at_utc)) {
    return res.status(403).json({ error: 'El partido ya esta bloqueado, no se puede pronosticar' });
  }

  await client.execute({
    sql: `INSERT INTO predictions (user_id, match_id, home_pred, away_pred, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(user_id, match_id) DO UPDATE SET
            home_pred = excluded.home_pred,
            away_pred = excluded.away_pred,
            updated_at = datetime('now')`,
    args: [req.user.sub, matchId, homeN, awayN],
  });

  res.json({ ok: true });
});

module.exports = router;
