import { Router, Request, Response } from 'express';
import db from '../db.js';
import {
  CreateDrillTemplateWithTargetsSchema,
  ReplaceDrillTargetsSchema,
  UpdateDrillTemplateSchema,
  type CreateDrillTargetInput,
  type CreateDrillTemplateWithTargetsInput,
  type ReplaceDrillTargetsInput,
  ok,
  fail,
} from '../types.js';

type DrillTargetsInput = CreateDrillTemplateWithTargetsInput['targets'];
type ReplaceTargetsInput = ReplaceDrillTargetsInput['targets'];

const router = Router();

interface DrillTemplateRow {
  id: number;
  match_id: number;
  stage_id: number;
  name: string;
  timeout: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface DrillTemplateSummaryRow extends DrillTemplateRow {
  targets_count: number;
}

interface DrillTargetRow {
  id: number;
  template_id: number;
  seq_no: number;
  target_name: string;
  target_type: string;
  timeout: number;
  counted_shots: number;
  target_variant: string | null;
  has_physical_popper: number;
  sort_order: number;
}

interface DrillConfigLookupRow extends DrillTemplateRow {
  match_name: string;
  stage_name: string;
}

function positiveInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function firstQueryValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : undefined;
  }
  return undefined;
}

function normalizeQueryText(value: string): string {
  return value.trim().toLowerCase();
}

function normalizedSqlText(column: string): string {
  return `lower(trim(replace(replace(${column}, char(10), ''), char(13), '')))`;
}

function fetchMatchIdByName(matchName: string): number | null {
  const row = db
    .prepare(`SELECT id FROM matches WHERE ${normalizedSqlText('name')} = ? LIMIT 1`)
    .get(normalizeQueryText(matchName)) as { id: number } | undefined;
  return row?.id ?? null;
}

function fetchStageIdByName(matchId: number, stageName: string): number | null {
  const row = db
    .prepare(`SELECT id FROM stages WHERE match_id = ? AND ${normalizedSqlText('name')} = ? LIMIT 1`)
    .get(matchId, normalizeQueryText(stageName)) as { id: number } | undefined;
  return row?.id ?? null;
}

function fetchDrillIdByName(matchId: number, stageId: number, drillName: string): number | null {
  const row = db
    .prepare(`SELECT id FROM drill_templates WHERE match_id = ? AND stage_id = ? AND ${normalizedSqlText('name')} = ? LIMIT 1`)
    .get(matchId, stageId, normalizeQueryText(drillName)) as { id: number } | undefined;
  return row?.id ?? null;
}

function parseTargetType(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item));
    }
    if (typeof parsed === 'string') {
      return [parsed];
    }
  } catch {
    // fall through
  }
  return [];
}

function parseTargetVariant(raw: string | null): string[] | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item));
    }
  } catch {
    // fall through
  }
  return null;
}

function normalizeTargetTypes(input: CreateDrillTargetInput['target_type']): string[] {
  return Array.isArray(input) ? input : [input];
}

function normalizeTargetVariant(input: CreateDrillTargetInput['target_variant']): string[] | null {
  if (input === undefined || input === null) return null;
  return input;
}

function ensureTargetValidity(targets: CreateDrillTargetInput[]): string | null {
  const seenSeq = new Set<number>();

  for (const target of targets) {
    if (seenSeq.has(target.seq_no)) {
      return 'seq_no 不能重复';
    }
    seenSeq.add(target.seq_no);

    const types = normalizeTargetTypes(target.target_type);
    const variant = normalizeTargetVariant(target.target_variant);
    if (types.length === 1) {
      if (!variant || variant.length !== 1) {
        return '单类型 target_type 时 target_variant 必须提供 1 个停留时长';
      }
      continue;
    }

    if (!variant) {
      return '多类型 target_type 时必须提供 target_variant';
    }

    if (variant.length !== types.length && variant.length !== types.length - 1) {
      return 'target_variant 长度必须等于 target_type 数组长度，或兼容旧版的长度 - 1';
    }
  }

  return null;
}

