# 积分榜记分逻辑 Bug Fix — Coding Prompt

## 背景

IPSC 赛事管理系统，后端 Node.js + Express + TypeScript + SQLite (better-sqlite3)。

当前积分榜逻辑**有严重 Bug**：直接按 `total_points`（原始命中分）和 `avg_hit_factor` 排名。
这不是 IPSC 标准排名方式。IPSC 使用 **Stage Points 百分比制** 排名。

## Bug 描述

### 当前（错误）逻辑

```
排名依据 = SUM(各 Stage 原始命中分) DESC
```

原始命中分 = A×5 + C×(3或4) + D×(1或2) - M×10 - N×10 - PE×10

**问题**：不同 Stage 的原始命中分没有可比性（Stage A 可能满分 60，Stage B 满分 120），直接加总后大 Stage 权重远高于小 Stage，排名失真。

### 正确（IPSC 标准）逻辑

每个 Stage 有一个**场景总分**（Stage Points）。射手在该 Stage 的得分按 Hit Factor 百分比计算：

```
最高 HF 射手 → 100% × Stage Points
其他射手 → (自己的 HF / 最高 HF) × Stage Points
```

**示例**：

| 射手 | HF | 百分比 | Stage Points | 得分 |
|------|-----|--------|-------------|------|
| 张三 | 10.0 | 100% | 120 | **120.00** |
| 李四 | 8.0 | 80% | 120 | **96.00** |
| 王五 | 5.0 | 50% | 120 | **60.00** |

最终排名 = SUM(各 Stage 得分) DESC

---

## 核心变更：Stage Points 计算引擎

### 1. 数据模型确认 — `stages` 表

现有 `stages` 表已有 `max_points` 字段：

```sql
stages (id, match_id, name, min_rounds, max_points, sort_order)
```

**`max_points` 就是 Stage Points（场景总分）**。字段名改为 `stage_points` 更清晰，但保持兼容也可以。

⚠️ **如果重命名**：在 `db.ts` 加迁移：

```typescript
const stageCols = db.prepare("PRAGMA table_info(stages)").all() as Array<{ name: string }>;
if (!stageCols.find(c => c.name === 'stage_points')) {
  db.exec(`ALTER TABLE stages ADD COLUMN stage_points INTEGER NOT NULL DEFAULT 0`);
  db.exec(`UPDATE stages SET stage_points = max_points`);
}
// 代码中统一用 stage_points，max_points 保留但不再使用
```

### 2. 新增计算函数 — `src/scoring.ts` 或 `src/services/ranking.ts`

