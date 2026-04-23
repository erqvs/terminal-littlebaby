export interface Category {
  id: number;
  name: string;
  type: 'income' | 'expense';
  icon: string | null;
  kind: 'leaf' | 'group';
  sort_order: number;
  member_ids?: number[];
  member_names?: string[];
  member_count?: number;
  members?: Array<{
    id: number;
    name: string;
    type: 'income' | 'expense';
    icon: string | null;
  }>;
}

// 统一的账户类型
export interface Account {
  id: number;
  name: string;
  type: 'asset' | 'debt';  // asset = 资产，debt = 负债
  icon: string;
  color: string;
  balance: number;         // 资产账户的余额；负债账户内部仍存“已用额度”
  limit_amount: number;    // 负债账户的额度上限
  repayment_day: number;   // 负债账户的还款日
  sort_order: number;
}

// 保留 Debt 类型作为向后兼容（现在本质上是 type='debt' 的 Account）
export type Debt = Account;

export interface Goal {
  id: number;
  name: string;
  icon: string;
  color: string;
  target_amount: number;
  current_amount: number;   // 按目标顺序分配到当前目标的已完成金额
  deadline: string | null;
  is_completed: boolean;
  sort_order: number;
  progress: number;
  remaining_amount: number;
  total_net_worth?: number;
}

export interface Budget {
  id: number;
  category_id: number;
  category_name: string;
  category_type: 'income' | 'expense';
  category_icon: string | null;
  category_kind: 'leaf' | 'group';
  year: number;
  month: number;
  budget_amount: number;
  actual_spent: number;
  remaining_amount: number;
  progress: number;
  alert_threshold: number;
  note: string | null;
  sort_order: number;
  is_over_budget: boolean;
  is_near_limit: boolean;
  member_names?: string[];
  member_count?: number;
}

export interface LittleBabyCronJob {
  id: string;
  name: string;
  enabled: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  description?: string;
  sessionTarget?: 'main' | 'isolated';
  wakeMode?: 'now' | 'next-heartbeat';
  schedule: {
    kind: 'cron' | 'every' | 'at';
    cron?: string;
    expr?: string;
    tz?: string;
    at?: string;
    atMs?: number;
    everyMs?: number;
    anchorMs?: number;
  };
  payload: {
    kind: 'message' | 'systemEvent';
    text: string;
  };
  state?: {
    lastRunAtMs?: number;
    lastSuccessAtMs?: number;
    lastError?: string | null;
    consecutiveFailures?: number;
  };
}

export interface LittleBabyCronStatus {
  enabled: boolean;
  storePath: string;
  jobs: number;
  nextWakeAtMs: number | null;
  target: string;
}

export interface LittleBabyCronRuns {
  entries: Array<{
    runId?: string;
    startedAtMs?: number;
    finishedAtMs?: number;
    ok?: boolean;
    skipped?: boolean;
    error?: string | null;
    summary?: string | null;
  }>;
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number | null;
}

export interface DigestHistoryRecord {
  id: number;
  digest_type: 'news' | 'github' | 'paper';
  dedupe_key: string;
  title: string | null;
  source: string | null;
  source_id: string | null;
  canonical_url: string | null;
  published_at: string | null;
  first_sent_at: string | null;
  last_sent_at: string | null;
  sent_count: number;
  meta: Record<string, unknown> | string | null;
}

export interface DigestHistorySummary {
  total: number;
  news_count: number;
  github_count: number;
  paper_count: number;
  recent_7d_count: number;
}

export interface DigestHistoryListResponse {
  items: DigestHistoryRecord[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  summary: DigestHistorySummary;
}

export interface Transaction {
  id: number;
  amount: number;
  category_id: number;
  category_name: string;
  category_type: 'income' | 'expense';
  account_id: number;
  account_name: string;
  account_type: 'asset' | 'debt';
  description: string;
  date: string;
}

export interface LittleBabyMemoryFile {
  name: string;
  path: string;
  size: number;
  modified: string;
  content?: string;
}

export interface LittleBabyMemorySearchResult {
  path: string;
  text: string;
  score?: number;
  source?: string;
  start_line?: number;
  end_line?: number;
  snippet?: string;
}

export interface LittleBabyMemoryAgentStatus {
  agentId: string;
  status: {
    backend: string;
    files: number;
    chunks: number;
    dirty: boolean;
    dbPath: string;
    sources: string[];
    custom?: {
      searchMode: string;
      providerUnavailableReason?: string;
    };
  };
  scan?: {
    issues: string[];
    totalFiles: number;
  };
}
