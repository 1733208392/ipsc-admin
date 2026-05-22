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
        return {
            ...row,
            ns_hits: Math.min(row.ns_hits, 2),
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
    // Always prefer the mobile (iOS) score over any admin draft, regardless of
    // which one was written last. The mobile score card is the canonical source
    // of truth; admin drafts are only used as a fallback when no iOS submission
    // exists for this shooter/stage.
    const score = scoreId
        ? scores.find((item) => item.id === scoreId) ?? null
        : (scores.find((item) => item.review_state === 'submitted')
            ?? scores[0]
            ?? null);
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
    // Always return the rows exactly as submitted by mobile (iOS) — do not
    // synthesize or redistribute. If there are no per-target rows persisted
    // (e.g. legacy entries without score_card_rows), return an empty grid
    // so the admin UI reflects mobile's actual score card 1:1.
    return {
        shooter,
        stage,
        scores,
        score: score ?? null,
        rows,
        penalty_reasons: penalties,
    };
}
// POST /matches/:matchId/scores/flextarget
//
// Mobile (iOS) is the single source of truth for the score card.
// The payload describes the per-target row grid plus the RO‑added penalties
// and run status; the backend ignores any stage config (targets_count /
// poppers_plates_count) and derives every aggregate from `rows`.
//
// Request body (v2):
//   {
//     "shooter_bib": "123",
//     "stage_id": "S1",                            // string or number
//     "total_time": 12.34,                         // 0 allowed if DQ/DNF
//     "status": "normal" | "dnf" | "dq",
//     "rows": [                                    // REQUIRED, source of truth
//       { "row_type": "paper"|"steel", "row_no": 1,
//         "A": 0, "C": 0, "D": 0, "M": 0, "N": 0 }
//     ],
//     "penalties": {
//       "additional_pe": 0,                        // RO-added PE total
//       "reasons": [                               // optional breakdown
//         { "reason_code": "10.2.1",
//           "reason_label": "Foot fault",
//           "count": 1, "sort_order": 0 }
//       ],
//       "PE": 0                                    // legacy alias of additional_pe
//     },
//     "first_shot": 1.20,
//     "fastest_split": 0.30
//   }
//
// Response (200):
//   {
//     "score_id": 99, "status": "normal",
//     "totals": { "A": 6, "C": 2, "D": 0, "M": 0, "N": 0 },
//     "rows": [ ...echoed back... ],
//     "penalties": {
//       "auto_pe": 0,                              // unengaged paper targets
//       "additional_pe": 1,                        // from request
//       "total_pe": 1,                             // auto_pe + additional_pe
//       "reasons": [ ... ]
//     },
//     "total_time": 12.34,
//     "total_points": 50, "hit_factor": 4.0518,
//     "scores": [ ...all submissions for this shooter/stage... ]
//   }
router.post('/flextarget', (req, res) => {
    const matchId = Number(req.params['matchId']);
    const parsed = FlexTargetSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    const { shooter_bib, stage_id, total_time, status, rows: perTargetRows, penalties, first_shot, fastest_split, } = parsed.data;
    try {
        // 1. Find shooter by bib number in this match
        const shooter = db
            .prepare(`SELECT * FROM shooters WHERE match_id = ? AND bib_number = ?`)
            .get(matchId, String(shooter_bib));
        if (!shooter) {
            res.status(404).json(fail(`Shooter with bib "${shooter_bib}" not found in match ${matchId}`));
            return;
        }
        // 2. Find stage: try name match first, then id. The stage row is used
        //    only for identity/foreign-key — its targets_count is intentionally
        //    NOT used to validate or reshape the row grid.
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
        // 4. Normalize rows (cap N per row at 2 — IPSC max no-shoot hits per target)
        //    and derive aggregate hits straight from the row grid.
        const normalizedRows = perTargetRows.map((row) => ({
            ...row,
            N: Math.min(row.N, 2),
        }));
        const totals = normalizedRows.reduce((acc, row) => ({
            A: acc.A + row.A,
            C: acc.C + row.C,
            D: acc.D + row.D,
            M: acc.M + row.M,
            N: acc.N + row.N,
        }), { A: 0, C: 0, D: 0, M: 0, N: 0 });
        // 5. Penalties: auto PE for unengaged paper targets + RO-added PE.
        const autoPe = normalizedRows.filter((row) => row.row_type === 'paper' && row.A + row.C + row.D === 0).length;
        const reasons = penalties.reasons ?? [];
        const reasonsSum = reasons.reduce((sum, r) => sum + r.count, 0);
        const additionalPe = penalties.additional_pe
            ?? penalties.PE
            ?? reasonsSum;
        const totalPe = autoPe + additionalPe;
        // 6. Compute score from row-derived totals + total PE.
        const { totalPoints, hitFactor } = calculateScore(totals, { PE: totalPe }, total_time, powerFactor, status);
        // 7. Insert score header.
        const insertScoreResult = db.prepare(`INSERT INTO scores
        (match_id, shooter_id, stage_id, total_time, a_hits, c_hits, d_hits, m_hits, n_hits, pe,
         first_shot, fastest_split, status, review_state, review_submitted_at, total_points, hit_factor, updated_at, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', datetime('now'), ?, ?, datetime('now'), datetime('now'))`).run(matchId, shooter.id, stage.id, total_time, totals.A, totals.C, totals.D, totals.M, totals.N, totalPe, first_shot ?? null, fastest_split ?? null, status, totalPoints, hitFactor);
        const scoreId = Number(insertScoreResult.lastInsertRowid);
        // 8. Persist the row grid exactly as received from the mobile app.
        const insertRow = db.prepare(`INSERT INTO score_card_rows
       (score_id, row_type, row_no, a_hits, c_hits, d_hits, m_hits, ns_hits, npm_hits)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const row of normalizedRows) {
            insertRow.run(scoreId, row.row_type, row.row_no, row.A, row.C, row.D, row.M, row.N, 0);
        }
        // 9. Persist RO-added penalty reasons (if provided) so the admin review
        //    page can display the same breakdown the RO entered on the iOS app.
        if (reasons.length > 0) {
            const insertReason = db.prepare(`INSERT INTO score_penalties (score_id, reason_code, reason_label, count, sort_order)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(score_id, reason_code) DO UPDATE SET
           reason_label = excluded.reason_label,
           count        = excluded.count,
           sort_order   = excluded.sort_order`);
            for (const reason of reasons) {
                insertReason.run(scoreId, reason.reason_code, reason.reason_label ?? reason.reason_code, reason.count, reason.sort_order ?? 0);
            }
        }
        // 10. Return enriched payload reflecting the canonical mobile score card.
        const scores = db
            .prepare(`SELECT * FROM scores WHERE shooter_id = ? AND stage_id = ? ORDER BY submitted_at DESC, id DESC`)
            .all(shooter.id, stage.id);
        res.status(200).json(ok({
            score_id: scoreId,
            status,
            totals,
            rows: normalizedRows.map((row) => ({
                row_type: row.row_type,
                row_no: row.row_no,
                A: row.A,
                C: row.C,
                D: row.D,
                M: row.M,
                N: row.N,
            })),
            penalties: {
                auto_pe: autoPe,
                additional_pe: additionalPe,
                total_pe: totalPe,
                reasons: reasons.map((r) => ({
                    reason_code: r.reason_code,
                    reason_label: r.reason_label ?? r.reason_code,
                    count: r.count,
                    sort_order: r.sort_order ?? 0,
                })),
            },
            total_time,
            total_points: totalPoints,
            hit_factor: hitFactor,
            scores,
        }));
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
// PUT /matches/:matchId/scores/:scoreId/confirm
router.put('/:scoreId/confirm', (req, res) => {
    const matchId = Number(req.params['matchId']);
    const scoreId = Number(req.params['scoreId']);
    try {
        const score = db
            .prepare(`SELECT id FROM scores WHERE id = ? AND match_id = ?`)
            .get(scoreId, matchId);
        if (!score) {
            res.status(404).json(fail('Score not found in this match'));
            return;
        }
        db.prepare(`UPDATE scores SET confirmed = 1, updated_at = datetime('now') WHERE id = ?`).run(scoreId);
        const updated = db.prepare(`SELECT * FROM scores WHERE id = ?`).get(scoreId);
        res.json(ok(updated));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// DELETE /matches/:matchId/scores/:scoreId
router.delete('/:scoreId', (req, res) => {
    const matchId = Number(req.params['matchId']);
    const scoreId = Number(req.params['scoreId']);
    try {
        const score = db
            .prepare(`SELECT id FROM scores WHERE id = ? AND match_id = ?`)
            .get(scoreId, matchId);
        if (!score) {
            res.status(404).json(fail('Score not found in this match'));
            return;
        }
        db.prepare(`DELETE FROM scores WHERE id = ?`).run(scoreId);
        res.json(ok({ id: scoreId }));
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
            const existingDraft = db
                .prepare(`SELECT id
           FROM scores
           WHERE match_id = ? AND shooter_id = ? AND stage_id = ? AND review_state = 'draft'
           ORDER BY updated_at DESC, id DESC
           LIMIT 1`)
                .get(matchId, shooter_id, stage_id);
            let scoreId;
            if (existingDraft) {
                scoreId = existingDraft.id;
                db.prepare(`UPDATE scores
           SET total_time = ?,
               a_hits = ?,
               c_hits = ?,
               d_hits = ?,
               m_hits = ?,
               n_hits = ?,
               pe = ?,
               first_shot = ?,
               fastest_split = ?,
               status = ?,
               review_state = 'draft',
               review_submitted_at = NULL,
               total_points = ?,
               hit_factor = ?,
               confirmed = 0,
               updated_at = datetime('now')
           WHERE id = ?`).run(normalizedTime, agg.a, agg.c, agg.d, agg.m, cappedNs + agg.npm, peCount, first_shot ?? null, fastest_split ?? null, status, totalPoints, hitFactor, scoreId);
            }
            else {
                const insertResult = db.prepare(`INSERT INTO scores
            (match_id, shooter_id, stage_id, total_time, a_hits, c_hits, d_hits, m_hits, n_hits, pe,
             first_shot, fastest_split, status, review_state, review_submitted_at, total_points, hit_factor, updated_at, submitted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', NULL, ?, ?, datetime('now'), datetime('now'))`).run(matchId, shooter_id, stage_id, normalizedTime, agg.a, agg.c, agg.d, agg.m, cappedNs + agg.npm, peCount, first_shot ?? null, fastest_split ?? null, status, totalPoints, hitFactor);
                scoreId = Number(insertResult.lastInsertRowid);
            }
            db.prepare(`DELETE FROM score_card_rows WHERE score_id = ?`).run(scoreId);
            db.prepare(`DELETE FROM score_penalties WHERE score_id = ?`).run(scoreId);
            const insertRow = db.prepare(`INSERT INTO score_card_rows
         (score_id, row_type, row_no, a_hits, c_hits, d_hits, m_hits, ns_hits, npm_hits)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            for (const row of normalizedRows) {
                insertRow.run(scoreId, row.row_type, row.row_no, row.a_hits, row.c_hits, row.d_hits, row.m_hits, row.ns_hits, row.npm_hits);
            }
            const insertPenalty = db.prepare(`INSERT INTO score_penalties (score_id, reason_code, reason_label, count, sort_order)
         VALUES (?, ?, ?, ?, ?)`);
            for (const reason of penalty_reasons.filter((item) => item.count > 0)) {
                insertPenalty.run(scoreId, reason.reason_code, reason.reason_label, reason.count, reason.sort_order);
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
