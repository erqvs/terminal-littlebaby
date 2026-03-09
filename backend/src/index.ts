import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import transactionsRouter from './routes/transactions';
import categoriesRouter from './routes/categories';
import accountsRouter from './routes/accounts';
import goalsRouter from './routes/goals';
import scheduleRouter from './routes/schedule';
import authRouter, { authMiddleware } from './routes/auth';
import aiRouter from './routes/ai';

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;

// 允许的域名列表
const allowedOrigins = [
  'https://accounting.example.com:23333',
  'https://accounting.example.com',
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
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// 安全响应头
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.removeHeader('X-Powered-By');
  
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
app.use('/api/goals', authMiddleware, goalsRouter);
app.use('/api/schedule', authMiddleware, scheduleRouter);

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
