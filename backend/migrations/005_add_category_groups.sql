ALTER TABLE categories
  ADD COLUMN kind ENUM('leaf', 'group') NOT NULL DEFAULT 'leaf' AFTER type,
  ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER kind;

CREATE TABLE IF NOT EXISTS category_group_members (
  group_id INT NOT NULL,
  member_category_id INT NOT NULL,
  PRIMARY KEY (group_id, member_category_id),
  KEY idx_member_category_id (member_category_id),
  CONSTRAINT fk_category_group_members_group
    FOREIGN KEY (group_id) REFERENCES categories(id) ON DELETE CASCADE,
  CONSTRAINT fk_category_group_members_member
    FOREIGN KEY (member_category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='组合分类成员映射';
