import { Router, Request, Response } from 'express';
import db from '../db.js';
import { CreateSubDivisionSchema, UpdateSubDivisionSchema, ok, fail } from '../types.js';

const router = Router({ mergeParams: true });

// POST /matches/:matchId/sub-divisions
router.post('/', (req: Request, res: Response) => {
  const matchId = Number(req.params['matchId']);
  const parsed = CreateSubDivisionSchema.safeParse(req.body);
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
    const { name, min_age, max_age, gender, sort_order } = parsed.data;
    const result = db
      .prepare(`INSERT INTO sub_divisions (match_id, name, min_age, max_age, gender, sort_order) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(matchId, name, min_age ?? null, max_age ?? null, gender ?? null, sort_order);
    const subDiv = db.prepare(`SELECT * FROM sub_divisions WHERE id = ?`).get(result.lastInsertRowid);
    res.status(201).json(ok(subDiv));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// GET /matches/:matchId/sub-divisions
router.get('/', (req: Request, res: Response) => {
  const matchId = Number(req.params['matchId']);
  try {
    const subDivisions = db
      .prepare(`SELECT * FROM sub_divisions WHERE match_id = ? ORDER BY sort_order, id`)
      .all(matchId);
    res.json(ok(subDivisions));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// PUT /sub-divisions/:id  (mounted at root level)
export function updateSubDivision(req: Request, res: Response): void {
  const id = Number(req.params['id']);
  const parsed = UpdateSubDivisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(fail(parsed.error.message));
    return;
  }
  try {
    const subDiv = db.prepare(`SELECT * FROM sub_divisions WHERE id = ?`).get(id);
    if (!subDiv) {
      res.status(404).json(fail('Sub division not found'));
      return;
    }
    const fields: string[] = [];
    const values: unknown[] = [];
    const { name, min_age, max_age, gender, sort_order } = parsed.data;
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (min_age !== undefined) { fields.push('min_age = ?'); values.push(min_age); }
    if (max_age !== undefined) { fields.push('max_age = ?'); values.push(max_age); }
    if (gender !== undefined) { fields.push('gender = ?'); values.push(gender); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); values.push(sort_order); }
    if (fields.length === 0) {
      res.json(ok(subDiv));
      return;
    }
    values.push(id);
    db.prepare(`UPDATE sub_divisions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const updated = db.prepare(`SELECT * FROM sub_divisions WHERE id = ?`).get(id);
    res.json(ok(updated));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
}

// DELETE /sub-divisions/:id
export function deleteSubDivision(req: Request, res: Response): void {
  const id = Number(req.params['id']);
  try {
    const subDiv = db.prepare(`SELECT * FROM sub_divisions WHERE id = ?`).get(id);
    if (!subDiv) {
      res.status(404).json(fail('Sub division not found'));
      return;
    }
    db.prepare(`DELETE FROM sub_divisions WHERE id = ?`).run(id);
    res.json(ok({ id }));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
}

export default router;
