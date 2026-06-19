/**
 * Auto-sync match results from worldcup26.ir (free, no API key needed).
 * Called on server start and every 5 minutes via setInterval.
 *
 * Penalty rule: if a knockout match ends in a draw (finished=true),
 * the result is saved but advance_winner is left null so the admin
 * can set it manually (we don't know who won on penalties from this API).
 */

const EXTERNAL_API = 'https://worldcup26.ir/get/games';

// Map English team names (API) → Spanish uppercase names (our DB)
const EN_TO_ES = {
  'Mexico': 'MEXICO',
  'South Africa': 'SUDAFRICA',
  'South Korea': 'COREA DEL SUR',
  'Czech Republic': 'REP. CHECA',
  'Czechia': 'REP. CHECA',
  'Canada': 'CANADA',
  'Bosnia': 'BOSNIA Y HERZEG.',
  'Bosnia and Herzegovina': 'BOSNIA Y HERZEG.',
  'Qatar': 'CATAR',
  'Switzerland': 'SUIZA',
  'Brazil': 'BRASIL',
  'Morocco': 'MARRUECOS',
  'Haiti': 'HAITI',
  'Scotland': 'ESCOCIA',
  'Australia': 'AUSTRALIA',
  'Turkey': 'TURQUIA',
  'Turkiye': 'TURQUIA',
  'United States': 'ESTADOS UNIDOS',
  'USA': 'ESTADOS UNIDOS',
  'Paraguay': 'PARAGUAY',
  'Germany': 'ALEMANIA',
  'Curacao': 'CURAZAO',
  'Curaçao': 'CURAZAO',
  'Netherlands': 'PAISES BAJOS',
  'Japan': 'JAPON',
  'Ivory Coast': 'COSTA DE MARFIL',
  "Côte d'Ivoire": 'COSTA DE MARFIL',
  "Cote d'Ivoire": 'COSTA DE MARFIL',
  'Ecuador': 'ECUADOR',
  'Sweden': 'SUECIA',
  'Tunisia': 'TUNEZ',
  'Spain': 'ESPANA',
  'Cape Verde': 'CABO VERDE',
  'Belgium': 'BELGICA',
  'Egypt': 'EGIPTO',
  'Saudi Arabia': 'ARABIA SAUDITA',
  'Uruguay': 'URUGUAY',
  'Iran': 'IRAN',
  'New Zealand': 'NUEVA ZELANDA',
  'France': 'FRANCIA',
  'Senegal': 'SENEGAL',
  'Iraq': 'IRAK',
  'Norway': 'NORUEGA',
  'Argentina': 'ARGENTINA',
  'Algeria': 'ARGELIA',
  'Austria': 'AUSTRIA',
  'Jordan': 'JORDANIA',
  'Portugal': 'PORTUGAL',
  'DR Congo': 'REP. DEL CONGO',
  'Congo DR': 'REP. DEL CONGO',
  'Democratic Republic of Congo': 'REP. DEL CONGO',
  'Democratic Republic of the Congo': 'REP. DEL CONGO',
  'Uzbekistan': 'UZBEKISTAN',
  'Colombia': 'COLOMBIA',
  'England': 'INGLATERRA',
  'Croatia': 'CROACIA',
  'Ghana': 'GHANA',
  'Panama': 'PANAMA',
};

const KNOCKOUT_PHASES = new Set(['Dieciseisavos', 'Octavos', 'Cuartos', 'Semifinal', 'TercerPuesto', 'Final']);

let lastSync = null;
let syncInProgress = false;

