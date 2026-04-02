"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./bootstrap");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const transactions_1 = __importDefault(require("./routes/transactions"));
const categories_1 = __importDefault(require("./routes/categories"));
const accounts_1 = __importDefault(require("./routes/accounts"));
const budgets_1 = __importDefault(require("./routes/budgets"));
const goals_1 = __importDefault(require("./routes/goals"));
const openclawCron_1 = __importDefault(require("./routes/openclawCron"));
const digestHistory_1 = __importDefault(require("./routes/digestHistory"));
const schedule_1 = __importDefault(require("./routes/schedule"));
const semester_1 = __importDefault(require("./routes/semester"));
const auth_1 = __importStar(require("./routes/auth"));
const ai_1 = __importDefault(require("./routes/ai"));
const security_1 = require("./utils/security");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
(0, security_1.validateSecurityConfiguration)();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback, linklocal, uniquelocal');
// 允许的域名列表
const allowedOrigins = [
    'https://terminal-claw.example.com:23333',
    'https://terminal-claw.example.com',
    'http://localhost:5173', // 本地开发
    'http://localhost:3000',
];
// CORS 配置
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // 允许无 origin 的请求（如移动应用、Postman）
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(new Error('不允许的来源'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));
// 安全响应头
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    }
    // 保存原始 json 方法
    const originalJson = res.json.bind(res);
    res.json = (body) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return originalJson(body);
    };
    next();
});
app.use(express_1.default.json({ limit: '1mb' })); // 限制请求体大小
// 请求日志（可选）
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
});
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// 登录接口不需要认证
app.use('/api/auth', auth_1.default);
// AI 专用接口（使用 X-API-Key 认证）
app.use('/api/ai', ai_1.default);
// 以下接口需要认证
app.use('/api/transactions', auth_1.authMiddleware, transactions_1.default);
app.use('/api/categories', auth_1.authMiddleware, categories_1.default);
app.use('/api/accounts', auth_1.authMiddleware, accounts_1.default);
app.use('/api/budgets', auth_1.authMiddleware, budgets_1.default);
app.use('/api/goals', auth_1.authMiddleware, goals_1.default);
app.use('/api/openclaw-cron', auth_1.authMiddleware, openclawCron_1.default);
app.use('/api/digest-history', auth_1.authMiddleware, digestHistory_1.default);
app.use('/api/schedule', auth_1.authMiddleware, schedule_1.default);
app.use('/api/semester', auth_1.authMiddleware, semester_1.default);
// 全局错误处理
app.use((err, req, res, _next) => {
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
