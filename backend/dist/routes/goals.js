"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../config/database"));
const validation_1 = require("../middleware/validation");
const router = (0, express_1.Router)();
// 获取所有目标
router.get('/', async (req, res) => {
    try {
        const [rows] = await database_1.default.execute('SELECT * FROM goals ORDER BY is_completed, sort_order, id');
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching goals:', error);
        res.status(500).json({ error: 'Failed to fetch goals' });
    }
});
// 创建目标
router.post('/', validation_1.validateGoal, async (req, res) => {
    const { name, icon, color, target_amount, current_amount, deadline, sort_order } = req.body;
    try {
        const [result] = await database_1.default.execute('INSERT INTO goals (name, icon, color, target_amount, current_amount, deadline, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)', [name, icon || 'target', color || '#52c41a', target_amount, current_amount || 0, deadline || null, sort_order || 0]);
        res.status(201).json({ id: result.insertId, ...req.body });
    }
    catch (error) {
        console.error('Error creating goal:', error);
        res.status(500).json({ error: 'Failed to create goal' });
    }
});
// 更新目标
router.put('/:id', validation_1.validateId, validation_1.validateGoal, async (req, res) => {
    const { id } = req.params;
    const { name, icon, color, target_amount, current_amount, deadline, is_completed, sort_order } = req.body;
    try {
        await database_1.default.execute('UPDATE goals SET name = ?, icon = ?, color = ?, target_amount = ?, current_amount = ?, deadline = ?, is_completed = ?, sort_order = ? WHERE id = ?', [name, icon, color, target_amount, current_amount, deadline, is_completed || false, sort_order, id]);
        res.json({ id, ...req.body });
    }
    catch (error) {
        console.error('Error updating goal:', error);
        res.status(500).json({ error: 'Failed to update goal' });
    }
});
// 删除目标
router.delete('/:id', validation_1.validateId, async (req, res) => {
    const { id } = req.params;
    try {
        await database_1.default.execute('DELETE FROM goals WHERE id = ?', [id]);
        res.json({ message: 'Goal deleted' });
    }
    catch (error) {
        console.error('Error deleting goal:', error);
        res.status(500).json({ error: 'Failed to delete goal' });
    }
});
exports.default = router;
