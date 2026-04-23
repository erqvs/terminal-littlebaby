import type { Category, Transaction, Account, Goal, Budget, LittleBabyCronJob, LittleBabyCronRuns, LittleBabyCronStatus, DigestHistoryListResponse } from '../types';

const API_BASE = '/api';

function getAuthHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
  };
}

// 统一处理 401 响应
function handleUnauthorized(): void {
  // 只有不在登录页时才跳转
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

// 封装 fetch，自动处理 401
async function authFetch(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...options,
  });
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error('未授权，请重新登录');
  }
  return res;
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string' && data.error) {
      return data.error;
    }
    if (data && typeof data.message === 'string' && data.message) {
      return data.message;
    }
  } catch {
    // ignore parse failures and use fallback
  }
  return fallback;
}

// Auth
export async function login(password: string): Promise<{ success: boolean; token?: string; message?: string; locked?: boolean }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw { response: { data } };
  }
  return data;
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    // 忽略退出阶段的网络错误，前端仍然会跳回登录页
  }
}

export async function verifyAuth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/verify`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!res.ok) {
      return false;
    }

    const data = await res.json();
    return Boolean(data?.valid);
  } catch {
    return false;
  }
}

// Transactions
export async function getTransactions(): Promise<Transaction[]> {
  const res = await authFetch(`${API_BASE}/transactions`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch transactions');
  return res.json();
}

export async function createTransaction(data: {
  amount: number;
  category_id: number;
  account_id: number;  // 必填
  description: string;
  date: string;
}): Promise<Transaction> {
  const res = await authFetch(`${API_BASE}/transactions`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to create transaction');
  }
  return res.json();
}

export async function deleteTransaction(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/transactions/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete transaction');
}

// Categories
export async function getCategories(options?: {
  kind?: 'leaf' | 'group' | 'all';
  type?: 'income' | 'expense';
  includeMembers?: boolean;
}): Promise<Category[]> {
  const params = new URLSearchParams();

  if (options?.kind) {
    params.set('kind', options.kind);
  }

  if (options?.type) {
    params.set('type', options.type);
  }

  if (options?.includeMembers) {
    params.set('include_members', 'true');
  }

  const query = params.toString();
  const res = await authFetch(`${API_BASE}/categories${query ? `?${query}` : ''}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch categories');
  return res.json();
}

export async function createCategory(data: {
  name: string;
  type: 'income' | 'expense';
  icon?: string;
  kind?: 'leaf' | 'group';
  member_ids?: number[];
}): Promise<Category> {
  const res = await authFetch(`${API_BASE}/categories`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '创建分类失败'));
  }
  return res.json();
}

export async function updateCategory(id: number, data: Partial<{
  name: string;
  type: 'income' | 'expense';
  icon: string;
  member_ids: number[];
}>): Promise<Category> {
  const res = await authFetch(`${API_BASE}/categories/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '更新分类失败'));
  }
  return res.json();
}

export async function deleteCategory(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/categories/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '删除分类失败'));
  }
}

// Accounts (统一接口，支持资产和负债)
export async function getAccounts(type?: 'asset' | 'debt'): Promise<Account[]> {
  const url = type ? `${API_BASE}/accounts?type=${type}` : `${API_BASE}/accounts`;
  const res = await authFetch(url, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch accounts');
  return res.json();
}

export async function getAccount(id: number): Promise<Account> {
  const res = await authFetch(`${API_BASE}/accounts/${id}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch account');
  return res.json();
}

export async function createAccount(data: {
  name: string;
  type: 'asset' | 'debt';
  icon?: string;
  color?: string;
  balance?: number;
  limit_amount?: number;    // 负债账户的额度上限
  repayment_day?: number;   // 负债账户的还款日
}): Promise<Account> {
  const res = await authFetch(`${API_BASE}/accounts`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '创建账户失败'));
  }
  return res.json();
}

export async function updateAccount(id: number, data: Partial<Account>): Promise<Account> {
  const res = await authFetch(`${API_BASE}/accounts/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '更新账户失败'));
  }
  return res.json();
}

export async function deleteAccount(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/accounts/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '删除账户失败'));
  }
}

// 向后兼容的 Debts 函数（现在使用 accounts API）
export const getDebts = () => getAccounts('debt');

export function createDebt(data: {
  name: string;
  icon?: string;
  color?: string;
  amount?: number;
  limit_amount?: number;
  repayment_day?: number;
}): Promise<Account> {
  return createAccount({
    name: data.name,
    type: 'debt',
    icon: data.icon,
    color: data.color,
    balance: data.amount || 0,
    limit_amount: data.limit_amount,
    repayment_day: data.repayment_day,
  });
}

export function updateDebt(id: number, data: Partial<{
  name: string;
  icon: string;
  color: string;
  amount: number;
  limit_amount: number;
  repayment_day: number;
}>): Promise<Account> {
  const updateData: Partial<Account> = {
    name: data.name,
    icon: data.icon,
    color: data.color,
    balance: data.amount,
    limit_amount: data.limit_amount,
    repayment_day: data.repayment_day,
  };
  return updateAccount(id, updateData);
}

export const deleteDebt = deleteAccount;

// Goals
export async function getGoals(): Promise<Goal[]> {
  const res = await authFetch(`${API_BASE}/goals`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch goals');
  return res.json();
}

export async function createGoal(data: {
  name: string;
  icon?: string;
  color?: string;
  target_amount: number;
  deadline?: string | null;
  sort_order?: number;
}): Promise<Goal> {
  const res = await authFetch(`${API_BASE}/goals`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '创建目标失败'));
  }
  return res.json();
}

export async function updateGoal(id: number, data: Partial<Goal>): Promise<Goal> {
  const res = await authFetch(`${API_BASE}/goals/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '更新目标失败'));
  }
  return res.json();
}

