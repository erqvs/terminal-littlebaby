import { Router, Request, Response } from 'express';
import pool from '../config/database';
import dayjs from 'dayjs';

const router = Router();

// AI API Key 认证中间件
function aiAuthMiddleware(req: Request, res: Response, next: Function): void {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;

  // 从环境变量获取 AI API Key，默认值用于开发
  const validApiKey = process.env.AI_API_KEY || 'REDACTED_API_KEY';

  if (apiKey !== validApiKey) {
    res.status(401).json({ error: '无效的 API Key' });
    return;
  }

  next();
}

// 获取所有分类和账户（供 AI 参考）
router.get('/context', aiAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const [categories] = await pool.execute('SELECT id, name, type FROM categories ORDER BY type, name');
    const [accounts] = await pool.execute('SELECT id, name, type, balance FROM accounts ORDER BY type, name');

    res.json({
      categories,
      accounts,
      today: dayjs().format('YYYY-MM-DD'),
    });
  } catch (error) {
    console.error('Error fetching AI context:', error);
    res.status(500).json({ error: '获取上下文失败' });
  }
});

// AI 记账接口
router.post('/transaction', aiAuthMiddleware, async (req: Request, res: Response) => {
  const connection = await pool.getConnection();

  try {
    const { amount, category_id, account_id, description, date, type } = req.body;

    // 验证必填字段
    if (!amount || !category_id || !account_id) {
      return res.status(400).json({
        error: '缺少必填字段',
        required: ['amount', 'category_id', 'account_id'],
        optional: ['description', 'date', 'type']
      });
    }

    // 获取分类信息
    const [categoryRows] = await connection.execute('SELECT * FROM categories WHERE id = ?', [category_id]);
    const category = (categoryRows as any[])[0];

    if (!category) {
      return res.status(400).json({ error: '分类不存在' });
    }

    // 获取账户信息
    const [accountRows] = await connection.execute('SELECT * FROM accounts WHERE id = ?', [account_id]);
    const account = (accountRows as any[])[0];

    if (!account) {
      return res.status(400).json({ error: '账户不存在' });
    }

    const transactionDate = date || dayjs().format('YYYY-MM-DD');
    const transactionType = type || category.type; // 默认使用分类的类型

    await connection.beginTransaction();

    // 插入交易记录
    const [result] = await connection.execute(
      'INSERT INTO transactions (amount, category_id, account_id, description, date) VALUES (?, ?, ?, ?, ?)',
      [amount, category_id, account_id, description || '', transactionDate]
    );

    // 更新账户余额
    let newBalance: number;
    if (account.type === 'asset') {
      // 资产账户：收入增加，支出减少
      newBalance = Number(account.balance) + (transactionType === 'income' ? amount : -amount);
    } else {
      // 负债账户：支出增加已用额度，收入减少
      newBalance = Number(account.balance) + (transactionType === 'expense' ? amount : -amount);
    }

    await connection.execute('UPDATE accounts SET balance = ? WHERE id = ?', [newBalance, account_id]);

    await connection.commit();

    res.status(201).json({
      success: true,
      transaction: {
        id: (result as any).insertId,
        amount,
        category_name: category.name,
        category_type: transactionType,
        account_name: account.name,
        account_type: account.type,
        description: description || '',
        date: transactionDate,
      },
      account_balance: newBalance,
      message: `记账成功：${transactionType === 'income' ? '收入' : '支出'} ¥${Number(amount).toFixed(2)}，${category.name}，${account.name}`
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error creating AI transaction:', error);
    res.status(500).json({ error: '记账失败' });
  } finally {
    connection.release();
  }
});

// AI 查询最近交易
router.get('/recent', aiAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const days = parseInt(req.query.days as string) || 7;

    const startDate = dayjs().subtract(days, 'day').format('YYYY-MM-DD');

    // 使用 query 而不是 execute，因为 LIMIT 不支持 prepared statement
    const [rows] = await pool.query(`
      SELECT t.*, c.name as category_name, c.type as category_type, a.name as account_name, a.type as account_type
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.date >= ?
      ORDER BY t.date DESC, t.id DESC
      LIMIT ${limit}
    `, [startDate]);

    res.json({
      transactions: rows,
      period: `最近 ${days} 天`,
    });
  } catch (error) {
    console.error('Error fetching recent transactions:', error);
    res.status(500).json({ error: '查询失败' });
  }
});

