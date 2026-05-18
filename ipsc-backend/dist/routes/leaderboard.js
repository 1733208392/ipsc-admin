import { Router } from 'express';
import db from '../db.js';
import { ok, fail } from '../types.js';
import { calculateOverallRanking, calculateStageRanking, } from '../services/ranking.js';
const router = Router({ mergeParams: true });
function parseCategory(category) {
    if (!category)
        return undefined;
    switch (category) {
        case 'lady':
            return { gender: 'female' };
        case 'junior':
            return { maxAge: 21 };
        case 'senior':
            return { minAge: 55 };
        case 'super_senior':
            return { minAge: 65 };
        default:
            return undefined;
    }
}
// GET /matches/:matchId/leaderboard?division_id=&category=&stage_id=&sort_by=
router.get('/', (req, res) => {
    const matchId = Number(req.params['matchId']);
    const divisionParam = req.query['division_id'];
    const categoryParam = req.query['category'];
    const stageIdParam = req.query['stage_id'];
    const sortByParam = req.query['sort_by'] ?? 'stage_points';
    const sortBy = sortByParam === 'percentage' ? 'percentage' : 'stage_points';
    const isOverall = !divisionParam || divisionParam === 'overall';
    const divisionId = isOverall ? null : Number(divisionParam);
    if (!isOverall && (!Number.isInteger(divisionId) || divisionId <= 0)) {
        res.status(400).json(fail('division_id must be a positive integer'));
        return;
    }
    if (categoryParam && !['lady', 'junior', 'senior', 'super_senior'].includes(categoryParam)) {
        res.status(400).json(fail('category must be one of: lady, junior, senior, super_senior'));
        return;
    }
    const stageId = stageIdParam ? Number(stageIdParam) : null;
    if (stageIdParam && (!Number.isInteger(stageId) || stageId <= 0)) {
        res.status(400).json(fail('stage_id must be a positive integer'));
        return;
    }
    try {
        const match = db.prepare(`SELECT id FROM matches WHERE id = ?`).get(matchId);
        if (!match) {
            res.status(404).json(fail('Match not found'));
            return;
        }
        const categoryFilter = parseCategory(categoryParam);
        if (stageId !== null) {
            const stageInfo = db
                .prepare(`
          SELECT id, name, COALESCE(stage_points, max_points, 0) AS stage_points
          FROM stages
          WHERE id = ? AND match_id = ?
        `)
                .get(stageId, matchId);
            if (!stageInfo) {
                res.status(404).json(fail('Stage not found'));
                return;
            }
            const stageRanking = calculateStageRanking(matchId, stageId, divisionId, categoryFilter);
            const shooterIds = stageRanking.map((item) => item.shooter_id);
            const shooterMap = new Map();
            if (shooterIds.length > 0) {
                const placeholders = shooterIds.map(() => '?').join(',');
                const shooters = db
                    .prepare(`
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
              d.name AS division_name
            FROM shooters s
            JOIN divisions d ON s.division_id = d.id
            WHERE s.id IN (${placeholders})
          `)
                    .all(...shooterIds);
                shooters.forEach((s) => shooterMap.set(s.id, s));
            }
            const rankings = stageRanking
                .map((item) => {
                const shooter = shooterMap.get(item.shooter_id);
                if (!shooter)
                    return null;
                return {
                    rank_in_stage: item.rank_in_stage,
                    id: shooter.id,
                    name: shooter.name,
                    bib_number: shooter.bib_number,
                    age: shooter.age,
                    gender: shooter.gender,
                    region: shooter.region,
                    club: shooter.club,
                    division_id: shooter.division_id,
                    division_code: shooter.division_code,
                    division_name: shooter.division_name,
                    hit_factor: item.hit_factor,
                    percentage: item.percentage,
                    stage_points_earned: item.stage_points_earned,
                    stage_points_max: item.stage_points_max,
                    total_points: item.total_points,
                    total_time: item.total_time,
                };
            })
                .filter((item) => item !== null)
                .sort((a, b) => {
                if (b.percentage !== a.percentage)
                    return b.percentage - a.percentage;
                if (b.hit_factor !== a.hit_factor)
                    return b.hit_factor - a.hit_factor;
                return String(a.bib_number).localeCompare(String(b.bib_number));
            })
                .map((item, idx) => ({
                ...item,
                rank_in_stage: idx + 1,
            }));
            res.json(ok({
                filters: {
                    division: isOverall ? 'overall' : divisionId,
                    category: categoryParam ?? null,
                    stage: stageId,
                    sort_by: sortBy,
                },
                stage_info: stageInfo,
                rankings,
            }));
        }
        else {
            const rankings = calculateOverallRanking(matchId, divisionId, categoryFilter)
                .sort((a, b) => {
                if (sortBy === 'percentage') {
                    if (b.avg_percentage !== a.avg_percentage)
                        return b.avg_percentage - a.avg_percentage;
                }
                else {
                    if (b.total_stage_points !== a.total_stage_points)
                        return b.total_stage_points - a.total_stage_points;
                }
                return String(a.bib_number).localeCompare(String(b.bib_number));
            })
                .map((item, idx) => ({
                rank: idx + 1,
                ...item,
            }));
            res.json(ok({
                filters: {
                    division: isOverall ? 'overall' : divisionId,
                    category: categoryParam ?? null,
                    stage: null,
                    sort_by: sortBy,
                },
                rankings,
            }));
        }
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
export default router;
