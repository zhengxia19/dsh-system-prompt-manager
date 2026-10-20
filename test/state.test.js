import test from 'node:test'
import assert from 'node:assert/strict'
import {
  initialState, makeSnapshot, choose, assertTemplate, validateState, isInUse,
} from '../lib/state.js'

test('native and none do not load custom text', () => {
  const s = initialState()
  assert.equal(makeSnapshot(s, { mode: 'native' }).text, '')
  assert.equal(makeSnapshot(s, { mode: 'none' }).text, '')
  assert.equal(makeSnapshot(s, { mode: 'none' }).mode, 'none')
})

test('custom exact-text snapshot remains stable after template edit', () => {
  const s = initialState()
  s.templates.push(assertTemplate({ id: 't1', name: '测试', text: '  保留空格\n{{literal}}  ' }))
  const one = choose(s, 'session-A', 'custom', 't1')
  s.templates[0] = assertTemplate({ name: '修改', text: 'new' }, s.templates[0])
  assert.equal(one.text, '  保留空格\n{{literal}}  ')
  assert.equal(one.revision, 1)
  assert.equal(makeSnapshot(s, s.selections['session-A']).text, 'new')
  assert.throws(() => { one.text = 'mutated' }, TypeError)
})

test('custom refuses missing or empty template; deletion reports usage', () => {
  const s = initialState()
  assert.throws(() => choose(s, 'session-A', 'custom', 'missing'), /missing/)
  assert.throws(() => assertTemplate({ id: 'x', name: 'X', text: '' }), /text/)
  s.templates.push(assertTemplate({ id: 't1', name: 'name', text: 'body' }))
  choose(s, 'session-A', 'custom', 't1')
  assert.equal(isInUse(s, 't1'), true)
  choose(s, 'session-A', 'native')
  assert.equal(isInUse(s, 't1'), false)
})

test('unknown mode and malformed state fail closed', () => {
  const s = initialState()
  assert.throws(() => choose(s, 'session-A', 'bad-mode'), /invalid prompt mode/)
  assert.throws(() => validateState({ ...s, defaultMode: 'oops' }), /invalid prompt mode/)
  assert.throws(() => choose(s, '../unsafe', 'none'), /sessionId/)
  assert.deepEqual(validateState(s), s)
})

test('separate sessions retain separate selectors', () => {
  const s = initialState()
  choose(s, 'session-A', 'native')
  choose(s, 'session-B', 'none')
  assert.equal(s.selections['session-A'].mode, 'native')
  assert.equal(s.selections['session-B'].mode, 'none')
})
