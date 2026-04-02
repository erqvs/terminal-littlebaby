import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { APP_PASSWORD, AUTH_COOKIE_NAME, JWT_SECRET, timingSafeEqualString } from '../utils/security';

const router = Router();
const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_SECURE = process.env.NODE_ENV === 'production';

// 安全配置
const MAX_ATTEMPTS = 5;           // 最大失败次数
const LOCKOUT_TIME = 15 * 60 * 1000;  // 锁定时间：15分钟
const RATE_LIMIT_WINDOW = 60 * 1000;  // 速率限制窗口：1分钟
const RATE_LIMIT_MAX = 5;         // 每分钟最多尝试次数

// 失败记录：IP -> { count, lockUntil, attempts[] }
interface FailRecord {
  count: number;
  lockUntil: number;
  attempts: number[];  // 时间戳数组
}
const failedAttempts = new Map<string, FailRecord>();

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
function isLocked(ip: string): { locked: boolean; remainingTime?: number } {
  const record = failedAttempts.get(ip);
  if (!record) return { locked: false };
  
  if (record.lockUntil > Date.now()) {
    const remainingTime = Math.ceil((record.lockUntil - Date.now()) / 1000 / 60);
    return { locked: true, remainingTime };
  }
  
  return { locked: false };
}

// 检查速率限制
function checkRateLimit(ip: string): { allowed: boolean; waitTime?: number } {
  const record = failedAttempts.get(ip);
  if (!record) return { allowed: true };
  
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
function recordFailure(ip: string): void {
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
function recordSuccess(ip: string): void {
  failedAttempts.delete(ip);
}

// 获取客户端IP
function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function parseCookieValue(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';');

  for (const cookie of cookies) {
    const [rawName, ...rawValueParts] = cookie.trim().split('=');
    if (rawName !== name) {
      continue;
    }

    const rawValue = rawValueParts.join('=');
    return rawValue ? decodeURIComponent(rawValue) : null;
  }

  return null;
}

function readTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return parseCookieValue(req, AUTH_COOKIE_NAME);
}

function setNoStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: COOKIE_SECURE,
    maxAge: TOKEN_MAX_AGE_MS,
    path: '/',
  });
}

function clearSessionCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'strict',
    secure: COOKIE_SECURE,
    path: '/',
  });
}

// 生成简单 token
function generateToken(): string {
  const payload = {
    iat: Date.now(),
    exp: Date.now() + TOKEN_MAX_AGE_MS,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(data)
    .digest('hex');
  return `${data}.${signature}`;
}

// 验证 token
export function verifyToken(token: string): boolean {
  try {
    const [data, signature] = token.split('.');
    if (!data || !signature) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(data)
      .digest('hex');
    
    if (!timingSafeEqualString(signature, expectedSignature)) return false;
    
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    return payload.exp > Date.now();
  } catch {
    return false;
  }
}

// 认证中间件
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = readTokenFromRequest(req);

  if (!token) {
    res.status(401).json({ error: '未授权访问' });
    return;
  }

  if (!verifyToken(token)) {
    clearSessionCookie(res);
    res.status(401).json({ error: 'Token 无效或已过期' });
    return;
  }
  
  next();
}

// 登录接口
router.post('/login', (req: Request, res: Response): void => {
  setNoStore(res);
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
  
  if (timingSafeEqualString(password, APP_PASSWORD)) {
    recordSuccess(ip);
    const token = generateToken();
    setSessionCookie(res, token);
    res.json({ success: true, token });
  } else {
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
    } else {
      res.status(401).json({ 
        success: false, 
        message: `密码错误，还剩 ${remainingAttempts} 次尝试机会` 
      });
    }
  }
});

// 验证 token 接口
router.get('/verify', (req: Request, res: Response): void => {
  setNoStore(res);
  const token = readTokenFromRequest(req);

  if (!token) {
    res.json({ valid: false });
    return;
  }

  const valid = verifyToken(token);
  if (!valid) {
    clearSessionCookie(res);
  }

  res.json({ valid });
});

router.post('/logout', (_req: Request, res: Response): void => {
  setNoStore(res);
  clearSessionCookie(res);
  res.json({ success: true });
});

export default router;
