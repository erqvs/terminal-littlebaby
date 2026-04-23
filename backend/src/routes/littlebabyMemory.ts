import '../bootstrap';
import { Router, Request, Response } from 'express';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const router = Router();

const LITTLEBABY_HOME = process.env.LITTLEBABY_HOME || path.join(os.homedir(), '.littlebaby');
const WORKSPACE_DIR = path.join(LITTLEBABY_HOME, 'workspace');
const MEMORY_DIR = path.join(WORKSPACE_DIR, 'memory');

function hasLittleBaby(): boolean {
  try {
    execSync('which littlebaby', { encoding: 'utf-8', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function runLittleBaby(args: string): string {
  const result = execSync(`littlebaby ${args}`, {
    encoding: 'utf-8',
    timeout: 30000,
    env: { ...process.env, HOME: os.homedir() },
  });
  return result;
}

function safeReadFile(filePath: string): string | null {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch {}
  return null;
}

interface MemoryFile {
  name: string;
  path: string;
  size: number;
  modified: string;
}

function listMemoryFiles(): MemoryFile[] {
  const files: MemoryFile[] = [];

  for (const filename of ['MEMORY.md', 'memory.md']) {
    const full = path.join(WORKSPACE_DIR, filename);
    if (fs.existsSync(full)) {
      const stat = fs.statSync(full);
      files.push({ name: filename, path: filename, size: stat.size, modified: stat.mtime.toISOString() });
    }
  }

  if (fs.existsSync(MEMORY_DIR)) {
    try {
      const entries = fs.readdirSync(MEMORY_DIR).sort();
      for (const entry of entries) {
        if (entry.endsWith('.md')) {
          const fullPath = path.join(MEMORY_DIR, entry);
          const stat = fs.statSync(fullPath);
          files.push({ name: entry, path: `memory/${entry}`, size: stat.size, modified: stat.mtime.toISOString() });
        }
      }
    } catch {}
  }

  return files;
}

function searchFiles(query: string, maxResults: number) {
  const lowerQuery = query.toLowerCase();
  const results: any[] = [];

  const files = listMemoryFiles();
  for (const file of files) {
    const content = safeReadFile(path.join(WORKSPACE_DIR, file.path));
    if (!content) continue;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(lowerQuery)) {
        const startLine = i + 1;
        const endLine = Math.min(i + 1, lines.length);
        const snippetLines: string[] = [];
        const snippetStart = Math.max(0, i - 2);
        const snippetEnd = Math.min(lines.length, i + 3);
        for (let j = snippetStart; j < snippetEnd; j++) {
          snippetLines.push(lines[j]);
        }

        results.push({
          path: file.path,
          text: snippetLines.join('\n'),
          start_line: startLine,
          end_line: endLine,
          source: 'memory',
          score: 0.5,
        });

        if (results.length >= maxResults) break;
      }
    }
    if (results.length >= maxResults) break;
  }

  return results;
}

function buildFilesystemStatus() {
  const files = listMemoryFiles();
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  let dbExists = false;
  let dbPath = '';
  const agentDbPath = path.join(LITTLEBABY_HOME, 'memory', 'main.sqlite');
  if (fs.existsSync(agentDbPath)) {
    dbExists = true;
    dbPath = agentDbPath;
  }

  return {
    agents: [
      {
        agentId: 'main',
        status: {
          backend: 'builtin',
          files: files.length,
          chunks: 0,
          dirty: true,
          workspaceDir: WORKSPACE_DIR,
          dbPath: dbPath || path.join(LITTLEBABY_HOME, 'memory', 'main.sqlite'),
          sources: ['memory'],
          custom: { searchMode: dbExists ? 'hybrid' : 'file-search' },
        },
        scan: {
          totalFiles: files.length,
          issues: !fs.existsSync(MEMORY_DIR) ? ['memory directory missing (~/.littlebaby/workspace/memory)'] : [],
          files: files.map((f) => ({ name: f.name, path: f.path, size: f.size })),
          totalSize,
        },
      },
    ],
  };
}

router.get('/status', async (_req: Request, res: Response) => {
  try {
    if (hasLittleBaby()) {
      try {
        const raw = runLittleBaby('memory status --json --deep');
        const agents = JSON.parse(raw);
        res.json({ agents });
        return;
      } catch {}
    }
    res.json(buildFilesystemStatus());
  } catch (error: any) {
    console.error('Error fetching littlebaby memory status:', error.message);
    res.status(500).json({ error: '获取记忆状态失败' });
  }
});

router.get('/files', async (_req: Request, res: Response) => {
  try {
    const files = listMemoryFiles();
    const result = files.map((f) => {
      const content = safeReadFile(path.join(WORKSPACE_DIR, f.path));
      return { ...f, content };
    });
    res.json({ files: result });
  } catch (error: any) {
    console.error('Error listing memory files:', error.message);
    res.status(500).json({ error: '获取记忆文件失败' });
  }
});

router.get('/files/:name', async (req: Request, res: Response) => {
  try {
    const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
    const fullPath = path.resolve(WORKSPACE_DIR, name);

    if (!fullPath.startsWith(WORKSPACE_DIR)) {
      res.status(403).json({ error: '路径不允许' });
      return;
    }

    const content = safeReadFile(fullPath);
    if (content === null) {
      res.status(404).json({ error: '文件不存在' });
      return;
    }

    res.json({ name, content });
  } catch (error: any) {
    console.error('Error reading memory file:', error.message);
    res.status(500).json({ error: '读取记忆文件失败' });
  }
});

router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!query) {
      res.json({ results: [] });
      return;
    }

    const maxResults = Math.min(
      Math.max(parseInt(String(req.query.limit || '20'), 10) || 20, 1),
      100,
    );

    if (hasLittleBaby()) {
      try {
        const raw = runLittleBaby(
          `memory search ${JSON.stringify(query)} --json --max-results ${maxResults}`,
        );
        let parsed: any;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = { results: [] };
        }
        const results = Array.isArray(parsed) ? parsed : parsed.results || [];
        res.json({ results, query });
        return;
      } catch {}
    }

    const results = searchFiles(query, maxResults);
    res.json({ results, query });
  } catch (error: any) {
    console.error('Error searching memory:', error.message);
    res.status(500).json({ error: '搜索记忆失败' });
  }
});

