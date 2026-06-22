export interface PersonalDrillTemplate {
  id: number
  match_id: null
  stage_id: null
  owner_user_id: number
  name: string
  timeout: number
  sort_order: number
  created_at: string
  updated_at: string
  targets_count?: number
  record_count?: number
  last_record_at?: string | null
}

export interface PersonalDrillTarget {
  id: number
  template_id: number
  seq_no: number
  target_name: string
  target_type: string[]
  timeout: number
  counted_shots: number
  target_variant: string[] | null
  has_physical_popper: number
  sort_order: number
}

export interface PersonalDrillTemplateDetail extends PersonalDrillTemplate {
  targets: PersonalDrillTarget[]
}

export interface PersonalReplaySummary {
  id: number
  drill_template_id: number | null
  drill_name: string | null
  total_time: number
  num_shots: number
  score: number | null
  created_at: string
}

export interface PersonalReplayDetail extends PersonalReplaySummary {
  owner_user_id: number | null
  match_id: number | null
  shooter_id: number | null
  stage_id: number | null
  client_drill_result_id: string | null
  device_id: string | null
  uploaded_by: number | null
  payload: DrillPayload | unknown
}

/** 训练记录 payload 中的逐发数据 */
export interface ShotRecord {
  type: string
  device: string
  target?: string
  action?: string
  content: {
    command: string
    hit_area: string // AZone | AZone1 | CZone | DZone | APopper | miss
    hit_position: { x: number; y: number }
    target_type: string // ipsc | ipsc_mini_double | special_1
    time_diff: number
  }
}

/** 训练记录 payload 顶层结构 */
export interface DrillPayload {
  score: number
  factor: number
  totalTime: number
  numShots: number
  firstShot: number
  fastest: number
  drillName: string
  athleteName: string
  athleteClub: string
  hitZones: {
    A: number
    C: number
    D: number
    M: number
    N: number
    PE: number
  }
  shotData: ShotRecord[]
}

export interface TrainingStats {
  total_records: number
  total_shots: number
  avg_time: number
  best_time: number
  avg_score: number
  by_drill: Array<{
    drill_template_id: number | null
    drill_name: string
    record_count: number
    avg_time: number
    best_time: number
    avg_score: number
  }>
  by_day: Array<{
    date: string
    count: number
    avg_time: number
  }>
}