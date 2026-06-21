import crypto from 'crypto';
import db from '../db.js';
const CODE_LENGTH = 6;
const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const SEND_COOLDOWN_SECONDS = 60;
const DAILY_TARGET_LIMIT = 10;
function generateCode() {
    // 6-digit numeric code, no leading zero removal (allow 000000-999999)
    const bytes = crypto.randomBytes(4);
    const num = bytes.readUInt32BE(0) % 1000000;
    return num.toString().padStart(CODE_LENGTH, '0');
}
export function issueCode(channel, target, purpose, ip) {
    const normalized = target.trim().toLowerCase();
    const now = Date.now();
    // Rate limit: cooldown
    const recent = db
        .prepare(`SELECT created_at FROM verification_codes
       WHERE target = ? AND purpose = ? AND datetime(created_at) > datetime('now', '-${SEND_COOLDOWN_SECONDS} seconds')
       ORDER BY created_at DESC LIMIT 1`)
        .get(normalized, purpose);
    if (recent) {
        return { ok: false, error: `请 ${SEND_COOLDOWN_SECONDS} 秒后再试` };
    }
    // Rate limit: daily cap per target
    const todayCount = db
        .prepare(`SELECT COUNT(*) AS c FROM verification_codes
       WHERE target = ? AND purpose = ? AND datetime(created_at) > datetime('now', '-1 day')`)
        .get(normalized, purpose);
    if (todayCount.c >= DAILY_TARGET_LIMIT) {
        return { ok: false, error: '当日发送次数已达上限' };
    }
    const code = generateCode();
    const expiresAt = new Date(now + CODE_TTL_MINUTES * 60 * 1000)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');
    db.prepare(`INSERT INTO verification_codes (channel, target, code, purpose, expires_at, attempt_count, created_at, ip_address)
     VALUES (?, ?, ?, ?, ?, 0, datetime('now'), ?)`).run(channel, normalized, code, purpose, expiresAt, ip ?? null);
    return { ok: true, code };
}
export function verifyCode(channel, target, purpose, inputCode) {
    const normalized = target.trim().toLowerCase();
    const record = db
        .prepare(`SELECT * FROM verification_codes
       WHERE target = ? AND purpose = ? AND consumed_at IS NULL
         AND datetime(expires_at) > datetime('now')
       ORDER BY created_at DESC LIMIT 1`)
        .get(normalized, purpose);
    if (!record) {
        return { ok: false, error: '验证码不存在或已过期' };
    }
    if (record.attempt_count >= MAX_ATTEMPTS) {
        db.prepare(`UPDATE verification_codes SET consumed_at = datetime('now') WHERE id = ?`).run(record.id);
        return { ok: false, error: '尝试次数过多，请重新获取验证码' };
    }
    db.prepare(`UPDATE verification_codes SET attempt_count = attempt_count + 1 WHERE id = ?`).run(record.id);
    if (record.code !== inputCode.trim()) {
        return { ok: false, error: '验证码错误' };
    }
    db.prepare(`UPDATE verification_codes SET consumed_at = datetime('now') WHERE id = ?`).run(record.id);
    return { ok: true };
}
