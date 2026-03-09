import type { Category, Transaction, Account, Goal } from '../types';

const API_BASE = '/api';

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// 统一处理 401 响应
function handleUnauthorized(): void {
  localStorage.removeItem('token');
  // 只有不在登录页时才跳转
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

// 封装 fetch，自动处理 401
async function authFetch(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, options);
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error('未授权，请重新登录');
  }
  return res;
}

// Auth
export async function login(password: string): Promise<{ success: boolean; token?: string; message?: string; locked?: boolean }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw { response: { data } };
  }
  return data;
}

export function logout(): void {
  localStorage.removeItem('token');
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem('token');
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
export async function getCategories(): Promise<Category[]> {
  const res = await authFetch(`${API_BASE}/categories`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch categories');
  return res.json();
}

export async function createCategory(data: {
  name: string;
  type: 'income' | 'expense';
  icon?: string;
}): Promise<Category> {
  const res = await authFetch(`${API_BASE}/categories`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create category');
  return res.json();
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
  if (!res.ok) throw new Error('Failed to create account');
  return res.json();
}

export async function updateAccount(id: number, data: Partial<Account>): Promise<Account> {
  const res = await authFetch(`${API_BASE}/accounts/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update account');
  return res.json();
}

export async function deleteAccount(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/accounts/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete account');
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
  current_amount?: number;
  deadline?: string;
}): Promise<Goal> {
  const res = await authFetch(`${API_BASE}/goals`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create goal');
  return res.json();
}

export async function updateGoal(id: number, data: Partial<Goal>): Promise<Goal> {
  const res = await authFetch(`${API_BASE}/goals/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update goal');
  return res.json();
}

export async function deleteGoal(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/goals/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete goal');
}

// Schedule
export interface ScheduleCourse {
  id?: number;
  name: string;
  teacher?: string;
  location?: string;
  color: string;
  day_of_week: number;  // 0-6 (周一到周日)
  time_slot: number;    // 1-5 (第1-2节到第9-10节)
  weeks: number[];
}

export async function getScheduleCourses(): Promise<ScheduleCourse[]> {
  const res = await authFetch(`${API_BASE}/schedule`, { headers: getAuthHeaders() });
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

export async function deleteScheduleCourse(dayOfWeek: number, timeSlot: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/schedule/${dayOfWeek}/${timeSlot}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete course');
}
