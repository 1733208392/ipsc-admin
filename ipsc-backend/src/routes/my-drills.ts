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

interface PersonalDrillTemplateRow {
  id: number;
  match_id: number | null;
  stage_id: number | null;
  owner_user_id: number;
  name: string;
  timeout: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface PersonalDrillTemplateSummaryRow extends PersonalDrillTemplateRow {
  targets_count: number;
  replay_count: number;
  last_replay_at: string | null;
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

function getTemplateByOwner(ownerUserId: number, id: number) {
  return db
    .prepare(`SELECT * FROM drill_templates WHERE id = ? AND owner_user_id = ?`)
    .get(id, ownerUserId) as PersonalDrillTemplateRow | undefined;
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

function serializeTemplateSummary(row: PersonalDrillTemplateSummaryRow) {
  return {
    id: row.id,
    match_id: row.match_id,
    stage_id: row.stage_id,
    owner_user_id: row.owner_user_id,
    name: row.name,
    timeout: row.timeout,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
    targets_count: row.targets_count,
    replay_count: row.replay_count,
    last_replay_at: row.last_replay_at,
  };
}

function serializeTemplateDetail(row: PersonalDrillTemplateRow) {
  return {
    id: row.id,
    match_id: row.match_id,
    stage_id: row.stage_id,
    owner_user_id: row.owner_user_id,
    name: row.name,
    timeout: row.timeout,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
    targets: getTargetsByTemplateId(row.id).map(serializeTargetDetail),
  };
}

function loadTemplateWithTargets(ownerUserId: number, templateId: number) {
  const template = getTemplateByOwner(ownerUserId, templateId);
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

router.get('/drills', (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json(fail('未登录'));
    return;
  }

  try {
    const rows = db
      .prepare(
        `SELECT
          dt.*,
          (SELECT COUNT(*) FROM drill_template_targets dtt WHERE dtt.template_id = dt.id) AS targets_count,
          (SELECT COUNT(*) FROM drill_replays dr WHERE dr.drill_template_id = dt.id AND dr.owner_user_id = dt.owner_user_id) AS replay_count,
          (SELECT MAX(created_at) FROM drill_replays dr WHERE dr.drill_template_id = dt.id AND dr.owner_user_id = dt.owner_user_id) AS last_replay_at
         FROM drill_templates dt
         WHERE dt.owner_user_id = ?
         ORDER BY dt.sort_order, dt.id DESC`
      )
      .all(req.user.id) as PersonalDrillTemplateSummaryRow[];

    res.json(ok(rows.map(serializeTemplateSummary)));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

router.post('/drills', (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json(fail('未登录'));
    return;
  }

  const parsed = CreateDrillTemplateWithTargetsSchema.safeParse(req.body);
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
    const tx = db.transaction((payload: CreateDrillTemplateWithTargetsInput) => {
      const templateInfo = db
        .prepare(
          `INSERT INTO drill_templates (match_id, stage_id, owner_user_id, name, timeout, sort_order)
           VALUES (NULL, NULL, ?, ?, ?, ?)`
        )
        .run(req.user!.id, payload.name, payload.timeout ?? 1200, payload.sort_order ?? 0);

      const templateId = Number(templateInfo.lastInsertRowid);
      insertTargets(templateId, payload.targets);
      return templateId;
    });

    const templateId = tx(parsed.data);
    const created = loadTemplateWithTargets(req.user.id, templateId);
    if (!created) {
      res.status(500).json(fail('Failed to load created drill template'));
      return;
    }

    res.status(201).json(ok(created));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

router.get('/drills/:id', (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json(fail('未登录'));
    return;
  }

  const id = positiveInt(req.params['id']);
  if (!id) {
    res.status(400).json(fail('Invalid drill id'));
    return;
  }

  try {
    const detail = loadTemplateWithTargets(req.user.id, id);
    if (!detail) {
      res.status(404).json(fail('Drill template not found'));
      return;
    }
    res.json(ok(detail));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

router.put('/drills/:id', (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json(fail('未登录'));
    return;
  }

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
    const template = getTemplateByOwner(req.user.id, id);
    if (!template) {
      res.status(404).json(fail('Drill template not found'));
      return;
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    if (parsed.data.name !== undefined) {
      fields.push('name = ?');
      values.push(parsed.data.name);
    }
    if (parsed.data.timeout !== undefined) {
      fields.push('timeout = ?');
      values.push(parsed.data.timeout);
    }
    if (parsed.data.sort_order !== undefined) {
      fields.push('sort_order = ?');
      values.push(parsed.data.sort_order);
    }
    if (fields.length === 0) {
      res.json(ok(serializeTemplateDetail(template)));
      return;
    }

    fields.push('updated_at = datetime(\'now\')');
    values.push(id, req.user.id);
    db.prepare(`UPDATE drill_templates SET ${fields.join(', ')} WHERE id = ? AND owner_user_id = ?`).run(...values);

    const updated = loadTemplateWithTargets(req.user.id, id);
    if (!updated) {
      res.status(500).json(fail('Failed to load updated drill template'));
      return;
    }
    res.json(ok(updated));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

router.delete('/drills/:id', (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json(fail('未登录'));
    return;
  }

  const id = positiveInt(req.params['id']);
  if (!id) {
    res.status(400).json(fail('Invalid drill id'));
    return;
  }

  try {
    const template = getTemplateByOwner(req.user.id, id);
    if (!template) {
      res.status(404).json(fail('Drill template not found'));
      return;
    }

    db.prepare(`DELETE FROM drill_templates WHERE id = ? AND owner_user_id = ?`).run(id, req.user.id);
    res.json(ok({ deleted: true }));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

router.put('/drills/:id/targets', (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json(fail('未登录'));
    return;
  }

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
    const template = getTemplateByOwner(req.user.id, id);
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

    const updated = loadTemplateWithTargets(req.user.id, id);
    if (!updated) {
      res.status(500).json(fail('Failed to load updated drill template'));
      return;
    }
    res.json(ok(updated));
  } catch (err) {
    res.status(500).json(fail(String(err)));
  }
});

router.get('/drills/:id/export', (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json(fail('未登录'));
    return;
  }

  const id = positiveInt(req.params['id']);
  if (!id) {
    res.status(400).json(fail('Invalid drill id'));
    return;
  }

  try {
    const template = getTemplateByOwner(req.user.id, id);
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

export default router;