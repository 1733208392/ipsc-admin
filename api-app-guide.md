# IPSC 赛事管理系统 — APP 端 API 对接文档

> 版本: v1 | 后端: http://localhost:3001 | 基础路径: `/api/v1`

---

## 接口 1：按 Squad 查看射手队列

单次请求拉取所有 Squad + 每个 Squad 的射手列表 + 完成进度。

### Request

```
GET /api/v1/matches/{matchId}/squads/queue
```

| 参数 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| matchId | path | number | ✅ | 赛事 ID |

### Response `200`

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

### 状态说明

| status 值 | 含义 | 触发条件 |
|-----------|------|----------|
| `waiting` | 未上场 | stages_done = 0 |
| `shooting` | 进行中 | 0 < stages_done < stages_total |
| `done` | 全部完成 | stages_done ≥ stages_total |

### 错误响应

| 状态码 | body | 场景 |
|--------|------|------|
| 404 | `{"success":false,"error":"Match not found"}` | matchId 不存在 |
| 500 | `{"success":false,"error":"..."}` | 服务端错误 |

---

## 接口 2：FlexTarget 上传成绩

FlexTarget 设备打完一个 Stage，实时推送该射手的命中数据。后端自动匹配射手、计算 Hit Factor、落库、更新积分榜。**一条龙全自动**。

### Request

```
POST /api/v1/matches/{matchId}/scores/flextarget
Content-Type: application/json
```

| 参数 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| matchId | path | number | ✅ | 赛事 ID |

### Request Body

```json
{
  "shooter_bib": "42",
  "stage_id": "1",
  "total_time": 12.35,
  "rows": [
    { "row_type": "steel", "row_no": 1, "A": 1, "C": 0, "D": 0, "M": 0, "N": 0 },
    { "row_type": "steel", "row_no": 2, "A": 0, "C": 1, "D": 0, "M": 0, "N": 0 },
    { "row_type": "paper", "row_no": 1, "A": 2, "C": 0, "D": 0, "M": 0, "N": 0 },
    { "row_type": "paper", "row_no": 2, "A": 1, "C": 1, "D": 0, "M": 0, "N": 0 }
  ],
  "hits": {
    "A": 4,
    "C": 2,
    "D": 0,
    "M": 0,
    "N": 0
  },
  "penalties": {
    "PE": 0
  },
  "first_shot": 1.23,
  "fastest_split": 0.18
}
```

### 字段详解

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `shooter_bib` | string | ✅ | 射手 bib 号，后端用此匹配射手 |
| `stage_id` | string/number | ✅ | Stage ID，必须是该赛事下的 Stage |
| `total_time` | number | ✅ | 总耗时（秒），精确到 0.01 |
| `rows` | array | ❌ | 按目标上传命中明细（推荐）。支持 `paper` 与 `steel` |
| `rows[].row_type` | string | rows模式必填 | `paper` / `steel` |
| `rows[].row_no` | number | rows模式必填 | 目标序号（从 1 开始） |
| `rows[].A/C/D/M/N` | number | rows模式必填 | 该目标的 A/C/D/M/N 数值；钢靶同样支持 A/C/D/M/N |
| `hits.A/C/D/M/N` | number | ❌ | 聚合命中数。未传 `rows` 时必填 |
| `penalties.PE` | number | ✅ | 程序性犯规扣分 |
| `first_shot` | number | ❌ | 首发射击时间（秒），可选 |
| `fastest_split` | number | ❌ | 最快连发间隔（秒），可选 |

> `rows` 与 `hits` 二选一即可；如果同时传，后端以 `rows` 自动汇总结果为准。

### Response `200`

```json
{
  "success": true,
  "data": {
    "score": {
      "id": 1,
      "match_id": 1,
      "shooter_id": 1,
      "stage_id": 1,
      "total_time": 12.35,
      "a_hits": 8,
      "c_hits": 2,
      "d_hits": 0,
      "m_hits": 0,
      "n_hits": 0,
      "pe": 0,
      "first_shot": 1.23,
      "fastest_split": 0.18,
      "total_points": 48,
      "hit_factor": 3.8866,
      "confirmed": 0,
      "created_at": "2026-05-17 06:26:19",
      "updated_at": "2026-05-17 06:26:19"
    },
    "totalPoints": 48,
    "hitFactor": 3.8866
  }
}
```

### 记分规则（后端自动计算）

| 区 | Minor PF | Major PF |
|----|----------|----------|
| A | 5 | 5 |
| C | 3 | 4 |
| D | 1 | 2 |

**公式**：`总得分 = 命中分 + 扣分`

- 命中分 = A×5 + C×(3或4) + D×(1或2)
- M 扣分 = M × 10
- N 扣分 = N × 10
- PE 扣分 = PE × 10
- **Hit Factor = 总得分 ÷ total_time**（保留 4 位小数）

> Example: `hits.A=8, C=2, power_factor=major`
> 命中分 = 8×5 + 2×4 = 48
> Hit Factor = 48 ÷ 12.35 = **3.8866**

### 重复上传 (UPSERT)

同一个射手 (`shooter_bib`) 在同一个 Stage 再次上传 → 自动**覆盖**之前成绩，不会重复插入。

### 错误响应

| 状态码 | body | 场景 |
|--------|------|------|
| 404 | `{"success":false,"error":"Match not found"}` | matchId 不存在 |
| 400 | `{"success":false,"error":"No shooter found with bib: XXX"}` | bib 号找不到对应射手 |
| 400 | `{"success":false,"error":"..."}` | 字段校验失败 |
| 500 | `{"success":false,"error":"..."}` | 服务端错误 |

---

## 接口 3：赛事列表（可选）

APP 首页可能需要列出所有赛事。

### Request

```
GET /api/v1/matches
```

### Response `200`

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "2026 上海IPSC公开赛",
      "date": "2026-06-15",
      "status": "active",
      "created_at": "2026-05-17 06:26:19"
    }
  ]
}
```

---

## 接口 4：积分榜（可选）

APP 可能需要展示实时排名。

### Request

```
GET /api/v1/matches/{matchId}/leaderboard
```

可选过滤: `?division_id=1` 只看某个组别。

### Response `200`

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "张三",
      "bib_number": "42",
      "division_name": "Open",
      "power_factor": "major",
      "stages_shot": 1,
      "total_points": 48,
      "avg_hit_factor": 3.8866
    }
  ]
}
```

---

## APP 端典型流程

```
1. GET /matches              → 显示赛事列表，选一个进入
2. GET /matches/:id            → 拿赛事详情（含 Stage 数）
3. GET /matches/:id/squads/queue → 展示 Squad × 射手矩阵
4. FlexTarget 打完一个 Stage:
   POST /matches/:id/scores/flextarget → 上传成绩
5. 再次 GET /matches/:id/squads/queue → 刷新队列进度
   或 GET /matches/:id/leaderboard     → 刷新积分榜
```

---

## 统一规则

- 所有成功响应: `{ "success": true, "data": ... }`
- 所有失败响应: `{ "success": false, "error": "错误描述" }`
- HTTP 状态码: 200/201=成功, 400=参数错误, 404=不存在, 500=服务端错误
- Content-Type: `application/json`
