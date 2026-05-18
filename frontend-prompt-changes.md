# IPSC 管理后台前端变更 — Coding Prompt

## 项目信息

- 路径: `/Volumes/SSD2/Projects/GCS/ipsc-admin`
- 技术栈: React 19 + Vite 8 + TypeScript + Tailwind CSS 4 + shadcn/ui + react-router-dom 7 + react-hook-form + zod
- API 层: `src/lib/api.ts` — `api.get/post/put/patch/delete`
- 状态: `src/hooks/useMatch.tsx` — MatchContext
- 后端: `http://localhost:3001/api/v1`

## ⚠️ 重要：三个后端变更必须先完成

本 Prompt 依赖以下三个后端变更已经部署：
1. **射手新增字段** — age, gender, region, club
2. **组别+积分榜体系** — 5 固定组别(code), 积分榜三维筛选(division/category/stage)
3. **自动编组** — POST /squads/auto-assign, 手动调整接口

---

## 变更 1: TypeScript 类型更新 — `src/types/index.ts`

### 1.1 Division 类型

```typescript
export interface Division {
  id: number
  match_id: number
  code: 'production' | 'optics' | 'open' | 'standard' | 'classic'  // 新增
  name: string
  power_factor: 'minor' | 'major'   // 保留，由 code 决定
  sort_order: number
}
```

### 1.2 Shooter 类型

```typescript
export interface Shooter {
  id: number
  match_id: number
  division_id: number
  squad_id: number | null            // 改为可 null
  name: string
  bib_number: string
  age: number | null                 // 新增
  gender: 'male' | 'female' | null   // 新增
  region: string | null              // 新增
  club: string | null                // 新增
  division_name?: string
  squad_name?: string
  stages_shot?: number
}
```

### 1.3 LeaderboardEntry 类型

```typescript
export interface LeaderboardEntry {
  id: number
  name: string
  bib_number: string
  age: number | null                // 新增
  gender: string | null             // 新增
  region: string | null             // 新增
  club: string | null               // 新增
  division_id?: number              // 新增
  division_code?: string            // 新增
  division_name: string
  power_factor: string
  stages_shot: number
  total_points: number
  avg_hit_factor: number
  // Stage 维度字段（仅 stage_id 查询时有值）
  stage_hit_factor?: number         // 新增
  stage_points?: number             // 新增
  stage_time?: number               // 新增
  a_hits?: number                   // 新增
  c_hits?: number                   // 新增
  d_hits?: number                   // 新增
  m_hits?: number                   // 新增
  n_hits?: number                   // 新增
  pe?: number                       // 新增
  confirmed?: number                // 新增
}
```

### 1.4 LeaderboardResponse 类型

```typescript
// 积分榜响应从数组变为对象
export interface LeaderboardResponse {
  filters: {
    division: number | 'overall'
    category: string | null
    stage: number | null
  }
  rankings: LeaderboardEntry[]
}
```

---

## 变更 2: 组别页面重写 — `src/pages/DivisionsPage.tsx`

### 现状问题

- 手动创建/编辑/删除组别，含 power_factor 选择
- 不符合"5 个固定组别"的新需求

### 改为

- **赛事创建时后端自动初始化 5 个组别，前端只展示**
- 隐藏"添加组别"按钮
- 隐藏"删除组别"按钮
- 保留编辑功能（改显示名称、排序）
- 表格新增 `code` 列显示组别代码
- Power Factor 列保留但改为只读 Badge（由 code 决定，不可编辑）

### 新增 Division code → 中文名映射

```typescript
const DIVISION_LABELS: Record<string, string> = {
  production: '原厂',
  optics: '原厂光学',
  open: '开放',
  standard: '标准',
  classic: '经典',
}
```

### UI 布局

```
┌──────────────────────────────────────────────────────┐
│ 组别管理                                              │
├──────┬──────────────┬──────────┬──────┬──────────────┤
│ Code │ 组别名称       │ PF       │ 排序  │ 操作         │
├──────┼──────────────┼──────────┼──────┼──────────────┤
│ prod │ 原厂          │ 🔵 minor │  0   │ ✏️           │
│ optc │ 原厂光学       │ 🔵 minor │  1   │ ✏️           │
│ std  │ 标准          │ 🟠 major │  2   │ ✏️           │
│ open │ 开放          │ 🟠 major │  3   │ ✏️           │
│ cls  │ 经典          │ 🟠 major │  4   │ ✏️           │
└──────┴──────────────┴──────────┴──────┴──────────────┘

编辑弹窗: 只允许改 name 和 sort_order，code 和 power_factor 只读
```