// AI 查询账户余额
router.get('/balance', aiAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const [accounts] = await pool.execute('SELECT id, name, type, balance, limit_amount FROM accounts ORDER BY type, name');

    const assetAccounts = (accounts as any[]).filter(a => a.type === 'asset');
    const debtAccounts = (accounts as any[]).filter(a => a.type === 'debt');

    const totalAssets = assetAccounts.reduce((sum, a) => sum + Number(a.balance), 0);
    const totalDebts = debtAccounts.reduce((sum, d) => sum + Number(d.balance), 0);

    res.json({
      accounts,
      summary: {
        total_assets: totalAssets,
        total_debts: totalDebts,
        net_worth: totalAssets - totalDebts,
      },
      message: `总资产 ¥${totalAssets.toFixed(2)}，总负债 ¥${totalDebts.toFixed(2)}，净资产 ¥${(totalAssets - totalDebts).toFixed(2)}`
    });
  } catch (error) {
    console.error('Error fetching balance:', error);
    res.status(500).json({ error: '查询失败' });
  }
});

// AI 同步账户余额（直接设置余额，不产生交易记录）
router.post('/sync-balance', aiAuthMiddleware, async (req: Request, res: Response) => {
  const connection = await pool.getConnection();

  try {
    const { accounts } = req.body;

    if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
      return res.status(400).json({
        error: '缺少账户数据',
        required: { accounts: [{ id: 'number', balance: 'number', limit_amount: 'number (可选)' }] }
      });
    }

    await connection.beginTransaction();

    const results = [];
    for (const account of accounts) {
      const { id, balance, limit_amount } = account;

      if (id === undefined || balance === undefined) {
        continue;
      }

      // 获取账户信息
      const [rows] = await connection.execute('SELECT * FROM accounts WHERE id = ?', [id]);
      const existing = (rows as any[])[0];

      if (!existing) {
        results.push({ id, success: false, error: '账户不存在' });
        continue;
      }

      // 更新余额
      if (limit_amount !== undefined && existing.type === 'debt') {
        await connection.execute(
          'UPDATE accounts SET balance = ?, limit_amount = ? WHERE id = ?',
          [balance, limit_amount, id]
        );
      } else {
        await connection.execute(
          'UPDATE accounts SET balance = ? WHERE id = ?',
          [balance, id]
        );
      }

      results.push({
        id,
        name: existing.name,
        type: existing.type,
        old_balance: Number(existing.balance),
        new_balance: balance,
        success: true
      });
    }

    await connection.commit();

    res.json({
      success: true,
      message: `已同步 ${results.filter(r => r.success).length} 个账户的余额`,
      results
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error syncing balance:', error);
    res.status(500).json({ error: '同步余额失败' });
  } finally {
    connection.release();
  }
});

// AI 更新单个账户（包括余额、额度等）
router.put('/account/:id', aiAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, balance, limit_amount, type, icon, color } = req.body;

    // 获取现有账户
    const [existingRows] = await pool.execute('SELECT * FROM accounts WHERE id = ?', [id]);
    const existing = (existingRows as any[])[0];

    if (!existing) {
      return res.status(404).json({ error: '账户不存在' });
    }

    const accountType = type || existing.type;

    await pool.execute(
      `UPDATE accounts SET name = ?, type = ?, icon = ?, color = ?, balance = ?, limit_amount = ? WHERE id = ?`,
      [
        name || existing.name,
        accountType,
        icon || existing.icon,
        color || existing.color,
        balance !== undefined ? balance : existing.balance,
        limit_amount !== undefined ? limit_amount : existing.limit_amount,
        id
      ]
    );

    res.json({
      success: true,
      account: {
        id: parseInt(String(id)),
        name: name || existing.name,
        type: accountType,
        balance: balance !== undefined ? balance : existing.balance,
        limit_amount: limit_amount !== undefined ? limit_amount : existing.limit_amount
      }
    });

  } catch (error) {
    console.error('Error updating account:', error);
    res.status(500).json({ error: '更新账户失败' });
  }
});

