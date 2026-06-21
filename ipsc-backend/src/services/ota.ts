import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import db from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OTA_FILES_DIR = path.resolve(__dirname, '..', '..', 'data', 'ota-files');

export interface OtaPackageRow {
  id: number;
  version: string;
  notes: string;
  filename: string;
  original_filename: string;
  size_bytes: number;
  checksum: string;
  address: string;
  status: 'draft' | 'published' | 'archived';
  is_latest: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export function ensureOtaFilesDir(): string {
  if (!fs.existsSync(OTA_FILES_DIR)) {
    fs.mkdirSync(OTA_FILES_DIR, { recursive: true });
  }
  return OTA_FILES_DIR;
}

export function getOtaFilesDir(): string {
  return ensureOtaFilesDir();
}

export function resolveOtaPublicBaseUrl(): string {
  return (process.env['OTA_PUBLIC_BASE_URL'] || 'https://api.grwolf.com').replace(/\/$/, '');
}

export function buildOtaAddress(filename: string): string {
  return `${resolveOtaPublicBaseUrl()}/ota/files/${filename}`;
}

export async function computeFileSha1Hex(filePath: string): Promise<string> {
  const sha1 = crypto.createHash('sha1');

  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk: Buffer) => sha1.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });

  return sha1.digest('hex');
}

export function listOtaPackages(status: 'draft' | 'published' | 'archived' | undefined, page: number, limit: number) {
  const offset = (page - 1) * limit;

  if (status) {
    const rows = db.prepare(
      `SELECT * FROM ota_packages WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
    ).all(status, limit, offset) as OtaPackageRow[];

    const total = (db.prepare(`SELECT COUNT(*) AS c FROM ota_packages WHERE status = ?`).get(status) as { c: number }).c;
    return { rows, total, page, limit };
  }

  const rows = db.prepare(
    `SELECT * FROM ota_packages ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
  ).all(limit, offset) as OtaPackageRow[];

  const total = (db.prepare(`SELECT COUNT(*) AS c FROM ota_packages`).get() as { c: number }).c;
  return { rows, total, page, limit };
}

export function getOtaPackageById(id: number): OtaPackageRow | undefined {
  return db.prepare(`SELECT * FROM ota_packages WHERE id = ?`).get(id) as OtaPackageRow | undefined;
}

export function getPublishedLatestForDevice(): OtaPackageRow | undefined {
  const explicitLatest = db.prepare(
    `SELECT * FROM ota_packages WHERE status = 'published' AND is_latest = 1 ORDER BY updated_at DESC, created_at DESC, id DESC LIMIT 1`
  ).get() as OtaPackageRow | undefined;

  if (explicitLatest) {
    return explicitLatest;
  }

  return db.prepare(
    `SELECT * FROM ota_packages WHERE status = 'published' ORDER BY created_at DESC, id DESC LIMIT 1`
  ).get() as OtaPackageRow | undefined;
}

export function listPublishedHistory(page: number, limit: number) {
  const offset = (page - 1) * limit;
  const rows = db.prepare(
    `SELECT version, address, checksum FROM ota_packages WHERE status = 'published' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
  ).all(limit, offset) as Array<{ version: string; address: string; checksum: string }>;

  const total = (db.prepare(`SELECT COUNT(*) AS c FROM ota_packages WHERE status = 'published'`).get() as { c: number }).c;
  return { rows, total, page, limit };
}

export function createOtaPackage(input: {
  version: string;
  notes: string;
  filename: string;
  originalFilename: string;
  sizeBytes: number;
  checksum: string;
  status: 'draft' | 'published' | 'archived';
  createdBy: number | null;
}): OtaPackageRow {
  const address = buildOtaAddress(input.filename);

  const tx = db.transaction(() => {
    if (input.status === 'published') {
      db.prepare(`UPDATE ota_packages SET status = 'archived', is_latest = 0, updated_at = datetime('now') WHERE status = 'published'`).run();
    }

    const isLatest = input.status === 'published' ? 1 : 0;
    const result = db.prepare(
      `INSERT INTO ota_packages (
        version, notes, filename, original_filename, size_bytes, checksum,
        address, status, is_latest, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).run(
      input.version,
      input.notes,
      input.filename,
      input.originalFilename,
      input.sizeBytes,
      input.checksum,
      address,
      input.status,
      isLatest,
      input.createdBy,
    );

    return Number(result.lastInsertRowid);
  });

  const id = tx();
  const row = getOtaPackageById(id);
  if (!row) {
    throw new Error('Failed to load inserted OTA package');
  }
  return row;
}

export function updateOtaPackage(id: number, changes: {
  notes?: string;
  status?: 'draft' | 'published' | 'archived';
  is_latest?: boolean;
}): OtaPackageRow {
  const existing = getOtaPackageById(id);
  if (!existing) {
    throw new Error('OTA package not found');
  }

  const tx = db.transaction(() => {
    let nextStatus = existing.status;
    let nextIsLatest = existing.is_latest;

    if (changes.status !== undefined) {
      nextStatus = changes.status;
      if (changes.status === 'published') {
        db.prepare(`UPDATE ota_packages SET status = 'archived', is_latest = 0, updated_at = datetime('now') WHERE status = 'published' AND id != ?`).run(id);
        nextIsLatest = 1;
      }
      if (changes.status !== 'published') {
        nextIsLatest = 0;
      }
    }

    if (changes.is_latest !== undefined) {
      nextIsLatest = changes.is_latest ? 1 : 0;
    }

    if (nextIsLatest === 1 && nextStatus !== 'published') {
      nextStatus = 'published';
      db.prepare(`UPDATE ota_packages SET status = 'archived', is_latest = 0, updated_at = datetime('now') WHERE status = 'published' AND id != ?`).run(id);
    }

    if (nextIsLatest === 1) {
      db.prepare(`UPDATE ota_packages SET is_latest = 0, updated_at = datetime('now') WHERE is_latest = 1 AND id != ?`).run(id);
    }

    const notes = changes.notes !== undefined ? changes.notes : existing.notes;

    db.prepare(
      `UPDATE ota_packages
       SET notes = ?, status = ?, is_latest = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(notes, nextStatus, nextIsLatest, id);

    if (nextStatus === 'published') {
      db.prepare(
        `UPDATE ota_packages
         SET status = 'archived', updated_at = datetime('now')
         WHERE id != ? AND status = 'published'`
      ).run(id);
    }
  });

  tx();

  const row = getOtaPackageById(id);
  if (!row) {
    throw new Error('Failed to load updated OTA package');
  }
  return row;
}

export function archiveOtaPackage(id: number): OtaPackageRow {
  const existing = getOtaPackageById(id);
  if (!existing) {
    throw new Error('OTA package not found');
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE ota_packages SET status = 'archived', is_latest = 0, updated_at = datetime('now') WHERE id = ?`
    ).run(id);

    if (existing.is_latest === 1) {
      const replacement = db.prepare(
        `SELECT id FROM ota_packages WHERE status = 'published' AND id != ? ORDER BY created_at DESC, id DESC LIMIT 1`
      ).get(id) as { id: number } | undefined;

      if (replacement) {
        db.prepare(`UPDATE ota_packages SET is_latest = 1, updated_at = datetime('now') WHERE id = ?`).run(replacement.id);
      }
    }
  });

  tx();

  const row = getOtaPackageById(id);
  if (!row) {
    throw new Error('Failed to load archived OTA package');
  }
  return row;
}
