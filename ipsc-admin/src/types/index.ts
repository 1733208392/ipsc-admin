export interface Match {
  id: number
  name: string
  date: string
  status: 'draft' | 'active' | 'completed'
  created_at: string
  divisions_count?: number
  stages_count?: number
  squads_count?: number
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
  max_points: number
  sort_order: number
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
  name: string
  bib_number: string
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
  confirmed: number
  created_at: string
  shooter_name?: string
  bib_number?: string
  stage_name?: string
  division_name?: string
}

export interface LeaderboardEntry {
  id: number
  name: string
  bib_number: string
  age: number | null
  gender: string | null
  region: string | null
  club: string | null
  division_id?: number
  division_code?: string
  division_name: string
  power_factor: string
  stages_shot: number
  total_points: number
  avg_hit_factor: number
  stage_hit_factor?: number
  stage_points?: number
  stage_time?: number
  a_hits?: number
  c_hits?: number
  d_hits?: number
  m_hits?: number
  n_hits?: number
  pe?: number
  confirmed?: number
}

export interface LeaderboardResponse {
  filters: {
    division: number | 'overall'
    category: string | null
    stage: number | null
  }
  rankings: LeaderboardEntry[]
}