// AI 创建新账户
router.post('/account', aiAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, type, balance, limit_amount, icon, color } = req.body;

    if (!name) {
      return res.status(400).json({ error: '账户名称不能为空' });
    }

    const accountType = type || 'asset';

    const [result] = await pool.execute(
      `INSERT INTO accounts (name, type, icon, color, balance, limit_amount) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name,
        accountType,
        icon || (accountType === 'debt' ? 'credit' : 'wallet'),
        color || (accountType === 'debt' ? '#ff4d4f' : '#1890ff'),
        balance || 0,
        accountType === 'debt' ? (limit_amount || 0) : 0
      ]
    );

    res.status(201).json({
      success: true,
      account: {
        id: (result as any).insertId,
        name,
        type: accountType,
        balance: balance || 0,
        limit_amount: accountType === 'debt' ? (limit_amount || 0) : 0
      }
    });

  } catch (error) {
    console.error('Error creating account:', error);
    res.status(500).json({ error: '创建账户失败' });
  }
});

// AI 删除账户
router.delete('/account/:id', aiAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // 检查是否有关联的交易记录
    const [transactions] = await pool.execute('SELECT COUNT(*) as count FROM transactions WHERE account_id = ?', [id]);
    if ((transactions as any[])[0].count > 0) {
      return res.status(400).json({ error: '该账户有关联的交易记录，无法删除' });
    }

    await pool.execute('DELETE FROM accounts WHERE id = ?', [id]);

    res.json({ success: true, message: '账户已删除' });

  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: '删除账户失败' });
  }
});

// ==================== 交易管理 ====================

// AI 查询交易（支持多条件筛选）
router.get('/transactions', aiAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { start_date, end_date, category_id, account_id, type, limit, offset } = req.query;

    let sql = `
      SELECT t.*, c.name as category_name, c.type as category_type, a.name as account_name, a.type as account_type
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (start_date) {
      sql += ' AND t.date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      sql += ' AND t.date <= ?';
      params.push(end_date);
    }
    if (category_id) {
      sql += ' AND t.category_id = ?';
      params.push(category_id);
    }
    if (account_id) {
      sql += ' AND t.account_id = ?';
      params.push(account_id);
    }
    if (type) {
      sql += ' AND c.type = ?';
      params.push(type);
    }

    sql += ' ORDER BY t.date DESC, t.id DESC';

    // 使用 query 而不是 execute，因为 LIMIT/OFFSET 不支持 prepared statement
    const limitNum = limit ? Math.min(parseInt(limit as string), 1000) : 100;
    const offsetNum = offset ? parseInt(offset as string) : 0;
    sql += ` LIMIT ${limitNum} OFFSET ${offsetNum}`;

    const [rows] = await pool.query(sql, params);

    // 统计汇总
    const summary = {
      total_count: (rows as any[]).length,
      total_income: 0,
      total_expense: 0,
    };

    (rows as any[]).forEach((t: any) => {
      if (t.category_type === 'income') {
        summary.total_income += Number(t.amount);
      } else {
        summary.total_expense += Number(t.amount);
      }
    });

    res.json({
      transactions: rows,
      summary,
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: '查询交易失败' });
  }
});

