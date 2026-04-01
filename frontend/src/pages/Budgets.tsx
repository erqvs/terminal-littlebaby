import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, DatePicker, Empty, Form, Input, InputNumber, Modal, Popconfirm, Progress, Row, Select, Space, Statistic, Tag, message } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { BudgetIcon, PlusIcon } from '../components/Icons';
import type { Budget, Category } from '../types';
import { createBudget, deleteBudget, getBudgets, getCategories, updateBudget } from '../services/api';

export default function Budgets() {
  const [selectedMonth, setSelectedMonth] = useState<Dayjs>(dayjs().startOf('month'));
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchBudgets();
  }, [selectedMonth]);

  const fetchCategories = async () => {
    try {
      const data = await getCategories({ kind: 'all', type: 'expense', includeMembers: true });
      setCategories(data);
    } catch (error) {
      message.error('加载分类失败');
    }
  };

  const fetchBudgets = async () => {
    try {
      setLoading(true);
      const data = await getBudgets(selectedMonth.year(), selectedMonth.month() + 1);
      setBudgets(data);
    } catch (error: any) {
      message.error(error.message || '加载预算失败');
    } finally {
      setLoading(false);
    }
  };

  const usedCategoryIds = useMemo(() => {
    return new Set(
      budgets
        .filter((budget) => budget.id !== editingBudget?.id)
        .map((budget) => budget.category_id)
    );
  }, [budgets, editingBudget]);

  const availableCategories = categories.filter((category) => !usedCategoryIds.has(category.id));

  const totals = useMemo(() => {
    return budgets.reduce(
      (acc, budget) => {
        acc.totalBudget += Number(budget.budget_amount);
        acc.totalSpent += Number(budget.actual_spent);
        acc.totalRemaining += Number(budget.remaining_amount);
        return acc;
      },
      { totalBudget: 0, totalSpent: 0, totalRemaining: 0 }
    );
  }, [budgets]);

  const handleOpenCreate = () => {
    setEditingBudget(null);
    form.resetFields();
    form.setFieldsValue({ alert_threshold: 80 });
    setModalVisible(true);
  };

  const handleEdit = (budget: Budget) => {
    setEditingBudget(budget);
    form.setFieldsValue({
      category_id: budget.category_id,
      budget_amount: budget.budget_amount,
      alert_threshold: budget.alert_threshold,
      note: budget.note,
    });
    setModalVisible(true);
  };

  const handleSubmit = async (values: any) => {
    const payload = {
      category_id: values.category_id,
      year: selectedMonth.year(),
      month: selectedMonth.month() + 1,
      budget_amount: values.budget_amount,
      alert_threshold: values.alert_threshold ?? 80,
      note: values.note?.trim() || undefined,
    };

    try {
      if (editingBudget) {
        await updateBudget(editingBudget.id, payload);
        message.success('预算已更新');
      } else {
        await createBudget(payload);
        message.success('预算已创建');
      }

      setModalVisible(false);
      setEditingBudget(null);
      form.resetFields();
      fetchBudgets();
    } catch (error: any) {
      message.error(error.message || '保存预算失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteBudget(id);
      message.success('预算已删除');
      fetchBudgets();
    } catch (error: any) {
      message.error(error.message || '删除预算失败');
    }
  };

  const monthTitle = selectedMonth.format('YYYY 年 M 月');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>预算</h2>
          <div style={{ color: 'rgba(255,255,255,0.45)', marginTop: 6 }}>
            可绑定普通分类或组合分类，已用金额自动来自交易记录。
          </div>
        </div>
        <Space wrap>
          <DatePicker
            picker="month"
            allowClear={false}
            value={selectedMonth}
            onChange={(value) => value && setSelectedMonth(value.startOf('month'))}
          />
          <Button type="primary" onClick={handleOpenCreate}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <PlusIcon style={{ width: 14, height: 14 }} />
              添加预算
            </span>
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title={`${monthTitle}预算总额`}
              value={totals.totalBudget}
              precision={2}
              prefix={<BudgetIcon style={{ color: '#1890ff' }} />}
              suffix="元"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title="已用金额"
              value={totals.totalSpent}
              precision={2}
              suffix="元"
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title="剩余预算"
              value={totals.totalRemaining}
              precision={2}
              suffix="元"
              valueStyle={{ color: totals.totalRemaining >= 0 ? '#52c41a' : '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      {budgets.length === 0 && !loading ? (
        <Card>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={`${monthTitle} 还没有配置预算`}
          >
            <Button type="primary" onClick={handleOpenCreate}>添加第一条预算</Button>
          </Empty>
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {budgets.map((budget) => {
            const progress = Math.min(budget.progress, 100);
            const remainingColor = budget.remaining_amount >= 0 ? '#52c41a' : '#ff4d4f';
            const categoryHint = budget.category_kind === 'group'
              ? `包含：${budget.member_names?.join('、') || '未设置成员分类'}`
              : '按单个普通分类统计';

            return (
              <Col xs={24} lg={12} xl={8} key={budget.id}>
                <Card loading={loading} style={{ height: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12, minHeight: 92 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{budget.category_name}</div>
                      <Space size={[8, 8]} wrap>
                        <Tag color={budget.category_kind === 'group' ? 'cyan' : 'blue'}>
                          {budget.category_kind === 'group' ? '组合分类' : '普通分类'}
                        </Tag>
                        {budget.is_over_budget && <Tag color="red">已超支</Tag>}
                        {!budget.is_over_budget && budget.is_near_limit && <Tag color="orange">接近上限</Tag>}
                        <Tag color="blue">预警 {budget.alert_threshold}% </Tag>
                      </Space>
                      <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.45)', fontSize: 13, minHeight: 20 }}>
                        {categoryHint}
                      </div>
                    </div>
                    <Space size={12}>
                      <span onClick={() => handleEdit(budget)} style={{ cursor: 'pointer', fontSize: 12, color: '#1890ff' }}>编辑</span>
                      <Popconfirm title="确定删除这条预算吗？" onConfirm={() => handleDelete(budget.id)} okText="确定" cancelText="取消">
                        <span style={{ cursor: 'pointer', fontSize: 12, color: '#ff4d4f' }}>删除</span>
                      </Popconfirm>
                    </Space>
                  </div>

                  <Progress
                    percent={progress}
                    format={(value) => `${Math.round(value ?? 0)}%`}
                    strokeColor={budget.is_over_budget ? '#ff4d4f' : budget.is_near_limit ? '#faad14' : '#52c41a'}
                    strokeWidth={12}
                    style={{ marginBottom: 12 }}
                  />

                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'rgba(255,255,255,0.45)' }}>预算金额</span>
                      <span style={{ fontWeight: 600 }}>¥{budget.budget_amount.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'rgba(255,255,255,0.45)' }}>已用金额</span>
                      <span style={{ color: '#ff7875', fontWeight: 600 }}>¥{budget.actual_spent.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'rgba(255,255,255,0.45)' }}>剩余预算</span>
                      <span style={{ color: remainingColor, fontWeight: 600 }}>¥{budget.remaining_amount.toLocaleString()}</span>
                    </div>
                    {budget.note && (
                      <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
                        备注：{budget.note}
                      </div>
                    )}
                  </div>
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      <Modal
        title={editingBudget ? '编辑预算' : '添加预算'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditingBudget(null);
          form.resetFields();
        }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="category_id"
            label="预算口径"
            rules={[{ required: true, message: '请选择分类' }]}
          >
            <Select
              placeholder="选择普通分类或组合分类"
              disabled={editingBudget !== null}
              options={(editingBudget ? categories : availableCategories).map((category) => ({
                value: category.id,
                label: category.kind === 'group' ? `${category.name}（组合）` : category.name,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="budget_amount"
            label="预算金额"
            rules={[{ required: true, message: '请输入预算金额' }]}
          >
            <InputNumber prefix="¥" min={0.01} precision={2} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="alert_threshold"
            label="预警阈值"
            initialValue={80}
          >
            <InputNumber min={0} max={100} precision={0} addonAfter="%" style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="note" label="备注">
            <Input placeholder="例如：聚餐月、控制外卖" maxLength={255} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setModalVisible(false);
                setEditingBudget(null);
                form.resetFields();
              }}>
                取消
              </Button>
              <Button type="primary" htmlType="submit">保存</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
