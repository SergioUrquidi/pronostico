function calcScore(predHome, predAway, realHome, realAway) {
  if (realHome === null || realAway === null || realHome === undefined || realAway === undefined) return 0;
  if (predHome === null || predAway === null || predHome === undefined || predAway === undefined) return 0;

  const realResult = realHome > realAway ? 'H' : realHome < realAway ? 'A' : 'D';
  const predResult = predHome > predAway ? 'H' : predHome < predAway ? 'A' : 'D';
  if (realResult !== predResult) return 0;
  if (predHome === realHome && predAway === realAway) return 4;
  return 2;
}

module.exports = { calcScore };
