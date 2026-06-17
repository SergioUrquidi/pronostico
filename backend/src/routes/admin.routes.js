const express = require('express');
const { client } = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { seedHistoricalData } = require('../seed-historical');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.put('/matches/:id/result', async (req, res) => {
  const { id } = req.params;
  const { home, away, advanceWinner } = req.body || {};

  const { rows } = await client.execute({ sql: 'SELECT id, phase FROM matches WHERE id = ?', args: [id] });
  if (!rows[0]) return res.status(404).json({ error: 'Partido no encontrado' });

  if (home === null && away === null) {
    await client.execute({
      sql: 'UPDATE matches SET home_score = NULL, away_score = NULL, advance_winner = NULL WHERE id = ?',
      args: [id],
    });
    return res.json({ ok: true });
  }

  const homeN = Number(home);
  const awayN = Number(away);
  if (!Number.isInteger(homeN) || !Number.isInteger(awayN) || homeN < 0 || awayN < 0) {
    return res.status(400).json({ error: 'Resultado invalido' });
  }

  // advance_winner is only relevant for knockout matches ending in a draw (penalties)
  let advWinner = null;
  if (advanceWinner === 'home' || advanceWinner === 'away') {
    advWinner = advanceWinner;
  }

  await client.execute({
    sql: 'UPDATE matches SET home_score = ?, away_score = ?, advance_winner = ? WHERE id = ?',
    args: [homeN, awayN, advWinner, id],
  });
  res.json({ ok: true });
});

router.put('/matches/:id/teams', async (req, res) => {
  const { id } = req.params;
  const { home, away } = req.body || {};
  if (!home || !away) return res.status(400).json({ error: 'Equipos requeridos' });

  const { rows } = await client.execute({ sql: 'SELECT id FROM matches WHERE id = ?', args: [id] });
  if (!rows[0]) return res.status(404).json({ error: 'Partido no encontrado' });

  await client.execute({
    sql: 'UPDATE matches SET home = ?, away = ? WHERE id = ?',
    args: [home.toUpperCase(), away.toUpperCase(), id],
  });
  res.json({ ok: true });
});

router.put('/predictions/:matchId/:username', async (req, res) => {
  const { matchId, username } = req.params;
  const { home, away, advance } = req.body || {};
  const homeN = Number(home);
  const awayN = Number(away);
  if (!Number.isInteger(homeN) || !Number.isInteger(awayN) || homeN < 0 || awayN < 0) {
    return res.status(400).json({ error: 'Pronostico invalido' });
  }

  const { rows: matchRows } = await client.execute({ sql: 'SELECT id, phase FROM matches WHERE id = ?', args: [matchId] });
  if (!matchRows[0]) return res.status(404).json({ error: 'Partido no encontrado' });

  const { rows: userRows } = await client.execute({
    sql: "SELECT id FROM users WHERE username = ? AND role = 'player'",
    args: [username],
  });
  const user = userRows[0];
  if (!user) return res.status(404).json({ error: 'Jugador no encontrado' });

  const advancePred = (advance === 'home' || advance === 'away') ? advance : null;

  await client.execute({
    sql: `INSERT INTO predictions (user_id, match_id, home_pred, away_pred, advance_pred, updated_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(user_id, match_id) DO UPDATE SET
            home_pred = excluded.home_pred,
            away_pred = excluded.away_pred,
            advance_pred = excluded.advance_pred,
            updated_at = datetime('now')`,
    args: [user.id, matchId, homeN, awayN, advancePred],
  });

  res.json({ ok: true });
});

router.get('/config', async (_req, res) => {
  const { rows } = await client.execute({
    sql: 'SELECT value FROM config WHERE key = ?',
    args: ['lock_minutes_before_kickoff'],
  });
  res.json({ lockMinutesBeforeKickoff: rows[0] ? parseInt(rows[0].value, 10) : 60 });
});

router.put('/config', async (req, res) => {
  const { lockMinutesBeforeKickoff } = req.body || {};
  const n = Number(lockMinutesBeforeKickoff);
  if (!Number.isInteger(n) || n < 0) return res.status(400).json({ error: 'Valor invalido' });

  await client.execute({
    sql: `INSERT INTO config (key, value) VALUES ('lock_minutes_before_kickoff', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [String(n)],
  });
  res.json({ ok: true });
});

// Get all player predictions for a specific match (admin only)
router.get('/predictions/match/:matchId', async (req, res) => {
  const { matchId } = req.params;
  const { rows } = await client.execute({
    sql: `SELECT u.username, u.display_name, p.home_pred, p.away_pred, p.advance_pred
          FROM users u
          LEFT JOIN predictions p ON p.user_id = u.id AND p.match_id = ?
          WHERE u.role = 'player'
          ORDER BY u.display_name`,
    args: [matchId],
  });
  res.json(
    rows.map((r) => ({
      username: r.username,
      displayName: r.display_name,
      home: r.home_pred ?? null,
      away: r.away_pred ?? null,
      advance: r.advance_pred ?? null,
    }))
  );
});

// One-time historical data seed — clears the guard key first so it always re-runs
router.post('/seed-historical', async (_req, res) => {
  try {
    await client.execute("DELETE FROM config WHERE key = 'historical_seed_v1'");
    await seedHistoricalData(client);
    res.json({ ok: true, message: 'Datos historicos importados correctamente' });
  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).json({ error: String(err.message) });
  }
});

module.exports = router;
