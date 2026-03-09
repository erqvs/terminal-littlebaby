-- 迁移脚本：合并 accounts 和 debts 表

-- 1. 创建新的统一账户表
CREATE TABLE IF NOT EXISTS accounts_new (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type ENUM('asset', 'debt') NOT NULL DEFAULT 'asset' COMMENT '账户类型：asset=资产，debt=负债',
  icon VARCHAR(50) DEFAULT 'wallet',
  color VARCHAR(20) DEFAULT '#1890ff',
  balance DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '资产账户的余额，或负债账户的已用额度',
  limit_amount DECIMAL(15,2) DEFAULT 0 COMMENT '负债账户的额度上限',
  repayment_day TINYINT DEFAULT 1 COMMENT '负债账户的还款日（1-28）',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_type (type),
  INDEX idx_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. 迁移现有资产账户数据
INSERT INTO accounts_new (id, name, type, icon, color, balance, sort_order, created_at, updated_at)
SELECT id, name, 'asset', icon, color, IFNULL(balance, 0), IFNULL(sort_order, 0), created_at, updated_at FROM accounts;

-- 3. 迁移现有负债数据（ID 偏移 100 避免冲突）
INSERT INTO accounts_new (id, name, type, icon, color, balance, limit_amount, repayment_day, sort_order, created_at, updated_at)
SELECT
  id + 100,
  name,
  'debt',
  icon,
  color,
  IFNULL(amount, 0),
  IFNULL(limit_amount, 0),
  IFNULL(repayment_day, 1),
  IFNULL(sort_order, 0),
  created_at,
  updated_at
FROM debts;

-- 4. 删除旧表
DROP TABLE accounts;
DROP TABLE debts;

-- 5. 重命名新表
RENAME TABLE accounts_new TO accounts;
