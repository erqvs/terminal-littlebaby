import { useState, useEffect } from 'react';
import { Card, Select, Button, Table, Modal, Form, Input, ColorPicker, message, Spin } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { getScheduleCourses, saveScheduleCourse, deleteScheduleCourse } from '../services/api';
import type { ScheduleCourse } from '../services/api';

// 时间节次定义
const timeSlots = [
  { key: '1', label: '第1-2节', time: '08:00-09:40' },
  { key: '2', label: '第3-4节', time: '10:00-11:40' },
  { key: '3', label: '第5-6节', time: '14:00-15:40' },
  { key: '4', label: '第7-8节', time: '16:00-17:40' },
  { key: '5', label: '第9-10节', time: '19:00-20:40' },
];

// 星期定义
const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// 单元格数据类型
interface CellData {
  course: {
    id?: number;
    name: string;
    teacher: string;
    location: string;
    color: string;
  } | null;
  weeks: number[];
}

// 表格行数据类型
interface RowData {
  key: string;
  timeSlot: typeof timeSlots[0];
  days: CellData[];
}

// 生成周次选项
const generateWeekOptions = (totalWeeks: number = 20) => {
  return Array.from({ length: totalWeeks }, (_, i) => ({
    value: i + 1,
    label: `第${i + 1}周`,
  }));
};

