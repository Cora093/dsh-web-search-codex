# Jev（TypeSafe AI System One）对本仓库适配评估

评估对象：本仓库 `dsh-web-search-codex`（DeepSeek Harness 的 Codex Web Search 插件）。
Jev 版本口径：`jev-1.13.0` / `jev-latest`（2026-09 前后首发）。Jev **不是**聊天/写代码 LLM；输入为「程序状态 + 预定义 typed 问题」，并行返回结构化 Choice / Score / Noul（Boolean）及概率。

**结论：不适合在本仓库引入 Jev。**

---

## 仓库是什么

面向 DSH（DeepSeek Harness）用户的 **搜索提供方插件**：安装后把 Web Runtime 的搜索从默认 DeepSeek 提供方切到 `codex`，把当前搜索词 POST 到用户配置的 `/alpha/search` 兼容接口。

| 层 | 位置 | 职责 |
|---|---|---|
| 插件入口 | `src/index.ts` | 注册 `codex` provider、凭据解析、settings 宿主 API |
| 搜索协议 | `src/provider.ts` | 组包、拒重定向、映射 `output`/`results`、凭据脱敏 |
| 设置与凭据 | `src/host-settings.ts` | 独立 Key / 复用 OpenAI、revision 冲突、回滚 |
| 信任围栏 | `src/trust-fence.ts` | loopback / trustedHosts、拒跨站 Origin |
| 客户端 | `src/client/*` | 设置卡片；不参与搜索热路径 |
| 不变量 | `src/invariant.ts` | 空安装器，无运行时策略 |
| CI | `.github/workflows/publish.yml` | tag 后 test + typecheck + npm publish |

技术栈：严格 ESM TypeScript、Vitest、React 设置 UI、Cordis 插件、无 LangChain、无 MCP、无独立 Agent 循环。`@deepseek-ai/dsh-agent` 只是 peer：本仓用它读取当前会话模型名，**不编排 tool/shell/edit**。

`dsh.bundle.patch` 把 `searchProvider` 固定为 `codex`，且 README 写明失败 **不会**回退 DeepSeek。这是确定性产品选择，不是运行时路由。

---

## 为何不适合

Jev 的典型价值在 **模糊、可并行、需要置信度的辅决策**：tool 风险门控、cheap vs reasoning 路由、补丁爆炸半径、工单分类、替代脆弱 if-else。

本仓的分支几乎全是 **必须保持确定性的协议/安全规则**：

1. **无 Agent 决策环。** `CodexSearchProvider.search()` 接收已决定要搜的 `query`，只发当前词、不读对话历史。是否调用搜索、是否跑 shell/edit，属于 DSH host（`dsh-agent` / `dsh-web`），不在本插件。
2. **安全门已是硬规则，不能改成概率。** 拒 HTTP 重定向、仅 `http:`/`https:`、信任围栏、凭据不回显——这些在 `tests/provider.spec.ts`、`tests/trust-fence.spec.ts` 里按安全回归锁死。用 Noul「像不像钓鱼」替代会引入误放行。
3. **没有模型路由。** `model` 要么显式配置，要么 `agents.currentInitiator().session.requestContext().model`。没有 cheap/reasoning 分桶。
4. **没有工单/PR/测试缺口评分。** CI 只做发布闸门；`src/invariant.ts` 不检查内容。
5. **热路径成本不对。** 搜索已是对 Codex 的一次 RTT；再串 Jev（厂商口径 70–500ms）会拉长每次搜索，且多一套 TypeSafe API Key，和本插件「只管 Codex 凭据」的设置模型冲突。
6. **客户端不能接。** `src/client/` 不得导入宿主模块；设置卡片只有表单状态机，没有分类路由。

看起来像「智能分支」、实则应保持 if-else 的点：

