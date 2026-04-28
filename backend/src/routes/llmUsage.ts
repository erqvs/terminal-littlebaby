import { Router, Request, Response } from 'express';
import mysql from 'mysql2/promise';

const router = Router();

const COMPANY_DAILY_LIMIT = 300;
const COMPANY_CHANNEL_ID = 2;
const PERSONAL_CHANNEL_ID = 1;

const PRICING: Record<string, { input_per_M: number; output_per_M: number }> = {
  'GLM-4.7': { input_per_M: 0, output_per_M: 0 },
  'GLM-5': { input_per_M: 0, output_per_M: 0 },
  'GLM-5.1': { input_per_M: 6, output_per_M: 24 },
};

function getBeijingDate(): { date: string; hour: number } {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const beijing = new Date(utc + 8 * 3600000);
  const date = `${beijing.getFullYear()}-${String(beijing.getMonth() + 1).padStart(2, '0')}-${String(beijing.getDate()).padStart(2, '0')}`;
  return { date, hour: beijing.getHours() };
}

function determinePath(
  companyDailyYuan: number,
  personalUnlimited: boolean,
): 'company' | 'personal' {
  const { hour } = getBeijingDate();
  const inCompanyTime = hour >= 14 && hour < 18;

  if (inCompanyTime && companyDailyYuan < COMPANY_DAILY_LIMIT) {
    return 'company';
  }

  if (personalUnlimited) {
    return 'personal';
  }

  if (companyDailyYuan < COMPANY_DAILY_LIMIT) {
    return 'company';
  }

  return 'personal';
}

function calcYuan(promptTokens: number, completionTokens: number, model: string): number {
  const price = PRICING[model.toUpperCase()];
  if (!price) return 0;
  const inputCost = (promptTokens / 1000000) * price.input_per_M;
  const outputCost = (completionTokens / 1000000) * price.output_per_M;
  return inputCost + outputCost;
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

router.get('/status', async (_req: Request, res: Response) => {
  let conn: mysql.Connection | null = null;
  try {
    conn = await getNewApiDb();

    const { date, hour } = getBeijingDate();
    const inCompanyTime = hour >= 14 && hour < 18;

    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT channel_id, model_name, prompt_tokens, completion_tokens, created_at
       FROM logs 
       WHERE channel_id IN (?, ?)`,
      [COMPANY_CHANNEL_ID, PERSONAL_CHANNEL_ID],
    );

    let companyDailyYuan = 0;
    let personalDailyYuan = 0;
    let companyTotalYuan = 0;
    let personalTotalYuan = 0;

    for (const row of rows) {
      const cost = calcYuan(row.prompt_tokens, row.completion_tokens, row.model_name);
      const createdDate = new Date(row.created_at * 1000);
      const utc2 = createdDate.getTime() + createdDate.getTimezoneOffset() * 60000;
      const bjDate = new Date(utc2 + 8 * 3600000);
      const logDate = `${bjDate.getFullYear()}-${String(bjDate.getMonth() + 1).padStart(2, '0')}-${String(bjDate.getDate()).padStart(2, '0')}`;
      const isToday = logDate === date;

      if (row.channel_id === COMPANY_CHANNEL_ID) {
        companyTotalYuan += cost;
        if (isToday) companyDailyYuan += cost;
      } else {
        personalTotalYuan += cost;
        if (isToday) personalDailyYuan += cost;
      }
    }

    companyDailyYuan = Math.round(companyDailyYuan * 10000) / 10000;
    personalDailyYuan = Math.round(personalDailyYuan * 10000) / 10000;
    companyTotalYuan = Math.round(companyTotalYuan * 10000) / 10000;
    personalTotalYuan = Math.round(personalTotalYuan * 10000) / 10000;

    const [channels] = await conn.execute<mysql.RowDataPacket[]>(
      'SELECT id, name, models FROM channels WHERE id IN (?, ?)',
      [COMPANY_CHANNEL_ID, PERSONAL_CHANNEL_ID],
    );

    const companyChannel = channels.find((c: any) => c.id === COMPANY_CHANNEL_ID);
    const personalChannel = channels.find((c: any) => c.id === PERSONAL_CHANNEL_ID);

    const currentPath = determinePath(companyDailyYuan, true);

    res.json({
      current_path: currentPath,
      path_label: currentPath === 'company' ? '公司' : '个人',
      company: {
        name: companyChannel?.name || '公司内网LiteLLM',
        daily_yuan: companyDailyYuan,
        total_yuan: companyTotalYuan,
        daily_limit_yuan: COMPANY_DAILY_LIMIT,
        models: companyChannel?.models || '',
      },
      personal: {
        name: personalChannel?.name || '智谱CodingPlan',
        daily_yuan: personalDailyYuan,
        total_yuan: personalTotalYuan,
        unlimited: true,
        models: personalChannel?.models || '',
      },
      pricing: Object.fromEntries(
        Object.entries(PRICING).map(([k, v]) => [k, { ...v, unit: '元/百万tokens' }]),
      ),
      time_info: {
        beijing_date: date,
        beijing_hour: hour,
        in_company_time: inCompanyTime,
        company_time_range: '14:00-18:00',
      },
    });
  } catch (error: any) {
    console.error('LLM usage error:', error.message);
    res.status(500).json({ error: '获取 LLM 用量失败' });
  } finally {
    if (conn) await conn.end();
  }
});

export default router;
