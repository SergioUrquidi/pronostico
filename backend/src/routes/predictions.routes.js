const express = require('express');
const { client } = require('../db');
const { requireAuth } = require('../auth');
const { isLocked } = require('./matches.routes');

const router = express.Router();

const KNOCKOUT_PHASES = new Set(['Dieciseisavos', 'Octavos', 'Cuartos', 'Semifinal', 'TercerPuesto', 'Final']);

router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await client.execute({
    sql: 'SELECT match_id, home_pred, away_pred, advance_pred FROM predictions WHERE user_id = ?',
    args: [req.user.sub],
  });
  const byMatch = {};
  for (const r of rows) {
    byMatch[r.match_id] = { home: r.home_pred, away: r.away_pred, advance: r.advance_pred ?? null };
  }
  res.json(byMatch);
});

router.get('/all', requireAuth, async (_req, res) => {
  const { rows: matches } = await client.execute('SELECT id, kickoff_at_utc, home_score FROM matches');
  const lockedFlags = await Promise.all(matches.map((m) => isLocked(m.kickoff_at_utc)));
  const lockedMatchIds = new Set(
    matches.filter((m, i) => lockedFlags[i] || m.home_score !== null).map((m) => m.id)
  );

  const { rows } = await client.execute(
    `SELECT p.match_id, p.home_pred, p.away_pred, p.advance_pred, u.username, u.display_name
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
      advance: r.advance_pred ?? null,
    };
  }
  res.json(byMatch);
});

router.put('/:matchId', requireAuth, async (req, res) => {
  const { matchId } = req.params;
  const { home, away, advance } = req.body || {};

  const homeN = Number(home);
  const awayN = Number(away);
  if (!Number.isInteger(homeN) || !Number.isInteger(awayN) || homeN < 0 || awayN < 0) {
    return res.status(400).json({ error: 'Resultado invalido' });
  }

  const { rows } = await client.execute({ sql: 'SELECT * FROM matches WHERE id = ?', args: [matchId] });
  const match = rows[0];
  if (!match) return res.status(404).json({ error: 'Partido no encontrado' });

  if (match.home_score !== null || await isLocked(match.kickoff_at_utc)) {
    return res.status(403).json({ error: 'El partido ya esta bloqueado, no se puede pronosticar' });
  }

  // Validate advance_pred only for knockout phases
  let advancePred = null;
  if (KNOCKOUT_PHASES.has(match.phase)) {
    if (advance !== null && advance !== undefined && advance !== '') {
      if (advance !== 'home' && advance !== 'away') {
        return res.status(400).json({ error: 'advance_pred debe ser home o away' });
      }
      advancePred = advance;
    }
  }

  await client.execute({
    sql: `INSERT INTO predictions (user_id, match_id, home_pred, away_pred, advance_pred, updated_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(user_id, match_id) DO UPDATE SET
            home_pred = excluded.home_pred,
            away_pred = excluded.away_pred,
            advance_pred = excluded.advance_pred,
            updated_at = datetime('now')`,
    args: [req.user.sub, matchId, homeN, awayN, advancePred],
  });

  res.json({ ok: true });
});

// Group-stage advance predictions: which 2 teams advance from each group
router.get('/groups', requireAuth, async (req, res) => {
  const { rows } = await client.execute({
    sql: 'SELECT group_name, team FROM group_advance_preds WHERE user_id = ?',
    args: [req.user.sub],
  });
  const byGroup = {};
  for (const r of rows) {
    if (!byGroup[r.group_name]) byGroup[r.group_name] = [];
    byGroup[r.group_name].push(r.team);
  }
  res.json(byGroup);
});

router.put('/groups/:group', requireAuth, async (req, res) => {
  const { group } = req.params;
  const { teams } = req.body || {};

  if (!Array.isArray(teams) || teams.length !== 2 || teams.some((t) => typeof t !== 'string' || !t.trim())) {
    return res.status(400).json({ error: 'Debes indicar exactamente 2 equipos' });
  }

  const [team1, team2] = teams.map((t) => t.trim().toUpperCase());

  // Replace the 2 predictions for this user+group atomically
  await client.batch(
    [
      {
        sql: 'DELETE FROM group_advance_preds WHERE user_id = ? AND group_name = ?',
        args: [req.user.sub, group],
      },
      {
        sql: 'INSERT INTO group_advance_preds (user_id, group_name, team) VALUES (?, ?, ?)',
        args: [req.user.sub, group, team1],
      },
      {
        sql: 'INSERT INTO group_advance_preds (user_id, group_name, team) VALUES (?, ?, ?)',
        args: [req.user.sub, group, team2],
      },
    ],
    'write'
  );

  res.json({ ok: true });
});

module.exports = router;
