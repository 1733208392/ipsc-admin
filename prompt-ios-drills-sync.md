# iOS Drills 设备绑定改造 — Claude Code 提示词 v5

> **项目路径**: `/Volumes/SSD2/Projects/FlexTargetRepo/FlexTargetiOS`  
> **目标**: 在现有"后台配置→只读查看→开始训练"流程上增加设备绑定层，让后台模板的 `targetName`（逻辑名）与现场 BLE 发现的设备名正确对应  
> **约束**:  
> - 不改动 `DrillListView` 的列表和同步逻辑  
> - 不恢复本地创建 Drill 的功能（已禁用）  
> - `DrillFormView` 保持"信息补充"角色，只读展示服务器配置  

---

## 问题本质

```
后台模板（逻辑层）                物理设备（BLE 发现层）
┌──────────────────────┐       ┌──────────────────────┐
│ #1  targetName="T1"  │       │ Device "FT-0032"     │
│ #2  targetName="T2"  │       │ Device "T1"          │
│ #3  targetName="T3"  │       │ Device "T2"          │
└──────────────────────┘       └──────────────────────┘
      ↓ 同步到 CoreData                ↓ netlink_query_device_list
  targetName = "T1" (逻辑名)       networkDevices = [FT-0032, T1, T2]
```

`DrillExecutionManager` 发命令用 `dest: target.targetName`，但 `targetName` 是逻辑名，不是设备网络名，命令无法路由。

现有 `TargetLinkView` 的 `buildGridItems()` 用 `targetConfigs.first { $0.targetName == device.name }` 做匹配——逻辑名 ≠ 设备名时**永远匹配不上**。

---

## 改造方案

### 核心设计

1. `DrillTargetsConfig` Core Data 新增 `assignedDeviceName: String?`，存绑定的设备网络名
2. `DrillExecutionManager` 执行时用 `assignedDeviceName ?? targetName` 作 dest
3. `DrillsTabView` 拦截数量不一致：**只有 `targetConfigs.count == networkDevices.count` 才能进入 TargetLinkView/TargetConfigListViewV2**
4. `DrillsTabView` 底部常驻显示当前网络设备数量
5. 多靶：进入 `TargetLinkView` 后，按 seqNo 顺序自动分配 `assignedDeviceName`，用户可通过**长按拖拽**调整对应关系
6. 单靶：自动绑定，无需用户操作
7. 绑定结果缓存在 CoreData，同步更新模板时保留

### 交互流程

```
DrillListView (列表, 带同步按钮)
    │
    │ onDrillSelected(drill)
    ▼
DrillsTabView
    │
    ├─ 底部常驻: "网络设备: N 个" (点击刷新)
    │
    ├─ targetConfigs.count ≠ networkDevices.count?
    │   └─ YES → Alert 拦截, 不导航
    │            "模板需要 M 个靶位，当前网络发现 N 个设备，请确认设备数量一致"
    │
    ├─ 数量一致, targetConfigs.count == 1 (单靶)
    │   └─ → TargetConfigListViewV2 (自动绑定 assignedDeviceName)
    │         → 显示 Start 按钮 → 点击 → startDrill()
    │
    └─ 数量一致, targetConfigs.count > 1 (多靶)
        └─ → TargetLinkView (设备绑定网格)
               ├─ onAppear: 按 seqNo 顺序自动分配 assignedDeviceName
               ├─ 网格展示: #seqNo + targetType 图标 + 绑定的设备名
               ├─ 长按拖拽: 交换两个格子的 assignedDeviceName
               ├─ 双击: greeting 测试设备响应
               ├─ 单击: 进入 TargetConfigListViewV2 查看该靶位参数(只读)
               └─ Start 按钮 → 点击 → startDrill()
```

---

## 任务 1: Core Data 新增 `assignedDeviceName`

**文件**: `flextarget/DrillDataModel.xcdatamodeld/DrillDataModel.xcdatamodel/contents`（修改）

在 `DrillTargetsConfig` entity 中新增:
```xml
<attribute name="assignedDeviceName" optional="YES" attributeType="String"/>
```

**文件**: `flextarget/Model/DrillTargetsConfig+CoreDataClass.swift`（修改）