```typescript
import db from '../db.js';

interface StageResult {
  shooter_id: number;
  stage_id: number;
  hit_factor: number;
  total_points: number;  // 原始命中分
  total_time: number;
}

interface RankedShooter {
  shooter_id: number;
  stage_id: number;
  hit_factor: number;
  percentage: number;       // 百分比 0-100
  stage_points_earned: number;  // 该 Stage 实际得分
  stage_points_max: number;     // 该 Stage 总分
  rank_in_stage: number;    // 该 Stage 内排名
}

/**
 * 计算单个 Stage 的排名和 Stage Points
 * 必须在同 Division 内计算（不同 Division 的 HF 不可比较）
 */
export function calculateStageRanking(
  matchId: number,
  stageId: number,
  divisionId: number | null  // null = overall（跨 Division，不推荐但支持）
): RankedShooter[] {
  // 1. 获取该 Stage 的总分
  const stage = db.prepare(
    `SELECT stage_points FROM stages WHERE id = ?`
  ).get(stageId) as { stage_points: number } | undefined;

  if (!stage) return [];
  const stagePointsMax = stage.stage_points || 0;

  // 2. 获取该 Stage 所有射手成绩
  let sql = `
    SELECT sc.shooter_id, sc.hit_factor, sc.total_points, sc.total_time
    FROM scores sc
    JOIN shooters s ON sc.shooter_id = s.id
    WHERE sc.match_id = ? AND sc.stage_id = ?
  `;
  const params: unknown[] = [matchId, stageId];

  if (divisionId !== null) {
    sql += ` AND s.division_id = ?`;
    params.push(divisionId);
  }

  sql += ` ORDER BY sc.hit_factor DESC`;

  const results = db.prepare(sql).all(...params) as StageResult[];

  if (results.length === 0) return [];

  // 3. 最高 HF
  const maxHF = results[0].hit_factor;

  // 4. 计算百分比和 Stage Points
  return results.map((r, index) => {
    const percentage = maxHF > 0 ? (r.hit_factor / maxHF) * 100 : 0;
    const stagePointsEarned = (percentage / 100) * stagePointsMax;

    return {
      shooter_id: r.shooter_id,
      stage_id: stageId,
      hit_factor: r.hit_factor,
      percentage: Math.round(percentage * 100) / 100,           // 保留 2 位
      stage_points_earned: Math.round(stagePointsEarned * 100) / 100,  // 保留 2 位
      stage_points_max: stagePointsMax,
      rank_in_stage: index + 1,
    };
  });
}

/**
 * 计算某 Division 下所有射手的多 Stage 总排名
 * Sum(各 Stage 的 stage_points_earned)
 */
export function calculateOverallRanking(
  matchId: number,
  divisionId: number | null,   // null = overall
  categoryFilter?: { gender?: string; minAge?: number; maxAge?: number }
) {
  // 1. 获取赛事所有 Stage
  const stages = db.prepare(
    `SELECT id FROM stages WHERE match_id = ? ORDER BY sort_order, id`
  ).all(matchId) as Array<{ id: number }>;

  // 2. 获取符合条件射手
  let shooterSql = `
    SELECT s.id, s.name, s.bib_number, s.age, s.gender, s.region, s.club,
           d.id AS division_id, d.code AS division_code, d.name AS division_name,
           d.power_factor
    FROM shooters s
    JOIN divisions d ON s.division_id = d.id
    WHERE s.match_id = ?
  `;
  const shooterParams: unknown[] = [matchId];

  if (divisionId !== null) {
    shooterSql += ` AND s.division_id = ?`;
    shooterParams.push(divisionId);
  }

  if (categoryFilter) {
    if (categoryFilter.gender) {
      shooterSql += ` AND s.gender = ?`;
      shooterParams.push(categoryFilter.gender);
    }
    if (categoryFilter.minAge !== undefined) {
      shooterSql += ` AND s.age IS NOT NULL AND s.age >= ?`;
      shooterParams.push(categoryFilter.minAge);
    }
    if (categoryFilter.maxAge !== undefined) {
      shooterSql += ` AND s.age IS NOT NULL AND s.age < ?`;
      shooterParams.push(categoryFilter.maxAge);
    }
  }

  const shooters = db.prepare(shooterSql).all(...shooterParams) as Array<{
    id: number; name: string; bib_number: string;
    age: number | null; gender: string | null; region: string | null; club: string | null;
    division_id: number; division_code: string; division_name: string; power_factor: string;
  }>;

  // 3. 为每个 Stage 计算排名（必须在 Division 内计算百分比）
  // 先按 Division 分组，每组内计算 Stage Points
  const divisionGroups = new Map<number, typeof shooters>();
  shooters.forEach(s => {
    if (!divisionGroups.has(s.division_id)) divisionGroups.set(s.division_id, []);
    divisionGroups.get(s.division_id)!.push(s);
  });

  // 存储每个射手在各 Stage 的得分
  const shooterStagePoints = new Map<number, Map<number, { 
    percentage: number; stage_points_earned: number; hit_factor: number;
    rank_in_stage: number; stage_points_max: number;
  }>>();  // shooter_id → (stage_id → details)

  // 对每个 Division 分别计算（保证百分比在同 Division 内计算）
  for (const [divId, divShooters] of divisionGroups) {
    for (const stage of stages) {
      // 获取该 Division + Stage 的所有成绩，按 HF 降序
      const scores = db.prepare(`
        SELECT sc.shooter_id, sc.hit_factor, sc.total_points, sc.total_time
        FROM scores sc
        WHERE sc.match_id = ? AND sc.stage_id = ? AND sc.shooter_id IN (${divShooters.map(() => '?').join(',')})
        ORDER BY sc.hit_factor DESC
      `).all(matchId, stage.id, ...divShooters.map(s => s.id)) as StageResult[];

      if (scores.length === 0) continue;

      const maxHF = scores[0].hit_factor;
      const stagePointsMax = (db.prepare(`SELECT stage_points FROM stages WHERE id = ?`).get(stage.id) as { stage_points: number }).stage_points || 0;

      scores.forEach((sc, idx) => {
        const percentage = maxHF > 0 ? (sc.hit_factor / maxHF) * 100 : 0;
        const earned = (percentage / 100) * stagePointsMax;

        if (!shooterStagePoints.has(sc.shooter_id)) {
          shooterStagePoints.set(sc.shooter_id, new Map());
        }
        shooterStagePoints.get(sc.shooter_id)!.set(stage.id, {
          percentage: Math.round(percentage * 100) / 100,
          stage_points_earned: Math.round(earned * 100) / 100,
          hit_factor: sc.hit_factor,
          rank_in_stage: idx + 1,
          stage_points_max: stagePointsMax,
        });
      });
    }
  }

  // 4. 汇总每个射手
  const rankings = shooters.map(shooter => {
    const stageMap = shooterStagePoints.get(shooter.id);
    let totalStagePoints = 0;
    let totalPercentage = 0;
    let stagesShot = 0;

    if (stageMap) {
      for (const [, detail] of stageMap) {
        totalStagePoints += detail.stage_points_earned;
        totalPercentage += detail.percentage;
        stagesShot++;
      }
    }

    return {
      ...shooter,
      stages_shot: stagesShot,
      total_stage_points: Math.round(totalStagePoints * 100) / 100,
      avg_percentage: stagesShot > 0 ? Math.round((totalPercentage / stagesShot) * 100) / 100 : 0,
      stage_details: stageMap
        ? Object.fromEntries(
            Array.from(stageMap.entries()).map(([stageId, d]) => [
              stageId,
              {
                percentage: d.percentage,
                stage_points_earned: d.stage_points_earned,
                hit_factor: d.hit_factor,
                rank_in_stage: d.rank_in_stage,
              },
            ])
          )
        : {},
    };
  });

  // 5. 按 total_stage_points 降序排名
  rankings.sort((a, b) => b.total_stage_points - a.total_stage_points);

  // 添加排名序号
  rankings.forEach((r, idx) => {
    r.rank = idx + 1;
  });

  return rankings;
}
```

