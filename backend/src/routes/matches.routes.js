const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

function getLockMinutes() {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get('lock_minutes_before_kickoff');
  return row ? parseInt(row.value, 10) : 60;
}

function isLocked(kickoffAtUtc) {
  const lockMinutes = getLockMinutes();
  const lockAt = new Date(kickoffAtUtc).getTime() - lockMinutes * 60 * 1000;
  return Date.now() >= lockAt;
}

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM matches ORDER BY num').all();
  res.json(
    rows.map((m) => ({
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
      locked: isLocked(m.kickoff_at_utc),
    }))
  );
});

module.exports = { router, isLocked, getLockMinutes };
