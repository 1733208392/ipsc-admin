import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { fail } from './types.js';
import db from './db.js';
const ACCESS_TOKEN_EXPIRES_IN = '24h';
const REFRESH_TOKEN_EXPIRES_IN = '30d';
function getJwtSecret() {
    return process.env['JWT_SECRET'] || 'ipsc-dev-secret-change-me';
}
export function signAccessToken(user) {
    const payload = {
        type: 'access',
        user_id: user.id,
        role: user.role,
        club_id: user.club_id,
    };
    return jwt.sign(payload, getJwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
}
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}
export function createRefreshToken(user) {
    const jti = crypto.randomUUID();
    const payload = {
        type: 'refresh',
        jti,
        user_id: user.id,
        role: user.role,
        club_id: user.club_id,
    };
    const token = jwt.sign(payload, getJwtSecret(), { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
    const decoded = jwt.decode(token);
    const expiresAt = decoded?.exp
        ? new Date(decoded.exp * 1000).toISOString().slice(0, 19).replace('T', ' ')
        : new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    db.prepare(`INSERT INTO refresh_tokens (token_hash, jti, user_id, expires_at, revoked, created_at)
     VALUES (?, ?, ?, ?, 0, datetime('now'))`).run(hashToken(token), jti, user.id, expiresAt);
    return { token, expiresAt, jti };
}
export function revokeRefreshToken(refreshToken) {
    db.prepare(`UPDATE refresh_tokens
     SET revoked = 1, revoked_at = datetime('now')
     WHERE token_hash = ? AND revoked = 0`).run(hashToken(refreshToken));
}
function getRefreshRecord(refreshToken) {
    return db
        .prepare(`SELECT * FROM refresh_tokens
       WHERE token_hash = ? AND revoked = 0 AND datetime(expires_at) > datetime('now')`)
        .get(hashToken(refreshToken));
}
export function rotateRefreshToken(refreshToken) {
    const decoded = jwt.verify(refreshToken, getJwtSecret());
    if (decoded.type !== 'refresh' || !decoded.jti) {
        throw new Error('Invalid refresh token');
    }
    const record = getRefreshRecord(refreshToken);
    if (!record || record.jti !== decoded.jti || record.user_id !== decoded.user_id) {
        throw new Error('Refresh token revoked or expired');
    }
    const user = db
        .prepare(`SELECT * FROM users WHERE id = ? AND status = 'active'`)
        .get(decoded.user_id);
    if (!user) {
        throw new Error('User not active');
    }
    db.prepare(`UPDATE refresh_tokens SET revoked = 1, revoked_at = datetime('now') WHERE id = ?`).run(record.id);
    const nextRefresh = createRefreshToken(user);
    return {
        accessToken: signAccessToken(user),
        refreshToken: nextRefresh.token,
        user,
    };
}
export function signUserToken(user) {
    return signAccessToken(user);
}
export function isSuperAdmin(req) {
    return req.user?.role === 'super_admin';
}
export function hasClubPermission(req, resourceClubId) {
    if (!req.user)
        return false;
    if (req.user.role === 'super_admin')
        return true;
    return req.user.club_id === resourceClubId;
}
export function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        res.status(401).json(fail('未登录'));
        return;
    }
    try {
        const decoded = jwt.verify(token, getJwtSecret());
        if (decoded.type && decoded.type !== 'access') {
            res.status(401).json(fail('登录已过期'));
            return;
        }
        const user = db
            .prepare(`SELECT * FROM users WHERE id = ? AND status = 'active'`)
            .get(decoded.user_id);
        if (!user) {
            res.status(401).json(fail('账号已禁用'));
            return;
        }
        req.user = user;
        next();
    }
    catch {
        res.status(401).json(fail('登录已过期'));
    }
}
export function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json(fail('未登录'));
            return;
        }
        if (!roles.includes(req.user.role)) {
            res.status(403).json(fail('权限不足'));
            return;
        }
        next();
    };
}
function getResourceClubId(sql, id) {
    const row = db.prepare(sql).get(id);
    if (!row)
        return undefined;
    return row.club_id;
}
function createResourceAccessMiddleware(paramName, lookupSql) {
    return (req, res, next) => {
        const raw = req.params[paramName];
        const id = Number(raw);
        if (!Number.isInteger(id) || id <= 0) {
            res.status(400).json(fail('Invalid id'));
            return;
        }
        const clubId = getResourceClubId(lookupSql, id);
        if (clubId === undefined) {
            res.status(404).json(fail('Resource not found'));
            return;
        }
        if (clubId === null) {
            if (!isSuperAdmin(req)) {
                res.status(403).json(fail('无权访问该资源'));
                return;
            }
            next();
            return;
        }
        if (!hasClubPermission(req, clubId)) {
            res.status(403).json(fail('无权访问该资源'));
            return;
        }
        next();
    };
}
export const requireMatchAccessByParam = (paramName) => createResourceAccessMiddleware(paramName, `SELECT club_id FROM matches WHERE id = ?`);
export const requireDivisionAccessByParam = (paramName) => createResourceAccessMiddleware(paramName, `SELECT m.club_id AS club_id FROM divisions d JOIN matches m ON m.id = d.match_id WHERE d.id = ?`);
export const requireCategoryAccessByParam = (paramName) => createResourceAccessMiddleware(paramName, `SELECT m.club_id AS club_id FROM sub_divisions sd JOIN matches m ON m.id = sd.match_id WHERE sd.id = ?`);
export const requireStageAccessByParam = (paramName) => createResourceAccessMiddleware(paramName, `SELECT m.club_id AS club_id FROM stages st JOIN matches m ON m.id = st.match_id WHERE st.id = ?`);
export const requireSquadAccessByParam = (paramName) => createResourceAccessMiddleware(paramName, `SELECT m.club_id AS club_id FROM squads sq JOIN matches m ON m.id = sq.match_id WHERE sq.id = ?`);
export const requireShooterAccessByParam = (paramName) => createResourceAccessMiddleware(paramName, `SELECT m.club_id AS club_id FROM shooters sh JOIN matches m ON m.id = sh.match_id WHERE sh.id = ?`);
export const requireScoreAccessByParam = (paramName) => createResourceAccessMiddleware(paramName, `SELECT m.club_id AS club_id FROM scores sc JOIN matches m ON m.id = sc.match_id WHERE sc.id = ?`);
export const requireAttachmentAccessByParam = (paramName) => createResourceAccessMiddleware(paramName, `SELECT m.club_id AS club_id FROM stage_attachments sa JOIN matches m ON m.id = sa.match_id WHERE sa.id = ?`);
