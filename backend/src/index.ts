import './bootstrap';
import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import transactionsRouter from './routes/transactions';
import categoriesRouter from './routes/categories';
import accountsRouter from './routes/accounts';
import budgetsRouter from './routes/budgets';
import goalsRouter from './routes/goals';
import littlebabyCronRouter from './routes/littlebabyCron';
import littlebabyMemoryRouter from './routes/littlebabyMemory';
import digestHistoryRouter from './routes/digestHistory';
import scheduleRouter from './routes/schedule';
import semesterRouter from './routes/semester';
import timeSlotsRouter from './routes/timeSlots';
import authRouter, { authMiddleware } from './routes/auth';
import aiRouter from './routes/ai';
import { validateSecurityConfiguration } from './utils/security';

const app: Express = express();
const PORT = process.env.PORT || 3000;

validateSecurityConfiguration();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback, linklocal, uniquelocal');

// 允许的域名列表
const allowedOrigins = [
  'https://terminal-littlebaby.example.com:23333',
  'https://terminal-littlebaby.example.com',
  'http://localhost:5173',  // 本地开发
  'http://localhost:3000',
];

// CORS 配置
app.use(cors({
  origin: (origin, callback) => {
    // 允许无 origin 的请求（如移动应用、Postman）
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('不允许的来源'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

// 安全响应头
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }
  
  // 保存原始 json 方法
  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return originalJson(body);
  };
  
  next();
});

app.use(express.json({ limit: '1mb' }));  // 限制请求体大小

// 请求日志（可选）
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 登录接口不需要认证
app.use('/api/auth', authRouter);

// AI 专用接口（使用 X-API-Key 认证）
app.use('/api/ai', aiRouter);

// 以下接口需要认证
app.use('/api/transactions', authMiddleware, transactionsRouter);
app.use('/api/categories', authMiddleware, categoriesRouter);
app.use('/api/accounts', authMiddleware, accountsRouter);
app.use('/api/budgets', authMiddleware, budgetsRouter);
app.use('/api/goals', authMiddleware, goalsRouter);
app.use('/api/littlebaby-cron', authMiddleware, littlebabyCronRouter);
app.use('/api/littlebaby-memory', authMiddleware, littlebabyMemoryRouter);
app.use('/api/digest-history', authMiddleware, digestHistoryRouter);
app.use('/api/schedule', authMiddleware, scheduleRouter);
app.use('/api/semester', authMiddleware, semesterRouter);
app.use('/api/time-slots', authMiddleware, timeSlotsRouter);

// 全局错误处理
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err.message);
  if (err.message === '不允许的来源') {
    res.status(403).json({ error: '访问被拒绝' });
    return;
  }
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