添加:
```swift
@NSManaged public var assignedDeviceName: String?
```

**文件**: `flextarget/Model/DrillTargetsConfig.swift`（修改）

`DrillTargetsConfigData` struct 新增字段:
```swift
var assignedDeviceName: String?  // 绑定的物理设备网络名
```

`toStruct()` 扩展方法中添加:
```swift
assignedDeviceName: target.assignedDeviceName
```

**迁移**: 新增 optional 属性，lightweight migration 自动处理。

---

## 任务 2: DrillExecutionManager 改造

**文件**: `flextarget/Model/DrillExecutionManager.swift`（修改）

### 2.1 新增辅助方法

```swift
/// 执行时用的设备名: 优先 assignedDeviceName，fallback targetName
private func effectiveDeviceName(for target: DrillTargetsConfig) -> String {
    return target.assignedDeviceName ?? target.targetName ?? ""
}
```

### 2.2 替换所有 `target.targetName` 引用

全文搜索 `target.targetName` 和 `targetName ?? ""`，在以下场景替换为 `effectiveDeviceName(for: target)`:

- `sendReadyCommands()`: `"dest"` 字段 + mock shot 的 `"target"` / `"device"` 字段
- `sendStartCommands()`: 伪装敌人单独启动的 `"dest"` 字段
- shot 回调匹配: `shot.target == effectiveDeviceName` / `shot.device == effectiveDeviceName`

**约 10-15 处替换**。每处替换后确认上下文是"发送命令到设备"或"匹配 shot 回调"，不是"展示给用户看的标签"。

### 2.3 expectedDevices 初始化

**文件**: `flextarget/View/Drills/TimerSessionView.swift`（修改）

`initializeReadinessCheck()` 中:
```swift
// 改为:
let expectedDevicesList = (drillSetup.targets as? Set<DrillTargetsConfig>)?
    .sorted { $0.seqNo < $1.seqNo }
    .compactMap { $0.assignedDeviceName ?? $0.targetName } ?? []
```

---

## 任务 3: DrillsTabView 改造

**文件**: `flextarget/View/DrillsTabView.swift`（修改）

### 3.1 新增状态变量

```swift
@State private var showDrillDetail = false           // DrillFormView 入口
@State private var showDeviceCountAlert = false       // 数量不一致提示
@State private var pendingDrill: DrillSetup? = nil    // 待打开的 drill（被拦截时暂存）
```

### 3.2 底部设备数量提示

在 `DrillListView` 下方（ZStack 底部 overlay 或 VStack 尾部）添加:

```swift
// 底部设备数量提示条
VStack {
    Spacer()
    HStack(spacing: 8) {
        Circle()
            .fill(bleManager.networkDevices.isEmpty ? Color.gray : Color.green)
            .frame(width: 8, height: 8)
        Text("网络设备: \(bleManager.networkDevices.count) 个")
            .font(.caption)
            .foregroundColor(.gray)
        if bleManager.isConnected {
            Button(action: { queryDeviceList() }) {
                Image(systemName: "arrow.clockwise")
                    .font(.caption)
                    .foregroundColor(Color(red: 0.8706, green: 0.2196, blue: 0.1373))
            }
        }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 8)
    .background(Color.black.opacity(0.8))
    .cornerRadius(20)
    .padding(.bottom, 8)
}
```

### 3.3 onDrillSelected 拦截逻辑

```swift
onDrillSelected: { drill in
    let targetCount = drill.sortedTargets.count
    let deviceCount = bleManager.networkDevices.count
    
    if targetCount != deviceCount {
        // 数量不一致，弹 Alert 拦截
        pendingDrill = drill
        showDeviceCountAlert = true
        return
    }
    
    // 数量一致，正常导航
    selectedDrillTargetConfigs = drill.sortedTargets.map { $0.toStruct() }
    selectedDrillMode = drill.mode ?? "ipsc"
    selectedDrillSetup = drill
}
```

### 3.4 Alert

