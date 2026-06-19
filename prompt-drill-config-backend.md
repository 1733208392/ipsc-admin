# GCS Drill 配置后台化 — Codex 提示词

> **项目**: GCS IPSC 射击赛事管理系统  
> **后端技术栈**: Node.js + Express + TypeScript + better-sqlite3 + Zod  
> **前端技术栈**: React + TypeScript + Vite + Tailwind CSS  
> **代码仓库路径**: `/Volumes/SSD2/Projects/GCS`  
>   - 后端: `ipsc-backend/`  
>   - 前端管理后台: `ipsc-admin/`  
> **V1 同步方式**: iOS 主动拉取 (GET export)

---

## 一、需求背景

当前 IPSC 射击训练 APP 中的 Drill（训练流程）配置数据（`DrillTargetsConfigData`）完全存储在 iOS 原生 CoreData 中，包含靶位数量、类型、时间窗口、变体等关键参数。每次训练都需要在手机上手动配置，无法在 Web 后台统一管理、复用和预配置。

**目标**: 在 Web 后台实现 Drill 模板管理，管理员可以为每个 Stage 创建/编辑多个 Drill 配置模板，iOS 端通过 API 拉取配置后写入 CoreData 执行。

---

## 二、数据模型

### 2.1 新增表: `drill_templates`

Drill 模板，挂在 Stage 下。一个 Stage 允许多个 Drill 模板。

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

CREATE INDEX IF NOT EXISTS idx_drill_templates_stage ON drill_templates(stage_id);
CREATE INDEX IF NOT EXISTS idx_drill_templates_match ON drill_templates(match_id);
```

### 2.2 新增表: `drill_template_targets`

Drill 模板下的靶位列表，字段与 iOS CoreData `DrillTargetsConfigData` 对齐。

```sql
CREATE TABLE IF NOT EXISTS drill_template_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES drill_templates(id) ON DELETE CASCADE,
    seq_no INTEGER NOT NULL,
    target_name TEXT NOT NULL DEFAULT '',
    target_type TEXT NOT NULL DEFAULT '[]',
    timeout INTEGER NOT NULL DEFAULT 0,
    counted_shots INTEGER NOT NULL DEFAULT 0,
    target_variant TEXT,
    has_physical_popper INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_drill_targets_template ON drill_template_targets(template_id);
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `target_type` | TEXT (JSON 数组字符串) | 目标类型，如 `["ipsc"]` 或 `["cqb_hostage","cqb_enemy_front"]`。见下方枚举。 |
| `target_variant` | TEXT (JSON 数组字符串, nullable) | 时间边界数组，按 `target_type` 顺序解释。如 `["0.5","10"]` 表示第一个类型 `[0, 0.5)`，第二个类型 `[0.5, 10)`。NULL 表示无变体。 |
| `has_physical_popper` | INTEGER (0/1) | 是否有物理 popper 靶 |
| `timeout` | INTEGER | 预留字段，当前运行时不生效（统一用 Drill 级 1200 秒） |
| `counted_shots` | INTEGER | 计分靶数 |

### target_type 枚举值

**IPSC 模式**: `ipsc`, `ipsc_mini_double`, `hostage`, `paddle`, `popper`, `special_1`, `special_2`  
**IDPA 模式** (保留分支): `idpa`, `idpa_ns`, `idpa_black_1`, `idpa_black_2`  
**CQB 模式**: `cqb_swing`, `cqb_front`, `cqb_move`, `disguised_enemy`, `cqb_hostage`

---

## 三、后端 API 设计

### 路由挂载

在 `src/index.ts` 中注册: `/api/v1/drills`

实际路由:
- `/api/v1/matches/:matchId/stages/:stageId/drills` — 列表 & 创建
- `/api/v1/drills/:id` — 单个模板 CRUD
- `/api/v1/drills/:id/targets` — 靶位批量替换
- `/api/v1/drills/:id/export` — 导出为 iOS 同步格式

### 3.1 Zod Schema

