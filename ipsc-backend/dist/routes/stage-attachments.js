import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { Router } from 'express';
import db from '../db.js';
import { fail, ok } from '../types.js';
import { buildStoragePath, ensureStageUploadsDir, resolveStoragePath, } from '../services/stage-files.js';
const router = Router({ mergeParams: true });
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_STAGE = 10;
const storage = multer.diskStorage({
    destination: (req, _file, cb) => {
        const stageId = Number(req.params['id']);
        if (!Number.isInteger(stageId) || stageId <= 0) {
            cb(new Error('Invalid stage id'), '');
            return;
        }
        const dir = ensureStageUploadsDir(stageId);
        cb(null, dir);
    },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const safeExt = ext && ext.length <= 10 ? ext : '';
        cb(null, `${Date.now()}-${crypto.randomUUID()}${safeExt}`);
    },
});
const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
    fileFilter: (_req, file, cb) => {
        const isImage = file.mimetype.startsWith('image/');
        const isPdf = file.mimetype === 'application/pdf';
        cb(null, isImage || isPdf);
    },
});
function stageIdFromReq(req) {
    return Number(req.params['id']);
}
function toAttachmentResponse(req, row) {
    const url = `${req.protocol}://${req.get('host')}/${row.storage_path}`;
    return {
        ...row,
        url,
    };
}
// GET /stages/:id/attachments
router.get('/', (req, res) => {
    const stageId = stageIdFromReq(req);
    if (!Number.isInteger(stageId) || stageId <= 0) {
        res.status(400).json(fail('Invalid stage id'));
        return;
    }
    try {
        const stage = db.prepare(`SELECT id FROM stages WHERE id = ?`).get(stageId);
        if (!stage) {
            res.status(404).json(fail('Stage not found'));
            return;
        }
        const rows = db
            .prepare(`SELECT * FROM stage_attachments WHERE stage_id = ? ORDER BY created_at DESC, id DESC`)
            .all(stageId);
        res.json(ok(rows.map((row) => toAttachmentResponse(req, row))));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// POST /stages/:id/attachments
router.post('/', upload.single('file'), (req, res) => {
    const stageId = stageIdFromReq(req);
    if (!Number.isInteger(stageId) || stageId <= 0) {
        res.status(400).json(fail('Invalid stage id'));
        return;
    }
    const file = req.file;
    if (!file) {
        res.status(400).json(fail('No file uploaded'));
        return;
    }
    try {
        const stage = db
            .prepare(`SELECT id, match_id FROM stages WHERE id = ?`)
            .get(stageId);
        if (!stage) {
            fs.unlinkSync(file.path);
            res.status(404).json(fail('Stage not found'));
            return;
        }
        const count = db
            .prepare(`SELECT COUNT(*) AS c FROM stage_attachments WHERE stage_id = ?`)
            .get(stageId);
        if (count.c >= MAX_FILES_PER_STAGE) {
            fs.unlinkSync(file.path);
            res.status(400).json(fail(`Maximum ${MAX_FILES_PER_STAGE} files allowed for this stage`));
            return;
        }
        const storagePath = buildStoragePath(stageId, file.filename);
        const result = db
            .prepare(`
        INSERT INTO stage_attachments
          (stage_id, match_id, filename, original_name, mime_type, size_bytes, storage_path)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
            .run(stageId, stage.match_id, file.filename, file.originalname, file.mimetype, file.size, storagePath);
        const inserted = db
            .prepare(`SELECT * FROM stage_attachments WHERE id = ?`)
            .get(result.lastInsertRowid);
        res.status(201).json(ok(toAttachmentResponse(req, inserted)));
    }
    catch (err) {
        if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
        res.status(500).json(fail(String(err)));
    }
});
// DELETE /stages/:id/attachments/:attachmentId
router.delete('/:attachmentId', (req, res) => {
    const stageId = stageIdFromReq(req);
    const attachmentId = Number(req.params['attachmentId']);
    if (!Number.isInteger(stageId) || stageId <= 0 || !Number.isInteger(attachmentId) || attachmentId <= 0) {
        res.status(400).json(fail('Invalid id'));
        return;
    }
    try {
        const row = db
            .prepare(`SELECT * FROM stage_attachments WHERE id = ? AND stage_id = ?`)
            .get(attachmentId, stageId);
        if (!row) {
            res.status(404).json(fail('Attachment not found'));
            return;
        }
        const absolutePath = resolveStoragePath(row.storage_path);
        if (fs.existsSync(absolutePath)) {
            fs.unlinkSync(absolutePath);
        }
        db.prepare(`DELETE FROM stage_attachments WHERE id = ?`).run(attachmentId);
        res.json(ok({ id: attachmentId }));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
export default router;
