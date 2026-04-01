"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCategoryType = isCategoryType;
exports.isCategoryKind = isCategoryKind;
exports.resolveNextCategorySortOrder = resolveNextCategorySortOrder;
exports.loadCategories = loadCategories;
exports.loadCategoryById = loadCategoryById;
exports.validateGroupMembers = validateGroupMembers;
const database_1 = __importDefault(require("../config/database"));
function isCategoryType(value) {
    return value === 'income' || value === 'expense';
}
function isCategoryKind(value) {
    return value === 'leaf' || value === 'group';
}
function normalizeCategory(row, membersByGroup) {
    const members = membersByGroup.get(Number(row.id)) || [];
    return {
        id: Number(row.id),
        name: row.name,
        type: row.type,
        icon: row.icon || null,
        kind: row.kind || 'leaf',
        sort_order: Number(row.sort_order) || 0,
        member_ids: members.map((member) => Number(member.id)),
        member_names: members.map((member) => member.name),
        member_count: members.length,
        members,
    };
}
async function resolveNextCategorySortOrder(type, kind) {
    const [rows] = await database_1.default.execute('SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM categories WHERE type = ? AND kind = ?', [type, kind]);
    return Number(rows[0]?.max_sort_order || 0) + 1;
}
async function loadCategories(options) {
    const kind = options?.kind || 'leaf';
    const includeMembers = options?.includeMembers ?? false;
    const where = [];
    const params = [];
    if (kind !== 'all') {
        where.push('c.kind = ?');
        params.push(kind);
    }
    if (options?.type) {
        where.push('c.type = ?');
        params.push(options.type);
    }
    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await database_1.default.execute(`SELECT c.id, c.name, c.type, c.icon, c.kind, c.sort_order
     FROM categories c
     ${whereClause}
     ORDER BY c.type, c.kind, c.sort_order, c.name, c.id`, params);
    const categoryRows = rows;
    const groupIds = categoryRows.filter((category) => category.kind === 'group').map((category) => category.id);
    const membersByGroup = new Map();
    if (includeMembers && groupIds.length > 0) {
        const placeholders = groupIds.map(() => '?').join(', ');
        const [memberRows] = await database_1.default.execute(`SELECT
         gm.group_id,
         c.id,
         c.name,
         c.type,
         c.icon
       FROM category_group_members gm
       INNER JOIN categories c ON c.id = gm.member_category_id
       WHERE gm.group_id IN (${placeholders})
       ORDER BY c.type, c.sort_order, c.name, c.id`, groupIds);
        for (const member of memberRows) {
            const groupId = Number(member.group_id);
            const existing = membersByGroup.get(groupId) || [];
            existing.push({
                id: Number(member.id),
                name: member.name,
                type: member.type,
                icon: member.icon || null,
            });
            membersByGroup.set(groupId, existing);
        }
    }
    return categoryRows.map((row) => normalizeCategory(row, membersByGroup));
}
async function loadCategoryById(id, includeMembers = true) {
    const categories = await loadCategories({ kind: 'all', includeMembers });
    return categories.find((category) => category.id === id) || null;
}
async function validateGroupMembers(type, memberIdsInput, excludeGroupId) {
    if (!Array.isArray(memberIdsInput) || memberIdsInput.length === 0) {
        return { error: '组合分类至少要选择一个普通分类' };
    }
    const memberIds = [...new Set(memberIdsInput.map((value) => Number(value)))];
    if (memberIds.some((value) => !Number.isInteger(value) || value <= 0)) {
        return { error: '组合分类成员包含无效分类 ID' };
    }
    const placeholders = memberIds.map(() => '?').join(', ');
    const [rows] = await database_1.default.execute(`SELECT id, name, type, kind
     FROM categories
     WHERE id IN (${placeholders})`, memberIds);
    const categories = rows;
    if (categories.length !== memberIds.length) {
        return { error: '组合分类中有不存在的成员分类' };
    }
    if (categories.some((category) => category.kind !== 'leaf')) {
        return { error: '组合分类只能包含普通分类，不能再嵌套组合分类' };
    }
    if (categories.some((category) => category.type !== type)) {
        return { error: '组合分类中的成员类型必须保持一致' };
    }
    const membershipPlaceholders = memberIds.map(() => '?').join(', ');
    const params = [...memberIds];
    let duplicateMembershipSql = `
    SELECT
      gm.member_category_id,
      group_category.name AS group_name,
      member_category.name AS member_name
    FROM category_group_members gm
    INNER JOIN categories group_category ON group_category.id = gm.group_id
    INNER JOIN categories member_category ON member_category.id = gm.member_category_id
    WHERE gm.member_category_id IN (${membershipPlaceholders})
  `;
    if (excludeGroupId !== undefined) {
        duplicateMembershipSql += ' AND gm.group_id <> ?';
        params.push(excludeGroupId);
    }
    const [existingMembershipRows] = await database_1.default.execute(duplicateMembershipSql, params);
    const existingMembership = existingMembershipRows[0];
    if (existingMembership) {
        return {
            error: `普通分类「${existingMembership.member_name}」已经归属于组合分类「${existingMembership.group_name}」`,
        };
    }
    return { memberIds };
}
