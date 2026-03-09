import { useEffect, useState } from 'react';
import { Card, Button, Modal, Form, Input, InputNumber, ColorPicker, Space, message, Popconfirm, Row, Col, Statistic } from 'antd';
import { PlusIcon } from '../components/Icons';
import type { Account } from '../types';
import { getAccounts, createAccount, updateAccount, deleteAccount } from '../services/api';

const PRESET_COLORS = [
  '#1890ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1',
  '#13c2c2', '#eb2f96', '#fa8c16', '#2f54eb', '#0050b3'
];

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const data = await getAccounts('asset'); // 只获取资产账户
      setAccounts(data);
    } catch (error) {
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      const color = values.color?.toHexString?.() || values.color || '#1890ff';
      if (editingAccount) {
        await updateAccount(editingAccount.id, { ...values, color, type: 'asset' });
        message.success('更新成功');
      } else {
        await createAccount({ ...values, color, type: 'asset' });
        message.success('添加成功');
      }
      setModalVisible(false);
      form.resetFields();
      setEditingAccount(null);
      fetchAccounts();
    } catch (error) {
      message.error('操作失败');
    }
  };

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    form.setFieldsValue(account);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteAccount(id);
      message.success('删除成功');
      fetchAccounts();
    } catch (error: any) {
      message.error(error.message || '删除失败');
    }
  };

  const totalBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>资产账户</h2>
        <Button type="primary" onClick={() => { setEditingAccount(null); form.resetFields(); setModalVisible(true); }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PlusIcon style={{ width: 14, height: 14 }} />
            添加账户
          </span>
        </Button>
      </div>

      <Card style={{ marginBottom: 24 }}>
        <Statistic
          title="总资产"
          value={totalBalance}
          precision={2}
          prefix="¥"
          valueStyle={{ color: '#52c41a', fontSize: 28 }}
        />
      </Card>

      <Row gutter={[16, 16]}>
        {accounts.map(account => (
          <Col xs={24} sm={12} md={8} lg={6} key={account.id}>
            <Card
              hoverable
              actions={[
                <span onClick={() => handleEdit(account)} style={{ cursor: 'pointer' }}>编辑</span>,
                <Popconfirm title="确定删除？" onConfirm={() => handleDelete(account.id)} okText="确定" cancelText="取消">
                  <span style={{ color: '#ff4d4f', cursor: 'pointer' }}>删除</span>
                </Popconfirm>
              ]}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 8, background: account.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 'bold', fontSize: 16
                }}>
                  {account.name.charAt(0)}
                </div>
                <div>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>{account.name}</div>
                  <div style={{ color: '#52c41a', fontSize: 18, fontWeight: 'bold' }}>
                    ¥{Number(account.balance).toFixed(2)}
                  </div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {accounts.length === 0 && !loading && (
        <Card style={{ textAlign: 'center', padding: 40, color: '#666' }}>
          暂无账户，点击右上角添加
        </Card>
      )}

      <Modal
        title={editingAccount ? '编辑账户' : '添加资产账户'}
        open={modalVisible}
        onCancel={() => { setModalVisible(false); setEditingAccount(null); form.resetFields(); }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="账户名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：支付宝、微信、招商银行卡" />
          </Form.Item>
          <Form.Item name="balance" label="当前余额" initialValue={0}>
            <InputNumber prefix="¥" precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="color" label="颜色" initialValue="#1890ff">
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
