import mysql from 'mysql2/promise';

const COMPANY_CHANNEL_ID = 2;
const PERSONAL_CHANNEL_ID = 1;
const COMPANY_DAILY_LIMIT = 300;
const CHECK_INTERVAL_MS = 60_000;

const PRICING: Record<string, { input_per_M: number; output_per_M: number }> = {
  'GLM-4.7': { input_per_M: 0, output_per_M: 0 },
  'GLM-5': { input_per_M: 0, output_per_M: 0 },
  'GLM-5.1': { input_per_M: 6, output_per_M: 24 },
};

function getBeijingHour(): number {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const beijing = new Date(utc + 8 * 3600000);
  return beijing.getHours();
}

function getBeijingDateStr(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const beijing = new Date(utc + 8 * 3600000);
  return `${beijing.getFullYear()}-${String(beijing.getMonth() + 1).padStart(2, '0')}-${String(beijing.getDate()).padStart(2, '0')}`;
}

function calcYuan(promptTokens: number, completionTokens: number, model: string): number {
  const price = PRICING[model.toUpperCase()];
  if (!price) return 0;
  return (promptTokens / 1000000) * price.input_per_M + (completionTokens / 1000000) * price.output_per_M;
}

async function getNewApiDb() {
  return mysql.createConnection({
    host: process.env.DB_HOST_NEWAPI || 'mysql',
    port: 3306,
    user: 'root',
    password: process.env.DB_PASSWORD_NEWAPI || '',
    database: 'new_api',
  });
}

async function getCompanyDailyYuan(): Promise<number> {
  let conn: mysql.Connection | null = null;
  try {
    conn = await getNewApiDb();
    const today = getBeijingDateStr();
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT channel_id, model_name, prompt_tokens, completion_tokens, created_at
       FROM logs WHERE channel_id = ?`,
      [COMPANY_CHANNEL_ID],
    );
    let total = 0;
    for (const row of rows) {
      const cost = calcYuan(row.prompt_tokens, row.completion_tokens, row.model_name);
      const createdDate = new Date(row.created_at * 1000);
      const utc2 = createdDate.getTime() + createdDate.getTimezoneOffset() * 60000;
      const bjDate = new Date(utc2 + 8 * 3600000);
      const logDate = `${bjDate.getFullYear()}-${String(bjDate.getMonth() + 1).padStart(2, '0')}-${String(bjDate.getDate()).padStart(2, '0')}`;
      if (logDate === today) total += cost;
    }
    return Math.round(total * 10000) / 10000;
  } finally {
    if (conn) await conn.end();
  }
}

type DesiredChannel = 'company' | 'personal';

function determineDesiredChannel(hour: number, companyDailyYuan: number): DesiredChannel {
  const inCompanyTime = hour >= 14 && hour < 18;
  if (inCompanyTime && companyDailyYuan < COMPANY_DAILY_LIMIT) return 'company';
  return 'personal';
}

async function setChannelStatus(channelId: number, enabled: boolean): Promise<void> {
  let conn: mysql.Connection | null = null;
  try {
    conn = await getNewApiDb();
    await conn.execute('UPDATE channels SET status = ? WHERE id = ?', [enabled ? 1 : 2, channelId]);
    console.log(`[channel-scheduler] channel ${channelId} -> ${enabled ? 'enabled' : 'disabled'}`);
  } finally {
    if (conn) await conn.end();
  }
}

let lastDesired: DesiredChannel | null = null;

async function tick() {
  try {
    const hour = getBeijingHour();
    const companyDailyYuan = await getCompanyDailyYuan();
    const desired = determineDesiredChannel(hour, companyDailyYuan);

    if (desired === lastDesired) return;

    console.log(`[channel-scheduler] switching to ${desired} (hour=${hour}, companyDaily=${companyDailyYuan})`);
    lastDesired = desired;

    if (desired === 'company') {
      await setChannelStatus(COMPANY_CHANNEL_ID, true);
      await setChannelStatus(PERSONAL_CHANNEL_ID, false);
    } else {
      await setChannelStatus(COMPANY_CHANNEL_ID, false);
      await setChannelStatus(PERSONAL_CHANNEL_ID, true);
    }
  } catch (err: any) {
    console.error(`[channel-scheduler] tick error: ${err.message}`);
  }
}

export function startChannelScheduler(): void {
  console.log('[channel-scheduler] starting (checks every 60s)');
  tick();
  setInterval(tick, CHECK_INTERVAL_MS);
}
