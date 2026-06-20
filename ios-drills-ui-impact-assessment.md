# iOS Drill 配置 UI 影响评估

> 评审对象: DrillFormView, TargetConfigListView, TargetLinkView 及子视图  
> 评审目的: 评估"复杂配置只走后台、App 不暴露"策略对现有代码的影响

---

## 一、现有配置 UI 架构

### 1.1 配置链路

```
DrillFormView (入口)
  ├─ DrillNameSectionView        — 名称输入
  ├─ DescriptionSectionView      — 描述输入
  ├─ RepeatsConfigView           — 重复次数
  ├─ DrillRepeatsPauseConfView   — 间隔时长
  └─ TargetsSectionView          — 靶位配置入口
       ├─ 单设备 → TargetConfigListViewV2  (拖拽选 targetType)
       └─ 多设备 → TargetLinkView           (网格布局 + 拖拽选 targetType)
                     └─ 点击单设备 → TargetConfigListViewV2 (singleDeviceMode)
```

### 1.2 用户可配置的参数

| 参数 | 配置位置 | 数据类型 | 说明 |
|------|---------|---------|------|
| name | DrillFormView | String | 训练名称 |
| desc | DrillFormView | String | 描述 |
| repeats | DrillFormView | Int | 重复次数 |
| pause | DrillFormView | Int | 间隔秒数 |
| drillDuration | DrillFormView | Double | 总时长 |
| mode | DrillFormView/TargetsSection | String | "ipsc" / "cqb" |
| targetName | TargetLinkView 自动填充 | String | 设备名（BLE 发现） |
| seqNo | TargetLinkView 自动分配 | Int | 按 zigzag 顺序 |
| **targetType** | TargetConfigListViewV2 拖拽 | String | 拖拽选择，支持多类型 |
| **timeout** | ❌ 不可配 | Double | 默认 30.0，硬编码 |
| **countedShots** | ❌ 不可配 | Int | 默认 5，硬编码 |
| **targetVariant** | ❌ 不可配 | String? | 仅 disguised_enemy 自动设置 [5,10] |
| **hasPhysicalPopper** | TargetLinkView + 按钮 | Bool | 可手动添加/删除 popper |

### 1.3 关键发现

**用户无法配置的参数**:
- `timeout` — 硬编码 30.0 秒（`TargetConfigListViewV2.ensurePrimaryTarget()` 和 `TargetLinkView.initializeTargetConfigs()`）
- `countedShots` — 硬编码 5（同上）
- `targetVariant` — 仅 CQB disguised_enemy 模式自动设为 `[5, 10]`，其他场景均为 nil

**用户可配但复杂的参数**:
- `targetType` — 通过拖拽选择，支持多类型（多类型时变体逻辑变复杂）
- `hasPhysicalPopper` — TargetLinkView 中可添加/删除

**完全没暴露的参数**:
- `delay` — DrillFormView 中已注释掉（`// delayType removed; only random mode is supported now`），固定 2-5s 随机
- `drillDuration` — 实际上在 UI 中叫 "Pause Time Between Repeats"，语义混乱

---

## 二、影响评估

### 2.1 "不改动现有 DrillFormView UI" 的可行性: ✅ 完全可行

现有 DrillFormView 本身就不暴露 timeout、countedShots、targetVariant。这些字段在本地创建时用默认值，从后台同步时由 export 数据覆盖。**零冲突**。

### 2.2 后台同步模板 vs 本地创建模板的差异

| 字段 | 本地创建默认值 | 后台 export 值 | 冲突？ |
|------|-------------|--------------|--------|
| name | 用户输入 | 后台配置 | ❌ 无 |
| timeout | 30.0 (硬编码) | 后台配置 | ❌ 无（本地不暴露，后台覆盖） |
| countedShots | 5 (硬编码) | 后台配置 | ❌ 无（同上） |
| targetVariant | nil 或 [5,10] | 后台配置 | ❌ 无（同上） |
| targetType | 用户拖拽选择 | 后台配置 | ❌ 无（同步时直接写入） |
| hasPhysicalPopper | 用户手动添加 | 后台配置 | ❌ 无 |

**结论**: 后台同步的 DrillSetup 携带完整配置，本地创建的 DrillSetup 用默认值。两者数据结构完全一致，只是填充来源不同。

### 2.3 需要的改动（最小化）

#### 必须改的（Core Data 层）:
1. **DrillSetup 新增 `serverTemplateId: Int32`** — 标识后台模板 ID，0 表示本地创建
2. **DrillSetup 新增 `isReadOnly: Bool`** — 标识是否只读（后台同步的不可编辑）

不需要新增 `isPersonal` 字段了 — 有 `serverTemplateId > 0` 就足够判断是否来自后台。

