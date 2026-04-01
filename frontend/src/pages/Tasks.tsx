import { Card } from 'antd';

export default function Tasks() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>任务</h2>
      </div>

      <Card
        style={{
          minHeight: 360,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.88)',
              marginBottom: 8,
            }}
          >
            任务页面暂未开始配置
          </div>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>
            这里先留白，后续你可以直接在这块继续扩展。
          </div>
        </div>
      </Card>
    </div>
  );
}
