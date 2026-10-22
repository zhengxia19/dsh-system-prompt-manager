import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PRESETS } from '../lib/presets.js'
import { assertTemplate, initialState, choose, MAX_TEXT } from '../lib/state.js'

const expected = ['codex-dsh', 'claude-dsh', 'opencode-dsh']

test('three independent UTF-8 presets are loadable and pass current template validation', () => {
  assert.deepEqual(PRESETS.map(p => p.id), expected)
  assert.equal(new Set(PRESETS.map(p => p.text)).size, 3)
  for (const preset of PRESETS) {
    assert.ok(preset.text.length > 700 && preset.text.length <= MAX_TEXT)
    assert.ok(preset.name.length <= 100)
    assert.ok(preset.description.length > 0)
    assert.ok(!preset.text.includes('\u0000'))
    assert.ok(!preset.text.includes('{{'))
    assert.ok(preset.text.includes('DeepSeek Harness'))
    assert.ok(preset.text.includes('验证') || preset.text.includes('核实'))
    const bytes = readFileSync(new URL('../presets/' + preset.id + '.txt', import.meta.url), 'utf8')
    assert.equal(preset.text, bytes)
    const state = initialState()
    const saved = assertTemplate({ id: 't-' + preset.id, name: preset.name, text: preset.text })
    state.templates.push(saved)
    const selected = choose(state, 'session-' + preset.id, 'custom', saved.id)
    assert.equal(selected.text, preset.text)
    assert.equal(selected.revision, 1)
  }
})

test('preset content does not impersonate CLI tools or depend on unresolved source variables', () => {
  for (const preset of PRESETS) {
    assert.doesNotMatch(preset.text, /\$\{[A-Z_]+\}/)
    assert.doesNotMatch(preset.text, /必须(?:调用|使用)\s*(?:TodoWrite|apply_patch|Bash|Read|Write)\b/)
  }
})
