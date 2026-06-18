import { z } from 'zod';
// ── Matches ──────────────────────────────────────────────────────────────────
export const CreateMatchSchema = z.object({
    name: z.string().min(1),
    date: z.string().min(1),
    status: z.enum(['draft', 'active', 'completed']).optional().default('draft'),
    club_id: z.number().int().positive().optional(),
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
    power_factor: z.enum(['major', 'minor']).optional().default('major'),
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
export const VALID_SHOOTER_CATEGORY_CODES = ['J', 'S', 'SJ', 'L', 'GJ'];
export const VALID_MEMBERSHIP_TYPES = ['member', 'coach', 'trial', 'vip', 'staff'];
export const CreateShooterSchema = z.object({
    division_id: z.number().int().positive(),
    squad_id: z.number().int().positive().optional(),
    shooter_uid: z.string().min(0).optional(),
    name: z.string().min(1).optional(),
    bib_number: z.string().min(1).optional(),
    category_code: z.enum(VALID_SHOOTER_CATEGORY_CODES).optional(),
    age: z.number().int().min(0).max(120).optional(),
    gender: z.enum(['male', 'female']).optional(),
    region: z.string().max(50).optional(),
    club: z.string().max(100).optional(),
    class: z.string().max(10).optional(),
    factor: z.enum(['Minor', 'Major']).optional(),
    failed_factor: z.boolean().optional(),
    disqualified_at: z.string().datetime().optional(),
    absent_at: z.string().datetime().optional(),
    membership_type: z.enum(VALID_MEMBERSHIP_TYPES).optional(),
});
export const UpdateShooterSchema = z.object({
    division_id: z.number().int().positive().optional(),
    squad_id: z.number().int().positive().optional(),
    shooter_uid: z.string().min(0).optional(),
    name: z.string().min(1).optional(),
    bib_number: z.string().min(1).optional(),
    category_code: z.enum(VALID_SHOOTER_CATEGORY_CODES).optional(),
    age: z.number().int().min(0).max(120).optional(),
    gender: z.enum(['male', 'female']).optional(),
    region: z.string().max(50).optional(),
    club: z.string().max(100).optional(),
    class: z.string().max(10).optional(),
    factor: z.enum(['Minor', 'Major']).optional(),
    failed_factor: z.boolean().optional(),
    disqualified_at: z.string().datetime().optional(),
    absent_at: z.string().datetime().optional(),
    membership_type: z.enum(VALID_MEMBERSHIP_TYPES).optional(),
});
// ── Auth / Accounts ──────────────────────────────────────────────────────────
export const CreateClubSchema = z.object({
    name: z.string().min(1),
    short_name: z.string().min(1),
    contact_name: z.string().optional(),
    contact_phone: z.string().optional(),
    status: z.enum(['active', 'inactive']).optional().default('active'),
});
export const UpdateClubSchema = z.object({
    name: z.string().min(1).optional(),
    short_name: z.string().min(1).optional(),
    contact_name: z.string().nullable().optional(),
    contact_phone: z.string().nullable().optional(),
    status: z.enum(['active', 'inactive']).optional(),
});
export const CreateUserSchema = z.object({
    username: z.string().min(3),
    password: z.string().min(6),
    role: z.enum(['super_admin', 'club_admin', 'shooter']),
    club_id: z.number().int().positive().optional(),
    name: z.string().min(1),
    phone: z.string().optional(),
    status: z.enum(['active', 'inactive']).optional().default('active'),
});
export const UpdateUserSchema = z.object({
    password: z.string().min(6).optional(),
    role: z.enum(['super_admin', 'club_admin', 'shooter']).optional(),
    club_id: z.number().int().positive().nullable().optional(),
    name: z.string().min(1).optional(),
    phone: z.string().nullable().optional(),
    status: z.enum(['active', 'inactive']).optional(),
});
export const CreateGlobalShooterSchema = z.object({
    name: z.string().min(1),
    gender: z.enum(['male', 'female']),
    age: z.number().int().min(0).max(120).optional(),
    region: z.string().max(100).optional(),
    default_club_id: z.number().int().positive().optional(),
    id_card: z.string().max(50).optional(),
    phone: z.string().max(30).optional(),
});
export const UpdateGlobalShooterSchema = z.object({
    name: z.string().min(1).optional(),
    gender: z.enum(['male', 'female']).optional(),
    age: z.number().int().min(0).max(120).optional(),
    region: z.string().max(100).optional(),
    default_club_id: z.number().int().positive().nullable().optional(),
    id_card: z.string().max(50).nullable().optional(),
    phone: z.string().max(30).nullable().optional(),
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
// Per-target row as emitted by the mobile (iOS) score card. The mobile app is
// the source of truth for the row grid — the backend no longer redistributes
// or pads rows to match stage configuration.
export const FlexTargetPerTargetRowSchema = z.object({
    row_type: z.enum(['paper', 'steel']),
    row_no: z.number().int().positive(),
    A: z.number().int().min(0),
    C: z.number().int().min(0),
    D: z.number().int().min(0),
    M: z.number().int().min(0),
    N: z.number().int().min(0),
});
// A single procedural-penalty reason added by the RO on the mobile app.
export const FlexTargetPenaltyReasonSchema = z.object({
    reason_code: z.string().min(1),
    reason_label: z.string().min(1).optional(),
    count: z.number().int().min(1),
    sort_order: z.number().int().min(0).optional(),
});
// Penalties block: the mobile app reports only RO-added (additional) PE.
// Auto PE for unengaged paper targets is derived by the backend from `rows`.
// `PE` is kept for backward compatibility with the original payload and is
// interpreted as `additional_pe` when `additional_pe` is not provided.
export const FlexTargetPenaltiesSchema = z.object({
    additional_pe: z.number().int().min(0).optional(),
    reasons: z.array(FlexTargetPenaltyReasonSchema).optional(),
    PE: z.number().int().min(0).optional(),
});
export const FlexTargetSchema = z.object({
    shooter_bib: z.string().min(1),
    stage_id: z.union([z.string().min(1), z.number()]),
    // total_time may be 0 when status is DQ/DNF; calculate-time validations
    // happen in the route handler based on `status`.
    total_time: z.number().min(0),
    status: z.enum(['normal', 'dnf', 'dq']).optional().default('normal'),
    // The row grid IS the score card. Required.
    rows: z.array(FlexTargetPerTargetRowSchema).min(1),
    penalties: FlexTargetPenaltiesSchema.optional().default({}),
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
// ── Drill Replays ─────────────────────────────────────────────────────────────
// Raw drill-replay payload uploaded by the iOS app. The full original shot
// stream is preserved as-is in `payload` so the admin viewer can "rewind"
// the run (hit area, hit position, target type/name, timing of shots).
export const DrillReplayUploadSchema = z.object({
    shooter_id: z.number().int().positive(),
    stage_id: z.number().int().positive(),
    drill_name: z.string().optional(),
    total_time: z.number().min(0).optional().default(0),
    num_shots: z.number().int().min(0).optional().default(0),
    score: z.number().int().optional(),
    client_drill_result_id: z.string().min(1).optional(),
    device_id: z.string().optional(),
    // Free-form raw payload; viewer will look up payload.shotData (iOS) or
    // payload.shots. Keep flexible so iOS can evolve the shape without
    // requiring backend changes.
    payload: z.record(z.string(), z.unknown()),
});
// ── Unified response helpers ───────────────────────────────────────────────────
export function ok(data) {
    return { success: true, data };
}
export function fail(error) {
    return { success: false, error };
}
