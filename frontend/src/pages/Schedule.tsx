import React, { useState, useEffect } from 'react';
import { Card, Select, Button, Modal, Form, Input, ColorPicker, message, Spin } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { getScheduleCourses, saveScheduleCourse, updateScheduleCourse, deleteScheduleCourse, getCurrentSemester } from '../services/api';
import type { ScheduleCourse, SemesterConfig } from '../services/api';

const timeSlots = [
  { key: 1, label: '第1节', time: '08:10-08:55' },
  { key: 2, label: '第2节', time: '09:05-09:50' },
  { key: 3, label: '第3节', time: '10:10-10:55' },
  { key: 4, label: '第4节', time: '11:05-11:50' },
  { key: 5, label: '第5节', time: '13:30-14:15' },
  { key: 6, label: '第6节', time: '14:25-15:10' },
  { key: 7, label: '第7节', time: '15:30-16:15' },
  { key: 8, label: '第8节', time: '16:25-17:10' },
  { key: 9, label: '第9节', time: '18:20-19:05' },
  { key: 10, label: '第10节', time: '19:10-19:55' },
  { key: 11, label: '第11节', time: '20:00-20:45' },
  { key: 12, label: '第12节', time: '20:50-21:35' },
];

const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const MAX_TIME_SLOT = timeSlots.length;
const TABLE_CELL_GAP = 6;
const SLOT_ROW_HEIGHT = 72;
const EMPTY_SLOT_MIN_HEIGHT = SLOT_ROW_HEIGHT;

const generateWeekOptions = (totalWeeks: number = 26) => {
  return Array.from({ length: totalWeeks }, (_, i) => ({
    value: i + 1,
    label: `第${i + 1}周`,
  }));
};

function normalizeNumberList(values: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= min && value <= max)
    )
  ).sort((left, right) => left - right);
}

function normalizeCourse(course: ScheduleCourse): ScheduleCourse {
  return {
    ...course,
    time_slot: normalizeNumberList(course.time_slot, 1, MAX_TIME_SLOT),
    weeks: normalizeNumberList(course.weeks, 1),
  };
}

function compareCourses(left: ScheduleCourse, right: ScheduleCourse): number {
  const leftStartWeek = left.weeks[0] ?? 0;
  const rightStartWeek = right.weeks[0] ?? 0;

  if (leftStartWeek !== rightStartWeek) {
    return leftStartWeek - rightStartWeek;
  }

  return (left.id ?? 0) - (right.id ?? 0);
}

function isCourseActiveInWeek(course: ScheduleCourse, week: number): boolean {
  return course.weeks.length === 0 || course.weeks.includes(week);
}

function weeksOverlap(left: number[], right: number[]): boolean {
  if (left.length === 0 || right.length === 0) {
    return true;
  }

  const [smaller, larger] = left.length <= right.length ? [left, right] : [right, left];
  const smallerSet = new Set(smaller);

  return larger.some((week) => smallerSet.has(week));
}

function buildScheduleIndex(courses: ScheduleCourse[]): Map<string, ScheduleCourse[]> {
  const index = new Map<string, ScheduleCourse[]>();

  courses.forEach((rawCourse) => {
    const course = normalizeCourse(rawCourse);

    course.time_slot.forEach((slot) => {
      const key = `${course.day_of_week}-${slot}`;
      const existing = index.get(key) ?? [];
      existing.push(course);
      index.set(key, existing);
    });
  });

  index.forEach((slotCourses, key) => {
    index.set(key, slotCourses.sort(compareCourses));
  });

  return index;
}

function isConsecutiveSlots(slots: number[]): boolean {
  return slots.every((slot, index) => index === 0 || slot === slots[index - 1] + 1);
}

function formatDateLabel(value?: string): string {
  if (!value) {
    return '';
  }

  return value.includes('T') ? value.slice(0, 10) : value;
}