```swift
.alert("设备数量不匹配", isPresented: $showDeviceCountAlert) {
    Button("确定") { pendingDrill = nil }
} message: {
    if let drill = pendingDrill {
        let targetCount = drill.sortedTargets.count
        let deviceCount = bleManager.networkDevices.count
        Text("模板「\(drill.name ?? "")」需要 \(targetCount) 个靶位，当前网络发现 \(deviceCount) 个设备。请确认设备已全部连接后重试。")
    }
}
```

### 3.5 导航到 TargetLinkView/TargetConfigListViewV2

```swift
// 多靶:
TargetLinkView(
    bleManager: bleManager,
    targetConfigs: $selectedDrillTargetConfigs,
    onDone: { selectedDrillSetup = nil },
    drillMode: $selectedDrillMode,
    hasResults: (drill.results?.count ?? 0) > 0,
    isReadOnly: true,                           // 禁止编辑 targetType
    onSettings: { showDrillDetail = true },      // 进入 DrillFormView 查看详情
    onStartDrill: { startDrill(drill) }
)

// 单靶:
TargetConfigListViewV2(
    deviceList: bleManager.networkDevices,
    targetConfigs: $selectedDrillTargetConfigs,
    onDone: { selectedDrillSetup = nil },
    drillMode: $selectedDrillMode,
    singleDeviceMode: true,
    deviceNameFilter: selectedDrillTargetConfigs.first?.targetName,
    isFromTargetLink: false,
    hasResults: (drill.results?.count ?? 0) > 0,
    isReadOnly: true,                           // 禁止编辑 targetType
    onSettings: { showDrillDetail = true },
    onStartDrill: { startDrill(drill) }
)
```

**关键**: `isReadOnly: true` 禁止编辑 targetType。Start 按钮的显示只依赖 `onStartDrill != nil`，不依赖 `isReadOnly`（已确认现有代码逻辑）。

### 3.6 DrillFormView 入口

```swift
NavigationLink(isActive: $showDrillDetail) {
    if let drill = selectedDrillSetup {
        DrillFormView(bleManager: bleManager, mode: .edit(drill), isFromNewDrill: false, showDetailsByDefault: true)
            .environment(\.managedObjectContext, persistenceController.container.viewContext)
    }
} label: { EmptyView() }
```

### 3.7 startDrill 方法

```swift
private func startDrill(_ drill: DrillSetup) {
    let targets = drill.sortedTargets
    let deviceCount = bleManager.networkDevices.count
    
    guard targets.count == deviceCount, deviceCount > 0 else { return }
    
    // 从 selectedDrillTargetConfigs（可能被 TargetLinkView 拖拽调整过）写回 CoreData
    let sortedDevices = bleManager.networkDevices.sorted { $0.name < $1.name }
    for (index, target) in targets.enumerated() {
        // 优先用 TargetLinkView 中用户调整后的 assignedDeviceName
        if index < selectedDrillTargetConfigs.count {
            target.assignedDeviceName = selectedDrillTargetConfigs[index].assignedDeviceName
        } else if index < sortedDevices.count {
            target.assignedDeviceName = sortedDevices[index].name
        }
    }
    
    let context = persistenceController.container.viewContext
    try? context.save()
    
    drillSetupForTimer = drill
    navigateToTimerSession = true
}
```

---

## 任务 4: TargetLinkView 改造 — 设备绑定网格

**文件**: `flextarget/View/Drills/TargetLinkView.swift`（修改）

这是本次改造的核心。现有 TargetLinkView 的网格是按 `networkDevices` 驱动、用 `targetName` 做匹配。改造后按 `targetConfigs`（seqNo 顺序）驱动，用 `assignedDeviceName` 做绑定。

### 4.1 新增拖拽状态

```swift
@State private var draggingFromSeqNo: Int? = nil        // 正在拖拽的靶位 seqNo
@State private var dragHoverSeqNo: Int? = nil             // 拖拽悬停的目标 seqNo
```

### 4.2 删除现有匹配逻辑

**删除** `updateTargetNamesForConnectedDevices()` 方法 —— 不再用设备名覆盖 `targetName`。

**删除** `initializeTargetConfigs()` 中的"为未匹配设备新建 config"逻辑 —— 后台模板的 targetConfigs 是固定的，不需要新建。

### 4.3 新增 `initializeDeviceBindings()` 

