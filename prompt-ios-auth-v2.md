# iOS App 登录/注册/重置密码 改造 Prompt

## 背景

FlexTargetiOS 客户端的登录、注册、找回密码功能需要适配后端最新的 V2 API（已在 2026-06-21 完成部署）。同时需要移除"修改用户名"功能（V2 体系中用户名不再可编辑，用户身份以 email/phone 为准）。

后端 API 基础地址：`https://api.grwolf.com`（已支持 HTTPS）
端点前缀：`/api/v1`

---

## 需要改造的模块

### 1. ServerConfig（`flextarget/Services/ServerConfig.swift`）

**当前问题**：
- 服务器地址硬编码为 `http://192.168.0.111:3001`（本地测试）、`http://52.221.232.2`（AWS，已废弃）、`http://api.grwolf.com`（HTTP，非 HTTPS）
- `initializeServer()` 默认设为 localTesting，每次启动都覆盖

**改造要求**：
1. 服务器地址更新为：
   - `localTesting = "http://192.168.0.111:3001"`（保留，开发用）
   - `production = "https://api.grwolf.com"`（替换原 china/international）
2. 移除 AWS 新加坡地址 `52.221.232.2`
3. `initializeServer()` 改为：仅在用户未设置过服务器地址时设置默认值（不要每次启动都覆盖用户选择）
4. toggleServer 仅在 `localTesting` 和 `production` 之间切换
5. App Transport Security：在 `Info.plist` 配置 `NSAllowsArbitraryLoads = true`（保留，以兼容本地 HTTP 测试）

### 2. UserAPIService（`flextarget/Services/UserAPIService.swift`）

**当前问题**：
- 邮箱注册调用旧接口：`POST /user/register/email` 和 `POST /user/register/email/send-verify-code`
- 密码重置调用旧接口：`POST /user/reset-password/email` 和 `POST /user/reset-password/email/send-verify-code`
- 密码使用 base64 编码传输（旧方式）
- 登录调用 `POST /api/v1/auth/login`，但请求体是 `{mobile, password}`，应改为支持 email/phone/account
- `editUser(username:)` 对应的"修改用户名"接口需要移除

**改造要求**：

#### 2.1 邮箱注册（替换原 `sendVerifyCode` 和 `register` 方法）

**Step 1 - 发送验证码**：
```
POST /api/v1/auth/send-code
Content-Type: application/json

{
  "channel": "email",
  "target": "user@example.com",
  "purpose": "register"
}
```
- 响应：`{ "success": true, "data": { "pending": true, "expires_in": 600 } }`
- 失败：`{ "success": false, "error": "..." }`

**Step 2 - 提交注册（含验证码 + 密码 + 姓名）**：
```
POST /api/v1/auth/register/email
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "plain_text_password",
  "name": "张三",
  "code": "123456"
}
```
- 响应：`{ "success": true, "data": { "verification_token": "..." } }`
- 注册成功后，客户端自动调用 `/api/v1/auth/login/email` 完成登录

**注意**：
- 密码字段为**明文**传输（HTTPS 已加密），不再使用 base64
- 新增 `name` 字段（必填，至少 1 字符）
- 验证码字段名为 `code`，不是 `verify_code`

#### 2.2 新增手机号注册（V2 新功能）

**Step 1 - 发送短信验证码**：
```
POST /api/v1/auth/send-code
{
  "channel": "phone",
  "target": "13800138000",
  "purpose": "register"
}
```

**Step 2 - 提交注册**：
```
POST /api/v1/auth/register/phone
{
  "phone": "13800138000",
  "password": "plain_text_password",
  "name": "张三",
  "code": "123456"
}
```
- 成功后自动调用 `/api/v1/auth/login/phone` 登录

#### 2.3 登录（替换现有 `login`、`loginWithMobile`、`loginWithEmail`、`loginWithAccount`）

**邮箱登录**：
```
POST /api/v1/auth/login/email
{ "email": "user@example.com", "password": "plain_text" }
```

