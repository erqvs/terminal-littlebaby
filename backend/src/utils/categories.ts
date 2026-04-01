import pool from '../config/database';

export type CategoryType = 'income' | 'expense';
export type CategoryKind = 'leaf' | 'group';

type CategoryRow = {
  id: number;
  name: string;
  type: CategoryType;
  icon: string | null;
  kind: CategoryKind;
  sort_order: number;
};

export function isCategoryType(value: unknown): value is CategoryType {
  return value === 'income' || value === 'expense';
}

export function isCategoryKind(value: unknown): value is CategoryKind {
  return value === 'leaf' || value === 'group';
}

function normalizeCategory(row: any, membersByGroup: Map<number, any[]>) {
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

export async function resolveNextCategorySortOrder(type: CategoryType, kind: CategoryKind) {
  const [rows] = await pool.execute(
    'SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM categories WHERE type = ? AND kind = ?',
    [type, kind],
  );
  return Number((rows as any[])[0]?.max_sort_order || 0) + 1;
}

export async function loadCategories(options?: {
  kind?: CategoryKind | 'all';
  type?: CategoryType;
  includeMembers?: boolean;
}) {
  const kind = options?.kind || 'leaf';
  const includeMembers = options?.includeMembers ?? false;
  const where: string[] = [];
  const params: Array<string> = [];

  if (kind !== 'all') {
    where.push('c.kind = ?');
    params.push(kind);
  }

  if (options?.type) {
    where.push('c.type = ?');
    params.push(options.type);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.execute(
    `SELECT c.id, c.name, c.type, c.icon, c.kind, c.sort_order
     FROM categories c
     ${whereClause}
     ORDER BY c.type, c.kind, c.sort_order, c.name, c.id`,
    params,
  );

  const categoryRows = rows as CategoryRow[];
  const groupIds = categoryRows.filter((category) => category.kind === 'group').map((category) => category.id);
  const membersByGroup = new Map<number, any[]>();

  if (includeMembers && groupIds.length > 0) {
    const placeholders = groupIds.map(() => '?').join(', ');
    const [memberRows] = await pool.execute(
      `SELECT
         gm.group_id,
         c.id,
         c.name,
         c.type,
         c.icon
       FROM category_group_members gm
       INNER JOIN categories c ON c.id = gm.member_category_id
       WHERE gm.group_id IN (${placeholders})
       ORDER BY c.type, c.sort_order, c.name, c.id`,
      groupIds,
    );

    for (const member of memberRows as any[]) {
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

export async function loadCategoryById(id: number, includeMembers: boolean = true) {
  const categories = await loadCategories({ kind: 'all', includeMembers });
  return categories.find((category) => category.id === id) || null;
}

export async function validateGroupMembers(type: CategoryType, memberIdsInput: unknown, excludeGroupId?: number) {
  if (!Array.isArray(memberIdsInput) || memberIdsInput.length === 0) {
    return { error: '组合分类至少要选择一个普通分类' } as const;
  }

  const memberIds = [...new Set(memberIdsInput.map((value) => Number(value)))];

  if (memberIds.some((value) => !Number.isInteger(value) || value <= 0)) {
    return { error: '组合分类成员包含无效分类 ID' } as const;
  }

  const placeholders = memberIds.map(() => '?').join(', ');
  const [rows] = await pool.execute(
    `SELECT id, name, type, kind
     FROM categories
     WHERE id IN (${placeholders})`,
    memberIds,
  );

  const categories = rows as Array<{ id: number; name: string; type: CategoryType; kind: CategoryKind }>;

  if (categories.length !== memberIds.length) {
    return { error: '组合分类中有不存在的成员分类' } as const;
  }

  if (categories.some((category) => category.kind !== 'leaf')) {
    return { error: '组合分类只能包含普通分类，不能再嵌套组合分类' } as const;
  }

  if (categories.some((category) => category.type !== type)) {
    return { error: '组合分类中的成员类型必须保持一致' } as const;
  }

  const membershipPlaceholders = memberIds.map(() => '?').join(', ');
  const params: number[] = [...memberIds];
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

  const [existingMembershipRows] = await pool.execute(duplicateMembershipSql, params);
  const existingMembership = (existingMembershipRows as Array<{
    member_category_id: number;
    group_name: string;
    member_name: string;
  }>)[0];

  if (existingMembership) {
    return {
      error: `普通分类「${existingMembership.member_name}」已经归属于组合分类「${existingMembership.group_name}」`,
    } as const;
  }

  return { memberIds } as const;
}