`onAppear` 时调用（替换原来的 `initializeTargetConfigs()`）:

```swift
private func initializeDeviceBindings() {
    // 按 seqNo 排序 targetConfigs
    targetConfigs.sort { $0.seqNo < $1.seqNo }
    
    // 按 name 排序设备
    let sortedDevices = bleManager.networkDevices.sorted { $0.name < $1.name }
    
    // 检查是否已有缓存的 assignedDeviceName 且仍有效
    let currentDeviceNames = Set(sortedDevices.map { $0.name })
    var hasValidBindings = true
    for config in targetConfigs {
        if let assigned = config.assignedDeviceName, currentDeviceNames.contains(assigned) {
            continue  // 缓存有效
        }
        hasValidBindings = false
        break
    }
    
    if !hasValidBindings {
        // 按 seqNo 顺序自动分配
        for (index, config) in targetConfigs.enumerated() {
            if index < sortedDevices.count {
                targetConfigs[index].assignedDeviceName = sortedDevices[index].name
            }
        }
    }
}
```

### 4.4 改造 `buildGridItems()`

**现有**（按 networkDevices 驱动）:
```swift
for device in bleManager.networkDevices {
    let config = targetConfigs.first { $0.targetName == device.name }  // 永远匹配不上
    items.append(.device(device: device, config: config))
}
```

**改为**（按 targetConfigs 驱动）:
```swift
private func buildGridItems() -> [TargetGridItem] {
    var items: [TargetGridItem] = []
    
    for config in targetConfigs {
        let assignedDevice = bleManager.networkDevices.first { $0.name == config.assignedDeviceName }
        
        if let device = assignedDevice {
            items.append(.device(device: device, config: config, seqNo: config.seqNo))
            if config.hasPhysicalPopper && items.count < 12 {
                items.append(.popper(parentDeviceName: device.name))
            }
        } else {
            // 不应该发生（数量已拦截），但防御性处理
            items.append(.unbound(config: config))
        }
    }
    
    while items.count < 12 { items.append(.empty) }
    return items
}
```

### 4.5 改造 `gridCell`

每个设备格子显示:
1. **左上角**: `#seqNo` 序号标签（橙色背景圆角标签）
2. **中间**: targetType 图标
3. **底部**: 绑定的设备名（绿色文字 = 已绑定）

```swift
case .device(let device, let config, let seqNo):
    ZStack(alignment: .topTrailing) {
        NavigationLink(
            destination: TargetConfigListViewV2(
                deviceList: bleManager.networkDevices,
                targetConfigs: $targetConfigs,
                onDone: onDone,
                drillMode: $drillMode,
                singleDeviceMode: true,
                deviceNameFilter: device.name,
                isFromTargetLink: true,
                hasResults: hasResults,
                isReadOnly: true,           // 只读
                onSettings: onSettings,
                onStartDrill: onStartDrill
            ),
            tag: device.name,
            selection: $navigateToDevice
        ) { EmptyView() }
        .hidden()

        TargetRectangleView(
            deviceName: device.name,
            config: config,
            seqNo: seqNo,                   // ← 新增: 显示序号
            width: rectangleWidth,
            height: rectangleHeight,
            isDragging: draggingFromSeqNo == seqNo,
            isDragHover: dragHoverSeqNo == seqNo,
            onTogglePopper: nil
        )
        .contentShape(Rectangle())
        .gesture(
            TapGesture(count: 2)
                .onEnded { sendGreeting(to: device.name) }
                .exclusively(before:
                    TapGesture(count: 1)
                        .onEnded { navigateToDevice = device.name }
                )
        )
        // 长按开始拖拽
        .onLongPressGesture(minimumDuration: 0.3) {
            draggingFromSeqNo = seqNo
            // 触觉反馈
            let generator = UIImpactFeedbackGenerator(style: .medium)
            generator.impactOccurred()
        }
    }
```

### 4.6 拖拽交换逻辑

在 `gridContent` 的 `LazyVGrid` 上添加拖拽处理:

