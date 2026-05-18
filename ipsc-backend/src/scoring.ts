export type PowerFactor = 'minor' | 'major';

const SCORING = {
  minor: { A: 5, C: 3, D: 1 },
  major: { A: 5, C: 4, D: 2 },
} as const;

function round(value: number, decimals = 4): number {
  return Math.round(value * 10 ** decimals) / 10 ** decimals;
}

export interface HitCounts {
  A: number;
  C: number;
  D: number;
  M: number;
  N: number;
}

export interface Penalties {
  PE: number;
}

export interface ScoreResult {
  totalPoints: number;
  hitFactor: number;
}

export function calculateScore(
  hits: HitCounts,
  penalties: Penalties,
  totalTime: number,
  powerFactor: PowerFactor
): ScoreResult {
  const pf = SCORING[powerFactor];
  const points = hits.A * pf.A + hits.C * pf.C + hits.D * pf.D;
  const penaltyPoints = (hits.M + hits.N) * 10 + penalties.PE * 10;
  const totalPoints = Math.max(points - penaltyPoints, 0);
  const hitFactor = totalTime > 0 ? totalPoints / totalTime : 0;
  return { totalPoints: round(totalPoints), hitFactor: round(hitFactor) };
}
