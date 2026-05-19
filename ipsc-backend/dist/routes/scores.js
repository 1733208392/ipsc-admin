import { Router } from 'express';
import db from '../db.js';
import { FlexTargetSchema, SubmitScoreCardSchema, UpsertScoreCardSchema, ok, fail, } from '../types.js';
import { calculateScore } from '../scoring.js';
import { DIVISION_POWER_FACTOR } from '../constants.js';
const router = Router({ mergeParams: true });
function getStage(matchId, stageId) {
    return db
        .prepare(`SELECT id, match_id, name, targets_count, poppers_plates_count FROM stages WHERE match_id = ? AND id = ?`)
        .get(matchId, stageId);
}
function getShooter(matchId, shooterId) {
    return db
        .prepare(`SELECT id, match_id, division_id FROM shooters WHERE match_id = ? AND id = ?`)
        .get(matchId, shooterId);
}
function getPowerFactorForShooter(shooter) {
    const division = db
        .prepare(`SELECT code FROM divisions WHERE id = ?`)
        .get(shooter.division_id);
    if (!division)
        return undefined;
    return DIVISION_POWER_FACTOR[division.code];
}
function buildDefaultRows(stage) {
    const paperRows = Array.from({ length: stage.targets_count }).map((_, idx) => ({
        row_type: 'paper',
        row_no: idx + 1,
        a_hits: 0,
        c_hits: 0,
        d_hits: 0,
        m_hits: 2, // default: no shots = 2 misses (IPSC minimum rounds per target)
        ns_hits: 0,
        npm_hits: 0,
    }));
    const steelRows = Array.from({ length: stage.poppers_plates_count }).map((_, idx) => ({
        row_type: 'steel',
        row_no: idx + 1,
        a_hits: 0,
        c_hits: 0,
        d_hits: 0,
        m_hits: 0,
        ns_hits: 0,
        npm_hits: 0,
    }));
    return [...steelRows, ...paperRows];
}
function buildEmptyRows(stage) {
    const steelRows = Array.from({ length: stage.poppers_plates_count }).map((_, idx) => ({
        row_type: 'steel',
        row_no: idx + 1,
        a_hits: 0,
        c_hits: 0,
        d_hits: 0,
        m_hits: 0,
        ns_hits: 0,
        npm_hits: 0,
    }));
    const paperRows = Array.from({ length: stage.targets_count }).map((_, idx) => ({
        row_type: 'paper',
        row_no: idx + 1,
        a_hits: 0,
        c_hits: 0,
        d_hits: 0,
        m_hits: 0,
        ns_hits: 0,
        npm_hits: 0,
    }));
    return [...steelRows, ...paperRows];
}
function distribute(total, slots, capPerSlot) {
    if (slots <= 0 || total <= 0)
        return Array.from({ length: Math.max(slots, 0) }, () => 0);
    const out = Array.from({ length: slots }, () => 0);
    let remaining = total;
    let idx = 0;
    while (remaining > 0) {
        if (capPerSlot !== undefined && out[idx] >= capPerSlot) {
            idx = (idx + 1) % slots;
            const allCapped = out.every((v) => v >= capPerSlot);
            if (allCapped)
                break;
            continue;
        }
        out[idx] += 1;
        remaining -= 1;
        idx = (idx + 1) % slots;
    }
    return out;
}
function buildRowsFromScore(stage, score) {
    const rows = buildEmptyRows(stage);
    const paperIndexes = rows
        .map((row, idx) => ({ row, idx }))
        .filter((item) => item.row.row_type === 'paper')
        .map((item) => item.idx);
    const targetIndexes = paperIndexes.length > 0
        ? paperIndexes
        : rows.map((_, idx) => idx);
    const aDist = distribute(Math.max(0, score.a_hits), targetIndexes.length);
    const cDist = distribute(Math.max(0, score.c_hits), targetIndexes.length);
    const dDist = distribute(Math.max(0, score.d_hits), targetIndexes.length);
    const mDist = distribute(Math.max(0, score.m_hits), targetIndexes.length);
    const nsDist = distribute(Math.max(0, score.n_hits), targetIndexes.length, 2);
    targetIndexes.forEach((targetIdx, i) => {
        rows[targetIdx].a_hits = aDist[i] ?? 0;
        rows[targetIdx].c_hits = cDist[i] ?? 0;
        rows[targetIdx].d_hits = dDist[i] ?? 0;
        rows[targetIdx].m_hits = mDist[i] ?? 0;
        rows[targetIdx].ns_hits = nsDist[i] ?? 0;
    });
    return rows;
}
function aggregateFromRows(rows) {
    let a = 0;
    let c = 0;
    let d = 0;
    let m = 0;
    let ns = 0;
    let npm = 0;
    for (const row of rows) {
        a += row.a_hits;
        c += row.c_hits;
        d += row.d_hits;
        m += row.m_hits;
        ns += row.ns_hits;
        npm += row.npm_hits;
    }
    return { a, c, d, m, ns, npm };
}
function normalizeRows(rows) {
    return rows.map((row) => {
        const cappedNs = Math.min(row.ns_hits, 2);
        if (row.row_type !== 'steel') {
            // Paper target: M is always auto-derived from scoring hits
            const scoring = row.a_hits + row.c_hits + row.d_hits;
            return {
                ...row,
                ns_hits: cappedNs,
                m_hits: Math.max(0, 2 - scoring),
            };
        }
        return {
            ...row,
            ns_hits: cappedNs,
            c_hits: 0,
            d_hits: 0,
            npm_hits: 0,
        };
    });
}
function capNsByTarget(nsHits, targetCount) {
    return Math.min(nsHits, Math.max(0, targetCount) * 2);
}
function sumPenaltyReasons(penalties) {
    return penalties.reduce((sum, item) => sum + item.count, 0);
}
function countAutoUnengagedPE(rows) {
    return rows.filter((row) => row.row_type === 'paper' && row.a_hits + row.c_hits + row.d_hits === 0).length;
}
function getScoreCardPayload(matchId, shooterId, stageId, scoreId) {
    const shooter = db
        .prepare(`SELECT id, match_id, division_id, name, bib_number FROM shooters WHERE match_id = ? AND id = ?`)
        .get(matchId, shooterId);
    if (!shooter)
        return null;
    const stage = getStage(matchId, stageId);
    if (!stage)
        return null;
    const scores = db
        .prepare(`SELECT * FROM scores WHERE shooter_id = ? AND stage_id = ? ORDER BY submitted_at DESC, id DESC`)
        .all(shooterId, stageId);
    const score = scoreId
        ? scores.find((item) => item.id === scoreId) ?? null
        : (scores[0] ?? null);
    if (scoreId && !score) {
        return null;
    }
    const rows = score
        ? db
            .prepare(`SELECT row_type, row_no, a_hits, c_hits, d_hits, m_hits, ns_hits, npm_hits
           FROM score_card_rows
           WHERE score_id = ?
           ORDER BY CASE WHEN row_type = 'steel' THEN 0 ELSE 1 END, row_no`)
            .all(score.id)
        : [];
    const penalties = score
        ? db
            .prepare(`SELECT reason_code, reason_label, count, sort_order
           FROM score_penalties
           WHERE score_id = ?
           ORDER BY sort_order, reason_code`)
            .all(score.id)
        : [];
    return {
        shooter,
        stage,
        scores,
        score: score ?? null,
        rows: rows.length > 0
            ? rows
            : score
                ? buildRowsFromScore(stage, score)
                : buildDefaultRows(stage),
        penalty_reasons: penalties,
    };
}
// POST /matches/:matchId/scores/flextarget
router.post('/flextarget', (req, res) => {
    const matchId = Number(req.params['matchId']);
    const parsed = FlexTargetSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    const { shooter_bib, stage_id, total_time, hits, penalties, first_shot, fastest_split } = parsed.data;
    try {
        // 1. Find shooter by bib number in this match
        const shooter = db
            .prepare(`SELECT * FROM shooters WHERE match_id = ? AND bib_number = ?`)
            .get(matchId, String(shooter_bib));
        if (!shooter) {
            res.status(404).json(fail(`Shooter with bib "${shooter_bib}" not found in match ${matchId}`));
            return;
        }
        // 2. Find stage: try name match first, then id
        let stage;
        const stageIdStr = String(stage_id);
        stage = db
            .prepare(`SELECT * FROM stages WHERE match_id = ? AND name LIKE ?`)
            .get(matchId, `%${stageIdStr}%`);
        if (!stage) {
            const numericId = Number(stageIdStr);
            if (!isNaN(numericId)) {
                stage = db
                    .prepare(`SELECT * FROM stages WHERE match_id = ? AND id = ?`)
                    .get(matchId, numericId);
            }
        }
        if (!stage) {
            res.status(404).json(fail(`Stage "${stage_id}" not found in match ${matchId}`));
            return;
        }
        // 3. Resolve power factor from division code
        const division = db
            .prepare(`SELECT code FROM divisions WHERE id = ?`)
            .get(shooter.division_id);
        if (!division) {
            res.status(404).json(fail('Division not found for shooter'));
            return;
        }
        const powerFactor = DIVISION_POWER_FACTOR[division.code];
        if (!powerFactor) {
            res.status(400).json(fail(`Unsupported division code: ${division.code}`));
            return;
        }
        const cappedNHits = capNsByTarget(hits.N, stage.targets_count);
        // 4. Calculate score
        const { totalPoints, hitFactor } = calculateScore({
            ...hits,
            N: cappedNHits,
        }, penalties, total_time, powerFactor, 'normal');
        // 5. Insert new score submission
        db.prepare(`INSERT INTO scores
        (match_id, shooter_id, stage_id, total_time, a_hits, c_hits, d_hits, m_hits, n_hits, pe,
         first_shot, fastest_split, status, review_state, review_submitted_at, total_points, hit_factor, updated_at, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'normal', 'submitted', datetime('now'), ?, ?, datetime('now'), datetime('now'))`).run(matchId, shooter.id, stage.id, total_time, hits.A, hits.C, hits.D, hits.M, cappedNHits, penalties.PE, first_shot ?? null, fastest_split ?? null, totalPoints, hitFactor);
        // Return all scores for this shooter and stage, ordered by submitted_at desc
        const scores = db
            .prepare(`SELECT * FROM scores WHERE shooter_id = ? AND stage_id = ? ORDER BY submitted_at DESC, id DESC`)
            .all(shooter.id, stage.id);
        res.status(200).json(ok({ scores, totalPoints, hitFactor }));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// GET /matches/:matchId/scores
router.get('/', (req, res) => {
    const matchId = Number(req.params['matchId']);
    try {
        const match = db.prepare(`SELECT id FROM matches WHERE id = ?`).get(matchId);
        if (!match) {
            res.status(404).json(fail('Match not found'));
            return;
        }
        const scores = db
            .prepare(`SELECT
           sc.*,
           sh.name AS shooter_name,
           sh.bib_number,
           st.name AS stage_name,
           d.name AS division_name
         FROM scores sc
         JOIN shooters sh ON sc.shooter_id = sh.id
         JOIN stages st ON sc.stage_id = st.id
         JOIN divisions d ON sh.division_id = d.id
         WHERE sc.match_id = ?
         ORDER BY sc.submitted_at DESC, sc.id DESC`)
            .all(matchId);
        res.json(ok(scores));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// GET /matches/:matchId/scores/score-card?shooter_id=&stage_id=
router.get('/score-card', (req, res) => {
    const matchId = Number(req.params['matchId']);
    const shooterId = Number(req.query['shooter_id']);
    const stageId = Number(req.query['stage_id']);
    const scoreIdQuery = req.query['score_id'];
    const scoreId = scoreIdQuery ? Number(scoreIdQuery) : undefined;
    if (!Number.isInteger(shooterId) || shooterId <= 0 || !Number.isInteger(stageId) || stageId <= 0) {
        res.status(400).json(fail('shooter_id and stage_id are required positive integers'));
        return;
    }
    if (scoreIdQuery !== undefined && (!Number.isInteger(scoreId) || scoreId <= 0)) {
        res.status(400).json(fail('score_id must be a positive integer when provided'));
        return;
    }
    try {
        const payload = getScoreCardPayload(matchId, shooterId, stageId, scoreId);
        if (!payload) {
            res.status(404).json(fail('Shooter or stage not found in this match'));
            return;
        }
        res.json(ok(payload));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// PUT /matches/:matchId/scores/score-card
router.put('/score-card', (req, res) => {
    const matchId = Number(req.params['matchId']);
    const parsed = UpsertScoreCardSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    const { shooter_id, stage_id, status, total_time, first_shot, fastest_split, rows, penalty_reasons, } = parsed.data;
    if (status === 'dnf' && (!total_time || total_time <= 0)) {
        res.status(400).json(fail('DNF score requires total_time > 0'));
        return;
    }
    try {
        const shooter = getShooter(matchId, shooter_id);
        const stage = getStage(matchId, stage_id);
        if (!shooter || !stage) {
            res.status(404).json(fail('Shooter or stage not found in this match'));
            return;
        }
        const powerFactor = getPowerFactorForShooter(shooter);
        if (!powerFactor) {
            res.status(400).json(fail('Unsupported division power factor'));
            return;
        }
        const normalizedRows = normalizeRows(rows);
        const agg = aggregateFromRows(normalizedRows);
        const cappedNs = capNsByTarget(agg.ns, stage.targets_count);
        const peCount = sumPenaltyReasons(penalty_reasons) + countAutoUnengagedPE(normalizedRows);
        const normalizedTime = status === 'dq' ? (total_time ?? 0) : (total_time ?? 0);
        const { totalPoints, hitFactor } = calculateScore({
            A: agg.a,
            C: agg.c,
            D: agg.d,
            M: agg.m,
            N: cappedNs + agg.npm,
        }, { PE: peCount }, normalizedTime, powerFactor, status);
        const tx = db.transaction(() => {
            db.prepare(`INSERT INTO scores
          (match_id, shooter_id, stage_id, total_time, a_hits, c_hits, d_hits, m_hits, n_hits, pe,
           first_shot, fastest_split, status, review_state, review_submitted_at, total_points, hit_factor, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', NULL, ?, ?, datetime('now'))
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
           status = excluded.status,
           review_state = 'draft',
           review_submitted_at = NULL,
           total_points = excluded.total_points,
           hit_factor = excluded.hit_factor,
           confirmed = 0,
           updated_at = datetime('now')`).run(matchId, shooter_id, stage_id, normalizedTime, agg.a, agg.c, agg.d, agg.m, cappedNs + agg.npm, peCount, first_shot ?? null, fastest_split ?? null, status, totalPoints, hitFactor);
            const score = db
                .prepare(`SELECT * FROM scores WHERE shooter_id = ? AND stage_id = ?`)
                .get(shooter_id, stage_id);
            db.prepare(`DELETE FROM score_card_rows WHERE score_id = ?`).run(score.id);
            db.prepare(`DELETE FROM score_penalties WHERE score_id = ?`).run(score.id);
            const insertRow = db.prepare(`INSERT INTO score_card_rows
         (score_id, row_type, row_no, a_hits, c_hits, d_hits, m_hits, ns_hits, npm_hits)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            for (const row of normalizedRows) {
                insertRow.run(score.id, row.row_type, row.row_no, row.a_hits, row.c_hits, row.d_hits, row.m_hits, row.ns_hits, row.npm_hits);
            }
            const insertPenalty = db.prepare(`INSERT INTO score_penalties (score_id, reason_code, reason_label, count, sort_order)
         VALUES (?, ?, ?, ?, ?)`);
            for (const reason of penalty_reasons.filter((item) => item.count > 0)) {
                insertPenalty.run(score.id, reason.reason_code, reason.reason_label, reason.count, reason.sort_order);
            }
        });
        tx();
        const payload = getScoreCardPayload(matchId, shooter_id, stage_id);
        res.json(ok(payload));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// POST /matches/:matchId/scores/score-card/submit
router.post('/score-card/submit', (req, res) => {
    const matchId = Number(req.params['matchId']);
    const parsed = SubmitScoreCardSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    const { shooter_id, stage_id } = parsed.data;
    try {
        const shooter = getShooter(matchId, shooter_id);
        const stage = getStage(matchId, stage_id);
        if (!shooter || !stage) {
            res.status(404).json(fail('Shooter or stage not found in this match'));
            return;
        }
        const score = db
            .prepare(`SELECT id, review_state FROM scores WHERE shooter_id = ? AND stage_id = ?`)
            .get(shooter_id, stage_id);
        if (!score) {
            res.status(404).json(fail('Score card not found'));
            return;
        }
        db.prepare(`UPDATE scores
       SET review_state = 'submitted', review_submitted_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`).run(score.id);
        // Return updated payload (all scores for this shooter/stage)
        const payload = getScoreCardPayload(matchId, shooter_id, stage_id);
        res.json(ok(payload));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// GET /shooters/:shooterId/scores  (mounted separately)
export function getShooterScores(req, res) {
    const shooterId = Number(req.params['shooterId']);
    try {
        const scores = db
            .prepare(`SELECT sc.*, st.name AS stage_name, st.sort_order AS stage_sort_order
         FROM scores sc
         JOIN stages st ON sc.stage_id = st.id
         WHERE sc.shooter_id = ?
         ORDER BY st.sort_order`)
            .all(shooterId);
        res.json(ok(scores));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
}
export default router;
