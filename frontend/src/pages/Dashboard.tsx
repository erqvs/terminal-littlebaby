import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Table, Spin, message, Progress, List } from 'antd';
import dayjs from 'dayjs';
import { ArrowDownIcon, WalletIcon, TargetIcon } from '../components/Icons';
import TrendChart from '../components/TrendChart';
import type { Transaction, Account, Goal } from '../types';
import { getTransactions, getAccounts, getGoals } from '../services/api';

export default function Dashboard() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [transData, allAccountsData, goalsData] = await Promise.all([
        getTransactions(),
        getAccounts(), // 获取所有账户（资产+负债）
        getGoals(),
      ]);
      setTransactions(transData);
      setAccounts(allAccountsData);
      setGoals(goalsData);
    } catch (error) {
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 分离资产账户和负债账户
  const assetAccounts = accounts.filter(a => a.type === 'asset');
  const debtAccounts = accounts.filter(a => a.type === 'debt');

  const totalAssets = assetAccounts.reduce((sum, a) => sum + Number(a.balance), 0);
  const totalDebts = debtAccounts.reduce((sum, d) => sum + Number(d.balance), 0);
  const netWorth = totalAssets - totalDebts;

  // 获取第一个未完成的目标，计算还差多少
  const activeGoals = goals.filter(g => !g.is_completed);
  const nextGoal = activeGoals[0];
  const goalRemaining = nextGoal
    ? Number(nextGoal.target_amount) - Number(nextGoal.current_amount)
    : 0;

  const recentTransactions = transactions.slice(0, 5);

  const columns = [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 100,
      render: (date: string) => dayjs(date).format('YYYY-MM-DD'),
    },
    {
      title: '分类',
      dataIndex: 'category_name',
      key: 'category_name',
      width: 80,
    },
    {
      title: '账户',
      dataIndex: 'account_name',
      key: 'account_name',
      width: 80,
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
      render: (amount: number, record: Transaction) => (
        <span style={{ color: record.category_type === 'income' ? '#52c41a' : '#ff4d4f', fontWeight: 'bold' }}>
          {record.category_type === 'income' ? '+' : '-'}¥{Number(amount).toFixed(2)}
        </span>
      ),
    },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>仪表盘</h2>
      </div>

      {/* 核心指标 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="总资产"
              value={totalAssets}
              precision={2}
              prefix={<WalletIcon style={{ color: '#1890ff' }} />}
              suffix="元"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="总负债"
              value={totalDebts}
              precision={2}
              prefix={<ArrowDownIcon style={{ color: '#ff4d4f' }} />}
              suffix="元"
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="净资产"
              value={netWorth}
              precision={2}
              prefix={<WalletIcon style={{ color: netWorth >= 0 ? '#52c41a' : '#ff4d4f' }} />}
              suffix="元"
              valueStyle={{ color: netWorth >= 0 ? '#52c41a' : '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            {nextGoal ? (
              <div>
                <div style={{ color: 'rgba(255,255,255,0.65)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TargetIcon style={{ color: nextGoal.color }} />
                  {nextGoal.name}
                </div>
                <div style={{ fontSize: 24, fontWeight: 'bold', color: nextGoal.color }}>
                  还差 ¥{goalRemaining.toLocaleString()}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ color: 'rgba(255,255,255,0.65)', marginBottom: 8 }}>下一目标</div>
                <div style={{ fontSize: 16, color: '#666' }}>暂无进行中的目标</div>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* 收支趋势图 */}
      <div style={{ marginBottom: 16 }}>
        <TrendChart transactions={transactions} />
      </div>

      <Row gutter={16}>
        {/* 资产账户概览 */}
        <Col xs={24} lg={12} style={{ marginBottom: 16 }}>
          <Card title="资产账户" style={{ height: '100%' }}>
            {assetAccounts.length > 0 ? (
              <List
                dataSource={assetAccounts}
                renderItem={item => (
                  <List.Item>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: 4, background: item.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontSize: 10, fontWeight: 'bold'
                        }}>
                          {item.name.charAt(0)}
                        </div>
                        <span>{item.name}</span>
                      </div>
                      <span style={{ color: '#52c41a', fontWeight: 'bold' }}>¥{Number(item.balance).toFixed(2)}</span>
                    </div>
                  </List.Item>
                )}
              />
            ) : (
              <div style={{ textAlign: 'center', color: '#666', padding: 20 }}>暂无资产账户</div>
            )}
          </Card>
        </Col>

        {/* 负债账户概览 */}
        <Col xs={24} lg={12} style={{ marginBottom: 16 }}>
          <Card title="负债账户" style={{ height: '100%' }}>
            {debtAccounts.length > 0 ? (
              <List
                dataSource={debtAccounts}
                renderItem={item => {
                  const usage = item.limit_amount > 0 ? (item.balance / item.limit_amount * 100) : 0;
                  return (
                    <List.Item>
                      <div style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              width: 24, height: 24, borderRadius: 4, background: item.color,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: '#fff', fontSize: 10, fontWeight: 'bold'
                            }}>
                              {item.name.charAt(0)}
                            </div>
                            <span>{item.name}</span>
                          </div>
                          <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>¥{Number(item.balance).toFixed(2)}</span>
                        </div>
                        {item.limit_amount > 0 && (
                          <Progress
                            percent={Math.min(usage, 100)}
                            size="small"
                            showInfo={false}
                            strokeColor={usage > 80 ? '#ff4d4f' : usage > 50 ? '#faad14' : '#52c41a'}
                          />
                        )}
                      </div>
                    </List.Item>
                  );
                }}
              />
            ) : (
              <div style={{ textAlign: 'center', color: '#666', padding: 20 }}>暂无负债账户</div>
            )}
          </Card>
        </Col>
      </Row>

      {/* 最近交易 */}
      <Card title="最近交易">
        <Table
          dataSource={recentTransactions}
          columns={columns}
          rowKey="id"
          pagination={false}
          size="small"
          locale={{ emptyText: '暂无交易记录' }}
        />
      </Card>
    </div>
  );
}
