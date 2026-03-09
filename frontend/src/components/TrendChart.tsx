import { useMemo, useState } from 'react';
import { Card, Segmented } from 'antd';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import type { Transaction } from '../types';

interface TrendChartProps {
  transactions: Transaction[];
}

type TimeRange = '7days' | '3weeks' | '3months';

export default function TrendChart({ transactions }: TrendChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('7days');

  const chartData = useMemo(() => {
    const today = dayjs();
    let startDate: dayjs.Dayjs;
    let dateFormat: string;
    let groupBy: 'day' | 'week' | 'month';

    switch (timeRange) {
      case '7days':
        startDate = today.subtract(6, 'day');
        dateFormat = 'MM-DD';
        groupBy = 'day';
        break;
      case '3weeks':
        startDate = today.subtract(20, 'day');
        dateFormat = 'MM-DD';
        groupBy = 'day';
        break;
      case '3months':
        startDate = today.subtract(2, 'month').startOf('month');
        dateFormat = 'MM月';
        groupBy = 'month';
        break;
    }

    // 生成时间标签
    const labels: string[] = [];
    const incomeData: Record<string, number> = {};
    const expenseData: Record<string, number> = {};

    if (groupBy === 'day') {
      let current = startDate;
      while (current.isBefore(today) || current.isSame(today, 'day')) {
        const key = current.format('YYYY-MM-DD');
        const label = current.format(dateFormat);
        labels.push(label);
        incomeData[key] = 0;
        expenseData[key] = 0;
        current = current.add(1, 'day');
      }
    } else {
      // 按月分组
      for (let i = 0; i < 3; i++) {
        const month = today.subtract(2 - i, 'month').startOf('month');
        const key = month.format('YYYY-MM');
        const label = month.format(dateFormat);
        labels.push(label);
        incomeData[key] = 0;
        expenseData[key] = 0;
      }
    }

    // 聚合交易数据
    transactions.forEach(t => {
      const date = dayjs(t.date);
      if (date.isBefore(startDate)) return;

      let key: string;
      if (groupBy === 'month') {
        key = date.format('YYYY-MM');
      } else {
        key = date.format('YYYY-MM-DD');
      }

      if (t.category_type === 'income') {
        incomeData[key] = (incomeData[key] || 0) + Number(t.amount);
      } else {
        expenseData[key] = (expenseData[key] || 0) + Number(t.amount);
      }
    });

    const incomeValues = Object.values(incomeData);
    const expenseValues = Object.values(expenseData);

    return { labels, incomeValues, expenseValues };
  }, [transactions, timeRange]);

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      borderColor: '#333',
      textStyle: { color: '#fff' },
      formatter: (params: any) => {
        let result = `<div style="font-weight:bold;margin-bottom:4px">${params[0].axisValue}</div>`;
        params.forEach((item: any) => {
          result += `<div style="display:flex;justify-content:space-between;gap:20px">
            <span>${item.marker} ${item.seriesName}</span>
            <span style="font-weight:bold">¥${item.value.toFixed(2)}</span>
          </div>`;
        });
        return result;
      },
    },
    legend: {
      data: ['收入', '支出'],
      top: 0,
      textStyle: { color: '#999' },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '40px',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: chartData.labels,
      axisLine: { lineStyle: { color: '#333' } },
      axisLabel: { color: '#999' },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#222' } },
      axisLabel: {
        color: '#999',
        formatter: (value: number) => {
          if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
          return value;
        },
      },
    },
    series: [
      {
        name: '收入',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#52c41a', width: 2 },
        itemStyle: { color: '#52c41a' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(82, 196, 26, 0.3)' },
              { offset: 1, color: 'rgba(82, 196, 26, 0)' },
            ],
          },
        },
        data: chartData.incomeValues,
      },
      {
        name: '支出',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#ff4d4f', width: 2 },
        itemStyle: { color: '#ff4d4f' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(255, 77, 79, 0.3)' },
              { offset: 1, color: 'rgba(255, 77, 79, 0)' },
            ],
          },
        },
        data: chartData.expenseValues,
      },
    ],
  };

  return (
    <Card
      title="收支趋势"
      extra={
        <Segmented
          value={timeRange}
          onChange={(v) => setTimeRange(v as TimeRange)}
          options={[
            { label: '近7天', value: '7days' },
            { label: '近3周', value: '3weeks' },
            { label: '近3月', value: '3months' },
          ]}
          size="small"
        />
      }
    >
      <ReactECharts
        option={option}
        style={{ height: 300 }}
        opts={{ renderer: 'svg' }}
      />
    </Card>
  );
}
