import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { fail, ok, CreateClubSchema, UpdateClubSchema, CreateUserSchema, UpdateUserSchema } from '../types.js';
const router = Router();
// GET /admin/clubs
router.get('/clubs', (_req, res) => {
    try {
        const clubs = db.prepare(`SELECT * FROM clubs ORDER BY created_at DESC, id DESC`).all();
        res.json(ok(clubs));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// POST /admin/clubs
router.post('/clubs', (req, res) => {
    const parsed = CreateClubSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    try {
        const { name, short_name, contact_name, contact_phone, status } = parsed.data;
        const result = db
            .prepare(`INSERT INTO clubs (name, short_name, contact_name, contact_phone, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`)
            .run(name, short_name, contact_name ?? null, contact_phone ?? null, status);
        const club = db.prepare(`SELECT * FROM clubs WHERE id = ?`).get(result.lastInsertRowid);
        res.status(201).json(ok(club));
    }
    catch (err) {
        if (String(err).includes('UNIQUE')) {
            res.status(409).json(fail('俱乐部名称已存在'));
            return;
        }
        res.status(500).json(fail(String(err)));
    }
});
// PUT /admin/clubs/:id
router.put('/clubs/:id', (req, res) => {
    const id = Number(req.params['id']);
    const parsed = UpdateClubSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    try {
        const club = db.prepare(`SELECT * FROM clubs WHERE id = ?`).get(id);
        if (!club) {
            res.status(404).json(fail('俱乐部不存在'));
            return;
        }
        const fields = [];
        const values = [];
        const { name, short_name, contact_name, contact_phone, status } = parsed.data;
        if (name !== undefined) {
            fields.push('name = ?');
            values.push(name);
        }
        if (short_name !== undefined) {
            fields.push('short_name = ?');
            values.push(short_name);
        }
        if (contact_name !== undefined) {
            fields.push('contact_name = ?');
            values.push(contact_name);
        }
        if (contact_phone !== undefined) {
            fields.push('contact_phone = ?');
            values.push(contact_phone);
        }
        if (status !== undefined) {
            fields.push('status = ?');
            values.push(status);
        }
        if (fields.length === 0) {
            res.json(ok(club));
            return;
        }
        values.push(id);
        db.prepare(`UPDATE clubs SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...values);
        const updated = db.prepare(`SELECT * FROM clubs WHERE id = ?`).get(id);
        res.json(ok(updated));
    }
    catch (err) {
        if (String(err).includes('UNIQUE')) {
            res.status(409).json(fail('俱乐部名称已存在'));
            return;
        }
        res.status(500).json(fail(String(err)));
    }
});
// DELETE /admin/clubs/:id
router.delete('/clubs/:id', (req, res) => {
    const id = Number(req.params['id']);
    try {
        const club = db.prepare(`SELECT * FROM clubs WHERE id = ?`).get(id);
        if (!club) {
            res.status(404).json(fail('俱乐部不存在'));
            return;
        }
        const userCount = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE club_id = ?`).get(id).c;
        const matchCount = db.prepare(`SELECT COUNT(*) AS c FROM matches WHERE club_id = ?`).get(id).c;
        if (userCount > 0 || matchCount > 0) {
            res.status(409).json(fail('该俱乐部仍有关联用户或赛事，无法删除'));
            return;
        }
        db.prepare(`DELETE FROM clubs WHERE id = ?`).run(id);
        res.json(ok({ id }));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// GET /admin/users
router.get('/users', (_req, res) => {
    try {
        const users = db
            .prepare(`SELECT u.id, u.username, u.role, u.club_id, u.name, u.phone, u.status, u.last_login_at,
                u.created_at, u.updated_at, c.name AS club_name, c.short_name AS club_short_name
         FROM users u
         LEFT JOIN clubs c ON c.id = u.club_id
         ORDER BY u.created_at DESC, u.id DESC`)
            .all();
        res.json(ok(users));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// POST /admin/users
router.post('/users', (req, res) => {
    const parsed = CreateUserSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    try {
        const { username, password, role, club_id, name, phone, status } = parsed.data;
        if (role !== 'super_admin' && !club_id) {
            res.status(400).json(fail('俱乐部管理员/射手账号必须绑定俱乐部'));
            return;
        }
        if (club_id) {
            const club = db.prepare(`SELECT id FROM clubs WHERE id = ?`).get(club_id);
            if (!club) {
                res.status(400).json(fail('俱乐部不存在'));
                return;
            }
        }
        const passwordHash = bcrypt.hashSync(password, 10);
        const result = db
            .prepare(`INSERT INTO users (username, password_hash, role, club_id, name, phone, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`)
            .run(username, passwordHash, role, role === 'super_admin' ? null : club_id, name, phone ?? null, status);
        const user = db
            .prepare(`SELECT id, username, role, club_id, name, phone, status, last_login_at, created_at, updated_at
         FROM users WHERE id = ?`)
            .get(result.lastInsertRowid);
        res.status(201).json(ok(user));
    }
    catch (err) {
        if (String(err).includes('UNIQUE')) {
            res.status(409).json(fail('用户名已存在'));
            return;
        }
        res.status(500).json(fail(String(err)));
    }
});
// PUT /admin/users/:id
router.put('/users/:id', (req, res) => {
    const id = Number(req.params['id']);
    const parsed = UpdateUserSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    try {
        const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
        if (!user) {
            res.status(404).json(fail('用户不存在'));
            return;
        }
        const fields = [];
        const values = [];
        const { password, role, club_id, name, phone, status } = parsed.data;
        if (role !== undefined) {
            fields.push('role = ?');
            values.push(role);
        }
        if (club_id !== undefined) {
            if (club_id !== null) {
                const club = db.prepare(`SELECT id FROM clubs WHERE id = ?`).get(club_id);
                if (!club) {
                    res.status(400).json(fail('俱乐部不存在'));
                    return;
                }
            }
            fields.push('club_id = ?');
            values.push(club_id);
        }
        if (name !== undefined) {
            fields.push('name = ?');
            values.push(name);
        }
        if (phone !== undefined) {
            fields.push('phone = ?');
            values.push(phone);
        }
        if (status !== undefined) {
            fields.push('status = ?');
            values.push(status);
        }
        if (password !== undefined) {
            fields.push('password_hash = ?');
            values.push(bcrypt.hashSync(password, 10));
        }
        if (fields.length === 0) {
            const unchanged = db
                .prepare(`SELECT id, username, role, club_id, name, phone, status, last_login_at, created_at, updated_at
           FROM users WHERE id = ?`)
                .get(id);
            res.json(ok(unchanged));
            return;
        }
        values.push(id);
        db.prepare(`UPDATE users SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...values);
        const updated = db
            .prepare(`SELECT id, username, role, club_id, name, phone, status, last_login_at, created_at, updated_at
         FROM users WHERE id = ?`)
            .get(id);
        res.json(ok(updated));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// DELETE /admin/users/:id
router.delete('/users/:id', (req, res) => {
    const id = Number(req.params['id']);
    if (req.user?.id === id) {
        res.status(400).json(fail('不能删除当前登录账号'));
        return;
    }
    try {
        const user = db.prepare(`SELECT id FROM users WHERE id = ?`).get(id);
        if (!user) {
            res.status(404).json(fail('用户不存在'));
            return;
        }
        db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
        res.json(ok({ id }));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// GET /admin/matches
router.get('/matches', (_req, res) => {
    try {
        const matches = db
            .prepare(`SELECT m.*, c.name AS club_name, c.short_name AS club_short_name,
                (SELECT COUNT(*) FROM divisions d WHERE d.match_id = m.id) AS divisions_count,
                (SELECT COUNT(*) FROM stages st WHERE st.match_id = m.id) AS stages_count,
                (SELECT COUNT(*) FROM squads sq WHERE sq.match_id = m.id) AS squads_count
         FROM matches m
         LEFT JOIN clubs c ON c.id = m.club_id
         ORDER BY m.created_at DESC, m.id DESC`)
            .all();
        res.json(ok(matches));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// GET /admin/matches/:id
router.get('/matches/:id', (req, res) => {
    const id = Number(req.params['id']);
    try {
        const match = db
            .prepare(`SELECT m.*, c.name AS club_name, c.short_name AS club_short_name
         FROM matches m
         LEFT JOIN clubs c ON c.id = m.club_id
         WHERE m.id = ?`)
            .get(id);
        if (!match) {
            res.status(404).json(fail('赛事不存在'));
            return;
        }
        const divisions_count = db.prepare(`SELECT COUNT(*) AS c FROM divisions WHERE match_id = ?`).get(id).c;
        const stages_count = db.prepare(`SELECT COUNT(*) AS c FROM stages WHERE match_id = ?`).get(id).c;
        const squads_count = db.prepare(`SELECT COUNT(*) AS c FROM squads WHERE match_id = ?`).get(id).c;
        res.json(ok({ ...match, divisions_count, stages_count, squads_count }));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
export default router;
