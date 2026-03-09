import { Router, Request, Response } from 'express';
import pool from '../config/database';
import { validateId, validateAccount } from '../middleware/validation';

const router = Router();

// 获取所有账户（支持按类型筛选）
router.get('/', async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    let sql = 'SELECT * FROM accounts';
    const params: string[] = [];

    if (type && (type === 'asset' || type === 'debt')) {
      sql += ' WHERE type = ?';
      params.push(type as string);
    }

    sql += ' ORDER BY sort_order, id';

    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// 获取单个账户
router.get('/:id', validateId, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.execute('SELECT * FROM accounts WHERE id = ?', [id]);
    const accounts = rows as any[];
    if (accounts.length === 0) {
      return res.status(404).json({ error: '账户不存在' });
    }
    res.json(accounts[0]);
  } catch (error) {
    console.error('Error fetching account:', error);
    res.status(500).json({ error: 'Failed to fetch account' });
  }
});

// 创建账户
router.post('/', validateAccount, async (req: Request, res: Response) => {
  const { name, type, icon, color, balance, limit_amount, repayment_day, sort_order } = req.body;

  // 验证账户类型
  if (type && !['asset', 'debt'].includes(type)) {
    return res.status(400).json({ error: '账户类型必须是 asset 或 debt' });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO accounts (name, type, icon, color, balance, limit_amount, repayment_day, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        type || 'asset',
        icon || (type === 'debt' ? 'credit' : 'wallet'),
        color || (type === 'debt' ? '#ff4d4f' : '#1890ff'),
        balance || 0,
        type === 'debt' ? (limit_amount || 0) : 0,
        type === 'debt' ? (repayment_day || 1) : null,
        sort_order || 0
      ]
    );
    res.status(201).json({
      id: (result as any).insertId,
      name,
      type: type || 'asset',
      icon: icon || (type === 'debt' ? 'credit' : 'wallet'),
      color: color || (type === 'debt' ? '#ff4d4f' : '#1890ff'),
      balance: balance || 0,
      limit_amount: type === 'debt' ? (limit_amount || 0) : 0,
      repayment_day: type === 'debt' ? (repayment_day || 1) : null,
      sort_order: sort_order || 0
    });
  } catch (error) {
    console.error('Error creating account:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// 更新账户
router.put('/:id', validateId, validateAccount, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, type, icon, color, balance, limit_amount, repayment_day, sort_order } = req.body;

  try {
    // 先获取现有账户信息
    const [existingRows] = await pool.execute('SELECT * FROM accounts WHERE id = ?', [id]);
    const existing = (existingRows as any[])[0];

    if (!existing) {
      return res.status(404).json({ error: '账户不存在' });
    }

    const accountType = type || existing.type;

    await pool.execute(
      `UPDATE accounts SET name = ?, type = ?, icon = ?, color = ?, balance = ?, limit_amount = ?, repayment_day = ?, sort_order = ? WHERE id = ?`,
      [
        name || existing.name,
        accountType,
        icon || existing.icon,
        color || existing.color,
        balance !== undefined ? balance : existing.balance,
        accountType === 'debt' ? (limit_amount !== undefined ? limit_amount : existing.limit_amount) : 0,
        accountType === 'debt' ? (repayment_day !== undefined ? repayment_day : existing.repayment_day) : null,
        sort_order !== undefined ? sort_order : existing.sort_order,
        id
      ]
    );

    res.json({
      id: parseInt(Array.isArray(id) ? id[0] : id),
      name: name || existing.name,
      type: accountType,
      icon: icon || existing.icon,
      color: color || existing.color,
      balance: balance !== undefined ? balance : existing.balance,
      limit_amount: accountType === 'debt' ? (limit_amount !== undefined ? limit_amount : existing.limit_amount) : 0,
      repayment_day: accountType === 'debt' ? (repayment_day !== undefined ? repayment_day : existing.repayment_day) : null,
      sort_order: sort_order !== undefined ? sort_order : existing.sort_order
    });
  } catch (error) {
    console.error('Error updating account:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// 删除账户
router.delete('/:id', validateId, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    // 检查是否有关联的交易记录
    const [transactions] = await pool.execute('SELECT COUNT(*) as count FROM transactions WHERE account_id = ?', [id]);
    if ((transactions as any[])[0].count > 0) {
      return res.status(400).json({ error: '该账户有关联的交易记录，无法删除' });
    }

    await pool.execute('DELETE FROM accounts WHERE id = ?', [id]);
    res.json({ message: 'Account deleted' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// 更新账户余额（内部使用，记账时调用）
export async function updateAccountBalance(accountId: number, amount: number, categoryType: 'income' | 'expense'): Promise<void> {
  // 获取账户信息
  const [rows] = await pool.execute('SELECT * FROM accounts WHERE id = ?', [accountId]);
  const account = (rows as any[])[0];

  if (!account) {
    throw new Error('账户不存在');
  }

  let newBalance: number;

  if (account.type === 'asset') {
    // 资产账户：收入增加余额，支出减少余额
    newBalance = Number(account.balance) + (categoryType === 'income' ? amount : -amount);
  } else {
    // 负债账户：支出增加已用额度，收入减少已用额度（还款）
    newBalance = Number(account.balance) + (categoryType === 'expense' ? amount : -amount);
  }

  await pool.execute('UPDATE accounts SET balance = ? WHERE id = ?', [newBalance, accountId]);
}

export default router;
