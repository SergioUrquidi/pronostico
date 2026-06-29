const express = require('express');
const { client } = require('../db');
const { requireAuth } = require('../auth');
const { syncResults, getSyncStatus } = require('../sync-results');

const router = express.Router();

async function getLockMinutes() {
  const { rows } = await client.execute({
    sql: 'SELECT value FROM config WHERE key = ?',
    args: ['lock_minutes_before_kickoff'],
  });
  return rows[0] ? parseInt(rows[0].value, 10) : 10;
}

async function isLocked(kickoffAtUtc) {
  const lockMinutes = await getLockMinutes();
  const kickoffMs = new Date(kickoffAtUtc).getTime();
  if (isNaN(kickoffMs)) return true; // falla-segura: fecha inválida → bloqueado
  return Date.now() >= kickoffMs - lockMinutes * 60 * 1000;
}

router.get('/', requireAuth, async (req, res) => {
  // Passive sync: if more than 2 minutes since last sync, trigger in background
  const { lastSync } = getSyncStatus();
  const twoMinutes = 2 * 60 * 1000;
  if (!lastSync || Date.now() - lastSync.getTime() > twoMinutes) {
    syncResults(client).catch(() => {});
  }

  const { rows } = await client.execute('SELECT * FROM matches ORDER BY num');
  const lockMinutes = await getLockMinutes();
  const now = Date.now();

  res.json(
    rows.map((m) => {
      const kickoffMs = new Date(m.kickoff_at_utc).getTime();
      const lockAt = isNaN(kickoffMs) ? 0 : kickoffMs - lockMinutes * 60 * 1000;
      return {
        id: m.id,
        num: m.num,
        phase: m.phase,
        group: m.group_name,
        home: m.home,
        away: m.away,
        stadium: m.stadium,
        dateLocal: m.date_local,
        timeLocal: m.time_local,
        kickoffAtUtc: m.kickoff_at_utc,
        homeScore: m.home_score,
        awayScore: m.away_score,
        advanceWinner: m.advance_winner ?? null,
        locked: now >= lockAt,
      };
    })
  );
});

module.exports = { router, isLocked, getLockMinutes };