export async function deleteGoal(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/goals/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '删除目标失败'));
  }
}

export async function reorderGoals(goalIds: number[]): Promise<Goal[]> {
  const res = await authFetch(`${API_BASE}/goals/reorder`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ goal_ids: goalIds }),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '更新目标顺序失败'));
  }
  return res.json();
}

// Budgets
export async function getBudgets(year: number, month: number): Promise<Budget[]> {
  const res = await authFetch(`${API_BASE}/budgets?year=${year}&month=${month}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '加载预算失败'));
  }
  return res.json();
}

export async function createBudget(data: {
  category_id: number;
  year: number;
  month: number;
  budget_amount: number;
  alert_threshold?: number;
  note?: string;
}): Promise<Budget> {
  const res = await authFetch(`${API_BASE}/budgets`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '创建预算失败'));
  }
  return res.json();
}

export async function updateBudget(id: number, data: Partial<Budget>): Promise<Budget> {
  const res = await authFetch(`${API_BASE}/budgets/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '更新预算失败'));
  }
  return res.json();
}

export async function deleteBudget(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/budgets/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '删除预算失败'));
  }
}

// LittleBaby Cron
export async function getLittleBabyCronStatus(): Promise<LittleBabyCronStatus> {
  const res = await authFetch(`${API_BASE}/littlebaby-cron/status`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '加载 LittleBaby 定时任务状态失败'));
  }
  return res.json();
}

export async function getLittleBabyCronJobs(): Promise<{ jobs: LittleBabyCronJob[]; target?: string }> {
  const res = await authFetch(`${API_BASE}/littlebaby-cron/jobs?all=true`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '加载 LittleBaby 定时任务失败'));
  }
  return res.json();
}

export async function createLittleBabyCronJob(data: Record<string, unknown>): Promise<LittleBabyCronJob> {
  const res = await authFetch(`${API_BASE}/littlebaby-cron/jobs`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '创建 LittleBaby 定时任务失败'));
  }
  return res.json();
}

export async function updateLittleBabyCronJob(id: string, data: Record<string, unknown>): Promise<LittleBabyCronJob> {
  const res = await authFetch(`${API_BASE}/littlebaby-cron/jobs/${id}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '更新 LittleBaby 定时任务失败'));
  }
  return res.json();
}

export async function enableLittleBabyCronJob(id: string): Promise<LittleBabyCronJob> {
  const res = await authFetch(`${API_BASE}/littlebaby-cron/jobs/${id}/enable`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '启用 LittleBaby 定时任务失败'));
  }
  return res.json();
}

export async function disableLittleBabyCronJob(id: string): Promise<LittleBabyCronJob> {
  const res = await authFetch(`${API_BASE}/littlebaby-cron/jobs/${id}/disable`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '停用 LittleBaby 定时任务失败'));
  }
  return res.json();
}

export async function runLittleBabyCronJob(id: string): Promise<{ ok: boolean; output?: string }> {
  const res = await authFetch(`${API_BASE}/littlebaby-cron/jobs/${id}/run`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '执行 LittleBaby 定时任务失败'));
  }
  return res.json();
}

export async function deleteLittleBabyCronJob(id: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/littlebaby-cron/jobs/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '删除 LittleBaby 定时任务失败'));
  }
}

export async function getLittleBabyCronRuns(id: string): Promise<LittleBabyCronRuns> {
  const res = await authFetch(`${API_BASE}/littlebaby-cron/jobs/${id}/runs?limit=20`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '加载 LittleBaby 定时任务运行记录失败'));
  }
  return res.json();
}

// Digest History
export async function getDigestHistory(params?: {
  digest_type?: 'news' | 'github' | 'paper';
  q?: string;
  days?: number;
  page?: number;
  page_size?: number;
}): Promise<DigestHistoryListResponse> {
  const search = new URLSearchParams();
  if (params?.digest_type) search.set('digest_type', params.digest_type);
  if (params?.q) search.set('q', params.q);
  if (params?.days) search.set('days', String(params.days));
  if (params?.page) search.set('page', String(params.page));
  if (params?.page_size) search.set('page_size', String(params.page_size));

  const query = search.toString();
  const res = await authFetch(`${API_BASE}/digest-history${query ? `?${query}` : ''}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '加载简报历史失败'));
  }
  return res.json();
}

