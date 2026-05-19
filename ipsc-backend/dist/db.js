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
    stage_points INTEGER NOT NULL DEFAULT 0,
    targets_count INTEGER NOT NULL DEFAULT 0,
    poppers_plates_count INTEGER NOT NULL DEFAULT 0,
    briefing_text TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS stage_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stage_id INTEGER NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
    status TEXT NOT NULL DEFAULT 'normal' CHECK(status IN ('normal','dnf','dq')),
    review_state TEXT NOT NULL DEFAULT 'draft' CHECK(review_state IN ('draft','submitted')),
    review_submitted_at TEXT,
    total_points REAL NOT NULL DEFAULT 0,
    hit_factor REAL NOT NULL DEFAULT 0,
    confirmed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS score_card_rows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    score_id INTEGER NOT NULL REFERENCES scores(id) ON DELETE CASCADE,
    row_type TEXT NOT NULL CHECK(row_type IN ('paper','steel')),
    row_no INTEGER NOT NULL,
    a_hits INTEGER NOT NULL DEFAULT 0,
    c_hits INTEGER NOT NULL DEFAULT 0,
    d_hits INTEGER NOT NULL DEFAULT 0,
    m_hits INTEGER NOT NULL DEFAULT 0,
    ns_hits INTEGER NOT NULL DEFAULT 0,
    npm_hits INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(score_id, row_type, row_no)
  );

  CREATE TABLE IF NOT EXISTS score_penalties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    score_id INTEGER NOT NULL REFERENCES scores(id) ON DELETE CASCADE,
    reason_code TEXT NOT NULL,
    reason_label TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(score_id, reason_code)
  );

  CREATE TABLE IF NOT EXISTS sub_divisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    min_age INTEGER,
    max_age INTEGER,
    gender TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
