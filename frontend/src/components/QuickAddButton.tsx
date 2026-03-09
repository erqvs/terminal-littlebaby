import { useState, useEffect } from 'react';
import { FloatButton, Modal, Form, InputNumber, Select, Input, Radio, message, Divider } from 'antd';
import dayjs from 'dayjs';
import type { Account, Category } from '../types';
import { getAccounts, getCategories, createTransaction } from '../services/api';

export default function QuickAddButton() {
  const [modalVisible, setModalVisible] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [form] = Form.useForm();

  useEffect(() => {
    if (modalVisible) {
      fetchData();
    }
  }, [modalVisible]);

  const fetchData = async () => {
    try {
      const [accountsData, categoriesData] = await Promise.all([
        getAccounts(), // 获取所有账户
        getCategories(),
      ]);
      setAccounts(accountsData);
      setCategories(categoriesData);
    } catch (error) {
      message.error('加载数据失败');
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      await createTransaction({
        amount: values.amount,
        category_id: values.category_id,
        account_id: values.account_id,  // 必填
        description: values.description || '',
        date: values.date || dayjs().format('YYYY-MM-DD'),
      });
      message.success('记账成功');
      setModalVisible(false);
      form.resetFields();
      setType('expense');
    } catch (error: any) {
      message.error(error.message || '记账失败');
    }
  };

  const filteredCategories = categories.filter(c => c.type === type);

  // 分离资产账户和负债账户
  const assetAccounts = accounts.filter(a => a.type === 'asset');
  const debtAccounts = accounts.filter(a => a.type === 'debt');

  return (
    <>
      <FloatButton
        type="primary"
        icon={<span style={{ fontSize: 20 }}>+</span>}
        style={{ right: 24, bottom: 24 }}
        onClick={() => setModalVisible(true)}
        tooltip="快速记账"
      />

      <Modal
        title="快速记账"
        open={modalVisible}
        onCancel={() => { setModalVisible(false); form.resetFields(); setType('expense'); }}
        footer={null}
        width={400}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ type: 'expense', date: dayjs().format('YYYY-MM-DD') }}
        >
          <Form.Item label="类型">
            <Radio.Group
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                form.setFieldValue('category_id', undefined);
              }}
              buttonStyle="solid"
            >
              <Radio.Button value="expense">支出</Radio.Button>
              <Radio.Button value="income">收入</Radio.Button>
            </Radio.Group>
          </Form.Item>

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
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="category_id"
            label="分类"
            rules={[{ required: true, message: '请选择分类' }]}
          >
            <Select placeholder="选择分类">
              {filteredCategories.map(c => (
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
              {/* 资产账户组 */}
              {assetAccounts.length > 0 && (
                <Select.OptGroup label="💰 资产账户">
                  {assetAccounts.map(a => (
                    <Select.Option key={a.id} value={a.id}>
                      <span style={{
                        display: 'inline-block',
                        width: 12,
                        height: 12,
                        borderRadius: 2,
                        background: a.color,
                        marginRight: 8
                      }} />
                      {a.name}
                      <span style={{ color: '#999', marginLeft: 8 }}>
                        ¥{Number(a.balance).toFixed(2)}
                      </span>
                    </Select.Option>
                  ))}
                </Select.OptGroup>
              )}
              {/* 负债账户组 */}
              {debtAccounts.length > 0 && (
                <Select.OptGroup label="💳 负债账户">
                  {debtAccounts.map(a => (
                    <Select.Option key={a.id} value={a.id}>
                      <span style={{
                        display: 'inline-block',
                        width: 12,
                        height: 12,
                        borderRadius: 2,
                        background: a.color,
                        marginRight: 8
                      }} />
                      {a.name}
                      <span style={{ color: '#ff4d4f', marginLeft: 8 }}>
                        已用 ¥{Number(a.balance).toFixed(2)}
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
            name="description"
            label="备注"
          >
            <Input placeholder="简要描述（可选）" />
          </Form.Item>

          <Divider style={{ margin: '12px 0' }} />

          <div style={{ color: '#666', fontSize: 12, marginBottom: 12 }}>
            <div>💡 提示：</div>
            <div>• 从<span style={{ color: '#1890ff' }}>资产账户</span>支出 → 余额减少</div>
            <div>• 从<span style={{ color: '#ff4d4f' }}>负债账户</span>（如花呗）支出 → 已用额度增加</div>
          </div>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <button
              type="submit"
              disabled={accounts.length === 0}
              style={{
                background: type === 'expense' ? '#ff4d4f' : '#52c41a',
                color: '#fff',
                border: 'none',
                padding: '8px 24px',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                cursor: accounts.length === 0 ? 'not-allowed' : 'pointer',
                opacity: accounts.length === 0 ? 0.6 : 1,
              }}
            >
              记账
            </button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
