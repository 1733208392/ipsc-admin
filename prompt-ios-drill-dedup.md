# 修复：iOS 个人训练记录上传/下载重复

## 问题现象

用户在 iOS 端做一次 drill 训练 → 本地 Core Data 存一条 `DrillResult` → 点上传 → 服务器存一条 `drill_replays`。下次打开 App 触发同步（fetchPersonalDrillRecords → upsertDrillRecord），**本地出现两条相同的训练记录**：一条是原始本地记录，一条是从服务器下载回来的记录。

## 根因分析（已审计代码确认）

### 问题 1：iOS 上传时 `client_drill_result_id` 永远为 nil

`DrillExecutionManager.swift:835` 初始化 `DrillRepeatSummary` 时：
```swift
let summary = DrillRepeatSummary(
    ...
    drillResultId: nil,   // ← 初始化为 nil
    ...
)
```

`DrillsTabView.swift:141` 在保存 Core Data 后**没有回写** summary：
```swift
let result = DrillResult(context: viewContext)
result.id = summary.drillResultId ?? UUID()  // ← 用了 UUID，但没回写到 summary
// ...保存后不更新 drillRepeatSummaries
drillRepeatSummaries = summaries  // ← summaries 里的 drillResultId 还是 nil
```

→ `DrillSummaryView.uploadPersonalDrillRecord()` 里：
```swift
let clientId = firstSummary.drillResultId?.uuidString  // 永远是 nil
let request = PersonalDrillRecordUploadRequest(
    ...
    clientDrillResultId: clientId,  // ← 传 nil 到服务器
)
```

→ 后端 `my-drill-records.ts:104-120` 无法匹配已有记录（因为 `client_drill_result_id IS NULL`），每次都走 INSERT 分支。

**注**：数据库有唯一索引 `idx_drill_replays_client_uuid_personal` 约束 `(owner_user_id, client_drill_result_id) WHERE client_drill_result_id IS NOT NULL`，但 NULL 不受约束 → 允许无限重复。

### 问题 2：iOS 下载同步的去重 fallback 逻辑也匹配不上

`DrillSyncService.upsertDrillRecord` 的两级匹配：
1. **`fetchDrillResult(byClientId:)`** — 因 `detail.clientDrillResultId` 为 nil → 跳过
2. **`fetchDrillResult(byDrill:date:)`** — 按 `drillSetup + date` 在 1 秒窗口内匹配

但日期也匹配不上：
- 本地 `DrillResult.date` = 用户做 drill 时的时间（如 14:00）
- 服务器 `drill_replays.created_at` = 用户上传时的时间（如 14:05 或几天后）
- 同步时 `recordDate = parseServerDate(detail.createdAt)` = 服务器上传时间
- 用上传时间去本地的 drill 时间窗口找 → **永远找不到** → 走 "create new" 分支 → 本地新增一条

这就是"两个重复记录"的来源：**本地原有 + 同步下载新建**。

### 问题 3：已存在的脏数据

数据库里已经有的记录全部 `client_drill_result_id IS NULL`（当前数据库仅 1 条，但用户实际场景中可能更多）。

## 修复方案

### 修复 1：iOS 端 — 上传前把本地 DrillResult ID 回写到 summary

**文件**：`View/DrillsTabView.swift`（约第 141 行附近）

**修改位置**：`onDrillComplete` 回调里保存 Core Data 之后

**改动**：
```swift
// 保存前先用 summary 的 drillResultId 或生成新 UUID
for (index, summary) in summaries.enumerated() {
    let result = DrillResult(context: viewContext)
    let resultId = summary.drillResultId ?? UUID()
    result.id = resultId
    // ... 其他字段 ...
    
    // ⚠️ 关键：回写到 summary，让 DrillSummaryView 能拿到这个 ID
    summaries[index].drillResultId = resultId  // ← 新增这一行
}
```

**注**：`DrillRepeatSummary` 的 `drillResultId` 是 `var`，可以直接修改。

### 修复 2：iOS 端 — 上传成功后回写 remote_id 到本地 DrillResult

避免每次同步都重复匹配，可以在 `DrillResult` Core Data 模型里增加一个 `remoteId: Int64` 字段，上传成功后保存。同步时优先用 `remoteId` 匹配，避免再用日期匹配。

**这是可选的增强项**，修复 1 已经能解决主要问题。如果想做，需要：
1. 修改 `DrillDataModel.xcdatamodeld` 增加 `remoteId` 字段
2. 上传成功回调里 `result.remoteId = data.id; try context.save()`
3. `DrillSyncService.upsertDrillRecord` 优先用 `remoteId` 查询

### 修复 3：iOS 端 — `upsertDrillRecord` 的日期匹配 fallback 增强

