const express = require('express');
const { client } = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { seedHistoricalData } = require('../seed-historical');
const { syncResults, getSyncStatus } = require('../sync-results');

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

// Force immediate sync from external API
router.post('/sync-results', async (_req, res) => {
  try {
    await syncResults(client);
    res.json({ ok: true, ...getSyncStatus() });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

// Sync status
router.get('/sync-status', (_req, res) => {
  res.json(getSyncStatus());
});

// Audit: predictions updated after a given UTC datetime (format: '2026-06-29 16:50:00')
router.get('/audit/recent-predictions', async (req, res) => {
  const since = req.query.since || '2026-01-01 00:00:00';
  const { rows } = await client.execute({
    sql: `SELECT p.updated_at, u.username, u.display_name,
                 m.id as match_id, m.kickoff_at_utc,
                 p.home_pred, p.away_pred
          FROM predictions p
          JOIN users u ON p.user_id = u.id
          JOIN matches m ON p.match_id = m.id
          WHERE p.updated_at > ?
          ORDER BY p.updated_at DESC`,
    args: [since],
  });
  res.json(rows);
});

// One-time historical data seed — clears the guard key first so it always re-runs
router.post('/seed-historical', async (_req, res) => {
  try {
    await client.execute("DELETE FROM config WHERE key LIKE 'historical_seed_%'");
    await seedHistoricalData(client);
    res.json({ ok: true, message: 'Datos historicos importados correctamente' });
  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).json({ error: String(err.message) });
  }
});

// Poblar Dieciseisavos y avanzar clasificados en toda la eliminatoria
router.post('/populate-bracket', async (_req, res) => {
  try {
    const { populateBracket, populateKnockoutRounds } = require('../utils/bracket-populator');
    const r32 = await populateBracket(client);
    const knockout = await populateKnockoutRounds(client);
    res.json({ r32, knockout });
  } catch (err) {
    console.error('[bracket] Error al poblar bracket:', err);
    res.status(500).json({ error: String(err.message) });
  }
});

// Todas las predicciones de un jugador específico
router.get('/predictions/player/:username', async (req, res) => {
  const { username } = req.params;
  const { rows: userRows } = await client.execute({
    sql: "SELECT id, display_name FROM users WHERE username = ? AND role = 'player'",
    args: [username],
  });
  if (!userRows[0]) return res.status(404).json({ error: 'Jugador no encontrado' });

  const { rows } = await client.execute({
    sql: `SELECT p.match_id, p.home_pred, p.away_pred,
                 m.home, m.away, m.date_local, m.time_local, m.phase, m.group_name
          FROM predictions p
          JOIN matches m ON m.id = p.match_id
          WHERE p.user_id = ?
          ORDER BY m.num`,
    args: [userRows[0].id],
  });

  res.json({
    username,
    displayName: userRows[0].display_name,
    predictions: rows.map(r => ({
      matchId: r.match_id,
      home: r.home,
      away: r.away,
      dateLocal: r.date_local,
      timeLocal: r.time_local,
      phase: r.phase,
      group: r.group_name,
      homePred: r.home_pred,
      awayPred: r.away_pred,
    })),
  });
});

// Guardar numero de WhatsApp de un jugador (sin + ni espacios, ej: 59172003024)
router.put('/users/:username/wa-number', async (req, res) => {
  const { username } = req.params;
  const { waNumber } = req.body || {};
  if (!waNumber || !/^\d{10,15}$/.test(waNumber)) {
    return res.status(400).json({ error: 'waNumber invalido — incluir codigo de pais, sin + (ej: 59172003024)' });
  }
  const { rows } = await client.execute({
    sql: "SELECT id FROM users WHERE username = ? AND role = 'player'",
    args: [username],
  });
  if (!rows[0]) return res.status(404).json({ error: 'Jugador no encontrado' });

  await client.execute({
    sql: 'UPDATE users SET wa_number = ? WHERE username = ?',
    args: [waNumber, username],
  });
  res.json({ ok: true });
});

// Ver todos los jugadores con su wa_number
router.get('/users/wa-numbers', async (_req, res) => {
  const { rows } = await client.execute(
    "SELECT username, display_name, wa_number FROM users WHERE role = 'player' ORDER BY display_name"
  );
  res.json(rows.map((r) => ({ username: r.username, name: r.display_name, waNumber: r.wa_number })));
});

module.exports = router;
