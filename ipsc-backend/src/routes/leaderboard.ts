import { Router, Request, Response } from 'express';
import db from '../db.js';
import { ok, fail } from '../types.js';

const router = Router({ mergeParams: true });

// GET /matches/:matchId/leaderboard?division_id=&sub_division_id=&stage_id=
router.get('/', (req: Request, res: Response) => {
  const matchId = Number(req.params['matchId']);
  const divisionParam = req.query['division_id'] as string | undefined;
  const subDivisionParam = req.query['sub_division_id'] as string | undefined;
  const stageIdParam = req.query['stage_id'] as string | undefined;

  const divisionId = divisionParam ? Number(divisionParam) : null;
  if (divisionParam && (!Number.isInteger(divisionId) || (divisionId as number) <= 0)) {
    res.status(400).json(fail('division_id must be a positive integer'));
    return;
  }

  const subDivisionId = subDivisionParam ? Number(subDivisionParam) : null;
  if (subDivisionParam && (!Number.isInteger(subDivisionId) || (subDivisionId as number) <= 0)) {
    res.status(400).json(fail('sub_division_id must be a positive integer'));
    return;
  }

  const stageId = stageIdParam ? Number(stageIdParam) : null;
  if (stageIdParam && (!Number.isInteger(stageId) || (stageId as number) <= 0)) {
    res.status(400).json(fail('stage_id must be a positive integer'));
    return;
  }

  try {
    const match = db.prepare(`SELECT id FROM matches WHERE id = ?`).get(matchId);
    if (!match) {
      res.status(404).json(fail('Match not found'));
      return;
    }

    // If sub_division_id is specified, get its criteria
    let subDivisionCriteria: { min_age?: number | null; max_age?: number | null; gender?: string | null } | null = null;
    if (subDivisionId !== null) {
      const subDiv = db.prepare(`SELECT min_age, max_age, gender FROM sub_divisions WHERE id = ? AND match_id = ?`).get(subDivisionId, matchId);
      if (!subDiv) {
        res.status(404).json(fail('Sub division not found'));
        return;
      }
      subDivisionCriteria = subDiv as any;
    }

    let sql: string;
    const params: unknown[] = [];

    if (stageId !== null) {
      sql = `
        SELECT
          s.id,
          s.name,
          s.bib_number,
          s.age,
          s.gender,
          s.region,
          s.club,
          d.id AS division_id,
          d.code AS division_code,
          d.name AS division_name,
          sc.hit_factor AS stage_hit_factor,
          sc.total_points AS stage_points,
          sc.total_time AS stage_time,
          sc.a_hits,
          sc.c_hits,
          sc.d_hits,
          sc.m_hits,
          sc.n_hits,
          sc.pe,
          sc.confirmed
        FROM shooters s
        JOIN divisions d ON s.division_id = d.id
        JOIN scores sc ON s.id = sc.shooter_id AND sc.stage_id = ?
        WHERE s.match_id = ?
      `;
      params.push(stageId, matchId);
    } else {
      sql = `
        SELECT
          s.id,
          s.name,
          s.bib_number,
          s.age,
          s.gender,
          s.region,
          s.club,
          d.id AS division_id,
          d.code AS division_code,
          d.name AS division_name,
          COUNT(sc.id) AS stages_shot,
          COALESCE(SUM(sc.total_points), 0) AS total_points,
          COALESCE(AVG(sc.hit_factor), 0) AS avg_hit_factor
        FROM shooters s
        JOIN divisions d ON s.division_id = d.id
        LEFT JOIN scores sc ON s.id = sc.shooter_id
        WHERE s.match_id = ?
      `;
      params.push(matchId);
    }

    if (divisionId !== null) {
      sql += ` AND s.division_id = ?`;
      params.push(divisionId);
    }

    // Apply sub-division criteria
    if (subDivisionCriteria !== null) {
      if (subDivisionCriteria.gender !== null) {
        sql += ` AND s.gender = ?`;
        params.push(subDivisionCriteria.gender);
      }
      if (subDivisionCriteria.min_age !== null) {
        sql += ` AND s.age IS NOT NULL AND s.age >= ?`;
        params.push(subDivisionCriteria.min_age);
      }
      if (subDivisionCriteria.max_age !== null) {
        sql += ` AND s.age IS NOT NULL AND s.age < ?`;
        params.push(subDivisionCriteria.max_age);
      }
    }

    if (stageId === null) {
      sql += ` GROUP BY s.id, d.id`;
      sql += ` ORDER BY total_points DESC, avg_hit_factor DESC, s.bib_number ASC`;
    } else {
      sql += ` ORDER BY sc.hit_factor DESC, sc.total_points DESC, s.bib_number ASC`;
    }

    const rankings = db.prepare(sql).all(...params);
    res.json(
      ok({
        filters: {
          division: divisionId,
          sub_division: subDivisionId,
          stage: stageId,
        },
        rankings,
      })
    );
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

export default router;
