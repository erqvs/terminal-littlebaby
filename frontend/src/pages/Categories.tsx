import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Empty, Form, Input, Modal, Popconfirm, Row, Segmented, Select, Space, Tag, message } from 'antd';
import type { Category } from '../types';
import { CategoryIcon, PlusIcon } from '../components/Icons';
import { createCategory, deleteCategory, getCategories, updateCategory } from '../services/api';

type CategoryType = 'income' | 'expense';
type CategoryKind = 'leaf' | 'group';

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState<CategoryType>('expense');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [modalKind, setModalKind] = useState<CategoryKind>('leaf');
  const [form] = Form.useForm();

  const selectedType = Form.useWatch('type', form) as CategoryType | undefined;

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const data = await getCategories({ kind: 'all', includeMembers: true });
      setCategories(data);
    } catch (error) {
      message.error('加载分类失败');
    } finally {
      setLoading(false);
    }
  };

  const leafCategories = useMemo(
    () => categories.filter((category) => category.kind === 'leaf' && category.type === activeType),
    [categories, activeType],
  );

  const groupCategories = useMemo(
    () => categories.filter((category) => category.kind === 'group' && category.type === activeType),
    [categories, activeType],
  );

  const groupedLeafOwnerMap = useMemo(() => {
    const ownerMap = new Map<number, { groupId: number; groupName: string }>();

    for (const groupCategory of categories.filter((category) => category.kind === 'group')) {
      for (const memberId of groupCategory.member_ids || []) {
        if (!ownerMap.has(memberId)) {
          ownerMap.set(memberId, {
            groupId: groupCategory.id,
            groupName: groupCategory.name,
          });
        }
      }
    }

    return ownerMap;
  }, [categories]);

  const memberOptions = useMemo(() => {
    const type = selectedType || activeType;
    return categories.filter((category) => {
      if (category.kind !== 'leaf' || category.type !== type) {
        return false;
      }

      const owner = groupedLeafOwnerMap.get(category.id);
      if (!owner) {
        return true;
      }

      return editingCategory?.kind === 'group' && owner.groupId === editingCategory.id;
    });
  }, [categories, selectedType, activeType, groupedLeafOwnerMap, editingCategory]);

  const openCreateModal = (kind: CategoryKind) => {
    setEditingCategory(null);
    setModalKind(kind);
    form.resetFields();
    form.setFieldsValue({
      type: activeType,
      kind,
      member_ids: [],
    });
    setModalVisible(true);
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setModalKind(category.kind);
    form.setFieldsValue({
      name: category.name,
      type: category.type,
      icon: category.icon || undefined,
      member_ids: category.member_ids || category.members?.map((member) => member.id) || [],
    });
    setModalVisible(true);
  };

  const handleSubmit = async (values: any) => {
    const payload = {
      name: values.name?.trim(),
      type: values.type as CategoryType,
      icon: values.icon?.trim() || undefined,
      ...(modalKind === 'group' ? { member_ids: values.member_ids || [] } : {}),
    };

    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, payload);
        message.success('分类已更新');
      } else {
        await createCategory({
          ...payload,
          kind: modalKind,
        });
        message.success(modalKind === 'group' ? '组合分类已创建' : '分类已创建');
      }

      setModalVisible(false);
      setEditingCategory(null);
      form.resetFields();
      fetchCategories();
    } catch (error: any) {
      message.error(error.message || '保存分类失败');
    }
  };

  const handleDelete = async (category: Category) => {
    try {
      await deleteCategory(category.id);
      message.success('分类已删除');
      fetchCategories();
    } catch (error: any) {
      message.error(error.message || '删除分类失败');
    }
  };

  const renderCategoryCard = (category: Category) => (
    <Col xs={24} md={12} xl={8} key={category.id}>
      <Card loading={loading}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{category.name}</div>
              <Tag color={category.kind === 'group' ? 'cyan' : 'blue'}>
                {category.kind === 'group' ? '组合分类' : '普通分类'}
              </Tag>
            </div>

            {category.kind === 'group' ? (
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, lineHeight: 1.7 }}>
                {(category.member_names?.length ?? 0) > 0 ? (
                  <>包含：{category.member_names?.join('、')}</>
                ) : (
                  <>暂未配置成员分类</>
                )}
              </div>
            ) : (
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
                {groupedLeafOwnerMap.has(category.id)
                  ? `已归属到组合分类「${groupedLeafOwnerMap.get(category.id)?.groupName}」`
                  : '用于日常记账和预算统计的基础分类'}
              </div>
            )}
          </div>

          <Space size={12}>
            <span onClick={() => handleEdit(category)} style={{ cursor: 'pointer', fontSize: 12, color: '#1890ff' }}>编辑</span>
            <Popconfirm title="确定删除这个分类吗？" onConfirm={() => handleDelete(category)} okText="确定" cancelText="取消">
              <span style={{ cursor: 'pointer', fontSize: 12, color: '#ff4d4f' }}>删除</span>
            </Popconfirm>
          </Space>
        </div>
      </Card>
    </Col>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>分类</h2>
          <div style={{ color: 'rgba(255,255,255,0.45)', marginTop: 6 }}>
            普通分类用于记账，组合分类可把多个普通分类合并成一个预算口径。
          </div>
        </div>
        <Space wrap>
          <Segmented
            value={activeType}
            onChange={(value) => setActiveType(value as CategoryType)}
            options={[
              { label: '支出分类', value: 'expense' },
              { label: '收入分类', value: 'income' },
            ]}
          />
          <Button onClick={() => openCreateModal('leaf')}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <PlusIcon style={{ width: 14, height: 14 }} />
              添加普通分类
            </span>
          </Button>
          <Button type="primary" onClick={() => openCreateModal('group')} disabled={leafCategories.length === 0}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CategoryIcon style={{ width: 14, height: 14 }} />
              添加组合分类
            </span>
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card title={`普通分类 (${leafCategories.length})`} style={{ height: '100%' }}>
            {leafCategories.length > 0 ? (
              <Row gutter={[16, 16]}>
                {leafCategories.map(renderCategoryCard)}
              </Row>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`暂无${activeType === 'expense' ? '支出' : '收入'}普通分类`} />
            )}
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card title={`组合分类 (${groupCategories.length})`} style={{ height: '100%' }}>
            {groupCategories.length > 0 ? (
              <Row gutter={[16, 16]}>
                {groupCategories.map(renderCategoryCard)}
              </Row>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有组合分类" />
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        title={editingCategory ? '编辑分类' : modalKind === 'group' ? '添加组合分类' : '添加普通分类'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditingCategory(null);
          form.resetFields();
        }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="分类名称" rules={[{ required: true, message: '请输入分类名称' }]}>
            <Input placeholder={modalKind === 'group' ? '例如：生活费、通勤支出' : '例如：餐饮、工资'} maxLength={100} />
          </Form.Item>

          <Form.Item name="type" label="分类类型" rules={[{ required: true, message: '请选择分类类型' }]}>
            <Select
              options={[
                { label: '支出', value: 'expense' },
                { label: '收入', value: 'income' },
              ]}
              onChange={() => {
                if (modalKind === 'group') {
                  form.setFieldValue('member_ids', []);
                }
              }}
            />
          </Form.Item>

          {modalKind === 'group' && (
            <>
              <Form.Item
                name="member_ids"
                label="包含的普通分类"
                rules={[{ required: true, message: '请选择至少一个普通分类' }]}
              >
                <Select
                  mode="multiple"
                  placeholder="选择要合并统计的普通分类"
                  options={memberOptions.map((category) => ({
                    value: category.id,
                    label: category.name,
                  }))}
                />
              </Form.Item>
              <div style={{ marginTop: -12, marginBottom: 16, color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
                每个普通分类只能归属于一个组合分类，已被占用的分类不会出现在这里。
              </div>
            </>
          )}

          <Form.Item name="icon" label="图标标识">
            <Input placeholder="可选，留空即可" maxLength={50} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setModalVisible(false);
                setEditingCategory(null);
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