---

## 3. Leaderboard API 重写 — `src/routes/leaderboard.ts`

### 接口

```
GET /api/v1/matches/:matchId/leaderboard
```

### Query 参数

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| division_id | number / "overall" | overall | 组别筛选 |
| category | string | null | junior/senior/super_senior/lady |
| stage_id | number | null | 单 Stage 视图 |
| sort_by | string | "stage_points" | 排名依据：stage_points / percentage |

### 3.1 总成绩模式（不传 stage_id）

```typescript
router.get('/', (req: Request, res: Response) => {
  const matchId = Number(req.params['matchId']);
  const divisionParam = req.query['division_id'] as string | undefined;
  const categoryParam = req.query['category'] as string | undefined;
  const stageIdParam = req.query['stage_id'] as string | undefined;
  const sortBy = (req.query['sort_by'] as string) || 'stage_points';

  const isOverall = !divisionParam || divisionParam === 'overall';
  const divisionId = isOverall ? null : Number(divisionParam);
  const stageId = stageIdParam ? Number(stageIdParam) : null;

  // Category 转换为筛选条件
  const categoryFilter = categoryParam ? parseCategory(categoryParam) : undefined;

  if (stageId) {
    // 单 Stage 视图
    const stageRanking = calculateStageRanking(matchId, stageId, divisionId);
    // ... 附带射手信息，返回
  } else {
    // 总成绩视图
    const rankings = calculateOverallRanking(matchId, divisionId, categoryFilter);
    // ... 排序并返回
  }
});

function parseCategory(category: string) {
  switch (category) {
    case 'lady': return { gender: 'female' };
    case 'junior': return { maxAge: 21 };
    case 'senior': return { minAge: 55 };
    case 'super_senior': return { minAge: 65 };
    default: return undefined;
  }
}
```

