# Mobile App Auth Upgrade Prompt (Access + Refresh Token)

你是移动端资深工程师，请把现有登录鉴权从“仅 access token”升级为“access token + refresh token”机制，适配以下后端接口与行为。

## 目标

1. 登录后保存 access_token 与 refresh_token。
2. 每次请求自动带上 Authorization: Bearer access_token。
3. access_token 过期时自动调用 refresh 接口换新 token，再自动重试原请求。
4. refresh 失败时清理本地会话并跳转登录页。
5. 退出登录时调用 logout 并传 refresh_token，使服务端吊销该 refresh token。

## 后端接口约定

### 1) 登录

- Method: POST
- URL: /api/v1/auth/login
- Body:
{
  "username": "string",
  "password": "string"
}

- Success Response:
{
  "success": true,
  "data": {
    "token": "same_as_access_token",
    "access_token": "jwt_access_token",
    "refresh_token": "jwt_refresh_token",
    "expires_in": 86400,
    "user": {
      "id": 1,
      "username": "superadmin",
      "role": "super_admin",
      "club_id": null,
      "name": "Platform Super Admin",
      "phone": null,
      "status": "active"
    }
  }
}

说明:
- expires_in 单位秒，当前为 86400 (24h)。
- token 字段保留兼容，等同 access_token。

### 2) 刷新令牌

- Method: POST
- URL: /api/v1/auth/refresh
- Body:
{
  "refresh_token": "string"
}

- Success Response:
{
  "success": true,
  "data": {
    "token": "same_as_access_token",
    "access_token": "new_access_token",
    "refresh_token": "new_refresh_token",
    "expires_in": 86400,
    "user": { ... }
  }
}

说明:
- 后端采用 refresh token 轮换机制。
- 每次 refresh 成功会返回新的 refresh_token，必须覆盖本地旧值。

### 3) 登出

- Method: POST
- URL: /api/v1/auth/logout
- Headers: Authorization: Bearer access_token
- Body:
{
  "refresh_token": "string"
}

说明:
- 传 refresh_token 后服务端会吊销该 refresh token。
- 即使接口失败，客户端也要本地清空会话。

### 4) 当前用户

- Method: GET
- URL: /api/v1/auth/me
- Headers: Authorization: Bearer access_token

## 客户端实现要求

1. 会话存储
- 安全存储: access_token, refresh_token, user, access_token_expire_at。
- access_token_expire_at 可用“当前时间 + expires_in”计算。

2. HTTP 拦截器
- 请求拦截: 自动注入 Authorization。
- 响应拦截:
  - 遇到 401 且请求不是 login/refresh/logout 时，触发 refresh。
  - refresh 成功后更新 token 并重试原请求一次。
  - refresh 失败则执行强制登出流程。

3. 并发刷新保护
- 多个请求同时 401 时，只允许一个 refresh 请求在进行。
- 其余请求等待该 refresh 结果后再继续。
- 避免并发触发多次 refresh 导致 token 覆盖错乱。

4. 启动恢复
- App 启动读取本地 token。
- 若 access_token 可能过期，先尝试 refresh，再决定是否进入首页。

5. 安全与异常
- 不在日志打印完整 token。
- refresh 接口返回 401 时立刻清理会话并跳转登录。
- 网络超时/离线时，保留当前会话并提示用户重试（不要立即清空）。

## 验收用例

1. 正常登录后可访问受保护接口。
2. 手动伪造过期 access_token，客户端可自动 refresh 并重试成功。
3. 将 refresh_token 置为无效值，客户端应回到登录页。
4. 并发 5 个请求同时 401，只发起 1 次 refresh。
5. logout 后再次调用受保护接口应返回未登录/401。

## 代码输出要求

1. 给出具体改动文件与关键函数名。
2. 提供关键流程伪代码（登录、请求拦截、刷新、登出）。
3. 增加最小可运行的单元测试或集成测试（至少覆盖自动 refresh 和并发刷新保护）。
