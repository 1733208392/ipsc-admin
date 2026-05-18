# Squad 队列接口开发 Prompt

## 背景

IPSC 赛事管理系统，技术栈 Node.js + Express + TypeScript + SQLite (better-sqlite3)。
API 统一响应 `{ success: true, data: ... }` / `{ success: false, error: "..." }`，
工具函数 `ok()` / `fail()` 在 `src/types.ts`。

## 需求

新增 `GET /api/v1/matches/:matchId/squads/queue`

APP 端需要一个接口，一次性拉取某个赛事下**所有 Squad + 每个 Squad 的射手列表**，含完成进度状态，方便 APP 快速查找射手。

## 数据结构

已有表:
```sql
squads(id, match_id, name, sort_order)
shooters(id, match_id, squad_id, division_id, name, bib_number)
divisions(id, match_id, name, power_factor)
stages(id, match_id, name)     -- 用于统计总 Stage 数
scores(id, shooter_id, stage_id, ...)  -- 用于统计已完成 Stage 数
```

## 请求

```
GET /api/v1/matches/1/squads/queue
```

无 query 参数。

## 响应

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Squad A",
      "sort_order": 0,
      "shooter_count": 3,
      "stages_total": 5,
      "shooters": [
        {
          "id": 1,
          "name": "张三",
          "bib_number": "42",
          "division_name": "Open",
          "power_factor": "major",
          "stages_done": 2,
          "status": "shooting"
        },
        {
          "id": 2,
          "name": "李四",
          "bib_number": "88",
          "division_name": "原厂",
          "power_factor": "minor",
          "stages_done": 0,
          "status": "waiting"
        },
        {
          "id": 3,
          "name": "王五",
          "bib_number": "100",
          "division_name": "Open",
          "power_factor": "major",
          "stages_done": 5,
          "status": "done"
        }
      ]
    },
    {
      "id": 2,
      "name": "Squad B",
      "sort_order": 1,
      "shooter_count": 0,
      "stages_total": 5,
      "shooters": []
    }
  ]
}
```

## 字段说明

| 字段 | 来源 | 说明 |
|------|------|------|
| `shooter_count` | COUNT | 该 Squad 射手数 |
| `stages_total` | `SELECT COUNT(*) FROM stages WHERE match_id=?` | 赛事总 Stage 数 |
| `stages_done` | `COUNT(DISTINCT sc.stage_id)` | 该射手已完成几个 Stage |
| `status` | 计算 | `waiting`(0)/`shooting`(进行中)/`done`(全部完成) |
| `division_name` | JOIN divisions | 射手组别名称 |
| `power_factor` | JOIN divisions | Major/Minor |
| 射手排序 | `ORDER BY sh.bib_number` | bib 号升序 |

## 实现步骤

### 1. 在 `src/routes/squads.ts` 末尾新增导出函数

```typescript
// GET /matches/:matchId/squads/queue — Squads with nested shooter roster
export function getSquadQueue(req: Request, res: Response): void {
  const matchId = Number(req.params['matchId']);

  // 1. 验证赛事存在
  const match = db.prepare(`SELECT id FROM matches WHERE id = ?`).get(matchId);
  if (!match) {
    res.status(404).json(fail('Match not found'));
    return;
  }

  // 2. 查总 Stage 数
  const { c: totalStages } = db.prepare(
    `SELECT COUNT(*) AS c FROM stages WHERE match_id = ?`
  ).get(matchId) as { c: number };

  // 3. 查所有 Squad
  const squads = db.prepare(
    `SELECT id, name, sort_order FROM squads WHERE match_id = ? ORDER BY sort_order, id`
  ).all(matchId) as Array<{ id: number; name: string; sort_order: number }>;

  // 4. 每个 Squad 查射手列表
  const result = squads.map((squad) => {
    const shooters = db.prepare(`
      SELECT sh.id, sh.name, sh.bib_number,
             d.name AS division_name, d.power_factor,
             COUNT(DISTINCT sc.stage_id) AS stages_done
      FROM shooters sh
      JOIN divisions d ON sh.division_id = d.id
      LEFT JOIN scores sc ON sh.id = sc.shooter_id
      WHERE sh.squad_id = ?
      GROUP BY sh.id
      ORDER BY sh.bib_number
    `).all(squad.id);

    return {
      ...squad,
      shooter_count: shooters.length,
      stages_total: totalStages,
      shooters: shooters.map((s: any) => ({
        id: s.id,
        name: s.name,
        bib_number: s.bib_number,
        division_name: s.division_name,
        power_factor: s.power_factor,
        stages_done: s.stages_done,
        status: s.stages_done === 0
          ? 'waiting'
          : s.stages_done >= totalStages
            ? 'done'
            : 'shooting',
      })),
    };
  });

  res.json(ok(result));
}
```

### 2. 在 `src/index.ts` 注册路由

```typescript
// 导入处加 getSquadQueue
import squadsRouter, { updateSquad, deleteSquad, getSquadQueue } from './routes/squads.js';

// 路由注册 — 必须在 api.use('/matches/:matchId/squads', squadsRouter) 之前
api.get('/matches/:matchId/squads/queue', getSquadQueue);
```

⚠️ **注意**: `api.get(...)` 这行必须在 `api.use('/matches/:matchId/squads', squadsRouter)` **之前**，否则 Express 会把 `/queue` 当成 squad 嵌套路由处理，可能匹配不到。

### 3. 验证

```bash
# 先创建测试数据，然后：
curl http://localhost:3001/api/v1/matches/1/squads/queue | jq
```

## 注意事项

- 空 Squad 返回 `shooters: []`，不是 null
- `stages_total` 每个 Squad 一样（赛事级别），写在每个 Squad 对象里方便 APP 直接读
- 错误处理统一用 `try/catch` + `fail()`