```swift
LazyVGrid(columns: gridColumns, spacing: 40) {
    ForEach(Array(buildGridItems().enumerated()), id: \.offset) { (_, item) in
        gridCell(for: item)
    }
}
.padding(16)
// 拖拽悬停检测
.onDrop(of: [UTType.plainText], isTargeted: nil) { _ in
    // drop 结束
    draggingFromSeqNo = nil
    dragHoverSeqNo = nil
    return true
}
```

每个 `TargetRectangleView` 添加 `.onDrop`:

```swift
.onDrop(of: [UTType.plainText], isTargeted: Binding(
    get: { dragHoverSeqNo == seqNo },
    set: { isTargeted in
        dragHoverSeqNo = isTargeted ? seqNo : nil
    }
)) { providers in
    guard let fromSeqNo = draggingFromSeqNo, fromSeqNo != seqNo else { return false }
    
    // 交换 assignedDeviceName
    if let fromIndex = targetConfigs.firstIndex(where: { $0.seqNo == fromSeqNo }),
       let toIndex = targetConfigs.firstIndex(where: { $0.seqNo == seqNo }) {
        let temp = targetConfigs[fromIndex].assignedDeviceName
        targetConfigs[fromIndex].assignedDeviceName = targetConfigs[toIndex].assignedDeviceName
        targetConfigs[toIndex].assignedDeviceName = temp
        
        // 触觉反馈
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred()
    }
    
    draggingFromSeqNo = nil
    dragHoverSeqNo = nil
    return true
}
```

### 4.7 TargetRectangleView 改造

```swift
struct TargetRectangleView: View {
    let deviceName: String
    let config: DrillTargetsConfigData?
    let seqNo: Int                                          // ← 新增
    let width: CGFloat
    let height: CGFloat
    var isDragging: Bool = false                            // ← 新增
    var isDragHover: Bool = false                           // ← 新增
    var onTogglePopper: (() -> Void)? = nil

    private let accentColor = Color(red: 0.8706, green: 0.2196, blue: 0.1373)

    var body: some View {
        VStack(spacing: 8) {
            if let config = config, !config.targetType.isEmpty {
                Image(config.primaryTargetType())
                    .resizable()
                    .scaledToFit()
                    .frame(height: height * 0.5)
                    .padding(8)
            } else {
                Image("ipsc")
                    .resizable()
                    .scaledToFit()
                    .frame(height: height * 0.5)
                    .padding(8)
            }

            Text(deviceName)
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.green)  // ← 已绑定显示绿色
                .lineLimit(1)
                .truncationMode(.tail)
        }
        .frame(width: width, height: height)
        .background(config != nil ? Color.gray.opacity(0.2) : Color.gray.opacity(0.1))
        .border(
            isDragHover ? Color.orange : accentColor,
            width: isDragHover ? 8 : 6
        )
        .scaleEffect(isDragging ? 0.9 : 1.0)
        .shadow(color: isDragging ? Color.black.opacity(0.5) : .clear, radius: isDragging ? 8 : 0)
        .animation(.spring(response: 0.2), value: isDragging)
        .animation(.spring(response: 0.2), value: isDragHover)
        .overlay(alignment: .topLeading) {
            // 序号标签
            Text("#\(seqNo)")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.white)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(accentColor)
                .cornerRadius(4)
                .padding(4)
        }
        .overlay(alignment: .topTrailing) {
            if let onTogglePopper = onTogglePopper {
                Button(action: onTogglePopper) {
                    Image(systemName: "plus.circle")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundColor(.white.opacity(0.7))
                        .padding(4)
                }
                .buttonStyle(.plain)
            }
        }
    }
}
```

### 4.8 TargetGridItem enum 改造

```swift
private enum TargetGridItem {
    case device(device: NetworkDevice, config: DrillTargetsConfigData, seqNo: Int)
    case unbound(config: DrillTargetsConfigData)   // 防御性: 数量不一致时（不应发生）
    case popper(parentDeviceName: String)
    case empty
}
```

### 4.9 onReceive 改造

删除 `updateTargetNamesForConnectedDevices` 的 `onReceive` 调用。改为只在设备列表变化时重新检查绑定有效性:

```swift
.onReceive(bleManager.$networkDevices) { devices in
    // 设备列表变化时，重新检查绑定
    // 如果已有 assignedDeviceName 且设备仍存在，保持不变
    // 如果设备不存在了，标记为需要重新绑定（但数量不一致时 DrillsTabView 已经拦截了）
    let currentNames = Set(devices.map { $0.name })
    for (index, config) in targetConfigs.enumerated() {
        if let assigned = config.assignedDeviceName, !currentNames.contains(assigned) {
            // 设备消失了，清空绑定（用户会回到 DrillsTabView 看到数量不一致提示）
            targetConfigs[index].assignedDeviceName = nil
        }
    }
}
```

### 4.10 onDisappear 同步到 CoreData

```swift
.onDisappear {
    // 把 selectedDrillTargetConfigs 中的 assignedDeviceName 写回 CoreData
    guard let drill = selectedDrillSetup else { return }  // 注意: 这里需要拿到 drill
    let context = PersistenceController.shared.container.viewContext
    let targets = drill.sortedTargets
    for (index, config) in targetConfigs.enumerated() {
        if index < targets.count {
            targets[index].assignedDeviceName = config.assignedDeviceName
        }
    }
    try? context.save()
}
```

**注意**: `selectedDrillSetup` 在 `DrillsTabView` 中。`TargetLinkView` 需要通过 binding 或闭包把 `assignedDeviceName` 传回。由于 `targetConfigs` 已经是 `@Binding`，`DrillsTabView.startDrill()` 直接从 `selectedDrillTargetConfigs` 读取即可，`onDisappear` 中的 CoreData 写回是额外的持久化保障。

---

## 任务 5: TargetConfigListViewV2 — 单靶自动绑定

**文件**: `flextarget/View/Drills/TargetConfigListView.swift`（修改）

单靶场景下，进入 `TargetConfigListViewV2` 时自动绑定:

```swift
.onAppear {
    ensurePrimaryTarget()
    clampCurrentTypeIndex()
    
    // 新增: 自动绑定 assignedDeviceName
    if targetConfigs.count == 1 && !bleManager.networkDevices.isEmpty {
        if targetConfigs[0].assignedDeviceName == nil {
            targetConfigs[0].assignedDeviceName = bleManager.networkDevices.first?.name
        }
    }
}
```

删除 `updateTargetNamesForConnectedDevices()` 中用设备名覆盖 `targetName` 的逻辑。`targetName` 保持逻辑名不变。

---

## 任务 6: DrillSyncService — 同步时保留 assignedDeviceName

**文件**: `flextarget/Services/DrillSyncService.swift`（修改）

`syncExportToCoreData` 更新时按 seqNo 匹配现有 target，更新参数但**保留 `assignedDeviceName`**:

```swift
@discardableResult
func syncExportToCoreData(
    _ export: DrillTemplateExport,
    context: NSManagedObjectContext
) throws -> DrillSetup {
    let fetchRequest = DrillSetup.fetchRequest()
    fetchRequest.predicate = NSPredicate(format: "serverTemplateId == %d", export.drillId)
    fetchRequest.fetchLimit = 1

    let existing = try context.fetch(fetchRequest).first
    let drillSetup: DrillSetup

    if let existing {
        drillSetup = existing
        drillSetup.name = export.name
        drillSetup.drillDuration = Double(export.timeout)
        drillSetup.serverSortOrder = Int32(export.sortOrder)
    } else {
        drillSetup = DrillSetup(context: context)
        drillSetup.id = UUID()
        drillSetup.name = export.name
        drillSetup.drillDuration = Double(export.timeout)
        drillSetup.serverSortOrder = Int32(export.sortOrder)
        drillSetup.delay = 3.0
        drillSetup.repeats = 1
        drillSetup.pause = 0
        drillSetup.mode = "ipsc"
    }

    drillSetup.serverTemplateId = Int32(export.drillId)
    drillSetup.isPersonal = true

    // 按 seqNo 匹配现有 target，保留 assignedDeviceName
    let existingTargets = drillSetup.sortedTargets
    var existingBySeqNo: [Int32: DrillTargetsConfig] = [:]
    for t in existingTargets {
        existingBySeqNo[t.seqNo] = t
    }

    let exportSeqNos = Set(export.targets.map { Int32($0.seqNo) })
    for (seqNo, target) in existingBySeqNo {
        if !exportSeqNos.contains(seqNo) {
            drillSetup.removeFromTargets(target)
            context.delete(target)
        }
    }

    for exportTarget in export.targets {
        let seqNo = Int32(exportTarget.seqNo)
        let target: DrillTargetsConfig

        if let existing = existingBySeqNo[seqNo] {
            target = existing  // 复用，保留 assignedDeviceName
        } else {
            target = DrillTargetsConfig(context: context)
            target.id = UUID()
        }

        target.seqNo = seqNo
        target.targetName = exportTarget.targetName  // 逻辑名
        target.targetType = DrillTargetsConfigData.encodeTargetTypes(exportTarget.targetType.asArray)
        target.timeout = exportTarget.timeout
        target.countedShots = Int32(exportTarget.countedShots)
        target.targetVariant = exportTarget.targetVariant.map { encodeStringArray($0) }
        target.hasPhysicalPopper = exportTarget.hasPhysicalPopper
        target.drillSetup = drillSetup
        // assignedDeviceName 保持现有值不变
    }

    try context.save()
    NotificationCenter.default.post(name: .drillRepositoryDidChange, object: nil)
    return drillSetup
}
```

