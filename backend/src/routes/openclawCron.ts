import { Router, Request, Response } from 'express';

const router = Router();

const BRIDGE_URL = process.env.OPENCLAW_CRON_BRIDGE_URL || 'http://INTERNAL_IP:3011';
const BRIDGE_TOKEN = process.env.OPENCLAW_CRON_BRIDGE_TOKEN || '';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseTimeOfDay(value: unknown): { hour: number; minute: number } {
  if (!isNonEmptyString(value)) {
    throw new Error('请输入执行时间');
  }

  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error('执行时间格式不正确，应为 HH:mm');
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error('执行时间超出有效范围');
  }

  return { hour, minute };
}

function parsePositiveInteger(value: unknown, label: string): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`${label}必须是正整数`);
  }
  return numeric;
}

function parseMonthDay(value: unknown): number {
  const day = parsePositiveInteger(value, '每月日期');
  if (day < 1 || day > 31) {
    throw new Error('每月日期必须在 1 到 31 之间');
  }
  return day;
}

function parseWeekday(value: unknown): string {
  const weekday = String(value ?? '').trim();
  const allowed = new Set(['0', '1', '2', '3', '4', '5', '6', '7']);
  if (!allowed.has(weekday)) {
    throw new Error('星期设置无效');
  }
  return weekday === '7' ? '0' : weekday;
}

function parseIntervalUnit(value: unknown): 'm' | 'h' | 'd' {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'm' || raw === 'minute' || raw === 'minutes') {
    return 'm';
  }
  if (raw === 'h' || raw === 'hour' || raw === 'hours') {
    return 'h';
  }
  if (raw === 'd' || raw === 'day' || raw === 'days') {
    return 'd';
  }
  throw new Error('固定间隔单位无效');
}

function normalizeScheduleBody(body: Record<string, unknown>) {
  const scheduleMode = typeof body.scheduleMode === 'string' ? body.scheduleMode : '';
  if (!scheduleMode) {
    return body;
  }

  const normalized: Record<string, unknown> = { ...body };
  const tz = isNonEmptyString(body.tz) ? body.tz.trim() : 'Asia/Shanghai';

  if (scheduleMode === 'daily') {
    const { hour, minute } = parseTimeOfDay(body.timeOfDay);
    normalized.scheduleKind = 'cron';
    normalized.scheduleValue = `${minute} ${hour} * * *`;
    normalized.tz = tz;
    return normalized;
  }

  if (scheduleMode === 'weekdays') {
    const { hour, minute } = parseTimeOfDay(body.timeOfDay);
    normalized.scheduleKind = 'cron';
    normalized.scheduleValue = `${minute} ${hour} * * 1-5`;
    normalized.tz = tz;
    return normalized;
  }

  if (scheduleMode === 'weekly') {
    const { hour, minute } = parseTimeOfDay(body.timeOfDay);
    const weekday = parseWeekday(body.weekday);
    normalized.scheduleKind = 'cron';
    normalized.scheduleValue = `${minute} ${hour} * * ${weekday}`;
    normalized.tz = tz;
    return normalized;
  }

  if (scheduleMode === 'monthly') {
    const { hour, minute } = parseTimeOfDay(body.timeOfDay);
    const day = parseMonthDay(body.dayOfMonth);
    normalized.scheduleKind = 'cron';
    normalized.scheduleValue = `${minute} ${hour} ${day} * *`;
    normalized.tz = tz;
    return normalized;
  }

  if (scheduleMode === 'interval') {
    const count = parsePositiveInteger(body.intervalCount, '固定间隔数值');
    const unit = parseIntervalUnit(body.intervalUnit);
    normalized.scheduleKind = 'every';
    normalized.scheduleValue = `${count}${unit}`;
    delete normalized.tz;
    return normalized;
  }

  if (scheduleMode === 'once') {
    if (!isNonEmptyString(body.oneTimeAt)) {
      throw new Error('请选择执行时间');
    }
    normalized.scheduleKind = 'at';
    normalized.scheduleValue = body.oneTimeAt.trim();
    normalized.tz = tz;
    return normalized;
  }

  if (scheduleMode === 'custom') {
    if (!isNonEmptyString(body.cronExpression)) {
      throw new Error('请输入 Cron 表达式');
    }
    normalized.scheduleKind = 'cron';
    normalized.scheduleValue = body.cronExpression.trim();
    normalized.tz = tz;
    return normalized;
  }

  throw new Error('不支持的调度方式');
}

