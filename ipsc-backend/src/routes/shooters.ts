import { Router, Request, Response } from 'express';
import db from '../db.js';
import {
  CreateShooterSchema,
  UpdateShooterSchema,
  ChangeSquadSchema,
  ok,
  fail,
} from '../types.js';

const router = Router({ mergeParams: true });

// POST /matches/:matchId/shooters
router.post('/', (req: Request, res: Response) => {
  const matchId = Number(req.params['matchId']);
  const parsed = CreateShooterSchema.safeParse(req.body);
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
    const { division_id, squad_id, name, bib_number, age, gender, region, club } = parsed.data;
    const result = db
      .prepare(
        `INSERT INTO shooters (match_id, division_id, squad_id, name, bib_number, age, gender, region, club)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        matchId,
        division_id,
        squad_id ?? null,
        name,
        bib_number,
        age ?? null,
        gender ?? null,
        region ?? null,
        club ?? null
      );
    const shooter = db.prepare(`SELECT * FROM shooters WHERE id = ?`).get(result.lastInsertRowid);
    res.status(201).json(ok(shooter));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// GET /matches/:matchId/shooters?squad_id=
router.get('/', (req: Request, res: Response) => {
  const matchId = Number(req.params['matchId']);
  const squadId = req.query['squad_id'] ? Number(req.query['squad_id']) : null;
  try {
    let shooters;
    if (squadId !== null) {
      shooters = db
        .prepare(
          `SELECT sh.*, d.name AS division_name, sq.name AS squad_name
           FROM shooters sh
           JOIN divisions d ON sh.division_id = d.id
            LEFT JOIN squads sq ON sh.squad_id = sq.id
           WHERE sh.match_id = ? AND sh.squad_id = ?
           ORDER BY sh.bib_number`
        )
        .all(matchId, squadId);
    } else {
      shooters = db
        .prepare(
          `SELECT sh.*, d.name AS division_name, sq.name AS squad_name
           FROM shooters sh
           JOIN divisions d ON sh.division_id = d.id
            LEFT JOIN squads sq ON sh.squad_id = sq.id
           WHERE sh.match_id = ?
           ORDER BY sh.bib_number`
        )
        .all(matchId);
    }
    res.json(ok(shooters));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// PUT /shooters/:id
export function updateShooter(req: Request, res: Response): void {
  const id = Number(req.params['id']);
  const parsed = UpdateShooterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(fail(parsed.error.message));
    return;
  }
  try {
    const shooter = db.prepare(`SELECT * FROM shooters WHERE id = ?`).get(id);
    if (!shooter) {
      res.status(404).json(fail('Shooter not found'));
      return;
    }
    const fields: string[] = [];
    const values: unknown[] = [];
    const { division_id, squad_id, name, bib_number, age, gender, region, club } = parsed.data;
    if (division_id !== undefined) { fields.push('division_id = ?'); values.push(division_id); }
    if (squad_id !== undefined) { fields.push('squad_id = ?'); values.push(squad_id); }
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (bib_number !== undefined) { fields.push('bib_number = ?'); values.push(bib_number); }
    if (age !== undefined) { fields.push('age = ?'); values.push(age); }
    if (gender !== undefined) { fields.push('gender = ?'); values.push(gender); }
    if (region !== undefined) { fields.push('region = ?'); values.push(region); }
    if (club !== undefined) { fields.push('club = ?'); values.push(club); }
    if (fields.length === 0) {
      res.json(ok(shooter));
      return;
    }
    values.push(id);
    db.prepare(`UPDATE shooters SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const updated = db.prepare(`SELECT * FROM shooters WHERE id = ?`).get(id);
    res.json(ok(updated));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
}

// PUT /shooters/:id/squad
export function changeShooterSquad(req: Request, res: Response): void {
  const id = Number(req.params['id']);
  const parsed = ChangeSquadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(fail(parsed.error.message));
    return;
  }
  try {
    const shooter = db.prepare(`SELECT * FROM shooters WHERE id = ?`).get(id);
    if (!shooter) {
      res.status(404).json(fail('Shooter not found'));
      return;
    }
    db.prepare(`UPDATE shooters SET squad_id = ? WHERE id = ?`).run(parsed.data.squad_id, id);
    const updated = db.prepare(`SELECT * FROM shooters WHERE id = ?`).get(id);
    res.json(ok(updated));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
}

// DELETE /shooters/:id
export function deleteShooter(req: Request, res: Response): void {
  const id = Number(req.params['id']);
  try {
    const shooter = db.prepare(`SELECT * FROM shooters WHERE id = ?`).get(id);
    if (!shooter) {
      res.status(404).json(fail('Shooter not found'));
      return;
    }
    db.prepare(`DELETE FROM shooters WHERE id = ?`).run(id);
    res.json(ok({ id }));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
}

export default router;
