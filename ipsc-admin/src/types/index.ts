export interface Match {
  id: number
  club_id: number
  name: string
  date: string
  status: 'draft' | 'active' | 'completed'
  created_at: string
  divisions_count?: number
  stages_count?: number
  squads_count?: number
  club_name?: string
  club_short_name?: string
}

export interface Club {
  id: number
  name: string
  short_name: string
  contact_name: string | null
  contact_phone: string | null
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export type UserRole = 'super_admin' | 'club_admin' | 'shooter'

export interface UserAccount {
  id: number
  username: string
  role: UserRole
  club_id: number | null
  name: string
  phone: string | null
  status: 'active' | 'inactive'
  last_login_at?: string | null
  club_name?: string | null
  club_short_name?: string | null
}

export interface LoginResult {
  token: string
  user: UserAccount
}

export interface GlobalShooter {
  uid: string
  name: string
  gender: 'male' | 'female'
  age: number | null
  region: string | null
  default_club_id: number | null
  id_card: string | null
  phone: string | null
  default_club_name?: string | null
  default_club_short_name?: string | null
}

export interface Division {
  id: number
  match_id: number
  code: 'production' | 'optics' | 'open' | 'standard' | 'classic'
  name: string
  power_factor: 'minor' | 'major'
  sort_order: number
}

export interface SubDivision {
  id: number
  match_id: number
  name: string
  min_age: number | null
  max_age: number | null
  gender: 'male' | 'female' | null
  sort_order: number
  created_at?: string
}

export interface Stage {
  id: number
  match_id: number
  name: string
  min_rounds: number
  stage_points: number
  targets_count: number
  poppers_plates_count: number
  briefing_text: string
  max_points?: number
  sort_order: number
}

export interface StageAttachment {
  id: number
  stage_id: number
  match_id: number
  filename: string
  original_name: string
  mime_type: string
  size_bytes: number
  storage_path: string
  created_at: string
  url: string
}

export interface Squad {
  id: number
  match_id: number
  name: string
  sort_order: number
  shooter_count?: number
}

export interface Shooter {
  id: number
  match_id: number
  division_id: number
  squad_id: number | null
  shooter_uid?: string | null
  name: string
  bib_number: string
  category_code?: 'J' | 'S' | 'SJ' | 'L' | null
  age: number | null
  gender: 'male' | 'female' | null
  region: string | null
  club: string | null
  division_name?: string
  squad_name?: string
  stages_shot?: number
}

export interface Score {
  id: number
  match_id: number
  shooter_id: number
  stage_id: number
  total_time: number
  a_hits: number
  c_hits: number
  d_hits: number
  m_hits: number
  n_hits: number
  pe: number
  first_shot: number | null
  fastest_split: number | null
  total_points: number
  hit_factor: number
  status: 'normal' | 'dnf' | 'dq'
  review_state: 'draft' | 'submitted'
  review_submitted_at: string | null
  confirmed: number
  created_at: string
  submitted_at: string
  shooter_name?: string
  bib_number?: string
  stage_name?: string
  division_name?: string
}

export interface ScoreCardRow {
  row_type: 'paper' | 'steel'
  row_no: number
  a_hits: number
  c_hits: number
  d_hits: number
  m_hits: number
  ns_hits: number
  npm_hits: number
}

export interface ScorePenaltyReason {
  reason_code: string
  reason_label: string
  count: number
  sort_order: number
}

export interface ScoreCardDetail {
  shooter: {
    id: number
    match_id: number
    division_id: number
    name: string
    bib_number: string
  }
  stage: {
    id: number
    match_id: number
    name: string
    targets_count: number
    poppers_plates_count: number
  }
  scores: Score[]
  score: Score | null
  rows: ScoreCardRow[]
  penalty_reasons: ScorePenaltyReason[]
}

export interface LeaderboardEntry {
  rank?: number
  rank_in_stage?: number
  id: number
  name: string
  bib_number: string
  category_code?: 'J' | 'S' | 'SJ' | 'L' | null
  age: number | null
  gender: string | null
  region: string | null
  club: string | null
  division_id?: number
  division_code?: string
  division_name: string
  power_factor?: string
  stages_shot?: number
  total_stage_points?: number
  avg_percentage?: number
  stage_details?: Record<string, {
    percentage: number
    stage_points_earned: number
    hit_factor: number
    rank_in_stage: number
    submission_seq?: number
  }>
  submission_seq?: number
  hit_factor?: number
  percentage?: number
  stage_points_earned?: number
  stage_points_max?: number
  total_points?: number
  total_time?: number
}

export interface LeaderboardResponse {
  filters: {
    division: number | 'overall'
    category: string | null
    stage: number | null
    sort_by?: 'stage_points' | 'percentage'
  }
  stage_info?: {
    id: number
    name: string
    stage_points: number
  }
  rankings: LeaderboardEntry[]
}
