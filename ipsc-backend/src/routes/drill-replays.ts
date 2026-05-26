import { Router, Request, Response } from 'express';
import db from '../db.js';
import { DrillReplayUploadSchema, ok, fail } from '../types.js';

const router = Router({ mergeParams: true });

interface ShooterRow {
  id: number;
  match_id: number;
  name: string;
}

interface StageRow {
  id: number;
  match_id: number;
  name: string;
}

interface DrillReplayRow {
  id: number;
  match_id: number;
  shooter_id: number;
  stage_id: number;
  drill_name: string | null;
  total_time: number;
  num_shots: number;
  score: number | null;
  payload_json: string;
  client_drill_result_id: string | null;
  device_id: string | null;
  uploaded_by: number | null;
  created_at: string;
  shooter_name?: string;
  stage_name?: string;
}

function getShooter(matchId: number, shooterId: number): ShooterRow | undefined {
  return db
    .prepare(`SELECT id, match_id, name FROM shooters WHERE match_id = ? AND id = ?`)
    .get(matchId, shooterId) as ShooterRow | undefined;
}

function getStage(matchId: number, stageId: number): StageRow | undefined {
  return db
    .prepare(`SELECT id, match_id, name FROM stages WHERE match_id = ? AND id = ?`)
    .get(matchId, stageId) as StageRow | undefined;
}

function serializeReplay(row: DrillReplayRow) {
  let payload: unknown = null;
  try {
    payload = JSON.parse(row.payload_json);
  } catch {
    payload = null;
  }
  return {
    id: row.id,
    match_id: row.match_id,
    shooter_id: row.shooter_id,
    shooter_name: row.shooter_name ?? null,
    stage_id: row.stage_id,
    stage_name: row.stage_name ?? null,
    drill_name: row.drill_name,
    total_time: row.total_time,
    num_shots: row.num_shots,
    score: row.score,
    client_drill_result_id: row.client_drill_result_id,
    device_id: row.device_id,
    uploaded_by: row.uploaded_by,
    created_at: row.created_at,
    payload,
  };
}

function serializeReplaySummary(row: DrillReplayRow) {
  return {
    id: row.id,
    match_id: row.match_id,
    shooter_id: row.shooter_id,
    shooter_name: row.shooter_name ?? null,
    stage_id: row.stage_id,
    stage_name: row.stage_name ?? null,
    drill_name: row.drill_name,
    total_time: row.total_time,
    num_shots: row.num_shots,
    score: row.score,
    created_at: row.created_at,
  };
}

