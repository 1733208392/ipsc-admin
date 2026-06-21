import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { EmailLoginSchema, EmailRegisterSchema, EmailVerifySchema, fail, ok, PhoneLoginSchema, PhoneRegisterSchema, PhoneResetPasswordSchema, PhoneVerifySchema, RegisterSchema, ResetPasswordSchema, SendCodeSchema, } from '../types.js';
import { authMiddleware, createRefreshToken, revokeRefreshToken, rotateRefreshToken, signAccessToken, } from '../auth.js';
import { issueCode, verifyCode } from '../services/verification.js';
import { sendVerificationEmail } from '../services/email.js';
import { sendVerificationSms } from '../services/sms.js';
const router = Router();
function buildAuthResponse(user) {
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
router.post('/login', (req, res) => {
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
            .get(loginId, loginId);
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
        db.prepare(`UPDATE users SET last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(user.id);
        const freshUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id);
        res.json(buildAuthResponse(freshUser));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// POST /auth/register
router.post('/register', (req, res) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    const { username, password, name, phone } = parsed.data;
    try {
        const existing = db.prepare(`SELECT id FROM users WHERE username = ? LIMIT 1`).get(username);
        if (existing) {
            res.status(400).json(fail('用户名已存在'));
            return;
        }
        const tx = db.transaction((payload) => {
            const clubName = `${payload.name}的个人俱乐部`;
            const clubShortName = `P_${payload.username}`;
            const clubInfo = db
                .prepare(`INSERT INTO clubs (name, short_name, contact_name, contact_phone, is_personal, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, 'active', datetime('now'), datetime('now'))`)
                .run(clubName, clubShortName, payload.name, payload.phone ?? null);
            const passwordHash = bcrypt.hashSync(payload.password, 10);
            const userInfo = db
                .prepare(`INSERT INTO users (username, password_hash, role, club_id, name, phone, status, created_at, updated_at)
           VALUES (?, ?, 'club_admin', ?, ?, ?, 'active', datetime('now'), datetime('now'))`)
                .run(payload.username, passwordHash, Number(clubInfo.lastInsertRowid), payload.name, payload.phone ?? null);
            return Number(userInfo.lastInsertRowid);
        });
        const userId = tx(parsed.data);
        const freshUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
        if (!freshUser) {
            res.status(500).json(fail('注册成功但无法加载用户信息'));
            return;
        }
        res.status(201).json(buildAuthResponse(freshUser));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// POST /auth/refresh
router.post('/refresh', (req, res) => {
    const refreshToken = String(req.body?.refresh_token ?? '');
    if (!refreshToken) {
        res.status(400).json(fail('refresh_token 不能为空'));
        return;
    }
    try {
        const rotated = rotateRefreshToken(refreshToken);
        res.json(ok({
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
        }));
    }
    catch {
        res.status(401).json(fail('refresh_token 无效或已过期'));
    }
});
// POST /auth/logout
router.post('/logout', authMiddleware, (req, res) => {
    const refreshToken = String(req.body?.refresh_token ?? '');
    if (refreshToken) {
        revokeRefreshToken(refreshToken);
    }
    res.json(ok({}));
});
// GET /auth/me
router.get('/me', authMiddleware, (req, res) => {
    if (!req.user) {
        res.status(401).json(fail('未登录'));
        return;
    }
    res.json(ok({
        id: req.user.id,
        username: req.user.username,
        role: req.user.role,
        club_id: req.user.club_id,
        name: req.user.name,
        phone: req.user.phone,
        email: req.user.email,
        status: req.user.status,
        last_login_at: req.user.last_login_at,
        email_verified_at: req.user.email_verified_at,
        avatar_url: req.user.avatar_url,
        locale: req.user.locale,
    }));
});
// ── Auth V2: email registration + verification ────────────────────────────────
function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
}
// POST /auth/send-code — send email/phone verification code
router.post('/send-code', async (req, res) => {
    const parsed = SendCodeSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    const { channel, target, purpose } = parsed.data;
    const normalizedTarget = channel === 'email'
        ? target.trim().toLowerCase()
        : target.replace(/^\+86/, '').replace(/[^0-9]/g, '');
    // Phone format check (11-digit Chinese mobile)
    if (channel === 'phone' && !/^1[3-9]\d{9}$/.test(normalizedTarget)) {
        res.status(400).json(fail('手机号格式无效（需为 11 位国内手机号）'));
        return;
    }
    // For registration: ensure target not already registered
    if (purpose === 'register') {
        const existing = db
            .prepare(`SELECT id FROM users WHERE ${channel} = ? LIMIT 1`)
            .get(normalizedTarget);
        if (existing) {
            res.status(400).json(fail(channel === 'email' ? '该邮箱已注册' : '该手机号已注册'));
            return;
        }
    }
    const result = issueCode(channel, normalizedTarget, purpose, getClientIp(req));
    if (!result.ok || !result.code) {
        res.status(429).json(fail(result.error ?? '发送失败'));
        return;
    }
    if (channel === 'email') {
        const sendResult = await sendVerificationEmail(normalizedTarget, result.code, purpose);
        if (sendResult.error) {
            res.status(500).json(fail(`邮件发送失败: ${sendResult.error}`));
            return;
        }
        res.json(ok({ channel: 'email', target: normalizedTarget }));
        return;
    }
    // Phone channel: send via Aliyun SMS
    const smsResult = await sendVerificationSms(normalizedTarget, result.code);
    if (!smsResult.ok) {
        res.status(500).json(fail(`短信发送失败: ${smsResult.error || smsResult.message}`));
        return;
    }
    res.json(ok({ channel: 'phone', target: normalizedTarget, biz_id: smsResult.bizId }));
});
// POST /auth/register/email — start email registration (sends code)
router.post('/register/email', async (req, res) => {
    const parsed = EmailRegisterSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    const { email, password, name, locale } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();
    // Check if email already registered
    const existing = db.prepare(`SELECT id FROM users WHERE email = ? LIMIT 1`).get(normalizedEmail);
    if (existing) {
        res.status(400).json(fail('该邮箱已注册'));
        return;
    }
    // Issue + send verification code
    const result = issueCode('email', normalizedEmail, 'register', getClientIp(req));
    if (!result.ok || !result.code) {
        res.status(429).json(fail(result.error ?? '验证码发送失败'));
        return;
    }
    const sendResult = await sendVerificationEmail(normalizedEmail, result.code, 'register');
    if (sendResult.error) {
        res.status(500).json(fail(`邮件发送失败: ${sendResult.error}`));
        return;
    }
    // Return a temp token carrying the registration payload (valid for 15 min)
    // The user must call /auth/verify-email with code + payload to finalize.
    // Storing payload in a temp table would be cleaner; for now we hash password and return as base64.
    const passwordHash = bcrypt.hashSync(password, 10);
    const payload = Buffer.from(JSON.stringify({
        email: normalizedEmail,
        password_hash: passwordHash,
        name: name.trim(),
        locale: locale ?? 'zh-CN',
    })).toString('base64url');
    res.json(ok({
        pending: true,
        email: normalizedEmail,
        expires_in: 600,
        verification_token: payload,
    }));
});
// POST /auth/verify-email — verify code and finalize email registration
router.post('/verify-email', (req, res) => {
    const parsed = EmailVerifySchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    const { email, code, purpose } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();
    const verifyResult = verifyCode('email', normalizedEmail, purpose, code);
    if (!verifyResult.ok) {
        res.status(400).json(fail(verifyResult.error ?? '验证失败'));
        return;
    }
    if (purpose === 'register') {
        // Decode the verification_token (pending registration payload)
        const token = String(req.body?.verification_token ?? '');
        if (!token) {
            res.status(400).json(fail('缺少注册上下文，请重新注册'));
            return;
        }
        let payload;
        try {
            payload = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
        }
        catch {
            res.status(400).json(fail('注册上下文无效，请重新注册'));
            return;
        }
        if (payload.email !== normalizedEmail) {
            res.status(400).json(fail('邮箱不匹配'));
            return;
        }
        // Double-check not already registered (race guard)
        const existing = db.prepare(`SELECT id FROM users WHERE email = ? LIMIT 1`).get(normalizedEmail);
        if (existing) {
            res.status(400).json(fail('该邮箱已注册'));
            return;
        }
        try {
            const userId = db.transaction(() => {
                const clubName = `${payload.name}的个人俱乐部`;
                const clubShortName = `P_${normalizedEmail.split('@')[0].slice(0, 20)}`;
                const clubInfo = db
                    .prepare(`INSERT INTO clubs (name, short_name, contact_name, contact_phone, is_personal, status, created_at, updated_at)
             VALUES (?, ?, ?, NULL, 1, 'active', datetime('now'), datetime('now'))`)
                    .run(clubName, clubShortName, payload.name);
                const userInfo = db
                    .prepare(`INSERT INTO users (username, password_hash, role, club_id, name, email, email_verified_at, locale, status, created_at, updated_at)
             VALUES (?, ?, 'club_admin', ?, ?, ?, datetime('now'), ?, 'active', datetime('now'), datetime('now'))`)
                    .run(normalizedEmail, payload.password_hash, Number(clubInfo.lastInsertRowid), payload.name, normalizedEmail, payload.locale);
                const newUserId = Number(userInfo.lastInsertRowid);
                // Link identity
                db.prepare(`INSERT INTO user_identities (user_id, provider, provider_uid, provider_email, linked_at, last_used_at)
           VALUES (?, 'email', ?, ?, datetime('now'), datetime('now'))`).run(newUserId, normalizedEmail, normalizedEmail);
                return newUserId;
            })();
            const freshUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
            res.status(201).json(buildAuthResponse(freshUser));
            return;
        }
        catch (err) {
            res.status(500).json(fail(`注册失败: ${err}`));
            return;
        }
    }
    if (purpose === 'login') {
        // Passwordless email login — mark verified, return session
        const user = db.prepare(`SELECT * FROM users WHERE email = ? AND status = 'active'`).get(normalizedEmail);
        if (!user) {
            res.status(404).json(fail('账号不存在'));
            return;
        }
        db.prepare(`UPDATE users SET email_verified_at = datetime('now'), last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(user.id);
        const freshUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id);
        res.json(buildAuthResponse(freshUser));
        return;
    }
    if (purpose === 'reset_password') {
        // Just acknowledge — client should now call /auth/reset-password with new password
        res.json(ok({ email: normalizedEmail, verified: true, purpose: 'reset_password' }));
        return;
    }
    if (purpose === 'bind') {
        // Binding handled under /auth/bind (requires auth)
        res.json(ok({ email: normalizedEmail, verified: true, purpose: 'bind' }));
        return;
    }
    res.status(400).json(fail('未知 purpose'));
});
// POST /auth/login/email — email + password login
router.post('/login/email', (req, res) => {
    const parsed = EmailLoginSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    const { email, password } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();
    const user = db
        .prepare(`SELECT * FROM users WHERE email = ? OR username = ? LIMIT 1`)
        .get(normalizedEmail, normalizedEmail);
    if (!user) {
        res.status(401).json(fail('邮箱或密码错误'));
        return;
    }
    if (user.status !== 'active') {
        res.status(401).json(fail('账号已禁用'));
        return;
    }
    const matched = bcrypt.compareSync(password, user.password_hash || '');
    if (!matched) {
        res.status(401).json(fail('邮箱或密码错误'));
        return;
    }
    db.prepare(`UPDATE users SET last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(user.id);
    const freshUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id);
    res.json(buildAuthResponse(freshUser));
});
// POST /auth/reset-password — reset password with verified email + code
router.post('/reset-password', (req, res) => {
    const parsed = ResetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    const { email, code, new_password } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();
    const verifyResult = verifyCode('email', normalizedEmail, 'reset_password', code);
    if (!verifyResult.ok) {
        res.status(400).json(fail(verifyResult.error ?? '验证失败'));
        return;
    }
    const user = db.prepare(`SELECT * FROM users WHERE email = ? LIMIT 1`).get(normalizedEmail);
    if (!user) {
        res.status(404).json(fail('账号不存在'));
        return;
    }
    const newHash = bcrypt.hashSync(new_password, 10);
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(newHash, user.id);
    // Revoke all refresh tokens (force re-login on all devices)
    db.prepare(`UPDATE refresh_tokens SET revoked = 1, revoked_at = datetime('now') WHERE user_id = ? AND revoked = 0`).run(user.id);
    res.json(ok({ email: normalizedEmail, reset: true }));
});
// ── Phone auth endpoints (Phase 2) ───────────────────────────────────────────
// POST /auth/register/phone — start phone registration (sends SMS code)
router.post('/register/phone', async (req, res) => {
    const parsed = PhoneRegisterSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    const { phone, password, name, locale } = parsed.data;
    const existing = db.prepare(`SELECT id FROM users WHERE phone = ? LIMIT 1`).get(phone);
    if (existing) {
        res.status(400).json(fail('该手机号已注册'));
        return;
    }
    const result = issueCode('phone', phone, 'register', getClientIp(req));
    if (!result.ok || !result.code) {
        res.status(429).json(fail(result.error ?? '验证码发送失败'));
        return;
    }
    const smsResult = await sendVerificationSms(phone, result.code);
    if (!smsResult.ok) {
        res.status(500).json(fail(`短信发送失败: ${smsResult.error || smsResult.message}`));
        return;
    }
    const passwordHash = bcrypt.hashSync(password, 10);
    const payload = Buffer.from(JSON.stringify({
        phone,
        password_hash: passwordHash,
        name: name.trim(),
        locale: locale ?? 'zh-CN',
    })).toString('base64url');
    res.json(ok({
        pending: true,
        phone,
        expires_in: 600,
        verification_token: payload,
        biz_id: smsResult.bizId,
    }));
});
// POST /auth/verify-phone — verify SMS code and finalize phone registration
router.post('/verify-phone', (req, res) => {
    const parsed = PhoneVerifySchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    const { phone, code, purpose } = parsed.data;
    const verifyResult = verifyCode('phone', phone, purpose, code);
    if (!verifyResult.ok) {
        res.status(400).json(fail(verifyResult.error ?? '验证失败'));
        return;
    }
    if (purpose === 'register') {
        const token = String(req.body?.verification_token ?? '');
        if (!token) {
            res.status(400).json(fail('缺少注册上下文，请重新注册'));
            return;
        }
        let payload;
        try {
            payload = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
        }
        catch {
            res.status(400).json(fail('注册上下文无效，请重新注册'));
            return;
        }
        if (payload.phone !== phone) {
            res.status(400).json(fail('手机号不匹配'));
            return;
        }
        const existing = db.prepare(`SELECT id FROM users WHERE phone = ? LIMIT 1`).get(phone);
        if (existing) {
            res.status(400).json(fail('该手机号已注册'));
            return;
        }
        try {
            const userId = db.transaction(() => {
                const clubName = `${payload.name}的个人俱乐部`;
                const clubShortName = `P_${phone.slice(-4)}`;
                const clubInfo = db
                    .prepare(`INSERT INTO clubs (name, short_name, contact_name, contact_phone, is_personal, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, 1, 'active', datetime('now'), datetime('now'))`)
                    .run(clubName, clubShortName, payload.name, phone);
                const userInfo = db
                    .prepare(`INSERT INTO users (username, password_hash, role, club_id, name, phone, phone_verified_at, locale, status, created_at, updated_at)
             VALUES (?, ?, 'club_admin', ?, ?, ?, ?, datetime('now'), ?, 'active', datetime('now'), datetime('now'))`)
                    .run(phone, payload.password_hash, Number(clubInfo.lastInsertRowid), payload.name, phone, payload.locale);
                const newUserId = Number(userInfo.lastInsertRowid);
                db.prepare(`INSERT INTO user_identities (user_id, provider, provider_uid, linked_at, last_used_at)
           VALUES (?, 'phone', ?, datetime('now'), datetime('now'))`).run(newUserId, phone);
                return newUserId;
            })();
            const freshUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
            res.status(201).json(buildAuthResponse(freshUser));
            return;
        }
        catch (err) {
            res.status(500).json(fail(`注册失败: ${err}`));
            return;
        }
    }
    if (purpose === 'login') {
        const user = db.prepare(`SELECT * FROM users WHERE phone = ? AND status = 'active'`).get(phone);
        if (!user) {
            res.status(404).json(fail('账号不存在'));
            return;
        }
        db.prepare(`UPDATE users SET phone_verified_at = datetime('now'), last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(user.id);
        const freshUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id);
        res.json(buildAuthResponse(freshUser));
        return;
    }
    if (purpose === 'reset_password') {
        res.json(ok({ phone, verified: true, purpose: 'reset_password' }));
        return;
    }
    if (purpose === 'bind') {
        res.json(ok({ phone, verified: true, purpose: 'bind' }));
        return;
    }
    res.status(400).json(fail('未知 purpose'));
});
// POST /auth/login/phone — phone + password login
router.post('/login/phone', (req, res) => {
    const parsed = PhoneLoginSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    const { phone, password } = parsed.data;
    const user = db
        .prepare(`SELECT * FROM users WHERE phone = ? OR username = ? LIMIT 1`)
        .get(phone, phone);
    if (!user) {
        res.status(401).json(fail('手机号或密码错误'));
        return;
    }
    if (user.status !== 'active') {
        res.status(401).json(fail('账号已禁用'));
        return;
    }
    const matched = bcrypt.compareSync(password, user.password_hash || '');
    if (!matched) {
        res.status(401).json(fail('手机号或密码错误'));
        return;
    }
    db.prepare(`UPDATE users SET last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(user.id);
    const freshUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id);
    res.json(buildAuthResponse(freshUser));
});
// POST /auth/reset-password/phone — reset password with verified phone + code
router.post('/reset-password/phone', (req, res) => {
    const parsed = PhoneResetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    const { phone, code, new_password } = parsed.data;
    const verifyResult = verifyCode('phone', phone, 'reset_password', code);
    if (!verifyResult.ok) {
        res.status(400).json(fail(verifyResult.error ?? '验证失败'));
        return;
    }
    const user = db.prepare(`SELECT * FROM users WHERE phone = ? LIMIT 1`).get(phone);
    if (!user) {
        res.status(404).json(fail('账号不存在'));
        return;
    }
    const newHash = bcrypt.hashSync(new_password, 10);
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(newHash, user.id);
    db.prepare(`UPDATE refresh_tokens SET revoked = 1, revoked_at = datetime('now') WHERE user_id = ? AND revoked = 0`).run(user.id);
    res.json(ok({ phone, reset: true }));
});
export default router;
