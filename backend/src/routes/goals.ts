import { Router, Request, Response } from 'express';
import pool from '../config/database';
import { validateId, validateGoal } from '../middleware/validation';
import { fetchDecoratedGoals, reorderGoals, resolveNextGoalSortOrder } from '../utils/goals';

const router = Router();

// 获取所有目标
router.get('/', async (req: Request, res: Response) => {
  try {
    res.json(await fetchDecoratedGoals());
  } catch (error) {
    console.error('Error fetching goals:', error);
    res.status(500).json({ error: 'Failed to fetch goals' });
  }
});

// 创建目标
router.post('/', validateGoal, async (req: Request, res: Response) => {
  const { name, icon, color, target_amount, deadline, sort_order } = req.body;
  try {
    const nextSortOrder = await resolveNextGoalSortOrder(sort_order);

    const [result] = await pool.execute(
      'INSERT INTO goals (name, icon, color, target_amount, current_amount, deadline, is_completed, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, icon || 'target', color || '#52c41a', target_amount, 0, deadline || null, 0, nextSortOrder]
    );

    const createdGoal = (await fetchDecoratedGoals()).find((goal) => Number(goal.id) === Number((result as any).insertId));

    res.status(201).json(createdGoal);
  } catch (error) {
    console.error('Error creating goal:', error);
    res.status(500).json({ error: 'Failed to create goal' });
  }
});

// 调整目标顺序
router.put('/reorder', async (req: Request, res: Response) => {
  try {
    const result = await reorderGoals(req.body?.goal_ids);
    if ('error' in result) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result.goals);
  } catch (error) {
    console.error('Error reordering goals:', error);
    res.status(500).json({ error: 'Failed to reorder goals' });
  }
});

// 更新目标
router.put('/:id', validateId, validateGoal, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, icon, color, target_amount, deadline, sort_order } = req.body;
  try {
    const [existingRows] = await pool.execute('SELECT * FROM goals WHERE id = ?', [id]);
    const existing = (existingRows as any[])[0];

    if (!existing) {
      return res.status(404).json({ error: '目标不存在' });
    }

    const nextTargetAmount = target_amount !== undefined ? target_amount : existing.target_amount;
    const nextSortOrder = sort_order !== undefined ? sort_order : existing.sort_order;

    await pool.execute(
      'UPDATE goals SET name = ?, icon = ?, color = ?, target_amount = ?, current_amount = ?, deadline = ?, is_completed = ?, sort_order = ? WHERE id = ?',
      [
        name || existing.name,
        icon || existing.icon,
        color || existing.color,
        nextTargetAmount,
        existing.current_amount,
        deadline !== undefined ? deadline : existing.deadline,
        existing.is_completed,
        nextSortOrder,
        id,
      ]
    );

    const updatedGoal = (await fetchDecoratedGoals()).find((goal) => Number(goal.id) === Number(id));

    res.json(updatedGoal);
  } catch (error) {
    console.error('Error updating goal:', error);
    res.status(500).json({ error: 'Failed to update goal' });
  }
});

// 删除目标
router.delete('/:id', validateId, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await pool.execute('DELETE FROM goals WHERE id = ?', [id]);
    res.json({ message: 'Goal deleted' });
  } catch (error) {
    console.error('Error deleting goal:', error);
    res.status(500).json({ error: 'Failed to delete goal' });
  }
});

export default router;
