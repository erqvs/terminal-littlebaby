import { Router, Request, Response } from 'express';
import pool from '../config/database';

const router = Router();

// 获取所有课程
router.get('/', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM schedule_courses ORDER BY day_of_week, time_slot'
    );
    // 将 weeks 从 JSON 字符串解析为数组
    const courses = (rows as any[]).map(row => ({
      ...row,
      weeks: row.weeks ? JSON.parse(row.weeks) : [],
    }));
    res.json(courses);
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ error: '获取课程失败' });
  }
});

// 创建或更新课程（同一时间段只能有一门课）
router.post('/', async (req: Request, res: Response) => {
  const { name, teacher, location, color, day_of_week, time_slot, weeks } = req.body;

  if (!name || day_of_week === undefined || time_slot === undefined) {
    res.status(400).json({ error: '缺少必要参数' });
    return;
  }

  try {
    const weeksJson = JSON.stringify(weeks || []);

    // 使用 INSERT ... ON DUPLICATE KEY UPDATE 实现创建或更新
    const [result] = await pool.execute(
      `INSERT INTO schedule_courses (name, teacher, location, color, day_of_week, time_slot, weeks)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       teacher = VALUES(teacher),
       location = VALUES(location),
       color = VALUES(color),
       weeks = VALUES(weeks)`,
      [name, teacher || null, location || null, color || '#1890ff', day_of_week, time_slot, weeksJson]
    );

    res.status(200).json({
      id: (result as any).insertId || undefined,
      name,
      teacher,
      location,
      color,
      day_of_week,
      time_slot,
      weeks,
    });
  } catch (error) {
    console.error('Error saving course:', error);
    res.status(500).json({ error: '保存课程失败' });
  }
});

// 删除课程
router.delete('/:day/:slot', async (req: Request, res: Response) => {
  const { day, slot } = req.params;

  try {
    const dayValue = Array.isArray(day) ? day[0] : day;
    const slotValue = Array.isArray(slot) ? slot[0] : slot;
    await pool.execute(
      'DELETE FROM schedule_courses WHERE day_of_week = ? AND time_slot = ?',
      [parseInt(dayValue), parseInt(slotValue)]
    );
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('Error deleting course:', error);
    res.status(500).json({ error: '删除课程失败' });
  }
});

export default router;
