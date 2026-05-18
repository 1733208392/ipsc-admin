import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'ipsc.db');
const db = new Database(dbPath);

// Enable WAL mode and foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create all tables
db.exec(`
  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','completed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS divisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE(match_id, code)
  );

  CREATE TABLE IF NOT EXISTS stages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    min_rounds INTEGER NOT NULL DEFAULT 0,
    max_points INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS squads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS shooters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    division_id INTEGER NOT NULL REFERENCES divisions(id),
    squad_id INTEGER REFERENCES squads(id),
    name TEXT NOT NULL,
    bib_number TEXT NOT NULL,
    age INTEGER,
    gender TEXT,
    region TEXT,
    club TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    shooter_id INTEGER NOT NULL REFERENCES shooters(id) ON DELETE CASCADE,
    stage_id INTEGER NOT NULL REFERENCES stages(id),
    total_time REAL NOT NULL,
    a_hits INTEGER NOT NULL DEFAULT 0,
    c_hits INTEGER NOT NULL DEFAULT 0,
    d_hits INTEGER NOT NULL DEFAULT 0,
    m_hits INTEGER NOT NULL DEFAULT 0,
    n_hits INTEGER NOT NULL DEFAULT 0,
    pe INTEGER NOT NULL DEFAULT 0,
    first_shot REAL,
    fastest_split REAL,
    total_points REAL NOT NULL DEFAULT 0,
    hit_factor REAL NOT NULL DEFAULT 0,
    confirmed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(shooter_id, stage_id)
  );
`);

// Divisions table migration (idempotent)
const divisionColumns = db.prepare(`PRAGMA table_info(divisions)`).all() as Array<{ name: string }>;
const existingDivisionColumns = new Set(divisionColumns.map((c) => c.name));

if (!existingDivisionColumns.has('code')) {
  db.exec(`ALTER TABLE divisions ADD COLUMN code TEXT`);
}

// Backfill code for legacy rows where possible.
db.exec(`UPDATE divisions SET code = 'production' WHERE code IS NULL AND name LIKE '%原厂%' AND name NOT LIKE '%光学%'`);
db.exec(`UPDATE divisions SET code = 'optics' WHERE code IS NULL AND name LIKE '%光学%'`);
db.exec(`UPDATE divisions SET code = 'open' WHERE code IS NULL AND (name LIKE '%开放%' OR name LIKE '%Open%')`);
db.exec(`UPDATE divisions SET code = 'standard' WHERE code IS NULL AND (name LIKE '%标准%' OR name LIKE '%Standard%')`);
db.exec(`UPDATE divisions SET code = 'classic' WHERE code IS NULL AND (name LIKE '%经典%' OR name LIKE '%Classic%')`);

// Legacy power_factor column is intentionally kept for compatibility with old DB files.
try {
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_divisions_match_code_unique ON divisions(match_id, code)`);
} catch {
  // If legacy data has duplicate codes in the same match, keep DB startup working.
}

// Shooter table migration (idempotent)
const getShooterColumns = () => db.prepare(`PRAGMA table_info(shooters)`).all() as Array<{
  name: string;
  notnull: number;
}>;

let shooterColumns = getShooterColumns();
let existingShooterColumns = new Set(shooterColumns.map((c) => c.name));

if (!existingShooterColumns.has('created_at')) {
  db.exec(`ALTER TABLE shooters ADD COLUMN created_at TEXT`);
  db.exec(`UPDATE shooters SET created_at = datetime('now') WHERE created_at IS NULL`);
}

// Ensure legacy optional profile columns exist before any table rebuild copy.
if (!existingShooterColumns.has('age')) {
  db.exec(`ALTER TABLE shooters ADD COLUMN age INTEGER`);
}
if (!existingShooterColumns.has('gender')) {
  db.exec(`ALTER TABLE shooters ADD COLUMN gender TEXT`);
}
if (!existingShooterColumns.has('region')) {
  db.exec(`ALTER TABLE shooters ADD COLUMN region TEXT`);
}
if (!existingShooterColumns.has('club')) {
  db.exec(`ALTER TABLE shooters ADD COLUMN club TEXT`);
}

shooterColumns = getShooterColumns();
const squadColumn = shooterColumns.find((c) => c.name === 'squad_id');

if (squadColumn && squadColumn.notnull === 1) {
  db.exec(`PRAGMA foreign_keys = OFF`);
  db.exec(`BEGIN TRANSACTION`);
  try {
    db.exec(`
      CREATE TABLE shooters_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        division_id INTEGER NOT NULL REFERENCES divisions(id),
        squad_id INTEGER REFERENCES squads(id),
        name TEXT NOT NULL,
        bib_number TEXT NOT NULL,
        age INTEGER,
        gender TEXT,
        region TEXT,
        club TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`
      INSERT INTO shooters_new (id, match_id, division_id, squad_id, name, bib_number, age, gender, region, club, created_at)
      SELECT id, match_id, division_id, squad_id, name, bib_number, age, gender, region, club, COALESCE(created_at, datetime('now'))
      FROM shooters
    `);
    db.exec(`DROP TABLE shooters`);
    db.exec(`ALTER TABLE shooters_new RENAME TO shooters`);
    db.exec(`COMMIT`);
  } catch (err) {
    db.exec(`ROLLBACK`);
    db.exec(`PRAGMA foreign_keys = ON`);
    throw err;
  }
  db.exec(`PRAGMA foreign_keys = ON`);
}

