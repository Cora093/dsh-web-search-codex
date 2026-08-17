import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { CodexSearchCard } from './CodexSearchCard.tsx'
import { createCodexSettingsApi } from './api.ts'
import {
  CodexCardController,
  type CardField,
  type CodexCardState,
  type SnapshotSource,
} from './controller.ts'
import { en, zh } from './locales.ts'
import { CLIENT_SLOT_ID } from '../shared.ts'

const LOCALE_NAMESPACE = 'web-search-codex'

export interface CodexCardFace {
  hooks: {
    codexSearchCard: SnapshotSource<CodexCardState>
  }
  edit(field: CardField, value: string): void
  save(): void
  discard(): void
}

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  const controller = new CodexCardController(createCodexSettingsApi())
  ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, 'zh', zh), 'web-search-codex: zh locale')
  ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, 'en', en), 'web-search-codex: en locale')
  ctx.effect(() => () => { controller.dispose() }, 'web-search-codex: client controller')
  void controller.load()

  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    id: CLIENT_SLOT_ID,
    order: 30,
    locale: LOCALE_NAMESPACE,
    inject: (): CodexCardFace => ({
      hooks: { codexSearchCard: controller },
      edit: (field, value) => { controller.edit(field, value) },
      save: () => { void controller.save() },
      discard: () => { controller.discard() },
    }),
  }, CodexSearchCard))
}
