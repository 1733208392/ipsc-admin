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
// ── Stages ────────────────────────────────────────────────────────────────────
export const CreateStageSchema = z.object({
    name: z.string().min(1),
    min_rounds: z.number().int().min(0).optional().default(0),
    max_points: z.number().int().min(0).optional().default(0),
    sort_order: z.number().int().optional().default(0),
});
export const UpdateStageSchema = z.object({
    name: z.string().min(1).optional(),
    min_rounds: z.number().int().min(0).optional(),
    max_points: z.number().int().min(0).optional(),
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
// ── Unified response helpers ───────────────────────────────────────────────────
export function ok(data) {
    return { success: true, data };
}
export function fail(error) {
    return { success: false, error };
}
