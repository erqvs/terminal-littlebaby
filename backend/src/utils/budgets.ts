import dayjs from 'dayjs';
import pool from '../config/database';

export function parseBudgetYearMonth(yearInput?: unknown, monthInput?: unknown) {
  const now = dayjs();
  const year = yearInput !== undefined ? Number(yearInput) : now.year();
  const month = monthInput !== undefined ? Number(monthInput) : now.month() + 1;

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { error: '年份必须在 2000-2100 之间' };
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { error: '月份必须在 1-12 之间' };
  }

  return { year, month };
}

function getPreviousBudgetYearMonth(year: number, month: number) {
  const currentMonth = dayjs(`${year}-${String(month).padStart(2, '0')}-01`);
  const previousMonth = currentMonth.subtract(1, 'month');

  return {
    year: previousMonth.year(),
    month: previousMonth.month() + 1,
  };
}

function getBudgetMonthRange(year: number, month: number) {
  const start = dayjs(`${year}-${String(month).padStart(2, '0')}-01`);
  return {
    startDate: start.format('YYYY-MM-DD'),
    endDate: start.add(1, 'month').format('YYYY-MM-DD'),
  };
}

function parseMemberNames(value: unknown): string[] {
  if (typeof value !== 'string' || !value) {
    return [];
  }

  return value.split('、').filter(Boolean);
}

export function decorateBudget(budget: any) {
  const budgetAmount = Number(budget.budget_amount) || 0;
  const actualSpent = Number(budget.actual_spent) || 0;
  const alertThreshold = Number(budget.alert_threshold) || 80;
  const progress = budgetAmount > 0 ? Math.min((actualSpent / budgetAmount) * 100, 999) : 0;
  const remainingAmount = budgetAmount - actualSpent;

  return {
    ...budget,
    budget_amount: budgetAmount,
    actual_spent: actualSpent,
    alert_threshold: alertThreshold,
    remaining_amount: remainingAmount,
    category_kind: budget.category_kind || 'leaf',
    member_count: Number(budget.member_count) || 0,
    member_names: parseMemberNames(budget.member_names),
    progress,
    is_over_budget: remainingAmount < 0,
    is_near_limit: progress >= alertThreshold && remainingAmount >= 0,
  };
}

function buildBudgetQuery(whereClause: string) {
  return `SELECT
            b.*,
            c.name AS category_name,
            c.type AS category_type,
            c.icon AS category_icon,
            c.kind AS category_kind,
            COALESCE(group_meta.member_names, '') AS member_names,
            COALESCE(group_meta.member_count, 0) AS member_count,
            COALESCE(
              CASE
                WHEN c.kind = 'group' THEN group_spent.actual_spent
                ELSE leaf_spent.actual_spent
              END,
              0
            ) AS actual_spent
          FROM budgets b
          INNER JOIN categories c ON c.id = b.category_id
          LEFT JOIN (
            SELECT
              t.category_id,
              SUM(t.amount) AS actual_spent
            FROM transactions t
            INNER JOIN categories tc ON tc.id = t.category_id
            WHERE tc.type = 'expense'
              AND tc.kind = 'leaf'
              AND t.date >= ?
              AND t.date < ?
            GROUP BY t.category_id
          ) leaf_spent ON leaf_spent.category_id = b.category_id
          LEFT JOIN (
            SELECT
              gm.group_id,
              SUM(t.amount) AS actual_spent
            FROM category_group_members gm
            INNER JOIN transactions t ON t.category_id = gm.member_category_id
            INNER JOIN categories tc ON tc.id = t.category_id
            WHERE tc.type = 'expense'
              AND tc.kind = 'leaf'
              AND t.date >= ?
              AND t.date < ?
            GROUP BY gm.group_id
          ) group_spent ON group_spent.group_id = b.category_id
          LEFT JOIN (
            SELECT
              gm.group_id,
              GROUP_CONCAT(member.name ORDER BY member.name SEPARATOR '、') AS member_names,
              COUNT(*) AS member_count
            FROM category_group_members gm
            INNER JOIN categories member ON member.id = gm.member_category_id
            GROUP BY gm.group_id
          ) group_meta ON group_meta.group_id = b.category_id
          ${whereClause}
          ORDER BY b.sort_order, b.id`;
}

export async function fetchBudgetsByWhere(whereClause: string, params: Array<string | number>, year: number, month: number) {
  const { startDate, endDate } = getBudgetMonthRange(year, month);
  const [rows] = await pool.execute(
    buildBudgetQuery(whereClause),
    [startDate, endDate, startDate, endDate, ...params],
  );
  return (rows as any[]).map(decorateBudget);
}

export async function ensureBudgetsCarriedForward(year: number, month: number) {
  const [existingRows] = await pool.execute(
    'SELECT COUNT(*) AS count FROM budgets WHERE year = ? AND month = ?',
    [year, month],
  );
  const existingCount = Number((existingRows as Array<{ count?: number }>)[0]?.count || 0);

  if (existingCount > 0) {
    return { copied: 0, skipped: true as const };
  }

  const previous = getPreviousBudgetYearMonth(year, month);
  const [result] = await pool.execute(
    `INSERT IGNORE INTO budgets (category_id, year, month, budget_amount, alert_threshold, note, sort_order)
     SELECT
       b.category_id,
       ?,
       ?,
       b.budget_amount,
       b.alert_threshold,
       b.note,
       b.sort_order
     FROM budgets b
     INNER JOIN categories c ON c.id = b.category_id
     WHERE b.year = ?
       AND b.month = ?
       AND c.type = 'expense'`,
    [year, month, previous.year, previous.month],
  );

  return {
    copied: Number((result as { affectedRows?: number }).affectedRows || 0),
    skipped: false as const,
    source: previous,
  };
}

export async function ensureExpenseBudgetCategory(categoryId: number) {
  const [rows] = await pool.execute('SELECT id, name, type, kind FROM categories WHERE id = ?', [categoryId]);
  const category = (rows as any[])[0];

  if (!category) {
    return { error: '分类不存在' };
  }

  if (category.type !== 'expense') {
    return { error: '预算只支持支出分类' };
  }

  return { category };
}
