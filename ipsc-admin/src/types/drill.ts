export const DRILL_TARGET_TYPES = [
  'ipsc',
  'ipsc_mini_double',
  'hostage',
  'paddle',
  'popper',
  'special_1',
  'special_2',
  'idpa',
  'idpa_ns',
  'idpa_black_1',
  'idpa_black_2',
  'cqb_swing',
  'cqb_front',
  'cqb_move',
  'disguised_enemy',
  'cqb_hostage',
] as const

export type DrillTargetType = typeof DRILL_TARGET_TYPES[number]

export const DRILL_TARGET_TYPE_GROUPS = [
  {
    label: 'IPSC',
    types: ['ipsc', 'ipsc_mini_double', 'hostage', 'paddle', 'popper', 'special_1', 'special_2'] as const,
  },
  {
    label: 'IDPA',
    types: ['idpa', 'idpa_ns', 'idpa_black_1', 'idpa_black_2'] as const,
  },
  {
    label: 'CQB',
    types: ['cqb_swing', 'cqb_front', 'cqb_move', 'disguised_enemy', 'cqb_hostage'] as const,
  },
] as const

export interface DrillTemplateSummary {
  id: number
  match_id: number
  stage_id: number
  name: string
  timeout: number
  sort_order: number
  created_at: string
  updated_at: string
  targets_count: number
}

export interface DrillTemplateTarget {
  id: number
  template_id: number
  seq_no: number
  target_name: string
  target_type: DrillTargetType[]
  timeout: number
  counted_shots: number
  target_variant: string[] | null
  has_physical_popper: number
  sort_order: number
}

export interface DrillTemplateDetail {
  id: number
  match_id: number
  stage_id: number
  name: string
  timeout: number
  sort_order: number
  created_at: string
  updated_at: string
  targets: DrillTemplateTarget[]
}

export interface DrillTemplateExportTarget {
  id: string
  seqNo: number
  targetName: string
  targetType: DrillTargetType | DrillTargetType[]
  timeout: number
  countedShots: number
  targetVariant: string[] | null
  hasPhysicalPopper: boolean
}

export interface DrillTemplateExport {
  drillId: number
  name: string
  timeout: number
  targets: DrillTemplateExportTarget[]
}

export interface DrillTargetDraft {
  seq_no: number
  target_name: string
  target_type: DrillTargetType[]
  timeout: number
  counted_shots: number
  target_variant: string[] | null
  has_physical_popper: boolean
  sort_order: number
}

export function createEmptyDrillTarget(seqNo: number): DrillTargetDraft {
  return {
    seq_no: seqNo,
    target_name: '',
    target_type: [],
    timeout: 0,
    counted_shots: 0,
    target_variant: null,
    has_physical_popper: false,
    sort_order: seqNo - 1,
  }
}