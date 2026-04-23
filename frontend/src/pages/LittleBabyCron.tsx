import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Drawer, Empty, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Spin, Switch, Table, Tag, Typography, message } from 'antd';
import dayjs from 'dayjs';
import type { LittleBabyCronJob, LittleBabyCronRuns, LittleBabyCronStatus } from '../types';
import { PlusIcon } from '../components/Icons';
import {
  createLittleBabyCronJob,
  deleteLittleBabyCronJob,
  disableLittleBabyCronJob,
  enableLittleBabyCronJob,
  getLittleBabyCronJobs,
  getLittleBabyCronRuns,
  getLittleBabyCronStatus,
  runLittleBabyCronJob,
  updateLittleBabyCronJob,
} from '../services/api';

const WEEKDAY_OPTIONS = [
  { value: '1', label: '周一' },
  { value: '2', label: '周二' },
  { value: '3', label: '周三' },
  { value: '4', label: '周四' },
  { value: '5', label: '周五' },
  { value: '6', label: '周六' },
  { value: '0', label: '周日' },
];

const WEEKDAY_LABELS: Record<string, string> = Object.fromEntries(
  WEEKDAY_OPTIONS.map((item) => [item.value, item.label])
);

const SCHEDULE_MODE_OPTIONS = [
  { value: 'daily', label: '每天固定时间' },
  { value: 'weekdays', label: '工作日固定时间' },
  { value: 'weekly', label: '每周固定一天' },
  { value: 'monthly', label: '每月固定日期' },
  { value: 'interval', label: '固定间隔' },
  { value: 'once', label: '只执行一次' },
  { value: 'custom', label: '自定义 Cron' },
];

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function formatTimeOfDay(hour: number, minute: number) {
  return `${pad(hour)}:${pad(minute)}`;
}

function normalizeDateTimeLocal(value?: string | number) {
  if (!value) {
    return dayjs().add(1, 'hour').second(0).millisecond(0).format('YYYY-MM-DDTHH:mm');
  }

  const parsed = dayjs(value);
  if (parsed.isValid()) {
    return parsed.format('YYYY-MM-DDTHH:mm');
  }

  return String(value).slice(0, 16);
}

function formatEveryLabel(everyMs?: number) {
  if (!everyMs) {
    return '固定间隔';
  }

  if (everyMs % 86400000 === 0) {
    return `每 ${everyMs / 86400000} 天`;
  }

  if (everyMs % 3600000 === 0) {
    return `每 ${everyMs / 3600000} 小时`;
  }

  if (everyMs % 60000 === 0) {
    return `每 ${everyMs / 60000} 分钟`;
  }

  return `每 ${Math.round(everyMs / 1000)} 秒`;
}

function parseCronSchedule(cron: string) {
  const trimmed = cron.trim();

  let match = trimmed.match(/^(\d{1,2}) (\d{1,2}) \* \* \*$/);
  if (match) {
    const minute = Number(match[1]);
    const hour = Number(match[2]);
    const timeOfDay = formatTimeOfDay(hour, minute);
    return {
      mode: 'daily',
      timeOfDay,
      label: `每天 ${timeOfDay}`,
    };
  }

  match = trimmed.match(/^(\d{1,2}) (\d{1,2}) \* \* 1-5$/);
  if (match) {
    const minute = Number(match[1]);
    const hour = Number(match[2]);
    const timeOfDay = formatTimeOfDay(hour, minute);
    return {
      mode: 'weekdays',
      timeOfDay,
      label: `工作日 ${timeOfDay}`,
    };
  }

  match = trimmed.match(/^(\d{1,2}) (\d{1,2}) \* \* ([0-7])$/);
  if (match) {
    const minute = Number(match[1]);
    const hour = Number(match[2]);
    const weekday = match[3] === '7' ? '0' : match[3];
    const timeOfDay = formatTimeOfDay(hour, minute);
    return {
      mode: 'weekly',
      weekday,
      timeOfDay,
      label: `每${WEEKDAY_LABELS[weekday] || '周'} ${timeOfDay}`,
    };
  }

  match = trimmed.match(/^(\d{1,2}) (\d{1,2}) (\d{1,2}) \* \*$/);
  if (match) {
    const minute = Number(match[1]);
    const hour = Number(match[2]);
    const dayOfMonth = Number(match[3]);
    const timeOfDay = formatTimeOfDay(hour, minute);
    return {
      mode: 'monthly',
      dayOfMonth,
      timeOfDay,
      label: `每月 ${dayOfMonth} 号 ${timeOfDay}`,
    };
  }

  return null;
}

