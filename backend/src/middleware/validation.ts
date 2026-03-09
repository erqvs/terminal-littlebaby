import { Request, Response, NextFunction } from 'express';

// 验证是否为有效数字
function isValidNumber(value: unknown, min?: number, max?: number): boolean {
  if (typeof value !== 'number' || isNaN(value)) return false;
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}

// 验证是否为有效字符串
function isValidString(value: unknown, maxLength: number = 255): boolean {
  if (typeof value !== 'string') return false;
  if (value.length > maxLength) return false;
  return true;
}

// 验证日期格式
function isValidDate(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !isNaN(date.getTime());
}

// 验证 ID 参数
export function validateId(req: Request, res: Response, next: NextFunction): void {
  const id = req.params.id;

  // 处理 string | string[] 类型
  const idStr = Array.isArray(id) ? id[0] : id;

  if (!idStr || !/^\d+$/.test(idStr)) {
    res.status(400).json({ error: '无效的 ID 参数' });
    return;
  }

  const numId = parseInt(idStr, 10);
  if (numId <= 0 || numId > 2147483647) {
    res.status(400).json({ error: 'ID 超出有效范围' });
    return;
  }

  next();
}

// 验证交易数据
export function validateTransaction(req: Request, res: Response, next: NextFunction): void {
  const { amount, category_id, account_id, description, date } = req.body;
  const errors: string[] = [];

  if (!isValidNumber(amount, 0.01, 999999999)) {
    errors.push('金额必须是有效的正数');
  }

  if (!isValidNumber(category_id, 1)) {
    errors.push('分类 ID 必须是有效的正整数');
  }

  // 账户 ID 必填
  if (!isValidNumber(account_id, 1)) {
    errors.push('必须选择一个账户');
  }

  if (description !== undefined && !isValidString(description, 500)) {
    errors.push('描述不能超过 500 个字符');
  }

  if (!isValidDate(date)) {
    errors.push('日期格式无效');
  }

  if (errors.length > 0) {
    res.status(400).json({ error: errors.join('; ') });
    return;
  }

  next();
}

// 验证账户数据
export function validateAccount(req: Request, res: Response, next: NextFunction): void {
  const { name, type, balance, limit_amount, repayment_day } = req.body;
  const errors: string[] = [];

  if (!name || !isValidString(name, 100)) {
    errors.push('账户名称不能为空且不能超过 100 个字符');
  }

  // 验证账户类型
  if (type && !['asset', 'debt'].includes(type)) {
    errors.push('账户类型必须是 asset 或 debt');
  }

  if (balance !== undefined && !isValidNumber(balance, -999999999, 999999999)) {
    errors.push('余额必须是有效的数字');
  }

  // 负债账户的额度验证
  if (type === 'debt' && limit_amount !== undefined && !isValidNumber(limit_amount, 0, 999999999)) {
    errors.push('额度必须是有效的非负数');
  }

  // 还款日验证
  if (type === 'debt' && repayment_day !== undefined && !isValidNumber(repayment_day, 1, 28)) {
    errors.push('还款日必须是 1-28 之间的数字');
  }

  if (errors.length > 0) {
    res.status(400).json({ error: errors.join('; ') });
    return;
  }

  next();
}

// 验证负债数据（已废弃，保留向后兼容）
export function validateDebt(req: Request, res: Response, next: NextFunction): void {
  const { name, amount, limit_amount, repayment_day } = req.body;
  const errors: string[] = [];

  if (name !== undefined && !isValidString(name, 100)) {
    errors.push('负债名称不能超过 100 个字符');
  }

  if (amount !== undefined && !isValidNumber(amount, 0, 999999999)) {
    errors.push('金额必须是有效的非负数');
  }

  if (limit_amount !== undefined && !isValidNumber(limit_amount, 0, 999999999)) {
    errors.push('额度必须是有效的非负数');
  }

  if (repayment_day !== undefined && !isValidNumber(repayment_day, 0, 28)) {
    errors.push('还款日必须是 0-28 之间的数字');
  }

  if (errors.length > 0) {
    res.status(400).json({ error: errors.join('; ') });
    return;
  }

  next();
}

// 验证目标数据
export function validateGoal(req: Request, res: Response, next: NextFunction): void {
  const { name, target_amount, current_amount, deadline } = req.body;
  const errors: string[] = [];

  if (!name || !isValidString(name, 100)) {
    errors.push('目标名称不能为空且不能超过 100 个字符');
  }

  if (!isValidNumber(target_amount, 0.01, 999999999)) {
    errors.push('目标金额必须是有效的正数');
  }

  if (current_amount !== undefined && !isValidNumber(current_amount, 0, 999999999)) {
    errors.push('当前金额必须是有效的非负数');
  }

  if (deadline !== undefined && !isValidDate(deadline)) {
    errors.push('截止日期格式无效');
  }

  if (errors.length > 0) {
    res.status(400).json({ error: errors.join('; ') });
    return;
  }

  next();
}
