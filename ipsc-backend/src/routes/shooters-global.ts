import { Router, Request, Response } from 'express';
import db from '../db.js';
import { fail, ok, CreateGlobalShooterSchema, UpdateGlobalShooterSchema } from '../types.js';

const router = Router();

function nextShooterUid(): string {
  const rows = db
    .prepare(`SELECT uid FROM shooters_global WHERE uid LIKE 'SHOOTER-%' ORDER BY uid DESC LIMIT 1`)
    .all() as Array<{ uid: string }>;

  let next = 1;
  if (rows.length > 0) {
    const parsed = Number(rows[0].uid.replace('SHOOTER-', ''));
    if (Number.isInteger(parsed)) {
      next = parsed + 1;
    }
  }

  return `SHOOTER-${String(next).padStart(6, '0')}`;
}

// GET /shooters/global/search?q=
router.get('/search', (req: Request, res: Response) => {
  const q = String(req.query['q'] ?? '').trim();

  if (!q) {
    res.json(ok([]));
    return;
  }

  try {
    const like = `%${q}%`;
    const rows = db
      .prepare(
        `SELECT sg.*, c.name AS default_club_name, c.short_name AS default_club_short_name
         FROM shooters_global sg
         LEFT JOIN clubs c ON c.id = sg.default_club_id
         WHERE sg.uid LIKE ? OR sg.name LIKE ? OR COALESCE(sg.phone, '') LIKE ? OR COALESCE(sg.id_card, '') LIKE ?
         ORDER BY sg.created_at DESC
         LIMIT 50`
      )
      .all(like, like, like, like);

    res.json(ok(rows));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// POST /shooters/global
router.post('/', (req: Request, res: Response) => {
  const parsed = CreateGlobalShooterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(fail(parsed.error.message));
    return;
  }

  try {
    const uid = nextShooterUid();
    const { name, gender, age, region, default_club_id, id_card, phone } = parsed.data;

    const clubId = default_club_id ?? req.user?.club_id ?? null;
    if (!clubId) {
      res.status(400).json(fail('请提供所属俱乐部'));
      return;
    }

    if (req.user?.role === 'club_admin' && req.user.club_id !== clubId) {
      res.status(403).json(fail('只能创建本俱乐部射手'));
      return;
    }

    const club = db.prepare(`SELECT id FROM clubs WHERE id = ?`).get(clubId);
    if (!club) {
      res.status(400).json(fail('俱乐部不存在'));
      return;
    }

    db.prepare(
      `INSERT INTO shooters_global
         (uid, name, gender, age, region, default_club_id, id_card, phone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).run(uid, name, gender, age ?? null, region ?? null, clubId, id_card ?? null, phone ?? null);

    const shooter = db
      .prepare(
        `SELECT sg.*, c.name AS default_club_name, c.short_name AS default_club_short_name
         FROM shooters_global sg
         LEFT JOIN clubs c ON c.id = sg.default_club_id
         WHERE sg.uid = ?`
      )
      .get(uid);

    res.status(201).json(ok(shooter));
  } catch (err) {
    if (String(err).includes('UNIQUE')) {
      res.status(409).json(fail('身份证或手机号已存在'));
      return;
    }
    res.status(500).json(fail(String(err)));
  }
});

// PUT /shooters/global/:uid
router.put('/:uid', (req: Request, res: Response) => {
  const uid = String(req.params['uid'] ?? '').trim();
  const parsed = UpdateGlobalShooterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(fail(parsed.error.message));
    return;
  }

  try {
    const shooter = db
      .prepare(`SELECT * FROM shooters_global WHERE uid = ?`)
      .get(uid) as { uid: string; default_club_id: number | null } | undefined;

    if (!shooter) {
      res.status(404).json(fail('射手不存在'));
      return;
    }

    if (req.user?.role === 'club_admin' && req.user.club_id !== shooter.default_club_id) {
      res.status(403).json(fail('只能修改本俱乐部射手'));
      return;
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    const { name, gender, age, region, default_club_id, id_card, phone } = parsed.data;

    if (name !== undefined) {
      fields.push('name = ?');
      values.push(name);
    }
    if (gender !== undefined) {
      fields.push('gender = ?');
      values.push(gender);
    }
    if (age !== undefined) {
      fields.push('age = ?');
      values.push(age);
    }
    if (region !== undefined) {
      fields.push('region = ?');
      values.push(region);
    }
    if (id_card !== undefined) {
      fields.push('id_card = ?');
      values.push(id_card);
    }
    if (phone !== undefined) {
      fields.push('phone = ?');
      values.push(phone);
    }

    if (default_club_id !== undefined) {
      if (default_club_id !== null) {
        const club = db.prepare(`SELECT id FROM clubs WHERE id = ?`).get(default_club_id);
        if (!club) {
          res.status(400).json(fail('俱乐部不存在'));
          return;
        }
      }

      if (req.user?.role === 'club_admin' && default_club_id !== req.user.club_id) {
        res.status(403).json(fail('只能设置为本俱乐部'));
        return;
      }

      fields.push('default_club_id = ?');
      values.push(default_club_id);
    }

    if (fields.length === 0) {
      const unchanged = db.prepare(`SELECT * FROM shooters_global WHERE uid = ?`).get(uid);
      res.json(ok(unchanged));
      return;
    }

    values.push(uid);
    db.prepare(`UPDATE shooters_global SET ${fields.join(', ')}, updated_at = datetime('now') WHERE uid = ?`).run(
      ...values
    );

    const updated = db
      .prepare(
        `SELECT sg.*, c.name AS default_club_name, c.short_name AS default_club_short_name
         FROM shooters_global sg
         LEFT JOIN clubs c ON c.id = sg.default_club_id
         WHERE sg.uid = ?`
      )
      .get(uid);

    res.json(ok(updated));
  } catch (err) {
    if (String(err).includes('UNIQUE')) {
      res.status(409).json(fail('身份证或手机号已存在'));
      return;
    }
    res.status(500).json(fail(String(err)));
  }
});

export default router;