```typescript
// target_type 校验
const VALID_TARGET_TYPES = [
  'ipsc', 'ipsc_mini_double', 'hostage', 'paddle', 'popper', 'special_1', 'special_2',
  'idpa', 'idpa_ns', 'idpa_black_1', 'idpa_black_2',
  'cqb_swing', 'cqb_front', 'cqb_move', 'disguised_enemy', 'cqb_hostage',
] as const;

const TargetTypeSchema = z.union([
  z.array(z.enum(VALID_TARGET_TYPES)).min(1),
  z.enum(VALID_TARGET_TYPES),
]);

// target_variant 校验
const TargetVariantSchema = z.union([
  z.array(z.string()).optional(),
  z.null().optional(),
]).optional();

// Create
export const CreateDrillTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  timeout: z.number().int().min(1).max(9999).optional().default(1200),
  sort_order: z.number().int().optional().default(0),
});

export const CreateDrillTargetSchema = z.object({
  seq_no: z.number().int().min(0),
  target_name: z.string().max(100),
  target_type: TargetTypeSchema,
  timeout: z.number().int().min(0).optional().default(0),
  counted_shots: z.number().int().min(0).optional().default(0),
  target_variant: TargetVariantSchema,
  has_physical_popper: z.boolean().optional().default(false),
  sort_order: z.number().int().optional().default(0),
});

export const CreateDrillTemplateWithTargetsSchema = z.object({
  name: z.string().min(1).max(100),
  timeout: z.number().int().min(1).max(9999).optional().default(1200),
  sort_order: z.number().int().optional().default(0),
  targets: z.array(CreateDrillTargetSchema).min(1),
});

// Update
export const UpdateDrillTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  timeout: z.number().int().min(1).max(9999).optional(),
  sort_order: z.number().int().optional(),
});
```

### 3.2 API 端点详细规格

#### POST `/matches/:matchId/stages/:stageId/drills` — 创建 Drill 模板

请求体 (CreateDrillTemplateWithTargetsSchema):
```json
{
  "name": "Stage1-标准IPSC",
  "timeout": 1200,
  "sort_order": 0,
  "targets": [
    {
      "seq_no": 1,
      "target_name": "Paper A",
      "target_type": "ipsc",
      "timeout": 0,
      "counted_shots": 2,
      "target_variant": null,
      "has_physical_popper": false
    },
    {
      "seq_no": 2,
      "target_name": "Hostage",
      "target_type": ["cqb_hostage", "cqb_enemy_front"],
      "timeout": 0,
      "counted_shots": 3,
      "target_variant": ["0.5", "10"],
      "has_physical_popper": false
    }
  ]
}
```

响应 (201):
```json
{
  "ok": true,
  "data": {
    "id": 1,
    "match_id": 1,
    "stage_id": 1,
    "name": "Stage1-标准IPSC",
    "timeout": 1200,
    "sort_order": 0,
    "created_at": "2026-06-18 10:00:00",
    "updated_at": "2026-06-18 10:00:00",
    "targets": [
      {
        "id": 1,
        "template_id": 1,
        "seq_no": 1,
        "target_name": "Paper A",
        "target_type": "ipsc",
        "timeout": 0,
        "counted_shots": 2,
        "target_variant": null,
        "has_physical_popper": 0
      },
      {
        "id": 2,
        "template_id": 1,
        "seq_no": 2,
        "target_name": "Hostage",
        "target_type": "[\"cqb_hostage\",\"cqb_enemy_front\"]",
        "timeout": 0,
        "counted_shots": 3,
        "target_variant": "[\"0.5\",\"10\"]",
        "has_physical_popper": 0
      }
    ]
  }
}
```

**校验规则**:
- matchId 和 stageId 必须存在，stage 必须属于该 match
- targets 至少 1 个
- target_type 如果是数组，所有元素必须是合法枚举值
- target_variant 如果非 null，长度必须与 target_type 数组长度一致（单类型时 variant 应为 null）

---

#### GET `/matches/:matchId/stages/:stageId/drills` — 列出 Stage 下所有模板

查询参数: 无  
响应 (200):
```json
{
  "ok": true,
  "data": [
    {
      "id": 1,
      "match_id": 1,
      "stage_id": 1,
      "name": "Stage1-标准IPSC",
      "timeout": 1200,
      "sort_order": 0,
      "created_at": "2026-06-18 10:00:00",
      "updated_at": "2026-06-18 10:00:00",
      "targets_count": 5
    }
  ]
}
```

**注意**: 列表接口只返回 `targets_count`，不返回完整 targets 数组（性能考虑）。获取详情用单独接口。

---

#### GET `/drills/:id` — 获取模板详情（含 targets）

