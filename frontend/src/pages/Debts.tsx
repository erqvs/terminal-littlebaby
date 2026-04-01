import { useEffect, useState } from 'react';
import { Card, Button, Modal, Form, Input, InputNumber, ColorPicker, Space, message, Popconfirm, Row, Col, Progress } from 'antd';
import { PlusIcon } from '../components/Icons';
import type { Account } from '../types';
import { getAccounts, createAccount, updateAccount, deleteAccount } from '../services/api';
import {
  getDebtAvailableAmount,
  getDebtLimitAmount,
  getDebtOverLimitAmount,
  getDebtUsagePercent,
  getDebtUsedAmount,
  getDebtUsedAmountFromAvailable,
} from '../utils/debts';

const PRESET_COLORS = [
  '#ff4d4f', '#fa8c16', '#eb2f96', '#722ed1', '#1890ff',
  '#13c2c2', '#faad14', '#52c41a'
];

export default function Debts() {
  const [debts, setDebts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Account | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchDebts();
  }, []);

  const fetchDebts = async () => {
    try {
      setLoading(true);
      const data = await getAccounts('debt'); // 只获取负债账户
      setDebts(data);
    } catch (error) {
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      const color = values.color?.toHexString?.() || values.color || '#ff4d4f';
      const limitAmount = Number(values.limit_amount || 0);
      const availableAmount = Number(values.available_amount || 0);

      if (limitAmount <= 0 && availableAmount > 0) {
        message.error('要填写可用金额，必须先设置总额度');
        return;
      }

      if (availableAmount > limitAmount) {
        message.error('可用金额不能大于总额度');
        return;
      }

      const usedAmount = getDebtUsedAmountFromAvailable(limitAmount, availableAmount);

      if (editingDebt) {
        await updateAccount(editingDebt.id, {
          name: values.name,
          color,
          balance: usedAmount,
          limit_amount: limitAmount,
          repayment_day: values.repayment_day,
          type: 'debt',
        });
        message.success('更新成功');
      } else {
        await createAccount({
          name: values.name,
          type: 'debt',
          color,
          balance: usedAmount,
          limit_amount: limitAmount,
          repayment_day: values.repayment_day || 1,
        });
        message.success('添加成功');
      }
      setModalVisible(false);
      form.resetFields();
      setEditingDebt(null);
      fetchDebts();
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  const handleEdit = (debt: Account) => {
    setEditingDebt(debt);
    form.setFieldsValue({
      ...debt,
      available_amount: getDebtAvailableAmount(debt),
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteAccount(id);
      message.success('删除成功');
      fetchDebts();
    } catch (error: any) {
      message.error(error.message || '删除失败');
    }
  };

  const handleUpdateAvailable = async (debt: Account, delta: number) => {
    const limitAmount = getDebtLimitAmount(debt);
    if (limitAmount <= 0) {
      message.error('请先设置总额度，再调整可用金额');
      return;
    }

    const nextAvailable = Math.min(limitAmount, Math.max(0, getDebtAvailableAmount(debt) + delta));
    const nextUsedAmount = getDebtUsedAmountFromAvailable(limitAmount, nextAvailable);

    try {
      await updateAccount(debt.id, { balance: nextUsedAmount });
      fetchDebts();
    } catch (error: any) {
      message.error(error.message || '更新失败');
    }
  };

  const totalDebt = debts.reduce((sum, d) => sum + getDebtUsedAmount(d), 0);
  const totalLimit = debts.reduce((sum, d) => sum + getDebtLimitAmount(d), 0);
  const totalAvailable = debts.reduce((sum, d) => sum + getDebtAvailableAmount(d), 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>负债账户</h2>
        <Button type="primary" danger onClick={() => { setEditingDebt(null); form.resetFields(); setModalVisible(true); }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PlusIcon style={{ width: 14, height: 14 }} />
            添加负债
          </span>
        </Button>
      </div>

      {/* 总览卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12}>
          <Card>
            <div style={{ color: 'rgba(255,255,255,0.65)', marginBottom: 8 }}>总负债</div>
            <div style={{ fontSize: 28, fontWeight: 'bold', color: '#ff4d4f' }}>
              ¥{totalDebt.toLocaleString()}
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card>
            <div style={{ color: 'rgba(255,255,255,0.65)', marginBottom: 8 }}>总可用额度</div>
            <div style={{ fontSize: 28, fontWeight: 'bold', color: '#1890ff' }}>
              ¥{totalAvailable.toLocaleString()}
            </div>
            <div style={{ color: '#666', fontSize: 12, marginTop: 8 }}>
              总额度 ¥{totalLimit.toLocaleString()}
            </div>
          </Card>
        </Col>
      </Row>

      {/* 负债列表 */}
      <Row gutter={[16, 16]}>
        {debts.map(debt => {
          const usage = getDebtUsagePercent(debt);
          const availableAmount = getDebtAvailableAmount(debt);
          const usedAmount = getDebtUsedAmount(debt);
          const limitAmount = getDebtLimitAmount(debt);
          const overLimitAmount = getDebtOverLimitAmount(debt);

          return (
            <Col xs={24} sm={12} md={8} key={debt.id}>
              <Card hoverable>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 8, background: debt.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 'bold', fontSize: 16
                    }}>
                      {debt.name.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500 }}>{debt.name}</div>
                      {debt.repayment_day > 0 && (
                        <div style={{ fontSize: 12, color: '#666' }}>每月 {debt.repayment_day} 号还款</div>
                      )}
                    </div>
                  </div>
                  <Space>
                    <span onClick={() => handleEdit(debt)} style={{ cursor: 'pointer', fontSize: 12, color: '#1890ff' }}>编辑</span>
                    <Popconfirm title="确定删除？" onConfirm={() => handleDelete(debt.id)} okText="确定" cancelText="取消">
                      <span style={{ color: '#ff4d4f', cursor: 'pointer', fontSize: 12 }}>删除</span>
                    </Popconfirm>
                  </Space>
                </div>

                {debt.limit_amount > 0 && (
                  <Progress
                    percent={Math.min(usage, 100)}
                    strokeColor={usage > 80 ? '#ff4d4f' : usage > 50 ? '#faad14' : '#52c41a'}
                    strokeWidth={8}
                    style={{ marginBottom: 8 }}
                    showInfo={false}
                  />
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ color: '#1890ff', fontWeight: 'bold' }}>可用 ¥{availableAmount.toLocaleString()}</span>
                  {limitAmount > 0 && (
                    <span style={{ color: '#666' }}>/ 总额度 ¥{limitAmount.toLocaleString()}</span>
                  )}
                </div>

                {limitAmount > 0 && (
                  <div style={{ color: '#666', fontSize: 13, marginBottom: 12 }}>
                    已用 ¥{usedAmount.toLocaleString()}
                    {overLimitAmount > 0 ? `，已超额 ¥${overLimitAmount.toLocaleString()}` : ''}
                  </div>
                )}

                <Space>
                  <Button size="small" danger onClick={() => handleUpdateAvailable(debt, -1000)}>-1000</Button>
                  <Button size="small" danger onClick={() => handleUpdateAvailable(debt, -100)}>-100</Button>
                  <Button size="small" type="primary" onClick={() => handleUpdateAvailable(debt, 100)}>+100</Button>
                  <Button size="small" type="primary" onClick={() => handleUpdateAvailable(debt, 1000)}>+1000</Button>
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>

      {debts.length === 0 && !loading && (
        <Card style={{ textAlign: 'center', padding: 40, color: '#666' }}>
          暂无负债，点击右上角添加
        </Card>
      )}

      <Modal
        title={editingDebt ? '编辑负债' : '添加负债账户'}
        open={modalVisible}
        onCancel={() => { setModalVisible(false); setEditingDebt(null); form.resetFields(); }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：信用卡、花呗、借呗" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="available_amount" label="可用金额" initialValue={0} extra="当前还可使用的额度">
                <InputNumber prefix="¥" precision={0} min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="limit_amount" label="总额度" initialValue={0} extra="信用卡额度/借款上限">
                <InputNumber prefix="¥" precision={0} min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="repayment_day" label="还款日" initialValue={1}>
            <InputNumber min={1} max={28} style={{ width: '100%' }} placeholder="每月还款日（1-28）" />
          </Form.Item>
          <Form.Item name="color" label="颜色" initialValue="#ff4d4f">
            <ColorPicker presets={[{ label: '预设', colors: PRESET_COLORS }]} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setModalVisible(false)}>取消</Button>
              <Button type="primary" danger htmlType="submit">保存</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
