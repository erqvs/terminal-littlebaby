"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../config/database"));
const validation_1 = require("../middleware/validation");
const accounts_1 = require("./accounts");
const router = (0, express_1.Router)();
router.get('/', async (req, res) => {
    try {
        const [rows] = await database_1.default.execute(`
      SELECT t.*, c.name as category_name, c.type as category_type, a.name as account_name, a.type as account_type
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      ORDER BY t.date DESC, t.id DESC
    `);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});
router.post('/', validation_1.validateTransaction, async (req, res) => {
    const { amount, category_id, account_id, description, date } = req.body;
    const connection = await database_1.default.getConnection();
    try {
        await connection.beginTransaction();
        // 获取分类类型
        const [categoryRows] = await connection.execute('SELECT type FROM categories WHERE id = ?', [category_id]);
        const category = categoryRows[0];
        if (!category) {
            await connection.rollback();
            return res.status(400).json({ error: '分类不存在' });
        }
        // 插入交易记录
        const [result] = await connection.execute('INSERT INTO transactions (amount, category_id, account_id, description, date) VALUES (?, ?, ?, ?, ?)', [amount, category_id, account_id, description || '', date]);
        // 更新账户余额
        await (0, accounts_1.updateAccountBalance)(account_id, amount, category.type);
        await connection.commit();
        // 获取完整的新记录
        const [newRows] = await database_1.default.execute(`
      SELECT t.*, c.name as category_name, c.type as category_type, a.name as account_name, a.type as account_type
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.id = ?
    `, [result.insertId]);
        res.status(201).json(newRows[0]);
    }
    catch (error) {
        await connection.rollback();
        console.error('Error creating transaction:', error);
        res.status(500).json({ error: 'Failed to create transaction' });
    }
    finally {
        connection.release();
    }
});
router.delete('/:id', validation_1.validateId, async (req, res) => {
    const { id } = req.params;
    const connection = await database_1.default.getConnection();
    try {
        await connection.beginTransaction();
        // 获取要删除的交易记录信息
        const [transRows] = await connection.execute(`
      SELECT t.*, c.type as category_type
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.id = ?
    `, [id]);
        const transaction = transRows[0];
        if (!transaction) {
            await connection.rollback();
            return res.status(404).json({ error: '交易记录不存在' });
        }
        // 如果有关联账户，反向更新余额
        if (transaction.account_id) {
            const connection2 = await database_1.default.getConnection();
            try {
                // 反向操作：删除记录时，收入变成支出效果，支出变成收入效果
                const reverseType = transaction.category_type === 'income' ? 'expense' : 'income';
                await (0, accounts_1.updateAccountBalance)(transaction.account_id, transaction.amount, reverseType);
            }
            catch (err) {
                // 账户可能不存在，忽略错误
                console.warn('Failed to reverse account balance:', err);
            }
            connection2.release();
        }
        // 删除交易记录
        await connection.execute('DELETE FROM transactions WHERE id = ?', [id]);
        await connection.commit();
        res.json({ message: 'Transaction deleted' });
    }
    catch (error) {
        await connection.rollback();
        console.error('Error deleting transaction:', error);
        res.status(500).json({ error: 'Failed to delete transaction' });
    }
    finally {
        connection.release();
    }
});
exports.default = router;
