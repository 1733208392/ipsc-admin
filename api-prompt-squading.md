# 射手自动编组（Squading）功能 — Coding Prompt

## 背景

IPSC 赛事管理系统，后端 Node.js + Express + TypeScript + SQLite (better-sqlite3)。
现有 `squads` 表和 `shooters` 表，射手通过 `squad_id` 关联到 Squad。
目前射手只能手动逐个指定 squad_id，没有批量编组能力。

## 需求概述

提供 **自动编组 + 手动调整** 的完整 Squading 工作流：

1. **自动编组**：按射手属性排序后，以 N 人为一组自动分配到 Squad
2. **手动调整**：编组完成后，可增删移射手
3. **可重复执行**：不满意可重新编组，覆盖之前的分配

---

## 1. 自动编组 API

### 接口

```
POST /api/v1/matches/:matchId/squads/auto-assign
Content-Type: application/json
```

### Request Body

```json
{
  "sort_by": "registration",
  "group_size": 10,
  "strategy": "sequential",
  "clear_existing": false
}
```

### 参数详解

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `sort_by` | string | ❌ | `"registration"` | 排序依据（见下表） |
| `group_size` | number | ❌ | `10` | 每组人数上限 |
| `strategy` | string | ❌ | `"sequential"` | 编组策略（见下文） |
| `clear_existing` | boolean | ❌ | `false` | 是否清除已有 Squad 重新编组 |

### sort_by 排序选项

| 值 | 排序规则 | 用途 |
|----|---------|------|
| `registration` | 按 `created_at` 升序 | 报名顺序编组（最常用） |
| `bib` | 按 `bib_number` 升序 | 按 BIB 号编组 |
| `division` | 按 `division_id` 分组，同组内按 BIB 号排序 | 同组别射手集中编组 |
| `random` | 随机排序 | 抽签式随机编组 |
| `region` | 按 `region` 分组，同区域按 BIB 号排序 | 同区域射手集中编组 |
| `club` | 按 `club` 分组，同俱乐部按 BIB 号排序 | 同俱乐部射手集中编组 |

### strategy 编组策略

| 值 | 说明 |
|----|------|
| `sequential` | 顺序切片：排序后按 group_size 切分，前 10 人→Squad 1，接下来 10 人→Squad 2 |
| `snake` | 蛇形分配（S 型）：第 1 轮 Squad1→Squad2→...→SquadN，第 2 轮 反向 SquadN→...→Squad1，交替进行。**使各组实力均匀** |
| `division_balanced` | Division 均衡：每个 Division 的射手均匀分散到各 Squad，确保每个 Squad 里有各 Division 的人 |

### 流程说明

#### clear_existing = true

1. 删除该赛事所有现有 Squad（级联删除射手关联）
2. 根据排序后的射手列表，按 group_size 和 strategy 创建新 Squad
3. 将射手分配到对应 Squad

#### clear_existing = false（默认）

1. 保留已有 Squad
2. 只对 **squad_id 为 NULL 的射手**（未编组的射手）进行自动编组
3. 新建 Squad 放入这些射手

### Response `200`

```json
{
  "success": true,
  "data": {
    "squads_created": 5,
    "shooters_assigned": 48,
    "unassigned": 2,
    "squads": [
      {
        "id": 1,
        "name": "Squad 1",
        "shooter_count": 10,
        "shooters": [
          { "id": 1, "name": "张三", "bib_number": "1", "division_code": "production" },
          { "id": 2, "name": "李四", "bib_number": "2", "division_code": "open" }
        ]
      }
    ]
  }
}
```

### 错误响应

| 状态码 | 场景 |
|--------|------|
| 404 | 赛事不存在 |
| 400 | group_size < 1 或 > 100 |
| 400 | 没有射手可供编组 |
| 409 | clear_existing=true 但有射手已有成绩（不允许清除有成绩的编组） |

---

## 2. 实现逻辑

### 2.1 核心算法 — `src/services/squading.ts`（新建）

