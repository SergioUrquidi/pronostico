/**
 * bracket-populator.js
 *
 * Calcula los clasificados de la fase de Grupos y puebla automáticamente
 * los partidos de Dieciseisavos (R32_073 a R32_088) con los equipos correspondientes.
 *
 * Lógica:
 *  1. Verifica que todos los partidos de Grupos tengan resultado.
 *  2. Verifica que los R32 no estén ya poblados (idempotente).
 *  3. Calcula standings de los 12 grupos.
 *  4. Extrae 1ro y 2do de cada grupo.
 *  5. Calcula los 8 mejores terceros (pts DESC, dg DESC, gf DESC).
 *  6. Resuelve los slots usando bracket-config.json.
 *  7. Actualiza la tabla matches con home/away para cada R32.
 */

const bracketConfig = require('../data/bracket-config.json');

/**
 * @param {import('@libsql/client').Client} client
 * @returns {Promise<{ populated: boolean, reason?: string, count?: number }>}
 */
async function populateBracket(client) {
  // 1. Verificar que todos los partidos de Grupos estén terminados
  const { rows: pendingGroups } = await client.execute(
    `SELECT COUNT(*) AS n FROM matches
     WHERE phase = 'Grupos'
       AND (home_score IS NULL OR away_score IS NULL)`
  );
  if (pendingGroups[0].n > 0) {
    console.log(`[bracket] Grupos incompletos: ${pendingGroups[0].n} partido(s) sin resultado`);
    return { populated: false, reason: 'grupos_incompletos' };
  }

  // 2. Verificar si los R32 ya están poblados (al menos uno con home != NULL)
  const { rows: alreadySet } = await client.execute(
    `SELECT COUNT(*) AS n FROM matches
     WHERE phase = 'Dieciseisavos' AND home IS NOT NULL`
  );
  if (alreadySet[0].n > 0) {
    console.log(`[bracket] Dieciseisavos ya poblados (${alreadySet[0].n} partidos con equipos)`);
    return { populated: false, reason: 'ya_poblado' };
  }

  // 3. Leer todos los partidos de Grupos con resultados
  const { rows: matches } = await client.execute(
    `SELECT group_name, home, away, home_score, away_score
     FROM matches
     WHERE phase = 'Grupos'`
  );

  // 4. Calcular standings de los 12 grupos (misma lógica que standings.routes.js)
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
    const homeRow = groups[m.group_name]?.[m.home];
    const awayRow = groups[m.group_name]?.[m.away];
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

  // 5. Ordenar cada grupo y extraer posiciones
  // positions: { '1A': 'MEXICO', '2A': 'CANADA', '3A': 'USA', ... }
  const positions = {};
  const allThirds = [];

  for (const [groupName, teamsMap] of Object.entries(groups)) {
    const rows = Object.values(teamsMap).map((r) => ({ ...r, dg: r.gf - r.gc }));
    rows.sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf);

    if (rows[0]) positions[`1${groupName}`] = rows[0].team;
    if (rows[1]) positions[`2${groupName}`] = rows[1].team;
    if (rows[2]) {
      positions[`3${groupName}`] = rows[2].team;
      allThirds.push({ team: rows[2].team, pts: rows[2].pts, dg: rows[2].dg, gf: rows[2].gf });
    }
  }

  // 6. Calcular los 8 mejores terceros
  allThirds.sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf);
  const bestThirds = allThirds.slice(0, 8).map((t) => t.team);

  console.log('[bracket] Mejores terceros clasificados:', bestThirds);

  // 7. Resolver slots y armar los updates
  let thirdIndex = 0;
  const updates = [];

  for (const [matchId, slots] of Object.entries(bracketConfig)) {
    // Ignorar la clave de nota
    if (matchId.startsWith('_')) continue;

    const resolveSlot = (slot) => {
      if (slot === '3rd') {
        if (thirdIndex >= bestThirds.length) {
          console.error(`[bracket] ERROR: Se necesita más de ${bestThirds.length} mejor(es) tercero(s)`);
          return null;
        }
        return bestThirds[thirdIndex++];
      }
      const team = positions[slot];
      if (!team) {
        console.error(`[bracket] ERROR: No se encontró equipo para slot "${slot}"`);
        return null;
      }
      return team;
    };

    const homeTeam = resolveSlot(slots.home);
    const awayTeam = resolveSlot(slots.away);

    if (!homeTeam || !awayTeam) {
      console.error(`[bracket] No se pudo resolver ${matchId}: home="${slots.home}" -> ${homeTeam}, away="${slots.away}" -> ${awayTeam}`);
      continue;
    }

    console.log(`[bracket] ${matchId}: ${homeTeam} vs ${awayTeam} (slots: ${slots.home} vs ${slots.away})`);
    updates.push({
      sql: 'UPDATE matches SET home = ?, away = ? WHERE id = ?',
      args: [homeTeam.toUpperCase(), awayTeam.toUpperCase(), matchId],
    });
  }

  if (updates.length === 0) {
    console.error('[bracket] No se generaron updates — verificar bracket-config.json y standings');
    return { populated: false, reason: 'sin_updates' };
  }

  // 8. Ejecutar todos los updates en batch
  await client.batch(updates, 'write');

  console.log(`[bracket] ${updates.length} partido(s) de Dieciseisavos poblados correctamente`);
  return { populated: true, count: updates.length };
}

