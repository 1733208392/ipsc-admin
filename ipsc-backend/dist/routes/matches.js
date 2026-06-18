import { Router } from 'express';
import db from '../db.js';
import { CreateMatchSchema, UpdateMatchSchema, MatchStatusSchema, ok, fail, } from '../types.js';
import { DEFAULT_DIVISIONS, DIVISION_POWER_FACTOR } from '../constants.js';
const router = Router();
// POST /matches
router.post('/', (req, res) => {
    const parsed = CreateMatchSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    const { name, date, status, club_id } = parsed.data;
    if (!req.user) {
        res.status(401).json(fail('未登录'));
        return;
    }
    const resolvedClubId = req.user.role === 'super_admin'
        ? (club_id ?? req.user.club_id)
        : req.user.club_id;
    if (!resolvedClubId) {
        res.status(400).json(fail('无法确定赛事所属俱乐部'));
        return;
    }
    const club = db.prepare(`SELECT id FROM clubs WHERE id = ?`).get(resolvedClubId);
    if (!club) {
        res.status(400).json(fail('俱乐部不存在'));
        return;
    }
    try {
        const stmt = db.prepare(`INSERT INTO matches (name, date, status, club_id) VALUES (?, ?, ?, ?)`);
        const result = stmt.run(name, date, status, resolvedClubId);
        const insertDivision = db.prepare(`INSERT INTO divisions (match_id, code, name, sort_order) VALUES (?, ?, ?, ?)`);
        const insertDivisionLegacy = db.prepare(`INSERT INTO divisions (match_id, code, name, power_factor, sort_order) VALUES (?, ?, ?, ?, ?)`);
        for (const division of DEFAULT_DIVISIONS) {
            try {
                insertDivision.run(result.lastInsertRowid, division.code, division.name, division.sort_order);
            }
            catch (err) {
                // Legacy DBs can still have a non-null power_factor column.
                if (String(err).includes('power_factor')) {
                    insertDivisionLegacy.run(result.lastInsertRowid, division.code, division.name, DIVISION_POWER_FACTOR[division.code], division.sort_order);
                    continue;
                }
                throw err;
            }
        }
        const match = db.prepare(`SELECT * FROM matches WHERE id = ?`).get(result.lastInsertRowid);
        res.status(201).json(ok(match));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// GET /matches
router.get('/', (req, res) => {
    if (!req.user) {
        res.status(401).json(fail('未登录'));
        return;
    }
    try {
        const baseSql = `SELECT
        m.*,
        (SELECT COUNT(*) FROM divisions d WHERE d.match_id = m.id) AS divisions_count,
        (SELECT COUNT(*) FROM stages st WHERE st.match_id = m.id) AS stages_count,
        (SELECT COUNT(*) FROM squads sq WHERE sq.match_id = m.id) AS squads_count
      FROM matches m`;
        const matches = req.user.role === 'super_admin'
            ? db.prepare(`${baseSql} ORDER BY m.created_at DESC`).all()
            : db.prepare(`${baseSql} WHERE m.club_id = ? ORDER BY m.created_at DESC`).all(req.user.club_id);
        res.json(ok(matches));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// GET /matches/livestream/active — PUBLIC: returns most recent active match for livestream auto-follow
router.get('/livestream/active', (_req, res) => {
    try {
        const match = db
            .prepare(`SELECT * FROM matches WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`)
            .get();
        if (!match) {
            // fall back to most recently created match so the livestream is never empty
            const fallback = db
                .prepare(`SELECT * FROM matches ORDER BY created_at DESC LIMIT 1`)
                .get();
            res.json(ok(fallback ?? null));
            return;
        }
        res.json(ok(match));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// GET /matches/:id
router.get('/:id', (req, res) => {
    const id = Number(req.params['id']);
    try {
        const match = db.prepare(`SELECT * FROM matches WHERE id = ?`).get(id);
        if (!match) {
            res.status(404).json(fail('Match not found'));
            return;
        }
        const divisions_count = db.prepare(`SELECT COUNT(*) as c FROM divisions WHERE match_id = ?`).get(id).c;
        const stages_count = db.prepare(`SELECT COUNT(*) as c FROM stages WHERE match_id = ?`).get(id).c;
        const squads_count = db.prepare(`SELECT COUNT(*) as c FROM squads WHERE match_id = ?`).get(id).c;
        res.json(ok({ ...match, divisions_count, stages_count, squads_count }));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// PUT /matches/:id
router.put('/:id', (req, res) => {
    const id = Number(req.params['id']);
    const parsed = UpdateMatchSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    const { name, date } = parsed.data;
    try {
        const match = db.prepare(`SELECT * FROM matches WHERE id = ?`).get(id);
        if (!match) {
            res.status(404).json(fail('Match not found'));
            return;
        }
        const fields = [];
        const values = [];
        if (name !== undefined) {
            fields.push('name = ?');
            values.push(name);
        }
        if (date !== undefined) {
            fields.push('date = ?');
            values.push(date);
        }
        if (fields.length === 0) {
            res.json(ok(match));
            return;
        }
        values.push(id);
        db.prepare(`UPDATE matches SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        const updated = db.prepare(`SELECT * FROM matches WHERE id = ?`).get(id);
        res.json(ok(updated));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// PATCH /matches/:id/status
router.patch('/:id/status', (req, res) => {
    const id = Number(req.params['id']);
    const parsed = MatchStatusSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    try {
        const match = db.prepare(`SELECT * FROM matches WHERE id = ?`).get(id);
        if (!match) {
            res.status(404).json(fail('Match not found'));
            return;
        }
        if (parsed.data.status === 'active') {
            const stagesCount = db.prepare(`SELECT COUNT(*) as c FROM stages WHERE match_id = ?`).get(id).c;
            if (stagesCount === 0) {
                res.status(400).json(fail('Cannot start match: assign at least one stage first'));
                return;
            }
        }
        db.prepare(`UPDATE matches SET status = ? WHERE id = ?`).run(parsed.data.status, id);
        const updated = db.prepare(`SELECT * FROM matches WHERE id = ?`).get(id);
        res.json(ok(updated));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// DELETE /matches/:id
// PATCH /matches/:id/active-squad
router.patch('/:id/active-squad', (req, res) => {
    const id = Number(req.params['id']);
    const { active_squad_id } = req.body;
    try {
        const match = db.prepare(`SELECT * FROM matches WHERE id = ?`).get(id);
        if (!match) {
            res.status(404).json(fail('Match not found'));
            return;
        }
        if (active_squad_id !== null) {
            const squad = db.prepare(`SELECT id FROM squads WHERE id = ? AND match_id = ?`).get(active_squad_id, id);
            if (!squad) {
                res.status(400).json(fail('Squad not found in this match'));
                return;
            }
        }
        db.prepare(`UPDATE matches SET active_squad_id = ? WHERE id = ?`).run(active_squad_id, id);
        const updated = db.prepare(`SELECT * FROM matches WHERE id = ?`).get(id);
        res.json(ok(updated));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
export function deleteMatch(req, res) {
    const id = Number(req.params['id']);
    try {
        const match = db.prepare(`SELECT * FROM matches WHERE id = ?`).get(id);
        if (!match) {
            res.status(404).json(fail('Match not found'));
            return;
        }
        db.prepare(`DELETE FROM matches WHERE id = ?`).run(id);
        res.json(ok({ id }));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
}
router.delete('/:id', deleteMatch);
export default router;