### 3.2 响应格式

**总成绩模式**（默认，Sum of Stage Points）：

```json
{
  "success": true,
  "data": {
    "filters": {
      "division": "overall",
      "category": null,
      "stage": null,
      "sort_by": "stage_points"
    },
    "rankings": [
      {
        "rank": 1,
        "id": 1,
        "name": "张三",
        "bib_number": "42",
        "age": 32,
        "gender": "male",
        "region": "上海",
        "club": "铳义堂",
        "division_id": 3,
        "division_code": "open",
        "division_name": "开放 (Open)",
        "power_factor": "major",
        "stages_shot": 3,
        "total_stage_points": 336.00,
        "avg_percentage": 93.33,
        "stage_details": {
          "1": { "percentage": 100.00, "stage_points_earned": 120.00, "hit_factor": 10.0, "rank_in_stage": 1 },
          "2": { "percentage": 80.00, "stage_points_earned": 96.00, "hit_factor": 8.0, "rank_in_stage": 2 },
          "3": { "percentage": 100.00, "stage_points_earned": 120.00, "hit_factor": 9.5, "rank_in_stage": 1 }
        }
      }
    ]
  }
}
```

**单 Stage 模式**（传了 stage_id）：

```json
{
  "success": true,
  "data": {
    "filters": {
      "division": 1,
      "category": null,
      "stage": 2,
      "sort_by": "stage_points"
    },
    "stage_info": {
      "id": 2,
      "name": "Stage 2 - Speed Shoot",
      "stage_points": 120
    },
    "rankings": [
      {
        "rank_in_stage": 1,
        "id": 1,
        "name": "张三",
        "bib_number": "42",
        "division_code": "open",
        "division_name": "开放 (Open)",
        "hit_factor": 10.0,
        "percentage": 100.00,
        "stage_points_earned": 120.00,
        "stage_points_max": 120,
        "total_points": 100,
        "total_time": 10.0
      },
      {
        "rank_in_stage": 2,
        "id": 2,
        "name": "李四",
        "bib_number": "88",
        "division_code": "open",
        "division_name": "开放 (Open)",
        "hit_factor": 8.0,
        "percentage": 80.00,
        "stage_points_earned": 96.00,
        "stage_points_max": 120,
        "total_points": 80,
        "total_time": 10.0
      }
    ]
  }
}
```

---

## 4. sort_by 排名模式

| sort_by 值 | 排名依据 | 说明 |
|-----------|---------|------|
| `stage_points` | `total_stage_points` DESC | **默认**，按各 Stage 得分总和排名 |
| `percentage` | `avg_percentage` DESC | 按平均百分比排名，消除 Stage 分值差异 |

单 Stage 模式下 `sort_by` 无意义（始终按 HF 降序 / percentage 降序，两者等价）。

---

## 5. 关键规则：百分比必须在 Division 内计算

**⚠️ 这是最重要的规则**：Hit Factor 百分比必须在同一 Division 内计算。

原因：不同 Division 的 PF 不同（Major/Minor），导致相同命中分布下 HF 不可比较。

```
❌ 错误：所有 Division 混在一起算百分比
✅ 正确：每个 Division 内部分别算百分比，然后加总 Stage Points
```