// AI 更新交易
router.put('/transaction/:id', aiAuthMiddleware, async (req: Request, res: Response) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;
    const { amount, category_id, account_id, description, date } = req.body;

    // 获取原交易记录
    const [oldRows] = await connection.execute(`
      SELECT t.*, c.type as category_type
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.id = ?
    `, [id]);
    const oldTransaction = (oldRows as any[])[0];

    if (!oldTransaction) {
      return res.status(404).json({ error: '交易记录不存在' });
    }

    await connection.beginTransaction();

    // 如果账户或金额或分类有变化，需要调整账户余额
    const newCategoryId = category_id || oldTransaction.category_id;
    const newAccountId = account_id || oldTransaction.account_id;
    const newAmount = amount !== undefined ? amount : oldTransaction.amount;

    // 获取新分类类型
    const [categoryRows] = await connection.execute('SELECT type FROM categories WHERE id = ?', [newCategoryId]);
    const newCategory = (categoryRows as any[])[0];
    if (!newCategory) {
      await connection.rollback();
      return res.status(400).json({ error: '分类不存在' });
    }

    // 获取账户信息
    const [accountRows] = await connection.execute('SELECT * FROM accounts WHERE id = ?', [newAccountId]);
    const account = (accountRows as any[])[0];
    if (!account) {
      await connection.rollback();
      return res.status(400).json({ error: '账户不存在' });
    }

    // 如果账户变了，需要：1. 恢复原账户余额 2. 更新新账户余额
    if (oldTransaction.account_id !== newAccountId) {
      // 恢复原账户
      const [oldAccountRows] = await connection.execute('SELECT * FROM accounts WHERE id = ?', [oldTransaction.account_id]);
      const oldAccount = (oldAccountRows as any[])[0];
      if (oldAccount) {
        const reverseType = oldTransaction.category_type === 'income' ? 'expense' : 'income';
        let oldAccountNewBalance: number;
        if (oldAccount.type === 'asset') {
          oldAccountNewBalance = Number(oldAccount.balance) + (reverseType === 'income' ? oldTransaction.amount : -oldTransaction.amount);
        } else {
          oldAccountNewBalance = Number(oldAccount.balance) + (reverseType === 'expense' ? oldTransaction.amount : -oldTransaction.amount);
        }
        await connection.execute('UPDATE accounts SET balance = ? WHERE id = ?', [oldAccountNewBalance, oldTransaction.account_id]);
      }

      // 更新新账户
      let newAccountNewBalance: number;
      if (account.type === 'asset') {
        newAccountNewBalance = Number(account.balance) + (newCategory.type === 'income' ? newAmount : -newAmount);
      } else {
        newAccountNewBalance = Number(account.balance) + (newCategory.type === 'expense' ? newAmount : -newAmount);
      }
      await connection.execute('UPDATE accounts SET balance = ? WHERE id = ?', [newAccountNewBalance, newAccountId]);
    } else {
      // 同一账户，计算差额
      const oldEffect = oldTransaction.category_type === 'income' ? Number(oldTransaction.amount) : -Number(oldTransaction.amount);
      const newEffect = newCategory.type === 'income' ? Number(newAmount) : -Number(newAmount);
      const diff = newEffect - oldEffect;

      // 根据账户类型调整影响
      let balanceDiff: number;
      if (account.type === 'asset') {
        balanceDiff = diff;
      } else {
        // 负债账户逻辑相反
        balanceDiff = -diff;
      }

      const newBalance = Number(account.balance) + balanceDiff;
      await connection.execute('UPDATE accounts SET balance = ? WHERE id = ?', [newBalance, newAccountId]);
    }

    // 更新交易记录
    await connection.execute(
      'UPDATE transactions SET amount = ?, category_id = ?, account_id = ?, description = ?, date = ? WHERE id = ?',
      [newAmount, newCategoryId, newAccountId, description !== undefined ? description : oldTransaction.description, date || oldTransaction.date, id]
    );

    await connection.commit();

    // 获取更新后的完整记录
    const [newRows] = await pool.execute(`
      SELECT t.*, c.name as category_name, c.type as category_type, a.name as account_name, a.type as account_type
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.id = ?
    `, [id]);

    res.json({
      success: true,
      transaction: (newRows as any[])[0],
      message: '交易记录已更新',
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error updating transaction:', error);
    res.status(500).json({ error: '更新交易失败' });
  } finally {
    connection.release();
  }
});

