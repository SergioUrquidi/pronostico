const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'pronostico.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
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
    away_score INTEGER
  );

  CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    match_id TEXT NOT NULL REFERENCES matches(id),
    home_pred INTEGER NOT NULL,
    away_pred INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, match_id)
  );
`);

function seedIfEmpty() {
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
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
    const insertUser = db.prepare(`
      INSERT INTO users (username, display_name, password_hash, role, must_change_password)
      VALUES (?, ?, ?, ?, 1)
    `);
    for (const [username, displayName] of players) {
      insertUser.run(username, displayName, defaultHash, 'player');
    }
    insertUser.run('admin', 'Administrador', defaultHash, 'admin');
  }

  const matchCount = db.prepare('SELECT COUNT(*) AS n FROM matches').get().n;
  if (matchCount === 0) {
    const fixture = require('./data/fixture.json');
    const insertMatch = db.prepare(`
      INSERT INTO matches (id, num, phase, group_name, home, away, stadium, date_local, time_local, kickoff_at_utc)
      VALUES (@id, @num, @phase, @group, @home, @away, @stadium, @date_local, @time_local, @kickoff_at_utc)
    `);
    const insertMany = db.transaction((rows) => {
      for (const row of rows) insertMatch.run(row);
    });
    insertMany(fixture);
  }

  const configCount = db.prepare('SELECT COUNT(*) AS n FROM config').get().n;
  if (configCount === 0) {
    db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('lock_minutes_before_kickoff', '60');
  }
}

seedIfEmpty();

module.exports = db;
