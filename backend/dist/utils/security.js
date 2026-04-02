"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPENCLAW_CRON_BRIDGE_TOKEN = exports.AI_API_KEY = exports.JWT_SECRET = exports.APP_PASSWORD = exports.AUTH_COOKIE_NAME = void 0;
exports.timingSafeEqualString = timingSafeEqualString;
exports.validateSecurityConfiguration = validateSecurityConfiguration;
const crypto_1 = __importDefault(require("crypto"));
require("../bootstrap");
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
function readEnv(name) {
    const value = process.env[name]?.trim();
    return value ? value : undefined;
}
function validateSecret(name, value, minLength) {
    if (value.length < minLength) {
        throw new Error(`${name} 至少需要 ${minLength} 个字符`);
    }
    if (PLACEHOLDER_VALUES.has(value.toLowerCase())) {
        throw new Error(`${name} 不能使用默认值或占位符`);
    }
}
function getSecret(name, options) {
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
function timingSafeEqualString(left, right) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }
    return crypto_1.default.timingSafeEqual(leftBuffer, rightBuffer);
}
exports.AUTH_COOKIE_NAME = 'tc_session';
exports.APP_PASSWORD = getSecret('APP_PASSWORD', { minLength: 16 });
exports.JWT_SECRET = getSecret('JWT_SECRET', { minLength: 32 });
exports.AI_API_KEY = getSecret('AI_API_KEY', { minLength: 32, optional: true });
exports.OPENCLAW_CRON_BRIDGE_TOKEN = getSecret('OPENCLAW_CRON_BRIDGE_TOKEN', { minLength: 32, optional: true });
function validateSecurityConfiguration() {
    const dbPassword = readEnv('DB_PASSWORD');
    if (dbPassword && timingSafeEqualString(exports.APP_PASSWORD, dbPassword)) {
        throw new Error('APP_PASSWORD 不能与 DB_PASSWORD 相同');
    }
    const uniqueSecrets = [
        ['APP_PASSWORD', exports.APP_PASSWORD],
        ['JWT_SECRET', exports.JWT_SECRET],
        ['AI_API_KEY', exports.AI_API_KEY],
        ['OPENCLAW_CRON_BRIDGE_TOKEN', exports.OPENCLAW_CRON_BRIDGE_TOKEN],
    ].filter((entry) => Boolean(entry[1]));
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