### 编辑弹窗 Zod Schema

```typescript
const schema = z.object({
  name: z.string().min(1, '必填'),
  sort_order: z.coerce.number().int().default(0),
  // 不再包含 power_factor（由 code 决定）
  // 不再包含 code（不可修改）
})
```

---

## 变更 3: 射手页面 — `src/pages/ShootersPage.tsx`

### 3.1 新增表单字段

添加射手弹窗增加 4 个字段：

```typescript
const schema = z.object({
  bib_number: z.string().min(1, '必填'),
  name: z.string().min(1, '必填'),
  division_id: z.coerce.number().int().positive('请选择组别'),
  squad_id: z.coerce.number().int().positive().optional(),  // 改为 optional
  age: z.coerce.number().int().min(0).max(120).optional(),
  gender: z.enum(['male', 'female']).optional(),
  region: z.string().max(50).optional(),
  club: z.string().max(100).optional(),
})
```

### 3.2 弹窗布局

```
┌─ 添加射手 ─────────────────────────────┐
│                                         │
│  Bib 号 [____]   姓名 [____]           │
│                                         │
│  组别 [▼ 原厂]   Squad [▼ 可选]         │
│                                         │
│  年龄 [____]     性别 [▼ 可选]          │
│                                         │
│  区域 [____]     俱乐部 [____]          │
│                                         │
│           [取消]  [保存]                 │
└─────────────────────────────────────────┘
```

- `squad_id` 改为 optional — 不选时传 null（未编组）
- `age` 用 `type="number"` Input
- `gender` 用 Select（男 male / 女 female / 不选）
- `region` 用 Input
- `club` 用 Input

### 3.3 表格新增列

```
┌──────┬──────┬──────┬──────┬──────┬──────┬──────────┬─────────┐
│ Bib  │ 姓名  │ 组别  │ 年龄  │ 性别  │ 区域  │ 俱乐部    │ 操作    │
├──────┼──────┼──────┼──────┼──────┼──────┼──────────┼─────────┤
│ 42   │ 张三  │ Open │ 32   │ 男   │ 上海 │ 铳义堂    │ ✏️ 🗑️   │
└──────┴──────┴──────┴──────┴──────┴──────┴──────────┴─────────┘
```

- 新增：年龄、性别、区域、俱乐部 列
- 性别显示：`male` → `男`, `female` → `女`, `null` → `-`
- 空值显示 `-`

### 3.4 编辑射手弹窗

编辑时 pre-fill 所有字段包括 age, gender, region, club：
```typescript
function openEdit(s: Shooter) {
  setEditing(s)
  reset({
    bib_number: s.bib_number,
    name: s.name,
    division_id: s.division_id,
    squad_id: s.squad_id ?? 0,
    age: s.age ?? undefined,
    gender: s.gender ?? undefined,
    region: s.region ?? '',
    club: s.club ?? '',
  })
  setOpen(true)
}
```

### 3.5 Squad 下拉改为可选

- 新增一个 "未编组" 选项（value = "0" 或特殊标记）
- 选择 "未编组" 时提交 squad_id = null

```tsx
<Select
  value={watch('squad_id') ? String(watch('squad_id')) : 'none'}
  onValueChange={v => setValue('squad_id', v === 'none' ? 0 : Number(v))}
>
  <SelectTrigger><SelectValue placeholder="选择 Squad（可选）" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="none">未编组</SelectItem>
    {squads.map(s => (
      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

---

## 变更 4: Squad 页面重写 — `src/pages/SquadsPage.tsx`

### 现状

- 简单的 Squad CRUD 列表
- 只显示名称和人数

### 改为：Squad 管理 + 自动编组 + 射手队列

#### 4.1 顶部操作区

```
┌─────────────────────────────────────────────────────────────┐
│ Squad 管理                                    [自动编组] [+] │
└─────────────────────────────────────────────────────────────┘
```

- **[自动编组]** 按钮 → 打开自动编组弹窗
- **[+]** 保留手动创建 Squad

#### 4.2 自动编组弹窗

```
┌─ 自动编组 ──────────────────────────────┐
│                                          │
│  排序依据 [▼ 报名顺序]                    │
│    选项: 报名顺序 / BIB号 / 组别 /        │
│          随机 / 区域 / 俱乐部             │
│                                          │
│  每组人数 [10]                            │
│                                          │
│  编组策略 [▼ 顺序切片]                    │
│    选项: 顺序切片 / 蛇形均衡 / 组别均衡    │
│                                          │
│  ☐ 清除已有编组重新分配                    │
│                                          │
│           [取消]  [开始编组]               │
└──────────────────────────────────────────┘
```

Zod Schema:
```typescript
const autoAssignSchema = z.object({
  sort_by: z.enum(['registration', 'bib', 'division', 'random', 'region', 'club']),
  group_size: z.number().int().min(1).max(100),
  strategy: z.enum(['sequential', 'snake', 'division_balanced']),
  clear_existing: z.boolean(),
})
```

提交后调用 `POST /matches/:matchId/squads/auto-assign`，成功后刷新列表。

#### 4.3 Squad 列表改为卡片式

每个 Squad 一张卡片，内含射手列表：

```
┌─ Squad 1 ─────────────── 10 人 ───── ✏️ 🗑️ ─┐
│                                               │
│  #1  张三  BIB:42  Open     [移出]            │
│  #2  李四  BIB:88  原厂     [移出]            │
│  #3  王五  BIB:100 标准     [移出]            │
│  ...                                          │
│                                               │
│  [+ 添加射手到本组]                            │
└───────────────────────────────────────────────┘