```typescript
import db from '../db.js';
import { DIVISION_POWER_FACTOR } from '../constants.js';

type SortBy = 'registration' | 'bib' | 'division' | 'random' | 'region' | 'club';
type Strategy = 'sequential' | 'snake' | 'division_balanced';

interface AutoAssignOptions {
  matchId: number;
  sort_by: SortBy;
  group_size: number;
  strategy: Strategy;
  clear_existing: boolean;
}

export function autoAssignSquads(options: AutoAssignOptions) {
  const { matchId, sort_by, group_size, strategy, clear_existing } = options;

  // ── Step 1: 获取待编组射手 ─────────────────────────────
  let shooters;
  if (clear_existing) {
    // 检查是否有射手已有成绩
    const hasScores = db.prepare(`
      SELECT COUNT(*) AS c FROM scores WHERE match_id = ?
    `).get(matchId) as { c: number };
    if (hasScores.c > 0) {
      throw new Error('Cannot clear squads: some shooters already have scores');
    }
    // 删除所有 Squad（级联清空 shooters.squad_id 或删除 squad 记录）
    // 注意：不删除射手本身，只清 squad 关联
    db.prepare(`UPDATE shooters SET squad_id = NULL WHERE match_id = ?`).run(matchId);
    db.prepare(`DELETE FROM squads WHERE match_id = ?`).run(matchId);

    shooters = db.prepare(`
      SELECT s.*, d.code AS division_code
      FROM shooters s
      JOIN divisions d ON s.division_id = d.id
      WHERE s.match_id = ?
    `).all(matchId);
  } else {
    // 只取未编组的射手
    shooters = db.prepare(`
      SELECT s.*, d.code AS division_code
      FROM shooters s
      JOIN divisions d ON s.division_id = d.id
      WHERE s.match_id = ? AND s.squad_id IS NULL
    `).all(matchId);
  }

  if (shooters.length === 0) {
    throw new Error('No shooters to assign');
  }

  // ── Step 2: 排序 ───────────────────────────────────────
  const sorted = sortShooters(shooters, sort_by);

  // ── Step 3: 编组 ───────────────────────────────────────
  const squadCount = Math.ceil(sorted.length / group_size);
  const assignments: Map<number, number> = new Map(); // shooter_id → squad_序号(0-based)

  if (strategy === 'sequential') {
    sorted.forEach((shooter, index) => {
      const squadIndex = Math.floor(index / group_size);
      assignments.set(shooter.id, squadIndex);
    });
  } else if (strategy === 'snake') {
    let direction = 1; // 1=正序, -1=反序
    let squadIndex = 0;
    sorted.forEach((shooter) => {
      assignments.set(shooter.id, squadIndex);
      squadIndex += direction;
      if (squadIndex >= squadCount) {
        squadIndex = squadCount - 1;
        direction = -1;
      } else if (squadIndex < 0) {
        squadIndex = 0;
        direction = 1;
      }
    });
  } else if (strategy === 'division_balanced') {
    // 按 division 分桶，然后轮询分配到各 Squad
    const buckets = new Map<string, typeof sorted>();
    sorted.forEach((shooter) => {
      const key = shooter.division_code;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(shooter);
    });
    let squadIndex = 0;
    for (const [, bucket] of buckets) {
      for (const shooter of bucket) {
        assignments.set(shooter.id, squadIndex % squadCount);
        squadIndex++;
      }
    }
  }

  // ── Step 4: 写入数据库 ─────────────────────────────────
  // 获取当前最大 sort_order
  const maxSort = db.prepare(`
    SELECT COALESCE(MAX(sort_order), -1) AS m FROM squads WHERE match_id = ?
  `).get(matchId) as { m: number };

  const transaction = db.transaction(() => {
    // 创建 Squad
    const squadIds: number[] = [];
    for (let i = 0; i < squadCount; i++) {
      const result = db.prepare(
        `INSERT INTO squads (match_id, name, sort_order) VALUES (?, ?, ?)`
      ).run(matchId, `Squad ${maxSort.m + i + 1}`, maxSort.m + i + 1);
      squadIds.push(Number(result.lastInsertRowid));
    }

    // 分配射手
    const updateStmt = db.prepare(
      `UPDATE shooters SET squad_id = ? WHERE id = ?`
    );
    for (const [shooterId, squadIdx] of assignments) {
      updateStmt.run(squadIds[squadIdx], shooterId);
    }

    return squadIds;
  });

  const squadIds = transaction();

  // ── Step 5: 返回结果 ───────────────────────────────────
  const squads = squadIds.map((squadId, index) => {
    const members = db.prepare(`
      SELECT s.id, s.name, s.bib_number, d.code AS division_code
      FROM shooters s
      JOIN divisions d ON s.division_id = d.id
      WHERE s.squad_id = ?
      ORDER BY s.bib_number
    `).all(squadId);

    return {
      id: squadId,
      name: `Squad ${maxSort.m + index + 1}`,
      shooter_count: members.length,
      shooters: members,
    };
  });

  return {
    squads_created: squadCount,
    shooters_assigned: sorted.length,
    unassigned: clear_existing
      ? 0
      : (db.prepare(`SELECT COUNT(*) AS c FROM shooters WHERE match_id = ? AND squad_id IS NULL`).get(matchId) as { c: number }).c,
    squads,
  };
}

// ── 排序函数 ─────────────────────────────────────────────────
function sortShooters(shooters: any[], sort_by: SortBy): any[] {
  const copy = [...shooters];

  switch (sort_by) {
    case 'registration':
      return copy.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));

    case 'bib':
      return copy.sort((a, b) => a.bib_number.localeCompare(b.bib_number, undefined, { numeric: true }));

    case 'division':
      return copy.sort((a, b) => {
        const divCmp = a.division_code.localeCompare(b.division_code);
        if (divCmp !== 0) return divCmp;
        return a.bib_number.localeCompare(b.bib_number, undefined, { numeric: true });
      });

    case 'random':
      // Fisher-Yates shuffle
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;

    case 'region':
      return copy.sort((a, b) => {
        const rCmp = (a.region || '').localeCompare(b.region || '');
        if (rCmp !== 0) return rCmp;
        return a.bib_number.localeCompare(b.bib_number, undefined, { numeric: true });
      });

    case 'club':
      return copy.sort((a, b) => {
        const cCmp = (a.club || '').localeCompare(b.club || '');
        if (cCmp !== 0) return cCmp;
        return a.bib_number.localeCompare(b.bib_number, undefined, { numeric: true });
      });

    default:
      return copy;
  }
}
```