响应 (200):
```json
{
  "ok": true,
  "data": {
    "id": 1,
    "match_id": 1,
    "stage_id": 1,
    "name": "Stage1-标准IPSC",
    "timeout": 1200,
    "sort_order": 0,
    "created_at": "2026-06-18 10:00:00",
    "updated_at": "2026-06-18 10:00:00",
    "targets": [
      {
        "id": 1,
        "template_id": 1,
        "seq_no": 1,
        "target_name": "Paper A",
        "target_type": "ipsc",
        "timeout": 0,
        "counted_shots": 2,
        "target_variant": null,
        "has_physical_popper": 0
      }
    ]
  }
}
```

**注意**: `target_type` 和 `target_variant` 在详情接口中自动解析 JSON 字符串为数组返回给前端。列表接口（drills_count）不解析。

---

#### PUT `/drills/:id` — 更新模板基础信息

请求体 (UpdateDrillTemplateSchema):
```json
{
  "name": "Stage1-修改后名称",
  "timeout": 600
}
```

响应 (200): 同 GET 详情格式。

---

#### DELETE `/drills/:id` — 删除模板

级联删除所有 targets。  
响应 (200):
```json
{
  "ok": true,
  "data": { "deleted": true }
}
```

---

#### PUT `/drills/:id/targets` — 批量替换 targets

请求体:
```json
{
  "targets": [
    {
      "seq_no": 1,
      "target_name": "Paper A",
      "target_type": "ipsc",
      "timeout": 0,
      "counted_shots": 2,
      "target_variant": null,
      "has_physical_popper": false
    }
  ]
}
```

**逻辑**: 先删除该 template 下所有现有 targets，再批量插入新 targets。事务操作。  
响应 (200): 同 GET 详情格式（返回更新后的完整模板+targets）。

---

#### GET `/drills/:id/export` — 导出为 iOS 同步格式

这是 iOS 端拉取的接口。输出格式与 iOS CoreData `DrillTargetsConfigData` 完全对齐。

响应 (200):
```json
{
  "ok": true,
  "data": {
    "drillId": 1,
    "name": "Stage1-标准IPSC",
    "timeout": 1200,
    "targets": [
      {
        "id": "drill_target_1",
        "seqNo": 1,
        "targetName": "Paper A",
        "targetType": "ipsc",
        "timeout": 0,
        "countedShots": 2,
        "targetVariant": null,
        "hasPhysicalPopper": false
      }
    ]
  }
}
```

**关键差异**:
- 字段名从 snake_case 转为 camelCase（对齐 iOS Swift 命名）
- `id` 使用 `drill_target_{db_id}` 格式的字符串（iOS 端使用 String 类型 UUID）
- `targetType`: 数据库存 JSON 数组字符串，单类型时 export 发 String（`"ipsc"`），多类型时发 Array
- `targetVariant`: null 时发 null，数组时发 Array
- `hasPhysicalPopper`: 0/1 转 false/true

---

## 四、后端实现要求

### 4.1 代码风格

- 严格遵循现有代码风格（参考 `stages.ts`, `matches.ts`）
- 使用 `ok()` / `fail()` 响应工具函数（从 `../types.js` 导入）
- Zod 校验在路由入口处理，校验失败返回 400 + fail(error.message)
- SQL 使用 prepared statements，禁止拼接
- 所有数据库操作在 try-catch 中，错误返回 500

### 4.2 target_type 存储约定

- 入库时统一转为 JSON 数组字符串: `"ipsc"` → `"\"ipsc\""`，`["ipsc","paddle"]` → `"[\"ipsc\",\"paddle\"]"` → 实际存 `["ipsc","paddle"]`
- **推荐**: 统一存 JSON 数组格式，单类型存 `["ipsc"]`，多类型存 `["cqb_hostage","cqb_enemy_front"]`
- 出库时（GET 详情 / export）自动 JSON.parse

### 4.3 target_variant 校验

- 如果 target_type 是单类型（数组长度 1），target_variant 应为 null
- 如果 target_type 是多类型，target_variant 应为数组且长度 = target_type 长度 - 1（每个变体是"从此时间开始"，最后一个类型到 timeout 结束）
- 如果 target_variant 不为 null，每个元素必须是可解析为正数的字符串

### 4.4 文件结构

```
ipsc-backend/src/
├── types.ts          ← 追加 Drill 相关 Zod Schema
├── db.ts             ← 追加 drill_templates + drill_template_targets 建表
├── routes/
│   └── drills.ts     ← 新增，所有 Drill 路由
└── index.ts          ← 注册 drills 路由
```

---

## 五、前端管理页面

