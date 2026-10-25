// Runtime check of the Korean language pack against a DeepSeek Harness checkout's real locale service.
// Copy into <dsh>/packages/client/locale/tests/ and run:
//   DSH_LANGUAGE_PACK_KO=<this repo> npx vitest run packages/client/locale/tests/runtime.client.spec.ts
import { readFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { apply as settingsApply, inject as settingsInject } from '@deepseek-ai/dsh-client-ui-settings/client'
import { TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject, SETTINGS_NS } from '@deepseek-ai/dsh-client-locale/client'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { LOCALE_SETTINGS_NAMESPACE, LocaleSettingsSchema } from '../src/locale-settings.ts'
import * as goal from '../../ui-goal/src/client/locales.ts'

const PACK = process.env.DSH_LANGUAGE_PACK_KO ?? ''
if (!PACK) throw new Error('set DSH_LANGUAGE_PACK_KO to the language pack directory')

function loadPack() {
  let module: { inject: string[]; apply: (ctx: Context) => void } | undefined
  let id: string | undefined
  const fakeWindow = { __ModuleLoader__: {
    load: (spec: { id: string; factory: () => typeof module }) => { id = spec.id; module = spec.factory() },
  } }
  new Function('window', readFileSync(`${PACK}/client.js`, 'utf8'))(fakeWindow)
  return { id, module: module! }
}

it('registers Korean, translates every namespace, coexists with core registration, and unloads cleanly', async () => {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  let preference: string | undefined
  let revision = 0
  const ns = () => ({ ns: LOCALE_SETTINGS_NAMESPACE, schema: LocaleSettingsSchema.toJSON(), value: preference === undefined ? {} : { preference }, autoGenerate: true, applies: 'live' as const, secrets: [], revision })
  new TestRemote(ctx, { settings: {
    describe: vi.fn(async () => ({ ok: true as const, value: { writable: true, hasDocument: true, namespaces: [ns()] } })),
    mutate: vi.fn(async (_n: string, ops: { value: string }[]) => { preference = ops[0]!.value; revision += 1; return { ok: true as const, value: ns() } }),
  } })
  await ctx.plugin({ inject: [...settingsInject], apply: settingsApply }).await()
  await ctx.plugin({ inject: [...inject], apply }).await()
  const locale = ctx.get('locale') as LocaleRuntime

  const { id, module } = loadPack()
  expect(id).toBe('dsh-language-pack-ko')
  const pack = ctx.plugin(module)
  await pack.await()
  expect(locale.getLocale().locales.map(l => [l.id, l.label])).toContainEqual(['ko', '한국어'])

  // A core plugin registering its typed dictionaries after the pack must not collide.
  const disposeGoal = locale.register('goal', { zh: goal.zh, en: goal.en, ja: goal.ja, es: goal.es, fr: goal.fr, de: goal.de, ru: goal.ru, pt: goal.pt })

  locale.setLocale('ko')
  expect(locale.getLocale().active).toBe('ko')
  expect(locale.bind('common')('cancel')).toBe('취소')
  expect(locale.bind(SETTINGS_NS)('language.title')).toBe('언어')
  expect(locale.bind('goal')('action.save')).toBe(JSON.parse(readFileSync(`${PACK}/dictionaries/goal.json`, 'utf8'))['action.save'])

  let checked = 0
  for (const file of (await import('node:fs')).readdirSync(`${PACK}/dictionaries`)) {
    const namespace = file.slice(0, -5)
    const dict = JSON.parse(readFileSync(`${PACK}/dictionaries/${file}`, 'utf8')) as Record<string, string>
    const t = locale.bind(namespace)
    for (const [key, text] of Object.entries(dict)) {
      if (text.includes('{')) continue
      expect(t(key), `${namespace}:${key}`).toBe(text)
      checked++
    }
  }
  expect(checked).toBeGreaterThan(2500)

  disposeGoal()
  await pack.dispose()
  expect(locale.getLocale().locales.map(l => l.id)).not.toContain('ko')
  expect(locale.getLocale().active).not.toBe('ko')
  await ctx.fiber.dispose()
})

it('steps aside when the Harness already ships Korean', async () => {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const ns = () => ({ ns: LOCALE_SETTINGS_NAMESPACE, schema: LocaleSettingsSchema.toJSON(), value: {}, autoGenerate: true, applies: 'live' as const, secrets: [], revision: 0 })
  new TestRemote(ctx, { settings: {
    describe: vi.fn(async () => ({ ok: true as const, value: { writable: true, hasDocument: true, namespaces: [ns()] } })),
    mutate: vi.fn(async () => ({ ok: true as const, value: ns() })),
  } })
  await ctx.plugin({ inject: [...settingsInject], apply: settingsApply }).await()
  await ctx.plugin({ inject: [...inject], apply }).await()
  const locale = ctx.get('locale') as LocaleRuntime
  const disposeLanguage = locale.addLanguage({ id: 'ko', label: '한국어', fallback: 'en' })
  const disposeGoal = locale.register('goal', 'ko', { 'action.save': 'CORE' })
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const pack = ctx.plugin(loadPack().module)
  await pack.await()
  locale.setLocale('ko')
  expect(locale.bind('goal')('action.save')).toBe('CORE')
  expect(locale.bind('common')('cancel')).toBe('취소')
  expect(warn).toHaveBeenCalledOnce()
  await pack.dispose()
  expect(locale.getLocale().locales.map(l => l.id)).toContain('ko')
  locale.setLocale('ko')
  expect(locale.bind('goal')('action.save')).toBe('CORE')
  disposeGoal(); disposeLanguage(); warn.mockRestore()
  await ctx.fiber.dispose()
})
