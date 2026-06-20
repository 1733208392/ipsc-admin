# iOS Drills 功能改造评审

> 评审目标: 让 iOS APP 登录后能从 GCS 后台拉取 Drill 配置（含赛事模板和个人模板），并上传训练记录  
> 评审日期: 2026-06-19  
> 代码仓库: `/Volumes/SSD2/Projects/FlexTargetRepo/FlexTargetiOS`

---

## 一、现状分析

### 1.1 iOS 端当前架构

| 模块 | 文件 | 职责 |
|------|------|------|
| Drill 列表/创建/编辑 | `View/Drills/DrillFormView.swift`, `DrillListView.swift`, `DrillsTabView.swift` | 完全基于 Core Data 本地存储，无网络同步 |
| Drill 数据模型 | `Model/DrillSetup.swift`, `DrillTargetsConfig.swift`, `DrillResult+CoreDataClass.swift` | Core Data 实体，`DrillTargetsConfigData` 是值类型 struct |
| 本地存储 | `Model/DrillRepository.swift` | 封装 Core Data CRUD，`PersistenceController.shared` |
| 网络服务 | `Services/IpscService.swift` | 仅有**比赛上下文**的 drill replay 上传 (`POST /api/v1/matches/{matchId}/drill-replays`) |
| 认证 | `Services/AuthManager.swift`, `Services/UserAPIService.swift` | JWT + Refresh Token，Keychain 持久化 |

### 1.2 后端已实现的 API

后端两组路由已就绪：

**赛事 Drill 模板**（`/api/v1/drills/*`）:
- `GET /matches/:matchId/stages/:stageId/drills` — 列表
- `POST /matches/:matchId/stages/:stageId/drills` — 创建
- `GET /drills/:id` — 详情
- `PUT /drills/:id` — 更新
- `DELETE /drills/:id` — 删除
- `PUT /drills/:id/targets` — 批量替换靶位
- `GET /drills/:id/export` — 导出 iOS 同步格式 ✅

**个人 Drill 模板**（`/api/v1/my/drills/*`）:
- `GET /my/drills` — 列表
- `POST /my/drills` — 创建
- `GET /my/drills/:id` — 详情
- `PUT /my/drills/:id` — 更新
- `DELETE /my/drills/:id` — 删除
- `PUT /my/drills/:id/targets` — 批量替换靶位
- `GET /my/drills/:id/export` — 导出 iOS 同步格式 ✅

**个人训练记录**（`/api/v1/my/replays/*`）:
- `POST /my/drills/:drillId/replays` — 上传训练记录 ✅
- `GET /my/drills/:drillId/replays` — 列表
- `GET /my/replays` — 全部记录
- `GET /my/replays/:id` — 详情
- `DELETE /my/replays/:id` — 删除
- `GET /my/replays/stats` — 统计

**注册**（`/api/v1/auth/register`）:
- 用户名+密码注册，自动创建个人俱乐部 + `club_admin` 角色

### 1.3 iOS 端的 gap

| 能力 | 现状 | 需要改造 |
|------|------|---------|
| 从后台拉取 Drill 配置 | ❌ 不存在 | **新增** |
| 拉取后写入 Core Data 执行 | ❌ 不存在 | **新增** |
| 上传训练记录（个人） | ❌ 不存在 | **新增** |
| 上传训练记录（赛事） | ✅ `IpscService.uploadDrillReplay` | 保留 |
| 用户注册（用户名+密码） | ❌ 现有注册是邮箱+验证码 | **适配或并存** |
| 切换赛事/个人模式 | ❌ 不存在 | **新增 UI 入口** |

---

## 二、关键设计决策点

### 2.1 拉取配置的触发时机

**推荐方案**: 登录后主动拉取 + Drill 列表页手动刷新

- **登录成功后**: `AuthManager.applyLoginData` 中异步调用 `DrillSyncService.syncPersonalDrills()`，静默拉取个人模板列表
- **Drill 列表页下拉刷新**: 手动触发重新拉取
- **进入赛事 Stage 时**: 拉取该 Stage 下的 Drill 模板列表

**不建议**: 后台定时轮询（V1 不做 WebSocket，电池开销不值得）

