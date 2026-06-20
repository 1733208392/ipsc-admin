# GCS 个人训练功能 — Claude 提示词

> **项目**: GCS IPSC 射击赛事管理系统  
> **后端**: `ipsc-backend/` — Node.js + Express + TypeScript + better-sqlite3 + Zod  
> **前端**: `ipsc-admin/` — React + TypeScript + Vite + Tailwind CSS + shadcn/ui  
> **目标**: 在现有赛事管理系统基础上，增加"个人训练"功能模块，使个人用户可以创建自己的 Drill 配置模板、执行训练、保存训练记录。

---

## 一、需求概述

### 1.1 核心诉求

当前系统围绕"赛事（Match）→ Stage → Drill"组织数据，只有俱乐部管理员在赛事上下文中才能配置 Drill。现在需要让**个人用户**脱离赛事体系，独立使用 Drill 配置和训练功能：

- **配一组靶位 → 练 → 存记录**——不依赖任何 Match/Stage
- 每个注册用户自动拥有俱乐部权限（注册即创建个人俱乐部 + `club_admin` 角色）
- iOS 端训练完成后上传结果，关联到个人 Drill 模板

### 1.2 与现有功能的区别

| 维度 | 比赛模式（现有） | 个人训练（新增） |
|------|---------|---------|
| 入口 | 赛事管理 → Stage → Drill 配置 | 个人中心 → 我的训练 → Drill 配置 |
| 上下文 | 有 Match/Stage 约束 | 无约束，自由创建 |
| 模板归属 | 俱乐部/赛事 | 个人用户 |
| 训练记录关联 | 射手 + Stage | 用户本人 + Drill 模板 |
| 数据隔离 | 俱乐部内可见 | 仅本人可见 |
| 操作者 | 管理员配置，射手执行 | 同一人配置+执行 |

### 1.3 方案选型

采用**方案 B：扩展现有表，字段改为可空**，而非新建独立表。理由：
- 一套数据结构，API 可复用
- 个人模板后续可"升级"为赛事模板
- 减少代码重复

---

## 二、数据模型变更

### 2.1 `drill_templates` 表改造

**现有结构**（不要改动现有字段）:
```sql
CREATE TABLE IF NOT EXISTS drill_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    stage_id INTEGER NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    timeout INTEGER NOT NULL DEFAULT 1200,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**改造方式**: SQLite 不支持直接 ALTER COLUMN 改 NOT NULL 约束，需要通过迁移脚本重建表。

**迁移 SQL**（在 `db.ts` 中执行）:
```sql
-- 1. 创建新表
CREATE TABLE IF NOT EXISTS drill_templates_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
    stage_id INTEGER REFERENCES stages(id) ON DELETE CASCADE,
    owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    timeout INTEGER NOT NULL DEFAULT 1200,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (
        (match_id IS NOT NULL AND stage_id IS NOT NULL AND owner_user_id IS NULL) OR
        (match_id IS NULL AND stage_id IS NULL AND owner_user_id IS NOT NULL)
    )
);

-- 2. 迁移现有数据
INSERT INTO drill_templates_new (id, match_id, stage_id, owner_user_id, name, timeout, sort_order, created_at, updated_at)
SELECT id, match_id, stage_id, NULL, name, timeout, sort_order, created_at, updated_at FROM drill_templates;

-- 3. 删除旧表，重命名新表
DROP TABLE drill_templates;
ALTER TABLE drill_templates_new RENAME TO drill_templates;

-- 4. 重建索引
CREATE INDEX IF NOT EXISTS idx_drill_templates_stage ON drill_templates(stage_id);
CREATE INDEX IF NOT EXISTS idx_drill_templates_match ON drill_templates(match_id);
CREATE INDEX IF NOT EXISTS idx_drill_templates_owner ON drill_templates(owner_user_id);
```

**CHECK 约束说明**: 一条记录要么是赛事模板（match_id + stage_id 不为空，owner_user_id 为空），要么是个人模板（match_id + stage_id 为空，owner_user_id 不为空）。两者互斥。

### 2.2 `drill_replays` 表改造

**现有结构**:
```sql
CREATE TABLE IF NOT EXISTS drill_replays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    shooter_id INTEGER NOT NULL REFERENCES shooters(id) ON DELETE CASCADE,
    stage_id INTEGER NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
    drill_name TEXT,
    total_time REAL NOT NULL DEFAULT 0,
    num_shots INTEGER NOT NULL DEFAULT 0,
    score INTEGER,
    payload_json TEXT NOT NULL,
    client_drill_result_id TEXT,
    device_id TEXT,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**迁移 SQL**:
```sql
CREATE TABLE IF NOT EXISTS drill_replays_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
    shooter_id INTEGER REFERENCES shooters(id) ON DELETE CASCADE,
    stage_id INTEGER REFERENCES stages(id) ON DELETE CASCADE,
    owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    drill_template_id INTEGER REFERENCES drill_templates(id) ON DELETE SET NULL,
    drill_name TEXT,
    total_time REAL NOT NULL DEFAULT 0,
    num_shots INTEGER NOT NULL DEFAULT 0,
    score INTEGER,
    payload_json TEXT NOT NULL,
    client_drill_result_id TEXT,
    device_id TEXT,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (
        (match_id IS NOT NULL AND shooter_id IS NOT NULL AND stage_id IS NOT NULL AND owner_user_id IS NULL) OR
        (match_id IS NULL AND shooter_id IS NULL AND stage_id IS NULL AND owner_user_id IS NOT NULL)
    )
);

INSERT INTO drill_replays_new (id, match_id, shooter_id, stage_id, owner_user_id, drill_template_id, drill_name, total_time, num_shots, score, payload_json, client_drill_result_id, device_id, uploaded_by, created_at)
SELECT id, match_id, shooter_id, stage_id, NULL, NULL, drill_name, total_time, num_shots, score, payload_json, client_drill_result_id, device_id, uploaded_by, created_at FROM drill_replays;

DROP TABLE drill_replays;
ALTER TABLE drill_replays_new RENAME TO drill_replays;

CREATE INDEX IF NOT EXISTS idx_drill_replays_match ON drill_replays(match_id);
CREATE INDEX IF NOT EXISTS idx_drill_replays_shooter ON drill_replays(shooter_id);
CREATE INDEX IF NOT EXISTS idx_drill_replays_stage ON drill_replays(stage_id);
CREATE INDEX IF NOT EXISTS idx_drill_replays_owner ON drill_replays(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_drill_replays_template ON drill_replays(drill_template_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_drill_replays_client_uuid
    ON drill_replays(shooter_id, stage_id, client_drill_result_id)
    WHERE client_drill_result_id IS NOT NULL AND shooter_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_drill_replays_client_uuid_personal
    ON drill_replays(owner_user_id, client_drill_result_id)
    WHERE client_drill_result_id IS NOT NULL AND owner_user_id IS NOT NULL;
```

### 2.3 注册逻辑变更

在 `auth.ts` 中新增 `POST /auth/register` 接口。注册流程：

1. 接收 `username`、`password`、`name`、`phone`（可选）
2. 校验 username 不重复
3. 创建个人俱乐部:
   ```sql
   INSERT INTO clubs (name, short_name, contact_name, contact_phone, status, created_at, updated_at)
   VALUES (?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
   ```
   - `name`: `{用户姓名}的个人俱乐部`
   - `short_name`: `P_{username}`（P 代表 Personal）
   - `contact_name`: 用户姓名
   - `contact_phone`: 手机号
4. 创建用户，角色为 `club_admin`，关联刚创建的俱乐部:
   ```sql
   INSERT INTO users (username, password_hash, role, club_id, name, phone, status, created_at, updated_at)
   VALUES (?, ?, 'club_admin', ?, ?, ?, 'active', datetime('now'), datetime('now'))
   ```
5. 返回登录态（与 `/auth/login` 响应格式一致：token + user + refresh_token）

**Zod 校验**:
```typescript
export const RegisterSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, '用户名只能包含字母、数字、下划线'),
  password: z.string().min(6).max(50),
  name: z.string().min(1).max(50),
  phone: z.string().optional(),
});
```

