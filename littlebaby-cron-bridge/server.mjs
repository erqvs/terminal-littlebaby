import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { URL } from 'node:url';

const execFileAsync = promisify(execFile);

const HOST = process.env.LITTLEBABY_CRON_BRIDGE_HOST || '127.0.0.1';
const PORT = Number(process.env.LITTLEBABY_CRON_BRIDGE_PORT || 3011);
const TOKEN = process.env.LITTLEBABY_CRON_BRIDGE_TOKEN || '';
const TARGET = process.env.LITTLEBABY_CRON_TARGET || 'custom';
const LITTLEBABY_BIN = process.env.LITTLEBABY_BIN || 'littlebaby';

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(new Error('请求体不是有效 JSON'));
      }
    });
    req.on('error', reject);
  });
}

function requireAuth(req, res) {
  if (!TOKEN) {
    return true;
  }

  const authHeader = req.headers.authorization || '';
  if (authHeader === `Bearer ${TOKEN}`) {
    return true;
  }

  sendJson(res, 401, { error: 'unauthorized' });
  return false;
}

function extractJson(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return null;
  }

  const objectStart = trimmed.indexOf('{');
  if (objectStart !== -1) {
    return JSON.parse(trimmed.slice(objectStart));
  }

  throw new Error(trimmed);
}

async function runCronCommand(args) {
  try {
    const { stdout } = await execFileAsync(
      LITTLEBABY_BIN,
      ['--log-level', 'silent', 'cron', ...args],
      {
        env: process.env,
        maxBuffer: 8 * 1024 * 1024,
      }
    );

    return { ok: true, data: extractJson(stdout), raw: stdout };
  } catch (error) {
    const stderr = error.stderr?.toString?.().trim?.() || '';
    const stdout = error.stdout?.toString?.().trim?.() || '';
    return {
      ok: false,
      error: stderr || stdout || error.message || 'LittleBaby cron command failed',
      stdout,
      stderr,
    };
  }
}

async function runCronTextCommand(args) {
  try {
    const { stdout } = await execFileAsync(
      LITTLEBABY_BIN,
      ['--log-level', 'silent', 'cron', ...args],
      {
        env: process.env,
        maxBuffer: 8 * 1024 * 1024,
      }
    );

    return {
      ok: true,
      output: stdout.trim(),
    };
  } catch (error) {
    const stderr = error.stderr?.toString?.().trim?.() || '';
    const stdout = error.stdout?.toString?.().trim?.() || '';
    return {
      ok: false,
      error: stderr || stdout || error.message || 'LittleBaby cron command failed',
      stdout,
      stderr,
    };
  }
}

function appendValue(args, flag, value) {
  if (value === undefined || value === null || value === '') {
    return;
  }

  args.push(flag, String(value));
}

function buildScheduleArgs(body) {
  const scheduleKind = body.scheduleKind;
  if (!scheduleKind) {
    throw new Error('缺少 scheduleKind');
  }

  if (scheduleKind === 'cron') {
    if (!body.scheduleValue) {
      throw new Error('缺少 cron 表达式');
    }
    return ['--cron', String(body.scheduleValue), ...(body.tz ? ['--tz', String(body.tz)] : [])];
  }

  if (scheduleKind === 'every') {
    if (!body.scheduleValue) {
      throw new Error('缺少 every 时长');
    }
    return ['--every', String(body.scheduleValue)];
  }

  if (scheduleKind === 'at') {
    if (!body.scheduleValue) {
      throw new Error('缺少执行时间');
    }
    return ['--at', String(body.scheduleValue), ...(body.tz ? ['--tz', String(body.tz)] : [])];
  }

  throw new Error('不支持的 scheduleKind');
}

function buildPayloadArgs(body, isCreate) {
  const payloadKind = body.payloadKind;
  const payloadText = body.payloadText;

  if (!payloadKind) {
    throw new Error('缺少 payloadKind');
  }

  if ((payloadText === undefined || payloadText === null || payloadText === '') && isCreate) {
    throw new Error('缺少任务内容');
  }

  const args = [];

  if (payloadKind === 'systemEvent') {
    appendValue(args, '--system-event', payloadText);
    return args;
  }

  if (payloadKind === 'message') {
    appendValue(args, '--message', payloadText);

    const sessionTarget = body.sessionTarget || 'isolated';
    appendValue(args, '--session', sessionTarget);

    if (body.announce) {
      args.push('--announce');
    } else if (sessionTarget !== 'main') {
      args.push('--no-deliver');
    }

    appendValue(args, '--model', body.model);
    appendValue(args, '--thinking', body.thinking);

    if (body.lightContext) {
      args.push('--light-context');
    }

    return args;
  }

  throw new Error('不支持的 payloadKind');
}

