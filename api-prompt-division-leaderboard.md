# 组别 + 积分榜体系变更 — Coding Prompt

## 背景

IPSC 赛事管理系统，后端 Node.js + Express + TypeScript + SQLite (better-sqlite3)。
现有一个 `divisions` 表，字段 `id, match_id, name, power_factor(minor/major), sort_order`。
现有积分榜 `GET /matches/:id/leaderboard` 仅支持 `?division_id=` 过滤，按总成绩排序。

## 变更总览

### 1. 固定 5 个组别（Division）

赛事创建时自动生成以下 5 个组别，不允许手动增删：

| Division | 中文名 | Power Factor | 说明 |
|----------|--------|-------------|------|
| `Production` | 原厂 | minor | 量产枪，无改 |
| `Optics` | 原厂光学 | minor | 量产枪 + 光瞄 |
| `Open` | 开放 | major | 不限枪型，全面改装 |
| `Standard` | 标准 | major | 限制改装幅度 |
| `Classic` | 经典 | major | 1911 系列经典枪 |

**power_factor 由组别类型决定，不允许手动设置。**

### 2. 积分榜层级

积分榜支持 **3 个维度** 的组合查询：

```
Division (组别)     → 必选，5 选 1，或 overall
Category (二级分组) → 可选，按射手属性过滤
Stage (单 Stage)   → 可选，按单场景成绩排序
```

#### 维度 1: Division（组别）

- `?division_id=1` → 该组别下的 Overall 总榜（不区分二级分组）
- `?division_id=overall` → 所有组别合并的总榜

#### 维度 2: Category（二级分组）

在任意 Division 下，可按射手属性进一步筛选：

| category 值 | 筛选条件 | 说明 |
|-------------|---------|------|
| `junior` | age < 21 | 青少年 |
| `senior` | age >= 55 | 老年 |
| `lady` | gender = 'female' | 女子 |
| `super_senior` | age >= 65 | 超级老年 |

- 不传 category = 不筛选（Overall）
- category 与 division 可自由组合

#### 维度 3: Stage（单场景排名）

- `?stage_id=3` → 按该 Stage 的单场景 Hit Factor 排名
- 不传 stage_id = 按总成绩排名（所有 Stage 汇总）

#### 组合示例

```
?division_id=1                        → 原厂组 Overall 总榜
?division_id=overall                  → 全体射手 Overall 总榜
?division_id=1&category=lady          → 原厂组女子榜
?division_id=3&category=junior        → 开放组青少年榜
?division_id=1&stage_id=2             → 原厂组 Stage 2 排名
?division_id=1&category=senior&stage_id=2  → 原厂组老年 Stage 2 排名
?division_id=overall&stage_id=2       → 全体 Stage 2 排名
```

---

## 3. 数据库变更 — `src/db.ts`

### 3.1 divisions 表改造

删除 `power_factor` 列，改为 `code` 列（固定枚举）：

```sql
CREATE TABLE IF NOT EXISTS divisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    code TEXT NOT NULL,            -- 固定枚举：production/optics/open/standard/classic
    name TEXT NOT NULL,            -- 显示名称（中英文均可）
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE(match_id, code)         -- 同一赛事不能重复创建同组别
);
```

**⚠️ 迁移策略**（已有数据）：

```typescript
// 1. 检查并添加 code 列
const divCols = db.prepare("PRAGMA table_info(divisions)").all() as Array<{ name: string }>;
const divExisting = new Set(divCols.map(c => c.name));

if (!divExisting.has('code')) {
  db.exec(`ALTER TABLE divisions ADD COLUMN code TEXT`);
  // 迁移现有数据：根据 name 匹配 code
  db.exec(`UPDATE divisions SET code = 'production' WHERE name LIKE '%原厂%' AND name NOT LIKE '%光学%'`);
  db.exec(`UPDATE divisions SET code = 'optics' WHERE name LIKE '%光学%'`);
  db.exec(`UPDATE divisions SET code = 'open' WHERE name LIKE '%开放%' OR name LIKE '%Open%'`);
  db.exec(`UPDATE divisions SET code = 'standard' WHERE name LIKE '%标准%' OR name LIKE '%Standard%'`);
  db.exec(`UPDATE divisions SET code = 'classic' WHERE name LIKE '%经典%' OR name LIKE '%Classic%'`);
}

// 2. 如果旧 power_factor 列还在，先不删（保持兼容），新代码不再使用它
```

### 3.2 shooters 表确认（上一次变更已加）

