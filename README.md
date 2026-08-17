# dsh-web-search-codex

DeepSeek Harness 的 Codex standalone Web Search Provider。插件向 `ctx.web` 注册 `codex`，将搜索请求发送到用户配置的完整 `/alpha/search` 兼容地址，并提供 Host 配置路由与浏览器设置卡片。

## 安装

```powershell
pnpm install
pnpm run build
pnpm pack
dsh plugin --profile web add C:\absolute\path\dsh-web-search-codex-0.1.0.tgz
dsh --profile web --dump-config
```

安装 bundle 后，Web Runtime 的 `searchProvider` 固定为 `codex`。请在“设置 -> 插件 -> 插件配置 -> Codex 搜索提供方”配置 API Key、完整接口地址和可选模型。

## 请求

插件只发送当前搜索词，不读取或发送最近对话。接口地址不会被自动改写；卡片中的按钮可显式追加 `/alpha/search`。HTTP 与 HTTPS 均可保存，但 HTTP 会显示未加密警告。所有 HTTP 重定向都会被拒绝。

模型优先使用卡片中的显式配置；留空时读取当前发起 Agent 的 session request context。凭据默认引用 `CODEX_SEARCH_API_KEY`，每次搜索重新解析，且不会进入设置响应、请求日志或错误文本。

## 限制

- `/alpha/search` 是 Codex 内部 alpha 协议，不是 OpenAI 稳定公开 API。
- 不自动回退 DeepSeek Provider。
- 不维护模型 allowlist，也不自动替换服务端不支持的模型。
- live sub2api 验收需要用户显式提供测试 Endpoint 与 Key。

