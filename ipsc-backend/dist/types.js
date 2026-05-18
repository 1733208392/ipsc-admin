import { z } from 'zod';
// ── Matches ──────────────────────────────────────────────────────────────────
export const CreateMatchSchema = z.object({
    name: z.string().min(1),
    date: z.string().min(1),
    status: z.enum(['draft', 'active', 'completed']).optional().default('draft'),
});
export const UpdateMatchSchema = z.object({
    name: z.string().min(1).optional(),
    date: z.string().min(1).optional(),
});
export const MatchStatusSchema = z.object({
    status: z.enum(['draft', 'active', 'completed']),
});
// ── Divisions ─────────────────────────────────────────────────────────────────
export const VALID_DIVISION_CODES = ['production', 'optics', 'open', 'standard', 'classic'];
export const CreateDivisionSchema = z.object({
    code: z.enum(VALID_DIVISION_CODES),
    name: z.string().min(1),
    sort_order: z.number().int().optional().default(0),
});
export const UpdateDivisionSchema = z.object({
    name: z.string().min(1).optional(),
    sort_order: z.number().int().optional(),
});
// ── Sub Divisions (Categories) ────────────────────────────────────────────────
export const CreateSubDivisionSchema = z.object({
    name: z.string().min(1),
    min_age: z.number().int().min(0).optional(),
    max_age: z.number().int().min(0).optional(),
    gender: z.enum(['male', 'female']).optional(),
    sort_order: z.number().int().optional().default(0),
});
export const UpdateSubDivisionSchema = z.object({
    name: z.string().min(1).optional(),
    min_age: z.number().int().min(0).optional(),
    max_age: z.number().int().min(0).optional(),
    gender: z.enum(['male', 'female']).optional(),
    sort_order: z.number().int().optional(),
});
// ── Stages ────────────────────────────────────────────────────────────────────
export const CreateStageSchema = z.object({
    name: z.string().min(1),
    min_rounds: z.number().int().min(0).optional().default(0),
    stage_points: z.number().int().min(0).optional().default(0),
    targets_count: z.number().int().min(0).optional().default(0),
    poppers_plates_count: z.number().int().min(0).optional().default(0),
    briefing_text: z.string().optional().default(''),
    sort_order: z.number().int().optional().default(0),
});
export const UpdateStageSchema = z.object({
    name: z.string().min(1).optional(),
    min_rounds: z.number().int().min(0).optional(),
    stage_points: z.number().int().min(0).optional(),
    targets_count: z.number().int().min(0).optional(),
    poppers_plates_count: z.number().int().min(0).optional(),
    briefing_text: z.string().optional(),
    sort_order: z.number().int().optional(),
});
// ── Squads ────────────────────────────────────────────────────────────────────
export const CreateSquadSchema = z.object({
    name: z.string().min(1),
    sort_order: z.number().int().optional().default(0),
});
export const UpdateSquadSchema = z.object({
    name: z.string().min(1).optional(),
    sort_order: z.number().int().optional(),
});
// ── Shooters ──────────────────────────────────────────────────────────────────
export const CreateShooterSchema = z.object({
    division_id: z.number().int().positive(),
    squad_id: z.number().int().positive().optional(),
    name: z.string().min(1),
    bib_number: z.string().min(1),
    age: z.number().int().min(0).max(120).optional(),
    gender: z.enum(['male', 'female']).optional(),
    region: z.string().max(50).optional(),
    club: z.string().max(100).optional(),
});
export const UpdateShooterSchema = z.object({
    division_id: z.number().int().positive().optional(),
    squad_id: z.number().int().positive().optional(),
    name: z.string().min(1).optional(),
    bib_number: z.string().min(1).optional(),
    age: z.number().int().min(0).max(120).optional(),
    gender: z.enum(['male', 'female']).optional(),
    region: z.string().max(50).optional(),
    club: z.string().max(100).optional(),
});
export const ChangeSquadSchema = z.object({
    squad_id: z.number().int().positive(),
});
export const AutoAssignSquadsSchema = z.object({
    sort_by: z.enum(['registration', 'bib', 'division', 'random', 'region', 'club']).optional().default('registration'),
    group_size: z.number().int().min(1).max(100).optional().default(10),
    strategy: z.enum(['sequential', 'snake', 'division_balanced']).optional().default('sequential'),
    clear_existing: z.boolean().optional().default(false),
});
export const BatchMoveShootersSchema = z.object({
    shooter_ids: z.array(z.number().int().positive()).min(1),
    target_squad_id: z.number().int().positive(),
});
export const AddShooterToSquadSchema = z.object({
    shooter_id: z.number().int().positive(),
});
// ── Scores / FlexTarget ───────────────────────────────────────────────────────
export const FlexTargetSchema = z.object({
    shooter_bib: z.string().min(1),
    stage_id: z.union([z.string().min(1), z.number()]),
    total_time: z.number().positive(),
    hits: z.object({
        A: z.number().int().min(0),
        C: z.number().int().min(0),
        D: z.number().int().min(0),
        M: z.number().int().min(0),
        N: z.number().int().min(0),
    }),
    penalties: z.object({
        PE: z.number().int().min(0),
    }),
    first_shot: z.number().optional(),
    fastest_split: z.number().optional(),
});
export const ScoreStatusSchema = z.enum(['normal', 'dnf', 'dq']);
export const ScoreReviewStateSchema = z.enum(['draft', 'submitted']);
export const ScoreCardRowSchema = z.object({
    row_type: z.enum(['paper', 'steel']),
    row_no: z.number().int().positive(),
    a_hits: z.number().int().min(0).default(0),
    c_hits: z.number().int().min(0).default(0),
    d_hits: z.number().int().min(0).default(0),
    m_hits: z.number().int().min(0).default(0),
    ns_hits: z.number().int().min(0).default(0),
    npm_hits: z.number().int().min(0).default(0),
});
export const ScorePenaltyReasonSchema = z.object({
    reason_code: z.string().min(1),
    reason_label: z.string().min(1),
    count: z.number().int().min(0),
    sort_order: z.number().int().min(0).optional().default(0),
});
export const UpsertScoreCardSchema = z.object({
    shooter_id: z.number().int().positive(),
    stage_id: z.number().int().positive(),
    status: ScoreStatusSchema.optional().default('normal'),
    total_time: z.number().min(0).optional(),
    first_shot: z.number().min(0).optional(),
    fastest_split: z.number().min(0).optional(),
    rows: z.array(ScoreCardRowSchema).optional().default([]),
    penalty_reasons: z.array(ScorePenaltyReasonSchema).optional().default([]),
});
export const SubmitScoreCardSchema = z.object({
    shooter_id: z.number().int().positive(),
    stage_id: z.number().int().positive(),
});
// ── Unified response helpers ───────────────────────────────────────────────────
export function ok(data) {
    return { success: true, data };
}
export function fail(error) {
    return { success: false, error };
}