### 2.2 后端配置与本地 Core Data 的关系

**核心原则**: 后端配置 = 模板，本地 Core Data = 执行实例

后端 `drill_templates` 是配置源（target_name, target_type, counted_shots, target_variant 等），iOS 拉取后在本地 Core Data 创建 `DrillSetup` 实例执行。

**映射关系**:

| 后端 export 字段 | iOS Core Data 字段 | 说明 |
|------------------|-------------------|------|
| `drillId` (Int) | 需新增 `serverTemplateId: Int?` | 关联后端模板 ID |
| `name` | `DrillSetup.name` | 直接映射 |
| `timeout` | `DrillSetup.drillDuration` (Double) | 秒 |
| `targets[].id` (String "drill_target_X") | 不直接映射，本地生成 UUID | 后端 ID 仅用于同步标识 |
| `targets[].seqNo` | `DrillTargetsConfig.seqNo` | 直接映射 |
| `targets[].targetName` | `DrillTargetsConfig.targetName` | 直接映射 |
| `targets[].targetType` (String 或 Array) | `DrillTargetsConfig.targetType` (String) | **需归一化**: iOS 端存 JSON 数组字符串，export 单类型时需包装为 `["ipsc"]` |
| `targets[].countedShots` | `DrillTargetsConfig.countedShots` | 直接映射 |
| `targets[].targetVariant` (Array 或 null) | `DrillTargetsConfig.targetVariant` (JSON String 或 nil) | **需编码**: Array → JSON 字符串 |
| `targets[].hasPhysicalPopper` | `DrillTargetsConfig.hasPhysicalPopper` | 直接映射 |

### 2.3 targetType 格式兼容性 ⚠️ 关键风险

**后端 export 行为**:
- 单类型: 发 String（`"ipsc"`）
- 多类型: 发 Array（`["cqb_hostage","cqb_enemy_front"]`）

**iOS 现有 `parseTargetTypes()` 逻辑**（`DrillTargetsConfig.swift:81`）:
```swift
func parseTargetTypes() -> [String] {
    let raw = targetType.trimmingCharacters(in: .whitespacesAndNewlines)
    if raw.hasPrefix("[") { /* JSON decode */ }
    return [raw]  // 非 JSON 时当单值
}
```

**Gap**: iOS 的 `targetType` 字段是 `String?`，本地存储用 JSON 数组字符串（`["ipsc"]`）或裸字符串（`"ipsc"`），两种都支持解析。但后端 export 的 JSON 中 `targetType` 字段值类型是 **String 或 Array**，iOS 的 `Codable` 解码需要处理联合类型。

**建议**: iOS 新增 `DrillTemplateExport` 解码模型时，`targetType` 用自定义解码器处理 `String | [String]` 联合类型，统一转为 `[String]`，再 `encodeTargetTypes()` 存入 Core Data。

### 2.4 注册接口适配

**现有 iOS 注册**: `UserAPIService.register(email:password:verifyCode:)` → `POST /user/register/email`，是邮箱+验证码模式。

**GCS 后端新注册**: `POST /api/v1/auth/register`，是用户名+密码模式（无验证码），返回完整登录态。

**建议**: V1 不改动现有注册流程。GCS 后端的 `/auth/register` 主要给 Web 前端用。iOS 端用户通过现有登录流程登录后，后端自动关联或创建个人俱乐部。如果用户没有账号，引导到 Web 注册或保留现有邮箱注册。

**如果必须支持用户名注册**: 新增 `UserAPIService.registerWithUsername(username:password:name:phone:)` 方法，调用 `POST /api/v1/auth/register`。

### 2.5 训练记录上传

**现有赛事上传**: `IpscService.uploadDrillReplay(matchId:request:)` → `POST /api/v1/matches/{matchId}/drill-replays`，payload 是 `IpscDrillReplayUploadRequest`。

**新增个人上传**: `POST /api/v1/my/drills/{drillId}/replays`，payload 格式不同（`total_time`, `num_shots`, `score`, `client_drill_result_id`, `device_id`, `payload`）。

