import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Checkbox, Col, Empty, Input, Popconfirm, Row, Segmented, Space, Statistic, Tag, Typography, message } from 'antd';
import dayjs from 'dayjs';

type TaskFilter = 'all' | 'pending' | 'completed';

type PersonalTask = {
  id: string;
  title: string;
  note: string;
  completed: boolean;
  createdAt: string;
  completedAt: string | null;
};

const TASK_STORAGE_KEY = 'terminal-littlebaby.personal.task-list.v1';

function readStoredTasks(): PersonalTask[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(TASK_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is PersonalTask => (
        item &&
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        typeof item.note === 'string' &&
        typeof item.completed === 'boolean' &&
        typeof item.createdAt === 'string' &&
        (typeof item.completedAt === 'string' || item.completedAt === null)
      ))
      .sort((a, b) => {
        if (a.completed !== b.completed) {
          return Number(a.completed) - Number(b.completed);
        }

        return dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf();
      });
  } catch {
    return [];
  }
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '';
  }

  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : value;
}

function createTaskId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function Tasks() {
  const [tasks, setTasks] = useState<PersonalTask[]>(() => readStoredTasks());
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState<TaskFilter>('pending');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  const summary = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((item) => item.completed).length;
    const pending = total - completed;

    return { total, pending, completed };
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    return tasks.filter((item) => {
      if (filter === 'pending') {
        return !item.completed;
      }

      if (filter === 'completed') {
        return item.completed;
      }

      return true;
    });
  }, [filter, tasks]);

  const handleAddTask = () => {
    const nextTitle = title.trim();
    const nextNote = note.trim();

    if (!nextTitle) {
      message.warning('先写一条任务标题');
      return;
    }

    const nextTask: PersonalTask = {
      id: createTaskId(),
      title: nextTitle,
      note: nextNote,
      completed: false,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    setTasks((current) => [nextTask, ...current]);
    setTitle('');
    setNote('');
    setFilter('pending');
    message.success('任务已加入清单');
  };

  const handleToggleTask = (taskId: string) => {
    setTasks((current) => current.map((item) => {
      if (item.id !== taskId) {
        return item;
      }

      const completed = !item.completed;

      return {
        ...item,
        completed,
        completedAt: completed ? new Date().toISOString() : null,
      };
    }));
  };

  const handleDeleteTask = (taskId: string) => {
    setTasks((current) => current.filter((item) => item.id !== taskId));
    message.success('任务已删除');
  };

  const handleClearCompleted = () => {
    setTasks((current) => current.filter((item) => !item.completed));
    message.success('已清空完成项');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>任务清单</h2>
          <div style={{ color: 'rgba(255,255,255,0.45)', marginTop: 6 }}>
            个人待办入口，当前保存在本浏览器，适合先记事和快速整理。
          </div>
        </div>
        <Space wrap>
          <Tag color="blue">个人</Tag>
          <Button danger disabled={summary.completed === 0} onClick={handleClearCompleted}>
            清空已完成
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="全部任务" value={summary.total} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="待处理" value={summary.pending} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="已完成" value={summary.completed} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 8 }}>
              新建任务
            </div>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
              先写标题，备注可选。适合日常提醒、零碎待办和想法收集。
            </div>
          </div>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onPressEnter={handleAddTask}
            placeholder="例如：整理 4 月账单分类"
            maxLength={80}
          />
          <Input.TextArea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="补充上下文、截止时间或注意事项（可选）"
            autoSize={{ minRows: 3, maxRows: 5 }}
            maxLength={240}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="primary" onClick={handleAddTask}>
              添加到清单
            </Button>
          </div>
        </Space>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
              列表
            </div>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 6 }}>
              已按未完成优先排列。
            </div>
          </div>
          <Segmented
            value={filter}
            onChange={(value) => setFilter(value as TaskFilter)}
            options={[
              { label: '待处理', value: 'pending' },
              { label: '全部', value: 'all' },
              { label: '已完成', value: 'completed' },
            ]}
          />
        </div>

        {visibleTasks.length === 0 ? (
          <Empty
            description={
              <Typography.Text style={{ color: 'rgba(255,255,255,0.45)' }}>
                {tasks.length === 0 ? '还没有任务，先添加一条。' : '当前筛选下没有任务。'}
              </Typography.Text>
            }
          />
        ) : (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {visibleTasks.map((task) => (
              <Card
                key={task.id}
                size="small"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  borderColor: 'rgba(255,255,255,0.08)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 280 }}>
                    <Checkbox checked={task.completed} onChange={() => handleToggleTask(task.id)} style={{ marginTop: 2 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                        <span
                          style={{
                            fontSize: 15,
                            fontWeight: 600,
                            color: task.completed ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.88)',
                            textDecoration: task.completed ? 'line-through' : 'none',
                            wordBreak: 'break-word',
                          }}
                        >
                          {task.title}
                        </span>
                        <Tag color={task.completed ? 'default' : 'blue'}>
                          {task.completed ? '已完成' : '待处理'}
                        </Tag>
                      </div>
                      {task.note && (
                        <div style={{ color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {task.note}
                        </div>
                      )}
                      <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 10 }}>
                        创建于 {formatDateTime(task.createdAt)}
                        {task.completedAt ? ` · 完成于 ${formatDateTime(task.completedAt)}` : ''}
                      </div>
                    </div>
                  </div>
                  <Space wrap>
                    <Button type="text" onClick={() => handleToggleTask(task.id)}>
                      {task.completed ? '恢复' : '完成'}
                    </Button>
                    <Popconfirm
                      title="确定删除这条任务吗？"
                      okText="删除"
                      cancelText="取消"
                      onConfirm={() => handleDeleteTask(task.id)}
                    >
                      <Button type="text" danger>
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                </div>
              </Card>
            ))}
          </Space>
        )}
      </Card>
    </div>
  );
}
