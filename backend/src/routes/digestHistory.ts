import { Router, Request, Response } from 'express';
import {
  clearDigestHistory,
  deleteDigestHistoryById,
  isDigestType,
  listDigestHistory,
} from '../utils/digestHistory';

const router = Router();

function parsePositiveInt(value: unknown, fallback: number) {
  const numeric = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return fallback;
  }
  return numeric;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const digestTypeInput = typeof req.query.digest_type === 'string' ? req.query.digest_type : undefined;
    const digestType = digestTypeInput ? (isDigestType(digestTypeInput) ? digestTypeInput : null) : undefined;
    if (digestType === null) {
      return res.status(400).json({ error: 'digest_type 参数无效' });
    }

    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = parsePositiveInt(req.query.page_size, 20);
    const days = req.query.days === undefined ? undefined : parsePositiveInt(req.query.days, 0) || undefined;
    const query = typeof req.query.q === 'string' ? req.query.q : undefined;

    const result = await listDigestHistory({
      digestType,
      query,
      days,
      page,
      pageSize,
    });

    res.json(result);
  } catch (error) {
    console.error('Error listing digest history:', error);
    res.status(500).json({ error: '加载简报历史失败' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number.parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: '记录 id 无效' });
    }

    const deleted = await deleteDigestHistoryById(id);
    if (!deleted) {
      return res.status(404).json({ error: '记录不存在' });
    }

    res.json({
      success: true,
      deleted,
      message: '简报历史已删除',
    });
  } catch (error) {
    console.error('Error deleting digest history:', error);
    res.status(500).json({ error: '删除简报历史失败' });
  }
});

router.post('/clear', async (req: Request, res: Response) => {
  try {
    const digestTypeInput = typeof req.body?.digest_type === 'string' ? req.body.digest_type : undefined;
    const digestType = digestTypeInput ? (isDigestType(digestTypeInput) ? digestTypeInput : null) : undefined;
    if (digestType === null) {
      return res.status(400).json({ error: 'digest_type 参数无效' });
    }

    const days = req.body?.days === undefined ? undefined : parsePositiveInt(req.body.days, 0) || undefined;
    const query = typeof req.body?.q === 'string' ? req.body.q : undefined;
    const deletedCount = await clearDigestHistory({
      digestType,
      days,
      query,
    });

    res.json({
      success: true,
      deletedCount,
      message: `已删除 ${deletedCount} 条简报历史`,
    });
  } catch (error) {
    console.error('Error clearing digest history:', error);
    res.status(500).json({ error: '清空简报历史失败' });
  }
});

export default router;
