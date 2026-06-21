import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { CreateClubSchema, CreateClub, UpdateClubSchema, CreateUserSchema, CreateUser, UpdateUserSchema, fail, ok } from '../types.js';

const router = Router();

// ── Users ─────────────────────────────────────────────────────────────────────

// GET /admin/users — list all users (with club_name join)
router.get('/users', (_req: Request, res: Response) => {
  try {
    const users = db.prepare(`
      SELECT u.id, u.username, u.role, u.club_id, u.name, u.phone, u.status,
             u.last_login_at, u.created_at, u.updated_at,
             c.name AS club_name
      FROM users u
      LEFT JOIN clubs c ON u.club_id = c.id
      ORDER BY u.id
    `).all();
    res.json(users);
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// POST /admin/users — create a new user
router.post('/users', (req: Request, res: Response) => {
  const parsed = CreateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(fail(parsed.error.message));
    return;
  }

  const { username, password, role, club_id, name, phone, status } = parsed.data as CreateUser;

  try {
    const existing = db.prepare(`SELECT id FROM users WHERE username = ? LIMIT 1`).get(username) as { id: number } | undefined;
    if (existing) {
      res.status(400).json(fail('用户名已存在'));
      return;
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const info = db.prepare(`
      INSERT INTO users (username, password_hash, role, club_id, name, phone, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(username, passwordHash, role, club_id ?? null, name, phone ?? null, status ?? 'active');

    const user = db.prepare(`
      SELECT u.id, u.username, u.role, u.club_id, u.name, u.phone, u.status,
             u.last_login_at, u.created_at, u.updated_at,
             c.name AS club_name
      FROM users u
      LEFT JOIN clubs c ON u.club_id = c.id
      WHERE u.id = ?
    `).get(Number(info.lastInsertRowid));

    res.status(201).json(user);
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// PUT /admin/users/:id — update a user
router.put('/users/:id', (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  if (!userId) {
    res.status(400).json(fail('无效的用户 ID'));
    return;
  }

  const parsed = UpdateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(fail(parsed.error.message));
    return;
  }

  try {
    const existing = db.prepare(`SELECT id FROM users WHERE id = ?`).get(userId) as { id: number } | undefined;
    if (!existing) {
      res.status(404).json(fail('用户不存在'));
      return;
    }

    const data = parsed.data;
    const sets: string[] = [];
    const values: unknown[] = [];

    if (data.password !== undefined) {
      sets.push('password_hash = ?');
      values.push(bcrypt.hashSync(data.password, 10));
    }
    if (data.role !== undefined) {
      sets.push('role = ?');
      values.push(data.role);
    }
    if (data.club_id !== undefined) {
      sets.push('club_id = ?');
      values.push(data.club_id);
    }
    if (data.name !== undefined) {
      sets.push('name = ?');
      values.push(data.name);
    }
    if (data.phone !== undefined) {
      sets.push('phone = ?');
      values.push(data.phone);
    }
    if (data.status !== undefined) {
      sets.push('status = ?');
      values.push(data.status);
    }

    if (sets.length === 0) {
      res.status(400).json(fail('没有需要更新的字段'));
      return;
    }

    sets.push("updated_at = datetime('now')");
    values.push(userId);

    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);

    const user = db.prepare(`
      SELECT u.id, u.username, u.role, u.club_id, u.name, u.phone, u.status,
             u.last_login_at, u.created_at, u.updated_at,
             c.name AS club_name
      FROM users u
      LEFT JOIN clubs c ON u.club_id = c.id
      WHERE u.id = ?
    `).get(userId);

    res.json(user);
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// DELETE /admin/users/:id — delete a user
router.delete('/users/:id', (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  if (!userId) {
    res.status(400).json(fail('无效的用户 ID'));
    return;
  }

  try {
    const existing = db.prepare(`SELECT id FROM users WHERE id = ?`).get(userId) as { id: number } | undefined;
    if (!existing) {
      res.status(404).json(fail('用户不存在'));
      return;
    }

    db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
    res.json(ok({ deleted: true }));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// ── Clubs ─────────────────────────────────────────────────────────────────────

// GET /admin/clubs — list all clubs
router.get('/clubs', (_req: Request, res: Response) => {
  try {
    const clubs = db.prepare(`
      SELECT id, name, short_name, contact_name, contact_phone, is_personal, status, created_at, updated_at
      FROM clubs
      ORDER BY id
    `).all();
    res.json(clubs);
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// POST /admin/clubs — create a new club
router.post('/clubs', (req: Request, res: Response) => {
  const parsed = CreateClubSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(fail(parsed.error.message));
    return;
  }

  const { name, short_name, contact_name, contact_phone, status } = parsed.data as CreateClub;

  try {
    const existing = db.prepare(`SELECT id FROM clubs WHERE name = ? LIMIT 1`).get(name) as { id: number } | undefined;
    if (existing) {
      res.status(400).json(fail('俱乐部名称已存在'));
      return;
    }

    const info = db.prepare(`
      INSERT INTO clubs (name, short_name, contact_name, contact_phone, is_personal, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, datetime('now'), datetime('now'))
    `).run(name, short_name, contact_name ?? null, contact_phone ?? null, status ?? 'active');

    const club = db.prepare(`
      SELECT id, name, short_name, contact_name, contact_phone, is_personal, status, created_at, updated_at
      FROM clubs WHERE id = ?
    `).get(Number(info.lastInsertRowid));

    res.status(201).json(club);
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// PUT /admin/clubs/:id — update a club
router.put('/clubs/:id', (req: Request, res: Response) => {
  const clubId = Number(req.params.id);
  if (!clubId) {
    res.status(400).json(fail('无效的俱乐部 ID'));
    return;
  }

  const parsed = UpdateClubSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(fail(parsed.error.message));
    return;
  }

  try {
    const existing = db.prepare(`SELECT id FROM clubs WHERE id = ?`).get(clubId) as { id: number } | undefined;
    if (!existing) {
      res.status(404).json(fail('俱乐部不存在'));
      return;
    }

    const data = parsed.data;
    const sets: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) {
      sets.push('name = ?');
      values.push(data.name);
    }
    if (data.short_name !== undefined) {
      sets.push('short_name = ?');
      values.push(data.short_name);
    }
    if (data.contact_name !== undefined) {
      sets.push('contact_name = ?');
      values.push(data.contact_name);
    }
    if (data.contact_phone !== undefined) {
      sets.push('contact_phone = ?');
      values.push(data.contact_phone);
    }
    if (data.status !== undefined) {
      sets.push('status = ?');
      values.push(data.status);
    }

    if (sets.length === 0) {
      res.status(400).json(fail('没有需要更新的字段'));
      return;
    }

    sets.push("updated_at = datetime('now')");
    values.push(clubId);

    db.prepare(`UPDATE clubs SET ${sets.join(', ')} WHERE id = ?`).run(...values);

    const club = db.prepare(`
      SELECT id, name, short_name, contact_name, contact_phone, is_personal, status, created_at, updated_at
      FROM clubs WHERE id = ?
    `).get(clubId);

    res.json(club);
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// DELETE /admin/clubs/:id — delete a club
router.delete('/clubs/:id', (req: Request, res: Response) => {
  const clubId = Number(req.params.id);
  if (!clubId) {
    res.status(400).json(fail('无效的俱乐部 ID'));
    return;
  }

  try {
    const existing = db.prepare(`SELECT id FROM clubs WHERE id = ?`).get(clubId) as { id: number } | undefined;
    if (!existing) {
      res.status(404).json(fail('俱乐部不存在'));
      return;
    }

    db.prepare(`DELETE FROM clubs WHERE id = ?`).run(clubId);
    res.json(ok({ deleted: true }));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

export default router;