# Codex 提示词：OTA 服务端实现（GCS ipsc-backend）

## 角色

你是 GCS（Ground Control System）后端工程师，负责在现有 `ipsc-backend`（Node.js + Express + TypeScript + better-sqlite3）中从零实现 OTA 分发包管理 API，供 iOS App（OTACore.swift / OTAService.swift）和 Godot 设备端调用。

## 任务背景

- **项目路径**：`/Volumes/SDD2/Projects/GCS/ipsc-backend/`
- **现有技术栈**：Node.js + Express + TypeScript（ESM）+ better-sqlite3 + zod + multer + jsonwebtoken
- **部署环境**：腾讯云香港轻量服务器 `43.132.237.60`，域名 `https://api.grwolf.com`，PM2 cluster 模式
- **数据库**：SQLite WAL 模式，路径 `data/ipsc.db`
- **认证体系**：JWT access token + refresh token（见 `src/auth.ts`），`authMiddleware` 校验 `Authorization: Bearer <token>`
- **现有响应封装**：`ok(data)` → `{success: true, data}`；`fail(error)` → `{success: false, error}`（见 `src/types.ts`）
- **现有路由注册**：在 `src/index.ts` 中 `api.use('/xxx', xxxRouter)`，所有业务路由挂在 `/api/v1` 下，认证中间件 `authMiddleware` 保护

## 用户决策（已锁定，不要再讨论替代方案）

1. **OTA 流程方案**：方案 B —— iOS 拉取 OTA 元数据后通过 BLE 把 `{address, checksum, version}` 发给设备，设备直连服务器下载
2. **OTA 包来源**：香港服务器自身，下载 URL 形如 `https://api.grwolf.com/ota/files/<filename>.zip`
3. **OTA 包内容**：仅 Godot 应用（`GODotTetris.arm64` + `metadata.json` + `start.sh`，打包为 zip）
4. **固件不能改**：不能新增 BLE 指令，只能复用现有的 `start_game_upgrade` / `prepare_game_disk_ota` / `finish_game_disk_ota` / `reload_ui` / `recoveryGameDiskOTA` / `queryVersion`
5. **Godot 端可直连服务器**：设备有 WiFi 能力，Godot 的 `HttpService.download_and_verify(address, checksum, version, callback)` 已经能直接从 HTTP(S) URL 下载并校验 SHA1

## 接口契约（iOS OTAService.swift 已实现的客户端，必须匹配）

iOS 客户端代码位于 `/Volumes/SSD2/Projects/FlexTargetRepo/FlexTargetiOS/flextarget/View/BLE/OTACore.swift`，关键结构：

```swift
struct OTAVersion: Codable {
    let version: String
    let address: String   // 下载 URL
    let checksum: String  // SHA1 hex
}

struct OTALatestResponse: Codable {
    let code: Int     // 0 = 成功
    let msg: String
    let data: OTAVersion?
}

struct OTAHistoryResponse: Codable {
    let code: Int
    let msg: String
    let data: { total_count: Int, limit: Int, page: Int, rows: [OTAVersion] }?
}
```

### ⚠️ 响应格式冲突（必须处理）

- 现有后端 `ok`/`fail` 返回 `{success, data}`
- iOS OTA 期望 `{code, msg, data}`
- **决策**：为 OTA 路由单独定义响应封装函数 `otaOk(data)` 和 `otaFail(code, msg)`，返回 `{code: 0, msg: 'ok', data}` 和 `{code, msg, data: null}`，**不要修改全局 `ok`/`fail`**，避免破坏其他路由

### ⚠️ limit 默认值差异

- 飞书文档 2.4.2：`limit` 默认 **30**
- iOS OTAService.swift 硬编码 `limit: Int = 10`（客户端会显式传 10，所以服务端默认值不会被触发，但服务端必须按文档默认 30）
- 服务端实现：`limit` 默认 30，接受客户端传入的任意值（最大 50）

## 需要实现的接口

### 1. POST `/api/v1/ota/game`（获取最新 OTA 版本）

**请求体**：
```json
{ "auth_data": "<string>" }
```

**逻辑**：
- `auth_data` 字段当前是 iOS 设备 auth token，**本期实现先不校验**（直接忽略，未来再加设备鉴权）
- 从 `ota_packages` 表中查询 `status = 'published'` 的最新一条（按 `created_at DESC` 排序）
- 无数据时返回 `code=0, msg='ok', data=null`（iOS 端会处理 null）

**成功响应**：
```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "version": "2.4.1",
    "address": "https://api.grwolf.com/ota/files/flextarget-2.4.1.zip",
    "checksum": "a1b2c3d4e5f6..."
  }
}
```

### 2. POST `/api/v1/ota/game/history`（获取版本历史）

**请求体**：
```json
{ "auth_data": "<string>", "page": 1, "limit": 30 }
```

**默认值**（按飞书文档 2.4.2）：
- `page` 默认 1
- `limit` 默认 30，最大 50

**逻辑**：
- `auth_data` 忽略
- `page` 默认 1，`limit` 默认 30，最大 50
- 查询 `ota_packages` 表中 `status = 'published'` 的记录，按 `created_at DESC` 分页
- 返回 `{total_count, limit, page, rows}`

