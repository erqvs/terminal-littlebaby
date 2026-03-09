import { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import { Layout, Menu, ConfigProvider, theme } from 'antd';
import { DashboardIcon, TransactionIcon, WalletIcon, CreditIcon, TargetIcon, ScheduleIcon } from './components/Icons';
import QuickAddButton from './components/QuickAddButton';
import { isAuthenticated, logout } from './services/api';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Debts from './pages/Debts';
import Goals from './pages/Goals';
import Management from './pages/Management';
import Login from './pages/Login';
import Schedule from './pages/Schedule';
import './App.css';

const { Sider, Content } = Layout;

function MainLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  const menuItems = [
    { key: '/', icon: <DashboardIcon />, label: <NavLink to="/">仪表盘</NavLink> },
    { key: '/schedule', icon: <ScheduleIcon />, label: <NavLink to="/schedule">课表</NavLink> },
    { key: '/accounts', icon: <WalletIcon />, label: <NavLink to="/accounts">账户</NavLink> },
    { key: '/debts', icon: <CreditIcon />, label: <NavLink to="/debts">负债</NavLink> },
    { key: '/goals', icon: <TargetIcon />, label: <NavLink to="/goals">目标</NavLink> },
    { key: '/history', icon: <TransactionIcon />, label: <NavLink to="/history">历史记录</NavLink> },
    { type: 'divider' as const },
    { key: 'logout', icon: <span>🚪</span>, label: '退出登录' },
  ];

  const handleMenuClick = (e: { key: string }) => {
    if (e.key === 'logout') {
      handleLogout();
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'sticky',
          left: 0,
          top: 0,
          bottom: 0,
        }}
      >
        <div className="logo">
          {collapsed ? '账' : '记账本'}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout style={{ background: '#141414' }}>
        <Content className="content">
          {children}
          <QuickAddButton />
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
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/debts" element={<Debts />} />
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
