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
  return rows[0] ? parseInt(rows[0].value, 10) : 60;
}

async function isLocked(kickoffAtUtc) {
  const lockMinutes = await getLockMinutes();
  const kickoffMs = new Date(kickoffAtUtc).getTime();
  if (isNaN(kickoffMs)) return true; // falla-segura: fecha inválida → bloqueado
  return Date.now() >= kickoffMs - lockMinutes * 60 * 1000;
}

/**
 * Calcula posiciones clasificadas de grupos completados (todos sus partidos con score).
 * Devuelve un mapa { '1A': 'MEXICO', '2B': 'CANADA', ... } y bestThirds[] si todos los grupos terminaron.
 */
function computeGroupPositions(allRows) {
  const bracketConfig = require('../data/bracket-config.json');
  const groupMatches = allRows.filter((m) => m.phase === 'Grupos');

  // Acumular estadísticas por grupo
  const groups = {};
  for (const m of groupMatches) {
    if (!m.group_name) continue;
    if (!groups[m.group_name]) groups[m.group_name] = {};
    for (const team of [m.home, m.away]) {
      if (team && !groups[m.group_name][team]) {
        groups[m.group_name][team] = { team, pts: 0, gf: 0, gc: 0 };
      }
    }
    if (m.home_score === null || m.away_score === null) continue;
    const h = groups[m.group_name][m.home];
    const a = groups[m.group_name][m.away];
    if (!h || !a) continue;
    h.gf += m.home_score; h.gc += m.away_score;
    a.gf += m.away_score; a.gc += m.home_score;
    if (m.home_score > m.away_score) { h.pts += 3; }
    else if (m.home_score < m.away_score) { a.pts += 3; }
    else { h.pts += 1; a.pts += 1; }
  }

  // Determinar grupos completamente terminados
  const completedGroups = new Set();
  for (const [g, teams] of Object.entries(groups)) {
    const gMatches = groupMatches.filter((m) => m.group_name === g);
    if (gMatches.length > 0 && gMatches.every((m) => m.home_score !== null && m.away_score !== null)) {
      completedGroups.add(g);
    }
  }

  const positions = {};
  const allThirds = [];

  for (const g of completedGroups) {
    const sorted = Object.values(groups[g]).sort((a, b) =>
      b.pts - a.pts || (b.gf - b.gc) - (a.gf - a.gc) || b.gf - a.gf
    );
    if (sorted[0]) positions[`1${g}`] = sorted[0].team;
    if (sorted[1]) positions[`2${g}`] = sorted[1].team;
    if (sorted[2]) {
      allThirds.push({ team: sorted[2].team, pts: sorted[2].pts, dg: sorted[2].gf - sorted[2].gc, gf: sorted[2].gf });
    }
  }

  // Los 8 mejores terceros solo se asignan cuando TODOS los grupos terminaron
  const totalGroups = Object.keys(groups).length;
  let bestThirds = [];
  if (totalGroups > 0 && completedGroups.size === totalGroups) {
    allThirds.sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf);
    bestThirds = allThirds.slice(0, 8).map((t) => t.team);
  }

  // Resolver asignaciones de '3rd' en el bracket-config como array indexado
  let thirdIndex = 0;
  const resolvedThirds = {};
  for (const [matchId, slots] of Object.entries(bracketConfig)) {
    if (matchId.startsWith('_')) continue;
    if (slots.home === '3rd') resolvedThirds[`${matchId}_home`] = bestThirds[thirdIndex++] ?? null;
    if (slots.away === '3rd') resolvedThirds[`${matchId}_away`] = bestThirds[thirdIndex++] ?? null;
  }

  return { positions, resolvedThirds };
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

  // Calcular posiciones dinámicas para Dieciseisavos con home/away aún NULL
  const r32NeedsResolution = rows.some((m) => m.phase === 'Dieciseisavos' && m.home === null);
  let dynamicPositions = {};
  let dynamicThirds = {};
  if (r32NeedsResolution) {
    const bracketConfig = require('../data/bracket-config.json');
    const { positions, resolvedThirds } = computeGroupPositions(rows);
    dynamicPositions = positions;
    dynamicThirds = resolvedThirds;

    // Resolver home/away de R32 que aún están NULL en la BD
    for (const m of rows) {
      if (m.phase !== 'Dieciseisavos' || m.home !== null) continue;
      const slots = bracketConfig[m.id];
      if (!slots) continue;
      m.home = slots.home === '3rd' ? (dynamicThirds[`${m.id}_home`] ?? null) : (dynamicPositions[slots.home] ?? null);
      m.away = slots.away === '3rd' ? (dynamicThirds[`${m.id}_away`] ?? null) : (dynamicPositions[slots.away] ?? null);
    }
  }

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