┌─ Squad 2 ─────────────── 8 人 ───── ✏️ 🗑️ ──┐
│  ...                                          │
└───────────────────────────────────────────────┘
```

- 点击 **[移出]** → `DELETE /squads/:squadId/shooters/:shooterId` → 射手 squad_id 置 null
- 点击 **[+ 添加射手到本组]** → 弹窗选择未编组的射手 → `POST /squads/:squadId/shooters`

#### 4.4 新增状态：未编组射手区

在所有 Squad 卡片下方，显示未编组的射手：

```
┌─ 未编组射手 ──────────────── 5 人 ─────────────┐
│  赵六  BIB:55  原厂    [编入 ▼] → 选 Squad     │
│  钱七  BIB:66  Open    [编入 ▼] → 选 Squad     │
│  ...                                            │
└─────────────────────────────────────────────────┘
```

- 用 `GET /matches/:matchId/shooters` 过滤 squad_id 为 null 的射手
- **[编入 ▼]** 下拉选目标 Squad → `POST /squads/:squadId/shooters`

---

## 变更 5: 积分榜页面重写 — `src/pages/LeaderboardPage.tsx`

### 现状

- 两层 Tabs: Overall + 各 Division
- 调用 `api.get<LeaderboardEntry[]>()` 直接取数组
- 只显示总成绩

### 改为：三维筛选积分榜

#### 5.1 响应格式变更

```typescript
// 旧：直接取数组
const data = await api.get<LeaderboardEntry[]>(`/matches/${matchId}/leaderboard`)

// 新：取 rankings 字段
const resp = await api.get<LeaderboardResponse>(`/matches/${matchId}/leaderboard`)
const data = resp.rankings
```

#### 5.2 三行筛选 UI

```
┌───────────────────────────────────────────────────────┐
│ 积分榜                          每 10 秒自动刷新       │
├───────────────────────────────────────────────────────┤
│                                                       │
│  Division: [Overall] [原厂] [原厂光学] [标准] [开放] [经典] │
│                                                       │
│  Category: [全部] [青少年] [老年] [超级老年] [女子]       │
│                                                       │
│  Stage:    [总成绩] [Stage 1] [Stage 2] [Stage 3] ...   │
│                                                       │
├───────────────────────────────────────────────────────┤
│  排名 │ Bib │ 姓名 │ 组别 │ 区域 │ 俱乐部 │ 总积分 │ HF  │
│  🥇  │ 42  │ 张三 │ Open │ 上海 │ 铳义堂 │ 156.00│ 4.21│
│  🥈  │ ... │ ...  │ ...  │ ...  │ ...    │ ...   │ ... │
└───────────────────────────────────────────────────────┘
```

#### 5.3 三行筛选实现

```typescript
// State
const [selectedDivision, setSelectedDivision] = useState<string>('overall')
const [selectedCategory, setSelectedCategory] = useState<string>('all')
const [selectedStage, setSelectedStage] = useState<string>('all')
const [stages, setStages] = useState<Stage[]>([])

// 加载 stages 列表（用于 Stage 筛选行）
useEffect(() => {
  api.get<Stage[]>(`/matches/${matchId}/stages`).then(setStages)
}, [matchId])

// 构建查询 URL
function buildLeaderboardUrl(): string {
  const params = new URLSearchParams()
  if (selectedDivision !== 'overall') params.set('division_id', selectedDivision)
  if (selectedCategory !== 'all') params.set('category', selectedCategory)
  if (selectedStage !== 'all') params.set('stage_id', selectedStage)
  const qs = params.toString()
  return `/matches/${matchId}/leaderboard${qs ? `?${qs}` : ''}`
}