async function syncResults(client) {
  if (syncInProgress) return;
  syncInProgress = true;

  try {
    const res = await fetch(EXTERNAL_API, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const games = data.games ?? data ?? [];

    if (!Array.isArray(games) || games.length === 0) {
      console.log('[sync] No games data received');
      return;
    }

    // Build team-pair lookup from our DB
    const { rows: dbMatches } = await client.execute(
      'SELECT id, phase, home, away, home_score, away_score, advance_winner, kickoff_at_utc FROM matches WHERE home IS NOT NULL AND away IS NOT NULL'
    );

    // Index our matches by "HOME|AWAY" in Spanish
    const matchIndex = {};
    for (const m of dbMatches) {
      matchIndex[`${m.home}|${m.away}`] = m;
    }

    const updates = [];

    for (const g of games) {
      const homeScore = parseInt(g.home_score, 10);
      const awayScore = parseInt(g.away_score, 10);
      if (isNaN(homeScore) || isNaN(awayScore)) continue;

      const homeEs = EN_TO_ES[g.home_team_name_en] ?? g.home_team_name_en?.toUpperCase();
      const awayEs = EN_TO_ES[g.away_team_name_en] ?? g.away_team_name_en?.toUpperCase();
      if (!homeEs || !awayEs) continue;

      // Try direct order first, then reversed (API may list teams in different order than our DB)
      const directMatch = matchIndex[`${homeEs}|${awayEs}`];
      const reversedMatch = matchIndex[`${awayEs}|${homeEs}`];
      const dbMatch = directMatch ?? reversedMatch;
      if (!dbMatch) continue;

      // If teams are reversed in the API, swap the scores to match our DB home/away order
      const finalHomeScore = directMatch ? homeScore : awayScore;
      const finalAwayScore = directMatch ? awayScore : homeScore;

      // Skip if the match hasn't kicked off yet — prevents writing 0-0 for future games
      const kickoffMs = new Date(dbMatch.kickoff_at_utc).getTime();
      if (!isNaN(kickoffMs) && Date.now() < kickoffMs) {
        console.log(`[sync] SKIP (futuro): ${homeEs} vs ${awayEs} arranca ${dbMatch.kickoff_at_utc}`);
        continue;
      }

      // Skip if we already have the same result stored
      if (dbMatch.home_score === finalHomeScore && dbMatch.away_score === finalAwayScore) continue;

      if (!directMatch) {
        console.log(`[sync] INVERTIDO: API devolvió ${homeEs}|${awayEs}, BD tiene ${dbMatch.home}|${dbMatch.away}`);
      }

      // For knockout draws, preserve any existing advance_winner set by admin
      const advanceWinner = dbMatch.advance_winner ?? null;

      updates.push({
        sql: 'UPDATE matches SET home_score = ?, away_score = ? WHERE id = ?',
        args: [finalHomeScore, finalAwayScore, dbMatch.id],
      });

      // If knockout and a draw and no advance_winner set, log for admin attention
      if (KNOCKOUT_PHASES.has(dbMatch.phase) && finalHomeScore === finalAwayScore && !advanceWinner) {
        console.log(`[sync] KNOCKOUT DRAW — admin debe setear advance_winner: ${dbMatch.home} ${finalHomeScore}-${finalAwayScore} ${dbMatch.away} (id: ${dbMatch.id})`);
      }
    }

    if (updates.length > 0) {
      await client.batch(updates, 'write');
      console.log(`[sync] ${updates.length} resultado(s) actualizado(s) desde worldcup26.ir`);
    }

    lastSync = new Date();

    // Auto-poblar Dieciseisavos y fases posteriores según avance del torneo
    const { populateBracket, populateKnockoutRounds } = require('./utils/bracket-populator');
    const bracketResult = await populateBracket(client);
    if (bracketResult.populated) {
      console.log('[bracket] Dieciseisavos poblados automáticamente:', bracketResult.count, 'partidos');
    }
    await populateKnockoutRounds(client);
  } catch (err) {
    console.error('[sync] Error al sincronizar resultados:', err.message);
  } finally {
    syncInProgress = false;
  }
}

function startAutoSync(client, intervalMs = 5 * 60 * 1000) {
  // Run immediately on startup
  syncResults(client);
  // Then every intervalMs (default 5 min)
  setInterval(() => syncResults(client), intervalMs);
  console.log(`[sync] Auto-sync activado cada ${intervalMs / 60000} min desde worldcup26.ir`);
}

function getSyncStatus() {
  return { lastSync, syncInProgress };
}

module.exports = { syncResults, startAutoSync, getSyncStatus };
