import * as $OpenApi from '@alicloud/openapi-client';
import * as $Util from '@alicloud/tea-util';
import { createRequire } from 'module';

const accessKeyId = process.env.ALIYUN_SMS_ACCESS_KEY_ID || '';
const accessKeySecret = process.env.ALIYUN_SMS_ACCESS_KEY_SECRET || '';
const signName = process.env.ALIYUN_SMS_SIGN_NAME || '';
const templateCode = process.env.ALIYUN_SMS_TEMPLATE_CODE || '';
const endpoint = process.env.ALIYUN_SMS_ENDPOINT || 'dysmsapi.aliyuncs.com';

// The default export of @alicloud/dysmsapi20170525 is the Client class.
// Use require for reliable CommonJS access.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const require = createRequire(import.meta.url);
const DysmsapiModule = require('@alicloud/dysmsapi20170525');
const DysmsapiClient = DysmsapiModule.default || DysmsapiModule.Client;
const SendSmsRequest = DysmsapiModule.SendSmsRequest;

let client: any = null;

function getClient(): any {
  if (client) return client;
  if (!accessKeyId || !accessKeySecret) {
    throw new Error('阿里云 SMS 凭证未配置（ALIYUN_SMS_ACCESS_KEY_ID / ALIYUN_SMS_ACCESS_KEY_SECRET）');
  }
  const config = new $OpenApi.Config({
    accessKeyId,
    accessKeySecret,
    endpoint,
  });
  client = new DysmsapiClient(config);
  return client;
}
export interface SendSmsResult {
  ok: boolean;
  bizId?: string;
  code?: string;
  message?: string;
  error?: string;
}

/**
 * 发送验证码短信
 * @param phone 手机号，支持 +86 格式或纯 11 位号码
 * @param code 6 位验证码
 */
export async function sendVerificationSms(phone: string, code: string): Promise<SendSmsResult> {
  try {
    const normalizedPhone = phone.replace(/^\+86/, '').replace(/[^0-9]/g, '');
    if (!/^1[3-9]\d{9}$/.test(normalizedPhone)) {
      return { ok: false, error: '手机号格式无效（需为 11 位国内手机号）' };
    }

    const smsClient = getClient();
    const request = new SendSmsRequest({
      phoneNumbers: normalizedPhone,
      signName,
      templateCode,
      templateParam: JSON.stringify({ code }),
    });
    const runtime = new $Util.RuntimeOptions({});
    const response = await smsClient.sendSmsWithOptions(request, runtime);

    if (response.body?.code === 'OK') {
      return {
        ok: true,
        bizId: response.body.bizId,
        code: response.body.code,
        message: response.body.message,
      };
    }
    return {
      ok: false,
      code: response.body?.code,
      message: response.body?.message,
      error: response.body?.message || '短信发送失败',
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || String(err),
    };
  }
}