### 5.1 入口

在 `StagesPage.tsx` 中，每个 Stage 行增加「Drill 配置」按钮（或 Icon），点击导航到 `/matches/:matchId/stages/:stageId/drills`。

### 5.2 DrillTemplateListPage — 模板列表页

**路由**: `/matches/:matchId/stages/:stageId/drills`

**内容**:
- 顶部: Stage 名称 +「新建 Drill」按钮
- 列表: 卡片形式展示该 Stage 下所有 Drill 模板
  - 每个卡片显示: 模板名称、靶位数、超时时间、创建时间
  - 操作按钮: 编辑、复制、删除（确认弹窗）
- 空状态: 提示文案 + 新建按钮

### 5.3 DrillTemplateEditPage — 模板编辑页

**路由**: `/matches/:matchId/stages/:stageId/drills/:drillId` (新建时 drillId 为 `new`)

**布局**: 左右两栏（桌面端），单栏（移动端）

**左栏 — 基础信息**:
- 模板名称（输入框，必填，max 100）
- 超时时间（数字输入，秒，默认 1200，范围 1-9999）

**右栏 — 靶位配置**:
- 「添加靶位」按钮
- 靶位列表（可拖拽排序，使用简单的上移/下移按钮即可）
- 每个靶位卡片可展开/折叠编辑:
  - `target_name`: 靶位名称（输入框）
  - `target_type`: 目标类型（下拉多选，使用 checkbox 组或 multi-select）
    - 按 IPSC / IDPA / CQB 三组展示选项
  - `counted_shots`: 计分靶数（数字输入，默认 0）
  - `has_physical_popper`: 是否物理 popper（开关）
  - `target_variant`: 时间变体（仅当 target_type 为多选时显示）
    - 根据 target_type 数量动态生成时间输入框
    - 每个输入框标注"从此时间(秒)开始切换为: [类型名]"
    - 例: target_type=["cqb_hostage", "cqb_enemy_front"]
      - 输入框1: "0.5 秒后切换为 cqb_enemy_front"
- 删除靶位按钮（红色，确认弹窗）

**底部操作栏**:
- 取消（返回列表）
- 保存（POST 创建 / PUT 更新）

### 5.4 样式要求

- 遵循现有 Tailwind CSS 风格（参考 StagesPage.tsx, ShootersPage.tsx）
- 暗色/亮色模式不做要求（V1 跟随默认）
- 卡片间距、按钮风格、输入框风格与现有页面一致

### 5.5 文件结构

```
ipsc-admin/src/
├── pages/
│   ├── DrillTemplateListPage.tsx    ← 新增
│   └── DrillTemplateEditPage.tsx    ← 新增
├── components/
│   └── TargetEditCard.tsx           ← 新增，单个靶位编辑卡片
└── types/
    └── drill.ts                     ← 新增，Drill 相关 TypeScript 类型
```

### 5.6 路由注册

在 `App.tsx` 中新增路由:
```tsx
<Route path="/matches/:matchId/stages/:stageId/drills" element={<DrillTemplateListPage />} />
<Route path="/matches/:matchId/stages/:stageId/drills/:drillId" element={<DrillTemplateEditPage />} />
```

---

## 六、关键约束

1. **target_type 双格式兼容**: 后端存储统一用 JSON 数组字符串。export 接口向外下发时，单类型发 String，多类型发 Array（保持与 iOS 现有逻辑兼容）。
2. **timeout**: V1 不使用 per-target timeout，全部使用 Drill 级默认值 1200 秒。字段预留。
3. **靶位最小数量**: 创建/更新时 targets 数组不能为空（至少 1 个靶位）。
4. **删除确认**: 删除 Drill 模板时必须确认弹窗，提示"将删除模板及其所有靶位配置，此操作不可恢复"。
5. **seq_no 唯一性**: 同一 template 下的 targets 的 seq_no 不能重复。
6. **事务安全**: 批量替换 targets（PUT /drills/:id/targets）必须在 SQLite 事务中执行。

---

## 七、不做的事（Non-Goals for V1）

- ❌ 不做双向同步（iOS → 后台）
- ❌ 不做模板跨 Stage 复制（P3）
- ❌ 不做模板库/全局模板
- ❌ 不做版本历史/回滚
- ❌ 不做批量导入/导出（Excel/CSV）
- ❌ 不做 Drill 执行结果回传到后台的关联
- ❌ 不做实时 WebSocket 推送