**Overall 模式**（不选 Division）的处理：
- 仍然按 Division 分组计算百分比
- 各 Division 内各自算出 stage_points_earned
- 最后按 total_stage_points 跨 Division 统一排名

---

## 6. FlexTarget 接入不需要改

`POST /matches/:matchId/scores/flextarget` 只负责：
1. 接收原始命中数据
2. 计算 raw hit_factor
3. 存入 scores 表

Stage Points 百分比计算是**查询时动态计算**的，不在写入时计算。
原因：百分比依赖于同 Division 内其他射手的成绩（最高 HF），写入时无法确定。

---

## 7. 前端变更 — 积分榜页面

### 7.1 排名列变化

**总成绩模式**：

| 排名 | Bib | 姓名 | 组别 | 区域 | 俱乐部 | 完成Stage | 总Stage Points | 平均% |

**单 Stage 模式**：

| 排名 | Bib | 姓名 | 组别 | HF | % | Stage Points | 原始得分 | 用时 |

### 7.2 新增 sort_by 切换

在 Category 行和 Stage 行之间，新增一行：

```
排序: [Stage Points] [百分比]
```

```tsx
<div className="flex gap-1">
  <Button
    variant={sortBy === 'stage_points' ? 'secondary' : 'ghost'}
    size="sm"
    onClick={() => setSortBy('stage_points')}
  >
    Stage Points
  </Button>
  <Button
    variant={sortBy === 'percentage' ? 'secondary' : 'ghost'}
    size="sm"
    onClick={() => setSortBy('percentage')}
  >
    百分比
  </Button>
</div>
```

### 7.3 stage_details 可展开

在总成绩模式下，每一行射手可以展开查看各 Stage 明细：

```
▼ 1  张三  BIB:42  Open  上海  铳义堂  3/3  336.00 pts  93.33%
    Stage 1: HF=10.0  100.00%  120.00 pts  🥇
    Stage 2: HF=8.0   80.00%   96.00 pts   🥈
    Stage 3: HF=9.5   100.00%  120.00 pts  🥇
```

---

## 8. Stage 管理页面变更

创建/编辑 Stage 时，`max_points` 字段改为 `stage_points`（场景总分），UI 标签改为"场景总分"：

```typescript
const schema = z.object({
  name: z.string().min(1),
  min_rounds: z.number().int().min(0).optional().default(0),
  stage_points: z.number().int().min(0).optional().default(0),  // 改名
  sort_order: z.number().int().optional().default(0),
})
```

前端表单：
```
Stage 名称: [_____________]
最少弹数:   [___]
场景总分:   [___]    ← 原来叫"最大分数"，现在叫"场景总分"
排序:       [___]
```

---

## 9. 验证步骤