// 数据加载
async function load() {
  const url = buildLeaderboardUrl()
  const resp = await api.get<LeaderboardResponse>(url)
  setRankings(resp.rankings)
}
```

#### 5.4 Division 行

```tsx
<div className="flex gap-1 flex-wrap">
  <Button
    variant={selectedDivision === 'overall' ? 'default' : 'outline'}
    size="sm"
    onClick={() => setSelectedDivision('overall')}
  >
    Overall
  </Button>
  {divisions.map(d => (
    <Button
      key={d.id}
      variant={selectedDivision === String(d.id) ? 'default' : 'outline'}
      size="sm"
      onClick={() => setSelectedDivision(String(d.id))}
    >
      {d.name}
    </Button>
  ))}
</div>
```

#### 5.5 Category 行

```tsx
const categories = [
  { value: 'all', label: '全部' },
  { value: 'junior', label: '青少年' },
  { value: 'senior', label: '老年' },
  { value: 'super_senior', label: '超级老年' },
  { value: 'lady', label: '女子' },
]

<div className="flex gap-1 flex-wrap">
  {categories.map(c => (
    <Button
      key={c.value}
      variant={selectedCategory === c.value ? 'secondary' : 'ghost'}
      size="sm"
      onClick={() => setSelectedCategory(c.value)}
    >
      {c.label}
    </Button>
  ))}
</div>
```

#### 5.6 Stage 行

```tsx
<div className="flex gap-1 flex-wrap">
  <Button
    variant={selectedStage === 'all' ? 'secondary' : 'ghost'}
    size="sm"
    onClick={() => setSelectedStage('all')}
  >
    总成绩
  </Button>
  {stages.map(s => (
    <Button
      key={s.id}
      variant={selectedStage === String(s.id) ? 'secondary' : 'ghost'}
      size="sm"
      onClick={() => setSelectedStage(String(s.id))}
    >
      {s.name}
    </Button>
  ))}
</div>
```

#### 5.7 表格列变化

**总成绩模式**（不选 stage）：
| 排名 | Bib | 姓名 | 组别 | 区域 | 俱乐部 | 完成Stage | 总积分 | 平均HF |

**单 Stage 模式**（选了 stage_id）：
| 排名 | Bib | 姓名 | 组别 | HF | 得分 | 用时 | A | C | D | M | N | PE | 确认 |

```tsx
// 表头条件渲染
{selectedStage === 'all' ? (
  <>
    <TableHead>完成Stage</TableHead>
    <TableHead className="text-right font-semibold">总积分</TableHead>
    <TableHead className="text-right">平均HF</TableHead>
  </>
) : (
  <>
    <TableHead className="text-right">HF</TableHead>
    <TableHead className="text-right">得分</TableHead>
    <TableHead className="text-right">用时</TableHead>
    <TableHead className="text-center">A</TableHead>
    <TableHead className="text-center">C</TableHead>
    <TableHead className="text-center">D</TableHead>
    <TableHead className="text-center">M</TableHead>
    <TableHead className="text-center">N</TableHead>
    <TableHead className="text-center">PE</TableHead>
  </>
)}
```

---

## 涉及文件清单

| 文件 | 改动 |
|------|------|
| `src/types/index.ts` | Division/Shooter/LeaderboardEntry/LeaderboardResponse 类型更新 |
| `src/pages/DivisionsPage.tsx` | 重写 — 固定5组别，只展示+编辑名称，不可增删 |
| `src/pages/ShootersPage.tsx` | 表单+表格新增 age/gender/region/club，squad_id 改可选 |
| `src/pages/SquadsPage.tsx` | 重写 — 自动编组弹窗+卡片式布局+未编组射手区 |
| `src/pages/LeaderboardPage.tsx` | 重写 — 三维筛选(division/category/stage)+响应格式适配 |

共 5 个文件。

## 验证

```bash
cd /Volumes/SSD2/Projects/GCS/ipsc-admin
npm run build    # TypeScript 编译通过
npm run dev      # 浏览器打开 http://localhost:5173 逐页验证
```

### 逐页检查项

1. **组别页**: 显示 5 个固定组别，不可添加/删除，编辑只能改名称
2. **射手页**: 添加/编辑弹窗有 age/gender/region/club 字段，表格显示新列
3. **Squad 页**: 有自动编组按钮和弹窗，Squad 卡片内展示射手列表，可移出/添加射手
4. **积分榜页**: 三行筛选器可切换，数据正确刷新，Stage 模式显示详细命中数据
