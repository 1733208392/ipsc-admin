import { Router, Request, Response } from 'express';
import db from '../db.js';
import {
  CreateSquadSchema,
  UpdateSquadSchema,
  AutoAssignSquadsSchema,
  BatchMoveShootersSchema,
  AddShooterToSquadSchema,
  ok,
  fail,
} from '../types.js';
import { autoAssignSquads } from '../services/squading.js';

const router = Router({ mergeParams: true });

// POST /matches/:matchId/squads
router.post('/', (req: Request, res: Response) => {
  const matchId = Number(req.params['matchId']);
  const parsed = CreateSquadSchema.safeParse(req.body);
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
    const { name, sort_order } = parsed.data;
    const result = db
      .prepare(`INSERT INTO squads (match_id, name, sort_order) VALUES (?, ?, ?)`)
      .run(matchId, name, sort_order);
    const squad = db.prepare(`SELECT * FROM squads WHERE id = ?`).get(result.lastInsertRowid);
    res.status(201).json(ok(squad));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// GET /matches/:matchId/squads  (with shooter count)
router.get('/', (req: Request, res: Response) => {
  const matchId = Number(req.params['matchId']);
  try {
    const squads = db
      .prepare(
        `SELECT sq.*, COUNT(sh.id) AS shooter_count
         FROM squads sq
         LEFT JOIN shooters sh ON sq.id = sh.squad_id
         WHERE sq.match_id = ?
         GROUP BY sq.id
         ORDER BY sq.sort_order, sq.id`
      )
      .all(matchId);
    res.json(ok(squads));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// DELETE /matches/:matchId/squads/:squadId
router.delete('/:squadId', (req: Request, res: Response) => {
  const matchId = Number(req.params['matchId']);
  const squadId = Number(req.params['squadId']);
  try {
    const squad = db
      .prepare(`SELECT id, match_id FROM squads WHERE id = ?`)
      .get(squadId) as { id: number; match_id: number } | undefined;
    if (!squad || squad.match_id !== matchId) {
      res.status(404).json(fail('Squad not found in this match'));
      return;
    }
    db.prepare(`UPDATE shooters SET squad_id = NULL WHERE squad_id = ?`).run(squadId);
    db.prepare(`DELETE FROM squads WHERE id = ?`).run(squadId);
    res.json(ok({ id: squadId }));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// PUT /squads/:id
export function updateSquad(req: Request, res: Response): void {
  const id = Number(req.params['id']);
  const parsed = UpdateSquadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(fail(parsed.error.message));
    return;
  }
  try {
    const squad = db.prepare(`SELECT * FROM squads WHERE id = ?`).get(id);
    if (!squad) {
      res.status(404).json(fail('Squad not found'));
      return;
    }
    const fields: string[] = [];
    const values: unknown[] = [];
    const { name, sort_order } = parsed.data;
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); values.push(sort_order); }
    if (fields.length === 0) {
      res.json(ok(squad));
      return;
    }
    values.push(id);
    db.prepare(`UPDATE squads SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const updated = db.prepare(`SELECT * FROM squads WHERE id = ?`).get(id);
    res.json(ok(updated));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
}

// DELETE /squads/:id
export function deleteSquad(req: Request, res: Response): void {
  const id = Number(req.params['id']);
  try {
    const squad = db.prepare(`SELECT * FROM squads WHERE id = ?`).get(id);
    if (!squad) {
      res.status(404).json(fail('Squad not found'));
      return;
    }
    db.prepare(`UPDATE shooters SET squad_id = NULL WHERE squad_id = ?`).run(id);
    db.prepare(`DELETE FROM squads WHERE id = ?`).run(id);
    res.json(ok({ id }));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
}

// GET /matches/:matchId/squads/queue — Squads with nested shooter roster
export function getSquadQueue(req: Request, res: Response): void {
  const matchId = Number(req.params['matchId']);
  try {
    const match = db.prepare(`SELECT id FROM matches WHERE id = ?`).get(matchId);
    if (!match) {
      res.status(404).json(fail('Match not found'));
      return;
    }

    const totalStages = (
      db.prepare(`SELECT COUNT(*) AS c FROM stages WHERE match_id = ?`).get(matchId) as { c: number }
    ).c;

    const squads = db
      .prepare(
        `SELECT id, name, sort_order FROM squads WHERE match_id = ? ORDER BY sort_order, id`
      )
      .all(matchId) as Array<{ id: number; name: string; sort_order: number }>;

    const result = squads.map((squad) => {
      const shooters = db
        .prepare(
          `SELECT sh.id, sh.name, sh.bib_number,
                  d.name AS division_name, d.code AS division_code,
                  COUNT(DISTINCT sc.stage_id) AS stages_done
           FROM shooters sh
           JOIN divisions d ON sh.division_id = d.id
           LEFT JOIN scores sc ON sh.id = sc.shooter_id AND sc.review_state = 'submitted'
           WHERE sh.squad_id = ?
           GROUP BY sh.id
           ORDER BY sh.bib_number`
        )
        .all(squad.id) as Array<{
          id: number;
          name: string;
          bib_number: string;
          division_name: string;
          division_code: string;
          stages_done: number;
        }>;

      return {
        ...squad,
        shooter_count: shooters.length,
        stages_total: totalStages,
        shooters: shooters.map((s) => ({
          ...s,
          status: s.stages_done === 0
            ? 'waiting'
            : s.stages_done >= totalStages
              ? 'done'
              : 'shooting',
        })),
      };
    });

    res.json(ok(result));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
}

// POST /matches/:matchId/squads/auto-assign
export function autoAssign(req: Request, res: Response): void {
  const matchId = Number(req.params['matchId']);
  const match = db.prepare(`SELECT id FROM matches WHERE id = ?`).get(matchId);
  if (!match) {
    res.status(404).json(fail('Match not found'));
    return;
  }

  const parsed = AutoAssignSquadsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json(fail(parsed.error.message));
    return;
  }

  try {
    const result = autoAssignSquads({
      matchId,
      sort_by: parsed.data.sort_by,
      group_size: parsed.data.group_size,
      strategy: parsed.data.strategy,
      clear_existing: parsed.data.clear_existing,
    });
    res.json(ok(result));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('Cannot clear') ? 409 : msg.includes('No shooters') ? 400 : 500;
    res.status(status).json(fail(msg));
  }
}

// PUT /squads/:squadId/shooters/batch-move
export function batchMoveShooters(req: Request, res: Response): void {
  const squadId = Number(req.params['squadId']);
  const sourceSquad = db.prepare(`SELECT id, match_id FROM squads WHERE id = ?`).get(squadId) as
    | { id: number; match_id: number }
    | undefined;
  if (!sourceSquad) {
    res.status(404).json(fail('Squad not found'));
    return;
  }

  const parsed = BatchMoveShootersSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(fail(parsed.error.message));
    return;
  }

  const targetSquad = db.prepare(`SELECT id, match_id FROM squads WHERE id = ?`).get(parsed.data.target_squad_id) as
    | { id: number; match_id: number }
    | undefined;
  if (!targetSquad) {
    res.status(404).json(fail('Target squad not found'));
    return;
  }
  if (sourceSquad.match_id !== targetSquad.match_id) {
    res.status(400).json(fail('Source and target squads must belong to the same match'));
    return;
  }

  const moveTx = db.transaction((shooterIds: number[]) => {
    const updateStmt = db.prepare(
      `UPDATE shooters SET squad_id = ? WHERE id = ? AND squad_id = ? AND match_id = ?`
    );
    let moved = 0;
    for (const shooterId of shooterIds) {
      const result = updateStmt.run(targetSquad.id, shooterId, sourceSquad.id, sourceSquad.match_id);
      moved += result.changes;
    }
    return moved;
  });

  const moved = moveTx(parsed.data.shooter_ids);
  res.json(ok({ moved }));
}

// DELETE /squads/:squadId/shooters/:shooterId
export function removeShooterFromSquad(req: Request, res: Response): void {
  const squadId = Number(req.params['squadId']);
  const shooterId = Number(req.params['shooterId']);

  const squad = db.prepare(`SELECT id, match_id FROM squads WHERE id = ?`).get(squadId) as
    | { id: number; match_id: number }
    | undefined;
  if (!squad) {
    res.status(404).json(fail('Squad not found'));
    return;
  }

  const shooter = db
    .prepare(`SELECT id, match_id, squad_id FROM shooters WHERE id = ?`)
    .get(shooterId) as { id: number; match_id: number; squad_id: number | null } | undefined;
  if (!shooter || shooter.match_id !== squad.match_id) {
    res.status(404).json(fail('Shooter not found'));
    return;
  }
  if (shooter.squad_id !== squad.id) {
    res.status(409).json(fail('Shooter is not in the specified squad'));
    return;
  }

  db.prepare(`UPDATE shooters SET squad_id = NULL WHERE id = ?`).run(shooter.id);
  res.json(ok({ shooter_id: shooter.id, squad_id: null }));
}

// POST /squads/:squadId/shooters
export function addShooterToSquad(req: Request, res: Response): void {
  const squadId = Number(req.params['squadId']);
  const squad = db.prepare(`SELECT id, match_id FROM squads WHERE id = ?`).get(squadId) as
    | { id: number; match_id: number }
    | undefined;
  if (!squad) {
    res.status(404).json(fail('Squad not found'));
    return;
  }

  const parsed = AddShooterToSquadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(fail(parsed.error.message));
    return;
  }

  const shooter = db
    .prepare(`SELECT id, match_id FROM shooters WHERE id = ?`)
    .get(parsed.data.shooter_id) as { id: number; match_id: number } | undefined;
  if (!shooter) {
    res.status(404).json(fail('Shooter not found'));
    return;
  }
  if (shooter.match_id !== squad.match_id) {
    res.status(400).json(fail('Shooter and squad must belong to the same match'));
    return;
  }

  db.prepare(`UPDATE shooters SET squad_id = ? WHERE id = ?`).run(squad.id, shooter.id);
  res.json(ok({ shooter_id: shooter.id, squad_id: squad.id }));
}

export default router;
