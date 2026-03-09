export interface Category {
  id: number;
  name: string;
  type: 'income' | 'expense';
  icon: string | null;
}

// 统一的账户类型
export interface Account {
  id: number;
  name: string;
  type: 'asset' | 'debt';  // asset = 资产，debt = 负债
  icon: string;
  color: string;
  balance: number;         // 资产账户的余额，或负债账户的已用额度
  limit_amount: number;    // 负债账户的额度上限
  repayment_day: number;   // 负债账户的还款日
  sort_order: number;
}

// 保留 Debt 类型作为向后兼容（现在本质上是 type='debt' 的 Account）
export type Debt = Account;

export interface Goal {
  id: number;
  name: string;
  icon: string;
  color: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  is_completed: boolean;
  sort_order: number;
}

export interface Transaction {
  id: number;
  amount: number;
  category_id: number;
  category_name: string;
  category_type: 'income' | 'expense';
  account_id: number;
  account_name: string;
  account_type: 'asset' | 'debt';
  description: string;
  date: string;
}
