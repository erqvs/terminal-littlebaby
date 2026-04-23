import { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Input,
  Button,
  Table,
  Tag,
  Spin,
  Empty,
  message,
  Space,
  Modal,
  Form,
  Drawer,
  Typography,
  Row,
  Col,
  Statistic,
} from 'antd';
import {
  PlusIcon,
  ClockIcon,
} from '../components/Icons';
import {
  getLittleBabyMemoryStatus,
  getLittleBabyMemoryFiles,
  searchLittleBabyMemory,
  reindexLittleBabyMemory,
  createLittleBabyMemoryFile,
  deleteLittleBabyMemoryFile,
} from '../services/api';
import type {
  LittleBabyMemoryAgentStatus,
  LittleBabyMemoryFile,
  LittleBabyMemorySearchResult,
} from '../types';

const { TextArea } = Input;
const { Text, Paragraph } = Typography;

export default function LittleBabyMemory() {
  const [status, setStatus] = useState<LittleBabyMemoryAgentStatus[] | null>(null);
  const [files, setFiles] = useState<LittleBabyMemoryFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LittleBabyMemorySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [viewingFile, setViewingFile] = useState<LittleBabyMemoryFile | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [reindexing, setReindexing] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, filesRes] = await Promise.all([
        getLittleBabyMemoryStatus(),
        getLittleBabyMemoryFiles(),
      ]);
      setStatus(statusRes.agents || []);
      setFiles(filesRes.files || []);
    } catch {
      message.error('加载记忆数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await searchLittleBabyMemory(searchQuery.trim());
      setSearchResults(res.results || []);
    } catch {
      message.error('搜索失败');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  const handleReindex = useCallback(async () => {
    setReindexing(true);
    try {
      await reindexLittleBabyMemory();
      message.success('重新索引完成');
      void fetchData();
    } catch {
      message.error('重新索引失败');
    } finally {
      setReindexing(false);
    }
  }, [fetchData]);

  const handleCreateFile = useCallback(
    async (values: { name: string; content: string }) => {
      try {
        const fileName = values.name.endsWith('.md') ? values.name : `${values.name}.md`;
        const filePath = fileName.includes('/') ? fileName : `memory/${fileName}`;
        await createLittleBabyMemoryFile(filePath, values.content);
        message.success('文件已创建');
        setCreateModalOpen(false);
        createForm.resetFields();
        void fetchData();
      } catch {
        message.error('创建文件失败');
      }
    },
    [createForm, fetchData],
  );

  const handleDeleteFile = useCallback(
    async (filePath: string) => {
      try {
        await deleteLittleBabyMemoryFile(filePath);
        message.success('文件已删除');
        void fetchData();
      } catch {
        message.error('删除文件失败');
      }
    },
    [fetchData],
  );

  const openFileDrawer = useCallback((file: LittleBabyMemoryFile) => {
    setViewingFile(file);
    setDrawerOpen(true);
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const agentStatus = status?.[0];

  const fileColumns = [
    {
      title: '文件名',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: LittleBabyMemoryFile) => (
        <a onClick={() => openFileDrawer(record)} style={{ color: '#1890ff' }}>
          {name}
        </a>
      ),
    },
    {
      title: '路径',
      dataIndex: 'path',
      key: 'path',
      render: (path: string) => (
        <Text type="secondary" style={{ fontSize: 13 }}>{path}</Text>
      ),
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 100,
      render: (size: number) => <Text type="secondary">{formatSize(size)}</Text>,
    },
    {
      title: '修改时间',
      dataIndex: 'modified',
      key: 'modified',
      width: 180,
      render: (modified: string) => (
        <Text type="secondary" style={{ fontSize: 13 }}>
          {modified ? new Date(modified).toLocaleString('zh-CN') : '-'}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: unknown, record: LittleBabyMemoryFile) => (
        <Space>
          <Button type="link" size="small" onClick={() => openFileDrawer(record)}>
            查看
          </Button>
          <Button
            type="link"
            size="small"
            danger
            onClick={() => {
              Modal.confirm({
                title: '确认删除',
                content: `确定要删除 ${record.name} 吗？`,
                okText: '删除',
                cancelText: '取消',
                okButtonProps: { danger: true },
                onOk: () => handleDeleteFile(record.path),
              });
            }}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const searchColumns = [
    {
      title: '路径',
      dataIndex: 'path',
      key: 'path',
      width: 200,
      ellipsis: true,
      render: (p: string) => <Text style={{ fontSize: 13 }}>{p}</Text>,
    },
    {
      title: '内容片段',
      dataIndex: 'text',
      key: 'text',
      render: (text: string) => (
        <Paragraph
          ellipsis={{ rows: 3, expandable: true, symbol: '展开' }}
          style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.75)' }}
        >
          {text}
        </Paragraph>
      ),
    },
    {
      title: '分数',
      dataIndex: 'score',
      key: 'score',
      width: 80,
      render: (score: number) => {
        if (!score) return '-';
        const pct = Math.round(score * 100);
        const color = pct >= 80 ? '#52c41a' : pct >= 50 ? '#faad14' : '#999';
        return <Tag color={color}>{pct}%</Tag>;
      },
    },
    {
      title: '行号',
      dataIndex: 'start_line',
      key: 'lines',
      width: 100,
      render: (_: unknown, record: LittleBabyMemorySearchResult) => {
        if (!record.start_line) return '-';
        return record.end_line && record.end_line !== record.start_line
          ? `${record.start_line}-${record.end_line}`
          : `${record.start_line}`;
      },
    },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>LittleBaby 记忆</h2>
        <Space>
          <Button
            onClick={handleReindex}
            loading={reindexing}
            icon={<ClockIcon />}
          >
            重新索引
          </Button>
          <Button
            type="primary"
            icon={<PlusIcon />}
            onClick={() => setCreateModalOpen(true)}
          >
            新建文件
          </Button>
        </Space>
      </div>

      {agentStatus && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="后端"
                value={agentStatus.status?.backend || '-'}
                valueStyle={{ fontSize: 16 }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="已索引文件"
                value={agentStatus.status?.files ?? 0}
                valueStyle={{ fontSize: 16 }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="分块数"
                value={agentStatus.status?.chunks ?? 0}
                valueStyle={{ fontSize: 16 }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="搜索模式"
                value={agentStatus.status?.custom?.searchMode || '-'}
                valueStyle={{ fontSize: 16 }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {agentStatus?.scan?.issues && agentStatus.scan.issues.length > 0 && (
        <Card size="small" style={{ marginBottom: 24, borderColor: '#faad14' }}>
          <Space direction="vertical" size={4}>
            {agentStatus.scan.issues.map((issue, i) => (
              <Text key={i} style={{ color: '#faad14', fontSize: 13 }}>
                {issue}
              </Text>
            ))}
          </Space>
        </Card>
      )}

      <Card
        title="搜索记忆"
        style={{ marginBottom: 24 }}
        styles={{ body: { padding: '16px 24px' } }}
      >
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="输入搜索关键词..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onPressEnter={handleSearch}
            size="large"
            allowClear
          />
          <Button type="primary" size="large" onClick={handleSearch} loading={searching}>
            搜索
          </Button>
        </Space.Compact>

        {searchResults.length > 0 && (
          <Table
            dataSource={searchResults}
            columns={searchColumns}
            rowKey={(r, i) => `${r.path}-${r.start_line}-${i}`}
            pagination={false}
            size="small"
            style={{ marginTop: 16 }}
          />
        )}

        {searchQuery && !searching && searchResults.length === 0 && (
          <Empty description="无匹配结果" style={{ marginTop: 24 }} />
        )}
      </Card>

      <Card title={`记忆文件 (${files.length})`}>
        {files.length > 0 ? (
          <Table
            dataSource={files}
            columns={fileColumns}
            rowKey="path"
            pagination={false}
            size="small"
          />
        ) : (
          <Empty description="暂无记忆文件，点击右上角新建" />
        )}
      </Card>

      <Drawer
        title={viewingFile?.name || '文件内容'}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setViewingFile(null);
        }}
        width={640}
      >
        {viewingFile?.content ? (
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: 13,
              lineHeight: 1.7,
              color: 'rgba(255,255,255,0.85)',
              background: 'rgba(255,255,255,0.04)',
              padding: 16,
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.06)',
              margin: 0,
            }}
          >
            {viewingFile.content}
          </pre>
        ) : (
          <Empty description="文件内容为空" />
        )}
      </Drawer>

      <Modal
        title="新建记忆文件"
        open={createModalOpen}
        onCancel={() => {
          setCreateModalOpen(false);
          createForm.resetFields();
        }}
        footer={null}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreateFile}>
          <Form.Item
            name="name"
            label="文件名"
            rules={[{ required: true, message: '请输入文件名' }]}
          >
            <Input placeholder="例如: notes (自动添加 .md 后缀)" />
          </Form.Item>
          <Form.Item
            name="content"
            label="内容"
            rules={[{ required: true, message: '请输入内容' }]}
          >
            <TextArea rows={10} placeholder="支持 Markdown 格式" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => { setCreateModalOpen(false); createForm.resetFields(); }}>
              取消
            </Button>
            <Button type="primary" htmlType="submit">
              创建
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
