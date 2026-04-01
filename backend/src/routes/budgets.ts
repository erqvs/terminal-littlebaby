import { Router, Request, Response } from 'express';
import pool from '../config/database';
import { validateBudget, validateId } from '../middleware/validation';
import {
  ensureBudgetsCarriedForward,
  ensureExpenseBudgetCategory,
  fetchBudgetsByWhere,
  parseBudgetYearMonth,
} from '../utils/budgets';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const parsed = parseBudgetYearMonth(req.query.year, req.query.month);
  if ('error' in parsed) {
    return res.status(400).json({ error: parsed.error });
  }

  const { year, month } = parsed;

  try {
    await ensureBudgetsCarriedForward(year, month);
    res.json(await fetchBudgetsByWhere('WHERE b.year = ? AND b.month = ?', [year, month], year, month));
  } catch (error) {
    console.error('Error fetching budgets:', error);
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
});

router.post('/', validateBudget, async (req: Request, res: Response) => {
  const { category_id, year, month, budget_amount, alert_threshold, note, sort_order } = req.body;

  try {
    const categoryCheck = await ensureExpenseBudgetCategory(category_id);
    if ('error' in categoryCheck) {
      return res.status(400).json({ error: categoryCheck.error });
    }

    const [result] = await pool.execute(
      `INSERT INTO budgets (category_id, year, month, budget_amount, alert_threshold, note, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        category_id,
        year,
        month,
        budget_amount,
        alert_threshold ?? 80,
        note ?? null,
        sort_order ?? 0,
      ]
    );

    const budgets = await fetchBudgetsByWhere('WHERE b.id = ?', [Number((result as any).insertId)], year, month);
    res.status(201).json(budgets[0]);
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: '该分类本月预算已存在' });
    }

    console.error('Error creating budget:', error);
    res.status(500).json({ error: 'Failed to create budget' });
  }
});

router.put('/:id', validateId, validateBudget, async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { category_id, year, month, budget_amount, alert_threshold, note, sort_order } = req.body;

  try {
    const [existingRows] = await pool.execute('SELECT * FROM budgets WHERE id = ?', [id]);
    const existing = (existingRows as any[])[0];

    if (!existing) {
      return res.status(404).json({ error: '预算不存在' });
    }

    const nextCategoryId = category_id !== undefined ? category_id : existing.category_id;
    const nextYear = year !== undefined ? year : existing.year;
    const nextMonth = month !== undefined ? month : existing.month;

    const categoryCheck = await ensureExpenseBudgetCategory(nextCategoryId);
    if ('error' in categoryCheck) {
      return res.status(400).json({ error: categoryCheck.error });
    }

    await pool.execute(
      `UPDATE budgets
       SET category_id = ?, year = ?, month = ?, budget_amount = ?, alert_threshold = ?, note = ?, sort_order = ?
       WHERE id = ?`,
      [
        nextCategoryId,
        nextYear,
        nextMonth,
        budget_amount !== undefined ? budget_amount : existing.budget_amount,
        alert_threshold !== undefined ? alert_threshold : existing.alert_threshold,
        note !== undefined ? note : existing.note,
        sort_order !== undefined ? sort_order : existing.sort_order,
        id,
      ]
    );

    const budgets = await fetchBudgetsByWhere('WHERE b.id = ?', [Number(id)], nextYear, nextMonth);
    res.json(budgets[0]);
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: '该分类本月预算已存在' });
    }

    console.error('Error updating budget:', error);
    res.status(500).json({ error: 'Failed to update budget' });
  }
});

router.delete('/:id', validateId, async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  try {
    const [result] = await pool.execute('DELETE FROM budgets WHERE id = ?', [id]);

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ error: '预算不存在' });
    }

    res.json({ message: 'Budget deleted' });
  } catch (error) {
    console.error('Error deleting budget:', error);
    res.status(500).json({ error: 'Failed to delete budget' });
  }
});

export default router;