### 2.2 路由 — `src/routes/squads.ts` 新增

```typescript
import { autoAssignSquads } from '../services/squading.js';

// POST /matches/:matchId/squads/auto-assign
export function autoAssign(req: Request, res: Response): void {
  const matchId = Number(req.params['matchId']);
  const match = db.prepare(`SELECT id FROM matches WHERE id = ?`).get(matchId);
  if (!match) {
    res.status(404).json(fail('Match not found'));
    return;
  }

  const sort_by = (req.body.sort_by as SortBy) || 'registration';
  const group_size = Number(req.body.group_size) || 10;
  const strategy = (req.body.strategy as Strategy) || 'sequential';
  const clear_existing = req.body.clear_existing === true;

  if (group_size < 1 || group_size > 100) {
    res.status(400).json(fail('group_size must be between 1 and 100'));
    return;
  }

  try {
    const result = autoAssignSquads({ matchId, sort_by, group_size, strategy, clear_existing });
    res.json(ok(result));
  } catch (err: any) {
    const msg = err.message || String(err);
    const status = msg.includes('Cannot clear') ? 409
                 : msg.includes('No shooters') ? 400
                 : 500;
    res.status(status).json(fail(msg));
  }
}
```

### 2.3 index.ts 注册路由

```typescript
import squadsRouter, { updateSquad, deleteSquad, getSquadQueue, autoAssign } from './routes/squads.js';

// 在 squads 路由组里注册
api.post('/matches/:matchId/squads/auto-assign', autoAssign);
```

⚠️ 必须在 `api.use('/matches/:matchId/squads', squadsRouter)` **之前**注册。

