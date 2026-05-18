import { Router, Request, Response } from 'express';
import db from '../db.js';
import { ok, fail } from '../types.js';
import { CategoryType } from '../constants.js';

const router = Router({ mergeParams: true });

// GET /matches/:matchId/leaderboard?division_id=&category=&stage_id=
router.get('/', (req: Request, res: Response) => {
  const matchId = Number(req.params['matchId']);
  const divisionParam = req.query['division_id'] as string | undefined;
  const categoryParam = req.query['category'] as string | undefined;
  const stageIdParam = req.query['stage_id'] as string | undefined;

  const validCategories: CategoryType[] = ['junior', 'senior', 'super_senior', 'lady'];
  if (categoryParam && !validCategories.includes(categoryParam as CategoryType)) {
    res.status(400).json(fail(`Invalid category. Must be one of: ${validCategories.join(', ')}`));
    return;
  }

  const isOverall = !divisionParam || divisionParam === 'overall';
  const divisionId = isOverall ? null : Number(divisionParam);
  if (!isOverall && (!Number.isInteger(divisionId) || (divisionId as number) <= 0)) {
    res.status(400).json(fail('division_id must be a positive integer or "overall"'));
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

    if (categoryParam === 'lady') {
      sql += ` AND s.gender = 'female'`;
    } else if (categoryParam === 'junior') {
      sql += ` AND s.age IS NOT NULL AND s.age < 21`;
    } else if (categoryParam === 'senior') {
      sql += ` AND s.age IS NOT NULL AND s.age >= 55`;
    } else if (categoryParam === 'super_senior') {
      sql += ` AND s.age IS NOT NULL AND s.age >= 65`;
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
          division: isOverall ? 'overall' : divisionId,
          category: categoryParam || null,
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
