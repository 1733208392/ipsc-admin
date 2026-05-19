# IPSC赛事管理系统 V2.0 账号体系 Vibe Coding Prompt
## 🎯 核心需求
### 角色体系
| 角色 | 权限范围 |
|------|----------|
| **超级管理员（平台）** | 全平台最高权限，可管理所有俱乐部账号、查看所有俱乐部所有赛事数据、全局配置 |
| **俱乐部管理员** | 仅能管理本俱乐部资源：创建赛事、录入射手、编排分队/Stage、记分、查看本俱乐部赛事统计 |
| **射手（可选）** | 查看个人成绩、个人信息修改（本阶段MVP可暂不实现，仅做账号体系预留） |
### 核心特性
1. **射手全平台唯一**：射手ID（shooter_uid）全局唯一，一次录入全平台复用，不同俱乐部导入射手时输入UID即可自动调取姓名/年龄/性别/俱乐部等基础信息
2. **数据强隔离**：俱乐部管理员仅能看到自己创建的赛事和属于本俱乐部的射手数据，无法访问其他俱乐部数据
3. **权限最小化**：每个API接口严格校验用户角色和数据所属俱乐部，越权访问直接返回403
## 🗄️ 数据模型变更
### 新增表 DDL
```sql
-- 俱乐部表
CREATE TABLE IF NOT EXISTS clubs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE, -- 俱乐部全称
  short_name TEXT NOT NULL, -- 简称（显示用）
  contact_name TEXT, -- 联系人
  contact_phone TEXT, -- 联系电话
  status TEXT DEFAULT 'active', -- active/inactive
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- 用户表（账号体系）
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE, -- 登录用户名
  password_hash TEXT NOT NULL, -- BCrypt加密密码
  role TEXT NOT NULL DEFAULT 'club_admin', -- super_admin / club_admin / shooter
  club_id INTEGER, -- 所属俱乐部ID，super_admin可为空
  name TEXT NOT NULL, -- 真实姓名
  phone TEXT, -- 联系电话
  status TEXT DEFAULT 'active', -- active/inactive
  last_login_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE SET NULL
);
-- 射手全局信息表
CREATE TABLE IF NOT EXISTS shooters_global (
  uid TEXT PRIMARY KEY, -- 全局唯一射手ID，推荐格式：SHOOTER-XXXXXX（6位数字）
  name TEXT NOT NULL, -- 姓名
  gender TEXT CHECK(gender IN ('male', 'female')) NOT NULL,
  age INTEGER,
  region TEXT, -- 所属地区
  default_club_id INTEGER, -- 所属默认俱乐部
  id_card TEXT UNIQUE, -- 身份证号（可选，用于身份校验）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (default_club_id) REFERENCES clubs(id) ON DELETE SET NULL
);
```
### 原有表字段新增
```sql
-- 赛事表新增所属俱乐部
ALTER TABLE matches ADD COLUMN club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE;
-- 原shooters表升级为赛事内射手表，关联全局射手UID
ALTER TABLE shooters ADD COLUMN shooter_uid TEXT REFERENCES shooters_global(uid) ON DELETE SET NULL;
ALTER TABLE shooters ADD COLUMN club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE;
-- 其他所有资源表（divisions/stages/squads/scores等）自动继承所属match的club_id，无需新增字段
```
## 🔐 鉴权体系
### 登录逻辑
1. 登录接口：`POST /auth/login`
   - 请求参数：`{ "username": "xxx", "password": "xxx" }`
   - 响应：`{ "success": true, "data": { "token": "JWT_TOKEN", "user": { "id": 1, "role": "club_admin", "club_id": 2, "name": "xxx" } } }`
2. JWT token 有效期：24小时， payload 包含`user_id, role, club_id`
3. 所有业务接口必须在请求头携带`Authorization: Bearer <TOKEN>`，无token或token无效直接返回401
### 权限校验规则
```typescript
// 全局中间件校验逻辑
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json(fail('未登录'));
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as JWTPayload;
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND status = "active"').get(decoded.user_id);
    if (!user) return res.status(401).json(fail('账号已禁用'));
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json(fail('登录已过期'));
  }
}
// 数据权限校验（针对单个资源）
function checkClubPermission(req: Request, resourceClubId: number): boolean {
  // 超管全权限
  if (req.user.role === 'super_admin') return true;
  // 俱乐部管理员仅能访问自己俱乐部的资源
  return req.user.club_id === resourceClubId;
}
```
## 📋 API 接口设计
### 1. 鉴权接口
| 方法 | 路径 | 权限 | 描述 |
|------|------|------|------|
| POST | `/auth/login` | 公开 | 登录获取token |
| POST | `/auth/logout` | 登录用户 | 登出 |
| GET | `/auth/me` | 登录用户 | 获取当前用户信息 |
### 2. 平台超管接口
| 方法 | 路径 | 权限 | 描述 |
|------|------|------|------|
| GET | `/admin/clubs` | super_admin | 获取所有俱乐部列表 |
| POST | `/admin/clubs` | super_admin | 创建新俱乐部 |
| PUT | `/admin/clubs/:id` | super_admin | 修改俱乐部信息 |
| DELETE | `/admin/clubs/:id` | super_admin | 删除俱乐部 |
| GET | `/admin/users` | super_admin | 获取所有用户列表 |
| POST | `/admin/users` | super_admin | 创建用户（含俱乐部管理员账号） |
| PUT | `/admin/users/:id` | super_admin | 修改用户信息/重置密码 |
| DELETE | `/admin/users/:id` | super_admin | 删除用户 |
| GET | `/admin/matches` | super_admin | 查看全平台所有赛事列表 |
| GET | `/admin/matches/:id` | super_admin | 查看任意赛事详情 |
### 3. 俱乐部管理员接口
| 方法 | 路径 | 权限 | 描述 |
|------|------|------|------|
| GET | `/shooters/global/search` | club_admin | 全局搜索射手（按UID/姓名/手机号） |
| POST | `/shooters/global` | club_admin | 新增全局射手（自动分配UID） |
| PUT | `/shooters/global/:uid` | club_admin | 修改全局射手信息（仅能修改所属俱乐部为自己俱乐部的射手） |
| *原有所有赛事相关接口* | `/matches/*` | club_admin | 原有接口保留，自动校验赛事所属club_id是否匹配当前用户club_id |
## 🔧 原有接口适配规则
1. **创建赛事**：`POST /matches` 自动填充`club_id = req.user.club_id`，无需前端传递
2. **查询赛事列表**：`GET /matches` 俱乐部管理员仅返回`club_id = req.user.club_id`的赛事，超管返回所有
3. **所有赛事下的子资源接口**（/matches/:id/*）：自动从match表读取club_id，校验是否与当前用户club_id匹配，不匹配返回403
4. **导入射手**：`POST /matches/:id/shooters` 支持传入`shooter_uid`，自动从shooters_global表拉取姓名/性别/年龄等信息填充，无需重复录入
## 👨💻 前端适配点
1. 新增登录页：用户名/密码登录
2. 新增平台超管后台：俱乐部管理、用户管理、全局赛事查看
3. 俱乐部后台保留原有所有功能，数据自动隔离
4. 射手录入页新增「全局搜索」功能，输入UID自动填充信息
## 🚀 MVP 实现优先级
1. ✅ 数据库表结构升级 + 鉴权中间件
2. ✅ 登录/权限校验逻辑
3. ✅ 原有接口权限适配
4. ✅ 超管俱乐部/用户管理接口
5. ✅ 全局射手搜索/导入功能