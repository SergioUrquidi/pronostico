const express = require('express');
const { client } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

async function getLockMinutes() {
  const { rows } = await client.execute({
    sql: 'SELECT value FROM config WHERE key = ?',
    args: ['lock_minutes_before_kickoff'],
  });
  return rows[0] ? parseInt(rows[0].value, 10) : 60;
}

async function isLocked(kickoffAtUtc) {
  const lockMinutes = await getLockMinutes();
  const lockAt = new Date(kickoffAtUtc).getTime() - lockMinutes * 60 * 1000;
  return Date.now() >= lockAt;
}

router.get('/', requireAuth, async (req, res) => {
  const { rows } = await client.execute('SELECT * FROM matches ORDER BY num');
  const lockMinutes = await getLockMinutes();
  const now = Date.now();

  res.json(
    rows.map((m) => {
      const lockAt = new Date(m.kickoff_at_utc).getTime() - lockMinutes * 60 * 1000;
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
        locked: now >= lockAt,
      };
    })
  );
});

module.exports = { router, isLocked, getLockMinutes };
