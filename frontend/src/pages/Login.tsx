import { useState } from 'react';
import { Form, Input, Button, message } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/api';
import { MoneyIcon } from '../components/Icons';

interface LoginForm {
  password: string;
}

interface LoginResponse {
  success: boolean;
  token?: string;
  message?: string;
  locked?: boolean;
}

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (values: LoginForm) => {
    if (locked) return;
    
    setLoading(true);
    try {
      const res: LoginResponse = await login(values.password);
      if (res.success && res.token) {
        localStorage.setItem('token', res.token);
        message.success('登录成功');
        navigate('/');
      } else {
        if (res.locked) {
          setLocked(true);
        }
        message.error(res.message || '密码错误');
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: LoginResponse } };
      const data = err.response?.data;
      if (data?.locked) {
        setLocked(true);
      }
      message.error(data?.message || '登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#141414',
      }}
    >
      <div
        style={{
          width: 360,
          padding: 40,
          background: '#1f1f1f',
          borderRadius: 12,
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.5)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 12,
              background: '#262626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <MoneyIcon style={{ width: 32, height: 32, color: '#52c41a' }} />
          </div>
          <h1
            style={{
              color: '#fff',
              fontSize: 24,
              fontWeight: 600,
              margin: 0,
            }}
          >
            记账本
          </h1>
          <p
            style={{
              color: 'rgba(255, 255, 255, 0.45)',
              fontSize: 14,
              marginTop: 8,
            }}
          >
            请输入密码登录
          </p>
        </div>

        <Form<LoginForm> onFinish={onFinish} layout="vertical">
          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: 'rgba(255,255,255,0.45)' }} />}
              placeholder="输入密码"
              size="large"
              style={{
                background: '#141414',
                border: '1px solid #424242',
                borderRadius: 8,
              }}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              loading={loading}
              block
              style={{
                height: 44,
                borderRadius: 8,
                fontWeight: 500,
              }}
            >
              登录
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
}