export async function deleteDigestHistoryRecord(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/digest-history/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '删除简报历史失败'));
  }
}

export async function clearDigestHistory(data?: {
  digest_type?: 'news' | 'github' | 'paper';
  q?: string;
  days?: number;
}): Promise<{ success: boolean; deletedCount: number; message: string }> {
  const res = await authFetch(`${API_BASE}/digest-history/clear`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data || {}),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, '清空简报历史失败'));
  }
  return res.json();
}

// Schedule
export interface ScheduleCourse {
  id?: number;
  name: string;
  teacher?: string;
  location?: string;
  color: string;
  day_of_week: number;
  time_slot: number[];
  weeks: number[];
  owner: string;
}

export interface SemesterConfig {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  total_weeks: number;
  partner_week_offset: number;
  is_active: number;
  current_week?: number;
}

export interface TimeSlotConfig {
  id: number;
  owner: string;
  slot_number: number;
  start_time: string;
  end_time: string;
}

export async function getScheduleCourses(owner?: string): Promise<ScheduleCourse[]> {
  const url = owner ? `${API_BASE}/schedule?owner=${owner}` : `${API_BASE}/schedule`;
  const res = await authFetch(url, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch schedule');
  return res.json();
}

export async function saveScheduleCourse(data: ScheduleCourse): Promise<ScheduleCourse> {
  const res = await authFetch(`${API_BASE}/schedule`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to save course');
  }
  return res.json();
}

export async function updateScheduleCourse(id: number, data: Partial<ScheduleCourse>): Promise<void> {
  const res = await authFetch(`${API_BASE}/schedule/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to update course');
  }
}

export async function deleteScheduleCourse(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/schedule/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete course');
}

export async function importScheduleCourses(courses: ScheduleCourse[]): Promise<{ success: boolean; message: string }> {
  const res = await authFetch(`${API_BASE}/schedule/import`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ courses }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to import courses');
  }
  return res.json();
}

// Semester
export async function getCurrentSemester(): Promise<SemesterConfig> {
  const res = await authFetch(`${API_BASE}/semester/current`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch current semester');
  return res.json();
}

export async function getSemesters(): Promise<SemesterConfig[]> {
  const res = await authFetch(`${API_BASE}/semester`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch semesters');
  return res.json();
}

export async function createSemester(data: Partial<SemesterConfig>): Promise<SemesterConfig> {
  const res = await authFetch(`${API_BASE}/semester`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create semester');
  return res.json();
}

export async function updateSemester(id: number, data: Partial<SemesterConfig>): Promise<void> {
  const res = await authFetch(`${API_BASE}/semester/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update semester');
}

export async function deleteSemester(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/semester/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete semester');
}

// Time Slots
export async function getTimeSlots(owner?: string): Promise<TimeSlotConfig[]> {
  const url = owner ? `${API_BASE}/time-slots?owner=${owner}` : `${API_BASE}/time-slots`;
  const res = await authFetch(url, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch time slots');
  return res.json();
}

export async function updateTimeSlots(owner: string, slots: { slot_number: number; start_time: string; end_time: string }[]): Promise<{ success: boolean; message: string }> {
  const res = await authFetch(`${API_BASE}/time-slots/batch`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ owner, slots }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to update time slots');
  }
  return res.json();
}

// LittleBaby Memory
export async function getLittleBabyMemoryStatus(): Promise<{ agents: any[] }> {
  const res = await authFetch(`${API_BASE}/littlebaby-memory/status`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, '获取记忆状态失败'));
  return res.json();
}

export async function getLittleBabyMemoryFiles(): Promise<{ files: any[] }> {
  const res = await authFetch(`${API_BASE}/littlebaby-memory/files`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, '获取记忆文件失败'));
  return res.json();
}

export async function searchLittleBabyMemory(query: string, limit?: number): Promise<{ results: any[]; query: string }> {
  const params = new URLSearchParams();
  params.set('q', query);
  if (limit) params.set('limit', String(limit));
  const res = await authFetch(`${API_BASE}/littlebaby-memory/search?${params.toString()}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, '搜索记忆失败'));
  return res.json();
}

export async function reindexLittleBabyMemory(): Promise<{ success: boolean }> {
  const res = await authFetch(`${API_BASE}/littlebaby-memory/reindex`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, '重新索引失败'));
  return res.json();
}

export async function createLittleBabyMemoryFile(name: string, content: string): Promise<{ success: boolean }> {
  const res = await authFetch(`${API_BASE}/littlebaby-memory/files`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ name, content }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, '创建记忆文件失败'));
  return res.json();
}

export async function deleteLittleBabyMemoryFile(name: string): Promise<{ success: boolean }> {
  const res = await authFetch(`${API_BASE}/littlebaby-memory/files/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, '删除记忆文件失败'));
  return res.json();
}
