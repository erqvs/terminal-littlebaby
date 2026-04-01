"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../config/database"));
const dayjs_1 = __importDefault(require("dayjs"));
const semester_1 = require("../utils/semester");
const router = (0, express_1.Router)();
function serializeSemester(row) {
    return {
        ...row,
        start_date: (0, dayjs_1.default)(row.start_date).format('YYYY-MM-DD'),
        end_date: (0, dayjs_1.default)(row.end_date).format('YYYY-MM-DD'),
    };
}
// 获取当前激活的学期配置
router.get('/current', async (req, res) => {
    try {
        const [rows] = await database_1.default.execute('SELECT * FROM semester_config WHERE is_active = 1 LIMIT 1');
        const semester = rows[0];
        if (!semester) {
            res.status(404).json({ error: '未找到当前学期配置' });
            return;
        }
        const serializedSemester = serializeSemester(semester);
        res.json({
            ...serializedSemester,
            current_week: (0, semester_1.calculateCurrentWeek)(serializedSemester.start_date, serializedSemester.total_weeks, (0, dayjs_1.default)().format('YYYY-MM-DD')),
        });
    }
    catch (error) {
        console.error('Error fetching current semester:', error);
        res.status(500).json({ error: '获取学期配置失败' });
    }
});
// 获取所有学期配置
router.get('/', async (req, res) => {
    try {
        const [rows] = await database_1.default.execute('SELECT * FROM semester_config ORDER BY start_date DESC');
        res.json(rows.map(serializeSemester));
    }
    catch (error) {
        console.error('Error fetching semesters:', error);
        res.status(500).json({ error: '获取学期列表失败' });
    }
});
// 创建学期配置
router.post('/', async (req, res) => {
    const { name, start_date, end_date, total_weeks, is_active } = req.body;
    if (!name || !start_date || !end_date) {
        res.status(400).json({ error: '缺少必要参数' });
        return;
    }
    try {
        // 如果设为激活，先取消其他学期的激活状态
        if (is_active) {
            await database_1.default.execute('UPDATE semester_config SET is_active = 0');
        }
        const [result] = await database_1.default.execute('INSERT INTO semester_config (name, start_date, end_date, total_weeks, is_active) VALUES (?, ?, ?, ?, ?)', [name, start_date, end_date, total_weeks || 26, is_active ? 1 : 0]);
        res.status(201).json({
            id: result.insertId,
            name,
            start_date,
            end_date,
            total_weeks: total_weeks || 26,
            is_active: is_active ? 1 : 0,
        });
    }
    catch (error) {
        console.error('Error creating semester:', error);
        res.status(500).json({ error: '创建学期失败' });
    }
});
// 更新学期配置
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, start_date, end_date, total_weeks, is_active } = req.body;
    try {
        // 如果设为激活，先取消其他学期的激活状态
        if (is_active) {
            await database_1.default.execute('UPDATE semester_config SET is_active = 0');
        }
        await database_1.default.execute('UPDATE semester_config SET name = ?, start_date = ?, end_date = ?, total_weeks = ?, is_active = ? WHERE id = ?', [name, start_date, end_date, total_weeks, is_active ? 1 : 0, id]);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error updating semester:', error);
        res.status(500).json({ error: '更新学期失败' });
    }
});
// 删除学期配置
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await database_1.default.execute('DELETE FROM semester_config WHERE id = ?', [id]);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error deleting semester:', error);
        res.status(500).json({ error: '删除学期失败' });
    }
});
exports.default = router;