**手机号登录**：
```
POST /api/v1/auth/login/phone
{ "phone": "13800138000", "password": "plain_text" }
```

**响应格式**（统一）：
```json
{
  "success": true,
  "data": {
    "access_token": "jwt_access_token",
    "refresh_token": "jwt_refresh_token",
    "expires_in": 86400,
    "user": {
      "id": 1,
      "username": "...",
      "name": "张三",
      "email": "user@example.com",
      "phone": null,
      "role": "club_admin",
      "club_id": 1,
      "status": "active"
    }
  }
}
```

**改造点**：
- 保留 `loginWithAutoDetect(input:password:)` 入口，根据 input 是否含 `@` 决定走 email 还是 phone 端点
- 密码改为明文 JSON 字段，不再 base64
- 移除所有 legacy login fallback 逻辑（旧 v1/legacy login 已废弃）
- 保留 `refreshToken` 和 `logout` 接口（已经是新接口）

#### 2.4 找回密码（替换现有 `sendResetPasswordVerifyCode` 和 `resetPassword`）

**新流程（统一入口，自动识别 email/phone）**：

**Step 1 - 发送验证码**：
```
POST /api/v1/auth/send-code
{
  "channel": "email" | "phone",  // 客户端自动识别
  "target": "user@example.com" | "13800138000",
  "purpose": "reset_password"
}
```

**Step 2 - 重置密码（分邮箱/手机两个端点）**：
```
# 邮箱
POST /api/v1/auth/reset-password
{ "email": "...", "code": "123456", "new_password": "..." }

# 手机
POST /api/v1/auth/reset-password/phone
{ "phone": "...", "code": "123456", "new_password": "..." }
```

**改造点**：
- 密码字段名为 `new_password`（不是 `password`）
- 验证码字段名为 `code`（不是 `verify_code`）
- 密码明文传输，不再 base64
- 客户端自动识别 channel：input 含 `@` → email，纯数字 11 位且 `1[3-9]` 开头 → phone
- 重置成功后**不自动登录**，跳转回登录页让用户用新密码登录

#### 2.5 移除 editUser 方法

- 删除 `UserAPIService.editUser(username:accessToken:)` 方法
- 后端已无 `/user/edit` 接口，用户名不可修改

### 3. AuthManager（`flextarget/Services/AuthManager.swift`）

**改造要求**：

1. `sendVerifyCode(email:)` → 改为 `sendCode(target:channel:purpose:)`，调用新 `/api/v1/auth/send-code` 端点
2. `sendResetPasswordVerifyCode(email:)` → 合并到 `sendCode`，purpose 传 `reset_password`
3. `register(email:password:verifyCode:)` → 改为 `register(email:password:name:code:)` 或 `register(phone:password:name:code:)`，调用新端点
4. `resetPassword(email:password:verifyCode:)` → 改为 `resetPassword(target:channel:code:newPassword:)`
5. 移除所有 `base64Encoded` 调用，密码改明文
6. `loginWithAutoDetect` 保留入口，但内部走 `/api/v1/auth/login/email` 或 `/api/v1/auth/login/phone`
7. `updateUserInfo(username:)` 保留（用于从 `/auth/me` 拉取信息更新本地缓存，不再用于编辑用户名）

### 4. LoginView（`flextarget/View/LoginView.swift`）

**当前**：单一输入框 + 密码，调用 `loginWithAutoDetect`
**改造要求**：
- UI 基本不变，保留"邮箱或手机号"输入框
- 输入框 placeholder 改为"邮箱或手机号"
- 移除"国际/国内"服务器切换 Toggle（已统一为一个生产服务器）
- 登录按钮调用 `loginWithAutoDetect(input:password:)`（内部走新端点）

### 5. RegistrationView（`flextarget/View/RegistrationView.swift`）

**当前**：仅邮箱注册，两步流程（发码 → 注册）
**改造要求**：