async function bridgeFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${BRIDGE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(BRIDGE_TOKEN ? { Authorization: `Bearer ${BRIDGE_TOKEN}` } : {}),
      ...(init?.headers || {}),
    },
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = { error: 'bridge returned invalid json' };
  }

  return { response, payload };
}

router.get('/status', async (_req: Request, res: Response) => {
  try {
    const { response, payload } = await bridgeFetch('/cron/status');
    res.status(response.status).json(payload);
  } catch (error) {
    console.error('Error fetching OpenClaw cron status:', error);
    res.status(500).json({ error: 'Failed to fetch OpenClaw cron status' });
  }
});

router.get('/jobs', async (req: Request, res: Response) => {
  const all = req.query.all === 'false' ? 'false' : 'true';

  try {
    const { response, payload } = await bridgeFetch(`/cron/jobs?all=${all}`);
    res.status(response.status).json(payload);
  } catch (error) {
    console.error('Error fetching OpenClaw cron jobs:', error);
    res.status(500).json({ error: 'Failed to fetch OpenClaw cron jobs' });
  }
});

router.get('/jobs/:id/runs', async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const limit = typeof req.query.limit === 'string' ? req.query.limit : '20';

  try {
    const { response, payload } = await bridgeFetch(`/cron/jobs/${id}/runs?limit=${encodeURIComponent(limit)}`);
    res.status(response.status).json(payload);
  } catch (error) {
    console.error('Error fetching OpenClaw cron runs:', error);
    res.status(500).json({ error: 'Failed to fetch OpenClaw cron runs' });
  }
});

router.post('/jobs', async (req: Request, res: Response) => {
  try {
    const requestBody = normalizeScheduleBody(req.body as Record<string, unknown>);
    const { response, payload } = await bridgeFetch('/cron/jobs', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });
    res.status(response.status).json(payload);
  } catch (error) {
    console.error('Error creating OpenClaw cron job:', error);
    res.status(500).json({ error: 'Failed to create OpenClaw cron job' });
  }
});

router.patch('/jobs/:id', async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  try {
    const requestBody = normalizeScheduleBody(req.body as Record<string, unknown>);
    const { response, payload } = await bridgeFetch(`/cron/jobs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(requestBody),
    });
    res.status(response.status).json(payload);
  } catch (error) {
    console.error('Error updating OpenClaw cron job:', error);
    res.status(500).json({ error: 'Failed to update OpenClaw cron job' });
  }
});

router.post('/jobs/:id/enable', async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  try {
    const { response, payload } = await bridgeFetch(`/cron/jobs/${id}/enable`, {
      method: 'POST',
      body: JSON.stringify(req.body || {}),
    });
    res.status(response.status).json(payload);
  } catch (error) {
    console.error('Error enabling OpenClaw cron job:', error);
    res.status(500).json({ error: 'Failed to enable OpenClaw cron job' });
  }
});

router.post('/jobs/:id/disable', async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  try {
    const { response, payload } = await bridgeFetch(`/cron/jobs/${id}/disable`, {
      method: 'POST',
      body: JSON.stringify(req.body || {}),
    });
    res.status(response.status).json(payload);
  } catch (error) {
    console.error('Error disabling OpenClaw cron job:', error);
    res.status(500).json({ error: 'Failed to disable OpenClaw cron job' });
  }
});

router.post('/jobs/:id/run', async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  try {
    const { response, payload } = await bridgeFetch(`/cron/jobs/${id}/run`, {
      method: 'POST',
      body: JSON.stringify(req.body || {}),
    });
    res.status(response.status).json(payload);
  } catch (error) {
    console.error('Error running OpenClaw cron job:', error);
    res.status(500).json({ error: 'Failed to run OpenClaw cron job' });
  }
});

router.delete('/jobs/:id', async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  try {
    const { response, payload } = await bridgeFetch(`/cron/jobs/${id}`, {
      method: 'DELETE',
    });
    res.status(response.status).json(payload);
  } catch (error) {
    console.error('Error deleting OpenClaw cron job:', error);
    res.status(500).json({ error: 'Failed to delete OpenClaw cron job' });
  }
});

export default router;
