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
      args: ['lock_minutes_before_kickoff', '60'],
    });
  }
}

async function runMigrations() {
  const alterations = [
    'ALTER TABLE predictions ADD COLUMN advance_pred TEXT',
    'ALTER TABLE matches ADD COLUMN advance_winner TEXT',
  ];
  for (const sql of alterations) {
    try {
      await client.execute(sql);
    } catch (_) {
      // Column already exists — safe to ignore
    }
  }

  // Corrige kickoff_at_utc incorrecto: estadios CDT (UTC-5) de Mexico fueron cargados
  // con offset PDT (UTC-7). Idempotente: el WHERE solo matchea el valor viejo.
  await client.execute(`UPDATE matches SET kickoff_at_utc = '2026-06-18T02:00:00Z' WHERE id = 'G024' AND kickoff_at_utc = '2026-06-18T04:00:00Z'`);
  await client.execute(`UPDATE matches SET kickoff_at_utc = '2026-06-24T02:00:00Z' WHERE id = 'G048' AND kickoff_at_utc = '2026-06-24T04:00:00Z'`);

  // Limpia scores 0-0 escritos erroneamente por el sync en partidos aún no disputados.
  await client.execute(
    `UPDATE matches
     SET home_score = NULL, away_score = NULL
     WHERE home_score = 0 AND away_score = 0
       AND kickoff_at_utc > datetime('now')`
  );
}

module.exports = { client, initDb };