1. **新增 Tab 切换**：邮箱注册 / 手机号注册
2. **新增姓名输入框**（必填，新 API 要求）
3. **邮箱注册流程**：
   - 输入：邮箱 + 姓名 + 密码
   - 点"发送验证码" → `POST /api/v1/auth/send-code` (channel=email, purpose=register)
   - 输入验证码 → `POST /api/v1/auth/register/email` (email, password, name, code)
   - 成功后自动登录
4. **手机号注册流程**（新增）：
   - 输入：手机号 + 姓名 + 密码
   - 点"发送验证码" → `POST /api/v1/auth/send-code` (channel=phone, purpose=register)
   - 输入验证码 → `POST /api/v1/auth/register/phone` (phone, password, name, code)
   - 成功后自动登录
5. **密码策略提示**：至少 8 位，包含字母/数字/符号中的至少两种（更新校验逻辑）
6. **验证码倒计时**：60s，保留现有逻辑
7. **移除** base64 编码

### 6. ForgotPasswordView（`flextarget/View/ForgotPasswordView.swift`）

**当前**：仅邮箱重置
**改造要求**：

1. **输入框改为统一入口**："邮箱或手机号"（自动识别 channel）
2. **三阶段状态机**：
   - **Stage 1 (request)**：输入邮箱或手机号 → 点"发送验证码"
     - 调用 `POST /api/v1/auth/send-code` (channel=auto, purpose=reset_password)
   - **Stage 2 (reset)**：输入验证码 + 新密码 + 确认密码 → 点"重置密码"
     - 邮箱：`POST /api/v1/auth/reset-password` (email, code, new_password)
     - 手机：`POST /api/v1/auth/reset-password/phone` (phone, code, new_password)
   - **Stage 3 (done)**：显示"密码已重置，请使用新密码登录" → 按钮"去登录"返回 LoginView
3. **不自动登录**：重置成功后回到登录页
4. **密码策略提示**：至少 8 位，包含字母/数字/符号中的至少两种
5. **确认密码字段**：新增，校验两次密码一致
6. **60s 重发冷却**：保留

### 7. UserProfileView（`flextarget/View/UserProfileView.swift`）

**当前**：两个 Tab（编辑资料 / 修改密码）
- 编辑资料 Tab：修改用户名（调用 `editUser`）
- 修改密码 Tab：旧密码 + 新密码 + 确认密码（调用 `changePassword`）

**改造要求**：

1. **移除"编辑资料"Tab**（用户名不再可编辑）
2. **保留"修改密码"Tab**：
   - 检查后端是否还有 change-password 端点（如果后端未实现，此 Tab 也需移除或暂时禁用）
   - 后端如有 `/api/v1/auth/change-password` 接口，保留并对接
   - 后端如无此接口，整个 UserProfileView 改为只显示"退出登录"按钮 + 用户基本信息（从 `/auth/me` 拉取的 email/phone/name）
3. **展示用户信息**（只读）：
   - 姓名（name）
   - 邮箱（email）
   - 手机号（phone，如有）
   - 角色（role：super_admin / club_admin / shooter）
4. **退出登录按钮**：保留现有逻辑
5. **移除所有 `editUser` 相关代码**

### 8. User 模型（`flextarget/Model/User.swift`）

**当前字段**：userUUID, username, mobile, accessToken, refreshToken

**改造要求**：
新增字段以适配 V2 用户信息：
```swift
struct User: Codable, Identifiable {
    var id: String { userUUID }
    let userUUID: String
    var username: String?      // 保留（部分老用户可能还有）
    var name: String?          // 新增：真实姓名
    var email: String?         // 新增
    var phone: String?         // 新增（替代 mobile）
    var role: String?          // 新增：super_admin / club_admin / shooter
    var clubId: Int?           // 新增
    var accessToken: String
    var refreshToken: String
    
    // mobile 字段保留作为兼容，读取时优先返回 phone
}
```

### 9. 本地化字符串

新增/修改以下 key（在所有 `.lproj/Localizable.strings` 中）：