export default function Schedule() {
  const [currentWeek, setCurrentWeek] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<{ dayIndex: number; slotIndex: number } | null>(null);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);

  // 课表数据
  const [scheduleData, setScheduleData] = useState<CellData[][]>(
    timeSlots.map(() =>
      weekDays.map(() => ({
        course: null,
        weeks: [],
      }))
    )
  );

  // 从后端加载课表数据
  const fetchScheduleData = async () => {
    try {
      setLoading(true);
      const courses = await getScheduleCourses();

      // 初始化空数据
      const newData: CellData[][] = timeSlots.map(() =>
        weekDays.map(() => ({
          course: null,
          weeks: [],
        }))
      );

      // 填充课程数据
      courses.forEach((course) => {
        const { day_of_week, time_slot } = course;
        // time_slot 是 1-5，需要转换为数组索引 0-4
        const slotIndex = time_slot - 1;
        if (slotIndex >= 0 && slotIndex < timeSlots.length && day_of_week >= 0 && day_of_week < weekDays.length) {
          newData[slotIndex][day_of_week] = {
            course: {
              id: course.id,
              name: course.name,
              teacher: course.teacher || '',
              location: course.location || '',
              color: course.color,
            },
            weeks: course.weeks || [],
          };
        }
      });

      setScheduleData(newData);
    } catch (error) {
      message.error('加载课表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScheduleData();
  }, []);

  // 渲染课程单元格
  const renderCourseCell = (cellData: CellData, dayIndex: number, slotIndex: number) => {
    const { course, weeks } = cellData;
    const isActiveInCurrentWeek = weeks.includes(currentWeek);

    if (!course) {
      return (
        <div
          className="empty-cell"
          style={{
            height: '100%',
            minHeight: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            border: '1px dashed #333',
            borderRadius: 4,
            color: '#666',
          }}
          onClick={() => handleAddCourse(dayIndex, slotIndex)}
        >
          <PlusOutlined />
        </div>
      );
    }

    return (
      <div
        style={{
          height: '100%',
          minHeight: 60,
          padding: '8px',
          borderRadius: 4,
          backgroundColor: isActiveInCurrentWeek ? course.color : 'transparent',
          border: isActiveInCurrentWeek ? 'none' : `1px solid ${course.color}`,
          color: isActiveInCurrentWeek ? '#fff' : course.color,
          opacity: isActiveInCurrentWeek ? 1 : 0.5,
          cursor: 'pointer',
          position: 'relative',
        }}
        onClick={() => handleEditCourse(dayIndex, slotIndex, course)}
      >
        <div style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 4 }}>{course.name}</div>
        <div style={{ fontSize: 11, opacity: 0.9 }}>{course.location}</div>
        <div style={{ fontSize: 11, opacity: 0.9 }}>{course.teacher}</div>
        {!isActiveInCurrentWeek && weeks.length > 0 && (
          <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>
            第{weeks[0]}-{weeks[weeks.length - 1]}周
          </div>
        )}
        <div
          style={{ position: 'absolute', top: 4, right: 4 }}
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteCourse(dayIndex, slotIndex);
          }}
        >
          <DeleteOutlined style={{ fontSize: 12, opacity: 0.7 }} />
        </div>
      </div>
    );
  };

  // 添加课程
  const handleAddCourse = (dayIndex: number, slotIndex: number) => {
    setEditingCell({ dayIndex, slotIndex });
    form.resetFields();
    form.setFieldsValue({ color: '#1890ff' });
    setIsModalOpen(true);
  };

  // 编辑课程
  const handleEditCourse = (dayIndex: number, slotIndex: number, course: NonNullable<CellData['course']>) => {
    setEditingCell({ dayIndex, slotIndex });
    const cellData = scheduleData[slotIndex][dayIndex];
    form.setFieldsValue({
      name: course.name,
      teacher: course.teacher,
      location: course.location,
      color: course.color,
      weeks: cellData.weeks,
    });
    setIsModalOpen(true);
  };

  // 删除课程
  const handleDeleteCourse = (dayIndex: number, slotIndex: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这节课程吗？',
      onOk: async () => {
        try {
          // time_slot 在数据库中是 1-5，需要 +1
          await deleteScheduleCourse(dayIndex, slotIndex + 1);
          await fetchScheduleData();
          message.success('删除成功');
        } catch {
          message.error('删除失败');
        }
      },
    });
  };

  // 保存课程
  const handleSaveCourse = async () => {
    try {
      const values = await form.validateFields();
      if (!editingCell) return;

      const { dayIndex, slotIndex } = editingCell;
      const colorValue = values.color;
      const colorString = typeof colorValue === 'string' ? colorValue : colorValue?.toHexString?.() || '#1890ff';

      const courseData: ScheduleCourse = {
        name: values.name,
        teacher: values.teacher,
        location: values.location,
        color: colorString,
        day_of_week: dayIndex,  // 0-6
        time_slot: slotIndex + 1,  // 1-5
        weeks: values.weeks || [currentWeek],
      };

      await saveScheduleCourse(courseData);
      await fetchScheduleData();
      setIsModalOpen(false);
      message.success('保存成功');
    } catch {
      message.error('保存失败');
    }
  };

  // 构建表格数据
  const tableData: RowData[] = timeSlots.map((slot, slotIndex) => ({
    key: slot.key,
    timeSlot: slot,
    days: scheduleData[slotIndex],
  }));

  // 表格列定义
  const columns = [
    {
      title: '时间',
      dataIndex: 'timeSlot',
      key: 'time',
      width: 100,
      fixed: 'left' as const,
      render: (slot: typeof timeSlots[0]) => (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 'bold' }}>{slot.label}</div>
          <div style={{ fontSize: 11, color: '#888' }}>{slot.time}</div>
        </div>
      ),
    },
    ...weekDays.map((day, dayIndex) => ({
      title: day,
      dataIndex: ['days', dayIndex],
      key: day,
      width: 130,
      render: (cellData: CellData, _record: RowData, slotIndex: number) =>
        renderCourseCell(cellData, dayIndex, slotIndex),
    })),
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      {/* 顶部：周次选择器 */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
        <h2 style={{ margin: 0 }}>我的课表</h2>
        <Select
          value={currentWeek}
          onChange={setCurrentWeek}
          options={generateWeekOptions()}
          style={{ width: 120 }}
        />
        <Button onClick={() => setCurrentWeek(Math.ceil(new Date().getDate() / 7))}>
          当前周
        </Button>
      </div>

      {/* 课表主体 */}
      <Card>
        <Table
          columns={columns}
          dataSource={tableData}
          rowKey="key"
          pagination={false}
          showHeader={true}
          bordered
          size="small"
          scroll={{ x: 'max-content' }}
        />
      </Card>

      {/* 添加/编辑课程弹窗 */}
      <Modal
        title={editingCell ? '编辑课程' : '添加课程'}
        open={isModalOpen}
        onOk={handleSaveCourse}
        onCancel={() => setIsModalOpen(false)}
        okText="保存"
        cancelText="取消"
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
          <Form.Item name="weeks" label="上课周次">
            <Select
              mode="multiple"
              placeholder="选择周次"
              options={generateWeekOptions()}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