---

## 3. 手动调整 API（已有，确认可用）

以下接口已存在，编组后可直接使用：

| 操作 | 接口 | 说明 |
|------|------|------|
| 移动射手到其他 Squad | `PUT /shooters/:id/squad` | body: `{ "squad_id": 3 }` |
| 修改射手信息 | `PUT /shooters/:id` | 可改 division、name 等 |
| 删除射手 | `DELETE /shooters/:id` | 从赛事移除射手 |
| 新增射手 | `POST /matches/:matchId/shooters` | 可指定 squad_id，也可不指定（后续编组） |
| 删除 Squad | `DELETE /squads/:id` | 射手的 squad_id 被置 NULL |
| 修改 Squad 名称 | `PUT /squads/:id` | body: `{ "name": "Squad Alpha" }` |

### 需要新增的：批量操作

#### 3.1 批量移动射手

```
PUT /api/v1/squads/:squadId/shooters/batch-move
```

```json
{
  "shooter_ids": [5, 12, 23],
  "target_squad_id": 3
}
```

Response:
```json
{
  "success": true,
  "data": { "moved": 3 }
}
```

#### 3.2 从 Squad 移除射手（不删除射手）

```
DELETE /api/v1/squads/:squadId/shooters/:shooterId
```

Response:
```json
{
  "success": true,
  "data": { "shooter_id": 5, "squad_id": null }
}
```

效果：射手的 `squad_id` 被置为 NULL，回到未编组状态。射手本身不删除。

#### 3.3 添加射手到 Squad

```
POST /api/v1/squads/:squadId/shooters
```

```json
{
  "shooter_id": 7
}
```

Response:
```json
{
  "success": true,
  "data": { "shooter_id": 7, "squad_id": 2 }
}
```

效果：将该射手加入指定 Squad（等同于 `PUT /shooters/:id/squad` 的快捷方式）。

---

## 4. shooters 表改造 — squad_id 允许 NULL

当前 `shooters.squad_id` 是 `NOT NULL REFERENCES squads(id)`。

射手创建时可能还没编组，需要改为允许 NULL：

```sql
-- db.ts 迁移
-- SQLite 不支持 ALTER COLUMN，需要重建表
-- 或者在创建射手时给一个默认 squad_id

-- 方案 A（推荐）: 建表时 squad_id 就允许 NULL
CREATE TABLE IF NOT EXISTS shooters (
    ...
    squad_id INTEGER REFERENCES squads(id),   -- 去掉 NOT NULL
    ...
);

-- 方案 B（已有数据迁移）:
-- 1. 创建临时表（允许 NULL）
-- 2. 复制数据
-- 3. 删除旧表
-- 4. 重命名临时表
-- 见下方迁移代码
```

### 迁移代码（如果 shooters 表已存在且 squad_id 为 NOT NULL）

```typescript
// 检查 squad_id 是否允许 NULL
const shooterCols = db.prepare("PRAGMA table_info(shooters)").all() as Array<{
  name: string; notnull: number; type: string; dflt_value: string | null; pk: number
}>;
const squadCol = shooterCols.find(c => c.name === 'squad_id');

if (squadCol && squadCol.notnull === 1) {
  // squad_id 是 NOT NULL，需要迁移为允许 NULL
  db.exec(`
    CREATE TABLE shooters_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      division_id INTEGER NOT NULL REFERENCES divisions(id),
      squad_id INTEGER REFERENCES squads(id),
      name TEXT NOT NULL,
      bib_number TEXT NOT NULL,
      age INTEGER,
      gender TEXT,
      region TEXT,
      club TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO shooters_new SELECT * FROM shooters;
    DROP TABLE shooters;
    ALTER TABLE shooters_new RENAME TO shooters;
  `);
}
```

### CreateShooterSchema 调整

```typescript
export const CreateShooterSchema = z.object({
  division_id: z.number().int().positive(),
  squad_id: z.number().int().positive().optional(),   // 改为 optional
  name: z.string().min(1),
  bib_number: z.string().min(1),
  age: z.number().int().min(0).max(120).optional(),
  gender: z.enum(['male', 'female']).optional(),
  region: z.string().max(50).optional(),
  club: z.string().max(100).optional(),
});
```

