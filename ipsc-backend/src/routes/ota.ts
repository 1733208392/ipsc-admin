import { Router, Request, Response } from 'express';
import { OtaHistoryRequestSchema, OtaPublicRequestSchema } from '../types.js';
import { getPublishedLatestForDevice, listPublishedHistory } from '../services/ota.js';

const router = Router();

function otaOk<T>(data: T) {
  return {
    code: 0,
    msg: 'ok',
    data,
  } as const;
}

function otaFail(code: number, msg: string) {
  return {
    code,
    msg,
    data: null,
  } as const;
}

// POST /ota/game
router.post('/game', (req: Request, res: Response) => {
  const parsed = OtaPublicRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(otaFail(400, parsed.error.message));
    return;
  }

  try {
    const row = getPublishedLatestForDevice();

    if (!row) {
      res.json(otaOk(null));
      return;
    }

    res.json(otaOk({
      version: row.version,
      address: row.address,
      checksum: row.checksum,
    }));
  } catch (err) {
    res.status(500).json(otaFail(500, String(err)));
  }
});

// POST /ota/game/history
router.post('/game/history', (req: Request, res: Response) => {
  const parsed = OtaHistoryRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(otaFail(400, parsed.error.message));
    return;
  }

  try {
    const page = parsed.data.page ?? 1;
    const limit = Math.min(parsed.data.limit ?? 30, 50);

    const result = listPublishedHistory(page, limit);
    res.json(otaOk({
      total_count: result.total,
      limit: result.limit,
      page: result.page,
      rows: result.rows,
    }));
  } catch (err) {
    res.status(500).json(otaFail(500, String(err)));
  }
});

export default router;