/**
 * Retorna el equipo ganador de un partido eliminatorio.
 * Considera advance_winner para partidos que terminaron en empate (penales).
 */
function getWinner(match) {
  if (match.home_score === null || match.away_score === null) return null;
  if (match.home_score > match.away_score) return match.home;
  if (match.away_score > match.home_score) return match.away;
  if (match.advance_winner === 'home') return match.home;
  if (match.advance_winner === 'away') return match.away;
  return null;
}

/**
 * Retorna el equipo perdedor de un partido eliminatorio (para TercerPuesto).
 */
function getLoser(match) {
  if (match.home_score === null || match.away_score === null) return null;
  if (match.home_score > match.away_score) return match.away;
  if (match.away_score > match.home_score) return match.home;
  if (match.advance_winner === 'home') return match.away;
  if (match.advance_winner === 'away') return match.home;
  return null;
}

const knockoutConfig = require('../data/knockout-config.json');

/**
 * Pobla automáticamente los partidos de Octavos, Cuartos, Semifinal,
 * TercerPuesto y Final a medida que los clasificados de la ronda anterior
 * quedan definidos.
 *
 * Es idempotente: si un partido ya tiene home definido, lo omite.
 * Se llama en cada ciclo de sync — solo actúa cuando hay avances nuevos.
 *
 * @param {import('@libsql/client').Client} client
 * @returns {Promise<{ populated: boolean, count: number }>}
 */
async function populateKnockoutRounds(client) {
  // Cargar todos los partidos de Dieciseisavos en adelante de una sola query
  const { rows: allMatches } = await client.execute(
    `SELECT id, phase, home, away, home_score, away_score, advance_winner
     FROM matches
     WHERE phase IN ('Dieciseisavos','Octavos','Cuartos','Semifinal','TercerPuesto','Final')`
  );

  const matchMap = Object.fromEntries(allMatches.map((m) => [m.id, m]));
  const updates = [];

  for (const [key, entries] of Object.entries(knockoutConfig)) {
    if (key.startsWith('_')) continue;
    for (const entry of entries) {

      const target = matchMap[entry.match];
      if (!target || target.home !== null) continue; // ya poblado

      const homeFeed = matchMap[entry.home_from];
      const awayFeed = matchMap[entry.away_from];
      if (!homeFeed || !awayFeed) continue;

      const homeSide = entry.home_side ?? 'winner';
      const awaySide = entry.away_side ?? 'winner';

      const homeTeam = homeSide === 'loser' ? getLoser(homeFeed) : getWinner(homeFeed);
      const awayTeam = awaySide === 'loser' ? getLoser(awayFeed) : getWinner(awayFeed);

      if (!homeTeam || !awayTeam) continue; // partido(s) previo(s) aún sin ganador

      console.log(`[bracket] ${entry.match} (${target.phase}): ${homeTeam} vs ${awayTeam}`);
      updates.push({
        sql: 'UPDATE matches SET home = ?, away = ? WHERE id = ?',
        args: [homeTeam, awayTeam, entry.match],
      });
    }
  }

  if (updates.length > 0) {
    await client.batch(updates, 'write');
    console.log(`[bracket] ${updates.length} partido(s) de fases posteriores poblados`);
  }

  return { populated: updates.length > 0, count: updates.length };
}

module.exports = { populateBracket, populateKnockoutRounds };