function withAlpha(color: string, alpha: number): string {
  const hex = color.replace('#', '').trim();

  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(hex)) {
    return `rgba(255,255,255,${alpha})`;
  }

  const normalized = hex.length === 3
    ? hex.split('').map((char) => `${char}${char}`).join('')
    : hex;

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getCourseCellStyle(course: ScheduleCourse, isActiveInCurrentWeek: boolean): React.CSSProperties {
  void course;
  void isActiveInCurrentWeek;

  return {
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    padding: 0,
    verticalAlign: 'top',
  };
}

function getCourseCardStyle(course: ScheduleCourse, isActiveInCurrentWeek: boolean): React.CSSProperties {
  if (isActiveInCurrentWeek) {
    return {
      borderRadius: 12,
      color: '#fff',
      overflow: 'hidden',
      background: withAlpha(course.color, 0.18),
      border: `1px solid ${withAlpha(course.color, 0.34)}`,
      boxShadow: 'none',
    };
  }

  return {
    borderRadius: 12,
    color: 'rgba(255,255,255,0.88)',
    overflow: 'hidden',
    background: 'rgba(255,255,255,0.03)',
    border: `1px solid ${withAlpha(course.color, 0.22)}`,
    boxShadow: 'none',
    opacity: 0.9,
  };
}

function getCourseSpanHeight(slotCount: number): number {
  return slotCount * SLOT_ROW_HEIGHT + Math.max(0, slotCount - 1) * TABLE_CELL_GAP;
}

