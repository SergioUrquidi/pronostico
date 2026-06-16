const express = require('express');
const { client } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

router.get('/', requireAuth, async (_req, res) => {
  const { rows: matches } = await client.execute(
    `SELECT group_name, home, away, home_score, away_score
     FROM matches
     WHERE phase = 'Grupos'`
  );

  const groups = {};

  for (const m of matches) {
    if (!groups[m.group_name]) groups[m.group_name] = {};
    for (const team of [m.home, m.away]) {
      if (team && !groups[m.group_name][team]) {
        groups[m.group_name][team] = { team, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, dg: 0, pts: 0 };
      }
    }
  }

  for (const m of matches) {
    if (m.home_score === null || m.away_score === null) continue;
    const homeRow = groups[m.group_name][m.home];
    const awayRow = groups[m.group_name][m.away];
    if (!homeRow || !awayRow) continue;

    homeRow.pj++;
    awayRow.pj++;
    homeRow.gf += m.home_score;
    homeRow.gc += m.away_score;
    awayRow.gf += m.away_score;
    awayRow.gc += m.home_score;

    if (m.home_score > m.away_score) {
      homeRow.g++;
      homeRow.pts += 3;
      awayRow.p++;
    } else if (m.home_score < m.away_score) {
      awayRow.g++;
      awayRow.pts += 3;
      homeRow.p++;
    } else {
      homeRow.e++;
      awayRow.e++;
      homeRow.pts++;
      awayRow.pts++;
    }
  }

  const result = {};
  for (const [group, teamsMap] of Object.entries(groups)) {
    const rows = Object.values(teamsMap).map((r) => ({ ...r, dg: r.gf - r.gc }));
    rows.sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf);
    result[group] = rows;
  }
  res.json(result);
});

module.exports = router;
