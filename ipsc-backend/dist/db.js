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
    shooter_id INTEGER NOT NULL REFERENCES shooters(id),
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
const divisionColumns = db.prepare(`PRAGMA table_info(divisions)`).all();
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
}
catch {
    // If legacy data has duplicate codes in the same match, keep DB startup working.
}
// Shooter table migration (idempotent)
const getShooterColumns = () => db.prepare(`PRAGMA table_info(shooters)`).all();
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
    }
    catch (err) {
        db.exec(`ROLLBACK`);
        db.exec(`PRAGMA foreign_keys = ON`);
        throw err;
    }
    db.exec(`PRAGMA foreign_keys = ON`);
}
shooterColumns = getShooterColumns();
existingShooterColumns = new Set(shooterColumns.map((c) => c.name));
export default db;