// POST /matches/:matchId/drill-replays
router.post('/', (req: Request, res: Response) => {
  const matchId = Number(req.params['matchId']);
  if (!Number.isInteger(matchId) || matchId <= 0) {
    res.status(400).json(fail('Invalid match id'));
    return;
  }

  const parsed = DrillReplayUploadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(fail(parsed.error.message));
    return;
  }

  const data = parsed.data;

  const shooter = getShooter(matchId, data.shooter_id);
  const stage = getStage(matchId, data.stage_id);
  if (!shooter || !stage) {
    res.status(404).json(fail('Shooter or stage not found in this match'));
    return;
  }

  try {
    const payloadJson = JSON.stringify(data.payload);
    const uploadedBy = req.user?.id ?? null;

    let replayId: number | null = null;

    if (data.client_drill_result_id) {
      const existing = db
        .prepare(
          `SELECT id FROM drill_replays
           WHERE shooter_id = ? AND stage_id = ? AND client_drill_result_id = ?`
        )
        .get(data.shooter_id, data.stage_id, data.client_drill_result_id) as
        | { id: number }
        | undefined;

      if (existing) {
        db.prepare(
          `UPDATE drill_replays
           SET match_id = ?, drill_name = ?, total_time = ?, num_shots = ?, score = ?,
               payload_json = ?, device_id = ?, uploaded_by = ?
           WHERE id = ?`
        ).run(
          matchId,
          data.drill_name ?? null,
          data.total_time,
          data.num_shots,
          data.score ?? null,
          payloadJson,
          data.device_id ?? null,
          uploadedBy,
          existing.id
        );
        replayId = existing.id;
      }
    }

    if (replayId === null) {
      const info = db
        .prepare(
          `INSERT INTO drill_replays
             (match_id, shooter_id, stage_id, drill_name, total_time, num_shots, score,
              payload_json, client_drill_result_id, device_id, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          matchId,
          data.shooter_id,
          data.stage_id,
          data.drill_name ?? null,
          data.total_time,
          data.num_shots,
          data.score ?? null,
          payloadJson,
          data.client_drill_result_id ?? null,
          data.device_id ?? null,
          uploadedBy
        );
      replayId = Number(info.lastInsertRowid);
    }

    const row = db
      .prepare(
        `SELECT r.*, s.name AS shooter_name, st.name AS stage_name
         FROM drill_replays r
         LEFT JOIN shooters s ON s.id = r.shooter_id
         LEFT JOIN stages st ON st.id = r.stage_id
         WHERE r.id = ?`
      )
      .get(replayId) as DrillReplayRow | undefined;

    if (!row) {
      res.status(500).json(fail('Failed to load saved replay'));
      return;
    }

    res.json(ok(serializeReplay(row)));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// GET /matches/:matchId/drill-replays
router.get('/', (req: Request, res: Response) => {
  const matchId = Number(req.params['matchId']);
  if (!Number.isInteger(matchId) || matchId <= 0) {
    res.status(400).json(fail('Invalid match id'));
    return;
  }

  const shooterIdParam = req.query['shooter_id'];
  const stageIdParam = req.query['stage_id'];
  const shooterIdFilter = shooterIdParam !== undefined ? Number(shooterIdParam) : undefined;
  const stageIdFilter = stageIdParam !== undefined ? Number(stageIdParam) : undefined;

  if (shooterIdParam !== undefined && (!Number.isInteger(shooterIdFilter) || (shooterIdFilter as number) <= 0)) {
    res.status(400).json(fail('Invalid shooter_id'));
    return;
  }
  if (stageIdParam !== undefined && (!Number.isInteger(stageIdFilter) || (stageIdFilter as number) <= 0)) {
    res.status(400).json(fail('Invalid stage_id'));
    return;
  }

  try {
    const clauses: string[] = ['r.match_id = ?'];
    const params: Array<number> = [matchId];
    if (shooterIdFilter !== undefined) {
      clauses.push('r.shooter_id = ?');
      params.push(shooterIdFilter);
    }
    if (stageIdFilter !== undefined) {
      clauses.push('r.stage_id = ?');
      params.push(stageIdFilter);
    }

    const rows = db
      .prepare(
        `SELECT r.id, r.match_id, r.shooter_id, r.stage_id, r.drill_name,
                r.total_time, r.num_shots, r.score, r.created_at,
                s.name AS shooter_name, st.name AS stage_name
         FROM drill_replays r
         LEFT JOIN shooters s ON s.id = r.shooter_id
         LEFT JOIN stages st ON st.id = r.stage_id
         WHERE ${clauses.join(' AND ')}
         ORDER BY r.created_at DESC, r.id DESC`
      )
      .all(...params) as DrillReplayRow[];

    res.json(ok(rows.map(serializeReplaySummary)));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// GET /drill-replays/:id (mounted at top level)
export function getDrillReplay(req: Request, res: Response) {
  const id = Number(req.params['id']);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json(fail('Invalid replay id'));
    return;
  }
  try {
    const row = db
      .prepare(
        `SELECT r.*, s.name AS shooter_name, st.name AS stage_name
         FROM drill_replays r
         LEFT JOIN shooters s ON s.id = r.shooter_id
         LEFT JOIN stages st ON st.id = r.stage_id
         WHERE r.id = ?`
      )
      .get(id) as DrillReplayRow | undefined;

    if (!row) {
      res.status(404).json(fail('Drill replay not found'));
      return;
    }

    res.json(ok(serializeReplay(row)));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
}

// DELETE /drill-replays/:id (mounted at top level)
export function deleteDrillReplay(req: Request, res: Response) {
  const id = Number(req.params['id']);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json(fail('Invalid replay id'));
    return;
  }
  try {
    const info = db.prepare(`DELETE FROM drill_replays WHERE id = ?`).run(id);
    if (info.changes === 0) {
      res.status(404).json(fail('Drill replay not found'));
      return;
    }
    res.json(ok({ id }));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
}

export default router;