#### 必须改的（UI 层）:

| 文件 | 改动 | 工作量 |
|------|------|--------|
| `DrillListView.swift` | 导航栏加同步按钮 + 云端标识 | 小 |
| `DrillSummaryView.swift` | 非赛事上下文加手动上传按钮 | 小 |
| `DrillFormView.swift` | **只读判断**: `isReadOnly == true` 时隐藏编辑控件，只显示数据和"开始训练"按钮 | 中 |

#### 不需要改的:

| 文件 | 原因 |
|------|------|
| `TargetConfigListViewV2` | 后台同步的只读模板不进入此页面 |
| `TargetLinkView` | 同上 |
| `DrillNameSectionView` | 同上 |
| `DescriptionSectionView` | 同上 |
| `RepeatsConfigView` | 同上 |
| `DrillRepeatsPauseConfView` | 同上 |
| `TargetsSectionView` | 同上 |

### 2.4 DrillFormView 只读模式的具体改法

当前 `DrillFormView` 已有 `isEditingDisabled` 逻辑（有 results 或 competitions 时禁用编辑）。扩展这个逻辑即可:

```swift
private var isEditingDisabled: Bool {
    guard let drillSetup = currentDrillSetup else { return false }
    let hasResults = (drillSetup.results?.count ?? 0) > 0
    let hasCompetitions = (drillSetup.competitions?.count ?? 0) > 0
    return hasResults || hasCompetitions || drillSetup.serverTemplateId > 0
}
```

**只读模式下 DrillFormView 的行为**:
- 隐藏 DrillNameSectionView、DescriptionSectionView、RepeatsConfigView、DrillRepeatsPauseConfView
- TargetsSectionView 显示靶位数量但不允许进入配置
- 只显示"开始训练"按钮
- 顶部显示 lock 图标 + "Server template (read-only)" 提示

### 2.5 默认 Drill 预设（Default Drills）

**不需要在 App 中硬编码 JSON**。更好的做法:

1. 后台 `GET /my/drills` 已经返回个人模板列表
2. 用户注册时后端自动创建一批默认模板（1-target、2-target、3-target 基础配置）
3. 用户登录后静默同步到本地 Core Data
4. 本地列表天然显示这些默认模板

**优势**: 默认模板可由后台运营调整，不需要 App 发版更新。如果用户离线，Core Data 中已有缓存的默认模板可用。

如果确实需要 App 内置 fallback（无网络时首次使用）:
- 在 `Assets` 中放一个 `DefaultDrills.json`
- 首次启动且 Core Data 为空且无网络时，加载 JSON 写入 Core Data
- 后续有网络时同步覆盖

---

## 三、修订后的方案

### 3.1 数据模型变更

DrillSetup 新增:
- `serverTemplateId: Int32`（默认 0，本地创建）
- 不需要 `isPersonal`、`isReadOnly` — 用 `serverTemplateId > 0` 判断

### 3.2 UI 变更

| 变更 | 文件 | 说明 |
|------|------|------|
| 同步按钮 | DrillListView | 导航栏右上角，已登录时可见 |
| 云端标识 | DrillListView | 列表行显示 icloud 图标 |
| 只读模式 | DrillFormView | `serverTemplateId > 0` 时只展示不可编辑 |
| 手动上传 | DrillSummaryView | 非赛事 + `serverTemplateId > 0` 时显示上传按钮 |

### 3.3 不变的

- DrillFormView 的表单结构、字段、交互逻辑 — **完全不改**
- TargetConfigListViewV2 — **完全不改**
- TargetLinkView — **完全不改**
- 所有 SubViews — **完全不改**
- 现有本地创建流程 — **完全不改**

### 3.4 对比之前 prompt 的差异

| 之前 prompt | 修订后 |
|------------|--------|
| DrillSetup 加 `serverTemplateId` + `isPersonal` | 只加 `serverTemplateId` |
| DrillListView 加同步按钮 | 不变 |
| DrillSummaryView 加手动上传 | 不变 |
| DrillFormView 无改动 | 加只读判断（`serverTemplateId > 0` 时禁用编辑） |
| 默认 drills 未涉及 | 由后台创建默认模板，App 同步即可 |

---

## 四、结论

**影响面极小**。现有配置 UI 完全不需要改动。

核心原因: 现有 DrillFormView/TargetConfigListView/TargetLinkView 本来就不暴露 timeout、countedShots、targetVariant 等复杂参数。这些字段在本地创建时用硬编码默认值，从后台同步时直接写入 Core Data — 两套路径互不干扰。

唯一需要加的是 DrillFormView 的只读判断（3 行代码），以及 DrillListView 的同步入口和 DrillSummaryView 的上传按钮。
