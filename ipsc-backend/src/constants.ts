// All divisions score as minor (A=5, C=3, D=1) by club policy.
export const DIVISION_POWER_FACTOR: Record<string, 'major' | 'minor'> = {
  production: 'minor',
  optics: 'minor',
  open: 'minor',
  standard: 'minor',
  classic: 'minor',
};

export const CATEGORY_THRESHOLDS = {
  junior: { max_age: 21 },
  senior: { min_age: 55 },
  super_junior: { min_age: 65 },
} as const;

export type CategoryType = 'junior' | 'senior' | 'super_junior' | 'lady';

export const DEFAULT_DIVISIONS: Array<{
  code: 'production' | 'optics' | 'standard' | 'open' | 'classic';
  name: string;
  sort_order: number;
}> = [
  { code: 'production', name: '原厂 (Production)', sort_order: 0 },
  { code: 'optics', name: '原厂光学 (Optics)', sort_order: 1 },
  { code: 'standard', name: '标准 (Standard)', sort_order: 2 },
  { code: 'open', name: '开放 (Open)', sort_order: 3 },
  { code: 'classic', name: '经典 (Classic)', sort_order: 4 },
];

export const DEFAULT_SUB_DIVISIONS: Array<{
  name: string;
  min_age?: number;
  max_age?: number;
  gender?: string;
  sort_order: number;
}> = [
  { name: '青少年 (Junior)', max_age: 21, sort_order: 0 },
  { name: '老年 (Senior)', min_age: 55, max_age: 64, sort_order: 1 },
  { name: '超级青年 (Super Junior)', min_age: 65, sort_order: 2 },
  { name: '女子 (Lady)', gender: 'female', sort_order: 3 },
];

export function matchCategory(
  category: CategoryType,
  shooter: { age?: number | null; gender?: string | null }
): boolean {
  if (category === 'lady') return shooter.gender === 'female';
  const rule = CATEGORY_THRESHOLDS[category as Exclude<CategoryType, 'lady'>];
  if (!rule || shooter.age == null) return false;
  if ('max_age' in rule) return shooter.age < rule.max_age;
  if ('min_age' in rule) return shooter.age >= rule.min_age;
  return false;
}