### POST /shooters 调整

```typescript
// 创建射手时，squad_id 可选
const { division_id, squad_id, name, bib_number, age, gender, region, club } = parsed.data;
const result = db.prepare(
  `INSERT INTO shooters (match_id, division_id, squad_id, name, bib_number, age, gender, region, club)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
).run(matchId, division_id, squad_id ?? null, name, bib_number, age ?? null, gender ?? null, region ?? null, club ?? null);
```

---

## 5. 完整工作流

```
赛事创建
  ↓
导入/添加射手（squad_id 可为空）
  ↓
自动编组: POST /matches/:id/squads/auto-assign
  ├─ sort_by: registration / bib / division / random / region / club
  ├─ group_size: 10
  └─ strategy: sequential / snake / division_balanced
  ↓
查看结果: GET /matches/:id/squads/queue
  ↓
手动调整:
  ├─ 移动射手: PUT /shooters/:id/squad
  ├─ 批量移动: PUT /squads/:id/shooters/batch-move
  ├─ 移出射手: DELETE /squads/:id/shooters/:shooterId
  ├─ 加入射手: POST /squads/:id/shooters
  ├─ 删除射手: DELETE /shooters/:id
  └─ 重命名: PUT /squads/:id
  ↓
不满意？重新编组: POST /matches/:id/squads/auto-assign { clear_existing: true }
  ↓
确认编组 → 开始比赛
```

---

## 6. 验证步骤

```bash
cd /Volumes/SSD2/Projects/GCS/ipsc-backend
npm run build
npm run dev

# 1. 创建射手（不指定 squad_id）
for i in $(seq 1 25); do
  curl -s -X POST http://localhost:3001/api/v1/matches/1/shooters \
    -H 'Content-Type: application/json' \
    -d "{\"division_id\":1,\"name\":\"射手$i\",\"bib_number\":\"$i\",\"age\":$((20 + RANDOM % 40)),\"gender\":\"$([ $((RANDOM % 3)) -eq 0 ] && echo female || echo male)\"}"
done

# 2. 自动编组（报名顺序，10人一组，顺序切片）
curl -s -X POST http://localhost:3001/api/v1/matches/1/squads/auto-assign \
  -H 'Content-Type: application/json' \
  -d '{"sort_by":"registration","group_size":10,"strategy":"sequential"}' | python3 -m json.tool

# 3. 查看编组结果
curl -s http://localhost:3001/api/v1/matches/1/squads/queue | python3 -m json.tool

# 4. 移动射手到其他 Squad
curl -s -X PUT http://localhost:3001/api/v1/shooters/1/squad \
  -H 'Content-Type: application/json' \
  -d '{"squad_id":2}'

# 5. 蛇形编组（重新编组）
curl -s -X POST http://localhost:3001/api/v1/matches/1/squads/auto-assign \
  -H 'Content-Type: application/json' \
  -d '{"sort_by":"bib","group_size":10,"strategy":"snake","clear_existing":true}' | python3 -m json.tool

# 6. Division 均衡编组
curl -s -X POST http://localhost:3001/api/v1/matches/1/squads/auto-assign \
  -H 'Content-Type: application/json' \
  -d '{"sort_by":"division","group_size":8,"strategy":"division_balanced","clear_existing":true}' | python3 -m json.tool
```

---

## 7. 涉及文件清单

| 文件 | 改动 |
|------|------|
| `src/db.ts` | shooters.squad_id 改为允许 NULL + 迁移逻辑 |
| `src/types.ts` | CreateShooterSchema.squad_id 改为 optional；新增 Zod schema |
| `src/services/squading.ts` | **新建** — 自动编组核心算法 |
| `src/routes/squads.ts` | 新增 autoAssign、batchMove、removeShooter、addShooter |
| `src/index.ts` | 注册新路由 |

共 5 个文件（1 新建 + 4 修改）。