function formatSchedule(job: LittleBabyCronJob) {
  if (job.schedule.kind === 'every') {
    return formatEveryLabel(job.schedule.everyMs);
  }

  if (job.schedule.kind === 'at') {
    const atValue = job.schedule.at || (job.schedule.atMs ? dayjs(job.schedule.atMs).format('YYYY-MM-DD HH:mm') : '');
    return `只执行一次 · ${atValue}`;
  }

  if (job.schedule.kind === 'cron') {
    const cronExpression = job.schedule.cron || job.schedule.expr || '';
    const parsed = parseCronSchedule(cronExpression);
    if (parsed) {
      return `${parsed.label}${job.schedule.tz ? ` · ${job.schedule.tz}` : ''}`;
    }

    return `自定义 Cron · ${cronExpression}${job.schedule.tz ? ` · ${job.schedule.tz}` : ''}`;
  }

  return '-';
}

function inferScheduleFormValues(job: LittleBabyCronJob) {
  const tz = job.schedule.tz || 'Asia/Shanghai';

  if (job.schedule.kind === 'every') {
    const everyMs = job.schedule.everyMs || 0;
    if (everyMs % 86400000 === 0) {
      return {
        scheduleMode: 'interval',
        intervalCount: everyMs / 86400000,
        intervalUnit: 'd',
        tz,
      };
    }

    if (everyMs % 3600000 === 0) {
      return {
        scheduleMode: 'interval',
        intervalCount: everyMs / 3600000,
        intervalUnit: 'h',
        tz,
      };
    }

    return {
      scheduleMode: 'interval',
      intervalCount: Math.max(1, Math.round(everyMs / 60000)),
      intervalUnit: 'm',
      tz,
    };
  }

  if (job.schedule.kind === 'at') {
    return {
      scheduleMode: 'once',
      oneTimeAt: normalizeDateTimeLocal(job.schedule.at || job.schedule.atMs),
      tz,
    };
  }

  if (job.schedule.kind === 'cron') {
    const cronExpression = job.schedule.cron || job.schedule.expr || '';
    const parsed = parseCronSchedule(cronExpression);
    if (parsed?.mode === 'daily' || parsed?.mode === 'weekdays') {
      return {
        scheduleMode: parsed.mode,
        timeOfDay: parsed.timeOfDay,
        tz,
      };
    }

    if (parsed?.mode === 'weekly') {
      return {
        scheduleMode: 'weekly',
        weekday: parsed.weekday,
        timeOfDay: parsed.timeOfDay,
        tz,
      };
    }

    if (parsed?.mode === 'monthly') {
      return {
        scheduleMode: 'monthly',
        dayOfMonth: parsed.dayOfMonth,
        timeOfDay: parsed.timeOfDay,
        tz,
      };
    }

    return {
      scheduleMode: 'custom',
      cronExpression,
      tz,
    };
  }

  return {
    scheduleMode: 'daily',
    timeOfDay: '09:00',
    tz,
  };
}

function getScheduleModeHint(mode: string) {
  if (mode === 'daily') {
    return '例如每天早上 9 点执行一次。';
  }
  if (mode === 'weekdays') {
    return '只会在周一到周五执行，适合上课提醒或工作日汇总。';
  }
  if (mode === 'weekly') {
    return '每周固定一天固定时间执行。';
  }
  if (mode === 'monthly') {
    return '适合每月预算提醒、月结或固定复盘。';
  }
  if (mode === 'interval') {
    return '按固定间隔循环执行，适合轮询类任务。';
  }
  if (mode === 'once') {
    return '只会在指定时间执行一次。';
  }
  return '适合复杂规则，格式是 分 时 日 月 周，例如 0 9 * * * 表示每天 09:00。';
}