**在 `clubs` 表增加字段标识个人俱乐部**（可选，用于后台管理区分）:
```sql
ALTER TABLE clubs ADD COLUMN is_personal INTEGER NOT NULL DEFAULT 0;
```

---

## 三、后端 API 设计

### 3.1 个人 Drill 模板 API

#### `GET /api/v1/my/drills` — 获取当前用户的个人 Drill 模板列表

**鉴权**: 必须登录，`club_admin` 或 `super_admin`  
**逻辑**: 查询 `drill_templates WHERE owner_user_id = req.user.id`  
**响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": 101,
      "match_id": null,
      "stage_id": null,
      "owner_user_id": 5,
      "name": "我的CQB训练",
      "timeout": 600,
      "sort_order": 0,
      "created_at": "2026-06-19 10:00:00",
      "updated_at": "2026-06-19 10:00:00",
      "targets_count": 4
    }
  ]
}
```

#### `POST /api/v1/my/drills` — 创建个人 Drill 模板

**请求体**（与现有 `CreateDrillTemplateWithTargetsSchema` 相同）:
```json
{
  "name": "我的CQB训练",
  "timeout": 600,
  "sort_order": 0,
  "targets": [
    {
      "seq_no": 1,
      "target_name": "Target 1",
      "target_type": "ipsc",
      "timeout": 0,
      "counted_shots": 2,
      "target_variant": null,
      "has_physical_popper": false
    }
  ]
}
```

**逻辑**: 插入 `drill_templates`，`owner_user_id = req.user.id`，`match_id = NULL`，`stage_id = NULL`  
**响应**: 201 + 完整模板详情（同 `/drills/:id` 格式）

#### `GET /api/v1/my/drills/:id` — 获取个人模板详情

**鉴权**: 必须是模板的 `owner_user_id`  
**响应**: 同 `/drills/:id`

#### `PUT /api/v1/my/drills/:id` — 更新个人模板基础信息

**鉴权**: 必须是模板的 `owner_user_id`  
**请求体**: 同 `UpdateDrillTemplateSchema`  
**响应**: 同 `/drills/:id`

#### `DELETE /api/v1/my/drills/:id` — 删除个人模板

**鉴权**: 必须是模板的 `owner_user_id`  
**级联删除** targets  
**响应**: `{ "success": true, "data": { "deleted": true } }`

#### `PUT /api/v1/my/drills/:id/targets` — 批量替换靶位

**鉴权**: 必须是模板的 `owner_user_id`  
**请求体**: 同 `ReplaceDrillTargetsSchema`  
**响应**: 同 `/drills/:id`

#### `GET /api/v1/my/drills/:id/export` — 导出为 iOS 同步格式

**鉴权**: 必须是模板的 `owner_user_id`  
**响应**: 同 `/drills/:id/export` 格式

### 3.2 个人训练记录 API

#### `POST /api/v1/my/drills/:drillId/replays` — 上传个人训练记录

**请求体**:
```json
{
  "total_time": 15.32,
  "num_shots": 12,
  "score": 95,
  "client_drill_result_id": "uuid-from-ios",
  "device_id": "iphone-xxx",
  "payload": {
    "shotData": [...],
    "targetResults": [...]
  }
}
```

**Zod Schema**:
```typescript
export const PersonalDrillReplayUploadSchema = z.object({
  total_time: z.number().min(0).optional().default(0),
  num_shots: z.number().int().min(0).optional().default(0),
  score: z.number().int().optional(),
  client_drill_result_id: z.string().min(1).optional(),
  device_id: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
});
```

**逻辑**:
1. 校验 `drillId` 存在且 `owner_user_id = req.user.id`
2. 如果 `client_drill_result_id` 已存在（同一用户下），执行 UPDATE 幂等逻辑
3. 否则 INSERT，`owner_user_id = req.user.id`，`drill_template_id = drillId`，`match_id/shooter_id/stage_id = NULL`
4. 返回完整 replay 记录

**响应**:
```json
{
  "success": true,
  "data": {
    "id": 501,
    "match_id": null,
    "shooter_id": null,
    "stage_id": null,
    "owner_user_id": 5,
    "drill_template_id": 101,
    "drill_name": "我的CQB训练",
    "total_time": 15.32,
    "num_shots": 12,
    "score": 95,
    "client_drill_result_id": "uuid-from-ios",
    "device_id": "iphone-xxx",
    "uploaded_by": 5,
    "created_at": "2026-06-19 11:00:00",
    "payload": { ... }
  }
}
```

#### `GET /api/v1/my/drills/:drillId/replays` — 列出该模板下的训练记录

**鉴权**: 必须是模板的 `owner_user_id`  
**查询参数**: `page`（默认 1）、`pageSize`（默认 20）  
**响应**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 501,
        "drill_template_id": 101,
        "total_time": 15.32,
        "num_shots": 12,
        "score": 95,
        "created_at": "2026-06-19 11:00:00"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20
  }
}
```