router.post('/reindex', async (_req: Request, res: Response) => {
  try {
    if (hasLittleBaby()) {
      const raw = runLittleBaby('memory index --force');
      res.json({ success: true, output: raw.trim() });
      return;
    }
    res.json({ success: true, output: 'littlebaby not available, skipped indexing' });
  } catch (error: any) {
    console.error('Error reindexing memory:', error.message);
    res.status(500).json({ error: '重新索引失败' });
  }
});

router.post('/files', async (req: Request, res: Response) => {
  try {
    const { name, content } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: '文件名不能为空' });
      return;
    }
    if (typeof content !== 'string') {
      res.status(400).json({ error: '内容不能为空' });
      return;
    }

    const cleanName = name.replace(/^\/+/, '').replace(/\.\./g, '');
    const fullPath = path.resolve(WORKSPACE_DIR, cleanName);
    if (!fullPath.startsWith(WORKSPACE_DIR)) {
      res.status(403).json({ error: '路径不允许' });
      return;
    }

    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content, 'utf-8');
    res.json({ success: true, name: cleanName });
  } catch (error: any) {
    console.error('Error writing memory file:', error.message);
    res.status(500).json({ error: '写入记忆文件失败' });
  }
});

router.delete('/files/:name', async (req: Request, res: Response) => {
  try {
    const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
    const fullPath = path.resolve(WORKSPACE_DIR, name);

    if (!fullPath.startsWith(WORKSPACE_DIR)) {
      res.status(403).json({ error: '路径不允许' });
      return;
    }

    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: '文件不存在' });
      return;
    }

    fs.unlinkSync(fullPath);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting memory file:', error.message);
    res.status(500).json({ error: '删除记忆文件失败' });
  }
});

export default router;