shooterColumns = getShooterColumns();
existingShooterColumns = new Set(shooterColumns.map((c) => c.name));

// Scores table migration: ensure shooter_id has ON DELETE CASCADE
const scoresColumns = db.prepare(`PRAGMA table_info(scores)`).all() as Array<{ name: string }>;
const existingScoresColumns = new Set(scoresColumns.map((c) => c.name));

// Check if we need to recreate scores table for proper foreign key constraint
// This is a simplified check - we just try to delete a non-existent shooter to verify the constraint
try {
  const testResult = db.prepare(`PRAGMA foreign_key_list(scores)`).all() as Array<{
    table: string;
    from: string;
    to: string;
    on_delete: string;
  }>;
  const shooterFk = testResult.find((fk) => fk.from === 'shooter_id');
  if (shooterFk && shooterFk.on_delete !== 'CASCADE') {
    // Need to recreate scores table with proper cascade delete
    db.exec(`PRAGMA foreign_keys = OFF`);
    db.exec(`BEGIN TRANSACTION`);
    try {
      db.exec(`
        CREATE TABLE scores_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
          shooter_id INTEGER NOT NULL REFERENCES shooters(id) ON DELETE CASCADE,
          stage_id INTEGER NOT NULL REFERENCES stages(id),
          total_time REAL NOT NULL,
          a_hits INTEGER NOT NULL DEFAULT 0,
          c_hits INTEGER NOT NULL DEFAULT 0,
          d_hits INTEGER NOT NULL DEFAULT 0,
          m_hits INTEGER NOT NULL DEFAULT 0,
          n_hits INTEGER NOT NULL DEFAULT 0,
          pe INTEGER NOT NULL DEFAULT 0,
          first_shot REAL,
          fastest_split REAL,
          total_points REAL NOT NULL DEFAULT 0,
          hit_factor REAL NOT NULL DEFAULT 0,
          confirmed INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(shooter_id, stage_id)
        )
      `);
      db.exec(`
        INSERT INTO scores_new (id, match_id, shooter_id, stage_id, total_time, a_hits, c_hits, d_hits, m_hits, n_hits, pe, first_shot, fastest_split, total_points, hit_factor, confirmed, created_at, updated_at)
        SELECT id, match_id, shooter_id, stage_id, total_time, a_hits, c_hits, d_hits, m_hits, n_hits, pe, first_shot, fastest_split, total_points, hit_factor, confirmed, created_at, updated_at
        FROM scores
      `);
      db.exec(`DROP TABLE scores`);
      db.exec(`ALTER TABLE scores_new RENAME TO scores`);
      db.exec(`COMMIT`);
    } catch (err) {
      db.exec(`ROLLBACK`);
      db.exec(`PRAGMA foreign_keys = ON`);
      throw err;
    }
    db.exec(`PRAGMA foreign_keys = ON`);
  }
} catch {
  // If migration fails, continue - the table may have correct constraints already
}

// Migration: Ensure all matches have 5 default divisions
import { DEFAULT_DIVISIONS } from './constants.js';

try {
  const matches = db.prepare(`SELECT id FROM matches`).all() as Array<{ id: number }>;
  const insertDivision = db.prepare(
    `INSERT INTO divisions (match_id, code, name, sort_order) VALUES (?, ?, ?, ?)`
  );

  for (const match of matches) {
    for (const division of DEFAULT_DIVISIONS) {
      // Only insert if it doesn't already exist (check by match_id and code)
      const exists = db
        .prepare(`SELECT 1 FROM divisions WHERE match_id = ? AND code = ?`)
        .get(match.id, division.code);
      if (!exists) {
        try {
          insertDivision.run(match.id, division.code, division.name, division.sort_order);
        } catch {
          // If insert fails (e.g., duplicate), continue
        }
      }
    }
  }
} catch {
  // If migration fails, continue
}

export default db;