export default function Schedule() {
  const [currentWeek, setCurrentWeek] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<{ dayIndex: number; slotKey: number } | null>(null);
  const [editingCourse, setEditingCourse] = useState<ScheduleCourse | null>(null);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [semester, setSemester] = useState<SemesterConfig | null>(null);

  const [scheduleData, setScheduleData] = useState<Map<string, ScheduleCourse[]>>(new Map());

  const fetchSemester = async () => {
    try {
      const data = await getCurrentSemester();
      setSemester(data);
      setCurrentWeek(data.current_week || 1);
    } catch {
      console.error('获取学期配置失败');
    }
  };

  const fetchScheduleData = async () => {
    try {
      setLoading(true);
      const courses = await getScheduleCourses();
      setScheduleData(buildScheduleIndex(courses));
    } catch {
      message.error('加载课表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSemester();
    fetchScheduleData();
  }, []);

  const getCoursesForSlot = (dayIndex: number, slotKey: number): ScheduleCourse[] => {
    return scheduleData.get(`${dayIndex}-${slotKey}`) ?? [];
  };

  const findSuggestedWeeks = (dayIndex: number, timeSlot: number[]): number[] => {
    const totalWeeks = semester?.total_weeks || 26;
    const occupiedWeeks = new Set<number>();

    for (const slot of timeSlot) {
      for (const course of getCoursesForSlot(dayIndex, slot)) {
        if (course.weeks.length === 0) {
          return [currentWeek];
        }

        course.weeks.forEach((week) => occupiedWeeks.add(week));
      }
    }

    for (let offset = 0; offset < totalWeeks; offset += 1) {
      const week = ((currentWeek - 1 + offset) % totalWeeks) + 1;
      if (!occupiedWeeks.has(week)) {
        return [week];
      }
    }

    return [currentWeek];
  };

  const selectCourseForWeek = (courses: ScheduleCourse[]): ScheduleCourse | null => {
    if (courses.length === 0) {
      return null;
    }

    return courses.find((course) => isCourseActiveInWeek(course, currentWeek)) ?? courses[0];
  };

  const handleAddCourse = (dayIndex: number, slotKey: number, presetTimeSlot?: number[]) => {
    const timeSlot = normalizeNumberList(
      presetTimeSlot ?? (slotKey < MAX_TIME_SLOT ? [slotKey, slotKey + 1] : [slotKey]),
      1,
      MAX_TIME_SLOT
    );

    setEditingCourse(null);
    setEditingCell({ dayIndex, slotKey });
    form.resetFields();
    form.setFieldsValue({
      color: '#1890ff',
      time_slot: timeSlot,
      weeks: findSuggestedWeeks(dayIndex, timeSlot),
    });
    setIsModalOpen(true);
  };

  const handleEditCourse = (course: ScheduleCourse) => {
    const normalizedCourse = normalizeCourse(course);
    setEditingCourse(normalizedCourse);
    setEditingCell({ dayIndex: normalizedCourse.day_of_week, slotKey: normalizedCourse.time_slot[0] || 1 });
    form.setFieldsValue({
      name: normalizedCourse.name,
      teacher: normalizedCourse.teacher,
      location: normalizedCourse.location,
      color: normalizedCourse.color,
      time_slot: normalizedCourse.time_slot,
      weeks: normalizedCourse.weeks,
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCell(null);
    setEditingCourse(null);
    form.resetFields();
  };

  const handleDeleteCourse = async (id: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这节课程吗？',
      onOk: async () => {
        try {
          await deleteScheduleCourse(id);
          await fetchScheduleData();
          handleCloseModal();
          message.success('删除成功');
        } catch {
          message.error('删除失败');
        }
      },
    });
  };

  const handleCreateAlternateCourse = () => {
    if (!editingCourse) {
      return;
    }

    const baseCourse = editingCourse;
    setEditingCourse(null);
    setEditingCell({ dayIndex: baseCourse.day_of_week, slotKey: baseCourse.time_slot[0] || 1 });
    form.resetFields();
    form.setFieldsValue({
      color: baseCourse.color,
      time_slot: baseCourse.time_slot,
      weeks: findSuggestedWeeks(baseCourse.day_of_week, baseCourse.time_slot),
    });
  };

  const handleSaveCourse = async () => {
    try {
      const values = await form.validateFields();
      if (!editingCell) return;

      const { dayIndex } = editingCell;
      const colorValue = values.color;
      const colorString = typeof colorValue === 'string' ? colorValue : colorValue?.toHexString?.() || '#1890ff';
      const timeSlot = normalizeNumberList(values.time_slot, 1, MAX_TIME_SLOT);
      const weeks = normalizeNumberList(values.weeks, 1);

      if (timeSlot.length === 0) {
        throw new Error('至少选择一个上课节次');
      }

      if (!isConsecutiveSlots(timeSlot)) {
        throw new Error('上课节次必须连续，不能跳节');
      }

      const existingCourses = new Map<number, ScheduleCourse>();
      timeSlot.forEach((slot) => {
        getCoursesForSlot(dayIndex, slot).forEach((course) => {
          if (course.id && course.id !== editingCourse?.id) {
            existingCourses.set(course.id, course);
          }
        });
      });

      const effectiveWeeks = weeks.length > 0 ? weeks : [currentWeek];
      const conflictingCourse = Array.from(existingCourses.values()).find((course) => weeksOverlap(course.weeks, effectiveWeeks));

      if (conflictingCourse) {
        throw new Error('所选节次在这些周次已有其他课程');
      }

      const courseData: ScheduleCourse = {
        name: values.name,
        teacher: values.teacher,
        location: values.location,
        color: colorString,
        day_of_week: dayIndex,
        time_slot: timeSlot,
        weeks: effectiveWeeks,
      };

      if (editingCourse?.id) {
        await updateScheduleCourse(editingCourse.id, courseData);
      } else {
        await saveScheduleCourse(courseData);
      }

      await fetchScheduleData();
      handleCloseModal();
      message.success(editingCourse?.id ? '更新成功' : '保存成功');
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message);
      }
    }
  };

  const renderCourseContent = (
    course: ScheduleCourse,
    isActiveInCurrentWeek: boolean,
    _hasAlternates: boolean,
    slotCount: number
  ) => (
    <div
      style={{
        ...getCourseCardStyle(course, isActiveInCurrentWeek),
        height: getCourseSpanHeight(slotCount),
        boxSizing: 'border-box',
        padding: '12px 14px 12px 16px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: 'pointer',
        position: 'relative',
      }}
      onClick={() => handleEditCourse(course)}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 10,
          bottom: 10,
          width: 3,
          borderRadius: '0 999px 999px 0',
          background: isActiveInCurrentWeek ? course.color : 'rgba(255,255,255,0.22)',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.4, flex: 1 }}>
          {course.name}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {course.location && (
          <div style={{
            fontSize: 11,
            opacity: 0.92,
          }}>
            {course.location}
          </div>
        )}
        {course.teacher && (
          <div style={{
            fontSize: 11,
            opacity: 0.82,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: isActiveInCurrentWeek ? course.color : 'rgba(255,255,255,0.22)',
              flex: '0 0 auto',
            }} />
            <span>{course.teacher}</span>
          </div>
        )}
      </div>
    </div>
  );

  const buildTableRows = () => {
    const rows: React.ReactElement[] = [];
    const rendered = new Set<string>();
    const selectedCourses = new Map<string, ScheduleCourse | null>();

    for (let dayIndex = 0; dayIndex < weekDays.length; dayIndex += 1) {
      for (let slotKey = 1; slotKey <= MAX_TIME_SLOT; slotKey += 1) {
        selectedCourses.set(`${dayIndex}-${slotKey}`, selectCourseForWeek(getCoursesForSlot(dayIndex, slotKey)));
      }
    }

    for (let slotKey = 1; slotKey <= MAX_TIME_SLOT; slotKey++) {
      const cells: React.ReactElement[] = [];

      cells.push(
        <td
          key="time"
          style={{
            textAlign: 'center',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            background: 'rgba(255,255,255,0.04)',
            fontSize: 11,
            padding: '10px 8px',
            borderRadius: 12,
            color: 'rgba(255,255,255,0.78)',
          }}
        >
          <div style={{ fontWeight: 700 }}>{timeSlots[slotKey - 1].label}</div>
          <div style={{ fontSize: 10, opacity: 0.58, marginTop: 3 }}>{timeSlots[slotKey - 1].time}</div>
        </td>
      );

      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const key = `${dayIndex}-${slotKey}`;

        if (rendered.has(key)) {
          continue;
        }

        const slotCourses = getCoursesForSlot(dayIndex, slotKey);
        const course = selectedCourses.get(key);

        if (!course) {
          cells.push(
            <td
              key={dayIndex}
              style={{
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                padding: 0,
                verticalAlign: 'top',
              }}
            >
              <div
                style={{
                  minHeight: EMPTY_SLOT_MIN_HEIGHT,
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  gap: 4,
                  border: '1px dashed rgba(255,255,255,0.10)',
                  borderRadius: 12,
                  color: 'rgba(255,255,255,0.36)',
                  background: 'rgba(255,255,255,0.02)',
                }}
                onClick={() => handleAddCourse(dayIndex, slotKey)}
              >
                <PlusOutlined style={{ fontSize: 12 }} />
                <span style={{ fontSize: 11 }}>添加课程</span>
              </div>
            </td>
          );
        } else {
          const isActiveInCurrentWeek = isCourseActiveInWeek(course, currentWeek);
          const contiguousSlots: number[] = [];

          for (let nextSlot = slotKey; nextSlot <= MAX_TIME_SLOT; nextSlot += 1) {
            const nextCourse = selectedCourses.get(`${dayIndex}-${nextSlot}`);
            if (nextCourse?.id !== course.id) {
              break;
            }
            contiguousSlots.push(nextSlot);
          }

          const slotCount = contiguousSlots.length;

          for (const s of contiguousSlots) {
            rendered.add(`${dayIndex}-${s}`);
          }

          cells.push(
            <td
              key={dayIndex}
              rowSpan={slotCount}
              style={getCourseCellStyle(course, isActiveInCurrentWeek)}
            >
              {renderCourseContent(course, isActiveInCurrentWeek, slotCourses.length > 1, slotCount)}
            </td>
          );
        }
      }

      rows.push(
        <tr key={slotKey} style={{ height: SLOT_ROW_HEIGHT }}>
          {cells}
        </tr>
      );
    }

    return rows;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>我的课表</h2>
          <Select
            value={currentWeek}
            onChange={setCurrentWeek}
            options={generateWeekOptions(semester?.total_weeks || 26)}
            style={{ width: 120 }}
          />
          <Button onClick={() => semester && setCurrentWeek(semester.current_week || 1)}>
            当前周
          </Button>
          {semester && (
            <span style={{ color: '#888', fontSize: 12 }}>
              {semester.name} | 开学日期: {formatDateLabel(semester.start_date)}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto' }}>
          <span style={{
            padding: '4px 10px',
            borderRadius: 999,
            background: 'rgba(82,196,26,0.14)',
            border: '1px solid rgba(82,196,26,0.24)',
            color: 'rgba(255,255,255,0.88)',
            fontSize: 12,
          }}>
            当前周: 第 {currentWeek} 周
          </span>
          <span style={{
            padding: '4px 10px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: 'rgba(255,255,255,0.72)',
            fontSize: 12,
          }}>
            亮色表示本周课程
          </span>
          <span style={{
            padding: '4px 10px',
            borderRadius: 999,
            background: 'rgba(24,144,255,0.12)',
            border: '1px solid rgba(24,144,255,0.24)',
            color: 'rgba(255,255,255,0.72)',
            fontSize: 12,
          }}>
            点击卡片可查看详情
          </span>
        </div>
      </div>

      <Card style={{ border: '1px solid #303030', background: 'linear-gradient(180deg, rgba(31,31,31,0.98), rgba(20,20,20,0.96))' }}>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 980, borderCollapse: 'separate', borderSpacing: 6, tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{
                width: 92,
                padding: '10px 8px',
                borderBottom: '1px solid #333',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 12,
                color: 'rgba(255,255,255,0.72)',
              }}>
                时间
              </th>
              {weekDays.map((day) => (
                <th
                  key={day}
                  style={{
                    padding: '10px 8px',
                    borderBottom: '1px solid #333',
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: 12,
                    color: 'rgba(255,255,255,0.82)',
                    fontWeight: 600,
                  }}
                >
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{buildTableRows()}</tbody>
        </table>
        </div>
      </Card>

      <Modal
        title={editingCourse ? '编辑课程' : '添加课程'}
        open={isModalOpen}
        onOk={handleSaveCourse}
        onCancel={handleCloseModal}
        okText="保存"
        cancelText="取消"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, width: '100%' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {editingCourse && (
                <Button onClick={handleCreateAlternateCourse}>
                  新增轮换课
                </Button>
              )}
              {editingCourse?.id && (
                <Button danger onClick={() => handleDeleteCourse(editingCourse.id!)}>
                  删除课程
                </Button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={handleCloseModal}>取消</Button>
              <Button type="primary" onClick={handleSaveCourse}>保存</Button>
            </div>
          </div>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="课程名称"
            rules={[{ required: true, message: '请输入课程名称' }]}
          >
            <Input placeholder="如：高等数学" />
          </Form.Item>
          <Form.Item name="teacher" label="授课教师">
            <Input placeholder="如：张教授" />
          </Form.Item>
          <Form.Item name="location" label="上课地点">
            <Input placeholder="如：教1-101" />
          </Form.Item>
          <Form.Item name="color" label="课程颜色">
            <ColorPicker format="hex" />
          </Form.Item>
          <Form.Item name="time_slot" label="上课节次" rules={[{ required: true, message: '请选择上课节次' }]}>
            <Select
              mode="multiple"
              placeholder="选择节次"
              options={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ value: n, label: `第${n}节` }))}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="weeks" label="上课周次">
            <Select
              mode="multiple"
              placeholder="选择周次"
              options={generateWeekOptions(semester?.total_weeks || 26)}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