| 位置 | 现有行为 | 若接 Jev 会怎样 |
|---|---|---|
| `provider.ts` `search()` | 校验 endpoint/key/model 后直发 | 延迟 + 误拦合法搜索；策略应在 DSH 决定「要不要搜」时做 |
| `provider.ts` `mapResponse()` | 协议校验 + URL 白名单 | 源质量评分会改 `WebSearchResult` 契约，且属宿主展示层 |
| `host-settings.ts` `save()` | URL/凭据来源/只读/冲突的确定性校验 | 「endpoint 像不像官方」是 UX 提示，不能 block 用户自建网关 |
| `trust-fence.ts` | 主机名/Origin 硬匹配 | 概率放行跨站请求是漏洞 |
| `dsh.bundle.patch` | 固定 `codex` | 运行时在 DeepSeek/Codex 间路由直接违背本插件目标 |

---

## 推荐接入方式

**无。** 不要在本仓库加 JS SDK、HTTP 客户端、MCP 或 LangChain TypeSafeClassifier。

若评估的是 **整个 DSH 宿主**（不在本仓）：更合理的是宿主 Agent 侧 HTTP/SDK 做 tool 门控，而不是塞进搜索插件。本仓既不是 MCP server，也没有 LangChain 图。

---

## 替代方案（比 Jev 更贴本仓）

1. **继续用确定性规则** 覆盖安全与协议（现状正确）。
2. **查询是否该发出 / 工具风险** → 改 DSH `dsh-agent` / `dsh-web`，不要改本插件。
3. **设置 UX**（HTTP 警告、OpenAI 复用是否可用）→ 已有模板与校验，不必上决策模型。
4. **结果可信度** → 若产品要做，应作为 DSH 搜索结果卡片的可选层，并保持本插件 `mapResponse` 的机械映射。

---

## 风险与成本（即便强行引入）

- **API Key：** 再增 TypeSafe 凭据；设置卡片、`CODEX_SEARCH_API_KEY`、OpenAI 复用已经够复杂；密钥还可能进 `recordRequest` 日志路径（当前只记 endpoint/body，必须继续禁止记 Authorization）。
- **延迟：** 搜索热路径不可接受同步门控；异步 shadow 对用户无收益，只增加故障面。
- **误判：** 拦查询会静默破坏「安装后默认网页搜索即 Codex」；放行设置/信任检查会弱化安全测试所保证的行为。
- **职责边界：** Codex 负责检索生成；本插件负责协议与凭据；Jev 若存在，只应辅决策。本仓没有「主编码模型」，接 Jev 等于给适配器加无关运行时。

---

## MVP（不建议做；仅说明「最小实验」长什么样）

不要改业务代码、不要加生产依赖。若仍要验证 Jev 对本域问题的标定质量：

1. **仓外脚本**：对一组脱敏假查询 / 假 endpoint 调 `POST https://api.typesafe.ai/v1/systemone`，问题保持 typed、固定。
2. **对照表**：人工标注 vs Jev 概率；看误拦/误放，而不是接入 `provider.ts`。
3. **停点**：即使标定好看，也把门控放到 DSH host 设计，而不是本插件。

示例问题（仅实验，非本仓插入点）：

- Noul：`search.query` 是否在向外部搜索泄露密钥或会话隐私？高置信 → 实验日志；生产仍应由宿主策略 block。
- Score：`settings.endpoint` 与常见 OpenAI/Codex 网关的相似程度 0–1；只做提示，永不替代 URL 语法校验。
- Choice：失败后 `retry_codex` / `surface_error` / `fallback_deepseek`——本仓产品已选择 `surface_error`，Jev 不应覆盖。

---

## 交付摘要

| 项 | 值 |
|---|---|
| 仓库结论 | **不适合** |
| 一句话 | 本仓是确定性 Codex 搜索协议适配器 + 设置围栏，没有 Jev 该做的模糊辅决策层。 |
| 关键决策点 | 无适合 Jev 的决策点（现有分支均为硬规则） |
| 推荐接入 | **无** |
| MVP 下一步 | 1) 不引入依赖 2) 若有兴趣，在仓外对脱敏样本做标定 3) 真正的 tool 门控放到 DSH host |
| 代码变更 | 仅本评估文档；未改 `src/`、未加依赖 |
