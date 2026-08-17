import { useState } from 'react'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { CodexCardFace } from './index.tsx'
import { appendAlphaSearchPath, canAppendAlphaSearchPath } from './path.ts'
import type { CodexLocaleKey } from './locales.ts'
import css from './CodexSearchCard.module.css'

export type CodexSearchCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'web-search-codex'>
  & InjectFace<CodexCardFace>

export function CodexSearchCard(props: CodexSearchCardProps) {
  const [open, setOpen] = useState(false)
  const state = props.useCodexSearchCard(snapshot => snapshot)
  if (!state.available) return null
  const settingsDisabled = !state.writable || state.saving
  const credentialWrite = state.apiKeyWritable && state.apiKey.trim() !== ''
  const saveDisabled = !state.dirty || state.saving || !state.writable && !credentialWrite
  const insecure = /^http:\/\//iu.test(state.endpoint.trim())
  const failureKey: CodexLocaleKey | undefined = state.failure === 'conflict'
    ? 'conflict'
    : state.failure === 'save' ? 'saveFailed' : undefined
  return (
    <li className={`${css.card} ${open ? css.cardOpen : ''}`}>
      <button
        type="button"
        className={css.header}
        aria-expanded={open}
        aria-label={`${props.t(open ? 'collapse' : 'expand')}: ${props.t('title')}`}
        onClick={() => { setOpen(value => !value) }}
      >
        <span className={css.headText}>
          <span className={css.name}>{props.t('title')}</span>
          <span className={css.description}>{props.t('description')}</span>
        </span>
        {state.dirty ? <span className={css.pending}>{props.t('unsaved')}</span> : null}
        <IconChevronDownOutline14 className={`${css.chevron} ${open ? css.chevronOpen : ''}`} />
      </button>
      {open
        ? (
          <div className={css.body}>
            {!state.writable ? <p className={css.readOnly} role="status">{props.t('readOnly')}</p> : null}
            <div className={css.field}>
              <div className={css.fieldHead}>
                <label className={css.label} htmlFor="codex-search-api-key">{props.t('apiKey')}</label>
                <span className={state.apiKeyConfigured ? css.badge : css.badgeMuted}>
                  {props.t(state.apiKeyConfigured ? 'configured' : 'notConfigured')}
                </span>
              </div>
              <input
                id="codex-search-api-key"
                className={css.input}
                type="password"
                autoComplete="off"
                value={state.apiKey}
                disabled={!state.apiKeyWritable || state.saving}
                onChange={(event) => { props.edit('apiKey', event.target.value) }}
              />
              <p className={css.hint}>{props.t('apiKeyHint')}</p>
            </div>
            <div className={css.field}>
              <label className={css.label} htmlFor="codex-search-endpoint">{props.t('endpoint')}</label>
              <div className={css.endpointRow}>
                <input
                  id="codex-search-endpoint"
                  className={css.input}
                  type="url"
                  value={state.endpoint}
                  disabled={settingsDisabled}
                  onChange={(event) => { props.edit('endpoint', event.target.value) }}
                />
                <button
                  type="button"
                  className={css.append}
                  disabled={settingsDisabled || !canAppendAlphaSearchPath(state.endpoint)}
                  onClick={() => { props.edit('endpoint', appendAlphaSearchPath(state.endpoint)) }}
                >
                  {props.t('appendPath')}
                </button>
              </div>
              {insecure ? <p className={css.warning} role="status">{props.t('insecure')}</p> : null}
              <p className={css.hint}>{props.t('endpointHint')}</p>
            </div>
            <div className={css.field}>
              <label className={css.label} htmlFor="codex-search-model">{props.t('model')}</label>
              <input
                id="codex-search-model"
                className={css.input}
                type="text"
                value={state.model}
                disabled={settingsDisabled}
                onChange={(event) => { props.edit('model', event.target.value) }}
              />
              <p className={css.hint}>{props.t('modelHint')}</p>
            </div>
            <div className={css.footer}>
              {failureKey === undefined ? null : <p className={css.failed} role="status">{props.t(failureKey)}</p>}
              <button
                type="button"
                className={css.discard}
                disabled={!state.dirty || state.saving}
                onClick={props.discard}
              >
                {props.t('discard')}
              </button>
              <button
                type="button"
                className={css.save}
                disabled={saveDisabled}
                onClick={props.save}
              >
                {props.t(state.saving ? 'saving' : 'save')}
              </button>
            </div>
          </div>
        )
        : null}
    </li>
  )
}
