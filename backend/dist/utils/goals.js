"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateNetWorth = calculateNetWorth;
exports.calculateGoalProgress = calculateGoalProgress;
exports.compareGoalOrder = compareGoalOrder;
exports.decorateGoalWithAllocatedAmount = decorateGoalWithAllocatedAmount;
exports.decorateGoalsWithNetWorth = decorateGoalsWithNetWorth;
exports.decorateGoalWithNetWorth = decorateGoalWithNetWorth;
exports.fetchDecoratedGoals = fetchDecoratedGoals;
exports.resolveNextGoalSortOrder = resolveNextGoalSortOrder;
exports.reorderGoals = reorderGoals;
const database_1 = __importDefault(require("../config/database"));
async function calculateNetWorth() {
    const [rows] = await database_1.default.execute('SELECT type, balance FROM accounts');
    return rows.reduce((sum, account) => {
        const balance = Number(account.balance) || 0;
        return account.type === 'debt' ? sum - balance : sum + balance;
    }, 0);
}
function calculateGoalProgress(currentAmount, targetAmount) {
    if (targetAmount <= 0) {
        return 0;
    }
    const percent = (currentAmount / targetAmount) * 100;
    return Math.min(Math.max(percent, 0), 100);
}
function compareGoalOrder(left, right) {
    return (Number(left.sort_order) || 0) - (Number(right.sort_order) || 0)
        || (Number(left.id) || 0) - (Number(right.id) || 0);
}
function decorateGoalWithAllocatedAmount(goal, allocatedAmount, netWorth) {
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
function decorateGoalsWithNetWorth(goals, netWorth) {
    const orderedGoals = [...goals].sort(compareGoalOrder);
    let remainingNetWorth = Math.max(netWorth, 0);
    return orderedGoals.map((goal) => {
        const targetAmount = Number(goal.target_amount) || 0;
        const allocatedAmount = Math.min(remainingNetWorth, targetAmount);
        remainingNetWorth = Math.max(remainingNetWorth - targetAmount, 0);
        return decorateGoalWithAllocatedAmount(goal, allocatedAmount, netWorth);
    });
}
function decorateGoalWithNetWorth(goal, netWorth) {
    return decorateGoalWithAllocatedAmount(goal, Math.max(netWorth, 0), netWorth);
}
async function fetchDecoratedGoals() {
    const [rows] = await database_1.default.execute('SELECT * FROM goals ORDER BY sort_order, id');
    const netWorth = await calculateNetWorth();
    return decorateGoalsWithNetWorth(rows, netWorth);
}
async function resolveNextGoalSortOrder(sortOrder) {
    if (sortOrder !== undefined) {
        return sortOrder;
    }
    const [rows] = await database_1.default.execute('SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM goals');
    return Number(rows[0]?.max_sort_order || 0) + 1;
}
async function reorderGoals(goalIdsInput) {
    if (!Array.isArray(goalIdsInput) || goalIdsInput.length === 0) {
        return { error: 'goal_ids 必须是非空数组' };
    }
    const goalIds = goalIdsInput.map((value) => Number(value));
    if (goalIds.some((value) => !Number.isInteger(value) || value <= 0)) {
        return { error: 'goal_ids 中包含无效 ID' };
    }
    if (new Set(goalIds).size !== goalIds.length) {
        return { error: 'goal_ids 中不能有重复项' };
    }
    const [rows] = await database_1.default.execute('SELECT id FROM goals');
    const existingIds = rows.map((row) => Number(row.id)).sort((left, right) => left - right);
    const requestedIds = [...goalIds].sort((left, right) => left - right);
    if (existingIds.length !== requestedIds.length || existingIds.some((id, index) => id !== requestedIds[index])) {
        return { error: 'goal_ids 必须包含所有目标且不能缺漏' };
    }
    const connection = await database_1.default.getConnection();
    try {
        await connection.beginTransaction();
        for (const [index, id] of goalIds.entries()) {
            await connection.execute('UPDATE goals SET sort_order = ? WHERE id = ?', [index + 1, id]);
        }
        await connection.commit();
    }
    catch (error) {
        await connection.rollback();
        throw error;
    }
    finally {
        connection.release();
    }
    return { goals: await fetchDecoratedGoals() };
}
