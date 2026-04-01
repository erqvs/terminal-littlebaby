import { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, Space, message, Popconfirm, Tabs } from 'antd';
import { PlusIcon, TrashIcon } from '../components/Icons';
import dayjs from 'dayjs';
import type { Transaction, Category, Account } from '../types';
import { getTransactions, createTransaction, deleteTransaction, getCategories, createCategory, getAccounts } from '../services/api';
import { getDebtAvailableAmount, getDebtUsedAmount } from '../utils/debts';

type TabType = 'income' | 'expense';

export default function Management() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [categoryForm] = Form.useForm();
  const [activeTab, setActiveTab] = useState<TabType>('expense');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [transData, catData, accountsData] = await Promise.all([
        getTransactions(),
        getCategories(),
        getAccounts(),
      ]);
      setTransactions(transData);
      setCategories(catData);
      setAccounts(accountsData);
    } catch (error) {
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTransaction = async (values: any) => {
    try {
      await createTransaction({
        amount: values.amount,
        category_id: values.category_id,
        account_id: values.account_id,  // 必填
        description: values.description || '',
        date: values.date.format('YYYY-MM-DD'),
      });
      message.success('添加成功');
      setModalVisible(false);
      form.resetFields();
      fetchData();
    } catch (error: any) {
      message.error(error.message || '添加失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteTransaction(id);
      message.success('删除成功');
      fetchData();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleAddCategory = async (values: any) => {
    try {
      await createCategory({
        name: values.name,
        type: activeTab as 'income' | 'expense',
        icon: values.icon,
      });
      message.success('分类添加成功');
      setCategoryModalVisible(false);
      categoryForm.resetFields();
      fetchData();
    } catch (error) {
      message.error('添加分类失败');
    }
  };

  // 分离资产账户和负债账户
  const assetAccounts = accounts.filter(a => a.type === 'asset');
  const debtAccounts = accounts.filter(a => a.type === 'debt');

  const columns = [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 110,
      sorter: (a: Transaction, b: Transaction) => a.date.localeCompare(b.date),
      render: (date: string) => dayjs(date).format('YYYY-MM-DD'),
    },
    {
      title: '类型',
      dataIndex: 'category_type',
      key: 'category_type',
      width: 70,
      render: (type: string) => (
        <span style={{ color: type === 'income' ? '#52c41a' : '#ff4d4f' }}>
          {type === 'income' ? '收入' : '支出'}
        </span>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category_name',
      key: 'category_name',
      width: 90,
    },
    {
      title: '账户',
      dataIndex: 'account_name',
      key: 'account_name',
      width: 90,
      render: (name: string, record: Transaction) => (
        <span style={{
          color: record.account_type === 'debt' ? '#ff4d4f' : 'inherit'
        }}>
          {name}
        </span>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 100,
      sorter: (a: Transaction, b: Transaction) => Number(a.amount) - Number(b.amount),
      render: (amount: number, record: Transaction) => (
        <span style={{ color: record.category_type === 'income' ? '#52c41a' : '#ff4d4f', fontWeight: 'bold' }}>
          {record.category_type === 'income' ? '+' : '-'}¥{Number(amount).toFixed(2)}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 70,
      render: (_: any, record: Transaction) => (
        <Popconfirm
          title="确定删除这条记录吗？"
          onConfirm={() => handleDelete(record.id)}
          okText="确定"
          cancelText="取消"
        >
          <Button type="link" danger style={{ padding: 0 }}>
            <TrashIcon style={{ color: '#ff4d4f' }} />
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>记账管理</h2>
        <Button type="primary" onClick={() => setModalVisible(true)}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PlusIcon style={{ width: 14, height: 14 }} />
            记一笔
          </span>
        </Button>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as TabType)}
        items={[
          { key: 'expense', label: `支出 (${transactions.filter(t => t.category_type === 'expense').length})` },
          { key: 'income', label: `收入 (${transactions.filter(t => t.category_type === 'income').length})` },
        ]}
      />

      <Card>
        <Table
          dataSource={transactions.filter(t => t.category_type === activeTab)}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          locale={{ emptyText: '暂无记录' }}
        />
      </Card>

      <Modal
        title="记一笔"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleAddTransaction}>
          <Form.Item name="type" label="类型" initialValue="expense">
            <Select onChange={() => form.setFieldValue('category_id', undefined)}>
              <Select.Option value="expense">支出</Select.Option>
              <Select.Option value="income">收入</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="category_id"
            label="分类"
            rules={[{ required: true, message: '请选择分类' }]}
          >
            <Select
              placeholder="选择分类"
              dropdownRender={(menu) => (
                <>
                  {menu}
                  <div style={{ padding: 8, borderTop: '1px solid #303030' }}>
                    <Button type="link" onClick={() => setCategoryModalVisible(true)}>
                      + 新增分类
                    </Button>
                  </div>
                </>
              )}
            >
              {categories
                .filter(c => c.type === form.getFieldValue('type') || 'expense')
                .map(c => (
                  <Select.Option key={c.id} value={c.id}>
                    {c.name}
                  </Select.Option>
                ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="account_id"
            label="账户"
            rules={[{ required: true, message: '请选择账户' }]}
          >
            <Select placeholder="选择账户" showSearch optionFilterProp="children">
              {assetAccounts.length > 0 && (
                <Select.OptGroup label="💰 资产账户">
                  {assetAccounts.map(a => (
                    <Select.Option key={a.id} value={a.id}>
                      <span style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        background: a.color,
                        marginRight: 6
                      }} />
                      {a.name}
                    </Select.Option>
                  ))}
                </Select.OptGroup>
              )}
              {debtAccounts.length > 0 && (
                <Select.OptGroup label="💳 负债账户">
                  {debtAccounts.map(a => (
                    <Select.Option key={a.id} value={a.id}>
                      <span style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        background: a.color,
                        marginRight: 6
                      }} />
                      {a.name}
                      <span style={{ color: '#1890ff', marginLeft: 8 }}>
                        可用 ¥{getDebtAvailableAmount(a).toFixed(0)}
                      </span>
                      <span style={{ color: '#999', marginLeft: 8 }}>
                        已用 ¥{getDebtUsedAmount(a).toFixed(0)}
                      </span>
                    </Select.Option>
                  ))}
                </Select.OptGroup>
              )}
            </Select>
          </Form.Item>
          {accounts.length === 0 && (
            <div style={{ color: '#ff4d4f', marginBottom: 16, fontSize: 12 }}>
              暂无账户，请先添加资产或负债账户
            </div>
          )}
          <Form.Item
            name="amount"
            label="金额"
            rules={[{ required: true, message: '请输入金额' }]}
          >
            <InputNumber
              prefix="¥"
              precision={2}
              min={0.01}
              style={{ width: '100%' }}
              placeholder="0.00"
            />
          </Form.Item>
          <Form.Item name="date" label="日期" rules={[{ required: true, message: '请选择日期' }]} initialValue={dayjs()}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="备注">
            <Input.TextArea rows={2} placeholder="可选备注" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit" disabled={accounts.length === 0}>保存</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`新增${activeTab === 'income' ? '收入' : '支出'}分类`}
        open={categoryModalVisible}
        onCancel={() => setCategoryModalVisible(false)}
        footer={null}
      >
        <Form form={categoryForm} layout="vertical" onFinish={handleAddCategory}>
          <Form.Item
            name="name"
            label="分类名称"
            rules={[{ required: true, message: '请输入分类名称' }]}
          >
            <Input placeholder="如：餐饮、交通" />
          </Form.Item>
          <Form.Item name="icon" label="图标（可选）">
            <Input placeholder="图标名称" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setCategoryModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">添加</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
