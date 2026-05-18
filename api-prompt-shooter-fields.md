# 射手表结构变更 — Coding Prompt

## 背景

IPSC 赛事管理系统，后端 Node.js + Express + TypeScript + SQLite (better-sqlite3)。
现有 `shooters` 表字段：`id, match_id, division_id, squad_id, name, bib_number`。

## 变更需求

为射手（shooters）增加 4 个可选字段：**年龄、性别、区域、俱乐部**。

> **说明**: `bib_number` 就是射手号（BIB号），IPSC 赛事检录时分配的唯一号码，比赛全程佩戴。不需要改名，字段含义本身是对的。

## 1. 数据库变更 — `src/db.ts`

在 `shooters` 表 CREATE 语句中新增 4 列，放在 `bib_number` 之后：

```sql
CREATE TABLE IF NOT EXISTS shooters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    division_id INTEGER NOT NULL REFERENCES divisions(id),
    squad_id INTEGER NOT NULL REFERENCES squads(id),
    name TEXT NOT NULL,
    bib_number TEXT NOT NULL,
    age INTEGER,                -- 新增：年龄（整数）
    gender TEXT,                -- 新增：性别 'male'/'female'
    region TEXT,                -- 新增：区域/省份（如 "上海"、"广东"）
    club TEXT,                  -- 新增：俱乐部名称
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

⚠️ **注意**: 数据库文件已有数据，不能用 DROP + CREATE，必须用 ALTER TABLE 迁移。在 `db.exec(...)` 建表语句之后加：

```typescript
// Shooter 表字段迁移（幂等，重复执行不报错）
db.exec(`
  ALTER TABLE shooters ADD COLUMN age INTEGER;
`);
db.exec(`
  ALTER TABLE shooters ADD COLUMN gender TEXT;
`);
db.exec(`
  ALTER TABLE shooters ADD COLUMN region TEXT;
`);
db.exec(`
  ALTER TABLE shooters ADD COLUMN club TEXT;
`);
```

SQLite 的 ALTER TABLE ADD COLUMN 如果列已存在会报错，所以需要用 try/catch 包裹，或者先检查列是否存在：

```typescript
const shooterColumns = db.prepare("PRAGMA table_info(shooters)").all() as Array<{ name: string }>;
const existingCols = new Set(shooterColumns.map(c => c.name));

if (!existingCols.has('age')) {
  db.exec(`ALTER TABLE shooters ADD COLUMN age INTEGER`);
}
if (!existingCols.has('gender')) {
  db.exec(`ALTER TABLE shooters ADD COLUMN gender TEXT`);
}
if (!existingCols.has('region')) {
  db.exec(`ALTER TABLE shooters ADD COLUMN region TEXT`);
}
if (!existingCols.has('club')) {
  db.exec(`ALTER TABLE shooters ADD COLUMN club TEXT`);
}
```

## 2. Zod Schema 变更 — `src/types.ts`

### CreateShooterSchema

```typescript
export const CreateShooterSchema = z.object({
  division_id: z.number().int().positive(),
  squad_id: z.number().int().positive(),
  name: z.string().min(1),
  bib_number: z.string().min(1),
  age: z.number().int().min(0).max(120).optional(),           // 新增
  gender: z.enum(['male', 'female']).optional(),                // 新增
  region: z.string().max(50).optional(),                         // 新增
  club: z.string().max(100).optional(),                          // 新增
});
```

### UpdateShooterSchema

```typescript
export const UpdateShooterSchema = z.object({
  division_id: z.number().int().positive().optional(),
  squad_id: z.number().int().positive().optional(),
  name: z.string().min(1).optional(),
  bib_number: z.string().min(1).optional(),
  age: z.number().int().min(0).max(120).optional(),           // 新增
  gender: z.enum(['male', 'female']).optional(),                // 新增
  region: z.string().max(50).optional(),                         // 新增
  club: z.string().max(100).optional(),                          // 新增
});
```

### TypeScript 类型

无需手动改，`z.infer` 会自动推导。

## 3. 路由变更 — `src/routes/shooters.ts`

### POST /matches/:matchId/shooters

创建射手时，INSERT 语句加入新字段：

```typescript
const { division_id, squad_id, name, bib_number, age, gender, region, club } = parsed.data;
const result = db.prepare(
  `INSERT INTO shooters (match_id, division_id, squad_id, name, bib_number, age, gender, region, club)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
).run(matchId, division_id, squad_id, name, bib_number, age ?? null, gender ?? null, region ?? null, club ?? null);
```

### PUT /shooters/:id

更新射手时，加入新字段的可选更新：

```typescript
if (age !== undefined) { fields.push('age = ?'); values.push(age); }
if (gender !== undefined) { fields.push('gender = ?'); values.push(gender); }
if (region !== undefined) { fields.push('region = ?'); values.push(region); }
if (club !== undefined) { fields.push('club = ?'); values.push(club); }
```

### GET /matches/:matchId/shooters

查询时新字段会自动返回（因为是 `SELECT sh.*`），无需改动 SQL。

## 4. API 接口变化汇总

### POST /api/v1/matches/:matchId/shooters（创建射手）

新增可选字段：

```json
{
  "division_id": 1,
  "squad_id": 1,
  "name": "张三",
  "bib_number": "42",
  "age": 32,
  "gender": "male",
  "region": "上海",
  "club": "铳义堂"
}
```

### PUT /api/v1/shooters/:id（更新射手）

同上，所有新增字段可选：

```json
{
  "club": "华东射击俱乐部"
}
```

### GET 响应（自动包含新字段）

```json
{
  "success": true,
  "data": {
    "id": 1,
    "match_id": 1,
    "division_id": 1,
    "squad_id": 1,
    "name": "张三",
    "bib_number": "42",
    "age": 32,
    "gender": "male",
    "region": "上海",
    "club": "铳义堂"
  }
}
```

### FlexTarget 接口不受影响

`POST /api/v1/matches/:matchId/scores/flextarget` 仍然用 `shooter_bib` 匹配，不涉及新字段。

## 5. 验证步骤

```bash
cd /Volumes/SSD2/Projects/GCS/ipsc-backend
npm run build                    # TypeScript 编译通过
npm run dev                      # 启动后端

# 创建带新字段的射手
curl -X POST http://localhost:3001/api/v1/matches/1/shooters \
  -H 'Content-Type: application/json' \
  -d '{"division_id":1,"squad_id":1,"name":"张三","bib_number":"42","age":32,"gender":"male","region":"上海","club":"铳义堂"}'

# 查询验证新字段
curl http://localhost:3001/api/v1/matches/1/shooters | python3 -m json.tool

# 更新新字段
curl -X PUT http://localhost:3001/api/v1/shooters/1 \
  -H 'Content-Type: application/json' \
  -d '{"club":"华东射击俱乐部"}'

# FlexTarget 仍然正常工作
curl -X POST http://localhost:3001/api/v1/matches/1/scores/flextarget \
  -H 'Content-Type: application/json' \
  -d '{"shooter_bib":"42","stage_id":"1","total_time":12.35,"hits":{"A":8,"C":2,"D":0,"M":0,"N":0},"penalties":{"PE":0}}'
```

## 涉及文件清单

| 文件 | 改动 |
|------|------|
| `src/db.ts` | shooters 表加 4 列 + 迁移逻辑 |
| `src/types.ts` | CreateShooterSchema / UpdateShooterSchema 加 4 个可选字段 |
| `src/routes/shooters.ts` | POST INSERT 加字段、PUT 加字段更新 |

共 3 个文件，其余不需要改。
