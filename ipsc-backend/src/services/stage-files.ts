import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '..', 'data');
const uploadsDir = path.join(dataDir, 'uploads');
const stageUploadsRoot = path.join(uploadsDir, 'stages');

export function getUploadsDir(): string {
  return uploadsDir;
}

export function getStageUploadsDir(stageId: number): string {
  return path.join(stageUploadsRoot, String(stageId));
}

export function ensureStageUploadsDir(stageId: number): string {
  const dir = getStageUploadsDir(stageId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function removeStageUploadsDir(stageId: number): void {
  const dir = getStageUploadsDir(stageId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function buildStoragePath(stageId: number, filename: string): string {
  return path.posix.join('uploads', 'stages', String(stageId), filename);
}

export function resolveStoragePath(storagePath: string): string {
  return path.join(dataDir, storagePath);
}