---

## 文件变更清单

| 操作 | 文件 | 改动量 | 说明 |
|------|------|--------|------|
| 修改 | `DrillDataModel.xcdatamodeld/.../contents` | +1 attr | `assignedDeviceName` |
| 修改 | `DrillTargetsConfig+CoreDataClass.swift` | +1 行 | `@NSManaged` |
| 修改 | `DrillTargetsConfig.swift` | +2 行 | struct 字段 + toStruct |
| 修改 | `DrillExecutionManager.swift` | ~15 处 | `targetName` → `effectiveDeviceName` |
| 修改 | `TimerSessionView.swift` | ~3 行 | expectedDevices |
| 修改 | `DrillsTabView.swift` | ~50 行 | 拦截 + 底部设备数 + startDrill + DrillFormView 入口 |
| **修改** | **`TargetLinkView.swift`** | **~100 行** | **核心改造: 网格驱动方式 + 拖拽交换** |
| 修改 | `TargetConfigListView.swift` | ~10 行 | 单靶自动绑定 |
| 修改 | `DrillSyncService.swift` | ~20 行 | 保留 assignedDeviceName |

---

## 验证清单

### 编译
- [ ] 编译通过，无 warning

### DrillsTabView 层
- [ ] 底部显示"网络设备: N 个"，点击刷新按钮重新查询
- [ ] 设备数 = 0 时显示灰色圆点
- [ ] 点击模板，靶位数 ≠ 设备数 → Alert 拦截
- [ ] 点击模板，靶位数 = 设备数 → 正常导航

### TargetLinkView (多靶)
- [ ] 进入后自动按 seqNo 顺序分配 assignedDeviceName
- [ ] 每个格子显示 #序号 + targetType 图标 + 设备名
- [ ] 已缓存的绑定在设备组合不变时直接复用
- [ ] 长按格子 → 触觉反馈 + 缩小动画
- [ ] 拖拽到另一个格子 → 橙色高亮 → 松手交换 assignedDeviceName → 触觉反馈
- [ ] 双击 → greeting 命令发到对应设备
- [ ] 单击 → 进入 TargetConfigListViewV2 只读查看
- [ ] 右上角齿轮 → 进入 DrillFormView 查看服务器配置
- [ ] Start 按钮可用 → 点击 → 导航到 TimerSessionView

### TargetConfigListViewV2 (单靶)
- [ ] 进入后自动绑定 assignedDeviceName
- [ ] 显示 Start 按钮 → 点击 → 导航到 TimerSessionView

### TimerSessionView
- [ ] expectedDevices 使用 assignedDeviceName
- [ ] 命令正确路由到物理设备（非逻辑名）
- [ ] shot 回调正确匹配到对应靶位

### 同步
- [ ] 后台更新模板后同步 → assignedDeviceName 保留不丢失
- [ ] 设备断开重连 → 回到 DrillsTabView 看到数量更新
