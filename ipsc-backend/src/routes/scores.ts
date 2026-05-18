import { Router, Request, Response } from 'express';
import db from '../db.js';
import { FlexTargetSchema, ok, fail } from '../types.js';
import { calculateScore } from '../scoring.js';
import { DIVISION_POWER_FACTOR } from '../constants.js';

const router = Router({ mergeParams: true });

interface DivisionCodeRow {
  code: string;
}

interface Shooter {
  id: number;
  match_id: number;
  division_id: number;
}

interface Stage {
  id: number;
  match_id: number;
}

// POST /matches/:matchId/scores/flextarget
router.post('/flextarget', (req: Request, res: Response) => {
  const matchId = Number(req.params['matchId']);
  const parsed = FlexTargetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(fail(parsed.error.message));
    return;
  }

  const { shooter_bib, stage_id, total_time, hits, penalties, first_shot, fastest_split } =
    parsed.data;

  try {
    // 1. Find shooter by bib number in this match
    const shooter = db
      .prepare(`SELECT * FROM shooters WHERE match_id = ? AND bib_number = ?`)
      .get(matchId, String(shooter_bib)) as Shooter | undefined;
    if (!shooter) {
      res.status(404).json(fail(`Shooter with bib "${shooter_bib}" not found in match ${matchId}`));
      return;
    }

    // 2. Find stage: try name match first, then id
    let stage: Stage | undefined;
    const stageIdStr = String(stage_id);
    stage = db
      .prepare(`SELECT * FROM stages WHERE match_id = ? AND name LIKE ?`)
      .get(matchId, `%${stageIdStr}%`) as Stage | undefined;
    if (!stage) {
      const numericId = Number(stageIdStr);
      if (!isNaN(numericId)) {
        stage = db
          .prepare(`SELECT * FROM stages WHERE match_id = ? AND id = ?`)
          .get(matchId, numericId) as Stage | undefined;
      }
    }
    if (!stage) {
      res.status(404).json(fail(`Stage "${stage_id}" not found in match ${matchId}`));
      return;
    }

    // 3. Resolve power factor from division code
    const division = db
      .prepare(`SELECT code FROM divisions WHERE id = ?`)
      .get(shooter.division_id) as DivisionCodeRow | undefined;
    if (!division) {
      res.status(404).json(fail('Division not found for shooter'));
      return;
    }
    const powerFactor = DIVISION_POWER_FACTOR[division.code];
    if (!powerFactor) {
      res.status(400).json(fail(`Unsupported division code: ${division.code}`));
      return;
    }

    // 4. Calculate score
    const { totalPoints, hitFactor } = calculateScore(hits, penalties, total_time, powerFactor);

    // 5. UPSERT into scores
    db.prepare(
      `INSERT INTO scores
        (match_id, shooter_id, stage_id, total_time, a_hits, c_hits, d_hits, m_hits, n_hits, pe,
         first_shot, fastest_split, total_points, hit_factor, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(shooter_id, stage_id) DO UPDATE SET
         total_time = excluded.total_time,
         a_hits = excluded.a_hits,
         c_hits = excluded.c_hits,
         d_hits = excluded.d_hits,
         m_hits = excluded.m_hits,
         n_hits = excluded.n_hits,
         pe = excluded.pe,
         first_shot = excluded.first_shot,
         fastest_split = excluded.fastest_split,
         total_points = excluded.total_points,
         hit_factor = excluded.hit_factor,
         confirmed = 0,
         updated_at = datetime('now')`
    ).run(
      matchId,
      shooter.id,
      stage.id,
      total_time,
      hits.A,
      hits.C,
      hits.D,
      hits.M,
      hits.N,
      penalties.PE,
      first_shot ?? null,
      fastest_split ?? null,
      totalPoints,
      hitFactor
    );

    const score = db
      .prepare(`SELECT * FROM scores WHERE shooter_id = ? AND stage_id = ?`)
      .get(shooter.id, stage.id);

    res.status(200).json(ok({ score, totalPoints, hitFactor }));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// GET /matches/:matchId/scores
router.get('/', (req: Request, res: Response) => {
  const matchId = Number(req.params['matchId']);
  try {
    const scores = db
      .prepare(
        `SELECT sc.*,
                sh.name AS shooter_name, sh.bib_number,
                st.name AS stage_name,
                d.name AS division_name
         FROM scores sc
         JOIN shooters sh ON sc.shooter_id = sh.id
         JOIN stages st ON sc.stage_id = st.id
         JOIN divisions d ON sh.division_id = d.id
         WHERE sc.match_id = ?
         ORDER BY st.sort_order, sh.bib_number`
      )
      .all(matchId);
    res.json(ok(scores));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// GET /shooters/:shooterId/scores  (mounted separately)
export function getShooterScores(req: Request, res: Response): void {
  const shooterId = Number(req.params['shooterId']);
  try {
    const scores = db
      .prepare(
        `SELECT sc.*,
                st.name AS stage_name, st.sort_order AS stage_sort_order
         FROM scores sc
         JOIN stages st ON sc.stage_id = st.id
         WHERE sc.shooter_id = ?
         ORDER BY st.sort_order`
      )
      .all(shooterId);
    res.json(ok(scores));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
}

// PUT /scores/:id/confirm  (mounted separately)
export function confirmScore(req: Request, res: Response): void {
  const id = Number(req.params['id']);
  try {
    const score = db.prepare(`SELECT * FROM scores WHERE id = ?`).get(id);
    if (!score) {
      res.status(404).json(fail('Score not found'));
      return;
    }
    db.prepare(`UPDATE scores SET confirmed = 1, updated_at = datetime('now') WHERE id = ?`).run(id);
    const updated = db.prepare(`SELECT * FROM scores WHERE id = ?`).get(id);
    res.json(ok(updated));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
}

// DELETE /scores/:id  (mounted separately)
export function deleteScore(req: Request, res: Response): void {
  const id = Number(req.params['id']);
  try {
    const score = db.prepare(`SELECT * FROM scores WHERE id = ?`).get(id) as
      | { confirmed: number }
      | undefined;
    if (!score) {
      res.status(404).json(fail('Score not found'));
      return;
    }
    if (score.confirmed === 1) {
      res.status(409).json(fail('Cannot delete a confirmed score'));
      return;
    }
    db.prepare(`DELETE FROM scores WHERE id = ?`).run(id);
    res.json(ok({ id }));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
}

export default router;
