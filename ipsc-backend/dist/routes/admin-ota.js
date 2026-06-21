import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { Router } from 'express';
import db from '../db.js';
import { fail, ok, OtaAdminListQuerySchema, OtaCreatePackageSchema, OtaUpdatePackageSchema, } from '../types.js';
import { archiveOtaPackage, computeFileSha1Hex, createOtaPackage, getOtaFilesDir, getOtaPackageById, listOtaPackages, updateOtaPackage, } from '../services/ota.js';
const router = Router();
const MAX_OTA_FILE_SIZE_BYTES = 200 * 1024 * 1024;
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, getOtaFilesDir());
    },
    filename: (_req, file, cb) => {
        cb(null, `${crypto.randomUUID()}.zip`);
    },
});
const upload = multer({
    storage,
    limits: { fileSize: MAX_OTA_FILE_SIZE_BYTES },
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        cb(null, ext === '.zip');
    },
});
function parsePositiveInt(value, defaultValue) {
    if (typeof value !== 'string' || value.trim() === '') {
        return defaultValue;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return defaultValue;
    }
    return parsed;
}
function currentUserId(req) {
    const user = req.user;
    if (!user || typeof user.id !== 'number') {
        return null;
    }
    return user.id;
}
// GET /admin/ota/packages
router.get('/packages', (req, res) => {
    const page = parsePositiveInt(req.query['page'], 1);
    const limit = Math.min(parsePositiveInt(req.query['limit'], 20), 50);
    const statusValue = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
    const parsed = OtaAdminListQuerySchema.safeParse({ status: statusValue, page, limit });
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    try {
        const result = listOtaPackages(parsed.data.status, parsed.data.page, parsed.data.limit);
        res.json(ok({
            total_count: result.total,
            page: result.page,
            limit: result.limit,
            rows: result.rows,
        }));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// GET /admin/ota/packages/:id
router.get('/packages/:id', (req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json(fail('Invalid package id'));
        return;
    }
    try {
        const row = getOtaPackageById(id);
        if (!row) {
            res.status(404).json(fail('OTA package not found'));
            return;
        }
        res.json(ok(row));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// POST /admin/ota/packages
router.post('/packages', upload.single('file'), async (req, res) => {
    const parsed = OtaCreatePackageSchema.safeParse({
        version: req.body?.version,
        notes: req.body?.notes,
        status: req.body?.status,
    });
    if (!parsed.success) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    if (!req.file) {
        res.status(400).json(fail('file is required'));
        return;
    }
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    if (ext !== '.zip') {
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(400).json(fail('Only .zip files are allowed'));
        return;
    }
    try {
        const existing = db.prepare(`SELECT id FROM ota_packages WHERE version = ? LIMIT 1`).get(parsed.data.version);
        if (existing) {
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            res.status(409).json(fail('version already exists'));
            return;
        }
        const checksum = await computeFileSha1Hex(req.file.path);
        const created = createOtaPackage({
            version: parsed.data.version,
            notes: parsed.data.notes,
            filename: req.file.filename,
            originalFilename: req.file.originalname,
            sizeBytes: req.file.size,
            checksum,
            status: parsed.data.status,
            createdBy: currentUserId(req),
        });
        res.status(201).json(ok(created));
    }
    catch (err) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json(fail(String(err)));
    }
});
// PUT /admin/ota/packages/:id
router.put('/packages/:id', (req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json(fail('Invalid package id'));
        return;
    }
    const parsed = OtaUpdatePackageSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    if (parsed.data.notes === undefined
        && parsed.data.status === undefined
        && parsed.data.is_latest === undefined) {
        res.status(400).json(fail('No fields to update'));
        return;
    }
    try {
        const existing = getOtaPackageById(id);
        if (!existing) {
            res.status(404).json(fail('OTA package not found'));
            return;
        }
        const updated = updateOtaPackage(id, parsed.data);
        res.json(ok(updated));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// DELETE /admin/ota/packages/:id
router.delete('/packages/:id', (req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json(fail('Invalid package id'));
        return;
    }
    try {
        const existing = getOtaPackageById(id);
        if (!existing) {
            res.status(404).json(fail('OTA package not found'));
            return;
        }
        const archived = archiveOtaPackage(id);
        res.json(ok(archived));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
export default router;
