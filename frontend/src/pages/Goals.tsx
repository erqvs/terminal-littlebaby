import { useEffect, useState } from 'react';
import { Card, Button, Modal, Form, Input, InputNumber, ColorPicker, Space, message, Popconfirm, Row, Col, Progress, DatePicker, Tag } from 'antd';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon } from '../components/Icons';
import dayjs from 'dayjs';
import type { Goal } from '../types';
import { getGoals, createGoal, updateGoal, deleteGoal, reorderGoals } from '../services/api';

const PRESET_COLORS = [
  '#52c41a', '#1890ff', '#722ed1', '#eb2f96', '#fa8c16',
  '#13c2c2', '#faad14', '#2f54eb'
];

export default function Goals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchGoals();
  }, []);

  const fetchGoals = async () => {
    try {
      setLoading(true);
      const data = await getGoals();
      setGoals(data);
    } catch (error) {
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      const color = values.color?.toHexString?.() || values.color || '#52c41a';
      const deadline = values.deadline?.format?.('YYYY-MM-DD') || null;
      const payload = {
        ...values,
        color,
        ...(deadline ? { deadline } : {}),
      };

      if (editingGoal) {
        await updateGoal(editingGoal.id, payload);
        message.success('更新成功');
      } else {
        await createGoal(payload);
        message.success('添加成功');
      }
      setModalVisible(false);
      form.resetFields();
      setEditingGoal(null);
      fetchGoals();
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  const handleEdit = (goal: Goal) => {
    setEditingGoal(goal);
    form.setFieldsValue({
      ...goal,
      deadline: goal.deadline ? dayjs(goal.deadline) : null
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteGoal(id);
      message.success('删除成功');
      fetchGoals();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const orderedGoals = [...goals].sort((left, right) => left.sort_order - right.sort_order || left.id - right.id);
  const goalPositionMap = new Map(orderedGoals.map((goal, index) => [goal.id, index]));

  const handleMoveGoal = async (goalId: number, direction: -1 | 1) => {
    const currentIndex = orderedGoals.findIndex((goal) => goal.id === goalId);
    const nextIndex = currentIndex + direction;

    if (currentIndex === -1 || nextIndex < 0 || nextIndex >= orderedGoals.length) {
      return;
    }

    const nextOrder = [...orderedGoals];
    [nextOrder[currentIndex], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[currentIndex]];

    try {
      const updatedGoals = await reorderGoals(nextOrder.map((goal) => goal.id));
      setGoals(updatedGoals);
      message.success('排序已更新');
    } catch (error: any) {
      message.error(error.message || '更新排序失败');
    }
  };

  const activeGoals = goals.filter(g => !g.is_completed);
  const completedGoals = goals.filter(g => g.is_completed);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>目标追踪</h2>
        <Button type="primary" onClick={() => { setEditingGoal(null); form.resetFields(); setModalVisible(true); }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PlusIcon style={{ width: 14, height: 14 }} />
            添加目标
          </span>
        </Button>
      </div>

      {/* 进行中的目标 */}
      <h3 style={{ marginBottom: 16, color: 'rgba(255,255,255,0.65)' }}>进行中 ({activeGoals.length})</h3>
      <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
        {activeGoals.map(goal => {
          const currentAmount = Number(goal.current_amount);
          const percent = Math.min(Math.max(Number(goal.progress) || 0, 0), 100);
          const remaining = Number(goal.remaining_amount ?? Math.max(Number(goal.target_amount) - currentAmount, 0));
          const daysLeft = goal.deadline ? Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
          const goalPosition = goalPositionMap.get(goal.id) ?? 0;
          const canMoveUp = goalPosition > 0;
          const canMoveDown = goalPosition < orderedGoals.length - 1;
          
          return (
            <Col xs={24} sm={12} md={8} key={goal.id}>
              <Card hoverable>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 8, background: goal.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 'bold', fontSize: 16
                    }}>
                      {goal.name.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500 }}>{goal.name}</div>
                      <Tag color="blue" style={{ marginInlineEnd: 8 }}>
                        第 {goalPosition + 1} 顺位
                      </Tag>
                      {daysLeft !== null && (
                        <Tag color={daysLeft < 30 ? 'red' : daysLeft < 90 ? 'orange' : 'green'}>
                          剩余 {daysLeft} 天
                        </Tag>
                      )}
                    </div>
                  </div>
                  <Space>
                    <span
                      onClick={canMoveUp ? () => handleMoveGoal(goal.id, -1) : undefined}
                      style={{ cursor: canMoveUp ? 'pointer' : 'not-allowed', fontSize: 12, color: '#1890ff', opacity: canMoveUp ? 1 : 0.35 }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <ArrowUpIcon style={{ width: 12, height: 12 }} />
                        上移
                      </span>
                    </span>
                    <span
                      onClick={canMoveDown ? () => handleMoveGoal(goal.id, 1) : undefined}
                      style={{ cursor: canMoveDown ? 'pointer' : 'not-allowed', fontSize: 12, color: '#1890ff', opacity: canMoveDown ? 1 : 0.35 }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <ArrowDownIcon style={{ width: 12, height: 12 }} />
                        下移
                      </span>
                    </span>
                    <span onClick={() => handleEdit(goal)} style={{ cursor: 'pointer', fontSize: 12, color: '#1890ff' }}>编辑</span>
                    <Popconfirm title="确定删除？" onConfirm={() => handleDelete(goal.id)} okText="确定" cancelText="取消">
                      <span style={{ color: '#ff4d4f', cursor: 'pointer', fontSize: 12 }}>删除</span>
                    </Popconfirm>
                  </Space>
                </div>
                
                <Progress 
                  percent={percent} 
                  format={(value) => `${Math.round(value ?? 0)}%`}
                  strokeColor={goal.color}
                  strokeWidth={12}
                  style={{ marginBottom: 8 }}
                />
                
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ color: '#52c41a', fontWeight: 'bold' }}>
                    已完成 ¥{currentAmount.toLocaleString()}
                  </span>
                  <span style={{ color: '#666' }}>目标 ¥{Number(goal.target_amount).toLocaleString()}</span>
                </div>
                
                <div style={{ color: '#666', fontSize: 13, marginBottom: 12 }}>
                  还差 ¥{remaining.toLocaleString()}
                </div>

              </Card>
            </Col>
          );
        })}
      </Row>

      {/* 已完成的目标 */}
      {completedGoals.length > 0 && (
        <>
          <h3 style={{ marginBottom: 16, color: 'rgba(255,255,255,0.65)' }}>已完成 ({completedGoals.length})</h3>
          <Row gutter={[16, 16]}>
            {completedGoals.map(goal => {
              const goalPosition = goalPositionMap.get(goal.id) ?? 0;
              const canMoveUp = goalPosition > 0;
              const canMoveDown = goalPosition < orderedGoals.length - 1;

              return (
              <Col xs={24} sm={12} md={8} key={goal.id}>
                <Card hoverable style={{ opacity: 0.8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 8, background: goal.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontWeight: 'bold', fontSize: 16
                      }}>
                        {goal.name.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500, textDecoration: 'line-through' }}>{goal.name}</div>
                        <Tag color="blue" style={{ marginInlineEnd: 8 }}>
                          第 {goalPosition + 1} 顺位
                        </Tag>
                        <div style={{ color: '#52c41a' }}>¥{Number(goal.target_amount).toLocaleString()}</div>
                      </div>
                    </div>
                    <Space>
                      <span
                        onClick={canMoveUp ? () => handleMoveGoal(goal.id, -1) : undefined}
                        style={{ cursor: canMoveUp ? 'pointer' : 'not-allowed', fontSize: 12, color: '#1890ff', opacity: canMoveUp ? 1 : 0.35 }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <ArrowUpIcon style={{ width: 12, height: 12 }} />
                          上移
                        </span>
                      </span>
                      <span
                        onClick={canMoveDown ? () => handleMoveGoal(goal.id, 1) : undefined}
                        style={{ cursor: canMoveDown ? 'pointer' : 'not-allowed', fontSize: 12, color: '#1890ff', opacity: canMoveDown ? 1 : 0.35 }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <ArrowDownIcon style={{ width: 12, height: 12 }} />
                          下移
                        </span>
                      </span>
                      <Popconfirm title="确定删除？" onConfirm={() => handleDelete(goal.id)} okText="确定" cancelText="取消">
                        <span style={{ color: '#ff4d4f', cursor: 'pointer', fontSize: 12 }}>删除</span>
                      </Popconfirm>
                    </Space>
                  </div>
                </Card>
              </Col>
            )})}
          </Row>
        </>
      )}

      {goals.length === 0 && !loading && (
        <Card style={{ textAlign: 'center', padding: 40, color: '#666' }}>
          暂无目标，点击右上角添加
        </Card>
      )}

      <Modal
        title={editingGoal ? '编辑目标' : '添加目标'}
        open={modalVisible}
        onCancel={() => { setModalVisible(false); setEditingGoal(null); form.resetFields(); }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="目标名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：存款20万、买车基金" />
          </Form.Item>
          <Form.Item name="target_amount" label="目标金额" rules={[{ required: true, message: '请输入目标金额' }]}>
            <InputNumber prefix="¥" precision={0} min={0} style={{ width: '100%' }} />
          </Form.Item>
          <div style={{
            marginTop: -8,
            marginBottom: 16,
            padding: 12,
            borderRadius: 8,
            background: 'rgba(24,144,255,0.08)',
            color: 'rgba(255,255,255,0.65)',
            fontSize: 13,
          }}>
            当前完成金额会按净资产和目标顺位自动计算，这里不再手动填写。
          </div>
          <Form.Item name="deadline" label="截止日期">
            <DatePicker style={{ width: '100%' }} placeholder="可选" />
          </Form.Item>
          <Form.Item name="color" label="颜色" initialValue="#52c41a">
            <ColorPicker presets={[{ label: '预设', colors: PRESET_COLORS }]} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">保存</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
