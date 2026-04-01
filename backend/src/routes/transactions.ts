import { Router, Request, Response } from 'express';
import pool from '../config/database';
import { validateId, validateTransaction } from '../middleware/validation';
import { updateAccountBalance } from './accounts';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute(`
      SELECT t.*, c.name as category_name, c.type as category_type, a.name as account_name, a.type as account_type
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      ORDER BY t.date DESC, t.id DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

router.post('/', validateTransaction, async (req: Request, res: Response) => {
  const { amount, category_id, account_id, description, date } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 获取分类类型
    const [categoryRows] = await connection.execute('SELECT type, kind FROM categories WHERE id = ?', [category_id]);
    const category = (categoryRows as any[])[0];

    if (!category) {
      await connection.rollback();
      return res.status(400).json({ error: '分类不存在' });
    }

    if (category.kind !== 'leaf') {
      await connection.rollback();
      return res.status(400).json({ error: '交易记录只能使用普通分类' });
    }

    // 插入交易记录
    const [result] = await connection.execute(
      'INSERT INTO transactions (amount, category_id, account_id, description, date) VALUES (?, ?, ?, ?, ?)',
      [amount, category_id, account_id, description || '', date]
    );

    // 更新账户余额
    await updateAccountBalance(account_id, amount, category.type);

    await connection.commit();

    // 获取完整的新记录
    const [newRows] = await pool.execute(`
      SELECT t.*, c.name as category_name, c.type as category_type, a.name as account_name, a.type as account_type
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.id = ?
    `, [(result as any).insertId]);

    res.status(201).json((newRows as any[])[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: 'Failed to create transaction' });
  } finally {
    connection.release();
  }
});

router.delete('/:id', validateId, async (req: Request, res: Response) => {
  const { id } = req.params;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 获取要删除的交易记录信息
    const [transRows] = await connection.execute(`
      SELECT t.*, c.type as category_type
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.id = ?
    `, [id]);

    const transaction = (transRows as any[])[0];

    if (!transaction) {
      await connection.rollback();
      return res.status(404).json({ error: '交易记录不存在' });
    }

    // 如果有关联账户，反向更新余额
    if (transaction.account_id) {
      const connection2 = await pool.getConnection();
      try {
        // 反向操作：删除记录时，收入变成支出效果，支出变成收入效果
        const reverseType = transaction.category_type === 'income' ? 'expense' : 'income';
        await updateAccountBalance(transaction.account_id, transaction.amount, reverseType);
      } catch (err) {
        // 账户可能不存在，忽略错误
        console.warn('Failed to reverse account balance:', err);
      }
      connection2.release();
    }

    // 删除交易记录
    await connection.execute('DELETE FROM transactions WHERE id = ?', [id]);

    await connection.commit();
    res.json({ message: 'Transaction deleted' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting transaction:', error);
    res.status(500).json({ error: 'Failed to delete transaction' });
  } finally {
    connection.release();
  }
});

export default router;