#### `GET /api/v1/my/replays/:id` — 获取训练记录详情

**鉴权**: 必须是记录的 `owner_user_id`  
**响应**: 完整 replay 记录（含 payload）

#### `DELETE /api/v1/my/replays/:id` — 删除训练记录

**鉴权**: 必须是记录的 `owner_user_id`  
**响应**: `{ "success": true, "data": { "id": 501 } }`

#### `GET /api/v1/my/replays` — 列出我的所有训练记录（跨模板）

**鉴权**: 当前用户  
**查询参数**: `drill_template_id`（可选过滤）、`page`、`pageSize`  
**响应**: 分页列表，每条包含 `drill_template_id`、`drill_name`、`total_time`、`num_shots`、`score`、`created_at`

#### `GET /api/v1/my/replays/stats` — 训练统计

**鉴权**: 当前用户  
**查询参数**: `days`（默认 30，统计最近 N 天）  
**响应**:
```json
{
  "success": true,
  "data": {
    "total_replays": 42,
    "total_shots": 504,
    "avg_time": 14.5,
    "best_time": 10.2,
    "avg_score": 88.5,
    "by_drill": [
      {
        "drill_template_id": 101,
        "drill_name": "我的CQB训练",
        "replay_count": 25,
        "avg_time": 13.2,
        "best_time": 10.2,
        "avg_score": 90
      }
    ],
    "by_day": [
      { "date": "2026-06-19", "count": 3, "avg_time": 14.1 },
      { "date": "2026-06-18", "count": 2, "avg_time": 15.5 }
    ]
  }
}
```

### 3.3 注册 API

#### `POST /api/v1/auth/register` — 用户注册

**请求体**:
```json
{
  "username": "shooter_zhang",
  "password": "myPassword123",
  "name": "张三",
  "phone": "13800138000"
}
```

**逻辑**:
1. 校验 username 不重复
2. 事务中创建个人俱乐部（`is_personal = 1`）+ 用户（`club_admin`）
3. 返回登录态

**响应**（与 `/auth/login` 一致）:
```json
{
  "success": true,
  "data": {
    "token": "eyJ...",
    "access_token": "eyJ...",
    "refresh_token": "eyJ...",
    "expires_in": 86400,
    "user": {
      "id": 10,
      "username": "shooter_zhang",
      "role": "club_admin",
      "club_id": 8,
      "name": "张三",
      "phone": "13800138000",
      "status": "active"
    }
  }
}
```

---

## 四、后端实现要求

### 4.1 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/db.ts` | 修改 | 迁移 `drill_templates` 和 `drill_replays` 表；`clubs` 表增加 `is_personal` 列 |
| `src/types.ts` | 修改 | 追加 `RegisterSchema`、`PersonalDrillReplayUploadSchema` 及相关类型 |
| `src/routes/auth.ts` | 修改 | 新增 `POST /register` 路由 |
| `src/routes/my-drills.ts` | **新增** | 个人 Drill 模板 CRUD + export |
| `src/routes/my-replays.ts` | **新增** | 个人训练记录 CRUD + stats |
| `src/index.ts` | 修改 | 注册新路由 `api.use('/my', ...)` |

