"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../config/database"));
const dayjs_1 = __importDefault(require("dayjs"));
const goals_1 = require("../utils/goals");
const budgets_1 = require("../utils/budgets");
const categories_1 = require("../utils/categories");
const semester_1 = require("../utils/semester");
const digestHistory_1 = require("../utils/digestHistory");
const router = (0, express_1.Router)();
const COURSE_TIME_SLOTS = [
    { key: 1, start: '08:10', end: '08:55' },
    { key: 2, start: '09:05', end: '09:50' },
    { key: 3, start: '10:10', end: '10:55' },
    { key: 4, start: '11:05', end: '11:50' },
    { key: 5, start: '13:30', end: '14:15' },
    { key: 6, start: '14:25', end: '15:10' },
    { key: 7, start: '15:30', end: '16:15' },
    { key: 8, start: '16:25', end: '17:10' },
    { key: 9, start: '18:20', end: '19:05' },
    { key: 10, start: '19:10', end: '19:55' },
    { key: 11, start: '20:00', end: '20:45' },
    { key: 12, start: '20:50', end: '21:35' },
];
const MAX_TIME_SLOT = COURSE_TIME_SLOTS.length;
const VALID_COURSE_QUERY_MODES = new Set(['auto', 'current', 'next', 'today', 'remaining']);
function parseJsonArray(value) {
    if (Array.isArray(value)) {
        return value;
    }
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        }
        catch {
            return [];
        }
    }
    return [];
}
function normalizeNumberList(values, min, max = Number.MAX_SAFE_INTEGER) {
    return Array.from(new Set(parseJsonArray(values)
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= min && value <= max))).sort((left, right) => left - right);
}
function normalizeScheduleCourse(row) {
    return {
        id: Number(row.id),
        name: String(row.name),
        teacher: typeof row.teacher === 'string' && row.teacher.trim() ? row.teacher.trim() : null,
        location: typeof row.location === 'string' && row.location.trim() ? row.location.trim() : null,
        color: typeof row.color === 'string' && row.color.trim() ? row.color.trim() : '#1890ff',
        day_of_week: Number(row.day_of_week),
        time_slot: normalizeNumberList(row.time_slot, 1, MAX_TIME_SLOT),
        weeks: normalizeNumberList(row.weeks, 1),
    };
}
function isCourseActiveInWeek(course, week) {
    return course.weeks.length === 0 || course.weeks.includes(week);
}
function getDayIndexFromDate(date) {
    const jsDay = (0, dayjs_1.default)(date).day();
    return jsDay === 0 ? 6 : jsDay - 1;
}
function parseTimeToMinutes(time) {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
    if (!match) {
        return null;
    }
    return Number(match[1]) * 60 + Number(match[2]);
}
function formatMinutes(minutes) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
function getSlotMeta(slot) {
    return COURSE_TIME_SLOTS.find((item) => item.key === slot) ?? null;
}
function getCourseRangeMinutes(course) {
    const startSlot = course.time_slot[0];
    const endSlot = course.time_slot[course.time_slot.length - 1];
    const startMeta = startSlot ? getSlotMeta(startSlot) : null;
    const endMeta = endSlot ? getSlotMeta(endSlot) : null;
    if (!startMeta || !endMeta) {
        return null;
    }
    const startMinutes = parseTimeToMinutes(startMeta.start);
    const endMinutes = parseTimeToMinutes(endMeta.end);
    if (startMinutes === null || endMinutes === null) {
        return null;
    }
    return { startMinutes, endMinutes };
}
function formatSlotLabel(slots) {
    if (slots.length === 0) {
        return '';
    }
    const start = slots[0];
    const end = slots[slots.length - 1];
    return start === end ? `第${start}节` : `第${start}-${end}节`;
}
function mapCourseInfo(course) {
    const range = getCourseRangeMinutes(course);
    return {
        id: course.id,
        name: course.name,
        teacher: course.teacher,
        location: course.location,
        day_of_week: course.day_of_week,
        time_slot: course.time_slot,
        weeks: course.weeks,
        slot_label: formatSlotLabel(course.time_slot),
        time_range: range ? `${formatMinutes(range.startMinutes)}-${formatMinutes(range.endMinutes)}` : null,
    };
}
// AI API Key 认证中间件
function aiAuthMiddleware(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    const validApiKey = process.env.AI_API_KEY;
    if (!validApiKey) {
        res.status(503).json({ error: 'AI_API_KEY 未配置' });
        return;
    }
    if (apiKey !== validApiKey) {
        res.status(401).json({ error: '无效的 API Key' });
        return;
    }
    next();
}
// 获取所有分类和账户（供 AI 参考）
router.get('/context', aiAuthMiddleware, async (req, res) => {
    try {
        const [categories] = await database_1.default.execute("SELECT id, name, type FROM categories WHERE kind = 'leaf' ORDER BY type, sort_order, name");
        const [accounts] = await database_1.default.execute('SELECT id, name, type, balance FROM accounts ORDER BY type, name');
        res.json({
            categories,
            accounts,
            today: (0, dayjs_1.default)().format('YYYY-MM-DD'),
        });
    }
    catch (error) {
        console.error('Error fetching AI context:', error);
        res.status(500).json({ error: '获取上下文失败' });
    }
});
// AI 记账接口
router.post('/transaction', aiAuthMiddleware, async (req, res) => {
    const connection = await database_1.default.getConnection();
    try {
        const { amount, category_id, account_id, description, date, type } = req.body;
        // 验证必填字段
        if (!amount || !category_id || !account_id) {
            return res.status(400).json({
                error: '缺少必填字段',
                required: ['amount', 'category_id', 'account_id'],
                optional: ['description', 'date', 'type']
            });
        }
        // 获取分类信息
        const [categoryRows] = await connection.execute('SELECT * FROM categories WHERE id = ?', [category_id]);
        const category = categoryRows[0];
        if (!category) {
            return res.status(400).json({ error: '分类不存在' });
        }
        if (category.kind !== 'leaf') {
            return res.status(400).json({ error: '交易记录只能使用普通分类' });
        }
        // 获取账户信息
        const [accountRows] = await connection.execute('SELECT * FROM accounts WHERE id = ?', [account_id]);
        const account = accountRows[0];
        if (!account) {
            return res.status(400).json({ error: '账户不存在' });
        }
        const transactionDate = date || (0, dayjs_1.default)().format('YYYY-MM-DD');
        const transactionType = type || category.type; // 默认使用分类的类型
        await connection.beginTransaction();
        // 插入交易记录
        const [result] = await connection.execute('INSERT INTO transactions (amount, category_id, account_id, description, date) VALUES (?, ?, ?, ?, ?)', [amount, category_id, account_id, description || '', transactionDate]);
        // 更新账户余额
        let newBalance;
        if (account.type === 'asset') {
            // 资产账户：收入增加，支出减少
            newBalance = Number(account.balance) + (transactionType === 'income' ? amount : -amount);
        }
        else {
            // 负债账户：支出增加已用额度，收入减少
            newBalance = Number(account.balance) + (transactionType === 'expense' ? amount : -amount);
        }
        await connection.execute('UPDATE accounts SET balance = ? WHERE id = ?', [newBalance, account_id]);
        await connection.commit();
        res.status(201).json({
            success: true,
            transaction: {
                id: result.insertId,
                amount,
                category_name: category.name,
                category_type: transactionType,
                account_name: account.name,
                account_type: account.type,
                description: description || '',
                date: transactionDate,
            },
            account_balance: newBalance,
            message: `记账成功：${transactionType === 'income' ? '收入' : '支出'} ¥${Number(amount).toFixed(2)}，${category.name}，${account.name}`
        });
    }
    catch (error) {
        await connection.rollback();
        console.error('Error creating AI transaction:', error);
        res.status(500).json({ error: '记账失败' });
    }
    finally {
        connection.release();
    }
});
// AI 查询最近交易
router.get('/recent', aiAuthMiddleware, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 10, 100);
        const days = parseInt(req.query.days) || 7;
        const startDate = (0, dayjs_1.default)().subtract(days, 'day').format('YYYY-MM-DD');
        // 使用 query 而不是 execute，因为 LIMIT 不支持 prepared statement
        const [rows] = await database_1.default.query(`
      SELECT t.*, c.name as category_name, c.type as category_type, a.name as account_name, a.type as account_type
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.date >= ?
      ORDER BY t.date DESC, t.id DESC
      LIMIT ${limit}
    `, [startDate]);
        res.json({
            transactions: rows,
            period: `最近 ${days} 天`,
        });
    }
    catch (error) {
        console.error('Error fetching recent transactions:', error);
        res.status(500).json({ error: '查询失败' });
    }
});
// AI 查询账户余额
router.get('/balance', aiAuthMiddleware, async (req, res) => {
    try {
        const [accounts] = await database_1.default.execute('SELECT id, name, type, balance, limit_amount FROM accounts ORDER BY type, name');
        const assetAccounts = accounts.filter(a => a.type === 'asset');
        const debtAccounts = accounts.filter(a => a.type === 'debt');
        const totalAssets = assetAccounts.reduce((sum, a) => sum + Number(a.balance), 0);
        const totalDebts = debtAccounts.reduce((sum, d) => sum + Number(d.balance), 0);
        res.json({
            accounts,
            summary: {
                total_assets: totalAssets,
                total_debts: totalDebts,
                net_worth: totalAssets - totalDebts,
            },
            message: `总资产 ¥${totalAssets.toFixed(2)}，总负债 ¥${totalDebts.toFixed(2)}，净资产 ¥${(totalAssets - totalDebts).toFixed(2)}`
        });
    }
    catch (error) {
        console.error('Error fetching balance:', error);
        res.status(500).json({ error: '查询失败' });
    }
});
// AI 查询课程信息（根据日期和时间返回当前课/下一节/当天课程）
router.get('/course-info', aiAuthMiddleware, async (req, res) => {
    try {
        const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
            ? req.query.date
            : (0, dayjs_1.default)().format('YYYY-MM-DD');
        const time = typeof req.query.time === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(req.query.time)
            ? req.query.time
            : (0, dayjs_1.default)().format('HH:mm');
        const mode = typeof req.query.mode === 'string' ? req.query.mode : 'auto';
        if (!VALID_COURSE_QUERY_MODES.has(mode)) {
            return res.status(400).json({
                error: 'mode 参数无效',
                allowed: Array.from(VALID_COURSE_QUERY_MODES),
            });
        }
        const [semesterRows] = await database_1.default.execute('SELECT * FROM semester_config WHERE is_active = 1 LIMIT 1');
        const semester = semesterRows[0];
        if (!semester) {
            return res.status(404).json({ error: '未找到当前学期配置' });
        }
        const startDate = (0, dayjs_1.default)(semester.start_date).format('YYYY-MM-DD');
        const endDate = (0, dayjs_1.default)(semester.end_date).format('YYYY-MM-DD');
        const targetDate = (0, dayjs_1.default)(date);
        if (targetDate.isBefore((0, dayjs_1.default)(startDate), 'day')
            || targetDate.isAfter((0, dayjs_1.default)(endDate), 'day')) {
            return res.json({ success: true, courses: [] });
        }
        const currentWeek = (0, semester_1.calculateCurrentWeek)(startDate, Number(semester.total_weeks), date);
        const dayOfWeek = getDayIndexFromDate(date);
        const currentMinutes = parseTimeToMinutes(time);
        if (currentMinutes === null) {
            return res.status(400).json({ error: 'time 参数无效，应为 HH:mm' });
        }
        const [rows] = await database_1.default.execute('SELECT * FROM schedule_courses WHERE day_of_week = ?', [dayOfWeek]);
        const dayCourses = rows
            .map(normalizeScheduleCourse)
            .filter((course) => isCourseActiveInWeek(course, currentWeek))
            .sort((left, right) => (left.time_slot[0] ?? 99) - (right.time_slot[0] ?? 99));
        const currentCourses = dayCourses.filter((course) => {
            const range = getCourseRangeMinutes(course);
            return range !== null && currentMinutes >= range.startMinutes && currentMinutes <= range.endMinutes;
        });
        const nextCourse = dayCourses.find((course) => {
            const range = getCourseRangeMinutes(course);
            return range !== null && range.startMinutes > currentMinutes;
        });
        const nextCourses = nextCourse
            ? dayCourses.filter((course) => (course.time_slot[0] ?? -1) === (nextCourse.time_slot[0] ?? -2))
            : [];
        const remainingCourses = dayCourses.filter((course) => {
            const range = getCourseRangeMinutes(course);
            return range !== null && range.endMinutes >= currentMinutes;
        });
        const matchedCourses = mode === 'today'
            ? dayCourses
            : mode === 'current'
                ? currentCourses
                : mode === 'next'
                    ? nextCourses
                    : mode === 'remaining'
                        ? remainingCourses
                        : currentCourses.length > 0
                            ? currentCourses
                            : nextCourses;
        res.json({
            success: true,
            courses: matchedCourses.map(mapCourseInfo),
        });
    }
    catch (error) {
        console.error('Error fetching course info:', error);
        res.status(500).json({ error: '查询课程信息失败' });
    }
});
// AI 同步账户余额（直接设置余额，不产生交易记录）
router.post('/sync-balance', aiAuthMiddleware, async (req, res) => {
    const connection = await database_1.default.getConnection();
    try {
        const { accounts } = req.body;
        if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
            return res.status(400).json({
                error: '缺少账户数据',
                required: { accounts: [{ id: 'number', balance: 'number', limit_amount: 'number (可选)' }] }
            });
        }
        await connection.beginTransaction();
        const results = [];
        for (const account of accounts) {
            const { id, balance, limit_amount } = account;
            if (id === undefined || balance === undefined) {
                continue;
            }
            // 获取账户信息
            const [rows] = await connection.execute('SELECT * FROM accounts WHERE id = ?', [id]);
            const existing = rows[0];
            if (!existing) {
                results.push({ id, success: false, error: '账户不存在' });
                continue;
            }
            // 更新余额
            if (limit_amount !== undefined && existing.type === 'debt') {
                await connection.execute('UPDATE accounts SET balance = ?, limit_amount = ? WHERE id = ?', [balance, limit_amount, id]);
            }
            else {
                await connection.execute('UPDATE accounts SET balance = ? WHERE id = ?', [balance, id]);
            }
            results.push({
                id,
                name: existing.name,
                type: existing.type,
                old_balance: Number(existing.balance),
                new_balance: balance,
                success: true
            });
        }
        await connection.commit();
        res.json({
            success: true,
            message: `已同步 ${results.filter(r => r.success).length} 个账户的余额`,
            results
        });
    }
    catch (error) {
        await connection.rollback();
        console.error('Error syncing balance:', error);
        res.status(500).json({ error: '同步余额失败' });
    }
    finally {
        connection.release();
    }
});
// AI 更新单个账户（包括余额、额度等）
router.put('/account/:id', aiAuthMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, balance, limit_amount, type, icon, color } = req.body;
        // 获取现有账户
        const [existingRows] = await database_1.default.execute('SELECT * FROM accounts WHERE id = ?', [id]);
        const existing = existingRows[0];
        if (!existing) {
            return res.status(404).json({ error: '账户不存在' });
        }
        const accountType = type || existing.type;
        await database_1.default.execute(`UPDATE accounts SET name = ?, type = ?, icon = ?, color = ?, balance = ?, limit_amount = ? WHERE id = ?`, [
            name || existing.name,
            accountType,
            icon || existing.icon,
            color || existing.color,
            balance !== undefined ? balance : existing.balance,
            limit_amount !== undefined ? limit_amount : existing.limit_amount,
            id
        ]);
        res.json({
            success: true,
            account: {
                id: parseInt(String(id)),
                name: name || existing.name,
                type: accountType,
                balance: balance !== undefined ? balance : existing.balance,
                limit_amount: limit_amount !== undefined ? limit_amount : existing.limit_amount
            }
        });
    }
    catch (error) {
        console.error('Error updating account:', error);
        res.status(500).json({ error: '更新账户失败' });
    }
});
// AI 创建新账户
router.post('/account', aiAuthMiddleware, async (req, res) => {
    try {
        const { name, type, balance, limit_amount, icon, color } = req.body;
        if (!name) {
            return res.status(400).json({ error: '账户名称不能为空' });
        }
        const accountType = type || 'asset';
        const [result] = await database_1.default.execute(`INSERT INTO accounts (name, type, icon, color, balance, limit_amount) VALUES (?, ?, ?, ?, ?, ?)`, [
            name,
            accountType,
            icon || (accountType === 'debt' ? 'credit' : 'wallet'),
            color || (accountType === 'debt' ? '#ff4d4f' : '#1890ff'),
            balance || 0,
            accountType === 'debt' ? (limit_amount || 0) : 0
        ]);
        res.status(201).json({
            success: true,
            account: {
                id: result.insertId,
                name,
                type: accountType,
                balance: balance || 0,
                limit_amount: accountType === 'debt' ? (limit_amount || 0) : 0
            }
        });
    }
    catch (error) {
        console.error('Error creating account:', error);
        res.status(500).json({ error: '创建账户失败' });
    }
});
// AI 删除账户
router.delete('/account/:id', aiAuthMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        // 检查是否有关联的交易记录
        const [transactions] = await database_1.default.execute('SELECT COUNT(*) as count FROM transactions WHERE account_id = ?', [id]);
        if (transactions[0].count > 0) {
            return res.status(400).json({ error: '该账户有关联的交易记录，无法删除' });
        }
        await database_1.default.execute('DELETE FROM accounts WHERE id = ?', [id]);
        res.json({ success: true, message: '账户已删除' });
    }
    catch (error) {
        console.error('Error deleting account:', error);
        res.status(500).json({ error: '删除账户失败' });
    }
});
// ==================== 交易管理 ====================
// AI 查询交易（支持多条件筛选）
router.get('/transactions', aiAuthMiddleware, async (req, res) => {
    try {
        const { start_date, end_date, category_id, account_id, type, limit, offset } = req.query;
        let sql = `
      SELECT t.*, c.name as category_name, c.type as category_type, a.name as account_name, a.type as account_type
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE 1=1
    `;
        const params = [];
        if (start_date) {
            sql += ' AND t.date >= ?';
            params.push(start_date);
        }
        if (end_date) {
            sql += ' AND t.date <= ?';
            params.push(end_date);
        }
        if (category_id) {
            sql += ' AND t.category_id = ?';
            params.push(category_id);
        }
        if (account_id) {
            sql += ' AND t.account_id = ?';
            params.push(account_id);
        }
        if (type) {
            sql += ' AND c.type = ?';
            params.push(type);
        }
        sql += ' ORDER BY t.date DESC, t.id DESC';
        // 使用 query 而不是 execute，因为 LIMIT/OFFSET 不支持 prepared statement
        const limitNum = limit ? Math.min(parseInt(limit), 1000) : 100;
        const offsetNum = offset ? parseInt(offset) : 0;
        sql += ` LIMIT ${limitNum} OFFSET ${offsetNum}`;
        const [rows] = await database_1.default.query(sql, params);
        // 统计汇总
        const summary = {
            total_count: rows.length,
            total_income: 0,
            total_expense: 0,
        };
        rows.forEach((t) => {
            if (t.category_type === 'income') {
                summary.total_income += Number(t.amount);
            }
            else {
                summary.total_expense += Number(t.amount);
            }
        });
        res.json({
            transactions: rows,
            summary,
        });
    }
    catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ error: '查询交易失败' });
    }
});
// AI 更新交易
router.put('/transaction/:id', aiAuthMiddleware, async (req, res) => {
    const connection = await database_1.default.getConnection();
    try {
        const { id } = req.params;
        const { amount, category_id, account_id, description, date } = req.body;
        // 获取原交易记录
        const [oldRows] = await connection.execute(`
      SELECT t.*, c.type as category_type
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.id = ?
    `, [id]);
        const oldTransaction = oldRows[0];
        if (!oldTransaction) {
            return res.status(404).json({ error: '交易记录不存在' });
        }
        await connection.beginTransaction();
        // 如果账户或金额或分类有变化，需要调整账户余额
        const newCategoryId = category_id || oldTransaction.category_id;
        const newAccountId = account_id || oldTransaction.account_id;
        const newAmount = amount !== undefined ? amount : oldTransaction.amount;
        // 获取新分类类型
        const [categoryRows] = await connection.execute('SELECT type, kind FROM categories WHERE id = ?', [newCategoryId]);
        const newCategory = categoryRows[0];
        if (!newCategory) {
            await connection.rollback();
            return res.status(400).json({ error: '分类不存在' });
        }
        if (newCategory.kind !== 'leaf') {
            await connection.rollback();
            return res.status(400).json({ error: '交易记录只能使用普通分类' });
        }
        // 获取账户信息
        const [accountRows] = await connection.execute('SELECT * FROM accounts WHERE id = ?', [newAccountId]);
        const account = accountRows[0];
        if (!account) {
            await connection.rollback();
            return res.status(400).json({ error: '账户不存在' });
        }
        // 如果账户变了，需要：1. 恢复原账户余额 2. 更新新账户余额
        if (oldTransaction.account_id !== newAccountId) {
            // 恢复原账户
            const [oldAccountRows] = await connection.execute('SELECT * FROM accounts WHERE id = ?', [oldTransaction.account_id]);
            const oldAccount = oldAccountRows[0];
            if (oldAccount) {
                const reverseType = oldTransaction.category_type === 'income' ? 'expense' : 'income';
                let oldAccountNewBalance;
                if (oldAccount.type === 'asset') {
                    oldAccountNewBalance = Number(oldAccount.balance) + (reverseType === 'income' ? oldTransaction.amount : -oldTransaction.amount);
                }
                else {
                    oldAccountNewBalance = Number(oldAccount.balance) + (reverseType === 'expense' ? oldTransaction.amount : -oldTransaction.amount);
                }
                await connection.execute('UPDATE accounts SET balance = ? WHERE id = ?', [oldAccountNewBalance, oldTransaction.account_id]);
            }
            // 更新新账户
            let newAccountNewBalance;
            if (account.type === 'asset') {
                newAccountNewBalance = Number(account.balance) + (newCategory.type === 'income' ? newAmount : -newAmount);
            }
            else {
                newAccountNewBalance = Number(account.balance) + (newCategory.type === 'expense' ? newAmount : -newAmount);
            }
            await connection.execute('UPDATE accounts SET balance = ? WHERE id = ?', [newAccountNewBalance, newAccountId]);
        }
        else {
            // 同一账户，计算差额
            const oldEffect = oldTransaction.category_type === 'income' ? Number(oldTransaction.amount) : -Number(oldTransaction.amount);
            const newEffect = newCategory.type === 'income' ? Number(newAmount) : -Number(newAmount);
            const diff = newEffect - oldEffect;
            // 根据账户类型调整影响
            let balanceDiff;
            if (account.type === 'asset') {
                balanceDiff = diff;
            }
            else {
                // 负债账户逻辑相反
                balanceDiff = -diff;
            }
            const newBalance = Number(account.balance) + balanceDiff;
            await connection.execute('UPDATE accounts SET balance = ? WHERE id = ?', [newBalance, newAccountId]);
        }
        // 更新交易记录
        await connection.execute('UPDATE transactions SET amount = ?, category_id = ?, account_id = ?, description = ?, date = ? WHERE id = ?', [newAmount, newCategoryId, newAccountId, description !== undefined ? description : oldTransaction.description, date || oldTransaction.date, id]);
        await connection.commit();
        // 获取更新后的完整记录
        const [newRows] = await database_1.default.execute(`
      SELECT t.*, c.name as category_name, c.type as category_type, a.name as account_name, a.type as account_type
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.id = ?
    `, [id]);
        res.json({
            success: true,
            transaction: newRows[0],
            message: '交易记录已更新',
        });
    }
    catch (error) {
        await connection.rollback();
        console.error('Error updating transaction:', error);
        res.status(500).json({ error: '更新交易失败' });
    }
    finally {
        connection.release();
    }
});
// AI 删除交易
router.delete('/transaction/:id', aiAuthMiddleware, async (req, res) => {
    const connection = await database_1.default.getConnection();
    try {
        const { id } = req.params;
        // 获取要删除的交易记录
        const [transRows] = await connection.execute(`
      SELECT t.*, c.type as category_type
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.id = ?
    `, [id]);
        const transaction = transRows[0];
        if (!transaction) {
            return res.status(404).json({ error: '交易记录不存在' });
        }
        await connection.beginTransaction();
        // 反向更新账户余额
        if (transaction.account_id) {
            const [accountRows] = await connection.execute('SELECT * FROM accounts WHERE id = ?', [transaction.account_id]);
            const account = accountRows[0];
            if (account) {
                const reverseType = transaction.category_type === 'income' ? 'expense' : 'income';
                let newBalance;
                if (account.type === 'asset') {
                    newBalance = Number(account.balance) + (reverseType === 'income' ? transaction.amount : -transaction.amount);
                }
                else {
                    newBalance = Number(account.balance) + (reverseType === 'expense' ? transaction.amount : -transaction.amount);
                }
                await connection.execute('UPDATE accounts SET balance = ? WHERE id = ?', [newBalance, transaction.account_id]);
            }
        }
        // 删除交易记录
        await connection.execute('DELETE FROM transactions WHERE id = ?', [id]);
        await connection.commit();
        res.json({
            success: true,
            message: '交易记录已删除',
            deleted_transaction: {
                id: transaction.id,
                amount: transaction.amount,
                category_type: transaction.category_type,
            },
        });
    }
    catch (error) {
        await connection.rollback();
        console.error('Error deleting transaction:', error);
        res.status(500).json({ error: '删除交易失败' });
    }
    finally {
        connection.release();
    }
});
// ==================== 分类管理 ====================
// AI 获取所有分类
router.get('/categories', aiAuthMiddleware, async (req, res) => {
    try {
        const kindInput = typeof req.query.kind === 'string' ? req.query.kind : undefined;
        const typeInput = typeof req.query.type === 'string' ? req.query.type : undefined;
        const includeMembers = req.query.include_members === 'true' || req.query.includeMembers === 'true';
        const kind = kindInput && kindInput !== 'all'
            ? ((0, categories_1.isCategoryKind)(kindInput) ? kindInput : null)
            : kindInput === 'all'
                ? 'all'
                : undefined;
        if (kind === null) {
            return res.status(400).json({ error: '分类 kind 参数无效' });
        }
        const type = typeInput ? ((0, categories_1.isCategoryType)(typeInput) ? typeInput : null) : undefined;
        if (type === null) {
            return res.status(400).json({ error: '分类 type 参数无效' });
        }
        res.json({
            success: true,
            categories: await (0, categories_1.loadCategories)({ kind, type, includeMembers }),
        });
    }
    catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: '获取分类失败' });
    }
});
// AI 创建分类
router.post('/category', aiAuthMiddleware, async (req, res) => {
    const { name, type, icon, kind = 'leaf', member_ids } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
        return res.status(400).json({ error: '分类名称不能为空且不能超过 100 个字符' });
    }
    if (!(0, categories_1.isCategoryType)(type)) {
        return res.status(400).json({ error: '分类类型必须是 income 或 expense' });
    }
    if (!(0, categories_1.isCategoryKind)(kind)) {
        return res.status(400).json({ error: '分类 kind 参数无效' });
    }
    if (icon !== undefined && icon !== null && (typeof icon !== 'string' || icon.length > 50)) {
        return res.status(400).json({ error: '图标标识不能超过 50 个字符' });
    }
    const normalizedName = name.trim();
    const normalizedIcon = typeof icon === 'string' && icon.trim() ? icon.trim() : null;
    try {
        let memberIds = [];
        if (kind === 'group') {
            const validation = await (0, categories_1.validateGroupMembers)(type, member_ids);
            if ('error' in validation) {
                return res.status(400).json({ error: validation.error });
            }
            memberIds = validation.memberIds;
        }
        const sortOrder = await (0, categories_1.resolveNextCategorySortOrder)(type, kind);
        const connection = await database_1.default.getConnection();
        try {
            await connection.beginTransaction();
            const [result] = await connection.execute('INSERT INTO categories (name, type, icon, kind, sort_order) VALUES (?, ?, ?, ?, ?)', [normalizedName, type, normalizedIcon, kind, sortOrder]);
            const categoryId = Number(result.insertId);
            if (kind === 'group' && memberIds.length > 0) {
                for (const memberId of memberIds) {
                    await connection.execute('INSERT INTO category_group_members (group_id, member_category_id) VALUES (?, ?)', [categoryId, memberId]);
                }
            }
            await connection.commit();
            const category = await (0, categories_1.loadCategoryById)(categoryId);
            res.status(201).json({
                success: true,
                category,
                message: `分类「${normalizedName}」创建成功`,
            });
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    catch (error) {
        console.error('Error creating category:', error);
        res.status(500).json({ error: '创建分类失败' });
    }
});
// AI 更新分类
router.put('/category/:id', aiAuthMiddleware, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { name, type, icon, member_ids } = req.body ?? {};
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: '无效的分类 ID' });
        }
        const existing = await (0, categories_1.loadCategoryById)(id);
        if (!existing) {
            return res.status(404).json({ error: '分类不存在' });
        }
        if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.trim().length > 100)) {
            return res.status(400).json({ error: '分类名称不能为空且不能超过 100 个字符' });
        }
        if (type !== undefined && !(0, categories_1.isCategoryType)(type)) {
            return res.status(400).json({ error: '分类类型必须是 income 或 expense' });
        }
        if (icon !== undefined && icon !== null && (typeof icon !== 'string' || icon.length > 50)) {
            return res.status(400).json({ error: '图标标识不能超过 50 个字符' });
        }
        if (existing.kind === 'leaf' && member_ids !== undefined) {
            return res.status(400).json({ error: '普通分类不能设置成员分类' });
        }
        const nextType = (type || existing.type);
        const nextName = typeof name === 'string' ? name.trim() : existing.name;
        const nextIcon = icon === undefined
            ? existing.icon
            : (typeof icon === 'string' && icon.trim() ? icon.trim() : null);
        let memberIds = existing.member_ids || [];
        if (existing.kind === 'group') {
            const validation = await (0, categories_1.validateGroupMembers)(nextType, member_ids !== undefined ? member_ids : memberIds, id);
            if ('error' in validation) {
                return res.status(400).json({ error: validation.error });
            }
            memberIds = validation.memberIds;
        }
        const connection = await database_1.default.getConnection();
        try {
            await connection.beginTransaction();
            await connection.execute('UPDATE categories SET name = ?, type = ?, icon = ? WHERE id = ?', [nextName, nextType, nextIcon, id]);
            if (existing.kind === 'group') {
                await connection.execute('DELETE FROM category_group_members WHERE group_id = ?', [id]);
                for (const memberId of memberIds) {
                    await connection.execute('INSERT INTO category_group_members (group_id, member_category_id) VALUES (?, ?)', [id, memberId]);
                }
            }
            await connection.commit();
            const category = await (0, categories_1.loadCategoryById)(id);
            res.json({
                success: true,
                category,
                message: '分类已更新',
            });
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    catch (error) {
        console.error('Error updating category:', error);
        res.status(500).json({ error: '更新分类失败' });
    }
});
// AI 删除分类
router.delete('/category/:id', aiAuthMiddleware, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: '无效的分类 ID' });
        }
        const category = await (0, categories_1.loadCategoryById)(id);
        if (!category) {
            return res.status(404).json({ error: '分类不存在' });
        }
        const [budgetRefs] = await database_1.default.execute('SELECT COUNT(*) as count FROM budgets WHERE category_id = ?', [id]);
        if (Number(budgetRefs[0]?.count || 0) > 0) {
            return res.status(400).json({
                error: '该分类已被预算使用，无法删除',
                related_count: Number(budgetRefs[0]?.count || 0),
            });
        }
        if (category.kind === 'leaf') {
            const [transactions] = await database_1.default.execute('SELECT COUNT(*) as count FROM transactions WHERE category_id = ?', [id]);
            if (Number(transactions[0]?.count || 0) > 0) {
                return res.status(400).json({
                    error: '该分类有关联的交易记录，无法删除',
                    related_count: Number(transactions[0]?.count || 0),
                });
            }
            const [groupRefs] = await database_1.default.execute('SELECT COUNT(*) as count FROM category_group_members WHERE member_category_id = ?', [id]);
            if (Number(groupRefs[0]?.count || 0) > 0) {
                return res.status(400).json({
                    error: '该分类已被组合分类使用，无法删除',
                    related_count: Number(groupRefs[0]?.count || 0),
                });
            }
        }
        await database_1.default.execute('DELETE FROM categories WHERE id = ?', [id]);
        res.json({
            success: true,
            message: `分类「${category.name}」已删除`,
        });
    }
    catch (error) {
        console.error('Error deleting category:', error);
        res.status(500).json({ error: '删除分类失败' });
    }
});
// ==================== 目标管理 ====================
// ==================== 预算管理 ====================
router.get('/budgets', aiAuthMiddleware, async (req, res) => {
    const parsed = (0, budgets_1.parseBudgetYearMonth)(req.query.year, req.query.month);
    if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
    }
    const { year, month } = parsed;
    try {
        res.json({
            success: true,
            year,
            month,
            budgets: await (0, budgets_1.fetchBudgetsByWhere)('WHERE b.year = ? AND b.month = ?', [year, month], year, month),
        });
    }
    catch (error) {
        console.error('Error fetching budgets:', error);
        res.status(500).json({ error: '获取预算失败' });
    }
});
router.post('/budget', aiAuthMiddleware, async (req, res) => {
    try {
        const { category_id, year, month, budget_amount, alert_threshold, note, sort_order } = req.body;
        if (!category_id || !year || !month || !budget_amount) {
            return res.status(400).json({
                error: '缺少必填字段',
                required: ['category_id', 'year', 'month', 'budget_amount'],
                optional: ['alert_threshold', 'note', 'sort_order'],
            });
        }
        const parsed = (0, budgets_1.parseBudgetYearMonth)(year, month);
        if ('error' in parsed) {
            return res.status(400).json({ error: parsed.error });
        }
        const categoryCheck = await (0, budgets_1.ensureExpenseBudgetCategory)(Number(category_id));
        if ('error' in categoryCheck) {
            return res.status(400).json({ error: categoryCheck.error });
        }
        const [result] = await database_1.default.execute(`INSERT INTO budgets (category_id, year, month, budget_amount, alert_threshold, note, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`, [
            category_id,
            parsed.year,
            parsed.month,
            budget_amount,
            alert_threshold ?? 80,
            note ?? null,
            sort_order ?? 0,
        ]);
        const budget = (await (0, budgets_1.fetchBudgetsByWhere)('WHERE b.id = ?', [Number(result.insertId)], parsed.year, parsed.month))[0];
        res.status(201).json({
            success: true,
            budget,
            message: '预算已创建',
        });
    }
    catch (error) {
        if (error?.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: '该分类本月预算已存在' });
        }
        console.error('Error creating budget:', error);
        res.status(500).json({ error: '创建预算失败' });
    }
});
router.put('/budget/:id', aiAuthMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { category_id, year, month, budget_amount, alert_threshold, note, sort_order } = req.body;
        const [existingRows] = await database_1.default.execute('SELECT * FROM budgets WHERE id = ?', [id]);
        const existing = existingRows[0];
        if (!existing) {
            return res.status(404).json({ error: '预算不存在' });
        }
        const nextCategoryId = category_id !== undefined ? Number(category_id) : Number(existing.category_id);
        const nextYear = year !== undefined ? Number(year) : Number(existing.year);
        const nextMonth = month !== undefined ? Number(month) : Number(existing.month);
        const parsed = (0, budgets_1.parseBudgetYearMonth)(nextYear, nextMonth);
        if ('error' in parsed) {
            return res.status(400).json({ error: parsed.error });
        }
        const categoryCheck = await (0, budgets_1.ensureExpenseBudgetCategory)(nextCategoryId);
        if ('error' in categoryCheck) {
            return res.status(400).json({ error: categoryCheck.error });
        }
        await database_1.default.execute(`UPDATE budgets
       SET category_id = ?, year = ?, month = ?, budget_amount = ?, alert_threshold = ?, note = ?, sort_order = ?
       WHERE id = ?`, [
            nextCategoryId,
            parsed.year,
            parsed.month,
            budget_amount !== undefined ? budget_amount : existing.budget_amount,
            alert_threshold !== undefined ? alert_threshold : existing.alert_threshold,
            note !== undefined ? note : existing.note,
            sort_order !== undefined ? sort_order : existing.sort_order,
            id,
        ]);
        const budget = (await (0, budgets_1.fetchBudgetsByWhere)('WHERE b.id = ?', [Number(id)], parsed.year, parsed.month))[0];
        res.json({
            success: true,
            budget,
            message: '预算已更新',
        });
    }
    catch (error) {
        if (error?.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: '该分类本月预算已存在' });
        }
        console.error('Error updating budget:', error);
        res.status(500).json({ error: '更新预算失败' });
    }
});
router.delete('/budget/:id', aiAuthMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const [budgetRows] = await database_1.default.execute('SELECT * FROM budgets WHERE id = ?', [id]);
        const budget = budgetRows[0];
        if (!budget) {
            return res.status(404).json({ error: '预算不存在' });
        }
        await database_1.default.execute('DELETE FROM budgets WHERE id = ?', [id]);
        res.json({
            success: true,
            message: `预算「${budget.id}」已删除`,
        });
    }
    catch (error) {
        console.error('Error deleting budget:', error);
        res.status(500).json({ error: '删除预算失败' });
    }
});
// ==================== 目标管理 ====================
// AI 获取所有目标
router.get('/goals', aiAuthMiddleware, async (req, res) => {
    try {
        res.json({
            success: true,
            goals: await (0, goals_1.fetchDecoratedGoals)(),
        });
    }
    catch (error) {
        console.error('Error fetching goals:', error);
        res.status(500).json({ error: '获取目标失败' });
    }
});
// AI 创建目标
router.post('/goal', aiAuthMiddleware, async (req, res) => {
    try {
        const { name, icon, color, target_amount, deadline, sort_order } = req.body;
        if (!name) {
            return res.status(400).json({ error: '目标名称不能为空' });
        }
        if (!target_amount || target_amount <= 0) {
            return res.status(400).json({ error: '目标金额必须大于 0' });
        }
        const nextSortOrder = await (0, goals_1.resolveNextGoalSortOrder)(sort_order);
        const [result] = await database_1.default.execute('INSERT INTO goals (name, icon, color, target_amount, current_amount, deadline, is_completed, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [name, icon || 'target', color || '#52c41a', target_amount, 0, deadline || null, 0, nextSortOrder]);
        const goal = (await (0, goals_1.fetchDecoratedGoals)()).find((item) => Number(item.id) === Number(result.insertId));
        res.status(201).json({
            success: true,
            goal,
            message: `目标「${name}」创建成功`,
        });
    }
    catch (error) {
        console.error('Error creating goal:', error);
        res.status(500).json({ error: '创建目标失败' });
    }
});
// AI 调整目标顺序
router.put('/goal/reorder', aiAuthMiddleware, async (req, res) => {
    try {
        const result = await (0, goals_1.reorderGoals)(req.body?.goal_ids);
        if ('error' in result) {
            return res.status(400).json({ error: result.error });
        }
        res.json({
            success: true,
            goals: result.goals,
            message: '目标顺序已更新',
        });
    }
    catch (error) {
        console.error('Error reordering goals:', error);
        res.status(500).json({ error: '调整目标顺序失败' });
    }
});
// AI 更新目标
router.put('/goal/:id', aiAuthMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, icon, color, target_amount, deadline, sort_order } = req.body;
        // 获取现有目标
        const [existingRows] = await database_1.default.execute('SELECT * FROM goals WHERE id = ?', [id]);
        const existing = existingRows[0];
        if (!existing) {
            return res.status(404).json({ error: '目标不存在' });
        }
        const newTargetAmount = target_amount !== undefined ? target_amount : existing.target_amount;
        const newSortOrder = sort_order !== undefined ? sort_order : existing.sort_order;
        await database_1.default.execute('UPDATE goals SET name = ?, icon = ?, color = ?, target_amount = ?, current_amount = ?, deadline = ?, is_completed = ?, sort_order = ? WHERE id = ?', [
            name || existing.name,
            icon || existing.icon,
            color || existing.color,
            newTargetAmount,
            existing.current_amount,
            deadline !== undefined ? deadline : existing.deadline,
            existing.is_completed,
            newSortOrder,
            id,
        ]);
        const goal = (await (0, goals_1.fetchDecoratedGoals)()).find((item) => Number(item.id) === Number(id));
        res.json({
            success: true,
            goal,
            message: '目标已更新',
        });
    }
    catch (error) {
        console.error('Error updating goal:', error);
        res.status(500).json({ error: '更新目标失败' });
    }
});
// AI 删除目标
router.delete('/goal/:id', aiAuthMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        // 获取目标信息用于返回
        const [goalRows] = await database_1.default.execute('SELECT * FROM goals WHERE id = ?', [id]);
        const goal = goalRows[0];
        if (!goal) {
            return res.status(404).json({ error: '目标不存在' });
        }
        await database_1.default.execute('DELETE FROM goals WHERE id = ?', [id]);
        res.json({
            success: true,
            message: `目标「${goal.name}」已删除`,
        });
    }
    catch (error) {
        console.error('Error deleting goal:', error);
        res.status(500).json({ error: '删除目标失败' });
    }
});
// ==================== 简报去重历史 ====================
function parseDigestHistoryItems(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
        const entry = item;
        return {
            title: typeof entry.title === 'string' ? entry.title : undefined,
            source: typeof entry.source === 'string' ? entry.source : undefined,
            source_id: typeof entry.source_id === 'string' ? entry.source_id : undefined,
            canonical_url: typeof entry.canonical_url === 'string' ? entry.canonical_url : undefined,
            published_at: typeof entry.published_at === 'string' ? entry.published_at : undefined,
            dedupe_key: typeof entry.dedupe_key === 'string' ? entry.dedupe_key : undefined,
            doi: typeof entry.doi === 'string' ? entry.doi : undefined,
            arxiv_id: typeof entry.arxiv_id === 'string' ? entry.arxiv_id : undefined,
            openalex_id: typeof entry.openalex_id === 'string' ? entry.openalex_id : undefined,
            repo_full_name: typeof entry.repo_full_name === 'string' ? entry.repo_full_name : undefined,
            meta: entry.meta && typeof entry.meta === 'object' && !Array.isArray(entry.meta)
                ? entry.meta
                : null,
        };
    });
}
router.post('/digest-history/check', aiAuthMiddleware, async (req, res) => {
    try {
        const digestType = req.body?.digest_type;
        const items = parseDigestHistoryItems(req.body?.items);
        const windowDaysRaw = req.body?.window_days;
        const windowDays = windowDaysRaw === undefined || windowDaysRaw === null
            ? 7
            : Number.parseInt(String(windowDaysRaw), 10);
        if (!(0, digestHistory_1.isDigestType)(digestType)) {
            return res.status(400).json({ error: 'digest_type 必须是 news、github 或 paper' });
        }
        if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 3650) {
            return res.status(400).json({ error: 'window_days 必须是 1 到 3650 之间的整数' });
        }
        if (items.length === 0) {
            return res.status(400).json({ error: 'items 不能为空' });
        }
        const result = await (0, digestHistory_1.checkDigestHistory)(digestType, items, windowDays);
        res.json({
            success: true,
            digest_type: digestType,
            window_days: windowDays,
            items: result,
        });
    }
    catch (error) {
        console.error('Error checking digest history:', error);
        res.status(500).json({ error: error?.message || '检查简报去重历史失败' });
    }
});
router.post('/digest-history/record', aiAuthMiddleware, async (req, res) => {
    try {
        const digestType = req.body?.digest_type;
        const items = parseDigestHistoryItems(req.body?.items);
        const sentAt = typeof req.body?.sent_at === 'string' ? req.body.sent_at : undefined;
        if (!(0, digestHistory_1.isDigestType)(digestType)) {
            return res.status(400).json({ error: 'digest_type 必须是 news、github 或 paper' });
        }
        if (items.length === 0) {
            return res.status(400).json({ error: 'items 不能为空' });
        }
        const result = await (0, digestHistory_1.recordDigestHistory)(digestType, items, sentAt);
        res.json({
            success: true,
            digest_type: digestType,
            items: result,
            message: '简报历史已记录',
        });
    }
    catch (error) {
        console.error('Error recording digest history:', error);
        res.status(500).json({ error: error?.message || '记录简报去重历史失败' });
    }
});
exports.default = router;
