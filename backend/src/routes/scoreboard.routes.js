const express = require('express');
const { client } = require('../db');
const { requireAuth } = require('../auth');
const { calcScore, calcAdvanceScore } = require('../scoring');

const router = express.Router();

const KNOCKOUT_PHASES = new Set(['Dieciseisavos', 'Octavos', 'Cuartos', 'Semifinal', 'TercerPuesto', 'Final']);

router.get('/', requireAuth, async (_req, res) => {
  const { rows: users } = await client.execute("SELECT id, username, display_name FROM users WHERE role = 'player'");
  const { rows: matches } = await client.execute('SELECT id, phase, group_name, home, away, home_score, away_score, advance_winner FROM matches');
  const { rows: predictions } = await client.execute('SELECT user_id, match_id, home_pred, away_pred, advance_pred FROM predictions');
  const { rows: groupPreds } = await client.execute('SELECT user_id, group_name, team FROM group_advance_preds');

  const predByUserMatch = {};
  for (const p of predictions) {
    predByUserMatch[`${p.user_id}_${p.match_id}`] = p;
  }

  // Build group advance preds index: userId → group → Set of predicted teams
  const groupPredByUser = {};
  for (const gp of groupPreds) {
    if (!groupPredByUser[gp.user_id]) groupPredByUser[gp.user_id] = {};
    if (!groupPredByUser[gp.user_id][gp.group_name]) groupPredByUser[gp.user_id][gp.group_name] = new Set();
    groupPredByUser[gp.user_id][gp.group_name].add(gp.team);
  }

  // Determine actual top-2 teams per group from completed matches
  const groupStandings = {};
  for (const m of matches) {
    if (m.phase !== 'Grupos' || m.home_score === null || m.away_score === null) continue;
    if (!groupStandings[m.group_name]) groupStandings[m.group_name] = {};
    for (const team of [m.home, m.away]) {
      if (team && !groupStandings[m.group_name][team]) {
        groupStandings[m.group_name][team] = { pj: 0, pts: 0, gf: 0, gc: 0 };
      }
    }
    const hs = m.home_score, as_ = m.away_score;
    groupStandings[m.group_name][m.home].pj++;
    groupStandings[m.group_name][m.away].pj++;
    groupStandings[m.group_name][m.home].gf += hs;
    groupStandings[m.group_name][m.home].gc += as_;
    groupStandings[m.group_name][m.away].gf += as_;
    groupStandings[m.group_name][m.away].gc += hs;
    if (hs > as_) { groupStandings[m.group_name][m.home].pts += 3; }
    else if (hs < as_) { groupStandings[m.group_name][m.away].pts += 3; }
    else { groupStandings[m.group_name][m.home].pts++; groupStandings[m.group_name][m.away].pts++; }
  }

  // Teams in each group sorted by points (top 2 = advanced)
  const groupAdvancedTeams = {};
  for (const [grp, teamsMap] of Object.entries(groupStandings)) {
    const sorted = Object.entries(teamsMap)
      .sort((a, b) => b[1].pts - a[1].pts || (b[1].gf - b[1].gc) - (a[1].gf - a[1].gc) || b[1].gf - a[1].gf)
      .map(([team]) => team);
    // Only award group advance points if ALL group matches for this group are played
    const groupMatches = matches.filter((m) => m.phase === 'Grupos' && m.group_name === grp);
    const allPlayed = groupMatches.length > 0 && groupMatches.every((m) => m.home_score !== null);
    groupAdvancedTeams[grp] = allPlayed ? new Set(sorted.slice(0, 2)) : null;
  }

  const board = users.map((u) => {
    let points = 0, exact = 0, sign = 0, advance = 0, groupAdv = 0;

    // Match predictions
    for (const m of matches) {
      const pred = predByUserMatch[`${u.id}_${m.id}`];
      const score = pred ? calcScore(pred.home_pred, pred.away_pred, m.home_score, m.away_score) : 0;
      points += score;
      if (score === 4) exact++;
      if (score === 2) sign++;

      // Knockout advance bonus
      if (KNOCKOUT_PHASES.has(m.phase) && pred?.advance_pred) {
        const advScore = calcAdvanceScore(pred.advance_pred, m.home_score, m.away_score, m.advance_winner);
        points += advScore;
        advance += advScore;
      }
    }

    // Group advance predictions bonus (1 pt per correctly predicted advancing team)
    const userGroupPreds = groupPredByUser[u.id] ?? {};
    for (const [grp, actualSet] of Object.entries(groupAdvancedTeams)) {
      if (!actualSet) continue; // group not finished yet
      const predicted = userGroupPreds[grp] ?? new Set();
      for (const team of predicted) {
        if (actualSet.has(team)) { points++; groupAdv++; }
      }
    }

    return { username: u.username, displayName: u.display_name, points, exact, sign, advance, groupAdv };
  });

  board.sort((a, b) => b.points - a.points);
  res.json(board);
});

module.exports = router;