function getMatchAndStage(matchId: number, stageId: number) {
  return db
    .prepare(`SELECT s.id FROM stages s WHERE s.id = ? AND s.match_id = ?`)
    .get(stageId, matchId) as { id: number } | undefined;
}

function getTemplateById(id: number) {
  return db
    .prepare(`SELECT * FROM drill_templates WHERE id = ?`)
    .get(id) as DrillTemplateRow | undefined;
}

function getDrillConfigByLookup(params: {
  matchId?: number;
  stageId?: number;
  drillId?: number;
  matchName?: string;
  stageName?: string;
  drillName?: string;
}) {
  const resolvedMatchId = params.matchId ?? (params.matchName ? fetchMatchIdByName(params.matchName) : null);
  if (!resolvedMatchId) return null;

  const resolvedStageId = params.stageId ?? (params.stageName ? fetchStageIdByName(resolvedMatchId, params.stageName) : null);
  if (!resolvedStageId) return null;

  const resolvedDrillId = params.drillId ?? (params.drillName ? fetchDrillIdByName(resolvedMatchId, resolvedStageId, params.drillName) : null);
  if (!resolvedDrillId) return null;

  const drill = getTemplateById(resolvedDrillId);
  if (!drill) return null;

  const stageRow = db
    .prepare(`SELECT id, name FROM stages WHERE id = ? AND match_id = ? LIMIT 1`)
    .get(resolvedStageId, resolvedMatchId) as { id: number; name: string } | undefined;
  const matchRow = db
    .prepare(`SELECT id, name FROM matches WHERE id = ? LIMIT 1`)
    .get(resolvedMatchId) as { id: number; name: string } | undefined;

  if (!stageRow || !matchRow) return null;

  return {
    match: {
      id: matchRow.id,
      name: matchRow.name,
    },
    stage: {
      id: stageRow.id,
      name: stageRow.name,
    },
    drill: serializeTemplateDetail(drill),
  };
}

function getTargetsByTemplateId(templateId: number) {
  return db
    .prepare(`SELECT * FROM drill_template_targets WHERE template_id = ? ORDER BY sort_order, seq_no, id`)
    .all(templateId) as DrillTargetRow[];
}

function serializeTargetDetail(row: DrillTargetRow) {
  return {
    id: row.id,
    template_id: row.template_id,
    seq_no: row.seq_no,
    target_name: row.target_name,
    target_type: parseTargetType(row.target_type),
    timeout: row.timeout,
    counted_shots: row.counted_shots,
    target_variant: parseTargetVariant(row.target_variant),
    has_physical_popper: row.has_physical_popper,
    sort_order: row.sort_order,
  };
}

function serializeTargetExport(row: DrillTargetRow) {
  const targetType = parseTargetType(row.target_type);
  return {
    id: `drill_target_${row.id}`,
    seqNo: row.seq_no,
    targetName: row.target_name,
    targetType: targetType.length === 1 ? targetType[0] : targetType,
    timeout: row.timeout,
    countedShots: row.counted_shots,
    targetVariant: parseTargetVariant(row.target_variant),
    hasPhysicalPopper: row.has_physical_popper === 1,
  };
}

function serializeTemplateSummary(row: DrillTemplateSummaryRow) {
  return {
    id: row.id,
    match_id: row.match_id,
    stage_id: row.stage_id,
    name: row.name,
    timeout: row.timeout,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
    targets_count: row.targets_count,
  };
}

function serializeTemplateDetail(row: DrillTemplateRow) {
  return {
    id: row.id,
    match_id: row.match_id,
    stage_id: row.stage_id,
    name: row.name,
    timeout: row.timeout,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
    targets: getTargetsByTemplateId(row.id).map(serializeTargetDetail),
  };
}

function loadTemplateWithTargets(templateId: number) {
  const template = getTemplateById(templateId);
  if (!template) return null;
  return serializeTemplateDetail(template);
}

