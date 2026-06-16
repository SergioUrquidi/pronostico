const express = require('express');
const { client } = require('../db');
const { requireAuth } = require('../auth');
const { calcScore } = require('../scoring');

const router = express.Router();

router.get('/', requireAuth, async (_req, res) => {
  const { rows: users } = await client.execute("SELECT id, username, display_name FROM users WHERE role = 'player'");
  const { rows: matches } = await client.execute('SELECT id, home_score, away_score FROM matches');
  const { rows: predictions } = await client.execute('SELECT user_id, match_id, home_pred, away_pred FROM predictions');

  const predByUserMatch = {};
  for (const p of predictions) {
    predByUserMatch[`${p.user_id}_${p.match_id}`] = p;
  }

  const board = users.map((u) => {
    let points = 0;
    let exact = 0;
    let sign = 0;
    for (const m of matches) {
      const pred = predByUserMatch[`${u.id}_${m.id}`];
      const score = pred ? calcScore(pred.home_pred, pred.away_pred, m.home_score, m.away_score) : 0;
      points += score;
      if (score === 4) exact++;
      if (score === 2) sign++;
    }
    return { username: u.username, displayName: u.display_name, points, exact, sign };
  });

  board.sort((a, b) => b.points - a.points);
  res.json(board);
});

module.exports = router;
