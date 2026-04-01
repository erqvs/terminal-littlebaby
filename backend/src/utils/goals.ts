import pool from '../config/database';

type GoalLike = {
  id?: number | string;
  target_amount: number | string;
  sort_order?: number | string;
  [key: string]: unknown;
};

export async function calculateNetWorth(): Promise<number> {
  const [rows] = await pool.execute('SELECT type, balance FROM accounts');

  return (rows as any[]).reduce((sum, account) => {
    const balance = Number(account.balance) || 0;
    return account.type === 'debt' ? sum - balance : sum + balance;
  }, 0);
}

export function calculateGoalProgress(currentAmount: number, targetAmount: number): number {
  if (targetAmount <= 0) {
    return 0;
  }

  const percent = (currentAmount / targetAmount) * 100;
  return Math.min(Math.max(percent, 0), 100);
}

export function compareGoalOrder<T extends GoalLike>(left: T, right: T): number {
  return (Number(left.sort_order) || 0) - (Number(right.sort_order) || 0)
    || (Number(left.id) || 0) - (Number(right.id) || 0);
}

export function decorateGoalWithAllocatedAmount<T extends GoalLike>(goal: T, allocatedAmount: number, netWorth: number) {
  const targetAmount = Number(goal.target_amount) || 0;
  const currentAmount = Math.min(Math.max(allocatedAmount, 0), targetAmount);

  return {
    ...goal,
    current_amount: currentAmount,
    is_completed: currentAmount >= targetAmount && targetAmount > 0,
    progress: calculateGoalProgress(currentAmount, targetAmount),
    remaining_amount: Math.max(targetAmount - currentAmount, 0),
    total_net_worth: netWorth,
  };
}

export function decorateGoalsWithNetWorth<T extends GoalLike>(goals: T[], netWorth: number) {
  const orderedGoals = [...goals].sort(compareGoalOrder);
  let remainingNetWorth = Math.max(netWorth, 0);

  return orderedGoals.map((goal) => {
    const targetAmount = Number(goal.target_amount) || 0;
    const allocatedAmount = Math.min(remainingNetWorth, targetAmount);
    remainingNetWorth = Math.max(remainingNetWorth - targetAmount, 0);
    return decorateGoalWithAllocatedAmount(goal, allocatedAmount, netWorth);
  });
}

export function decorateGoalWithNetWorth<T extends GoalLike>(goal: T, netWorth: number) {
  return decorateGoalWithAllocatedAmount(goal, Math.max(netWorth, 0), netWorth);
}

export async function fetchDecoratedGoals() {
  const [rows] = await pool.execute('SELECT * FROM goals ORDER BY sort_order, id');
  const netWorth = await calculateNetWorth();
  return decorateGoalsWithNetWorth(rows as any[], netWorth);
}

export async function resolveNextGoalSortOrder(sortOrder?: number) {
  if (sortOrder !== undefined) {
    return sortOrder;
  }

  const [rows] = await pool.execute('SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM goals');
  return Number((rows as any[])[0]?.max_sort_order || 0) + 1;
}

export async function reorderGoals(goalIdsInput: unknown) {
  if (!Array.isArray(goalIdsInput) || goalIdsInput.length === 0) {
    return { error: 'goal_ids 必须是非空数组' } as const;
  }

  const goalIds = goalIdsInput.map((value) => Number(value));

  if (goalIds.some((value) => !Number.isInteger(value) || value <= 0)) {
    return { error: 'goal_ids 中包含无效 ID' } as const;
  }

  if (new Set(goalIds).size !== goalIds.length) {
    return { error: 'goal_ids 中不能有重复项' } as const;
  }

  const [rows] = await pool.execute('SELECT id FROM goals');
  const existingIds = (rows as any[]).map((row) => Number(row.id)).sort((left, right) => left - right);
  const requestedIds = [...goalIds].sort((left, right) => left - right);

  if (existingIds.length !== requestedIds.length || existingIds.some((id, index) => id !== requestedIds[index])) {
    return { error: 'goal_ids 必须包含所有目标且不能缺漏' } as const;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const [index, id] of goalIds.entries()) {
      await connection.execute('UPDATE goals SET sort_order = ? WHERE id = ?', [index + 1, id]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return { goals: await fetchDecoratedGoals() } as const;
}
