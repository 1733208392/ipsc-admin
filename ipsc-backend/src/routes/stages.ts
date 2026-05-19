import { Router, Request, Response } from 'express';
import fs from 'fs';
import db from '../db.js';
import { CreateStageSchema, UpdateStageSchema, ok, fail } from '../types.js';
import { removeStageUploadsDir, resolveStoragePath } from '../services/stage-files.js';

const router = Router({ mergeParams: true });

// POST /matches/:matchId/stages
router.post('/', (req: Request, res: Response) => {
  const matchId = Number(req.params['matchId']);
  const parsed = CreateStageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(fail(parsed.error.message));
    return;
  }
  const match = db.prepare(`SELECT id FROM matches WHERE id = ?`).get(matchId);
  if (!match) {
    res.status(404).json(fail('Match not found'));
    return;
  }
  try {
    const {
      name,
      min_rounds,
      stage_points,
      targets_count,
      poppers_plates_count,
      briefing_text,
      sort_order,
    } = parsed.data;
    const result = db
      .prepare(`
        INSERT INTO stages
          (match_id, name, min_rounds, max_points, stage_points, targets_count, poppers_plates_count, briefing_text, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        matchId,
        name,
        min_rounds,
        stage_points,
        stage_points,
        targets_count,
        poppers_plates_count,
        briefing_text,
        sort_order
      );
    const stage = db.prepare(`SELECT * FROM stages WHERE id = ?`).get(result.lastInsertRowid);
    res.status(201).json(ok(stage));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// GET /matches/:matchId/stages
router.get('/', (req: Request, res: Response) => {
  const matchId = Number(req.params['matchId']);
  try {
    const stages = db
      .prepare(`SELECT * FROM stages WHERE match_id = ? ORDER BY sort_order, id`)
      .all(matchId);
    res.json(ok(stages));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// DELETE /matches/:matchId/stages/:stageId
router.delete('/:stageId', (req: Request, res: Response) => {
  const matchId = Number(req.params['matchId']);
  const stageId = Number(req.params['stageId']);
  try {
    const stage = db
      .prepare(`SELECT id, match_id FROM stages WHERE id = ?`)
      .get(stageId) as { id: number; match_id: number } | undefined;
    if (!stage || stage.match_id !== matchId) {
      res.status(404).json(fail('Stage not found in this match'));
      return;
    }

    const attachments = db
      .prepare(`SELECT storage_path FROM stage_attachments WHERE stage_id = ?`)
      .all(stageId) as Array<{ storage_path: string }>;

    for (const attachment of attachments) {
      const absolutePath = resolveStoragePath(attachment.storage_path);
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    }

    db.prepare(`DELETE FROM stage_attachments WHERE stage_id = ?`).run(stageId);
    removeStageUploadsDir(stageId);
    db.prepare(`DELETE FROM stages WHERE id = ?`).run(stageId);
    res.json(ok({ id: stageId }));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// PUT /stages/:id
export function updateStage(req: Request, res: Response): void {
  const id = Number(req.params['id']);
  const parsed = UpdateStageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(fail(parsed.error.message));
    return;
  }
  try {
    const stage = db.prepare(`SELECT * FROM stages WHERE id = ?`).get(id);
    if (!stage) {
      res.status(404).json(fail('Stage not found'));
      return;
    }
    const fields: string[] = [];
    const values: unknown[] = [];
    const {
      name,
      min_rounds,
      stage_points,
      targets_count,
      poppers_plates_count,
      briefing_text,
      sort_order,
    } = parsed.data;
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (min_rounds !== undefined) { fields.push('min_rounds = ?'); values.push(min_rounds); }
    if (stage_points !== undefined) {
      fields.push('stage_points = ?');
      values.push(stage_points);
      fields.push('max_points = ?');
      values.push(stage_points);
    }
    if (targets_count !== undefined) { fields.push('targets_count = ?'); values.push(targets_count); }
    if (poppers_plates_count !== undefined) { fields.push('poppers_plates_count = ?'); values.push(poppers_plates_count); }
    if (briefing_text !== undefined) { fields.push('briefing_text = ?'); values.push(briefing_text); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); values.push(sort_order); }
    if (fields.length === 0) {
      res.json(ok(stage));
      return;
    }
    values.push(id);
    db.prepare(`UPDATE stages SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const updated = db.prepare(`SELECT * FROM stages WHERE id = ?`).get(id);
    res.json(ok(updated));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
}

// DELETE /stages/:id
export function deleteStage(req: Request, res: Response): void {
  const id = Number(req.params['id']);
  try {
    const stage = db.prepare(`SELECT * FROM stages WHERE id = ?`).get(id);
    if (!stage) {
      res.status(404).json(fail('Stage not found'));
      return;
    }

    const attachments = db
      .prepare(`SELECT storage_path FROM stage_attachments WHERE stage_id = ?`)
      .all(id) as Array<{ storage_path: string }>;

    for (const attachment of attachments) {
      const absolutePath = resolveStoragePath(attachment.storage_path);
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    }

    db.prepare(`DELETE FROM stage_attachments WHERE stage_id = ?`).run(id);
    removeStageUploadsDir(id);
    db.prepare(`DELETE FROM stages WHERE id = ?`).run(id);
    res.json(ok({ id }));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
}

export default router;
