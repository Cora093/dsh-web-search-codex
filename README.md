# dsh-web-search-codex

为 DeepSeek Harness 提供 Codex Web Search 能力。

插件会注册 `codex` 搜索提供方，并将搜索请求发送到配置好的 `/alpha/search` 兼容接口。

## 快速开始

1. 安装插件：

   ```powershell
   dsh plugin --profile web add dsh-web-search-codex@latest --registry=https://registry.npmjs.org/
   ```

2. 启动 DeepSeek Harness：

   ```powershell
   dsh --profile web --port 3080
   ```

3. 打开“设置 -> 插件 -> 插件配置 -> Codex 搜索提供方”，选择一种配置方式：

   - 复用 OpenAI：在 API Key 来源中选择“OpenAI”，并检查自动生成的接口地址。
   - 使用独立 Key：在 API Key 来源中选择“独立 Key”，填写完整的 `/alpha/search` 接口地址和 API Key。

   确认配置后，点击“保存”。

安装插件后，Web Runtime 会使用 `codex` 作为搜索提供方， **默认网页搜索将失效** 。

## 配置方式

### 复用 OpenAI 配置

如果模型设置中已经配置 OpenAI 提供方，选择“OpenAI”后，插件会根据其 `baseURL` 生成 `/alpha/search` 接口地址，并使用已有的 API Key。密钥不会被复制。

模型留空时，搜索会跟随当前会话模型。保存前请确认生成的接口地址可用。

### 使用独立 Key

选择“独立 Key”，填写完整的 `/alpha/search` 接口地址和 API Key。模型为可选项，留空时同样跟随当前会话模型。

点击“恢复默认”并保存后，会清除插件单独保存的接口地址、模型和独立 Key，但不会影响 OpenAI 配置及其 API Key。

## 行为与限制

- 只发送当前搜索词，不读取或发送对话历史。
- 接口地址必须是包含 `/alpha/search` 的完整 URL，插件不会自动改写。
- 支持 HTTP 和 HTTPS；使用 HTTP 时会显示未加密警告。
- 拒绝所有 HTTP 重定向，避免 API Key 被发送到其他地址。
- `/alpha/search` 是 Codex 内部 alpha 协议，不是稳定的公开 API。
- 请求失败时不会自动回退到 DeepSeek 搜索提供方。
- 插件不限制模型名称，也不会替换服务端不支持的模型。

## 本地开发

```powershell
pnpm install
pnpm run typecheck
pnpm test
pnpm pack
dsh plugin --profile web add C:\absolute\path\dsh-web-search-codex-<version>.tgz
```

如果同一版本的本地 tarball 已经安装，请先运行：

```powershell
dsh plugin --profile web remove dsh-web-search-codex
```

然后重新添加，避免包管理器复用旧产物。
