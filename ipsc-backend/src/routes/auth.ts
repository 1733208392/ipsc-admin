import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { fail, ok, RegisterSchema } from '../types.js';
import {
  authMiddleware,
  createRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from '../auth.js';

const router = Router();

function buildAuthResponse(user: Express.User) {
  const refresh = createRefreshToken(user);
  const accessToken = signAccessToken(user);

  return ok({
    token: accessToken,
    access_token: accessToken,
    refresh_token: refresh.token,
    expires_in: 24 * 60 * 60,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      club_id: user.club_id,
      name: user.name,
      phone: user.phone,
      status: user.status,
    },
  });
}

// POST /auth/login
router.post('/login', (req: Request, res: Response) => {
  const username = String(req.body?.username ?? '').trim();
  const mobile = String(req.body?.mobile ?? '').trim();
  const account = String(req.body?.account ?? '').trim();
  const loginId = username || mobile || account;
  const password = String(req.body?.password ?? '');

  if (!loginId || !password) {
    res.status(400).json(fail('用户名和密码不能为空'));
    return;
  }

  try {
    const user = db
      .prepare(`SELECT * FROM users WHERE username = ? OR phone = ?`)
      .get(loginId, loginId) as Express.User & { password_hash: string } | undefined;

    if (!user) {
      res.status(401).json(fail('用户名或密码错误'));
      return;
    }

    if (user.status !== 'active') {
      res.status(401).json(fail('账号已禁用'));
      return;
    }

    const matched = bcrypt.compareSync(password, user.password_hash);
    if (!matched) {
      res.status(401).json(fail('用户名或密码错误'));
      return;
    }

    db.prepare(`UPDATE users SET last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(
      user.id
    );

    const freshUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id) as Express.User;
    res.json(buildAuthResponse(freshUser));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// POST /auth/register
router.post('/register', (req: Request, res: Response) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(fail(parsed.error.message));
    return;
  }

  const { username, password, name, phone } = parsed.data;

  try {
    const existing = db.prepare(`SELECT id FROM users WHERE username = ? LIMIT 1`).get(username) as { id: number } | undefined;
    if (existing) {
      res.status(400).json(fail('用户名已存在'));
      return;
    }

    const tx = db.transaction((payload: typeof parsed.data) => {
      const clubName = `${payload.name}的个人俱乐部`;
      const clubShortName = `P_${payload.username}`;
      const clubInfo = db
        .prepare(
          `INSERT INTO clubs (name, short_name, contact_name, contact_phone, is_personal, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, 'active', datetime('now'), datetime('now'))`
        )
        .run(clubName, clubShortName, payload.name, payload.phone ?? null);

      const passwordHash = bcrypt.hashSync(payload.password, 10);
      const userInfo = db
        .prepare(
          `INSERT INTO users (username, password_hash, role, club_id, name, phone, status, created_at, updated_at)
           VALUES (?, ?, 'club_admin', ?, ?, ?, 'active', datetime('now'), datetime('now'))`
        )
        .run(payload.username, passwordHash, Number(clubInfo.lastInsertRowid), payload.name, payload.phone ?? null);

      return Number(userInfo.lastInsertRowid);
    });

    const userId = tx(parsed.data);
    const freshUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as Express.User | undefined;
    if (!freshUser) {
      res.status(500).json(fail('注册成功但无法加载用户信息'));
      return;
    }

    res.status(201).json(buildAuthResponse(freshUser));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// POST /auth/refresh
router.post('/refresh', (req: Request, res: Response) => {
  const refreshToken = String(req.body?.refresh_token ?? '');
  if (!refreshToken) {
    res.status(400).json(fail('refresh_token 不能为空'));
    return;
  }

  try {
    const rotated = rotateRefreshToken(refreshToken);
    res.json(
      ok({
        token: rotated.accessToken,
        access_token: rotated.accessToken,
        refresh_token: rotated.refreshToken,
        expires_in: 24 * 60 * 60,
        user: {
          id: rotated.user.id,
          username: rotated.user.username,
          role: rotated.user.role,
          club_id: rotated.user.club_id,
          name: rotated.user.name,
          phone: rotated.user.phone,
          status: rotated.user.status,
        },
      })
    );
  } catch {
    res.status(401).json(fail('refresh_token 无效或已过期'));
  }
});

// POST /auth/logout
router.post('/logout', authMiddleware, (req: Request, res: Response) => {
  const refreshToken = String(req.body?.refresh_token ?? '');
  if (refreshToken) {
    revokeRefreshToken(refreshToken);
  }
  res.json(ok({}));
});

// GET /auth/me
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json(fail('未登录'));
    return;
  }

  res.json(
    ok({
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      club_id: req.user.club_id,
      name: req.user.name,
      phone: req.user.phone,
      status: req.user.status,
      last_login_at: req.user.last_login_at,
    })
  );
});

export default router;
