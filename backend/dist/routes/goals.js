"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../config/database"));
const validation_1 = require("../middleware/validation");
const goals_1 = require("../utils/goals");
const router = (0, express_1.Router)();
// 获取所有目标
router.get('/', async (req, res) => {
    try {
        res.json(await (0, goals_1.fetchDecoratedGoals)());
    }
    catch (error) {
        console.error('Error fetching goals:', error);
        res.status(500).json({ error: 'Failed to fetch goals' });
    }
});
// 创建目标
router.post('/', validation_1.validateGoal, async (req, res) => {
    const { name, icon, color, target_amount, deadline, sort_order } = req.body;
    try {
        const nextSortOrder = await (0, goals_1.resolveNextGoalSortOrder)(sort_order);
        const [result] = await database_1.default.execute('INSERT INTO goals (name, icon, color, target_amount, current_amount, deadline, is_completed, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [name, icon || 'target', color || '#52c41a', target_amount, 0, deadline || null, 0, nextSortOrder]);
        const createdGoal = (await (0, goals_1.fetchDecoratedGoals)()).find((goal) => Number(goal.id) === Number(result.insertId));
        res.status(201).json(createdGoal);
    }
    catch (error) {
        console.error('Error creating goal:', error);
        res.status(500).json({ error: 'Failed to create goal' });
    }
});
// 调整目标顺序
router.put('/reorder', async (req, res) => {
    try {
        const result = await (0, goals_1.reorderGoals)(req.body?.goal_ids);
        if ('error' in result) {
            return res.status(400).json({ error: result.error });
        }
        res.json(result.goals);
    }
    catch (error) {
        console.error('Error reordering goals:', error);
        res.status(500).json({ error: 'Failed to reorder goals' });
    }
});
// 更新目标
router.put('/:id', validation_1.validateId, validation_1.validateGoal, async (req, res) => {
    const { id } = req.params;
    const { name, icon, color, target_amount, deadline, sort_order } = req.body;
    try {
        const [existingRows] = await database_1.default.execute('SELECT * FROM goals WHERE id = ?', [id]);
        const existing = existingRows[0];
        if (!existing) {
            return res.status(404).json({ error: '目标不存在' });
        }
        const nextTargetAmount = target_amount !== undefined ? target_amount : existing.target_amount;
        const nextSortOrder = sort_order !== undefined ? sort_order : existing.sort_order;
        await database_1.default.execute('UPDATE goals SET name = ?, icon = ?, color = ?, target_amount = ?, current_amount = ?, deadline = ?, is_completed = ?, sort_order = ? WHERE id = ?', [
            name || existing.name,
            icon || existing.icon,
            color || existing.color,
            nextTargetAmount,
            existing.current_amount,
            deadline !== undefined ? deadline : existing.deadline,
            existing.is_completed,
            nextSortOrder,
            id,
        ]);
        const updatedGoal = (await (0, goals_1.fetchDecoratedGoals)()).find((goal) => Number(goal.id) === Number(id));
        res.json(updatedGoal);
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
