import React, { useState, useEffect } from 'react';
import { Card, Select, Button, Modal, Form, Input, ColorPicker, message, Spin, Segmented } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { getScheduleCourses, saveScheduleCourse, updateScheduleCourse, deleteScheduleCourse, getCurrentSemester, getTimeSlots } from '../services/api';
import type { ScheduleCourse, SemesterConfig, TimeSlotConfig } from '../services/api';

const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const SLOT_ROW_HEIGHT = 66;
const TABLE_CELL_GAP = 4;
const EMPTY_SLOT_MIN_HEIGHT = SLOT_ROW_HEIGHT;

type OwnerFilter = 'me' | 'partner';

const DEFAULT_ME_SLOTS = [
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

const DEFAULT_PARTNER_SLOTS = [
  { key: 1, label: '第1节', time: '08:00-08:45' },
  { key: 2, label: '第2节', time: '08:50-09:35' },
  { key: 3, label: '第3节', time: '09:50-10:35' },
  { key: 4, label: '第4节', time: '10:40-11:25' },
  { key: 5, label: '第5节', time: '11:30-12:15' },
  { key: 6, label: '第6节', time: '13:40-14:25' },
  { key: 7, label: '第7节', time: '14:30-15:15' },
  { key: 8, label: '第8节', time: '15:30-16:15' },
  { key: 9, label: '第9节', time: '16:20-17:05' },
  { key: 10, label: '第10节', time: '18:00-18:45' },
  { key: 11, label: '第11节', time: '18:50-19:35' },
  { key: 12, label: '第12节', time: '19:40-20:25' },
];

function getTimeSlotsArray(configs: TimeSlotConfig[], owner: string): { key: number; label: string; time: string }[] {
  const defaults = owner === 'partner' ? DEFAULT_PARTNER_SLOTS : DEFAULT_ME_SLOTS;
  if (configs.length === 0) return defaults;
  return configs
    .filter((c) => c.owner === owner)
    .sort((a, b) => a.slot_number - b.slot_number)
    .map((c) => ({ key: c.slot_number, label: `第${c.slot_number}节`, time: `${c.start_time}-${c.end_time}` }));
}

const generateWeekOptions = (totalWeeks: number = 26) => {
  return Array.from({ length: totalWeeks }, (_, i) => ({
    value: i + 1,
    label: `第${i + 1}周`,
  }));
};

function normalizeNumberList(values: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(values.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v >= min && v <= max))
  ).sort((a, b) => a - b);
}

function normalizeCourse(course: ScheduleCourse, maxSlot: number): ScheduleCourse {
  return {
    ...course,
    owner: course.owner || 'me',
    time_slot: normalizeNumberList(course.time_slot, 1, maxSlot),
    weeks: normalizeNumberList(course.weeks, 1),
  };
}

function compareCourses(a: ScheduleCourse, b: ScheduleCourse): number {
  const wa = a.weeks[0] ?? 0;
  const wb = b.weeks[0] ?? 0;
  return wa !== wb ? wa - wb : (a.id ?? 0) - (b.id ?? 0);
}

function isCourseActiveInWeek(course: ScheduleCourse, week: number): boolean {
  return course.weeks.length === 0 || course.weeks.includes(week);
}

function buildScheduleIndex(courses: ScheduleCourse[], maxSlot: number): Map<string, ScheduleCourse[]> {
  const index = new Map<string, ScheduleCourse[]>();
  for (const raw of courses) {
    const course = normalizeCourse(raw, maxSlot);
    for (const slot of course.time_slot) {
      const key = `${course.day_of_week}-${slot}`;
      const list = index.get(key) ?? [];
      list.push(course);
      index.set(key, list);
    }
  }
  index.forEach((list, key) => index.set(key, list.sort(compareCourses)));
  return index;
}

function isConsecutiveSlots(slots: number[]): boolean {
  return slots.every((s, i) => i === 0 || s === slots[i - 1] + 1);
}

