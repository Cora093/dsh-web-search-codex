export function canAppendAlphaSearchPath(value: string): boolean {
  const trimmed = value.trim()
  return trimmed !== '' && !/\/alpha\/search\/?$/u.test(trimmed)
}

export function appendAlphaSearchPath(value: string): string {
  const trimmed = value.trim()
  if (!canAppendAlphaSearchPath(trimmed)) return trimmed
  return `${trimmed.replace(/\/+$/u, '')}/alpha/search`
}
