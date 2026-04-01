import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Empty, Input, Popconfirm, Row, Segmented, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import dayjs from 'dayjs';
import type { DigestHistoryListResponse, DigestHistoryRecord } from '../types';
import { clearDigestHistory, deleteDigestHistoryRecord, getDigestHistory } from '../services/api';

type DigestTypeFilter = 'all' | 'news' | 'github' | 'paper';
type DaysFilter = 7 | 30 | 0;

const TYPE_LABELS: Record<Exclude<DigestTypeFilter, 'all'>, string> = {
  news: '新闻',
  github: 'GitHub',
  paper: '论文',
};

const TYPE_COLORS: Record<Exclude<DigestTypeFilter, 'all'>, string> = {
  news: 'blue',
  github: 'geekblue',
  paper: 'purple',
};

function formatDateTime(value?: string | null) {
  if (!value) {
    return '-';
  }

  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : value;
}

function getClearScopeLabel(type: DigestTypeFilter, days: DaysFilter, query: string) {
  const parts: string[] = [];

  if (type !== 'all') {
    parts.push(TYPE_LABELS[type]);
  }

  if (days > 0) {
    parts.push(`最近 ${days} 天`);
  }

  if (query.trim()) {
    parts.push(`关键词“${query.trim()}”`);
  }

  return parts.length > 0 ? parts.join(' / ') : '全部记录';
}

export default function DigestHistory() {
  const [records, setRecords] = useState<DigestHistoryRecord[]>([]);
  const [summary, setSummary] = useState<DigestHistoryListResponse['summary']>({
    total: 0,
    news_count: 0,
    github_count: 0,
    paper_count: 0,
    recent_7d_count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<DigestTypeFilter>('all');
  const [daysFilter, setDaysFilter] = useState<DaysFilter>(7);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchHistory();
  }, [typeFilter, daysFilter, searchQuery, page, pageSize]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const data = await getDigestHistory({
        digest_type: typeFilter === 'all' ? undefined : typeFilter,
        q: searchQuery.trim() || undefined,
        days: daysFilter || undefined,
        page,
        page_size: pageSize,
      });

      setRecords(data.items);
      setSummary(data.summary);
      setTotal(data.total);
    } catch (error: any) {
      message.error(error.message || '加载简报历史失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteDigestHistoryRecord(id);
      message.success('记录已删除');
      if (records.length === 1 && page > 1) {
        setPage(page - 1);
        return;
      }
      fetchHistory();
    } catch (error: any) {
      message.error(error.message || '删除记录失败');
    }
  };

  const handleClear = async () => {
    try {
      const result = await clearDigestHistory({
        digest_type: typeFilter === 'all' ? undefined : typeFilter,
        q: searchQuery.trim() || undefined,
        days: daysFilter || undefined,
      });
      message.success(result.message || '已清空简报历史');
      setPage(1);
      fetchHistory();
    } catch (error: any) {
      message.error(error.message || '清空记录失败');
    }
  };

  const columns = useMemo(
    () => [
      {
        title: '类型',
        dataIndex: 'digest_type',
        key: 'digest_type',
        width: 110,
        render: (value: DigestHistoryRecord['digest_type']) => (
          <Tag color={TYPE_COLORS[value]}>{TYPE_LABELS[value]}</Tag>
        ),
      },
      {
        title: '内容',
        dataIndex: 'title',
        key: 'title',
        render: (_: unknown, record: DigestHistoryRecord) => (
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontWeight: 600, lineHeight: 1.6 }}>
              {record.title || '未命名内容'}
            </div>
            <Space size={[8, 8]} wrap>
              {record.source && <Tag>{record.source}</Tag>}
              {record.source_id && <Tag color="default">{record.source_id}</Tag>}
            </Space>
            {record.canonical_url && (
              <Typography.Link href={record.canonical_url} target="_blank" rel="noreferrer">
                查看原始链接
              </Typography.Link>
            )}
          </div>
        ),
      },
      {
        title: '最近发送',
        dataIndex: 'last_sent_at',
        key: 'last_sent_at',
        width: 180,
        render: (value: string | null) => formatDateTime(value),
      },
      {
        title: '发送次数',
        dataIndex: 'sent_count',
        key: 'sent_count',
        width: 100,
      },
      {
        title: '操作',
        key: 'actions',
        width: 100,
        render: (_: unknown, record: DigestHistoryRecord) => (
          <Popconfirm
            title="确定删除这条简报历史吗？"
            okText="确定"
            cancelText="取消"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="link" danger style={{ padding: 0 }}>
              删除
            </Button>
          </Popconfirm>
        ),
      },
    ],
    [records],
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>简报历史</h2>
          <div style={{ color: 'rgba(255,255,255,0.45)', marginTop: 6 }}>
            管理新闻、GitHub 和论文晨报的已发送记录，用于避免重复推送。
          </div>
        </div>
        <Space wrap>
          <Button onClick={fetchHistory}>刷新</Button>
          <Popconfirm
            title={`确定清空“${getClearScopeLabel(typeFilter, daysFilter, searchQuery)}”吗？`}
            description="这个操作会影响后续晨报去重。"
            okText="确定清空"
            cancelText="取消"
            onConfirm={handleClear}
          >
            <Button danger disabled={total === 0}>清空当前筛选</Button>
          </Popconfirm>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={6}>
          <Card>
            <Statistic title="总记录数" value={summary.total} />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card>
            <Statistic title="最近 7 天" value={summary.recent_7d_count} />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card>
            <Statistic title="新闻 / GitHub" value={`${summary.news_count} / ${summary.github_count}`} />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card>
            <Statistic title="论文记录" value={summary.paper_count} />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space wrap>
            <Segmented
              value={typeFilter}
              onChange={(value) => {
                setTypeFilter(value as DigestTypeFilter);
                setPage(1);
              }}
              options={[
                { label: '全部', value: 'all' },
                { label: '新闻', value: 'news' },
                { label: 'GitHub', value: 'github' },
                { label: '论文', value: 'paper' },
              ]}
            />
            <Segmented
              value={daysFilter}
              onChange={(value) => {
                setDaysFilter(value as DaysFilter);
                setPage(1);
              }}
              options={[
                { label: '最近 7 天', value: 7 },
                { label: '最近 30 天', value: 30 },
                { label: '全部时间', value: 0 },
              ]}
            />
          </Space>

          <Input.Search
            placeholder="搜索标题、来源、链接或去重键"
            value={searchInput}
            onChange={(event) => {
              const nextValue = event.target.value;
              setSearchInput(nextValue);
              if (!nextValue) {
                setSearchQuery('');
                setPage(1);
              }
            }}
            onSearch={(value) => {
              setSearchQuery(value);
              setPage(1);
            }}
            allowClear
            enterButton="搜索"
          />
        </Space>
      </Card>

      <Card bodyStyle={{ padding: records.length === 0 && !loading ? 48 : 24 }}>
        {records.length === 0 && !loading ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="当前筛选下没有简报历史"
          />
        ) : (
          <Table
            rowKey="id"
            loading={loading}
            dataSource={records}
            columns={columns}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              onChange: (nextPage, nextPageSize) => {
                setPage(nextPage);
                setPageSize(nextPageSize);
              },
            }}
          />
        )}
      </Card>
    </div>
  );
}
