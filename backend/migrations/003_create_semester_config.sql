-- 创建学期配置表
CREATE TABLE IF NOT EXISTS semester_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL COMMENT '学期名称',
  start_date DATE NOT NULL COMMENT '学期开始日期',
  end_date DATE NOT NULL COMMENT '学期结束日期',
  total_weeks TINYINT DEFAULT 26 COMMENT '总周数',
  is_active TINYINT DEFAULT 1 COMMENT '是否当前学期',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='学期配置';

-- 插入当前学期
INSERT INTO semester_config (name, start_date, end_date, total_weeks, is_active)
VALUES ('2025-2026学年第二学期', '2026-03-02', '2026-08-30', 26, 1);

-- 修改 schedule_courses 表结构
-- 1. 删除唯一索引
ALTER TABLE schedule_courses DROP INDEX uk_day_slot;

-- 2. 修改 time_slot 字段类型为 JSON
ALTER TABLE schedule_courses MODIFY COLUMN time_slot JSON COMMENT '时间节数组';

-- 3. 清空旧数据（因为格式已变化）
DELETE FROM schedule_courses;