export default function LittleBabyCron() {
  const [status, setStatus] = useState<LittleBabyCronStatus | null>(null);
  const [jobs, setJobs] = useState<LittleBabyCronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingJob, setEditingJob] = useState<LittleBabyCronJob | null>(null);
  const [runsVisible, setRunsVisible] = useState(false);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runs, setRuns] = useState<LittleBabyCronRuns['entries']>([]);
  const [selectedJobName, setSelectedJobName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchData();
  }, []);

  const payloadKind = Form.useWatch('payloadKind', form) || 'message';
  const scheduleMode = Form.useWatch('scheduleMode', form) || 'daily';
  const announce = Form.useWatch('announce', form);
  const visibleScheduleModeOptions = useMemo(
    () => (editingJob && scheduleMode === 'custom'
      ? SCHEDULE_MODE_OPTIONS
      : SCHEDULE_MODE_OPTIONS.filter((item) => item.value !== 'custom')),
    [editingJob, scheduleMode]
  );

  const nextWakeText = useMemo(() => {
    if (!status?.nextWakeAtMs) {
      return '暂无下一次唤醒时间';
    }
    return dayjs(status.nextWakeAtMs).format('YYYY-MM-DD HH:mm:ss');
  }, [status]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statusData, jobsData] = await Promise.all([
        getLittleBabyCronStatus(),
        getLittleBabyCronJobs(),
      ]);
      setStatus(statusData);
      setJobs(jobsData.jobs || []);
    } catch (error: any) {
      message.error(error.message || '加载 LittleBaby 定时任务失败');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingJob(null);
    form.resetFields();
    form.setFieldsValue({
      scheduleMode: 'daily',
      timeOfDay: '09:00',
      weekday: '1',
      dayOfMonth: 1,
      intervalCount: 1,
      intervalUnit: 'h',
      oneTimeAt: normalizeDateTimeLocal(),
      cronExpression: '0 9 * * *',
      tz: 'Asia/Shanghai',
      payloadKind: 'message',
      announce: false,
      disabled: false,
    });
    setModalVisible(true);
  };

  const openEditModal = (job: LittleBabyCronJob) => {
    setEditingJob(job);
    form.setFieldsValue({
      name: job.name,
      description: job.description,
      ...inferScheduleFormValues(job),
      payloadKind: job.payload.kind === 'systemEvent' ? 'systemEvent' : 'message',
      payloadText: job.payload.text,
      announce: false,
    });
    setModalVisible(true);
  };

  const handleSubmit = async (values: any) => {
    const payload: Record<string, unknown> = {
      name: values.name,
      description: values.description || undefined,
      scheduleMode: values.scheduleMode,
      payloadKind: values.payloadKind,
      payloadText: values.payloadText,
    };

    if (values.scheduleMode === 'daily' || values.scheduleMode === 'weekdays') {
      payload.timeOfDay = values.timeOfDay;
      payload.tz = values.tz || 'Asia/Shanghai';
    }

    if (values.scheduleMode === 'weekly') {
      payload.weekday = values.weekday;
      payload.timeOfDay = values.timeOfDay;
      payload.tz = values.tz || 'Asia/Shanghai';
    }

    if (values.scheduleMode === 'monthly') {
      payload.dayOfMonth = values.dayOfMonth;
      payload.timeOfDay = values.timeOfDay;
      payload.tz = values.tz || 'Asia/Shanghai';
    }

    if (values.scheduleMode === 'interval') {
      payload.intervalCount = values.intervalCount;
      payload.intervalUnit = values.intervalUnit;
    }

    if (values.scheduleMode === 'once') {
      payload.oneTimeAt = values.oneTimeAt;
      payload.tz = values.tz || 'Asia/Shanghai';
    }

    if (values.scheduleMode === 'custom') {
      payload.cronExpression = values.cronExpression;
      payload.tz = values.tz || 'Asia/Shanghai';
    }

    if (values.payloadKind === 'message') {
      payload.sessionTarget = 'main';
      payload.announce = Boolean(values.announce);
    }

    if (!editingJob) {
      payload.disabled = Boolean(values.disabled);
    }

    try {
      setSubmitting(true);
      if (editingJob) {
        await updateLittleBabyCronJob(editingJob.id, payload);
        message.success('定时任务已更新');
      } else {
        await createLittleBabyCronJob(payload);
        message.success('定时任务已创建');
      }
      setModalVisible(false);
      setEditingJob(null);
      form.resetFields();
      fetchData();
    } catch (error: any) {
      message.error(error.message || '保存定时任务失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (job: LittleBabyCronJob, enabled: boolean) => {
    try {
      if (enabled) {
        await enableLittleBabyCronJob(job.id);
      } else {
        await disableLittleBabyCronJob(job.id);
      }
      message.success(enabled ? '任务已启用' : '任务已停用');
      fetchData();
    } catch (error: any) {
      message.error(error.message || '修改状态失败');
    }
  };

  const handleRun = async (job: LittleBabyCronJob) => {
    try {
      await runLittleBabyCronJob(job.id);
      message.success('任务已提交执行');
    } catch (error: any) {
      message.error(error.message || '执行任务失败');
    }
  };

  const handleDelete = async (job: LittleBabyCronJob) => {
    try {
      await deleteLittleBabyCronJob(job.id);
      message.success('任务已删除');
      fetchData();
    } catch (error: any) {
      message.error(error.message || '删除任务失败');
    }
  };

  const handleOpenRuns = async (job: LittleBabyCronJob) => {
    try {
      setRunsVisible(true);
      setRunsLoading(true);
      setSelectedJobName(job.name);
      const data = await getLittleBabyCronRuns(job.id);
      setRuns(data.entries || []);
    } catch (error: any) {
      message.error(error.message || '加载运行记录失败');
    } finally {
      setRunsLoading(false);
    }
  };

  const columns = [
    {
      title: '任务',
      dataIndex: 'name',
      key: 'name',
      render: (_: unknown, record: LittleBabyCronJob) => (
        <div>
          <div style={{ fontWeight: 600 }}>{record.name}</div>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
            {record.payload.kind === 'message' ? 'Agent Message' : 'System Event'}
          </div>
        </div>
      ),
    },
    {
      title: '调度',
      key: 'schedule',
      render: (_: unknown, record: LittleBabyCronJob) => (
        <div>
          <div>{formatSchedule(record)}</div>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
            更新时间：{dayjs(record.updatedAtMs).format('MM-DD HH:mm')}
          </div>
        </div>
      ),
    },
    {
      title: '内容',
      dataIndex: 'payload',
      key: 'payload',
      render: (payload: LittleBabyCronJob['payload']) => (
        <Typography.Paragraph
          ellipsis={{ rows: 2, expandable: false }}
          style={{ marginBottom: 0, maxWidth: 320 }}
        >
          {payload.text}
        </Typography.Paragraph>
      ),
    },
    {
      title: '状态',
      key: 'enabled',
      width: 120,
      render: (_: unknown, record: LittleBabyCronJob) => (
        <Switch checked={record.enabled} onChange={(checked) => handleToggle(record, checked)} />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 240,
      render: (_: unknown, record: LittleBabyCronJob) => (
        <Space size={12} wrap>
          <Button size="small" onClick={() => handleRun(record)}>立即运行</Button>
          <Button size="small" onClick={() => openEditModal(record)}>编辑</Button>
          <Button size="small" onClick={() => handleOpenRuns(record)}>记录</Button>
          <Popconfirm title="确定删除这个定时任务吗？" onConfirm={() => handleDelete(record)} okText="确定" cancelText="取消">
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>定时任务</h2>
          <div style={{ color: 'rgba(255,255,255,0.45)', marginTop: 6 }}>
            当前管理 LittleBaby {status?.target || 'custom'} 实例的 cron 任务。
          </div>
        </div>
        <Button type="primary" onClick={openCreateModal}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PlusIcon style={{ width: 14, height: 14 }} />
            新建任务
          </span>
        </Button>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={8}>
          <Card>
            {status ? (
              <>
                <div style={{ color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>调度器状态</div>
                <Tag color={status.enabled ? 'green' : 'red'}>
                  {status.enabled ? '已启用' : '未启用'}
                </Tag>
              </>
            ) : (
              <Spin />
            )}
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <div style={{ color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>任务数量</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{status?.jobs ?? 0}</div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <div style={{ color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>下一次唤醒</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{nextWakeText}</div>
          </Card>
        </Col>
      </Row>

      <Card>
        {jobs.length === 0 && !loading ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="还没有任何 LittleBaby 定时任务"
          >
            <Button type="primary" onClick={openCreateModal}>创建第一条任务</Button>
          </Empty>
        ) : (
          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={jobs}
            pagination={false}
          />
        )}
      </Card>

      <Modal
        title={editingJob ? '编辑定时任务' : '新建定时任务'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditingJob(null);
          form.resetFields();
        }}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}>
            <Input placeholder="例如：早晨课表提醒" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <Input placeholder="可选" />
          </Form.Item>

          <Form.Item name="scheduleMode" label="什么时候执行" rules={[{ required: true, message: '请选择执行方式' }]}>
            <Select options={visibleScheduleModeOptions} />
          </Form.Item>

          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: -8, marginBottom: 16 }}>
            {getScheduleModeHint(scheduleMode)}
          </div>

          <Form.Item name="tz" hidden>
            <Input />
          </Form.Item>

          <Form.Item name="payloadKind" hidden>
            <Input />
          </Form.Item>

          {scheduleMode === 'daily' && (
            <Form.Item name="timeOfDay" label="执行时间" rules={[{ required: true, message: '请选择执行时间' }]}>
              <Input type="time" />
            </Form.Item>
          )}

          {scheduleMode === 'weekdays' && (
            <Form.Item name="timeOfDay" label="执行时间" rules={[{ required: true, message: '请选择执行时间' }]}>
              <Input type="time" />
            </Form.Item>
          )}

          {scheduleMode === 'weekly' && (
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="weekday" label="星期几" rules={[{ required: true, message: '请选择星期几' }]}>
                  <Select options={WEEKDAY_OPTIONS} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="timeOfDay" label="执行时间" rules={[{ required: true, message: '请选择执行时间' }]}>
                  <Input type="time" />
                </Form.Item>
              </Col>
            </Row>
          )}

          {scheduleMode === 'monthly' && (
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="dayOfMonth" label="每月几号" rules={[{ required: true, message: '请输入每月日期' }]}>
                  <InputNumber min={1} max={31} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="timeOfDay" label="执行时间" rules={[{ required: true, message: '请选择执行时间' }]}>
                  <Input type="time" />
                </Form.Item>
              </Col>
            </Row>
          )}

          {scheduleMode === 'interval' && (
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="intervalCount" label="间隔数值" rules={[{ required: true, message: '请输入间隔数值' }]}>
                  <InputNumber min={1} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="intervalUnit" label="时间单位" rules={[{ required: true, message: '请选择时间单位' }]}>
                  <Select
                    options={[
                      { value: 'm', label: '分钟' },
                      { value: 'h', label: '小时' },
                      { value: 'd', label: '天' },
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>
          )}

          {scheduleMode === 'once' && (
            <Form.Item name="oneTimeAt" label="执行时间" rules={[{ required: true, message: '请选择执行时间' }]}>
              <Input type="datetime-local" />
            </Form.Item>
          )}

          {scheduleMode === 'custom' && (
            <Form.Item name="cronExpression" label="Cron 表达式" rules={[{ required: true, message: '请输入 Cron 表达式' }]}>
              <Input placeholder="例如：0 9 * * *" />
            </Form.Item>
          )}

          <Form.Item
            name="payloadText"
            label="任务内容"
            rules={[{ required: true, message: '请输入任务内容' }]}
          >
            <Input.TextArea rows={4} placeholder="例如：每天 9 点总结今天的课表并生成提醒。" />
          </Form.Item>

          {payloadKind === 'message' && (
            <>
              <Form.Item name="announce" label="发送摘要到聊天" valuePropName="checked">
                <Switch />
              </Form.Item>

              {!announce && (
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: -8, marginBottom: 16 }}>
                  默认只在 LittleBaby 内部执行，不主动往聊天渠道发总结。
                </div>
              )}
            </>
          )}

          {!editingJob && (
            <Form.Item name="disabled" label="创建后先禁用" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setModalVisible(false);
                setEditingJob(null);
                form.resetFields();
              }}>
                取消
              </Button>
              <Button type="primary" htmlType="submit" loading={submitting}>
                保存
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={`${selectedJobName} · 运行记录`}
        open={runsVisible}
        width={520}
        onClose={() => {
          setRunsVisible(false);
          setRuns([]);
          setSelectedJobName('');
        }}
      >
        {runsLoading ? (
          <Spin />
        ) : runs.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无运行记录" />
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {runs.map((entry, index) => (
              <Card size="small" key={entry.runId || `${entry.startedAtMs}-${index}`}>
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ color: 'rgba(255,255,255,0.45)' }}>开始时间</span>
                    <span>{entry.startedAtMs ? dayjs(entry.startedAtMs).format('YYYY-MM-DD HH:mm:ss') : '-'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ color: 'rgba(255,255,255,0.45)' }}>结果</span>
                    <Tag color={entry.ok ? 'green' : entry.skipped ? 'orange' : 'red'}>
                      {entry.ok ? '成功' : entry.skipped ? '跳过' : '失败'}
                    </Tag>
                  </div>
                  {entry.error && (
                    <div style={{ color: '#ff7875', whiteSpace: 'pre-wrap' }}>{entry.error}</div>
                  )}
                  {entry.summary && (
                    <div style={{ color: 'rgba(255,255,255,0.65)', whiteSpace: 'pre-wrap' }}>{entry.summary}</div>
                  )}
                </Space>
              </Card>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}
