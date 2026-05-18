import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '..', 'data');
const uploadsDir = path.join(dataDir, 'uploads');
const stageUploadsRoot = path.join(uploadsDir, 'stages');
export function getUploadsDir() {
    return uploadsDir;
}
export function getStageUploadsDir(stageId) {
    return path.join(stageUploadsRoot, String(stageId));
}
export function ensureStageUploadsDir(stageId) {
    const dir = getStageUploadsDir(stageId);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}
export function removeStageUploadsDir(stageId) {
    const dir = getStageUploadsDir(stageId);
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}
export function buildStoragePath(stageId, filename) {
    return path.posix.join('uploads', 'stages', String(stageId), filename);
}
export function resolveStoragePath(storagePath) {
    return path.join(dataDir, storagePath);
}