```bash
cd /Volumes/SSD2/Projects/GCS/ipsc-backend
npm run build
npm run dev

# 1. 创建赛事 + 5 组别（应自动初始化）
curl -s -X POST http://localhost:3001/api/v1/matches \
  -H 'Content-Type: application/json' \
  -d '{"name":"测试赛","date":"2026-06-15"}'

# 2. 创建 2 个 Stage，分别设置不同 stage_points
curl -s -X POST http://localhost:3001/api/v1/matches/1/stages \
  -H 'Content-Type: application/json' \
  -d '{"name":"Stage 1","min_rounds":12,"stage_points":120}'
curl -s -X POST http://localhost:3001/api/v1/matches/1/stages \
  -H 'Content-Type: application/json' \
  -d '{"name":"Stage 2","min_rounds":18,"stage_points":180}'

# 3. 创建射手
curl -s -X POST http://localhost:3001/api/v1/matches/1/shooters \
  -H 'Content-Type: application/json' \
  -d '{"division_id":1,"squad_id":1,"name":"张三","bib_number":"1"}'
curl -s -X POST http://localhost:3001/api/v1/matches/1/shooters \
  -H 'Content-Type: application/json' \
  -d '{"division_id":1,"squad_id":1,"name":"李四","bib_number":"2"}'

# 4. 上传成绩 — 张三 HF 高
curl -s -X POST http://localhost:3001/api/v1/matches/1/scores/flextarget \
  -H 'Content-Type: application/json' \
  -d '{"shooter_bib":"1","stage_id":"1","total_time":10,"hits":{"A":10,"C":0,"D":0,"M":0,"N":0},"penalties":{"PE":0}}'
# 张三 Stage1: 50pts / 10s = HF 5.0

curl -s -X POST http://localhost:3001/api/v1/matches/1/scores/flextarget \
  -H 'Content-Type: application/json' \
  -d '{"shooter_bib":"2","stage_id":"1","total_time":10,"hits":{"A":8,"C":0,"D":0,"M":0,"N":0},"penalties":{"PE":0}}'
# 李四 Stage1: 40pts / 10s = HF 4.0

# 5. 验证积分榜
curl -s "http://localhost:3001/api/v1/matches/1/leaderboard?division_id=1" | python3 -m json.tool

# 期望:
# 张三: HF=5.0, percentage=100%, stage_points_earned=120.00
# 李四: HF=4.0, percentage=80%,  stage_points_earned=96.00
# 张三 total_stage_points=120, 排第1
# 李四 total_stage_points=96,  排第2

# 6. 上传 Stage 2 成绩
curl -s -X POST http://localhost:3001/api/v1/matches/1/scores/flextarget \
  -H 'Content-Type: application/json' \
  -d '{"shooter_bib":"1","stage_id":"2","total_time":12,"hits":{"A":12,"C":0,"D":0,"M":0,"N":0},"penalties":{"PE":0}}'

curl -s -X POST http://localhost:3001/api/v1/matches/1/scores/flextarget \
  -H 'Content-Type: application/json' \
  -d '{"shooter_bib":"2","stage_id":"2","total_time":12,"hits":{"A":10,"C":0,"D":0,"M":0,"N":0},"penalties":{"PE":0}}'

# 7. 再次验证总排名
curl -s "http://localhost:3001/api/v1/matches/1/leaderboard?division_id=1" | python3 -m json.tool

# 期望:
# 张三: total_stage_points = 120 + 180 = 300
# 李四: total_stage_points = 96 + 144 = 240

# 8. 单 Stage 视图
curl -s "http://localhost:3001/api/v1/matches/1/leaderboard?division_id=1&stage_id=1" | python3 -m json.tool

# 9. 百分比排序
curl -s "http://localhost:3001/api/v1/matches/1/leaderboard?division_id=1&sort_by=percentage" | python3 -m json.tool
```

---

## 10. 涉及文件清单

| 文件 | 改动 |
|------|------|
| `src/db.ts` | stages 表加 `stage_points` 列 + 迁移 |
| `src/types.ts` | CreateStageSchema/UpdateStageSchema 字段改名 stage_points |
| `src/services/ranking.ts` | **新建** — Stage Points 百分比计算引擎 |
| `src/routes/leaderboard.ts` | **重写** — 使用 ranking.ts 计算引擎 |
| `src/routes/stages.ts` | stage_points 替代 max_points |
| `src/routes/scores.ts` | 无需改动（FlexTarget 仍存 raw hit_factor） |
| `src/scoring.ts` | 无需改动（仍算 raw points + hit_factor） |

前端：

| 文件 | 改动 |
|------|------|
| `src/types/index.ts` | LeaderboardEntry 加 stage_points/percentage 字段 |
| `src/pages/LeaderboardPage.tsx` | 表格列变更 + sort_by 切换 + stage_details 展开 |
| `src/pages/StagesPage.tsx` | 表单 max_points → stage_points，标签改"场景总分" |

共 7 个后端文件（1 新建 + 6 修改），3 个前端文件。
