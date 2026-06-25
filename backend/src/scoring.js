function calcScore(predHome, predAway, realHome, realAway) {
  if (realHome === null || realAway === null || realHome === undefined || realAway === undefined) return 0;
  if (predHome === null || predAway === null || predHome === undefined || predAway === undefined) return 0;

  const realResult = realHome > realAway ? 'H' : realHome < realAway ? 'A' : 'D';
  const predResult = predHome > predAway ? 'H' : predHome < predAway ? 'A' : 'D';
  if (realResult !== predResult) return 0;
  if (predHome === realHome && predAway === realAway) return 4;
  return 2;
}

/**
 * Returns the effective advance winner for a knockout match.
 * - If advance_winner is set explicitly (penalty case): use it.
 * - Otherwise infer from score (only valid if score is not a draw).
 * - Returns null if the match hasn't been decided yet.
 */
function effectiveAdvanceWinner(homeScore, awayScore, advanceWinner) {
  if (advanceWinner) return advanceWinner;
  if (homeScore === null || homeScore === undefined) return null;
  if (awayScore === null || awayScore === undefined) return null;
  if (homeScore > awayScore) return 'home';
  if (homeScore < awayScore) return 'away';
  return null; // draw — requires explicit advance_winner (set by admin after penalties)
}

/**
 * +1 if the player correctly predicted who advances in a knockout match.
 * Only applies to non-group phases.
 */
function calcAdvanceScore(advancePred, homeScore, awayScore, advanceWinner) {
  // +1 only when the match went to penalties (advance_winner explicitly set by admin)
  if (!advanceWinner || !advancePred) return 0;
  return advancePred === advanceWinner ? 1 : 0;
}

module.exports = { calcScore, calcAdvanceScore, effectiveAdvanceWinner };
