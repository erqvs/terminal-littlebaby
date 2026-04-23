import crypto from 'crypto';
import '../bootstrap';

const PLACEHOLDER_VALUES = new Set([
  'change-me',
  'changeme',
  'replace-me',
  'replace_this',
  'admin123',
  'password',
  'secret',
  'your-secret-key-change-in-production',
]);

interface SecretOptions {
  minLength: number;
  optional?: boolean;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function validateSecret(name: string, value: string, minLength: number) {
  if (value.length < minLength) {
    throw new Error(`${name} 至少需要 ${minLength} 个字符`);
  }

  if (PLACEHOLDER_VALUES.has(value.toLowerCase())) {
    throw new Error(`${name} 不能使用默认值或占位符`);
  }
}

function getSecret(name: string, options: SecretOptions): string | undefined {
  const value = readEnv(name);

  if (!value) {
    if (options.optional) {
      return undefined;
    }
    throw new Error(`${name} 未配置`);
  }

  validateSecret(name, value, options.minLength);
  return value;
}

export function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export const AUTH_COOKIE_NAME = 'tc_session';
export const APP_PASSWORD = getSecret('APP_PASSWORD', { minLength: 16 })!;
export const JWT_SECRET = getSecret('JWT_SECRET', { minLength: 32 })!;
export const AI_API_KEY = getSecret('AI_API_KEY', { minLength: 32, optional: true });
export const LITTLEBABY_CRON_BRIDGE_TOKEN = getSecret('LITTLEBABY_CRON_BRIDGE_TOKEN', { minLength: 32, optional: true });

export function validateSecurityConfiguration() {
  const dbPassword = readEnv('DB_PASSWORD');

  if (dbPassword && timingSafeEqualString(APP_PASSWORD, dbPassword)) {
    throw new Error('APP_PASSWORD 不能与 DB_PASSWORD 相同');
  }

  const uniqueSecrets = [
    ['APP_PASSWORD', APP_PASSWORD],
    ['JWT_SECRET', JWT_SECRET],
    ['AI_API_KEY', AI_API_KEY],
    ['LITTLEBABY_CRON_BRIDGE_TOKEN', LITTLEBABY_CRON_BRIDGE_TOKEN],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  for (let i = 0; i < uniqueSecrets.length; i++) {
    for (let j = i + 1; j < uniqueSecrets.length; j++) {
      const [leftName, leftValue] = uniqueSecrets[i];
      const [rightName, rightValue] = uniqueSecrets[j];

      if (timingSafeEqualString(leftValue, rightValue)) {
        throw new Error(`${leftName} 不能与 ${rightName} 相同`);
      }
    }
  }
}