确保 `shooters` 表有 `age` 和 `gender` 列（上一轮变更内容）：

```sql
age INTEGER,
gender TEXT,    -- 'male' / 'female'
```

### 3.3 不需要新建表

Category（二级分组）不是新表，是查询时动态筛选。Power Factor 由 Division 的 `code` 决定，通过代码映射，不需要存库。

---

## 4. Power Factor 映射 — 新增配置

在 `src/scoring.ts` 或新建 `src/constants.ts`：

```typescript
// Division code → Power Factor 映射
export const DIVISION_POWER_FACTOR: Record<string, 'major' | 'minor'> = {
  production: 'minor',
  optics: 'minor',
  open: 'major',
  standard: 'major',
  classic: 'major',
};

// 二级分组年龄阈值
export const CATEGORY_THRESHOLDS = {
  junior: { max_age: 21 },      // age < 21
  senior: { min_age: 55 },       // age >= 55
  super_senior: { min_age: 65 }, // age >= 65
  // lady 按 gender='female' 筛选，不走年龄
} as const;

export type CategoryType = 'junior' | 'senior' | 'super_senior' | 'lady';

// 检查射手是否匹配某个 category
export function matchCategory(
  category: CategoryType,
  shooter: { age?: number | null; gender?: string | null }
): boolean {
  if (category === 'lady') return shooter.gender === 'female';
  const rule = CATEGORY_THRESHOLDS[category];
  if (!rule || shooter.age == null) return false;
  if ('max_age' in rule) return shooter.age < rule.max_age;
  if ('min_age' in rule) return shooter.age >= rule.min_age;
  return false;
}
```

---

## 5. Zod Schema 变更 — `src/types.ts`

### CreateDivisionSchema

```typescript
export const VALID_DIVISION_CODES = ['production', 'optics', 'open', 'standard', 'classic'] as const;

export const CreateDivisionSchema = z.object({
  code: z.enum(VALID_DIVISION_CODES),
  name: z.string().min(1),
  sort_order: z.number().int().optional().default(0),
});

export const UpdateDivisionSchema = z.object({
  name: z.string().min(1).optional(),
  sort_order: z.number().int().optional(),
  // 注意：code 不允许修改
});
```

### Leaderboard query 参数（不需要 Zod，直接从 req.query 取）

---

## 6. 路由变更

### 6.1 Divisions — `src/routes/divisions.ts`

**POST /matches/:matchId/divisions**

- 接收 `code` + `name` + `sort_order`
- 校验 `code` 必须是 5 个固定值之一
- 同一 match_id 下 code 不可重复（UNIQUE 约束兜底）

**GET /matches/:matchId/divisions**

- 不变，但响应现在包含 `code` 字段

**DELETE /divisions/:id**

- 不变

**可选增强 — 赛事创建时自动初始化 5 个组别**：

在 `POST /matches` 成功后，自动插入 5 条 division 记录：

```typescript
const defaultDivisions = [
  { code: 'production', name: '原厂 (Production)', sort_order: 0 },
  { code: 'optics', name: '原厂光学 (Optics)', sort_order: 1 },
  { code: 'standard', name: '标准 (Standard)', sort_order: 2 },
  { code: 'open', name: '开放 (Open)', sort_order: 3 },
  { code: 'classic', name: '经典 (Classic)', sort_order: 4 },
];
// 逐条 INSERT
```

### 6.2 Leaderboard 重写 — `src/routes/leaderboard.ts`

**接口**: `GET /api/v1/matches/:matchId/leaderboard`

**Query 参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| division_id | number / string "overall" | ❌ | 不传 = overall（全体），传数字 = 指定组别 |
| category | string | ❌ | `junior` / `senior` / `super_senior` / `lady` |
| stage_id | number | ❌ | 传 = 按该 Stage 单场景排名 |

**实现逻辑**:

```typescript
router.get('/', (req: Request, res: Response) => {
  const matchId = Number(req.params['matchId']);
  const divisionParam = req.query['division_id'] as string | undefined;
  const categoryParam = req.query['category'] as string | undefined;
  const stageIdParam = req.query['stage_id'] as string | undefined;

  // 1. 参数校验
  const validCategories = ['junior', 'senior', 'super_senior', 'lady'];
  if (categoryParam && !validCategories.includes(categoryParam)) {
    res.status(400).json(fail(`Invalid category. Must be one of: ${validCategories.join(', ')}`));
    return;
  }

  const isOverall = !divisionParam || divisionParam === 'overall';
  const divisionId = isOverall ? null : Number(divisionParam);
  const stageId = stageIdParam ? Number(stageIdParam) : null;

  // 2. 构建 SQL
  let sql = `
    SELECT
      s.id,
      s.name,
      s.bib_number,
      s.age,
      s.gender,
      s.region,
      s.club,
      d.id AS division_id,
      d.code AS division_code,
      d.name AS division_name,
  `;

  // Stage 维度：按单场景排名
  if (stageId) {
    sql += `
      sc.hit_factor AS stage_hit_factor,
      sc.total_points AS stage_points,
      sc.total_time AS stage_time,
      sc.a_hits, sc.c_hits, sc.d_hits, sc.m_hits, sc.n_hits, sc.pe,
      sc.confirmed
    `;
  } else {
    // Overall：按全部 Stage 汇总
    sql += `
      COUNT(sc.id) AS stages_shot,
      COALESCE(SUM(sc.total_points), 0) AS total_points,
      COALESCE(AVG(sc.hit_factor), 0) AS avg_hit_factor
    `;
  }

  sql += `
    FROM shooters s
    JOIN divisions d ON s.division_id = d.id
  `;

  const params: unknown[] = [matchId];

  // Division 过滤
  if (divisionId !== null) {
    sql += ` AND s.division_id = ?`;
    params.push(divisionId);
  }

  // Stage 过滤
  if (stageId) {
    sql += ` LEFT JOIN scores sc ON s.id = sc.shooter_id AND sc.stage_id = ?`;
    params.push(stageId);
  } else {
    sql += ` LEFT JOIN scores sc ON s.id = sc.shooter_id`;
  }

  sql += ` WHERE s.match_id = ?`;

  // Category 过滤 — 需要在 SQL 里加条件
  if (categoryParam) {
    if (categoryParam === 'lady') {
      sql += ` AND s.gender = 'female'`;
    } else if (categoryParam === 'junior') {
      sql += ` AND s.age IS NOT NULL AND s.age < 21`;
    } else if (categoryParam === 'senior') {
      sql += ` AND s.age IS NOT NULL AND s.age >= 55`;
    } else if (categoryParam === 'super_senior') {
      sql += ` AND s.age IS NOT NULL AND s.age >= 65`;
    }
  }

  // GROUP BY
  if (stageId) {
    sql += ` GROUP BY s.id, sc.id`;
  } else {
    sql += ` GROUP BY s.id`;
  }

  // 排序
  if (stageId) {
    sql += ` ORDER BY sc.hit_factor DESC`;
  } else {
    sql += ` ORDER BY total_points DESC, avg_hit_factor DESC`;
  }

  // 3. 查询并返回
  const rows = db.prepare(sql).all(...params);

  // 4. 在响应中附加查询元信息，方便 APP 知道当前看的是什么维度
  res.json(ok({
    filters: {
      division: isOverall ? 'overall' : divisionId,
      category: categoryParam || null,
      stage: stageId || null,
    },
    rankings: rows,
  }));
});
```

**⚠️ 注意**: 当 `stage_id` 传入时，LEFT JOIN scores 需要带 `AND sc.stage_id = ?` 条件，
这样只查该 Stage 的成绩。未打该 Stage 的射手不会出现在结果中。

### 6.3 记分引擎 — `src/scoring.ts`

当前记分引擎从 scores 表读取 `power_factor` 或硬编码，需要改为从 shooter 的 division 动态获取。

如果现有逻辑是直接传 power_factor 参数，需要在 FlexTarget 入口处查一次 shooter 的 division code，然后映射 power factor：

```typescript
import { DIVISION_POWER_FACTOR } from '../constants.js';

// 在 FlexTarget 处理逻辑中
const shooter = db.prepare(`
  SELECT s.division_id, d.code FROM shooters s
  JOIN divisions d ON s.division_id = d.id
  WHERE s.match_id = ? AND s.bib_number = ?
`).get(matchId, shooterBib) as { division_id: number; code: string } | undefined;

if (!shooter) {
  return fail(`No shooter found with bib: ${shooterBib}`);
}

const powerFactor = DIVISION_POWER_FACTOR[shooter.code];
```

---

## 7. 响应示例

### 7.1 Overall 总榜（不传 division_id）

```
GET /api/v1/matches/1/leaderboard
```

