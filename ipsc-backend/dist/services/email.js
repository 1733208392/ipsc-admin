import { Resend } from 'resend';
const resend = new Resend(process.env['RESEND_API_KEY'] || '');
const FROM_ADDRESS = process.env['MAIL_FROM'] || 'GCS <noreply@grwolf.com>';
const APP_NAME = process.env['APP_NAME'] || 'GCS';
const APP_URL = process.env['APP_URL'] || 'https://api.grwolf.com';
export async function sendEmail(opts) {
    if (!resend) {
        return { error: 'Resend client not initialized (missing RESEND_API_KEY)' };
    }
    try {
        const result = await resend.emails.send({
            from: FROM_ADDRESS,
            to: opts.to,
            subject: opts.subject,
            html: opts.html,
            text: opts.text,
        });
        if (result.error) {
            return { error: result.error.message };
        }
        return { id: result.data?.id };
    }
    catch (err) {
        return { error: String(err) };
    }
}
export function sendVerificationEmail(to, code, purpose = 'register') {
    const purposeText = purpose === 'reset_password' ? '重置密码' : purpose === 'bind' ? '绑定邮箱' : '注册账号';
    const minutes = 10;
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>${APP_NAME} 验证码</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 32px; margin: 0;">
  <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
    <h1 style="font-size: 20px; color: #0f172a; margin: 0 0 16px;">${APP_NAME} ${purposeText}验证码</h1>
    <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 24px;">你正在${purposeText}，请使用以下验证码完成操作：</p>
    <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; text-align: center; margin: 0 0 24px;">
      <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #0f172a; font-family: 'SF Mono', Menlo, monospace;">${code}</span>
    </div>
    <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin: 0 0 8px;">验证码 ${minutes} 分钟内有效。</p>
    <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin: 0;">如果你没有发起过此操作，请忽略此邮件。</p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
    <p style="font-size: 12px; color: #94a3b8; margin: 0;">${APP_NAME} — IPSC 赛事与训练管理系统</p>
    <p style="font-size: 12px; color: #94a3b8; margin: 4px 0 0;"><a href="${APP_URL}" style="color: #64748b; text-decoration: none;">${APP_URL}</a></p>
  </div>
</body>
</html>`;
    return sendEmail({
        to,
        subject: `${APP_NAME} ${purposeText}验证码 ${code}`,
        html,
        text: `你的${purposeText}验证码是：${code}（10 分钟内有效）。如果不是你本人操作，请忽略此邮件。`,
    });
}