**成功响应**：
```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "total_count": 5,
    "limit": 30,
    "page": 1,
    "rows": [
      { "version": "2.4.1", "address": "...", "checksum": "..." },
      { "version": "2.4.0", "address": "...", "checksum": "..." }
    ]
  }
}
```

### 3. 管理后台接口（挂在 `/api/v1/admin/ota/`，需要 `authMiddleware` + `role='super_admin'`）

参考现有 `src/routes/admin.ts` 风格。

#### 3.1 GET `/api/v1/admin/ota/packages`
列出所有 OTA 包（含 draft/published/archived），支持 `?status=published&page=1&limit=20` 过滤

#### 3.2 GET `/api/v1/admin/ota/packages/:id`
获取单个 OTA 包详情

#### 3.3 POST `/api/v1/admin/ota/packages`（上传新包）
- **multipart/form-data**：`file`（zip 文件，max 200MB）+ 表单字段 `version`（必填，semver 格式 `x.y.z`）+ `notes`（可选，string）+ `status`（可选，默认 `draft`）
- **处理流程**：
  1. 校验 `version` 唯一性（`ota_packages.version` UNIQUE）
  2. multer 接收文件到 `data/ota-files/<uuid>.zip`（目录需先创建）
  3. 计算 SHA1 checksum（`crypto.createHash('sha1')` 流式读取文件）
  4. 文件大小存入 DB
  5. `address` 字段拼接为 `${BASE_URL}/ota/files/<filename>`，其中 `BASE_URL` 从环境变量 `OTA_PUBLIC_BASE_URL` 读取（默认 `https://api.grwolf.com`）
  6. 插入 `ota_packages` 表
- **响应**：返回标准 `ok(package)` 格式（管理后台用 `{success, data}`）

#### 3.4 PUT `/api/v1/admin/ota/packages/:id`
更新 `status`（draft → published / archived）、`notes`、`is_latest` 标记
- 当 `status` 从其他值改为 `published` 时，自动把其他 published 包标记为 `archived`（保证同一时间只有一个 published 版本）
- 也允许更新 `is_latest = true`（用于显式指定某个版本为推荐版本，业务上 `/ota/game` 返回 `is_latest = true` 的包，而不是最新 created_at 的包；如果没有任何 `is_latest=true`，则 fallback 到最新 published 的包）

#### 3.5 DELETE `/api/v1/admin/ota/packages/:id`
- 软删除：将 `status` 改为 `archived`，不物理删除文件
- 如果是 `is_latest=true` 的包被删除，需要把最新的 published 包设为 `is_latest=true`

### 4. 静态文件路由

在 `src/index.ts` 中添加：
```ts
app.use('/ota/files', express.static(path.resolve(__dirname, '..', 'data/ota-files')));
```

**注意**：此路径**不需要** JWT 认证（设备 Godot 端直接 HTTP GET 下载，无法携带 JWT）。但要加简单的防护：
- 仅允许 `.zip` 扩展名
- 设置 `Content-Disposition: attachment`
- Cache-Control: public, max-age=3600

## 数据库表设计

在 `src/db.ts` 的 `db.exec(...)` 中新增（保证幂等，用 `CREATE TABLE IF NOT EXISTS`）：

```sql
CREATE TABLE IF NOT EXISTS ota_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL UNIQUE,                    -- semver: x.y.z
  notes TEXT NOT NULL DEFAULT '',
  filename TEXT NOT NULL,                          -- 服务器上的实际文件名 (uuid.zip)
  original_filename TEXT NOT NULL DEFAULT '',      -- 上传时的原始文件名
  size_bytes INTEGER NOT NULL DEFAULT 0,
  checksum TEXT NOT NULL,                          -- SHA1 hex
  address TEXT NOT NULL,                           -- 完整下载 URL
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  is_latest INTEGER NOT NULL DEFAULT 0,            -- 0 or 1
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ota_packages_status ON ota_packages(status);
CREATE INDEX IF NOT EXISTS idx_ota_packages_is_latest ON ota_packages(is_latest) WHERE is_latest = 1;
```

## 文件结构（需要新建的文件）

```
src/
├── routes/
│   ├── ota.ts                  ← 新建：公开 OTA API（/ota/game, /ota/game/history）
│   └── admin-ota.ts            ← 新建：管理后台 OTA API（/admin/ota/*）
├── services/
│   └── ota.ts                  ← 新建：OTA 业务逻辑（checksum 计算、地址拼接、is_latest 管理）
└── types.ts                    ← 修改：添加 OTA 相关 zod schemas
```

修改的文件：
- `src/index.ts`：注册新路由 + 添加 `/ota/files` 静态路由
- `src/db.ts`：添加 `ota_packages` 表创建
- `src/types.ts`：添加 `OtaPackageSchema`、`OtaUploadSchema`、`OtaUpdateSchema`

## 代码风格要求