```json
{
  "success": true,
  "data": {
    "filters": { "division": "overall", "category": null, "stage": null },
    "rankings": [
      {
        "id": 1, "name": "张三", "bib_number": "42", "age": 32, "gender": "male",
        "division_id": 3, "division_code": "open", "division_name": "开放 (Open)",
        "stages_shot": 3, "total_points": 156, "avg_hit_factor": 4.21
      }
    ]
  }
}
```

### 7.2 原厂组女子榜

```
GET /api/v1/matches/1/leaderboard?division_id=1&category=lady
```

```json
{
  "success": true,
  "data": {
    "filters": { "division": 1, "category": "lady", "stage": null },
    "rankings": [
      {
        "id": 5, "name": "李娜", "bib_number": "17", "age": 28, "gender": "female",
        "division_id": 1, "division_code": "production", "division_name": "原厂 (Production)",
        "stages_shot": 2, "total_points": 88, "avg_hit_factor": 3.67
      }
    ]
  }
}
```

### 7.3 开放组 Stage 2 单场景排名

```
GET /api/v1/matches/1/leaderboard?division_id=3&stage_id=2
```

```json
{
  "success": true,
  "data": {
    "filters": { "division": 3, "category": null, "stage": 2 },
    "rankings": [
      {
        "id": 1, "name": "张三", "bib_number": "42",
        "division_id": 3, "division_code": "open", "division_name": "开放 (Open)",
        "stage_hit_factor": 5.12, "stage_points": 48, "stage_time": 9.38,
        "a_hits": 8, "c_hits": 2, "d_hits": 0, "m_hits": 0, "n_hits": 0, "pe": 0,
        "confirmed": 1
      }
    ]
  }
}
```

---

## 8. 前端 & APP 对接影响

### 响应结构变化

**⚠️ 破坏性变更**：积分榜响应从数组变为对象。

旧格式:
```json
{ "success": true, "data": [ ... ] }
```

新格式:
```json
{ "success": true, "data": { "filters": {...}, "rankings": [ ... ] } }
```

前端和 APP 都需要更新读取路径：从 `data` 改为 `data.rankings`。

### APP 端积分榜筛选 UI 建议

```
第一行: Division 标签页（Overall | 原厂 | 原厂光学 | 开放 | 标准 | 经典）
第二行: Category 标签页（全部 | 青少年 | 老年 | 超级老年 | 女子）
第三行: Stage 标签页（总成绩 | Stage 1 | Stage 2 | ...）
```

---

## 9. 验证步骤

```bash
cd /Volumes/SSD2/Projects/GCS/ipsc-backend
npm run build
npm run dev

# 1. 创建赛事（应自动生成 5 个组别）
curl -s -X POST http://localhost:3001/api/v1/matches \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test","date":"2026-06-15"}' | python3 -m json.tool

# 2. 确认 5 个组别
curl -s http://localhost:3001/api/v1/matches/1/divisions | python3 -m json.tool

# 3. Overall 总榜
curl -s http://localhost:3001/api/v1/matches/1/leaderboard | python3 -m json.tool

# 4. 指定组别
curl -s "http://localhost:3001/api/v1/matches/1/leaderboard?division_id=1" | python3 -m json.tool

# 5. 二级分组
curl -s "http://localhost:3001/api/v1/matches/1/leaderboard?category=lady" | python3 -m json.tool

# 6. 单 Stage
curl -s "http://localhost:3001/api/v1/matches/1/leaderboard?division_id=1&stage_id=1" | python3 -m json.tool

# 7. 组合查询
curl -s "http://localhost:3001/api/v1/matches/1/leaderboard?division_id=3&category=junior&stage_id=2" | python3 -m json.tool
```

---

## 10. 涉及文件清单

| 文件 | 改动 |
|------|------|
| `src/db.ts` | divisions 表加 `code` 列 + 迁移逻辑 |
| `src/types.ts` | CreateDivisionSchema / UpdateDivisionSchema 改 code 枚举 |
| `src/constants.ts` | **新建** — DIVISION_POWER_FACTOR、CATEGORY_THRESHOLDS、matchCategory() |
| `src/routes/divisions.ts` | POST 改用 code；可选：赛事创建时自动初始化 5 组别 |
| `src/routes/leaderboard.ts` | **重写** — 支持 division/category/stage 三维筛选 |
| `src/routes/scores.ts` 或 `src/scoring.ts` | 记分时从 division.code 动态获取 power_factor |
| `src/routes/matches.ts` | 可选：创建赛事时自动初始化 5 个 division |

共 6~7 个文件。
