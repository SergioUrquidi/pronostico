/**
 * Seed historical match results and predictions from the physical spreadsheet.
 * Protected by a config key so it only runs once per deployment.
 */

const RESULTS = [
  { id: 'G001', home: 2, away: 0 },  // Mexico 2-0 Sudafrica
  { id: 'G002', home: 2, away: 1 },  // Corea del Sur 2-1 Rep. Checa
  { id: 'G003', home: 1, away: 1 },  // Canada 1-1 Bosnia
  { id: 'G004', home: 4, away: 1 },  // Estados Unidos 4-1 Paraguay
  { id: 'G005', home: 0, away: 1 },  // Haiti 0-1 Escocia
  { id: 'G006', home: 2, away: 0 },  // Australia 2-0 Turquia
  { id: 'G007', home: 1, away: 1 },  // Brasil 1-1 Marruecos
  { id: 'G008', home: 1, away: 1 },  // Catar 1-1 Suiza
  { id: 'G009', home: 1, away: 0 },  // Costa de Marfil 1-0 Ecuador
  { id: 'G010', home: 7, away: 1 },  // Alemania 7-1 Curazao
  { id: 'G011', home: 2, away: 2 },  // Paises Bajos 2-2 Japon
  { id: 'G012', home: 5, away: 1 },  // Suecia 5-1 Tunez
  { id: 'G013', home: 1, away: 1 },  // Arabia Saudita 1-1 Uruguay
  { id: 'G014', home: 0, away: 0 },  // España 0-0 Cabo Verde
  { id: 'G015', home: 2, away: 2 },  // Iran 2-2 Nueva Zelanda
  { id: 'G016', home: 1, away: 1 },  // Belgica 1-1 Egipto
  { id: 'G017', home: 3, away: 1 },  // Francia 3-1 Senegal
  { id: 'G018', home: 1, away: 4 },  // Irak 1-4 Noruega
  { id: 'G019', home: 3, away: 0 },  // Argentina 3-0 Argelia
];

