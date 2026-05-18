import db from '../db.js';
function round2(value) {
    return Math.round(value * 100) / 100;
}
function getShooterBaseList(matchId, divisionId, categoryFilter) {
    let sql = `
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
      COALESCE(d.power_factor, 'minor') AS power_factor
    FROM shooters s
    JOIN divisions d ON s.division_id = d.id
    WHERE s.match_id = ?
  `;
    const params = [matchId];
    if (divisionId !== null) {
        sql += ` AND s.division_id = ?`;
        params.push(divisionId);
    }
    if (categoryFilter?.gender) {
        sql += ` AND s.gender = ?`;
        params.push(categoryFilter.gender);
    }
    if (categoryFilter?.minAge !== undefined) {
        sql += ` AND s.age IS NOT NULL AND s.age >= ?`;
        params.push(categoryFilter.minAge);
    }
    if (categoryFilter?.maxAge !== undefined) {
        sql += ` AND s.age IS NOT NULL AND s.age < ?`;
        params.push(categoryFilter.maxAge);
    }
    sql += ` ORDER BY d.sort_order, d.id, s.bib_number, s.id`;
    return db.prepare(sql).all(...params);
}
function getStagePoints(stageId) {
    const stage = db
        .prepare(`SELECT COALESCE(stage_points, max_points, 0) AS stage_points FROM stages WHERE id = ?`)
        .get(stageId);
    return stage?.stage_points ?? 0;
}
function getDivisionStageScores(matchId, stageId, shooterIds) {
    if (shooterIds.length === 0)
        return [];
    const placeholders = shooterIds.map(() => '?').join(',');
    const sql = `
    SELECT sc.shooter_id, sc.hit_factor, sc.total_points, sc.total_time
    FROM scores sc
    WHERE sc.match_id = ?
      AND sc.stage_id = ?
      AND sc.shooter_id IN (${placeholders})
    ORDER BY sc.hit_factor DESC, sc.total_points DESC, sc.total_time ASC, sc.shooter_id ASC
  `;
    return db.prepare(sql).all(matchId, stageId, ...shooterIds);
}
export function calculateStageRanking(matchId, stageId, divisionId, categoryFilter) {
    const shooters = getShooterBaseList(matchId, divisionId, categoryFilter);
    if (shooters.length === 0)
        return [];
    const stagePointsMax = getStagePoints(stageId);
    const divisionGroups = new Map();
    for (const shooter of shooters) {
        if (!divisionGroups.has(shooter.division_id)) {
            divisionGroups.set(shooter.division_id, []);
        }
        divisionGroups.get(shooter.division_id)?.push(shooter.id);
    }
    const ranked = [];
    for (const [divId, shooterIds] of divisionGroups.entries()) {
        const results = getDivisionStageScores(matchId, stageId, shooterIds);
        if (results.length === 0)
            continue;
        const maxHF = results[0]?.hit_factor ?? 0;
        results.forEach((row, index) => {
            const percentage = maxHF > 0 ? (row.hit_factor / maxHF) * 100 : 0;
            const earned = (percentage / 100) * stagePointsMax;
            ranked.push({
                shooter_id: row.shooter_id,
                division_id: divId,
                stage_id: stageId,
                hit_factor: row.hit_factor,
                total_points: row.total_points,
                total_time: row.total_time,
                percentage: round2(percentage),
                stage_points_earned: round2(earned),
                stage_points_max: stagePointsMax,
                rank_in_stage: index + 1,
            });
        });
    }
    ranked.sort((a, b) => {
        if (b.percentage !== a.percentage)
            return b.percentage - a.percentage;
        if (b.hit_factor !== a.hit_factor)
            return b.hit_factor - a.hit_factor;
        if (b.stage_points_earned !== a.stage_points_earned)
            return b.stage_points_earned - a.stage_points_earned;
        return a.shooter_id - b.shooter_id;
    });
    return ranked;
}
export function calculateOverallRanking(matchId, divisionId, categoryFilter) {
    const stages = db
        .prepare(`SELECT id, COALESCE(stage_points, max_points, 0) AS stage_points FROM stages WHERE match_id = ? ORDER BY sort_order, id`)
        .all(matchId);
    const shooters = getShooterBaseList(matchId, divisionId, categoryFilter);
    if (shooters.length === 0)
        return [];
    const divisionGroups = new Map();
    for (const shooter of shooters) {
        if (!divisionGroups.has(shooter.division_id)) {
            divisionGroups.set(shooter.division_id, []);
        }
        divisionGroups.get(shooter.division_id)?.push(shooter);
    }
    const shooterStagePoints = new Map();
    for (const [, divShooters] of divisionGroups.entries()) {
        const shooterIds = divShooters.map((s) => s.id);
        for (const stage of stages) {
            const scores = getDivisionStageScores(matchId, stage.id, shooterIds);
            if (scores.length === 0)
                continue;
            const maxHF = scores[0]?.hit_factor ?? 0;
            const stagePointsMax = stage.stage_points;
            scores.forEach((score, index) => {
                const percentage = maxHF > 0 ? (score.hit_factor / maxHF) * 100 : 0;
                const earned = (percentage / 100) * stagePointsMax;
                if (!shooterStagePoints.has(score.shooter_id)) {
                    shooterStagePoints.set(score.shooter_id, new Map());
                }
                shooterStagePoints.get(score.shooter_id)?.set(stage.id, {
                    percentage: round2(percentage),
                    stage_points_earned: round2(earned),
                    hit_factor: score.hit_factor,
                    rank_in_stage: index + 1,
                    stage_points_max: stagePointsMax,
                });
            });
        }
    }
    return shooters.map((shooter) => {
        const stageMap = shooterStagePoints.get(shooter.id);
        let totalStagePoints = 0;
        let totalPercentage = 0;
        let stagesShot = 0;
        if (stageMap) {
            for (const detail of stageMap.values()) {
                totalStagePoints += detail.stage_points_earned;
                totalPercentage += detail.percentage;
                stagesShot += 1;
            }
        }
        return {
            ...shooter,
            stages_shot: stagesShot,
            total_stage_points: round2(totalStagePoints),
            avg_percentage: stagesShot > 0 ? round2(totalPercentage / stagesShot) : 0,
            stage_details: stageMap ? Object.fromEntries(stageMap.entries()) : {},
        };
    });
}
