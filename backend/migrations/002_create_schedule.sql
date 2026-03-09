-- 课表课程表
CREATE TABLE IF NOT EXISTS schedule_courses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL COMMENT '课程名称',
  teacher VARCHAR(50) DEFAULT NULL COMMENT '授课教师',
  location VARCHAR(100) DEFAULT NULL COMMENT '上课地点',
  color VARCHAR(20) DEFAULT '#1890ff' COMMENT '课程颜色',
  day_of_week TINYINT NOT NULL COMMENT '星期几 (0=周一, 1=周二, ..., 6=周日)',
  time_slot TINYINT NOT NULL COMMENT '时间节次 (1=第1-2节, 2=第3-4节, 3=第5-6节, 4=第7-8节, 5=第9-10节)',
  weeks JSON DEFAULT NULL COMMENT '上课周次数组',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_day_slot (day_of_week, time_slot)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='课表课程';