即使 clientDrillResultId 匹配不上，应该用 payload 里的 `shotData[0].timestamp` + `totalTime` 等业务特征去重，而不是依赖 `created_at`。

更简单的做法：**在 upsertDrillRecord 里，如果 `detail.clientDrillResultId` 为 nil 但本地能找到一个同 drillSetup 且 totalTime/numShots 完全相同的记录，视为重复**。

```swift
// upsertDrillRecord 里在 fetchDrillResult(byDrill:date:) 失败后追加
if existing == nil {
    // Fallback 2: 按 drillSetup + totalTime + numShots 匹配
    existing = try fetchDrillResult(
        byDrill: drillSetup,
        totalTime: detail.totalTime,
        numShots: detail.numShots,
        context: context
    )
}
```

### 修复 4：后端 — 强制要求 `client_drill_result_id` 非空

**文件**：`src/routes/my-drill-records.ts:99`

把 `PersonalDrillRecordUploadSchema` 里的 `client_drill_result_id` 从可选改为必填：

```ts
// src/types.ts 里 PersonalDrillRecordUploadSchema
client_drill_result_id: z.string().min(1),  // 原来是 z.string().nullable().optional()
```

这样 iOS 端如果忘记传 ID 会被后端拒绝，强制修复客户端 bug。但**需要确认 iOS 端所有调用路径都能提供 ID**（修复 1 落实后即可）。

### 修复 5：后端 — 为历史脏数据增加软去重

在 `POST /drills/:drillId/drill-records` 里，即使 `client_drill_result_id` 为空，也按 `(owner_user_id, drill_template_id, total_time, num_shots)` 组合做一次查询，如果 5 分钟内已有相同记录则视为重复，UPDATE 而不是 INSERT。

```ts
// 在 INSERT 前加一层保护
if (recordId === null) {
  const recentDupe = db.prepare(
    `SELECT id FROM drill_replays
     WHERE owner_user_id = ? AND drill_template_id = ?
       AND total_time = ? AND num_shots = ?
       AND created_at > datetime('now', '-5 minutes')
     ORDER BY id DESC LIMIT 1`
  ).get(req.user.id, template.id, parsed.data.total_time, parsed.data.num_shots) as { id: number } | undefined;
  
  if (recentDupe) {
    // UPDATE 而不是 INSERT
    db.prepare(`UPDATE drill_replays SET payload_json = ?, ... WHERE id = ?`)
      .run(payloadJson, ..., recentDupe.id);
    recordId = recentDupe.id;
  }
}
```

### 修复 6：清理已有的脏数据

提供 SQL 让用户在服务器上执行：
```sql
-- 查看重复
SELECT owner_user_id, drill_template_id, total_time, num_shots, COUNT(*) AS cnt
FROM drill_replays
WHERE owner_user_id IS NOT NULL
GROUP BY owner_user_id, drill_template_id, total_time, num_shots
HAVING COUNT(*) > 1;

-- 删除较新的重复（保留最早一条）
DELETE FROM drill_replays
WHERE id NOT IN (
  SELECT MIN(id) FROM drill_replays
  WHERE owner_user_id IS NOT NULL
  GROUP BY owner_user_id, drill_template_id, total_time, num_shots
);
```

## 推荐实施顺序

1. **修复 1**（必做，立即）：iOS 上传前回写 `drillResultId` — 一行代码改动，解决根因
2. **修复 3**（推荐）：iOS 下载 upsert 增强 fallback — 防御性编程
3. **修复 6**（必做）：清理服务器上的历史脏数据
4. **修复 5**（可选）：后端增加 5 分钟软去重作为兜底
5. **修复 4**（可选）：等 iOS 修复上线后再强制必填

## 不推荐的方案

- ❌ 直接清空本地 Core Data 重新下载 — 治标不治本，下次上传又会重复
- ❌ 完全禁用上传功能 — 失去训练数据云端备份能力
- ❌ 把 drill_replays 表的 client_drill_result_id 改为 NOT NULL — 会导致历史数据迁移失败

## 关键文件路径

- iOS 上传入口：`flextarget/View/Drills/DrillSummaryView.swift:1140`（`uploadPersonalDrillRecord`）
- iOS 同步服务：`flextarget/Services/DrillSyncService.swift:245`（`upsertDrillRecord`）
- iOS DrillResult 保存：`flextarget/View/DrillsTabView.swift:141`（`onDrillComplete`）
- iOS Summary 定义：`flextarget/Model/DrillRepeatSummary.swift:14`
- iOS DrillExecution 初始化：`flextarget/Model/DrillExecutionManager.swift:835`
- 后端上传处理：`ipsc-backend/src/routes/my-drill-records.ts:82`
- 后端列表查询：`ipsc-backend/src/routes/my-drill-records.ts:312`
- 后端 schema 约束：`ipsc-backend/src/db/schema.ts`（drill_replays 表定义）