### 4.2 鉴权规则

- `/my/*` 路由全部需要 `authMiddleware`
- 所有操作通过 `req.user.id` 过滤数据，确保用户只能访问自己的数据
- 不需要 `requireRole` 中间件——任何已登录用户都可以使用个人训练功能
- `super_admin` 也可以有个人模板，通过 `/my/*` 访问

### 4.3 代码风格

- 严格遵循现有代码风格（参考 `drills.ts`, `drill-replays.ts`）
- 使用 `ok()` / `fail()` 响应工具函数
- Zod 校验在路由入口
- SQL 使用 prepared statements
- try-catch 错误处理
- 个人模板的 `target_type` / `target_variant` 存储逻辑与赛事模板完全一致（复用 `normalizeTargetTypes` 等函数）

### 4.4 迁移安全

- 迁移在 `db.ts` 初始化时执行，使用 `try-catch` 包裹，检测旧表是否存在再迁移
- 迁移必须幂等：如果新表已存在或字段已存在，不报错
- 迁移后自动验证数据行数一致

```typescript
// db.ts 中的迁移逻辑示例
function migrateDrillTables() {
  // 检查是否已迁移（drill_templates 是否有 owner_user_id 列）
  const columns = db.prepare(`PRAGMA table_info(drill_templates)`).all() as { name: string }[];
  const hasOwnerUserId = columns.some(c => c.name === 'owner_user_id');
  
  if (!hasOwnerUserId) {
    // 执行迁移
    db.exec(`
      CREATE TABLE IF NOT EXISTS drill_templates_new (...);
      INSERT INTO drill_templates_new ...;
      DROP TABLE drill_templates;
      ALTER TABLE drill_templates_new RENAME TO drill_templates;
      CREATE INDEX ...;
    `);
  }
}
```

---

## 五、前端实现要求

### 5.1 注册页面

**文件**: `ipsc-admin/src/pages/RegisterPage.tsx`（新增）  
**路由**: `/register`（公开，不需要登录）

**内容**:
- 复用 LoginPage 的 Card 布局风格
- 表单字段: 用户名、密码、姓名、手机号（可选）
- "注册" 按钮 → 调用 `POST /auth/register`
- 注册成功后自动登录，跳转到首页
- "已有账号？去登录" 链接到 `/login`
- 在 LoginPage 增加 "没有账号？去注册" 链接到 `/register`

### 5.2 个人训练模块入口

**在 AppSidebar 中增加导航项**（所有已登录用户可见）:

```tsx
// 在赛事列表下方，或作为独立分区
<NavLink to="/my/training" className={navLinkClass}>
  <Dumbbell className="h-4 w-4" />
  {!collapsed ? '个人训练' : null}
</NavLink>
<NavLink to="/my/replays" className={navLinkClass}>
  <History className="h-4 w-4" />
  {!collapsed ? '训练记录' : null}
</NavLink>
```

### 5.3 个人 Drill 模板列表页

**文件**: `ipsc-admin/src/pages/my/MyDrillListPage.tsx`（新增）  
**路由**: `/my/drills`

**内容**:
- 顶部: "我的训练模板" 标题 + "新建模板" 按钮
- 卡片列表: 展示当前用户的个人模板
  - 每张卡片: 模板名称、靶位数、超时时间、最后训练时间、训练次数
  - 操作: 编辑、复制、删除（确认弹窗）、导出（显示 JSON + 复制按钮）
  - 点击卡片进入编辑页
  - "开始训练" 按钮（显示 export JSON 供 iOS 拉取，或显示二维码）
- 空状态: "还没有训练模板，点击新建开始配置你的第一个 Drill"

### 5.4 个人 Drill 模板编辑页

**文件**: `ipsc-admin/src/pages/my/MyDrillEditPage.tsx`（新增）  
**路由**: `/my/drills/:drillId`（新建时 drillId 为 `new`）

**布局**: 复用现有 `DrillTemplateEditPage` 的布局和组件

