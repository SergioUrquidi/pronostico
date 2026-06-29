const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const { seedHistoricalData } = require('./seed-historical');

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function initDb() {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'player',
      must_change_password INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      num INTEGER NOT NULL,
      phase TEXT NOT NULL,
      group_name TEXT,
      home TEXT,
      away TEXT,
      stadium TEXT,
      date_local TEXT,
      time_local TEXT,
      kickoff_at_utc TEXT NOT NULL,
      home_score INTEGER,
      away_score INTEGER,
      advance_winner TEXT
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      match_id TEXT NOT NULL REFERENCES matches(id),
      home_pred INTEGER NOT NULL,
      away_pred INTEGER NOT NULL,
      advance_pred TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, match_id)
    );

    CREATE TABLE IF NOT EXISTS group_advance_preds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      group_name TEXT NOT NULL,
      team TEXT NOT NULL,
      UNIQUE(user_id, group_name, team)
    );
  `);

  await runMigrations();
  await seedHistoricalData(client);

  const userCount = (await client.execute('SELECT COUNT(*) AS n FROM users')).rows[0].n;
  if (userCount === 0) {
    const players = [
      ['marco', 'Marco'],
      ['sergio', 'Sergio'],
      ['cesar', 'César'],
      ['rimmy', 'Rimmy'],
      ['jonathan', 'Jonathan'],
      ['christian', 'Christian'],
    ];
    const defaultHash = bcrypt.hashSync('123456', 10);
    const statements = players.map(([username, displayName]) => ({
      sql: `INSERT INTO users (username, display_name, password_hash, role, must_change_password)
            VALUES (?, ?, ?, 'player', 1)`,
      args: [username, displayName, defaultHash],
    }));
    statements.push({
      sql: `INSERT INTO users (username, display_name, password_hash, role, must_change_password)
            VALUES ('admin', 'Administrador', ?, 'admin', 1)`,
      args: [defaultHash],
    });
    await client.batch(statements, 'write');
  }

  const matchCount = (await client.execute('SELECT COUNT(*) AS n FROM matches')).rows[0].n;
  if (matchCount === 0) {
    const fixture = require('./data/fixture.json');
    const statements = fixture.map((m) => ({
      sql: `INSERT INTO matches (id, num, phase, group_name, home, away, stadium, date_local, time_local, kickoff_at_utc)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [m.id, m.num, m.phase, m.group, m.home, m.away, m.stadium, m.date_local, m.time_local, m.kickoff_at_utc],
    }));
    await client.batch(statements, 'write');
  }

  const configCount = (await client.execute('SELECT COUNT(*) AS n FROM config')).rows[0].n;
  if (configCount === 0) {
    await client.execute({
      sql: 'INSERT INTO config (key, value) VALUES (?, ?)',
      args: ['lock_minutes_before_kickoff', '10'],
    });
  }
}