function buildCreateArgs(body) {
  if (!body.name) {
    throw new Error('缺少任务名称');
  }

  const args = ['add', '--name', String(body.name), '--json'];

  appendValue(args, '--description', body.description);
  args.push(...buildScheduleArgs(body));
  args.push(...buildPayloadArgs(body, true));

  if (body.disabled) {
    args.push('--disabled');
  }

  if (body.exact) {
    args.push('--exact');
  }

  return args;
}

function buildEditArgs(id, body) {
  const args = ['edit', id];

  appendValue(args, '--name', body.name);
  appendValue(args, '--description', body.description);

  if (body.scheduleKind) {
    args.push(...buildScheduleArgs(body));
  }

  if (body.payloadKind) {
    args.push(...buildPayloadArgs(body, false));
  } else if (body.payloadText !== undefined) {
    throw new Error('修改内容时必须同时指定 payloadKind');
  }

  if (body.exact) {
    args.push('--exact');
  }

  return args;
}

async function fetchJobById(id) {
  const listResult = await runCronCommand(['list', '--all', '--json']);
  if (!listResult.ok) {
    return listResult;
  }

  const job = listResult.data.jobs?.find((item) => item.id === id) || null;
  return { ok: true, data: job };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true, target: TARGET });
    return;
  }

  if (!requireAuth(req, res)) {
    return;
  }

  try {
    if (req.method === 'GET' && url.pathname === '/cron/status') {
      const result = await runCronCommand(['status', '--json']);
      sendJson(res, result.ok ? 200 : 500, result.ok ? { ...result.data, target: TARGET } : { error: result.error });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/cron/jobs') {
      const args = ['list'];
      if (url.searchParams.get('all') !== 'false') {
        args.push('--all');
      }
      args.push('--json');

      const result = await runCronCommand(args);
      sendJson(res, result.ok ? 200 : 500, result.ok ? { ...result.data, target: TARGET } : { error: result.error });
      return;
    }

    const runsMatch = url.pathname.match(/^\/cron\/jobs\/([^/]+)\/runs$/);
    if (req.method === 'GET' && runsMatch) {
      const [, id] = runsMatch;
      const limit = url.searchParams.get('limit') || '20';
      const result = await runCronCommand(['runs', '--id', id, '--limit', limit]);
      sendJson(res, result.ok ? 200 : 500, result.ok ? result.data : { error: result.error });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/cron/jobs') {
      const body = await parseBody(req);
      const result = await runCronCommand(buildCreateArgs(body));
      sendJson(res, result.ok ? 200 : 400, result.ok ? result.data : { error: result.error });
      return;
    }

    const jobMatch = url.pathname.match(/^\/cron\/jobs\/([^/]+)$/);
    if (jobMatch && req.method === 'PATCH') {
      const [, id] = jobMatch;
      const body = await parseBody(req);
      const editResult = await runCronTextCommand(buildEditArgs(id, body));

      if (!editResult.ok) {
        sendJson(res, 400, { error: editResult.error });
        return;
      }

      const jobResult = await fetchJobById(id);
      sendJson(res, jobResult.ok ? 200 : 500, jobResult.ok ? jobResult.data : { error: jobResult.error });
      return;
    }

    if (jobMatch && req.method === 'DELETE') {
      const [, id] = jobMatch;
      const result = await runCronCommand(['rm', id, '--json']);
      sendJson(res, result.ok ? 200 : 400, result.ok ? result.data : { error: result.error });
      return;
    }

    const actionMatch = url.pathname.match(/^\/cron\/jobs\/([^/]+)\/(enable|disable|run)$/);
    if (actionMatch && req.method === 'POST') {
      const [, id, action] = actionMatch;
      const result = await runCronTextCommand([action, id]);

      if (!result.ok) {
        sendJson(res, 400, { error: result.error });
        return;
      }

      if (action === 'run') {
        sendJson(res, 200, { ok: true, output: result.output });
        return;
      }

      const jobResult = await fetchJobById(id);
      sendJson(res, jobResult.ok ? 200 : 500, jobResult.ok ? jobResult.data : { error: jobResult.error });
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : 'bad request' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`LittleBaby cron bridge listening on http://${HOST}:${PORT} (${TARGET})`);
});
