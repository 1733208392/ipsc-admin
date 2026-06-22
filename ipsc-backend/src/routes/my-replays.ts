import { Router, Request, Response } from 'express';
import db from '../db.js';
import { DrillReplayUploadSchema, ok, fail } from '../types.js';

const router = Router();

interface PersonalReplayRow {
  id: number;
  match_id: number | null;
  shooter_id: number | null;
  stage_id: number | null;
  owner_user_id: number | null;
  drill_template_id: number | null;
  drill_name: string | null;
  total_time: number;
  num_shots: number;
  score: number | null;
  payload_json: string;
  client_drill_result_id: string | null;
  device_id: string | null;
  uploaded_by: number | null;
  created_at: string;
  template_name?: string | null;
}

function positiveInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function positivePage(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePayload(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getTemplateByOwner(ownerUserId: number, templateId: number) {
  return db
    .prepare(`SELECT * FROM drill_templates WHERE id = ? AND owner_user_id = ?`)
    .get(templateId, ownerUserId) as { id: number; owner_user_id: number; name: string } | undefined;
}

function serializeReplay(row: PersonalReplayRow) {
  return {
    id: row.id,
    match_id: row.match_id,
    shooter_id: row.shooter_id,
    stage_id: row.stage_id,
    owner_user_id: row.owner_user_id,
    drill_template_id: row.drill_template_id,
    drill_name: row.drill_name ?? row.template_name ?? null,
    total_time: row.total_time,
    num_shots: row.num_shots,
    score: row.score,
    client_drill_result_id: row.client_drill_result_id,
    device_id: row.device_id,
    uploaded_by: row.uploaded_by,
    created_at: row.created_at,
    payload: parsePayload(row.payload_json),
  };
}

function serializeReplaySummary(row: PersonalReplayRow) {
  return {
    id: row.id,
    drill_template_id: row.drill_template_id,
    drill_name: row.drill_name ?? row.template_name ?? null,
    total_time: row.total_time,
    num_shots: row.num_shots,
    score: row.score,
    created_at: row.created_at,
  };
}

router.post(['/drills/:drillId/drill-records', '/drills/:drillId/replays'], (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json(fail('未登录'));
    return;
  }

  const drillId = positiveInt(req.params['drillId']);
  if (!drillId) {
    res.status(400).json(fail('Invalid drill id'));
    return;
  }

  const template = getTemplateByOwner(req.user.id, drillId);
  if (!template) {
    res.status(404).json(fail('Drill template not found'));
    return;
  }

  const parsed = DrillReplayUploadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(fail(parsed.error.message));
    return;
  }

  try {
    const payloadJson = JSON.stringify(parsed.data.payload);
    const uploadedBy = req.user.id;
    let replayId: number | null = null;

    if (parsed.data.client_drill_result_id) {
      const existing = db
        .prepare(
          `SELECT id FROM drill_replays
           WHERE owner_user_id = ? AND client_drill_result_id = ?`
        )
        .get(req.user.id, parsed.data.client_drill_result_id) as { id: number } | undefined;

      if (existing) {
        db.prepare(
          `UPDATE drill_replays
           SET drill_template_id = ?, drill_name = ?, total_time = ?, num_shots = ?, score = ?,
               payload_json = ?, device_id = ?, uploaded_by = ?
           WHERE id = ? AND owner_user_id = ?`
        ).run(
          template.id,
          template.name,
          parsed.data.total_time,
          parsed.data.num_shots,
          parsed.data.score ?? null,
          payloadJson,
          parsed.data.device_id ?? null,
          uploadedBy,
          existing.id,
          req.user.id
        );
        replayId = existing.id;
      }
    }

    if (replayId === null) {
      const info = db
        .prepare(
          `INSERT INTO drill_replays
             (match_id, shooter_id, stage_id, owner_user_id, drill_template_id, drill_name,
              total_time, num_shots, score, payload_json, client_drill_result_id, device_id, uploaded_by)
           VALUES (NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          req.user.id,
          template.id,
          template.name,
          parsed.data.total_time,
          parsed.data.num_shots,
          parsed.data.score ?? null,
          payloadJson,
          parsed.data.client_drill_result_id ?? null,
          parsed.data.device_id ?? null,
          uploadedBy
        );
      replayId = Number(info.lastInsertRowid);
    }

    const row = db
      .prepare(
        `SELECT r.*, dt.name AS template_name
         FROM drill_replays r
         LEFT JOIN drill_templates dt ON dt.id = r.drill_template_id
         WHERE r.id = ? AND r.owner_user_id = ?`
      )
      .get(replayId, req.user.id) as PersonalReplayRow | undefined;

    if (!row) {
      res.status(500).json(fail('Failed to load saved drill record'));
      return;
    }

    res.json(ok(serializeReplay(row)));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

router.get(['/drills/:drillId/drill-records', '/drills/:drillId/replays'], (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json(fail('未登录'));
    return;
  }

  const drillId = positiveInt(req.params['drillId']);
  if (!drillId) {
    res.status(400).json(fail('Invalid drill id'));
    return;
  }

  const template = getTemplateByOwner(req.user.id, drillId);
  if (!template) {
    res.status(404).json(fail('Drill template not found'));
    return;
  }

  const page = positivePage(req.query['page'], 1);
  const pageSize = Math.min(positivePage(req.query['pageSize'], 20), 100);
  const offset = (page - 1) * pageSize;

  try {
    const total = (db
      .prepare(`SELECT COUNT(*) AS c FROM drill_replays WHERE owner_user_id = ? AND drill_template_id = ?`)
      .get(req.user.id, drillId) as { c: number }).c;

    const items = db
      .prepare(
        `SELECT r.*, dt.name AS template_name
         FROM drill_replays r
         LEFT JOIN drill_templates dt ON dt.id = r.drill_template_id
         WHERE r.owner_user_id = ? AND r.drill_template_id = ?
         ORDER BY r.created_at DESC, r.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(req.user.id, drillId, pageSize, offset) as PersonalReplayRow[];

    res.json(ok({
      items: items.map(serializeReplaySummary),
      total,
      page,
      pageSize,
    }));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

router.get(['/drill-records/stats', '/replays/stats'], (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json(fail('未登录'));
    return;
  }

  const days = positivePage(req.query['days'], 30);
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString().slice(0, 19).replace('T', ' ');

  try {
    const totals = db
      .prepare(
        `SELECT
          COUNT(*) AS total_replays,
          COALESCE(SUM(num_shots), 0) AS total_shots,
          COALESCE(AVG(total_time), 0) AS avg_time,
          COALESCE(MIN(total_time), 0) AS best_time,
          COALESCE(AVG(score), 0) AS avg_score
         FROM drill_replays
         WHERE owner_user_id = ? AND created_at >= ?`
      )
      .get(req.user.id, sinceIso) as {
      total_replays: number;
      total_shots: number;
      avg_time: number;
      best_time: number;
      avg_score: number;
    };

    const byDrill = db
      .prepare(
        `SELECT
          r.drill_template_id,
          COALESCE(dt.name, r.drill_name, '') AS drill_name,
          COUNT(*) AS replay_count,
          COALESCE(AVG(r.total_time), 0) AS avg_time,
          COALESCE(MIN(r.total_time), 0) AS best_time,
          COALESCE(AVG(r.score), 0) AS avg_score
         FROM drill_replays r
         LEFT JOIN drill_templates dt ON dt.id = r.drill_template_id
         WHERE r.owner_user_id = ? AND r.created_at >= ?
         GROUP BY r.drill_template_id, drill_name
         ORDER BY replay_count DESC, drill_name ASC`
      )
      .all(req.user.id, sinceIso) as Array<{
      drill_template_id: number;
      drill_name: string;
      replay_count: number;
      avg_time: number;
      best_time: number;
      avg_score: number;
    }>;

    const byDay = db
      .prepare(
        `SELECT date(created_at) AS date, COUNT(*) AS count, COALESCE(AVG(total_time), 0) AS avg_time
         FROM drill_replays
         WHERE owner_user_id = ? AND created_at >= ?
         GROUP BY date(created_at)
         ORDER BY date DESC`
      )
      .all(req.user.id, sinceIso) as Array<{ date: string; count: number; avg_time: number }>;

    res.json(ok({
      total_replays: totals.total_replays,
      total_shots: totals.total_shots,
      avg_time: totals.avg_time,
      best_time: totals.best_time,
      avg_score: totals.avg_score,
      by_drill: byDrill,
      by_day: byDay,
    }));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

router.get(['/drill-records', '/replays'], (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json(fail('未登录'));
    return;
  }

  const drillTemplateId = req.query['drill_template_id'] !== undefined ? positiveInt(req.query['drill_template_id']) : null;
  if (req.query['drill_template_id'] !== undefined && !drillTemplateId) {
    res.status(400).json(fail('Invalid drill_template_id'));
    return;
  }

  const page = positivePage(req.query['page'], 1);
  const pageSize = Math.min(positivePage(req.query['pageSize'], 20), 100);
  const offset = (page - 1) * pageSize;

  try {
    const clauses = ['r.owner_user_id = ?'];
    const params: Array<number> = [req.user.id];
    if (drillTemplateId) {
      clauses.push('r.drill_template_id = ?');
      params.push(drillTemplateId);
    }

    const total = (db
      .prepare(`SELECT COUNT(*) AS c FROM drill_replays r WHERE ${clauses.join(' AND ')}`)
      .get(...params) as { c: number }).c;

    const items = db
      .prepare(
        `SELECT r.*, dt.name AS template_name
         FROM drill_replays r
         LEFT JOIN drill_templates dt ON dt.id = r.drill_template_id
         WHERE ${clauses.join(' AND ')}
         ORDER BY r.created_at DESC, r.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, pageSize, offset) as PersonalReplayRow[];

    res.json(ok({
      items: items.map(serializeReplaySummary),
      total,
      page,
      pageSize,
    }));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

router.get(['/drill-records/:id', '/replays/:id'], (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json(fail('未登录'));
    return;
  }

  const id = positiveInt(req.params['id']);
  if (!id) {
    res.status(400).json(fail('Invalid drill record id'));
    return;
  }

  try {
    const row = db
      .prepare(
        `SELECT r.*, dt.name AS template_name
         FROM drill_replays r
         LEFT JOIN drill_templates dt ON dt.id = r.drill_template_id
         WHERE r.id = ? AND r.owner_user_id = ?`
      )
      .get(id, req.user.id) as PersonalReplayRow | undefined;

    if (!row) {
      res.status(404).json(fail('Drill record not found'));
      return;
    }

    res.json(ok(serializeReplay(row)));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

router.delete(['/drill-records/:id', '/replays/:id'], (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json(fail('未登录'));
    return;
  }

  const id = positiveInt(req.params['id']);
  if (!id) {
    res.status(400).json(fail('Invalid drill record id'));
    return;
  }

  try {
    const info = db.prepare(`DELETE FROM drill_replays WHERE id = ? AND owner_user_id = ?`).run(id, req.user.id);
    if (info.changes === 0) {
      res.status(404).json(fail('Drill record not found'));
      return;
    }
    res.json(ok({ id }));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

export default router;