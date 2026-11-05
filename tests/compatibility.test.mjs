import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareDictionary, validateCompatibility } from '../scripts/compatibility.mjs'

const compatibility = {
  releaseOnly: { demo: { old: 'Session {id}' } },
  masterOnly: { demo: { added: 'Plugin {plugin}' } },
  sharedText: { demo: { hint: {
    english: ['Appends /messages.', 'Appends {path}.'],
    korean: '요청 경로를 덧붙입니다.',
  } } },
}
const korean = { old: '세션 {id}', added: '플러그인 {plugin}', hint: '요청 경로를 덧붙입니다.' }
const release = { old: 'Session {id}', hint: 'Appends /messages.' }
const master = { added: 'Plugin {plugin}', hint: 'Appends {path}.' }

test('both upstream revisions check their live keys and the recorded retained key', () => {
  for (const english of [release, master]) {
    assert.deepEqual(compareDictionary('demo', korean, english, compatibility), { problems: [], checked: 2, retained: 1 })
  }
  assert.deepEqual(validateCompatibility({ demo: korean }, compatibility), [])
})

test('new upstream keys still fail until translated', () => {
  const result = compareDictionary('demo', korean, { ...master, next: 'New option' }, compatibility)
  assert.ok(result.problems.some(message => message.includes('missing next')))
})

test('unknown extra keys are not accepted as compatibility data', () => {
  const result = compareDictionary('demo', { ...korean, typo: '오타' }, master, compatibility)
  assert.deepEqual(result.problems, ['demo: extra typo'])
})

test('live and retained translations both reject missing arguments', () => {
  const broken = { ...korean, old: '세션', added: '플러그인' }
  for (const english of [release, master]) {
    const result = compareDictionary('demo', broken, english, compatibility)
    assert.equal(result.problems.length, 2)
  }
  assert.equal(validateCompatibility({ demo: broken }, compatibility).length, 2)
})

test('a changed shared upstream template requires review', () => {
  const result = compareDictionary('demo', korean, { ...master, hint: 'Appends {path} for {provider}.' }, compatibility)
  assert.deepEqual(result.problems, ['demo: hint has an unreviewed upstream template'])
})

test('shared translations cannot acquire an unprovided placeholder', () => {
  const broken = { ...korean, hint: '요청 경로 {path}를 덧붙입니다.' }
  assert.ok(compareDictionary('demo', broken, release, compatibility).problems.length)
  assert.ok(validateCompatibility({ demo: broken }, compatibility).length)
})

test('removing a retained translation is reported even when it is absent in the current upstream', () => {
  const { old, ...broken } = korean
  assert.deepEqual(validateCompatibility({ demo: broken }, compatibility), ['demo: missing retained translation old'])
})
