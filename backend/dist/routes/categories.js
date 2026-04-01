"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../config/database"));
const validation_1 = require("../middleware/validation");
const categories_1 = require("../utils/categories");
const router = (0, express_1.Router)();
router.get('/', async (req, res) => {
    try {
        const kindInput = typeof req.query.kind === 'string' ? req.query.kind : undefined;
        const typeInput = typeof req.query.type === 'string' ? req.query.type : undefined;
        const includeMembers = req.query.include_members === 'true' || req.query.includeMembers === 'true';
        const kind = kindInput && kindInput !== 'all'
            ? ((0, categories_1.isCategoryKind)(kindInput) ? kindInput : null)
            : kindInput === 'all'
                ? 'all'
                : undefined;
        if (kind === null) {
            return res.status(400).json({ error: '分类 kind 参数无效' });
        }
        const type = typeInput ? ((0, categories_1.isCategoryType)(typeInput) ? typeInput : null) : undefined;
        if (type === null) {
            return res.status(400).json({ error: '分类 type 参数无效' });
        }
        res.json(await (0, categories_1.loadCategories)({ kind, type, includeMembers }));
    }
    catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});
router.post('/', async (req, res) => {
    const { name, type, icon, kind = 'leaf', member_ids } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
        return res.status(400).json({ error: '分类名称不能为空且不能超过 100 个字符' });
    }
    if (!(0, categories_1.isCategoryType)(type)) {
        return res.status(400).json({ error: '分类类型必须是 income 或 expense' });
    }
    if (!(0, categories_1.isCategoryKind)(kind)) {
        return res.status(400).json({ error: '分类 kind 参数无效' });
    }
    if (icon !== undefined && icon !== null && (typeof icon !== 'string' || icon.length > 50)) {
        return res.status(400).json({ error: '图标标识不能超过 50 个字符' });
    }
    const normalizedName = name.trim();
    const normalizedIcon = typeof icon === 'string' && icon.trim() ? icon.trim() : null;
    try {
        let memberIds = [];
        if (kind === 'group') {
            const validation = await (0, categories_1.validateGroupMembers)(type, member_ids);
            if ('error' in validation) {
                return res.status(400).json({ error: validation.error });
            }
            memberIds = validation.memberIds;
        }
        const sortOrder = await (0, categories_1.resolveNextCategorySortOrder)(type, kind);
        const connection = await database_1.default.getConnection();
        try {
            await connection.beginTransaction();
            const [result] = await connection.execute('INSERT INTO categories (name, type, icon, kind, sort_order) VALUES (?, ?, ?, ?, ?)', [normalizedName, type, normalizedIcon, kind, sortOrder]);
            const categoryId = Number(result.insertId);
            if (kind === 'group' && memberIds.length > 0) {
                for (const memberId of memberIds) {
                    await connection.execute('INSERT INTO category_group_members (group_id, member_category_id) VALUES (?, ?)', [categoryId, memberId]);
                }
            }
            await connection.commit();
            res.status(201).json(await (0, categories_1.loadCategoryById)(categoryId));
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    catch (error) {
        console.error('Error creating category:', error);
        res.status(500).json({ error: 'Failed to create category' });
    }
});
router.put('/:id', validation_1.validateId, async (req, res) => {
    const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const { name, type, icon, member_ids } = req.body ?? {};
    try {
        const existing = await (0, categories_1.loadCategoryById)(id);
        if (!existing) {
            return res.status(404).json({ error: '分类不存在' });
        }
        if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.trim().length > 100)) {
            return res.status(400).json({ error: '分类名称不能为空且不能超过 100 个字符' });
        }
        if (type !== undefined && !(0, categories_1.isCategoryType)(type)) {
            return res.status(400).json({ error: '分类类型必须是 income 或 expense' });
        }
        if (icon !== undefined && icon !== null && (typeof icon !== 'string' || icon.length > 50)) {
            return res.status(400).json({ error: '图标标识不能超过 50 个字符' });
        }
        if (existing.kind === 'leaf' && member_ids !== undefined) {
            return res.status(400).json({ error: '普通分类不能设置成员分类' });
        }
        const nextType = (type || existing.type);
        const nextName = typeof name === 'string' ? name.trim() : existing.name;
        const nextIcon = icon === undefined
            ? existing.icon
            : (typeof icon === 'string' && icon.trim() ? icon.trim() : null);
        let memberIds = existing.member_ids || [];
        if (existing.kind === 'group') {
            const validation = await (0, categories_1.validateGroupMembers)(nextType, member_ids !== undefined ? member_ids : memberIds, id);
            if ('error' in validation) {
                return res.status(400).json({ error: validation.error });
            }
            memberIds = validation.memberIds;
        }
        const connection = await database_1.default.getConnection();
        try {
            await connection.beginTransaction();
            await connection.execute('UPDATE categories SET name = ?, type = ?, icon = ? WHERE id = ?', [nextName, nextType, nextIcon, id]);
            if (existing.kind === 'group') {
                await connection.execute('DELETE FROM category_group_members WHERE group_id = ?', [id]);
                for (const memberId of memberIds) {
                    await connection.execute('INSERT INTO category_group_members (group_id, member_category_id) VALUES (?, ?)', [id, memberId]);
                }
            }
            await connection.commit();
            res.json(await (0, categories_1.loadCategoryById)(id));
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    catch (error) {
        console.error('Error updating category:', error);
        res.status(500).json({ error: 'Failed to update category' });
    }
});
router.delete('/:id', validation_1.validateId, async (req, res) => {
    const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    try {
        const category = await (0, categories_1.loadCategoryById)(id);
        if (!category) {
            return res.status(404).json({ error: '分类不存在' });
        }
        const [budgetRows] = await database_1.default.execute('SELECT COUNT(*) AS count FROM budgets WHERE category_id = ?', [id]);
        if (Number(budgetRows[0]?.count || 0) > 0) {
            return res.status(400).json({ error: '该分类已被预算使用，无法删除' });
        }
        if (category.kind === 'leaf') {
            const [transactionRows] = await database_1.default.execute('SELECT COUNT(*) AS count FROM transactions WHERE category_id = ?', [id]);
            if (Number(transactionRows[0]?.count || 0) > 0) {
                return res.status(400).json({ error: '该分类有关联的交易记录，无法删除' });
            }
            const [groupRows] = await database_1.default.execute('SELECT COUNT(*) AS count FROM category_group_members WHERE member_category_id = ?', [id]);
            if (Number(groupRows[0]?.count || 0) > 0) {
                return res.status(400).json({ error: '该分类已被组合分类使用，无法删除' });
            }
        }
        await database_1.default.execute('DELETE FROM categories WHERE id = ?', [id]);
        res.json({ message: 'Category deleted' });
    }
    catch (error) {
        console.error('Error deleting category:', error);
        res.status(500).json({ error: 'Failed to delete category' });
    }
});
exports.default = router;