function parseSemesterStartDate(v?: string): Date | null {
  if (!v) return null;
  const raw = v.includes('T') ? v.slice(0, 10) : v;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (isNaN(date.getTime()) || date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function formatWeekDayWithDate(label: string, date?: Date | null): string {
  return date ? `${label}（${date.getMonth() + 1}.${date.getDate()}）` : label;
}

function withAlpha(color: string, alpha: number): string {
  const hex = color.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(hex)) return `rgba(255,255,255,${alpha})`;
  const n = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  return `rgba(${parseInt(n.slice(0, 2), 16)}, ${parseInt(n.slice(2, 4), 16)}, ${parseInt(n.slice(4, 6), 16)}, ${alpha})`;
}

function getCourseCardStyle(course: ScheduleCourse, isActive: boolean): React.CSSProperties {
  return isActive
    ? { borderRadius: 10, color: '#fff', overflow: 'hidden', background: withAlpha(course.color, 0.18), border: `1px solid ${withAlpha(course.color, 0.34)}`, boxShadow: 'none' }
    : { borderRadius: 10, color: 'rgba(255,255,255,0.88)', overflow: 'hidden', background: 'rgba(255,255,255,0.03)', border: `1px solid ${withAlpha(course.color, 0.22)}`, boxShadow: 'none', opacity: 0.9 };
}

function getSpanHeight(count: number): number {
  return count * SLOT_ROW_HEIGHT + Math.max(0, count - 1) * TABLE_CELL_GAP;
}

interface SingleScheduleProps {
  owner: string;
  courses: ScheduleCourse[];
  timeSlotConfigs: TimeSlotConfig[];
  currentWeek: number;
  semester: SemesterConfig | null;
  onEdit: (course: ScheduleCourse) => void;
  onAdd: (dayIndex: number, slotKey: number, owner: string) => void;
}

function SingleSchedule({ owner, courses, timeSlotConfigs, currentWeek, semester, onEdit, onAdd }: SingleScheduleProps) {
  const effectiveWeek = owner === 'partner' && semester?.partner_week_offset != null
    ? currentWeek + semester.partner_week_offset
    : currentWeek;
  const slots = getTimeSlotsArray(timeSlotConfigs, owner);
  const maxSlot = slots.length;
  const slotMap = new Map(slots.map((s) => [s.key, s]));
  const scheduleIndex = buildScheduleIndex(courses, maxSlot);

  const weekDayHeaders = React.useMemo(() => {
    const startDate = parseSemesterStartDate(semester?.start_date);
    if (!startDate) return weekDays.map((d) => ({ key: d, label: d }));
    const offset = Math.max(0, effectiveWeek - 1) * 7;
    const weekStart = addDays(startDate, offset);
    return weekDays.map((d, i) => ({ key: d, label: formatWeekDayWithDate(d, addDays(weekStart, i)) }));
  }, [effectiveWeek, semester?.start_date]);

  const getCoursesForSlot = (day: number, slot: number) => scheduleIndex.get(`${day}-${slot}`) ?? [];
  const selectCourse = (list: ScheduleCourse[]) => list.length === 0 ? null : (list.find((c) => isCourseActiveInWeek(c, effectiveWeek)) ?? list[0]);

  const buildRows = () => {
    const rows: React.ReactElement[] = [];
    const rendered = new Set<string>();
    const selected = new Map<string, ScheduleCourse | null>();
    for (let d = 0; d < 7; d++) {
      for (let s = 1; s <= maxSlot; s++) {
        selected.set(`${d}-${s}`, selectCourse(getCoursesForSlot(d, s)));
      }
    }

    for (let sk = 1; sk <= maxSlot; sk++) {
      const cells: React.ReactElement[] = [];
      const slotInfo = slotMap.get(sk);

      cells.push(
        <td key="time" style={{ textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.04)', fontSize: 10, padding: '8px 4px', borderRadius: 8, color: 'rgba(255,255,255,0.78)' }}>
          <div style={{ fontWeight: 700 }}>{slotInfo?.label || `第${sk}节`}</div>
          <div style={{ fontSize: 9, opacity: 0.58, marginTop: 2 }}>{slotInfo?.time || ''}</div>
        </td>
      );

      for (let d = 0; d < 7; d++) {
        const key = `${d}-${sk}`;
        if (rendered.has(key)) continue;
        const course = selected.get(key);

        if (!course) {
          cells.push(
            <td key={d} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', padding: 0, verticalAlign: 'top' }}>
              <div
                style={{ minHeight: EMPTY_SLOT_MIN_HEIGHT, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 2, border: '1px dashed rgba(255,255,255,0.06)', borderRadius: 8, color: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.01)' }}
                onClick={() => onAdd(d, sk, owner)}
              >
                <PlusOutlined style={{ fontSize: 10 }} />
              </div>
            </td>
          );
        } else {
          const isActive = isCourseActiveInWeek(course, effectiveWeek);
          const contiguous: number[] = [];
          for (let ns = sk; ns <= maxSlot; ns++) {
            if (selected.get(`${d}-${ns}`)?.id !== course.id) break;
            contiguous.push(ns);
          }
          contiguous.forEach((s) => rendered.add(`${d}-${s}`));

          cells.push(
            <td key={d} rowSpan={contiguous.length} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', padding: 0, verticalAlign: 'top' }}>
              <div
                style={{ ...getCourseCardStyle(course, isActive), height: getSpanHeight(contiguous.length), boxSizing: 'border-box', padding: '8px 10px 8px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer', position: 'relative' }}
                onClick={() => onEdit(course)}
              >
                <div style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: '0 999px 999px 0', background: isActive ? course.color : 'rgba(255,255,255,0.22)' }} />
                <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{course.name}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {course.location && <div style={{ fontSize: 10, opacity: 0.92 }}>{course.location}</div>}
                  {course.teacher && <div style={{ fontSize: 10, opacity: 0.82 }}>{course.teacher}</div>}
                </div>
              </div>
            </td>
          );
        }
      }

      rows.push(<tr key={sk} style={{ height: SLOT_ROW_HEIGHT }}>{cells}</tr>);
    }
    return rows;
  };

  return (
    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: TABLE_CELL_GAP, tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th style={{ width: 68, padding: '6px 4px', borderBottom: '1px solid #333', background: 'rgba(255,255,255,0.04)', borderRadius: 8, color: 'rgba(255,255,255,0.72)', fontSize: 11 }}>时间</th>
            {weekDayHeaders.map((d) => (
              <th key={d.key} style={{ padding: '6px 4px', borderBottom: '1px solid #333', background: 'rgba(255,255,255,0.04)', borderRadius: 8, color: 'rgba(255,255,255,0.82)', fontWeight: 600, fontSize: 11 }}>{d.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>{buildRows()}</tbody>
      </table>
  );
}

export default function Schedule() {
  const [currentWeek, setCurrentWeek] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<{ dayIndex: number; slotKey: number; owner: string } | null>(null);
  const [editingCourse, setEditingCourse] = useState<ScheduleCourse | null>(null);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [semester, setSemester] = useState<SemesterConfig | null>(null);
  const [allCourses, setAllCourses] = useState<ScheduleCourse[]>([]);
  const [timeSlotConfigs, setTimeSlotConfigs] = useState<TimeSlotConfig[]>([]);
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('me');

  const fetchSemester = async () => {
    try {
      const data = await getCurrentSemester();
      setSemester(data);
      setCurrentWeek(data.current_week || 1);
    } catch { /* ignore */ }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [courses, slots] = await Promise.all([getScheduleCourses(), getTimeSlots()]);
      setAllCourses(courses.map((c) => ({ ...c, owner: c.owner || 'me' })));
      setTimeSlotConfigs(slots);
    } catch {
      message.error('加载课表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSemester(); fetchData(); }, []);

  const meCourses = allCourses.filter((c) => c.owner === 'me');
  const partnerCourses = allCourses.filter((c) => c.owner === 'partner');

  const handleAdd = (dayIndex: number, slotKey: number, owner: string) => {
    const slots = getTimeSlotsArray(timeSlotConfigs, owner);
    const maxSlot = slots.length;
    const timeSlot = normalizeNumberList(slotKey < maxSlot ? [slotKey, slotKey + 1] : [slotKey], 1, maxSlot);
    setEditingCourse(null);
    setEditingCell({ dayIndex, slotKey, owner });
    form.resetFields();
    form.setFieldsValue({
      color: owner === 'partner' ? '#eb2f96' : '#1890ff',
      owner,
      time_slot: timeSlot,
      weeks: [],
    });
    setIsModalOpen(true);
  };

  const handleEdit = (course: ScheduleCourse) => {
    setEditingCourse(course);
    setEditingCell({ dayIndex: course.day_of_week, slotKey: course.time_slot[0] || 1, owner: course.owner || 'me' });
    form.setFieldsValue({
      name: course.name,
      teacher: course.teacher,
      location: course.location,
      color: course.color,
      owner: course.owner || 'me',
      time_slot: course.time_slot,
      weeks: course.weeks,
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCell(null);
    setEditingCourse(null);
    form.resetFields();
  };

  const handleDelete = async (id: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这节课程吗？',
      onOk: async () => {
        try {
          await deleteScheduleCourse(id);
          await fetchData();
          handleCloseModal();
          message.success('删除成功');
        } catch { message.error('删除失败'); }
      },
    });
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (!editingCell) return;
      const { dayIndex, owner } = editingCell;
      const slots = getTimeSlotsArray(timeSlotConfigs, owner);
      const maxSlot = slots.length;
      const colorStr = typeof values.color === 'string' ? values.color : values.color?.toHexString?.() || '#1890ff';
      const timeSlot = normalizeNumberList(values.time_slot, 1, maxSlot);
      const weeks = normalizeNumberList(values.weeks, 1);

      if (timeSlot.length === 0) throw new Error('至少选择一个上课节次');
      if (!isConsecutiveSlots(timeSlot)) throw new Error('上课节次必须连续');

      const courseData: ScheduleCourse = {
        name: values.name,
        teacher: values.teacher,
        location: values.location,
        color: colorStr,
        day_of_week: dayIndex,
        time_slot: weeks.length > 0 ? timeSlot : timeSlot,
        weeks,
        owner: values.owner || owner,
      };

      if (editingCourse?.id) {
        await updateScheduleCourse(editingCourse.id, courseData);
      } else {
        await saveScheduleCourse(courseData);
      }
      await fetchData();
      handleCloseModal();
      message.success(editingCourse?.id ? '更新成功' : '保存成功');
    } catch (error) {
      if (error instanceof Error) message.error(error.message);
    }
  };

  const renderSchedulePanel = (owner: string) => {
    const courses = owner === 'me' ? meCourses : partnerCourses;
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <SingleSchedule
          owner={owner}
          courses={courses}
          timeSlotConfigs={timeSlotConfigs}
          currentWeek={currentWeek}
          semester={semester}
          onEdit={handleEdit}
          onAdd={handleAdd}
        />
      </div>
    );
  };

  return (
    <div>
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        {loading ? (
          <h2 style={{ margin: 0 }}>双人课表</h2>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0 }}>双人课表</h2>
              <Select value={currentWeek} onChange={setCurrentWeek} options={generateWeekOptions(semester?.total_weeks || 26)} style={{ width: 110 }} />
              <Button onClick={() => semester && setCurrentWeek(semester.current_week || 1)}>当前周</Button>
              {semester && <span style={{ color: '#888', fontSize: 12 }}>{semester.name}</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Segmented<OwnerFilter>
                value={ownerFilter}
                onChange={setOwnerFilter}
                options={[
                  { value: 'me', label: '他' },
                  { value: 'partner', label: '她' },
                ]}
                size="small"
              />
              <span style={{ padding: '3px 10px', borderRadius: 999, background: 'rgba(82,196,26,0.14)', border: '1px solid rgba(82,196,26,0.24)', color: 'rgba(255,255,255,0.88)', fontSize: 11 }}>
                第 {currentWeek} 周
              </span>
            </div>
          </>
        )}
      </div>

      {loading ? (
        <Card style={{ minHeight: 420, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" />
        </Card>
      ) : (
        <Card style={{ border: '1px solid #303030', background: 'linear-gradient(180deg, rgba(31,31,31,0.98), rgba(20,20,20,0.96))' }}>
          <div style={{ overflowX: 'auto' }}>
            {renderSchedulePanel(ownerFilter)}
          </div>
        </Card>
      )}

      <Modal
        title={editingCourse ? '编辑课程' : '添加课程'}
        open={isModalOpen}
        onOk={handleSave}
        onCancel={handleCloseModal}
        okText="保存"
        cancelText="取消"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, width: '100%' }}>
            <div>{editingCourse?.id && <Button danger onClick={() => handleDelete(editingCourse.id!)}>删除课程</Button>}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={handleCloseModal}>取消</Button>
              <Button type="primary" onClick={handleSave}>保存</Button>
            </div>
          </div>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="owner" label="谁的课" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'me', label: '他' },
                { value: 'partner', label: '她' },
              ]}
              disabled={!!editingCourse}
            />
          </Form.Item>
          <Form.Item name="name" label="课程名称" rules={[{ required: true, message: '请输入课程名称' }]}>
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
            <Select mode="multiple" placeholder="选择节次" options={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `第${i + 1}节` }))} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="weeks" label="上课周次">
            <Select mode="multiple" placeholder="选择周次" options={generateWeekOptions(semester?.total_weeks || 26)} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