// AI 删除交易
router.delete('/transaction/:id', aiAuthMiddleware, async (req: Request, res: Response) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;

    // 获取要删除的交易记录
    const [transRows] = await connection.execute(`
      SELECT t.*, c.type as category_type
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.id = ?
    `, [id]);

    const transaction = (transRows as any[])[0];

    if (!transaction) {
      return res.status(404).json({ error: '交易记录不存在' });
    }

    await connection.beginTransaction();

    // 反向更新账户余额
    if (transaction.account_id) {
      const [accountRows] = await connection.execute('SELECT * FROM accounts WHERE id = ?', [transaction.account_id]);
      const account = (accountRows as any[])[0];

      if (account) {
        const reverseType = transaction.category_type === 'income' ? 'expense' : 'income';
        let newBalance: number;
        if (account.type === 'asset') {
          newBalance = Number(account.balance) + (reverseType === 'income' ? transaction.amount : -transaction.amount);
        } else {
          newBalance = Number(account.balance) + (reverseType === 'expense' ? transaction.amount : -transaction.amount);
        }
        await connection.execute('UPDATE accounts SET balance = ? WHERE id = ?', [newBalance, transaction.account_id]);
      }
    }

    // 删除交易记录
    await connection.execute('DELETE FROM transactions WHERE id = ?', [id]);

    await connection.commit();

    res.json({
      success: true,
      message: '交易记录已删除',
      deleted_transaction: {
        id: transaction.id,
        amount: transaction.amount,
        category_type: transaction.category_type,
      },
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error deleting transaction:', error);
    res.status(500).json({ error: '删除交易失败' });
  } finally {
    connection.release();
  }
});

// ==================== 分类管理 ====================

// AI 获取所有分类
router.get('/categories', aiAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { type } = req.query;

    let sql = 'SELECT * FROM categories';
    const params: any[] = [];

    if (type && (type === 'income' || type === 'expense')) {
      sql += ' WHERE type = ?';
      params.push(type);
    }

    sql += ' ORDER BY type, name';

    const [rows] = await pool.execute(sql, params);

    res.json({
      success: true,
      categories: rows,
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: '获取分类失败' });
  }
});

// AI 创建分类
router.post('/category', aiAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, type, icon } = req.body;

    if (!name) {
      return res.status(400).json({ error: '分类名称不能为空' });
    }

    if (!type || !['income', 'expense'].includes(type)) {
      return res.status(400).json({ error: '分类类型必须是 income 或 expense' });
    }

    const [result] = await pool.execute(
      'INSERT INTO categories (name, type, icon) VALUES (?, ?, ?)',
      [name, type, icon || null]
    );

    res.status(201).json({
      success: true,
      category: {
        id: (result as any).insertId,
        name,
        type,
        icon: icon || null,
      },
      message: `分类「${name}」创建成功`,
    });
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: '创建分类失败' });
  }
});

// AI 更新分类
router.put('/category/:id', aiAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, type, icon } = req.body;

    // 获取现有分类
    const [existingRows] = await pool.execute('SELECT * FROM categories WHERE id = ?', [id]);
    const existing = (existingRows as any[])[0];

    if (!existing) {
      return res.status(404).json({ error: '分类不存在' });
    }

    const newType = type || existing.type;

    if (newType && !['income', 'expense'].includes(newType)) {
      return res.status(400).json({ error: '分类类型必须是 income 或 expense' });
    }

    await pool.execute(
      'UPDATE categories SET name = ?, type = ?, icon = ? WHERE id = ?',
      [name || existing.name, newType, icon !== undefined ? icon : existing.icon, id]
    );

    res.json({
      success: true,
      category: {
        id: parseInt(String(id)),
        name: name || existing.name,
        type: newType,
        icon: icon !== undefined ? icon : existing.icon,
      },
      message: '分类已更新',
    });
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: '更新分类失败' });
  }
});

// AI 删除分类
router.delete('/category/:id', aiAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // 检查是否有关联的交易记录
    const [transactions] = await pool.execute('SELECT COUNT(*) as count FROM transactions WHERE category_id = ?', [id]);
    if ((transactions as any[])[0].count > 0) {
      return res.status(400).json({
        error: '该分类有关联的交易记录，无法删除',
        related_count: (transactions as any[])[0].count,
      });
    }

    // 获取分类信息用于返回
    const [categoryRows] = await pool.execute('SELECT * FROM categories WHERE id = ?', [id]);
    const category = (categoryRows as any[])[0];

    if (!category) {
      return res.status(404).json({ error: '分类不存在' });
    }

    await pool.execute('DELETE FROM categories WHERE id = ?', [id]);

    res.json({
      success: true,
      message: `分类「${category.name}」已删除`,
    });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: '删除分类失败' });
  }
});

// ==================== 目标管理 ====================