function insertTargets(templateId: number, targets: DrillTargetsInput) {
  const stmt = db.prepare(`
    INSERT INTO drill_template_targets
      (template_id, seq_no, target_name, target_type, timeout, counted_shots, target_variant, has_physical_popper, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const target of targets) {
    const targetTypes = normalizeTargetTypes(target.target_type);
    const targetVariant = normalizeTargetVariant(target.target_variant);
    stmt.run(
      templateId,
      target.seq_no,
      target.target_name,
      JSON.stringify(targetTypes),
      target.timeout,
      target.counted_shots,
      targetVariant === null ? null : JSON.stringify(targetVariant),
      target.has_physical_popper ? 1 : 0,
      target.sort_order ?? target.seq_no
    );
  }
}

function updateTemplateTimestamp(templateId: number) {
  db.prepare(`UPDATE drill_templates SET updated_at = datetime('now') WHERE id = ?`).run(templateId);
}

// GET /matches/:matchId/stages/:stageId/drills
router.get('/matches/:matchId/stages/:stageId/drills', (req: Request, res: Response) => {
  const matchId = positiveInt(req.params['matchId']);
  const stageId = positiveInt(req.params['stageId']);
  if (!matchId || !stageId) {
    res.status(400).json(fail('Invalid match or stage id'));
    return;
  }

  try {
    const stage = getMatchAndStage(matchId, stageId);
    if (!stage) {
      res.status(404).json(fail('Stage not found'));
      return;
    }

    const rows = db
      .prepare(
        `SELECT
          dt.*,
          (SELECT COUNT(*) FROM drill_template_targets dtt WHERE dtt.template_id = dt.id) AS targets_count
         FROM drill_templates dt
         WHERE dt.match_id = ? AND dt.stage_id = ?
         ORDER BY dt.sort_order, dt.id`
      )
      .all(matchId, stageId) as DrillTemplateSummaryRow[];

    res.json(ok(rows.map(serializeTemplateSummary)));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// POST /matches/:matchId/stages/:stageId/drills
router.post('/matches/:matchId/stages/:stageId/drills', (req: Request, res: Response) => {
  const matchId = positiveInt(req.params['matchId']);
  const stageId = positiveInt(req.params['stageId']);
  if (!matchId || !stageId) {
    res.status(400).json(fail('Invalid match or stage id'));
    return;
  }

  const parsed = CreateDrillTemplateWithTargetsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(fail(parsed.error.message));
    return;
  }

  const stage = getMatchAndStage(matchId, stageId);
  if (!stage) {
    res.status(404).json(fail('Stage not found'));
    return;
  }

  const validationError = ensureTargetValidity(parsed.data.targets);
  if (validationError) {
    res.status(400).json(fail(validationError));
    return;
  }

  try {
    const tx = db.transaction((payload: CreateDrillTemplateWithTargetsInput) => {
      const templateInfo = db
        .prepare(
          `INSERT INTO drill_templates (match_id, stage_id, name, timeout, sort_order)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(matchId, stageId, payload.name, payload.timeout ?? 1200, payload.sort_order ?? 0);

      const templateId = Number(templateInfo.lastInsertRowid);
      insertTargets(templateId, payload.targets);

      return templateId;
    });

    const templateId = tx(parsed.data);
    const created = loadTemplateWithTargets(templateId);
    if (!created) {
      res.status(500).json(fail('Failed to load created drill template'));
      return;
    }

    res.status(201).json(ok(created));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// GET /drills/:id
