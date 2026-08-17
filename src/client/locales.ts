export const zh = {
  title: 'Codex 搜索提供方',
  description: '安装后网页搜索优先使用 Codex Provider，请完成配置。',
  apiKey: 'API Key',
  credentialMode: 'API Key 来源',
  openAIMode: 'OpenAI',
  independentMode: '独立 Key',
  openAIKeyActive: '复用 OpenAI 凭据，不复制或回显密钥。',
  apiKeyConfigured: '已保存独立 Key；留空不会修改。',
  apiKeyMissing: '尚未配置独立 Key。',
  apiKeyPending: '新 Key 将在保存后生效。',
  apiKeyClearPending: '保存后将清除独立 Key。',
  openAIUnavailable: 'OpenAI 提供方尚未配置可复用的 API 地址。',
  openAICredentialMissing: 'OpenAI 提供方尚未配置 API Key。',
  endpoint: '接口地址',
  endpointHint: '填写完整接口 URL；Codex 默认路径为 /alpha/search。',
  insecure: '连接未加密',
  model: '模型（可选）',
  modelHint: '留空时使用当前会话模型',
  unsaved: '未保存',
  readOnly: '当前配置为只读。',
  save: '保存',
  saving: '保存中',
  restoreDefaults: '恢复默认',
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
  credentialMode: 'API Key source',
  openAIMode: 'OpenAI',
  independentMode: 'Separate key',
  openAIKeyActive: 'Uses the OpenAI credential without copying or revealing it.',
  apiKeyConfigured: 'A separate key is saved. Leave blank to keep it.',
  apiKeyMissing: 'No separate key is configured.',
  apiKeyPending: 'The new key will take effect after saving.',
  apiKeyClearPending: 'The separate key will be cleared after saving.',
  openAIUnavailable: 'The OpenAI provider has no reusable API URL.',
  openAICredentialMissing: 'The OpenAI provider has no API key configured.',
  endpoint: 'Endpoint',
  endpointHint: 'Enter the complete URL; the default Codex path is /alpha/search.',
  insecure: 'Connection is not encrypted',
  model: 'Model (optional)',
  modelHint: 'Leave blank to use the current session model',
  unsaved: 'Unsaved',
  readOnly: 'This configuration is read-only.',
  save: 'Save',
  saving: 'Saving',
  restoreDefaults: 'Restore defaults',
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
