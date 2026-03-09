import { Router, Request, Response } from 'express';
import pool from '../config/database';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM categories ORDER BY type, name');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { name, type, icon } = req.body;
  try {
    const [result] = await pool.execute(
      'INSERT INTO categories (name, type, icon) VALUES (?, ?, ?)',
      [name, type, icon || null]
    );
    res.status(201).json({ id: (result as any).insertId, ...req.body });
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

export default router;