router.get('/drills/:id', (req: Request, res: Response) => {
  const id = positiveInt(req.params['id']);
  if (!id) {
    res.status(400).json(fail('Invalid drill id'));
    return;
  }

  try {
    const detail = loadTemplateWithTargets(id);
    if (!detail) {
      res.status(404).json(fail('Drill template not found'));
      return;
    }
    res.json(ok(detail));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// PUT /drills/:id
router.put('/drills/:id', (req: Request, res: Response) => {
  const id = positiveInt(req.params['id']);
  if (!id) {
    res.status(400).json(fail('Invalid drill id'));
    return;
  }

  const parsed = UpdateDrillTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(fail(parsed.error.message));
    return;
  }

  try {
    const template = getTemplateById(id);
    if (!template) {
      res.status(404).json(fail('Drill template not found'));
      return;
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    if (parsed.data.name !== undefined) { fields.push('name = ?'); values.push(parsed.data.name); }
    if (parsed.data.timeout !== undefined) { fields.push('timeout = ?'); values.push(parsed.data.timeout); }
    if (parsed.data.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(parsed.data.sort_order); }
    if (fields.length === 0) {
      res.json(ok(serializeTemplateDetail(template)));
      return;
    }

    fields.push('updated_at = datetime(\'now\')');
    values.push(id);
    db.prepare(`UPDATE drill_templates SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    const updated = loadTemplateWithTargets(id);
    if (!updated) {
      res.status(500).json(fail('Failed to load updated drill template'));
      return;
    }
    res.json(ok(updated));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// DELETE /drills/:id
router.delete('/drills/:id', (req: Request, res: Response) => {
  const id = positiveInt(req.params['id']);
  if (!id) {
    res.status(400).json(fail('Invalid drill id'));
    return;
  }

  try {
    const template = getTemplateById(id);
    if (!template) {
      res.status(404).json(fail('Drill template not found'));
      return;
    }

    db.prepare(`DELETE FROM drill_templates WHERE id = ?`).run(id);
    res.json(ok({ deleted: true }));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// PUT /drills/:id/targets
router.put('/drills/:id/targets', (req: Request, res: Response) => {
  const id = positiveInt(req.params['id']);
  if (!id) {
    res.status(400).json(fail('Invalid drill id'));
    return;
  }

  const parsed = ReplaceDrillTargetsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(fail(parsed.error.message));
    return;
  }

  const validationError = ensureTargetValidity(parsed.data.targets);
  if (validationError) {
    res.status(400).json(fail(validationError));
    return;
  }

  try {
    const template = getTemplateById(id);
    if (!template) {
      res.status(404).json(fail('Drill template not found'));
      return;
    }

    const tx = db.transaction((targets: ReplaceTargetsInput) => {
      db.prepare(`DELETE FROM drill_template_targets WHERE template_id = ?`).run(id);
      insertTargets(id, targets);
      updateTemplateTimestamp(id);
    });

    tx(parsed.data.targets);

    const updated = loadTemplateWithTargets(id);
    if (!updated) {
      res.status(500).json(fail('Failed to load updated drill template'));
      return;
    }
    res.json(ok(updated));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// GET /drills/:id/export
router.get('/drills/:id/export', (req: Request, res: Response) => {
  const id = positiveInt(req.params['id']);
  if (!id) {
    res.status(400).json(fail('Invalid drill id'));
    return;
  }

  try {
    const template = getTemplateById(id);
    if (!template) {
      res.status(404).json(fail('Drill template not found'));
      return;
    }

    const targets = getTargetsByTemplateId(id).map(serializeTargetExport);
    res.json(ok({
      drillId: template.id,
      name: template.name,
      timeout: template.timeout,
      targets,
    }));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

// GET /drill-configs?matchName=...&stageName=...&drillName=...
// Also supports matchId/stageId/drillId for exact lookups.
router.get('/drill-configs', (req: Request, res: Response) => {
  const matchId = positiveInt(req.query['matchId']);
  const stageId = positiveInt(req.query['stageId']);
  const drillId = positiveInt(req.query['drillId']);

  const matchName = firstQueryValue(req.query['matchName']);
  const stageName = firstQueryValue(req.query['stageName']);
  const drillName = firstQueryValue(req.query['drillName']);

  if (!matchId && !stageId && !drillId && !matchName && !stageName && !drillName) {
    res.status(400).json(fail('Please provide match/stage/drill identifiers or names'));
    return;
  }

  try {
    const config = getDrillConfigByLookup({
      matchId: matchId ?? undefined,
      stageId: stageId ?? undefined,
      drillId: drillId ?? undefined,
      matchName,
      stageName,
      drillName,
    });
    if (!config) {
      res.status(404).json(fail('Drill configuration not found'));
      return;
    }

    res.json(ok(config));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

export default router;