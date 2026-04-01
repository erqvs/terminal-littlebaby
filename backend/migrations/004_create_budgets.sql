CREATE TABLE IF NOT EXISTS budgets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  year SMALLINT NOT NULL COMMENT '预算年份',
  month TINYINT NOT NULL COMMENT '预算月份 1-12',
  budget_amount DECIMAL(15,2) NOT NULL COMMENT '预算金额',
  alert_threshold DECIMAL(5,2) NOT NULL DEFAULT 80 COMMENT '预警阈值百分比',
  note VARCHAR(255) DEFAULT NULL COMMENT '备注',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_category_month (category_id, year, month),
  KEY idx_year_month (year, month),
  KEY idx_sort (sort_order),
  CONSTRAINT fk_budgets_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='月度分类预算';
