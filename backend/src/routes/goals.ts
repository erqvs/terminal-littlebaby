import { Router, Request, Response } from 'express';
import pool from '../config/database';
import { validateId, validateGoal } from '../middleware/validation';

const router = Router();

// 获取所有目标
router.get('/', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM goals ORDER BY is_completed, sort_order, id');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching goals:', error);
    res.status(500).json({ error: 'Failed to fetch goals' });
  }
});

// 创建目标
router.post('/', validateGoal, async (req: Request, res: Response) => {
  const { name, icon, color, target_amount, current_amount, deadline, sort_order } = req.body;
  try {
    const [result] = await pool.execute(
      'INSERT INTO goals (name, icon, color, target_amount, current_amount, deadline, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, icon || 'target', color || '#52c41a', target_amount, current_amount || 0, deadline || null, sort_order || 0]
    );
    res.status(201).json({ id: (result as any).insertId, ...req.body });
  } catch (error) {
    console.error('Error creating goal:', error);
    res.status(500).json({ error: 'Failed to create goal' });
  }
});

// 更新目标
router.put('/:id', validateId, validateGoal, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, icon, color, target_amount, current_amount, deadline, is_completed, sort_order } = req.body;
  try {
    await pool.execute(
      'UPDATE goals SET name = ?, icon = ?, color = ?, target_amount = ?, current_amount = ?, deadline = ?, is_completed = ?, sort_order = ? WHERE id = ?',
      [name, icon, color, target_amount, current_amount, deadline, is_completed || false, sort_order, id]
    );
    res.json({ id, ...req.body });
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