async function runMigrations() {
  const alterations = [
    'ALTER TABLE predictions ADD COLUMN advance_pred TEXT',
    'ALTER TABLE matches ADD COLUMN advance_winner TEXT',
    'ALTER TABLE users ADD COLUMN wa_number TEXT',
  ];
  for (const sql of alterations) {
    try {
      await client.execute(sql);
    } catch (_) {
      // Column already exists — safe to ignore
    }
  }

  // Corrige kickoff_at_utc con offset incorrecto (fixture usó EDT para todos los estadios).
  // Idempotente: WHERE filtra solo el valor viejo. Cada línea es segura de re-ejecutar.
  const kickoffFixes = [
    ['G024','2026-06-18T02:00:00Z','2026-06-18T04:00:00Z'],
    ['G026','2026-06-18T19:00:00Z','2026-06-18T22:00:00Z'],
    ['G027','2026-06-18T22:00:00Z','2026-06-19T01:00:00Z'],
    ['G028','2026-06-19T01:00:00Z','2026-06-19T03:00:00Z'],
    ['G031','2026-06-20T04:00:00Z','2026-06-20T06:00:00Z'],
    ['G032','2026-06-19T19:00:00Z','2026-06-19T22:00:00Z'],
    ['G034','2026-06-21T00:00:00Z','2026-06-21T01:00:00Z'],
    ['G035','2026-06-20T17:00:00Z','2026-06-20T18:00:00Z'],
    ['G036','2026-06-21T04:00:00Z','2026-06-21T06:00:00Z'],
    ['G039','2026-06-21T19:00:00Z','2026-06-21T22:00:00Z'],
    ['G040','2026-06-22T01:00:00Z','2026-06-22T04:00:00Z'],
    ['G043','2026-06-22T17:00:00Z','2026-06-22T18:00:00Z'],
    ['G044','2026-06-23T03:00:00Z','2026-06-23T06:00:00Z'],
    ['G047','2026-06-23T17:00:00Z','2026-06-23T18:00:00Z'],
    ['G048','2026-06-24T02:00:00Z','2026-06-24T04:00:00Z'],
    ['G051','2026-06-24T19:00:00Z','2026-06-24T22:00:00Z'],
    ['G052','2026-06-24T19:00:00Z','2026-06-24T22:00:00Z'],
    ['G053','2026-06-25T01:00:00Z','2026-06-25T03:00:00Z'],
    ['G054','2026-06-25T01:00:00Z','2026-06-25T03:00:00Z'],
    ['G057','2026-06-25T23:00:00Z','2026-06-26T00:00:00Z'],
    ['G058','2026-06-25T23:00:00Z','2026-06-26T00:00:00Z'],
    ['G059','2026-06-26T02:00:00Z','2026-06-26T05:00:00Z'],
    ['G060','2026-06-26T02:00:00Z','2026-06-26T05:00:00Z'],
    ['G063','2026-06-27T03:00:00Z','2026-06-27T06:00:00Z'],
    ['G064','2026-06-27T03:00:00Z','2026-06-27T06:00:00Z'],
    ['G065','2026-06-27T00:00:00Z','2026-06-27T01:00:00Z'],
    ['G066','2026-06-27T00:00:00Z','2026-06-27T02:00:00Z'],
    ['G069','2026-06-28T02:00:00Z','2026-06-28T03:00:00Z'],
    ['G070','2026-06-28T02:00:00Z','2026-06-28T03:00:00Z'],
    // R32_076 Houston: noon CDT (12:00) = 17:00 UTC, fixture tenía 13:00 CDT = 18:00 UTC (1h tarde)
    ['R32_076','2026-06-29T17:00:00Z','2026-06-29T18:00:00Z'],
    // TIMEZONE FIX: fixture usaba el horario ET como horario local para sedes fuera del este
    // CST (UTC-6) Mexico: 2h tarde en fixture
    ['R32_075','2026-06-30T01:00:00Z','2026-06-30T03:00:00Z'],
    ['R32_079','2026-07-01T01:00:00Z','2026-07-01T03:00:00Z'],
    ['OCTA_092','2026-07-06T00:00:00Z','2026-07-06T02:00:00Z'],
    // CDT (UTC-5): 1h tarde en fixture
    ['R32_078','2026-06-30T17:00:00Z','2026-06-30T18:00:00Z'],
    ['R32_087','2026-07-04T01:30:00Z','2026-07-04T02:30:00Z'],
    ['R32_088','2026-07-03T18:00:00Z','2026-07-03T19:00:00Z'],
    ['OCTA_090','2026-07-04T17:00:00Z','2026-07-04T18:00:00Z'],
    ['OCTA_093','2026-07-06T19:00:00Z','2026-07-06T20:00:00Z'],
    ['CUAR_100','2026-07-12T01:00:00Z','2026-07-12T02:00:00Z'],
    ['SEMI_101','2026-07-14T19:00:00Z','2026-07-14T20:00:00Z'],
    // PDT (UTC-7): 3h tarde en fixture
    ['R32_081','2026-07-02T00:00:00Z','2026-07-02T03:00:00Z'],
    ['R32_082','2026-07-01T20:00:00Z','2026-07-01T23:00:00Z'],
    ['R32_084','2026-07-02T19:00:00Z','2026-07-02T22:00:00Z'],
    ['R32_085','2026-07-03T03:00:00Z','2026-07-04T06:00:00Z'],
    ['OCTA_094','2026-07-06T21:00:00Z','2026-07-07T03:00:00Z'],
    ['OCTA_096','2026-07-07T20:00:00Z','2026-07-07T23:00:00Z'],
    ['CUAR_098','2026-07-10T19:00:00Z','2026-07-10T22:00:00Z'],
  ];
  for (const [id, newUtc, oldUtc] of kickoffFixes) {
    await client.execute({
      sql: `UPDATE matches SET kickoff_at_utc = ? WHERE id = ? AND kickoff_at_utc = ?`,
      args: [newUtc, id, oldUtc],
    });
  }

  // Pronósticos de Jonathan (G025-G032) cargados por admin — olvidó registrarlos antes del lock.
  // INSERT OR IGNORE: idempotente, no pisa si ya existen.
  const jonathanPreds = [
    ['G025', 1, 0],
    ['G026', 0, 0],
    ['G027', 2, 1],
    ['G028', 1, 1],
    ['G029', 3, 0],
    ['G030', 0, 1],
    ['G031', 0, 0],
    ['G032', 2, 0],
  ];
  for (const [matchId, home, away] of jonathanPreds) {
    await client.execute({
      sql: `INSERT OR IGNORE INTO predictions (user_id, match_id, home_pred, away_pred, updated_at)
            SELECT id, ?, ?, ?, datetime('now') FROM users WHERE username = 'jonathan'`,
      args: [matchId, home, away],
    });
  }

  // Limpia scores 0-0 escritos erroneamente por el sync en partidos aún no disputados.
  await client.execute(
    `UPDATE matches
     SET home_score = NULL, away_score = NULL
     WHERE home_score = 0 AND away_score = 0
       AND kickoff_at_utc > datetime('now')`
  );

  // Corrige nombre incorrecto: Cristiano → Christian.
  await client.execute({
    sql: `UPDATE users SET display_name = 'Christian' WHERE username = 'christian' AND display_name = 'Cristiano'`,
    args: [],
  });

  // Resetea todos los Dieciseisavos para que el bracket-populator los repueble
  // con el bracket-config.json corregido el 2026-06-27.
  // Seguro: home_score IS NULL protege los partidos ya disputados.
  // Idempotente: poner NULL donde ya es NULL no tiene efecto.
  await client.execute(
    `UPDATE matches SET home = NULL, away = NULL
     WHERE phase = 'Dieciseisavos' AND home_score IS NULL AND away_score IS NULL`
  );

  // Corrige los 5 partidos R32 con terceros de grupo equivocados (bracket-config.json
  // usaba "3rd" generico; el populator asignaba por ranking global en lugar de por
  // el grupo especifico del bracket oficial FIFA 2026).
  // Fix: bracket-config.json ahora usa codigos especificos (3D, 3K, 3I, 3J, 3L).
  // Esta migracion aplica los equipos correctos inmediatamente sin esperar al sync.
  // Idempotente: WHERE home_score IS NULL protege partidos ya disputados.
  const r32ThirdFixes = [
    ['R32_074', 'ALEMANIA',       'PARAGUAY'],
    ['R32_080', 'INGLATERRA',     'REP. DEL CONGO'],
    ['R32_082', 'BELGICA',        'SENEGAL'],
    ['R32_085', 'SUIZA',          'ARGELIA'],
    ['R32_087', 'COLOMBIA',       'GHANA'],
  ];
  for (const [id, home, away] of r32ThirdFixes) {
    await client.execute({
      sql: `UPDATE matches SET home = ?, away = ? WHERE id = ? AND home_score IS NULL AND away_score IS NULL`,
      args: [home, away, id],
    });
  }
}

module.exports = { client, initDb };