**与赛事编辑页的区别**:
- 没有 Match/Stage 上下文
- 保存调用 `/my/drills` 而非 `/matches/:matchId/stages/:stageId/drills`
- 页面标题为"编辑训练模板"而非"Drill 配置"

**复用组件**:
- `TargetEditCard`（如果已存在）——直接复用
- target_type 多选组件——直接复用
- target_variant 时间输入——直接复用

### 5.5 训练记录列表页

**文件**: `ipsc-admin/src/pages/my/MyReplaysPage.tsx`（新增）  
**路由**: `/my/replays`

**内容**:
- 顶部: "训练记录" 标题 + 统计概览卡片（总次数、总弹数、平均时间、最佳时间）
- 筛选: 按 Drill 模板筛选（下拉）
- 列表: 按时间倒序展示训练记录
  - 每条: 模板名称、用时、弹数、得分、日期时间
  - 点击查看详情
- 分页

### 5.6 训练记录详情页

**文件**: `ipsc-admin/src/pages/my/MyReplayDetailPage.tsx`（新增）  
**路由**: `/my/replays/:id`

**内容**:
- 复用现有 `DrillReplayDetailPage` 的回放渲染逻辑
- 顶部显示: 模板名称、用时、弹数、得分、日期
- 回放区域: 渲染 payload 中的弹道数据
- 删除按钮

### 5.7 训练统计页（可选，P2）

**文件**: `ipsc-admin/src/pages/my/MyTrainingStatsPage.tsx`（新增）  
**路由**: `/my/training`

**内容**:
- 时间范围选择器（7天/30天/90天/全部）
- 统计卡片: 总训练次数、总弹数、平均用时、最佳用时
- 按 Drill 模板的统计表
- 按日期的训练频率图（简单的柱状图，用 div 模拟即可，不引入图表库）

### 5.8 前端文件结构

```
ipsc-admin/src/
├── pages/
│   ├── RegisterPage.tsx              ← 新增
│   └── my/
│       ├── MyDrillListPage.tsx       ← 新增
│       ├── MyDrillEditPage.tsx       ← 新增
│       ├── MyReplaysPage.tsx         ← 新增
│       ├── MyReplayDetailPage.tsx    ← 新增
│       └── MyTrainingStatsPage.tsx   ← 新增（P2）
├── components/
│   └── my/
│       └── DrillExportDialog.tsx     ← 新增，导出 JSON/二维码对话框
├── hooks/
│   └── useAuth.tsx                   ← 修改，增加 register 方法
└── types/
    └── my.ts                         ← 新增，个人训练相关类型
```

### 5.9 路由注册

在 `App.tsx` 中新增:

```tsx
<Route path="/register" element={<RegisterPage />} />
// 在 RequireAuth 内:
<Route path="/my/drills" element={<MyDrillListPage />} />
<Route path="/my/drills/:drillId" element={<MyDrillEditPage />} />
<Route path="/my/replays" element={<MyReplaysPage />} />
<Route path="/my/replays/:id" element={<MyReplayDetailPage />} />
<Route path="/my/training" element={<MyTrainingStatsPage />} />
```

### 5.10 前端类型定义

```typescript
// types/my.ts

export interface PersonalDrillTemplate {
  id: number;
  match_id: null;
  stage_id: null;
  owner_user_id: number;
  name: string;
  timeout: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  targets_count?: number;
  last_replay_at?: string | null;
  replay_count?: number;
}

export interface PersonalDrillTarget {
  id: number;
  template_id: number;
  seq_no: number;
  target_name: string;
  target_type: string[];
  timeout: number;
  counted_shots: number;
  target_variant: string[] | null;
  has_physical_popper: boolean;
  sort_order: number;
}

export interface PersonalDrillTemplateDetail extends PersonalDrillTemplate {
  targets: PersonalDrillTarget[];
}

export interface PersonalReplaySummary {
  id: number;
  drill_template_id: number;
  drill_name: string | null;
  total_time: number;
  num_shots: number;
  score: number | null;
  created_at: string;
}

export interface PersonalReplayDetail extends PersonalReplaySummary {
  owner_user_id: number;
  client_drill_result_id: string | null;
  device_id: string | null;
  uploaded_by: number | null;
  payload: unknown;
}

export interface TrainingStats {
  total_replays: number;
  total_shots: number;
  avg_time: number;
  best_time: number;
  avg_score: number;
  by_drill: Array<{
    drill_template_id: number;
    drill_name: string;
    replay_count: number;
    avg_time: number;
    best_time: number;
    avg_score: number;
  }>;
  by_day: Array<{
    date: string;
    count: number;
    avg_time: number;
  }>;
}
```