```
// 新增
"register_tab_email" = "邮箱注册";
"register_tab_phone" = "手机号注册";
"register_name_label" = "姓名";
"register_name_placeholder" = "请输入真实姓名";
"register_phone_label" = "手机号";
"register_phone_placeholder" = "请输入 11 位手机号";
"forgot_password_account_placeholder" = "邮箱或手机号";
"forgot_password_done_title" = "密码已重置";
"forgot_password_done_message" = "请使用新密码登录";
"forgot_password_go_login" = "去登录";
"password_policy_hint" = "至少 8 位，包含字母/数字/符号中的两种";
"password_confirm_label" = "确认新密码";
"password_mismatch_error" = "两次密码不一致";

// 修改
"account" = "邮箱或手机号";  // 原：账号
"registration_password_invalid" = "密码至少 8 位，需包含字母/数字/符号中的两种";
```

---

## 验收用例

1. **邮箱注册**：输入邮箱+姓名+密码 → 发送验证码 → 收到邮件 → 输入验证码 → 注册成功并自动登录
2. **手机号注册**：输入手机号+姓名+密码 → 发送短信 → 输入验证码 → 注册成功并自动登录
3. **邮箱登录**：输入邮箱+密码 → 登录成功
4. **手机号登录**：输入手机号+密码 → 登录成功
5. **找回密码-邮箱**：输入邮箱 → 收到验证码 → 输入验证码+新密码 → 重置成功 → 跳转登录页（不自动登录）
6. **找回密码-手机**：输入手机号 → 收到短信 → 输入验证码+新密码 → 重置成功 → 跳转登录页
7. **用户资料页**：不再显示"编辑资料"Tab，只显示只读用户信息 + 修改密码（如后端支持）+ 退出登录
8. **Token 刷新**：access_token 过期后自动 refresh，refresh 失败跳转登录
9. **密码校验**：注册和重置密码都校验"8位+两种字符类型"
10. **本地测试**：切换到 localTesting 服务器地址时可正常访问本地后端

---

## 注意事项

1. **密码明文传输**：所有密码字段改为明文 JSON（不再 base64），依赖 HTTPS 加密传输
2. **baseURL 统一**：所有接口都用 `v1AuthBaseURL`（即 `serverConfig.getServerUrl()`），路径以 `/api/v1/auth/` 开头
3. **向后兼容**：保留 `User.mobile` 字段作为兼容，但新代码使用 `User.phone`
4. **错误处理**：后端返回 `{ "success": false, "error": "错误信息" }`，客户端应显示 `error` 字段内容
5. **iOS ATS**：Info.plist 保留 `NSAllowsArbitraryLoads = true`，以兼容本地 HTTP 测试
6. **国际/国内切换**：移除 LoginView 上的服务器切换 Toggle，ServerConfig 简化为 localTesting / production 两个地址
7. **并发刷新保护**：保留现有 RefreshCoordinator 逻辑，不需要改动
8. **CoreData**：AppAuth entity 不需要改动，仍用于存储 session

---

## 代码结构

改造涉及的文件：
```
flextarget/
├── Services/
│   ├── ServerConfig.swift          # 更新服务器地址，简化切换逻辑
│   ├── UserAPIService.swift        # 替换所有 API 端点和请求格式
│   └── AuthManager.swift           # 更新方法签名，移除 base64
├── Model/
│   └── User.swift                  # 新增 name/email/phone/role/clubId 字段
├── View/
│   ├── LoginView.swift             # 简化，移除服务器切换
│   ├── RegistrationView.swift      # 新增 Tab（邮箱/手机）+ 姓名字段
│   ├── ForgotPasswordView.swift    # 三阶段状态机，支持邮箱+手机
│   └── UserProfileView.swift       # 移除编辑用户名，改为只读信息
└── *.lproj/Localizable.strings     # 新增/修改本地化字符串
```

请按上述规范实施改造，保持现有代码风格（黑色背景、红色主题色 `rgb(213, 56, 35)`），优先保证核心流程可用，本地化可以最后统一补全。
