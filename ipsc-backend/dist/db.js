import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { DEFAULT_DIVISIONS, DEFAULT_SUB_DIVISIONS, DIVISION_POWER_FACTOR } from './constants.js';
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
  CREATE TABLE IF NOT EXISTS clubs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    short_name TEXT NOT NULL,
    contact_name TEXT,
    contact_phone TEXT,
    is_personal INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'club_admin' CHECK(role IN ('super_admin','club_admin','shooter')),
    club_id INTEGER REFERENCES clubs(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    jti TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    revoked_at TEXT
  );

  CREATE TABLE IF NOT EXISTS shooters_global (
    uid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    gender TEXT NOT NULL CHECK(gender IN ('male','female')),
    age INTEGER,
    region TEXT,
    default_club_id INTEGER REFERENCES clubs(id) ON DELETE SET NULL,
    id_card TEXT UNIQUE,
    phone TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

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
    shooter_uid TEXT,
    name TEXT NOT NULL,
    bib_number TEXT NOT NULL,
    category_code TEXT CHECK(category_code IN ('J','S','SJ','L')),
    age INTEGER,
    gender TEXT,
    region TEXT,
    club TEXT,
    club_id INTEGER REFERENCES clubs(id) ON DELETE SET NULL,
    "class" TEXT,
    factor TEXT CHECK(factor IN ('Minor', 'Major')),
    failed_factor INTEGER DEFAULT 0,
    disqualified_at DATETIME,
    absent_at DATETIME,
    membership_type TEXT DEFAULT NULL,
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

  CREATE TABLE IF NOT EXISTS drill_replays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    shooter_id INTEGER NOT NULL REFERENCES shooters(id) ON DELETE CASCADE,
    stage_id INTEGER NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
    drill_name TEXT,
    total_time REAL NOT NULL DEFAULT 0,
    num_shots INTEGER NOT NULL DEFAULT 0,
    score INTEGER,
    payload_json TEXT NOT NULL,
    client_drill_result_id TEXT,
    device_id TEXT,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_drill_replays_match ON drill_replays(match_id);
  CREATE INDEX IF NOT EXISTS idx_drill_replays_shooter ON drill_replays(shooter_id);
  CREATE INDEX IF NOT EXISTS idx_drill_replays_stage ON drill_replays(stage_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_drill_replays_client_uuid
    ON drill_replays(shooter_id, stage_id, client_drill_result_id)
    WHERE client_drill_result_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS drill_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    stage_id INTEGER NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    timeout INTEGER NOT NULL DEFAULT 1200,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS drill_template_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES drill_templates(id) ON DELETE CASCADE,
    seq_no INTEGER NOT NULL,
    target_name TEXT NOT NULL DEFAULT '',
    target_type TEXT NOT NULL DEFAULT '[]',
    timeout INTEGER NOT NULL DEFAULT 0,
    counted_shots INTEGER NOT NULL DEFAULT 0,
    target_variant TEXT,
    has_physical_popper INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE(template_id, seq_no)
  );

  CREATE INDEX IF NOT EXISTS idx_drill_templates_stage ON drill_templates(stage_id);
  CREATE INDEX IF NOT EXISTS idx_drill_templates_match ON drill_templates(match_id);
  CREATE INDEX IF NOT EXISTS idx_drill_targets_template ON drill_template_targets(template_id);
`);
function tableExists(tableName) {
    const row = db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
        .get(tableName);
    return Boolean(row);
}
function getTableColumns(tableName) {
    return db.prepare(`PRAGMA table_info(${tableName})`).all();
}
function getTableSql(tableName) {
    const row = db
        .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
        .get(tableName);
    return row?.sql ?? '';
}
function ensurePersonalClubColumn() {
    const columns = getTableColumns('clubs');
    if (!columns.some((column) => column.name === 'is_personal')) {
        db.exec(`ALTER TABLE clubs ADD COLUMN is_personal INTEGER NOT NULL DEFAULT 0`);
    }
}
function ensureDrillTemplateSchema() {
    if (!tableExists('drill_templates')) {
        return;
    }
    const columns = getTableColumns('drill_templates');
    const hasOwnerUserId = columns.some((column) => column.name === 'owner_user_id');
    if (hasOwnerUserId) {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_drill_templates_stage ON drill_templates(stage_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_drill_templates_match ON drill_templates(match_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_drill_templates_owner ON drill_templates(owner_user_id)`);
        return;
    }
    const beforeCount = db.prepare(`SELECT COUNT(*) AS c FROM drill_templates`).get().c;
    db.exec(`DROP TABLE IF EXISTS drill_templates_new`);
    db.exec(`PRAGMA foreign_keys = OFF`);
    db.exec(`BEGIN TRANSACTION`);
    try {
        db.exec(`
      CREATE TABLE drill_templates_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
        stage_id INTEGER REFERENCES stages(id) ON DELETE CASCADE,
        owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        timeout INTEGER NOT NULL DEFAULT 1200,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK (
          (match_id IS NOT NULL AND stage_id IS NOT NULL AND owner_user_id IS NULL) OR
          (match_id IS NULL AND stage_id IS NULL AND owner_user_id IS NOT NULL)
        )
      )
    `);
        db.exec(`
      INSERT INTO drill_templates_new (id, match_id, stage_id, owner_user_id, name, timeout, sort_order, created_at, updated_at)
      SELECT id, match_id, stage_id, NULL, name, timeout, sort_order, created_at, updated_at
      FROM drill_templates
    `);
        db.exec(`DROP TABLE drill_templates`);
        db.exec(`ALTER TABLE drill_templates_new RENAME TO drill_templates`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_drill_templates_stage ON drill_templates(stage_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_drill_templates_match ON drill_templates(match_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_drill_templates_owner ON drill_templates(owner_user_id)`);
        db.exec(`COMMIT`);
    }
    catch (err) {
        db.exec(`ROLLBACK`);
        throw err;
    }
    finally {
        db.exec(`PRAGMA foreign_keys = ON`);
    }
    const afterCount = db.prepare(`SELECT COUNT(*) AS c FROM drill_templates`).get().c;
    if (beforeCount !== afterCount) {
        throw new Error(`drill_templates migration row count mismatch: before=${beforeCount} after=${afterCount}`);
    }
}
function ensureShooterSchema() {
    if (!tableExists('shooters')) {
        return;
    }
    const columns = getTableColumns('shooters');
    const columnNames = new Set(columns.map((column) => column.name));
    const tableSql = getTableSql('shooters');
    const hasLegacyQuotedFactorCheck = /CHECK\s*\(\s*factor\s+IN\s*\(\s*"Minor"\s*,\s*"Major"\s*\)\s*\)/i.test(tableSql);
    const failedFactorColumn = columns.find((column) => column.name === 'failed_factor');
    const failedFactorIsNotNull = failedFactorColumn?.notnull === 1;
    const requiredColumns = [
        'shooter_uid',
        'club_id',
        'class',
        'factor',
        'failed_factor',
        'disqualified_at',
        'absent_at',
        'membership_type',
    ];
    const hasAllRequiredColumns = requiredColumns.every((name) => columnNames.has(name));
    if (hasAllRequiredColumns && !hasLegacyQuotedFactorCheck && !failedFactorIsNotNull) {
        return;
    }
    const copyFactorExpr = columnNames.has('factor')
        ? `CASE
         WHEN factor IS NULL THEN NULL
         WHEN LOWER(factor) = 'major' THEN 'Major'
         ELSE 'Minor'
       END`
        : `NULL`;
    const copyShooterUidExpr = columnNames.has('shooter_uid') ? 'shooter_uid' : 'NULL';
    const copyClubIdExpr = columnNames.has('club_id') ? 'club_id' : 'NULL';
    const copyClassExpr = columnNames.has('class') ? '"class"' : 'NULL';
    const copyFailedFactorExpr = columnNames.has('failed_factor') ? 'failed_factor' : '0';
    const copyDisqualifiedAtExpr = columnNames.has('disqualified_at') ? 'disqualified_at' : 'NULL';
    const copyAbsentAtExpr = columnNames.has('absent_at') ? 'absent_at' : 'NULL';
    const copyMembershipTypeExpr = columnNames.has('membership_type') ? 'membership_type' : 'NULL';
    const copyCategoryExpr = columnNames.has('category_code')
        ? `CASE
         WHEN category_code IS NULL THEN NULL
         WHEN UPPER(category_code) IN ('J', 'S', 'SJ', 'L') THEN UPPER(category_code)
         ELSE NULL
       END`
        : `NULL`;
    db.exec(`DROP TABLE IF EXISTS shooters_new`);
    db.exec(`PRAGMA foreign_keys = OFF`);
    db.exec(`BEGIN TRANSACTION`);
    try {
        db.exec(`
      CREATE TABLE shooters_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        division_id INTEGER NOT NULL REFERENCES divisions(id),
        squad_id INTEGER REFERENCES squads(id),
        shooter_uid TEXT,
        name TEXT NOT NULL,
        bib_number TEXT NOT NULL,
        category_code TEXT CHECK(category_code IN ('J','S','SJ','L')),
        age INTEGER,
        gender TEXT,
        region TEXT,
        club TEXT,
        club_id INTEGER REFERENCES clubs(id) ON DELETE SET NULL,
        "class" TEXT,
        factor TEXT CHECK(factor IN ('Minor', 'Major')),
        failed_factor INTEGER DEFAULT 0,
        disqualified_at DATETIME,
        absent_at DATETIME,
        membership_type TEXT DEFAULT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
        db.exec(`
      INSERT INTO shooters_new (
        id, match_id, division_id, squad_id, shooter_uid, name, bib_number, category_code,
        age, gender, region, club, club_id, "class", factor, failed_factor,
        disqualified_at, absent_at, membership_type, created_at
      )
      SELECT
        id, match_id, division_id, squad_id, ${copyShooterUidExpr}, name, bib_number, ${copyCategoryExpr},
        age, gender, region, club, ${copyClubIdExpr}, ${copyClassExpr}, ${copyFactorExpr}, ${copyFailedFactorExpr},
        ${copyDisqualifiedAtExpr}, ${copyAbsentAtExpr}, ${copyMembershipTypeExpr}, COALESCE(created_at, datetime('now'))
      FROM shooters
    `);
        db.exec(`DROP TABLE shooters`);
        db.exec(`ALTER TABLE shooters_new RENAME TO shooters`);
        db.exec(`COMMIT`);
    }
    catch (err) {
        db.exec(`ROLLBACK`);
        throw err;
    }
    finally {
        db.exec(`PRAGMA foreign_keys = ON`);
    }
}
function ensureDrillReplaySchema() {
    if (!tableExists('drill_replays')) {
        return;
    }
    const columns = getTableColumns('drill_replays');
    const hasOwnerUserId = columns.some((column) => column.name === 'owner_user_id');
    if (hasOwnerUserId) {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_drill_replays_match ON drill_replays(match_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_drill_replays_shooter ON drill_replays(shooter_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_drill_replays_stage ON drill_replays(stage_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_drill_replays_owner ON drill_replays(owner_user_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_drill_replays_template ON drill_replays(drill_template_id)`);
        db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_drill_replays_client_uuid
      ON drill_replays(shooter_id, stage_id, client_drill_result_id)
      WHERE client_drill_result_id IS NOT NULL AND shooter_id IS NOT NULL
    `);
        db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_drill_replays_client_uuid_personal
      ON drill_replays(owner_user_id, client_drill_result_id)
      WHERE client_drill_result_id IS NOT NULL AND owner_user_id IS NOT NULL
    `);
        return;
    }
    const beforeCount = db.prepare(`SELECT COUNT(*) AS c FROM drill_replays`).get().c;
    db.exec(`DROP TABLE IF EXISTS drill_replays_new`);
    db.exec(`PRAGMA foreign_keys = OFF`);
    db.exec(`BEGIN TRANSACTION`);
    try {
        db.exec(`
      CREATE TABLE drill_replays_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
        shooter_id INTEGER REFERENCES shooters(id) ON DELETE CASCADE,
        stage_id INTEGER REFERENCES stages(id) ON DELETE CASCADE,
        owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        drill_template_id INTEGER REFERENCES drill_templates(id) ON DELETE SET NULL,
        drill_name TEXT,
        total_time REAL NOT NULL DEFAULT 0,
        num_shots INTEGER NOT NULL DEFAULT 0,
        score INTEGER,
        payload_json TEXT NOT NULL,
        client_drill_result_id TEXT,
        device_id TEXT,
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK (
          (match_id IS NOT NULL AND shooter_id IS NOT NULL AND stage_id IS NOT NULL AND owner_user_id IS NULL) OR
          (match_id IS NULL AND shooter_id IS NULL AND stage_id IS NULL AND owner_user_id IS NOT NULL)
        )
      )
    `);
        db.exec(`
      INSERT INTO drill_replays_new (
        id, match_id, shooter_id, stage_id, owner_user_id, drill_template_id, drill_name,
        total_time, num_shots, score, payload_json, client_drill_result_id, device_id, uploaded_by, created_at
      )
      SELECT
        id, match_id, shooter_id, stage_id, NULL, NULL, drill_name,
        total_time, num_shots, score, payload_json, client_drill_result_id, device_id, uploaded_by, created_at
      FROM drill_replays
    `);
        db.exec(`DROP TABLE drill_replays`);
        db.exec(`ALTER TABLE drill_replays_new RENAME TO drill_replays`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_drill_replays_match ON drill_replays(match_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_drill_replays_shooter ON drill_replays(shooter_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_drill_replays_stage ON drill_replays(stage_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_drill_replays_owner ON drill_replays(owner_user_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_drill_replays_template ON drill_replays(drill_template_id)`);
        db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_drill_replays_client_uuid
      ON drill_replays(shooter_id, stage_id, client_drill_result_id)
      WHERE client_drill_result_id IS NOT NULL AND shooter_id IS NOT NULL
    `);
        db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_drill_replays_client_uuid_personal
      ON drill_replays(owner_user_id, client_drill_result_id)
      WHERE client_drill_result_id IS NOT NULL AND owner_user_id IS NOT NULL
    `);
        db.exec(`COMMIT`);
    }
    catch (err) {
        db.exec(`ROLLBACK`);
        throw err;
    }
    finally {
        db.exec(`PRAGMA foreign_keys = ON`);
    }
    const afterCount = db.prepare(`SELECT COUNT(*) AS c FROM drill_replays`).get().c;
    if (beforeCount !== afterCount) {
        throw new Error(`drill_replays migration row count mismatch: before=${beforeCount} after=${afterCount}`);
    }
}
ensurePersonalClubColumn();
ensureShooterSchema();
ensureDrillTemplateSchema();
ensureDrillReplaySchema();
const clubCount = db.prepare(`SELECT COUNT(*) AS c FROM clubs`).get().c;
if (clubCount === 0) {
    db.prepare(`INSERT INTO clubs (name, short_name, contact_name, contact_phone, is_personal, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, 'active', datetime('now'), datetime('now'))`).run('Default Club', 'DEFAULT', null, null);
}
const defaultClub = db
    .prepare(`SELECT id FROM clubs WHERE status = 'active' ORDER BY id LIMIT 1`)
    .get();
if (!defaultClub) {
    throw new Error('No active club found for bootstrapping account system');
}
const matchColumns = db.prepare(`PRAGMA table_info(matches)`).all();
if (!matchColumns.some((c) => c.name === 'club_id')) {
    db.exec(`ALTER TABLE matches ADD COLUMN club_id INTEGER`);
}
db.prepare(`UPDATE matches SET club_id = ? WHERE club_id IS NULL`).run(defaultClub.id);
const shooterBootstrapColumns = db.prepare(`PRAGMA table_info(shooters)`).all();
if (!shooterBootstrapColumns.some((c) => c.name === 'shooter_uid')) {
    db.exec(`ALTER TABLE shooters ADD COLUMN shooter_uid TEXT`);
}
if (!shooterBootstrapColumns.some((c) => c.name === 'club_id')) {
    db.exec(`ALTER TABLE shooters ADD COLUMN club_id INTEGER`);
}
db.exec(`
  UPDATE shooters
  SET club_id = (
    SELECT m.club_id FROM matches m WHERE m.id = shooters.match_id
  )
  WHERE club_id IS NULL
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
if (!existingShooterColumns.has('club_id')) {
    db.exec(`ALTER TABLE shooters ADD COLUMN club_id INTEGER`);
}
if (!existingShooterColumns.has('category_code')) {
    db.exec(`ALTER TABLE shooters ADD COLUMN category_code TEXT`);
    db.exec(`UPDATE shooters SET category_code = UPPER(category_code) WHERE category_code IS NOT NULL`);
    db.exec(`UPDATE shooters SET category_code = NULL WHERE category_code NOT IN ('J','S','SJ','L')`);
}
if (!existingShooterColumns.has('class')) {
    db.exec(`ALTER TABLE shooters ADD COLUMN "class" TEXT`);
}
if (!existingShooterColumns.has('factor')) {
    db.exec(`ALTER TABLE shooters ADD COLUMN factor TEXT CHECK(factor IN ('Minor', 'Major'))`);
}
if (!existingShooterColumns.has('failed_factor')) {
    db.exec(`ALTER TABLE shooters ADD COLUMN failed_factor INTEGER DEFAULT 0`);
}
if (!existingShooterColumns.has('disqualified_at')) {
    db.exec(`ALTER TABLE shooters ADD COLUMN disqualified_at DATETIME`);
}
if (!existingShooterColumns.has('absent_at')) {
    db.exec(`ALTER TABLE shooters ADD COLUMN absent_at DATETIME`);
}
if (!existingShooterColumns.has('membership_type')) {
    db.exec(`ALTER TABLE shooters ADD COLUMN membership_type TEXT DEFAULT NULL`);
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
        category_code TEXT CHECK(category_code IN ('J','S','SJ','L')),
        age INTEGER,
        gender TEXT,
        region TEXT,
        club TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
        db.exec(`
      INSERT INTO shooters_new (id, match_id, division_id, squad_id, name, bib_number, category_code, age, gender, region, club, created_at)
      SELECT id, match_id, division_id, squad_id, name, bib_number, category_code, age, gender, region, club, COALESCE(created_at, datetime('now'))
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
if (!existingShooterColumns.has('shooter_uid')) {
    db.exec(`ALTER TABLE shooters ADD COLUMN shooter_uid TEXT`);
}
if (!existingShooterColumns.has('club_id')) {
    db.exec(`ALTER TABLE shooters ADD COLUMN club_id INTEGER`);
}
if (!existingShooterColumns.has('category_code')) {
    db.exec(`ALTER TABLE shooters ADD COLUMN category_code TEXT`);
    db.exec(`UPDATE shooters SET category_code = UPPER(category_code) WHERE category_code IS NOT NULL`);
    db.exec(`UPDATE shooters SET category_code = NULL WHERE category_code NOT IN ('J','S','SJ','L')`);
}
db.exec(`
  UPDATE shooters
  SET club_id = (
    SELECT m.club_id FROM matches m WHERE m.id = shooters.match_id
  )
  WHERE club_id IS NULL
`);
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
try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_matches_club_id ON matches(club_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_shooters_club_id ON shooters(club_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_shooters_shooter_uid ON shooters(shooter_uid)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_users_club_id ON users(club_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_shooters_global_name ON shooters_global(name)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at)`);
}
catch {
    // Keep startup resilient for legacy DB oddities.
}
try {
    db.exec(`DELETE FROM refresh_tokens WHERE revoked = 1 OR datetime(expires_at) <= datetime('now')`);
}
catch {
    // Skip cleanup on malformed legacy rows.
}
const usersCount = db.prepare(`SELECT COUNT(*) AS c FROM users`).get().c;
if (usersCount === 0) {
    const defaultAdminPassword = process.env['DEFAULT_ADMIN_PASSWORD'] || 'admin123456';
    const defaultClubPassword = process.env['DEFAULT_CLUB_ADMIN_PASSWORD'] || 'club123456';
    db.prepare(`INSERT INTO users (username, password_hash, role, club_id, name, status, created_at, updated_at)
     VALUES (?, ?, 'super_admin', NULL, ?, 'active', datetime('now'), datetime('now'))`).run('superadmin', bcrypt.hashSync(defaultAdminPassword, 10), 'Platform Super Admin');
    db.prepare(`INSERT INTO users (username, password_hash, role, club_id, name, status, created_at, updated_at)
     VALUES (?, ?, 'club_admin', ?, ?, 'active', datetime('now'), datetime('now'))`).run('clubadmin', bcrypt.hashSync(defaultClubPassword, 10), defaultClub.id, 'Default Club Admin');
}
// ── Auth V2: users table extension + new identity/verification tables ─────────
function ensureAuthV2Schema() {
    // 1. users table: add new columns (password_hash nullable, email, phone, verified fields, avatar, locale)
    const userCols = db.prepare(`PRAGMA table_info(users)`).all();
    const userColNames = new Set(userCols.map((c) => c.name));
    if (!userColNames.has('email')) {
        db.exec(`ALTER TABLE users ADD COLUMN email TEXT`);
    }
    if (!userColNames.has('phone')) {
        db.exec(`ALTER TABLE users ADD COLUMN phone TEXT`);
    }
    if (!userColNames.has('email_verified_at')) {
        db.exec(`ALTER TABLE users ADD COLUMN email_verified_at TEXT`);
    }
    if (!userColNames.has('phone_verified_at')) {
        db.exec(`ALTER TABLE users ADD COLUMN phone_verified_at TEXT`);
    }
    if (!userColNames.has('avatar_url')) {
        db.exec(`ALTER TABLE users ADD COLUMN avatar_url TEXT`);
    }
    if (!userColNames.has('locale')) {
        db.exec(`ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT 'zh-CN'`);
    }
    // Email/phone unique indexes (allow NULLs — SQLite treats NULL as distinct)
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL`);
    // Backfill email/phone for legacy users where username looks like an email or phone
    db.exec(`UPDATE users SET email = username WHERE email IS NULL AND username LIKE '%@%'`);
    db.exec(`UPDATE users SET phone = username WHERE phone IS NULL AND username GLOB '[0-9]*' AND length(username) >= 8`);
    // 2. user_identities table — links multiple OAuth/email/phone providers to a single user
    if (!tableExists('user_identities')) {
        db.exec(`
      CREATE TABLE user_identities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL CHECK(provider IN ('email','phone','apple','google','wechat')),
        provider_uid TEXT NOT NULL,
        provider_email TEXT,
        provider_name TEXT,
        raw_profile TEXT,
        linked_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_used_at TEXT,
        UNIQUE(provider, provider_uid)
      )
    `);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities(user_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_user_identities_lookup ON user_identities(provider, provider_uid)`);
    }
    // 3. verification_codes table — email/phone OTP codes
    if (!tableExists('verification_codes')) {
        db.exec(`
      CREATE TABLE verification_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel TEXT NOT NULL CHECK(channel IN ('email','phone')),
        target TEXT NOT NULL,
        code TEXT NOT NULL,
        purpose TEXT NOT NULL CHECK(purpose IN ('register','login','reset_password','bind')),
        expires_at TEXT NOT NULL,
        consumed_at TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        ip_address TEXT
      )
    `);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_verification_codes_target ON verification_codes(target, purpose)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_verification_codes_expires ON verification_codes(expires_at)`);
    }
    // Cleanup expired verification codes on startup
    db.exec(`DELETE FROM verification_codes WHERE datetime(expires_at) <= datetime('now')`);
}
try {
    ensureAuthV2Schema();
}
catch (err) {
    console.error('[db] Auth V2 schema migration failed:', err);
}
export default db;