---

## 六、iOS 同步协议

### 6.1 拉取个人 Drill 配置

```
GET /api/v1/my/drills/:id/export
Authorization: Bearer <token>
```

iOS 端用户登录后，调用此接口获取个人模板。响应格式与赛事模板 export 完全一致（camelCase + targetType 单类型发 String / 多类型发 Array）。

### 6.2 上传训练记录

```
POST /api/v1/my/drills/:drillId/replays
Authorization: Bearer <token>
Content-Type: application/json

{
  "total_time": 15.32,
  "num_shots": 12,
  "score": 95,
  "client_drill_result_id": "uuid-from-ios",
  "device_id": "iphone-xxx",
  "payload": { ... }
}
```

- `client_drill_result_id` 用于幂等去重（同一用户同一 client_drill_result_id 不重复创建）
- `payload` 为自由格式 JSON，包含完整的弹道数据，后端原样存储

### 6.3 iOS 端鉴权

- iOS 端使用 `/auth/login` 或 `/auth/register` 获取 JWT token
- 所有 `/my/*` 请求携带 `Authorization: Bearer <token>`
- token 过期后使用 refresh_token 刷新

---

## 七、关键约束

1. **数据隔离**: 个人模板和训练记录只能被 `owner_user_id` 对应的用户访问。任何 `/my/*` 接口都必须校验 `req.user.id === resource.owner_user_id`。
2. **CHECK 约束**: `drill_templates` 和 `drill_replays` 的 CHECK 约束确保赛事数据和个人数据互斥——不能同时有 match_id 和 owner_user_id。
3. **幂等上传**: `client_drill_result_id` 在同一用户下唯一，重复上传执行 UPDATE 而非 INSERT。
4. **迁移安全**: 表迁移必须幂等，已迁移的数据库不重复执行。
5. **注册即俱乐部**: 每个新用户自动创建 `is_personal = 1` 的个人俱乐部 + `club_admin` 角色。个人俱乐部不允许创建赛事（前端不显示赛事创建入口，后端可后续加校验）。
6. **现有赛事功能不受影响**: 所有现有 `/matches/*` 和 `/drills/*` 接口保持不变，`/my/*` 是新增的独立路由组。

---

## 八、Non-Goals（V1 不做的事）

- ❌ 不做个人模板到赛事模板的"升级"功能
- ❌ 不做个人俱乐部之间的数据共享或社交功能
- ❌ 不做训练记录的分享功能（生成链接/图片分享）
- ❌ 不做 WebSocket 实时推送
- ❌ 不做训练数据的 AI 分析/建议
- ❌ 不做个人俱乐部的管理页面（个人俱乐部通过 `is_personal` 标记，在超管后台可与普通俱乐部区分显示，但 V1 不做额外管理功能）
- ❌ 不做手机号验证码注册/登录（V1 用户名+密码即可）

---

## 九、实施顺序

1. **后端迁移 + 注册接口** — `db.ts` 表迁移 + `POST /auth/register`
2. **后端个人模板 API** — `/my/drills/*` 全套 CRUD + export
3. **后端个人训练记录 API** — `/my/replays/*` + stats
4. **前端注册页面** — `RegisterPage.tsx`
5. **前端个人模板页面** — `MyDrillListPage` + `MyDrillEditPage`（复用现有靶位编辑组件）
6. **前端训练记录页面** — `MyReplaysPage` + `MyReplayDetailPage`
7. **前端统计页面**（P2）— `MyTrainingStatsPage`