// Divisions table migration (idempotent)
const divisionColumns = db.prepare(`PRAGMA table_info(divisions)`).all();
const existingDivisionColumns = new Set(divisionColumns.map((c) => c.name));
// Stages table migration (idempotent)
const stageColumns = db.prepare(`PRAGMA table_info(stages)`).all();
const existingStageColumns = new Set(stageColumns.map((c) => c.name));
if (!existingStageColumns.has('max_points')) {
    db.exec(`ALTER TABLE stages ADD COLUMN max_points INTEGER NOT NULL DEFAULT 0`);
}
if (!existingStageColumns.has('stage_points')) {
    db.exec(`ALTER TABLE stages ADD COLUMN stage_points INTEGER NOT NULL DEFAULT 0`);
    db.exec(`UPDATE stages SET stage_points = max_points`);
}
if (!existingStageColumns.has('targets_count')) {
    db.exec(`ALTER TABLE stages ADD COLUMN targets_count INTEGER NOT NULL DEFAULT 0`);
}
if (!existingStageColumns.has('poppers_plates_count')) {
    db.exec(`ALTER TABLE stages ADD COLUMN poppers_plates_count INTEGER NOT NULL DEFAULT 0`);
}
if (!existingStageColumns.has('briefing_text')) {
    db.exec(`ALTER TABLE stages ADD COLUMN briefing_text TEXT NOT NULL DEFAULT ''`);
}
db.exec(`UPDATE stages SET max_points = stage_points WHERE max_points = 0 AND stage_points > 0`);
db.exec(`UPDATE stages SET stage_points = max_points WHERE stage_points = 0 AND max_points > 0`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_stage_attachments_stage_id ON stage_attachments(stage_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_stage_attachments_match_id ON stage_attachments(match_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_score_card_rows_score_id ON score_card_rows(score_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_score_penalties_score_id ON score_penalties(score_id)`);
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
// Scores table migration: ensure shooter_id has ON DELETE CASCADE
const scoresColumns = db.prepare(`PRAGMA table_info(scores)`).all();
const existingScoresColumns = new Set(scoresColumns.map((c) => c.name));
if (!existingScoresColumns.has('status')) {
    db.exec(`ALTER TABLE scores ADD COLUMN status TEXT NOT NULL DEFAULT 'normal'`);
}
if (!existingScoresColumns.has('review_state')) {
    db.exec(`ALTER TABLE scores ADD COLUMN review_state TEXT NOT NULL DEFAULT 'draft'`);
}
if (!existingScoresColumns.has('review_submitted_at')) {
    db.exec(`ALTER TABLE scores ADD COLUMN review_submitted_at TEXT`);
}
if (!existingScoresColumns.has('submitted_at')) {
    db.exec(`ALTER TABLE scores ADD COLUMN submitted_at TEXT`);
    db.exec(`UPDATE scores SET submitted_at = COALESCE(updated_at, created_at, datetime('now')) WHERE submitted_at IS NULL`);
}
db.exec(`UPDATE scores SET status = 'normal' WHERE status IS NULL OR status = ''`);
db.exec(`UPDATE scores SET review_state = 'draft' WHERE review_state IS NULL OR review_state = ''`);
// Check if we need to recreate scores table for proper foreign key constraint
// or to drop legacy unique(shooter_id, stage_id) that blocks multiple submissions.
try {
    const testResult = db.prepare(`PRAGMA foreign_key_list(scores)`).all();
    const shooterFk = testResult.find((fk) => fk.from === 'shooter_id');
    const scoreIndexes = db.prepare(`PRAGMA index_list(scores)`).all();
    const hasLegacyShooterStageUnique = scoreIndexes.some((idx) => {
        if (!idx.unique)
            return false;
        const cols = db.prepare(`PRAGMA index_info(${JSON.stringify(idx.name)})`).all();
        const names = cols.map((c) => c.name);
        return names.length === 2 && names.includes('shooter_id') && names.includes('stage_id');
    });
    if ((shooterFk && shooterFk.on_delete !== 'CASCADE') || hasLegacyShooterStageUnique) {
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
          status TEXT NOT NULL DEFAULT 'normal' CHECK(status IN ('normal','dnf','dq')),
          review_state TEXT NOT NULL DEFAULT 'draft' CHECK(review_state IN ('draft','submitted')),
          review_submitted_at TEXT,
          total_points REAL NOT NULL DEFAULT 0,
          hit_factor REAL NOT NULL DEFAULT 0,
          confirmed INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
            db.exec(`
        INSERT INTO scores_new (id, match_id, shooter_id, stage_id, total_time, a_hits, c_hits, d_hits, m_hits, n_hits, pe, first_shot, fastest_split, status, review_state, review_submitted_at, total_points, hit_factor, confirmed, created_at, updated_at, submitted_at)
        SELECT id, match_id, shooter_id, stage_id, total_time, a_hits, c_hits, d_hits, m_hits, n_hits, pe, first_shot, fastest_split, COALESCE(status, 'normal'), COALESCE(review_state, 'draft'), review_submitted_at, total_points, hit_factor, confirmed, created_at, updated_at, COALESCE(submitted_at, created_at, datetime('now'))
        FROM scores
      `);
            db.exec(`DROP TABLE scores`);
            db.exec(`ALTER TABLE scores_new RENAME TO scores`);
            db.exec(`COMMIT`);
        }
        catch (err) {
            db.exec(`ROLLBACK`);
            db.exec(`PRAGMA foreign_keys = ON`);
            throw err;
        }
        db.exec(`PRAGMA foreign_keys = ON`);
    }
}
catch {
    // If migration fails, continue - the table may have correct constraints already
}
// Migration: Ensure all matches have 5 default divisions
import { DEFAULT_DIVISIONS, DIVISION_POWER_FACTOR } from './constants.js';
try {
    const matches = db.prepare(`SELECT id FROM matches`).all();
    const insertDivision = db.prepare(`INSERT INTO divisions (match_id, code, name, power_factor, sort_order) VALUES (?, ?, ?, ?, ?)`);
    for (const match of matches) {
        for (const division of DEFAULT_DIVISIONS) {
            // Only insert if it doesn't already exist (check by match_id and code)
            const exists = db
                .prepare(`SELECT 1 FROM divisions WHERE match_id = ? AND code = ?`)
                .get(match.id, division.code);
            if (!exists) {
                try {
                    const powerFactor = DIVISION_POWER_FACTOR[division.code];
                    insertDivision.run(match.id, division.code, division.name, powerFactor, division.sort_order);
                }
                catch {
                    // If insert fails (e.g., duplicate), continue
                }
            }
        }
    }
}
catch {
    // If migration fails, continue
}
// Migration: Ensure all matches have default sub-divisions
import { DEFAULT_SUB_DIVISIONS } from './constants.js';
try {
    const matches = db.prepare(`SELECT id FROM matches`).all();
    const insertSubDivision = db.prepare(`INSERT INTO sub_divisions (match_id, name, min_age, max_age, gender, sort_order) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const match of matches) {
        for (const subDiv of DEFAULT_SUB_DIVISIONS) {
            // Only insert if it doesn't already exist (check by match_id and name)
            const exists = db
                .prepare(`SELECT 1 FROM sub_divisions WHERE match_id = ? AND name = ?`)
                .get(match.id, subDiv.name);
            if (!exists) {
                try {
                    insertSubDivision.run(match.id, subDiv.name, subDiv.min_age ?? null, subDiv.max_age ?? null, subDiv.gender ?? null, subDiv.sort_order);
                }
                catch {
                    // If insert fails (e.g., duplicate), continue
                }
            }
        }
    }
}
catch {
    // If migration fails, continue
}
export default db;