- 严格遵循现有项目的代码风格（看 `src/routes/admin.ts`、`src/routes/stage-attachments.ts` 参考）
- TypeScript strict mode，所有输入用 zod 校验
- 错误处理用 try/catch + `res.status(500).json(fail(...))`
- 数据库操作用 `db.prepare(...).get/all/run`（better-sqlite3 同步 API）
- 文件路径用 `path.resolve(__dirname, '..', ...)` 风格
- 不要用 `any`，必要时用 `unknown` + 类型守卫
- ESM 导入（`import x from 'x'`），不要 CommonJS

## 测试要求

实现完成后，提供以下 curl 命令用于验证（写入 `scripts/test-ota.sh`）：

```bash
#!/bin/bash
BASE_URL="${BASE_URL:-https://api.grwolf.com/api/v1}"

# 1. 获取 token（管理员登录）
TOKEN=$(curl -s -X POST "$BASE_URL/auth/login/email" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}' | jq -r '.data.token')

# 2. 上传 OTA 包
curl -X POST "$BASE_URL/admin/ota/packages" \
  -H "Authorization: Bearer $TOKEN" \
  -F "version=2.4.1" \
  -F "notes=Initial release" \
  -F "status=published" \
  -F "file=@/tmp/fake-ota-package.zip"

# 3. 获取最新版本（设备/iOS 调用）
curl -X POST "$BASE_URL/ota/game" \
  -H "Content-Type: application/json" \
  -d '{"auth_data":"test"}'

# 4. 获取历史
curl -X POST "$BASE_URL/ota/game/history" \
  -H "Content-Type: application/json" \
  -d '{"auth_data":"test","page":1,"limit":30}'

# 5. 列出所有包（管理后台）
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/admin/ota/packages"
```

## 部署要求

- 不要修改 `ecosystem.config.cjs`（OTA 不需要新的环境变量，除了可选的 `OTA_PUBLIC_BASE_URL`，默认值为 `https://api.grwolf.com`）
- 构建命令：`npm run build`（输出到 `dist/`）
- 不要动 nginx 配置，`/ota/files/*` 路径由 Express 直接服务
- 部署到香港服务器：本地 `npm run build` → `rsync -avz --no-owner --no-group dist/ root@43.132.237.60:/home/ipsc-backend/dist/` → 服务器 `source ~/.nvm/nvm.sh && pm2 restart ipsc-api`

## 验收标准

1. ✅ `POST /api/v1/ota/game` 返回 `{code:0, msg:'ok', data:{version, address, checksum}}` 或 `{code:0, msg:'ok', data:null}`
2. ✅ `POST /api/v1/ota/game/history` 返回 `{code:0, msg:'ok', data:{total_count, limit, page, rows}}`
3. ✅ 管理员可以上传 zip 包，系统自动计算 SHA1 并存储
4. ✅ `GET /ota/files/<filename>.zip` 可以直接下载（无需认证）
5. ✅ 同一时间只有一个 `is_latest=true` 的 published 包
6. ✅ iOS OTAService.swift 调用 `/ota/game` 能正确解析响应（code/msg/data 字段对齐）
7. ✅ Godot 端 `HttpService.download_and_verify(address, checksum, version, callback)` 能从返回的 `address` 下载并校验 SHA1
8. ✅ 现有所有路由（auth/matches/scores 等）不受影响

## 边界与约束

- **不要实现**：iOS 客户端改造、Godot 端改造、固件改造（这些由用户手动处理）
- **不要实现**：自动 OTA 触发、定时检查、推送通知（本期仅做被动查询 API）
- **不要实现**：OTA 包签名验证（仅用 SHA1 checksum，未来可加 RSA 签名）
- **不要实现**：增量升级 / 差分包（仅整包替换）
- **不要实现**：固件 OTA（仅 Godot 应用 OTA）
- 不要新增 npm 依赖（项目已有 `multer`、`crypto`、`path`、`fs`）

## 参考代码位置

- 响应封装：`src/types.ts` 第 498-506 行
- 路由注册风格：`src/index.ts` 第 50-113 行
- multer 文件上传：`src/routes/stage-attachments.ts` 第 1-50 行
- admin 路由风格：`src/routes/admin.ts`
- 数据库表创建：`src/db.ts` 第 20-100 行
- 认证中间件：`src/auth.ts` 第 138-170 行
- iOS 客户端契约：`/Volumes/SDD2/Projects/FlexTargetRepo/FlexTargetiOS/flextarget/View/BLE/OTACore.swift` 第 50-110 行
- Godot 下载逻辑：`/Volumes/SSD2/Projects/FlexTargetRepo/FlexTargetGodot/script/HttpService.gd` 第 451-700 行

## 交付物

1. 修改后的 `src/db.ts`（添加 `ota_packages` 表）
2. 修改后的 `src/types.ts`（添加 OTA schemas）
3. 修改后的 `src/index.ts`（注册 OTA 路由 + 静态文件路由）
4. 新建的 `src/services/ota.ts`
5. 新建的 `src/routes/ota.ts`
6. 新建的 `src/routes/admin-ota.ts`
7. 新建的 `scripts/test-ota.sh`
8. `npm run build` 成功无错误
9. 更新 `package.json` 不需要（无新依赖）

完成后告诉我每个文件的路径和主要改动点，我会 review。