**建议**: 新建 `DrillSyncService`（或扩展 `IpscService`），增加 `uploadPersonalReplay(drillTemplateId:summaries:deviceId:)` 方法。复用现有的 `ShotData` 编码逻辑生成 payload。

---

## 三、改造方案

### 3.1 新增文件

| 文件 | 职责 |
|------|------|
| `Services/DrillSyncService.swift` | Drill 配置同步服务：拉取模板、写入 Core Data、上传训练记录 |
| `Model/DrillTemplateExport.swift` | 后端 export 响应的 Codable 模型，处理 targetType 联合类型 |
| `Model/DrillSetup+ServerSync.swift` | DrillSetup 扩展：`serverTemplateId` 字段、从 export 模型构建 |

### 3.2 DrillSyncService 核心接口

```swift
class DrillSyncService {
    static let shared = DrillSyncService()
    
    // 拉取个人模板列表
    func fetchPersonalDrills() async throws -> [PersonalDrillSummary]
    
    // 拉取单个模板详情（export 格式）
    func fetchDrillExport(templateId: Int, isPersonal: Bool) async throws -> DrillTemplateExport
    
    // 同步到 Core Data（创建或更新本地 DrillSetup）
    func syncToCoreData(_ export: DrillTemplateExport, isPersonal: Bool) throws -> DrillSetup
    
    // 上传训练记录（个人）
    func uploadPersonalReplay(drillTemplateId: Int, result: DrillResult, deviceId: String?) async throws
    
    // 上传训练记录（赛事，复用现有 IpscService）
    // 已有: IpscService.uploadDrillReplay
}
```

### 3.3 DrillTemplateExport 解码模型

```swift
struct DrillTemplateExport: Codable {
    let drillId: Int
    let name: String
    let timeout: Int
    let targets: [ExportTarget]
}

struct ExportTarget: Codable {
    let id: String
    let seqNo: Int
    let targetName: String
    let targetType: TargetTypeValue    // 联合类型
    let timeout: Int
    let countedShots: Int
    let targetVariant: [String]?       // null 或 Array
    let hasPhysicalPopper: Bool
}

// 处理 String | [String] 联合类型
enum TargetTypeValue: Codable {
    case single(String)
    case multiple([String])
    
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let s = try? container.decode(String.self) {
            self = .single(s)
        } else if let arr = try? container.decode([String].self) {
            self = .multiple(arr)
        } else {
            throw DecodingError.typeMismatch(...)
        }
    }
    
    func encode(to encoder: Encoder) throws { ... }
    
    var asArray: [String] {
        switch self {
        case .single(let s): return [s]
        case .multiple(let arr): return arr
        }
    }
}
```

### 3.4 Core Data 模型扩展

`DrillSetup` 需新增字段（在 `.xcdatamodeld` 中添加 attribute）:
- `serverTemplateId: Integer32?` — 后端模板 ID，用于同步去重
- `isPersonal: Boolean` — 是否个人模板（vs 赛事模板）

**迁移策略**: Core Data lightweight migration，新增 optional 属性即可。

### 3.5 UI 改造

**DrillListView 改造**:
- 顶部新增分段控制: "本地" | "云端模板"
- 云端模板 tab: 显示从后端拉取的模板列表，支持下拉刷新
- 点击云端模板 → 调用 `syncToCoreData` → 导航到 DrillFormView（edit 模式）
- 长按云端模板 → 操作菜单: "同步到本地" | "开始训练" | "删除"

**DrillsTabView 快速训练改造**:
- "快速训练" 增加选项: 从云端模板选择（如果已登录）
- 选择后直接拉取 export → 创建本地 DrillSetup → 进入 TimerSession

**训练结果页改造**:
- 训练完成后，如果 `drillSetup.serverTemplateId != nil` 且 `isPersonal == true`:
  - 自动上传到 `POST /my/drills/{serverTemplateId}/replays`
  - 上传失败时本地标记 `pendingUpload = true`，后续重试

### 3.6 网络层复用

- `AuthManager.currentAccessToken()` 获取 JWT
- `AuthorizedRetryCoordinator` 处理 401 自动刷新（已有）
- `ServerConfig` 切换国内/国际服务器（已有）
- URL 构造: `\(baseURL)/api/v1/my/drills/\(id)/export`

