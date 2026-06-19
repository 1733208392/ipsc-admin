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
  replay_count?: number
  last_replay_at?: string | null
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
  payload: unknown
}

export interface TrainingStats {
  total_replays: number
  total_shots: number
  avg_time: number
  best_time: number
  avg_score: number
  by_drill: Array<{
    drill_template_id: number | null
    drill_name: string
    replay_count: number
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