import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import { Button, Layout, Menu, ConfigProvider, theme } from 'antd';
import type { MenuProps } from 'antd';
import { DashboardIcon, TransactionIcon, WalletIcon, CreditIcon, TargetIcon, ScheduleIcon, TaskIcon, LogoutIcon, BudgetIcon, CategoryIcon } from './components/Icons';
import QuickAddButton from './components/QuickAddButton';
import { isAuthenticated, logout } from './services/api';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Debts from './pages/Debts';
import Goals from './pages/Goals';
import Budgets from './pages/Budgets';
import Management from './pages/Management';
import Categories from './pages/Categories';
import Login from './pages/Login';
import Schedule from './pages/Schedule';
import OpenClawCron from './pages/OpenClawCron';
import DigestHistory from './pages/DigestHistory';
import './App.css';

const { Sider, Content } = Layout;

const financePaths = ['/accounts', '/debts', '/budgets', '/goals', '/history', '/categories'];
const quickAddPaths = ['/accounts', '/debts', '/budgets', '/goals', '/history'];

function getOpenMenuKey(pathname: string) {
  if (pathname.startsWith('/tasks')) {
    return 'tasks';
  }

  if (pathname.startsWith('/schedule')) {
    return 'courses';
  }

  if (financePaths.includes(pathname)) {
    return 'finance';
  }

  return undefined;
}

function MainLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const activeOpenKey = getOpenMenuKey(location.pathname);
  const [openKeys, setOpenKeys] = useState<string[]>(activeOpenKey ? [activeOpenKey] : []);

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  useEffect(() => {
    if (collapsed) {
      setOpenKeys([]);
      return;
    }

    setOpenKeys(activeOpenKey ? [activeOpenKey] : []);
  }, [activeOpenKey, collapsed]);

  const menuItems: MenuProps['items'] = [
    {
      key: '/',
      icon: <DashboardIcon />,
      label: <NavLink to="/">仪表盘</NavLink>,
    },
    {
      key: 'tasks',
      icon: <TaskIcon />,
      label: '任务',
      children: [
        { key: '/tasks/cron', label: <NavLink to="/tasks/cron">定时任务</NavLink> },
        { key: '/tasks/digest-history', label: <NavLink to="/tasks/digest-history">简报历史</NavLink> },
      ],
    },
    {
      key: 'courses',
      icon: <ScheduleIcon />,
      label: '课程',
      children: [
        { key: '/schedule', label: <NavLink to="/schedule">课表</NavLink> },
      ],
    },
    {
      key: 'finance',
      icon: <WalletIcon />,
      label: '财务',
      children: [
        { key: '/accounts', icon: <WalletIcon />, label: <NavLink to="/accounts">账户</NavLink> },
        { key: '/debts', icon: <CreditIcon />, label: <NavLink to="/debts">负债</NavLink> },
        { key: '/categories', icon: <CategoryIcon />, label: <NavLink to="/categories">分类</NavLink> },
        { key: '/budgets', icon: <BudgetIcon />, label: <NavLink to="/budgets">预算</NavLink> },
        { key: '/goals', icon: <TargetIcon />, label: <NavLink to="/goals">目标</NavLink> },
        { key: '/history', icon: <TransactionIcon />, label: <NavLink to="/history">历史记录</NavLink> },
      ],
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        style={{
          height: '100vh',
          position: 'sticky',
          left: 0,
          top: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="logo">
          {collapsed ? 'TC' : 'terminal-claw'}
        </div>
        <div className="sider-menu">
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            openKeys={openKeys}
            items={menuItems}
            onOpenChange={(keys) => setOpenKeys(keys.slice(-1))}
          />
        </div>
        <div className="sider-footer">
          <Button
            type="text"
            icon={<LogoutIcon />}
            className="sider-logout-button"
            onClick={handleLogout}
          >
            {!collapsed && '退出登录'}
          </Button>
        </div>
      </Sider>
      <Layout style={{ background: '#141414' }}>
        <Content className="content">
          {children}
          {quickAddPaths.includes(location.pathname) && <QuickAddButton />}
        </Content>
      </Layout>
    </Layout>
  );
}

function AppContent() {
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';

  // 登录页直接渲染，不做认证检查
  if (isLoginPage) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
      </Routes>
    );
  }

  // 其他页面：先检查认证，未认证不渲染布局，直接跳转
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  // 已认证才渲染主布局
  return (
    <MainLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/tasks" element={<Navigate to="/tasks/cron" replace />} />
        <Route path="/tasks/cron" element={<OpenClawCron />} />
        <Route path="/tasks/digest-history" element={<DigestHistory />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/debts" element={<Debts />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/budgets" element={<Budgets />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/history" element={<Management />} />
      </Routes>
    </MainLayout>
  );
}

function App() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 8,
        },
      }}
    >
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ConfigProvider>
  );
}

export default App;
