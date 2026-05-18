import { Router } from 'express';
import db from '../db.js';
import { CreateDivisionSchema, UpdateDivisionSchema, ok, fail } from '../types.js';
const router = Router({ mergeParams: true });
// POST /matches/:matchId/divisions
router.post('/', (req, res) => {
    const matchId = Number(req.params['matchId']);
    const parsed = CreateDivisionSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    const match = db.prepare(`SELECT id FROM matches WHERE id = ?`).get(matchId);
    if (!match) {
        res.status(404).json(fail('Match not found'));
        return;
    }
    try {
        const { code, name, sort_order } = parsed.data;
        const result = db
            .prepare(`INSERT INTO divisions (match_id, code, name, sort_order) VALUES (?, ?, ?, ?)`)
            .run(matchId, code, name, sort_order);
        const division = db.prepare(`SELECT * FROM divisions WHERE id = ?`).get(result.lastInsertRowid);
        res.status(201).json(ok(division));
    }
    catch (err) {
        if (String(err).includes('UNIQUE constraint failed: divisions.match_id, divisions.code')) {
            res.status(409).json(fail('Division code already exists in this match'));
            return;
        }
        res.status(500).json(fail(String(err)));
    }
});
// GET /matches/:matchId/divisions
router.get('/', (req, res) => {
    const matchId = Number(req.params['matchId']);
    try {
        const divisions = db
            .prepare(`SELECT * FROM divisions WHERE match_id = ? ORDER BY sort_order, id`)
            .all(matchId);
        res.json(ok(divisions));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// PUT /divisions/:id  (mounted at root level)
export function updateDivision(req, res) {
    const id = Number(req.params['id']);
    const parsed = UpdateDivisionSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    try {
        const division = db.prepare(`SELECT * FROM divisions WHERE id = ?`).get(id);
        if (!division) {
            res.status(404).json(fail('Division not found'));
            return;
        }
        const fields = [];
        const values = [];
        const { name, sort_order } = parsed.data;
        if (name !== undefined) {
            fields.push('name = ?');
            values.push(name);
        }
        if (sort_order !== undefined) {
            fields.push('sort_order = ?');
            values.push(sort_order);
        }
        if (fields.length === 0) {
            res.json(ok(division));
            return;
        }
        values.push(id);
        db.prepare(`UPDATE divisions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        const updated = db.prepare(`SELECT * FROM divisions WHERE id = ?`).get(id);
        res.json(ok(updated));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
}
// DELETE /divisions/:id  (mounted at root level)
export function deleteDivision(req, res) {
    const id = Number(req.params['id']);
    try {
        const division = db.prepare(`SELECT * FROM divisions WHERE id = ?`).get(id);
        if (!division) {
            res.status(404).json(fail('Division not found'));
            return;
        }
        const shooterCount = db.prepare(`SELECT COUNT(*) as c FROM shooters WHERE division_id = ?`).get(id).c;
        if (shooterCount > 0) {
            res.status(409).json(fail(`Cannot delete division: ${shooterCount} shooter(s) still associated`));
            return;
        }
        db.prepare(`DELETE FROM divisions WHERE id = ?`).run(id);
        res.json(ok({ id }));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
}
export default router;
