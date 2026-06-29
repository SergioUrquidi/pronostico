const express = require('express');
const { client } = require('../db');

const router = express.Router();

function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || key !== process.env.WHATSAPP_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Partidos en las proximas 2h con jugadores que no pronosticaron
router.get('/upcoming', requireApiKey, async (_req, res) => {
  try {
    const nowUtc = new Date().toISOString();
    const in2h = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const { rows: matches } = await client.execute({
      sql: `SELECT id, home, away, kickoff_at_utc, phase, time_local
            FROM matches
            WHERE kickoff_at_utc > ? AND kickoff_at_utc <= ?
              AND home IS NOT NULL AND away IS NOT NULL
              AND home_score IS NULL AND away_score IS NULL
            ORDER BY kickoff_at_utc`,
      args: [nowUtc, in2h],
    });

    if (matches.length === 0) return res.json({ matches: [] });

    const { rows: allPlayers } = await client.execute(
      `SELECT id, display_name FROM users WHERE role = 'player'`
    );

    const result = [];
    for (const match of matches) {
      const { rows: predicted } = await client.execute({
        sql: `SELECT user_id FROM predictions WHERE match_id = ?`,
        args: [match.id],
      });
      const predictedIds = new Set(predicted.map((p) => p.user_id));
      const missing = allPlayers
        .filter((p) => !predictedIds.has(p.id))
        .map((p) => p.display_name);
      result.push({ ...match, missing });
    }

    res.json({ matches: result });
  } catch (err) {
    console.error('[notifications] Error /upcoming:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Partidos de hoy (UTC)
router.get('/today', requireApiKey, async (_req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setUTCHours(23, 59, 59, 999);

    const { rows: matches } = await client.execute({
      sql: `SELECT home, away, kickoff_at_utc, time_local, phase
            FROM matches
            WHERE kickoff_at_utc >= ? AND kickoff_at_utc <= ?
              AND home IS NOT NULL AND away IS NOT NULL
            ORDER BY kickoff_at_utc`,
      args: [startOfDay.toISOString(), endOfDay.toISOString()],
    });

    res.json({ matches });
  } catch (err) {
    console.error('[notifications] Error /today:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
