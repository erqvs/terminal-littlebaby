import { useEffect, useLayoutEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { Button, Layout, Menu, ConfigProvider, theme, Spin } from 'antd';
import type { MenuProps } from 'antd';
import { DashboardIcon, TransactionIcon, WalletIcon, CreditIcon, TargetIcon, ScheduleIcon, LogoutIcon, BudgetIcon, CategoryIcon } from './components/Icons';
import QuickAddButton from './components/QuickAddButton';
import { logout, verifyAuth } from './services/api';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Debts from './pages/Debts';
import Goals from './pages/Goals';
import Budgets from './pages/Budgets';
import Management from './pages/Management';
import Categories from './pages/Categories';
import Login from './pages/Login';
import Schedule from './pages/Schedule';

import './App.css';

const { Sider, Content } = Layout;

const financePaths = ['/accounts', '/debts', '/budgets', '/goals', '/history', '/categories'];
const quickAddPaths = ['/accounts', '/debts', '/budgets', '/goals', '/history'];
const menuItems: MenuProps['items'] = [
  {
    key: '/',
    icon: <DashboardIcon />,
    label: '仪表盘',
  },

  {
    key: 'courses',
    icon: <ScheduleIcon />,
    label: '课程',
    children: [
      { key: '/schedule', label: '课表' },
    ],
  },
  {
    key: 'finance',
    icon: <WalletIcon />,
    label: '财务',
    children: [
      { key: '/accounts', icon: <WalletIcon />, label: '账户' },
      { key: '/debts', icon: <CreditIcon />, label: '负债' },
      { key: '/categories', icon: <CategoryIcon />, label: '分类' },
      { key: '/budgets', icon: <BudgetIcon />, label: '预算' },
      { key: '/goals', icon: <TargetIcon />, label: '目标' },
      { key: '/history', icon: <TransactionIcon />, label: '历史记录' },
    ],
  },
];

function getOpenMenuKey(pathname: string) {
  if (pathname.startsWith('/schedule')) {
    return 'courses';
  }

  if (financePaths.includes(pathname)) {
    return 'finance';
  }

  return undefined;
}

function MainLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const activeOpenKey = getOpenMenuKey(location.pathname);
  const [collapsed, setCollapsed] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>(activeOpenKey ? [activeOpenKey] : []);

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  useLayoutEffect(() => {
    if (collapsed) {
      setOpenKeys([]);
      return;
    }

    setOpenKeys(activeOpenKey ? [activeOpenKey] : []);
  }, [activeOpenKey, collapsed]);

  return (
    <Layout hasSider style={{ minHeight: '100vh' }}>
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
          {collapsed ? 'TC' : 'terminal-littlebaby'}
        </div>
        <div className="sider-menu">
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            openKeys={collapsed ? [] : openKeys}
            items={menuItems}
            onOpenChange={(keys) => setOpenKeys(keys.slice(-1))}
            onClick={({ key }) => {
              if (typeof key === 'string' && key.startsWith('/')) {
                navigate(key);
              }
            }}
          />
        </div>
        <div className="sider-footer">
          <Button
            type="text"
            icon={<LogoutIcon />}
            className="sider-logout-button"
            onClick={() => { void handleLogout(); }}
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
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking');

  useEffect(() => {
    let active = true;

    void verifyAuth().then((valid) => {
      if (!active) {
        return;
      }
      setAuthState(valid ? 'authenticated' : 'unauthenticated');
    });

    return () => {
      active = false;
    };
  }, []);

  if (authState === 'checking') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (isLoginPage) {
    if (authState === 'authenticated') {
      return <Navigate to="/" replace />;
    }

    return (
      <Routes>
        <Route path="/login" element={<Login />} />
      </Routes>
    );
  }

  // 其他页面：先检查认证，未认证不渲染布局，直接跳转
  if (authState !== 'authenticated') {
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