// AI 获取所有目标
router.get('/goals', aiAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM goals ORDER BY is_completed, sort_order, id');

    const goals = (rows as any[]).map(g => ({
      ...g,
      progress: g.target_amount > 0 ? Math.min(100, (Number(g.current_amount) / Number(g.target_amount)) * 100) : 0,
    }));

    res.json({
      success: true,
      goals,
    });
  } catch (error) {
    console.error('Error fetching goals:', error);
    res.status(500).json({ error: '获取目标失败' });
  }
});

// AI 创建目标
router.post('/goal', aiAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, icon, color, target_amount, current_amount, deadline, sort_order } = req.body;

    if (!name) {
      return res.status(400).json({ error: '目标名称不能为空' });
    }

    if (!target_amount || target_amount <= 0) {
      return res.status(400).json({ error: '目标金额必须大于 0' });
    }

    const [result] = await pool.execute(
      'INSERT INTO goals (name, icon, color, target_amount, current_amount, deadline, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, icon || 'target', color || '#52c41a', target_amount, current_amount || 0, deadline || null, sort_order || 0]
    );

    res.status(201).json({
      success: true,
      goal: {
        id: (result as any).insertId,
        name,
        icon: icon || 'target',
        color: color || '#52c41a',
        target_amount,
        current_amount: current_amount || 0,
        deadline: deadline || null,
        sort_order: sort_order || 0,
        is_completed: false,
      },
      message: `目标「${name}」创建成功`,
    });
  } catch (error) {
    console.error('Error creating goal:', error);
    res.status(500).json({ error: '创建目标失败' });
  }
});

// AI 更新目标
router.put('/goal/:id', aiAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, icon, color, target_amount, current_amount, deadline, is_completed, sort_order } = req.body;

    // 获取现有目标
    const [existingRows] = await pool.execute('SELECT * FROM goals WHERE id = ?', [id]);
    const existing = (existingRows as any[])[0];

    if (!existing) {
      return res.status(404).json({ error: '目标不存在' });
    }

    await pool.execute(
      'UPDATE goals SET name = ?, icon = ?, color = ?, target_amount = ?, current_amount = ?, deadline = ?, is_completed = ?, sort_order = ? WHERE id = ?',
      [
        name || existing.name,
        icon || existing.icon,
        color || existing.color,
        target_amount !== undefined ? target_amount : existing.target_amount,
        current_amount !== undefined ? current_amount : existing.current_amount,
        deadline !== undefined ? deadline : existing.deadline,
        is_completed !== undefined ? is_completed : existing.is_completed,
        sort_order !== undefined ? sort_order : existing.sort_order,
        id,
      ]
    );

    const newCurrentAmount = current_amount !== undefined ? current_amount : existing.current_amount;
    const newTargetAmount = target_amount !== undefined ? target_amount : existing.target_amount;

    res.json({
      success: true,
      goal: {
        id: parseInt(String(id)),
        name: name || existing.name,
        icon: icon || existing.icon,
        color: color || existing.color,
        target_amount: newTargetAmount,
        current_amount: newCurrentAmount,
        deadline: deadline !== undefined ? deadline : existing.deadline,
        is_completed: is_completed !== undefined ? is_completed : existing.is_completed,
        sort_order: sort_order !== undefined ? sort_order : existing.sort_order,
        progress: newTargetAmount > 0 ? Math.min(100, (Number(newCurrentAmount) / Number(newTargetAmount)) * 100) : 0,
      },
      message: '目标已更新',
    });
  } catch (error) {
    console.error('Error updating goal:', error);
    res.status(500).json({ error: '更新目标失败' });
  }
});

// AI 删除目标
router.delete('/goal/:id', aiAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // 获取目标信息用于返回
    const [goalRows] = await pool.execute('SELECT * FROM goals WHERE id = ?', [id]);
    const goal = (goalRows as any[])[0];

    if (!goal) {
      return res.status(404).json({ error: '目标不存在' });
    }

    await pool.execute('DELETE FROM goals WHERE id = ?', [id]);

    res.json({
      success: true,
      message: `目标「${goal.name}」已删除`,
    });
  } catch (error) {
    console.error('Error deleting goal:', error);
    res.status(500).json({ error: '删除目标失败' });
  }
});

export default router;
