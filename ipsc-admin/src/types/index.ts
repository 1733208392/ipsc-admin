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
  name: string
  power_factor: 'minor' | 'major'
  sort_order: number
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
  squad_id: number
  name: string
  bib_number: string
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
  division_name: string
  power_factor: string
  stages_shot: number
  total_points: number
  avg_hit_factor: number
}
