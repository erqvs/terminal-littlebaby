"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../config/database"));
const validation_1 = require("../middleware/validation");
const budgets_1 = require("../utils/budgets");
const router = (0, express_1.Router)();
router.get('/', async (req, res) => {
    const parsed = (0, budgets_1.parseBudgetYearMonth)(req.query.year, req.query.month);
    if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
    }
    const { year, month } = parsed;
    try {
        await (0, budgets_1.ensureBudgetsCarriedForward)(year, month);
        res.json(await (0, budgets_1.fetchBudgetsByWhere)('WHERE b.year = ? AND b.month = ?', [year, month], year, month));
    }
    catch (error) {
        console.error('Error fetching budgets:', error);
        res.status(500).json({ error: 'Failed to fetch budgets' });
    }
});
router.post('/', validation_1.validateBudget, async (req, res) => {
    const { category_id, year, month, budget_amount, alert_threshold, note, sort_order } = req.body;
    try {
        const categoryCheck = await (0, budgets_1.ensureExpenseBudgetCategory)(category_id);
        if ('error' in categoryCheck) {
            return res.status(400).json({ error: categoryCheck.error });
        }
        const [result] = await database_1.default.execute(`INSERT INTO budgets (category_id, year, month, budget_amount, alert_threshold, note, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`, [
            category_id,
            year,
            month,
            budget_amount,
            alert_threshold ?? 80,
            note ?? null,
            sort_order ?? 0,
        ]);
        const budgets = await (0, budgets_1.fetchBudgetsByWhere)('WHERE b.id = ?', [Number(result.insertId)], year, month);
        res.status(201).json(budgets[0]);
    }
    catch (error) {
        if (error?.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: '该分类本月预算已存在' });
        }
        console.error('Error creating budget:', error);
        res.status(500).json({ error: 'Failed to create budget' });
    }
});
router.put('/:id', validation_1.validateId, validation_1.validateBudget, async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { category_id, year, month, budget_amount, alert_threshold, note, sort_order } = req.body;
    try {
        const [existingRows] = await database_1.default.execute('SELECT * FROM budgets WHERE id = ?', [id]);
        const existing = existingRows[0];
        if (!existing) {
            return res.status(404).json({ error: '预算不存在' });
        }
        const nextCategoryId = category_id !== undefined ? category_id : existing.category_id;
        const nextYear = year !== undefined ? year : existing.year;
        const nextMonth = month !== undefined ? month : existing.month;
        const categoryCheck = await (0, budgets_1.ensureExpenseBudgetCategory)(nextCategoryId);
        if ('error' in categoryCheck) {
            return res.status(400).json({ error: categoryCheck.error });
        }
        await database_1.default.execute(`UPDATE budgets
       SET category_id = ?, year = ?, month = ?, budget_amount = ?, alert_threshold = ?, note = ?, sort_order = ?
       WHERE id = ?`, [
            nextCategoryId,
            nextYear,
            nextMonth,
            budget_amount !== undefined ? budget_amount : existing.budget_amount,
            alert_threshold !== undefined ? alert_threshold : existing.alert_threshold,
            note !== undefined ? note : existing.note,
            sort_order !== undefined ? sort_order : existing.sort_order,
            id,
        ]);
        const budgets = await (0, budgets_1.fetchBudgetsByWhere)('WHERE b.id = ?', [Number(id)], nextYear, nextMonth);
        res.json(budgets[0]);
    }
    catch (error) {
        if (error?.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: '该分类本月预算已存在' });
        }
        console.error('Error updating budget:', error);
        res.status(500).json({ error: 'Failed to update budget' });
    }
});
router.delete('/:id', validation_1.validateId, async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    try {
        const [result] = await database_1.default.execute('DELETE FROM budgets WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: '预算不存在' });
        }
        res.json({ message: 'Budget deleted' });
    }
    catch (error) {
        console.error('Error deleting budget:', error);
        res.status(500).json({ error: 'Failed to delete budget' });
    }
});
exports.default = router;
