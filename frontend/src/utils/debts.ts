import type { Account } from '../types';

export function getDebtUsedAmount(account: Pick<Account, 'balance'>): number {
  return Number(account.balance) || 0;
}

export function getDebtLimitAmount(account: Pick<Account, 'limit_amount'>): number {
  return Number(account.limit_amount) || 0;
}

export function getDebtAvailableAmount(account: Pick<Account, 'balance' | 'limit_amount'>): number {
  return Math.max(0, getDebtLimitAmount(account) - getDebtUsedAmount(account));
}

export function getDebtOverLimitAmount(account: Pick<Account, 'balance' | 'limit_amount'>): number {
  return Math.max(0, getDebtUsedAmount(account) - getDebtLimitAmount(account));
}

export function getDebtUsagePercent(account: Pick<Account, 'balance' | 'limit_amount'>): number {
  const limit = getDebtLimitAmount(account);
  if (limit <= 0) {
    return 0;
  }
  return (getDebtUsedAmount(account) / limit) * 100;
}

export function getDebtUsedAmountFromAvailable(limitAmount: number, availableAmount: number): number {
  return Math.max(0, limitAmount - availableAmount);
}
