export const zh = {
  title: 'Codex 搜索提供方',
  description: '安装后网页搜索优先使用 Codex Provider，请完成配置。',
  apiKey: 'API Key',
  apiKeyHint: '密钥仅写入凭据存储，不会回显。',
  configured: '已配置',
  notConfigured: '未配置',
  endpoint: '接口地址',
  endpointHint: '保存完整的 Codex /alpha/search 兼容 URL。',
  appendPath: '追加 /alpha/search',
  insecure: '连接未加密',
  model: '模型（可选）',
  modelHint: '留空时使用当前会话模型',
  unsaved: '未保存',
  readOnly: '当前配置为只读。',
  save: '保存',
  saving: '保存中',
  discard: '放弃',
  saveFailed: '保存失败，请检查配置后重试。',
  conflict: '配置已被其他页面修改；已刷新版本，请确认后重试。',
  expand: '展开',
  collapse: '收起',
} as const

export const en: Record<keyof typeof zh, string> = {
  title: 'Codex search provider',
  description: 'Web search now prefers the Codex provider. Complete its configuration.',
  apiKey: 'API Key',
  apiKeyHint: 'The key is write-only and is never returned.',
  configured: 'Configured',
  notConfigured: 'Not configured',
  endpoint: 'Endpoint',
  endpointHint: 'Save the complete Codex-compatible /alpha/search URL.',
  appendPath: 'Append /alpha/search',
  insecure: 'Connection is not encrypted',
  model: 'Model (optional)',
  modelHint: 'Leave blank to use the current session model',
  unsaved: 'Unsaved',
  readOnly: 'This configuration is read-only.',
  save: 'Save',
  saving: 'Saving',
  discard: 'Discard',
  saveFailed: 'Save failed. Check the configuration and retry.',
  conflict: 'Another page changed these settings. The revision was refreshed; review and retry.',
  expand: 'Expand',
  collapse: 'Collapse',
}

export type CodexLocaleKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'web-search-codex': CodexLocaleKey
  }
}