---

## 四、风险与注意事项

### 4.1 ⚠️ targetType 联合类型解码

后端 export 的 `targetType` 是 `String | Array<String>`，Swift Codable 默认不支持联合类型。必须自定义 decoder，否则解码失败。

**影响范围**: 所有从后端拉取的 Drill 配置都无法直接用默认 Codable 解码。

**建议**: `TargetTypeValue` enum + 自定义 `init(from:)`，见 3.3。

### 4.2 ⚠️ Core Data 模型迁移

新增 `serverTemplateId` 和 `isPersonal` 字段需要 Core Data 模型版本迁移。虽然是 lightweight migration，但需要:
1. 在 `.xcdatamodeld` 中添加新 attribute（optional）
2. 确保现有数据不丢失
3. 测试升级路径

### 4.3 ⚠️ 离线场景

- 无网络时使用本地缓存的 DrillSetup 执行训练
- 训练结果标记 `pendingUpload`，网络恢复后批量上传
- 需要在 `DrillResult` 新增 `pendingUpload: Bool` 字段

### 4.4 重复同步去重

- 拉取同一个模板多次时，通过 `serverTemplateId` 判断本地是否已存在
- 已存在: 更新 targets（删除旧的 + 插入新的），保留本地训练记录
- 不存在: 创建新 DrillSetup

### 4.5 用户注册流程差异

GCS 后端 `/auth/register` 是用户名+密码，iOS 现有注册是邮箱+验证码。两套流程并存可能导致:
- iOS 注册的用户没有 `owner_user_id` 关联
- Web 注册的用户在 iOS 登录时需要确认账号体系打通

**建议**: 确认后端是否已统一用户表。如果 iOS 的 `/user/register/email` 和 GCS 的 `/auth/register` 共用 `users` 表，则无问题。如果是两套用户体系，需要做账号关联。

---

## 五、实施优先级

| 阶段 | 内容 | 工作量 |
|------|------|--------|
| P0 | DrillTemplateExport 解码模型 + TargetTypeValue 联合类型 | 0.5 天 |
| P0 | DrillSyncService: fetchExport + syncToCoreData | 1 天 |
| P0 | Core Data 模型扩展: serverTemplateId, isPersonal | 0.5 天 |
| P0 | DrillListView 改造: 云端模板列表 + 下拉刷新 | 1 天 |
| P0 | 训练结果自动上传（个人） | 0.5 天 |
| P1 | DrillsTabView 快速训练支持云端模板选择 | 0.5 天 |
| P1 | 离线 pendingUpload 重试机制 | 0.5 天 |
| P1 | 赛事模板拉取（Stage 级别） | 0.5 天 |
| P2 | 用户名注册支持 | 0.5 天 |
| P2 | 训练记录历史同步（双向） | 1 天 |

**总工作量估算**: P0 约 3.5 天，P1 约 1.5 天，P2 约 1.5 天。

---

## 六、结论

### 可行性: ✅ 可行

后端 API 已就绪，iOS 现有架构（Core Data + AuthManager + IpscService）扩展性良好。主要改造集中在网络层新增和数据模型扩展。

### 核心风险: targetType 联合类型解码

这是唯一的技术硬卡点。后端 export 设计的 `String | Array` 双格式虽然对前端友好，但给 Swift Codable 带来额外复杂度。建议用自定义 enum decoder 解决。

### 最大工作量: UI 改造

DrillListView 需要从纯本地列表改为"本地 + 云端"双 tab，涉及交互设计、空状态、加载状态、错误状态。建议 V1 先做最简版: 列表页增加"同步"按钮，拉取后直接写入本地列表，不做独立云端 tab。

### 建议的 V1 最小闭环

1. 登录后静默拉取个人模板列表
2. DrillListView 顶部加"云端模板"分段，点击拉取 export → 写入 Core Data → 显示在本地列表
3. 训练完成后自动上传到 `/my/drills/{id}/replays`
4. 上传失败本地标记，下次启动重试

这个闭环不改动现有注册流程，不改动赛事模块，最小化 UI 改动。
