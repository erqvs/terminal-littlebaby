"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = verifyToken;
exports.authMiddleware = authMiddleware;
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const router = (0, express_1.Router)();
// 从环境变量获取密码，默认为 'admin123'
const APP_PASSWORD = process.env.APP_PASSWORD || 'admin123';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
// 安全配置
const MAX_ATTEMPTS = 5; // 最大失败次数
const LOCKOUT_TIME = 15 * 60 * 1000; // 锁定时间：15分钟
const RATE_LIMIT_WINDOW = 60 * 1000; // 速率限制窗口：1分钟
const RATE_LIMIT_MAX = 5; // 每分钟最多尝试次数
const failedAttempts = new Map();
// 清理过期记录（每小时执行一次）
setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of failedAttempts.entries()) {
        if (record.lockUntil < now && record.attempts.every(t => t < now - RATE_LIMIT_WINDOW)) {
            failedAttempts.delete(ip);
        }
    }
}, 60 * 60 * 1000);
// 检查是否被锁定
function isLocked(ip) {
    const record = failedAttempts.get(ip);
    if (!record)
        return { locked: false };
    if (record.lockUntil > Date.now()) {
        const remainingTime = Math.ceil((record.lockUntil - Date.now()) / 1000 / 60);
        return { locked: true, remainingTime };
    }
    return { locked: false };
}
// 检查速率限制
function checkRateLimit(ip) {
    const record = failedAttempts.get(ip);
    if (!record)
        return { allowed: true };
    const now = Date.now();
    const recentAttempts = record.attempts.filter(t => t > now - RATE_LIMIT_WINDOW);
    if (recentAttempts.length >= RATE_LIMIT_MAX) {
        const oldestAttempt = Math.min(...recentAttempts);
        const waitTime = Math.ceil((oldestAttempt + RATE_LIMIT_WINDOW - now) / 1000);
        return { allowed: false, waitTime };
    }
    return { allowed: true };
}
// 记录失败
function recordFailure(ip) {
    const now = Date.now();
    const record = failedAttempts.get(ip) || { count: 0, lockUntil: 0, attempts: [] };
    record.count++;
    record.attempts.push(now);
    record.attempts = record.attempts.filter(t => t > now - RATE_LIMIT_WINDOW);
    // 达到最大失败次数，锁定
    if (record.count >= MAX_ATTEMPTS) {
        record.lockUntil = now + LOCKOUT_TIME;
    }
    failedAttempts.set(ip, record);
}
// 记录成功（清除失败记录）
function recordSuccess(ip) {
    failedAttempts.delete(ip);
}
// 获取客户端IP
function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
}
// 生成简单 token
function generateToken() {
    const payload = {
        iat: Date.now(),
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 天过期
    };
    const data = Buffer.from(JSON.stringify(payload)).toString('base64');
    const signature = crypto_1.default
        .createHmac('sha256', JWT_SECRET)
        .update(data)
        .digest('hex');
    return `${data}.${signature}`;
}
// 验证 token
function verifyToken(token) {
    try {
        const [data, signature] = token.split('.');
        const expectedSignature = crypto_1.default
            .createHmac('sha256', JWT_SECRET)
            .update(data)
            .digest('hex');
        if (signature !== expectedSignature)
            return false;
        const payload = JSON.parse(Buffer.from(data, 'base64').toString());
        return payload.exp > Date.now();
    }
    catch {
        return false;
    }
}
// 认证中间件
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: '未授权访问' });
        return;
    }
    const token = authHeader.slice(7);
    if (!verifyToken(token)) {
        res.status(401).json({ error: 'Token 无效或已过期' });
        return;
    }
    next();
}
// 登录接口
router.post('/login', (req, res) => {
    const ip = getClientIp(req);
    // 检查是否被锁定
    const lockStatus = isLocked(ip);
    if (lockStatus.locked) {
        res.status(429).json({
            success: false,
            locked: true,
            message: `尝试次数过多，请 ${lockStatus.remainingTime} 分钟后再试`
        });
        return;
    }
    // 检查速率限制
    const rateStatus = checkRateLimit(ip);
    if (!rateStatus.allowed) {
        res.status(429).json({
            success: false,
            message: `操作过于频繁，请 ${rateStatus.waitTime} 秒后再试`
        });
        return;
    }
    const { password } = req.body;
    if (!password) {
        res.status(400).json({ success: false, message: '请输入密码' });
        return;
    }
    if (password === APP_PASSWORD) {
        recordSuccess(ip);
        const token = generateToken();
        res.json({ success: true, token });
    }
    else {
        recordFailure(ip);
        const record = failedAttempts.get(ip);
        const remainingAttempts = MAX_ATTEMPTS - (record?.count || 0);
        if (record?.lockUntil && record.lockUntil > Date.now()) {
            const remainingTime = Math.ceil((record.lockUntil - Date.now()) / 1000 / 60);
            res.status(401).json({
                success: false,
                locked: true,
                message: `密码错误次数过多，已锁定 ${remainingTime} 分钟`
            });
        }
        else {
            res.status(401).json({
                success: false,
                message: `密码错误，还剩 ${remainingAttempts} 次尝试机会`
            });
        }
    }
});
// 验证 token 接口
router.get('/verify', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.json({ valid: false });
        return;
    }
    const token = authHeader.slice(7);
    res.json({ valid: verifyToken(token) });
});
exports.default = router;