// [matchId, username, home_pred, away_pred]
const PREDICTIONS = [
  // G001 Mexico 2-0 Sudafrica
  ['G001', 'cesar',     2, 1],
  ['G001', 'sergio',    1, 0],
  ['G001', 'marco',     1, 0],
  ['G001', 'rimmy',     3, 1],
  ['G001', 'jonathan',  0, 1],
  // christian: sin pronostico

  // G002 Corea del Sur 2-1 Rep. Checa
  ['G002', 'cesar',     1, 0],
  ['G002', 'sergio',    1, 0],
  ['G002', 'marco',     1, 1],
  ['G002', 'rimmy',     2, 1],
  ['G002', 'jonathan',  2, 1],
  ['G002', 'christian', 2, 1],

  // G003 Canada 1-1 Bosnia
  ['G003', 'cesar',     2, 0],
  ['G003', 'sergio',    0, 0],
  ['G003', 'marco',     1, 1],
  ['G003', 'rimmy',     2, 1],
  ['G003', 'jonathan',  1, 0],
  ['G003', 'christian', 1, 0],

  // G004 Estados Unidos 4-1 Paraguay
  ['G004', 'cesar',     1, 2],
  ['G004', 'sergio',    0, 1],
  ['G004', 'marco',     2, 1],
  ['G004', 'rimmy',     3, 1],
  ['G004', 'jonathan',  2, 1],
  ['G004', 'christian', 2, 1],

  // G005 Haiti 0-1 Escocia
  ['G005', 'cesar',     0, 2],
  ['G005', 'sergio',    0, 2],
  ['G005', 'marco',     0, 3],
  ['G005', 'rimmy',     0, 1],
  ['G005', 'jonathan',  1, 2],
  ['G005', 'christian', 0, 3],

  // G006 Australia 2-0 Turquia
  ['G006', 'cesar',     0, 2],
  ['G006', 'sergio',    1, 1],
  ['G006', 'marco',     0, 1],
  ['G006', 'rimmy',     0, 2],
  ['G006', 'jonathan',  0, 2],
  ['G006', 'christian', 0, 2],

  // G007 Brasil 1-1 Marruecos
  ['G007', 'cesar',     2, 0],
  ['G007', 'sergio',    2, 0],
  ['G007', 'marco',     1, 1],
  ['G007', 'rimmy',     3, 1],
  ['G007', 'jonathan',  3, 0],
  ['G007', 'christian', 2, 1],

  // G008 Catar 1-1 Suiza
  ['G008', 'cesar',     0, 2],
  ['G008', 'sergio',    0, 2],
  ['G008', 'marco',     0, 2],
  ['G008', 'rimmy',     1, 2],
  ['G008', 'jonathan',  0, 1],
  ['G008', 'christian', 0, 2],

  // G009 Costa de Marfil 1-0 Ecuador
  ['G009', 'cesar',     0, 2],
  ['G009', 'sergio',    1, 2],
  ['G009', 'marco',     1, 1],
  ['G009', 'rimmy',     1, 2],
  ['G009', 'jonathan',  1, 1],
  ['G009', 'christian', 1, 2],

  // G010 Alemania 7-1 Curazao
  ['G010', 'cesar',     2, 0],
  ['G010', 'sergio',    3, 0],
  ['G010', 'marco',     5, 0],
  ['G010', 'rimmy',     5, 0],
  ['G010', 'jonathan',  3, 0],
  ['G010', 'christian', 3, 0],

  // G011 Paises Bajos 2-2 Japon
  ['G011', 'cesar',     1, 1],
  ['G011', 'sergio',    2, 1],
  ['G011', 'marco',     2, 2],
  ['G011', 'rimmy',     2, 2],
  ['G011', 'jonathan',  2, 1],
  ['G011', 'christian', 2, 1],

  // G012 Suecia 5-1 Tunez
  ['G012', 'cesar',     2, 0],
  ['G012', 'sergio',    1, 1],
  ['G012', 'marco',     2, 0],
  ['G012', 'rimmy',     1, 1],
  ['G012', 'jonathan',  1, 0],
  ['G012', 'christian', 2, 1],

  // G013 Arabia Saudita 1-1 Uruguay
  ['G013', 'cesar',     0, 1],
  ['G013', 'sergio',    0, 1],
  ['G013', 'marco',     0, 1],
  ['G013', 'rimmy',     1, 1],
  ['G013', 'jonathan',  1, 2],
  ['G013', 'christian', 1, 2],

  // G014 España 0-0 Cabo Verde
  ['G014', 'cesar',     3, 0],
  ['G014', 'sergio',    2, 0],
  ['G014', 'marco',     3, 1],
  ['G014', 'rimmy',     6, 0],
  ['G014', 'jonathan',  3, 1],
  ['G014', 'christian', 3, 0],

  // G015 Iran 2-2 Nueva Zelanda
  ['G015', 'cesar',     0, 1],
  ['G015', 'sergio',    0, 0],
  ['G015', 'marco',     1, 1],
  ['G015', 'rimmy',     0, 2],
  ['G015', 'jonathan',  1, 0],
  ['G015', 'christian', 1, 0],

  // G016 Belgica 1-1 Egipto
  ['G016', 'cesar',     1, 1],
  ['G016', 'sergio',    2, 0],
  ['G016', 'marco',     2, 0],
  ['G016', 'rimmy',     2, 1],
  ['G016', 'jonathan',  3, 2],
  ['G016', 'christian', 2, 1],

  // G017 Francia 3-1 Senegal
  ['G017', 'cesar',     2, 0],
  ['G017', 'sergio',    2, 0],
  ['G017', 'marco',     2, 1],
  ['G017', 'rimmy',     3, 1],
  ['G017', 'jonathan',  3, 1],
  ['G017', 'christian', 2, 1],

  // G018 Irak 1-4 Noruega
  ['G018', 'cesar',     0, 2],
  ['G018', 'sergio',    0, 1],
  ['G018', 'marco',     1, 3],
  ['G018', 'rimmy',     0, 3],
  ['G018', 'jonathan',  0, 2],
  ['G018', 'christian', 0, 2],

  // G019 Argentina 3-0 Argelia
  ['G019', 'cesar',     2, 0],
  ['G019', 'sergio',    3, 0],
  ['G019', 'marco',     3, 0],
  ['G019', 'rimmy',     2, 0],
  ['G019', 'jonathan',  1, 0],
  ['G019', 'christian', 2, 1],

  // G020 Austria vs Jordania (sin resultado todavia)
  ['G020', 'cesar',     1, 0],
  ['G020', 'sergio',    2, 0],
  ['G020', 'marco',     3, 0],
  ['G020', 'rimmy',     1, 1],
  ['G020', 'jonathan',  2, 1],
  ['G020', 'christian', 1, 0],
];

async function seedHistoricalData(client) {
  // Guard: only seed once
  const { rows: guard } = await client.execute({
    sql: "SELECT value FROM config WHERE key = 'historical_seed_v1'",
    args: [],
  });
  if (guard.length > 0) {
    console.log('Historical data already seeded — skipping.');
    return;
  }

  console.log('Seeding historical match results...');
  const resultStatements = RESULTS.map((r) => ({
    sql: 'UPDATE matches SET home_score = ?, away_score = ? WHERE id = ?',
    args: [r.home, r.away, r.id],
  }));
  await client.batch(resultStatements, 'write');

  console.log('Seeding historical predictions...');
  const predStatements = PREDICTIONS.map(([matchId, username, home, away]) => ({
    sql: `INSERT INTO predictions (user_id, match_id, home_pred, away_pred, updated_at)
          SELECT u.id, ?, ?, ?, datetime('now')
          FROM users u WHERE u.username = ?
          ON CONFLICT(user_id, match_id) DO NOTHING`,
    args: [matchId, home, away, username],
  }));
  await client.batch(predStatements, 'write');

  // Mark as done
  await client.execute({
    sql: "INSERT INTO config (key, value) VALUES ('historical_seed_v1', '1') ON CONFLICT(key) DO NOTHING",
    args: [],
  });
  console.log('Historical seed complete.');
}

module.exports = { seedHistoricalData };
