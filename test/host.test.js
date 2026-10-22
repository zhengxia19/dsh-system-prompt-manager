import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { apply } from '../lib/index.js'

function harness(existingDirectory) {
  const directory = existingDirectory || mkdtempSync(path.join(tmpdir(), 'spm-test-'))
  const before = process.env.DSH_HOME
  process.env.DSH_HOME = directory
  const listeners = new Map()
  const routes = new Map()
  const cleanup = []
  const ctx = {
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, [])
      listeners.get(name).push(fn)
      return () => listeners.set(name, listeners.get(name).filter(x => x !== fn))
    },
    effect(fn) { cleanup.push(fn()) },
    logger: { warn() {} },
    agents: { list() { return [] } },
    webServer: { register({ path, handler }) {
      routes.set(path, handler)
      return () => routes.delete(path)
    } },
  }
  function agent(id, parentSession) {
    const sections = []
    const events = new Map()
    const a = {
      id, status: 'idle',
      scope: { id },
      session: { header: { parentSession } },
      sections,
      ctx: {
        systemPrompt: { section(x) {
          sections.push(x)
          return () => { const i = sections.indexOf(x); if (i >= 0) sections.splice(i, 1) }
        } },
        on(name, fn) {
          events.set(name, fn)
          return () => events.delete(name)
        },
      },
      statusChange(status) {
        a.status = status
        events.get('agent/status')?.({ status })
      },
    }
    listeners.get('agent/created')?.forEach(fn => fn({ agent: a }))
    return a
  }
  async function request(endpoint, data, method = 'POST') {
    const handler = routes.get('/dsh-spm/' + endpoint.split('?')[0])
    assert.ok(handler, 'registered route ' + endpoint)
    const bytes = Buffer.from(JSON.stringify(data ?? {}))
    const req = {
      method,
      url: '/dsh-spm/' + endpoint,
      headers: { host: 'localhost', origin: 'http://localhost' },
      async *[Symbol.asyncIterator]() { yield bytes },
    }
    let response
    const res = {
      writeHead(code) { response = { code } },
      end(payload) { response.body = JSON.parse(payload) },
    }
    await handler(req, res)
    return response
  }
  const dispose = apply(ctx)
  return {
    directory, agent, request,
    close() {
      dispose()
      for (const fn of cleanup) fn()
      if (!existingDirectory) rmSync(directory, { recursive: true, force: true })
      if (before === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = before
    },
    state() { return JSON.parse(readFileSync(path.join(directory, 'dsh-system-prompt-manager', 'state.json'), 'utf8')) },
  }
}

test('bundled presets appear in state and are copied only by explicit user action', async () => {
  const h = harness()
  try {
    h.agent('preset-session')
    const initial = await h.request('state?sid=preset-session', undefined, 'GET')
    assert.equal(initial.code, 200)
    assert.deepEqual(initial.body.presets.map(p => p.id),
      ['codex-dsh', 'claude-dsh', 'opencode-dsh'])
    assert.equal(initial.body.selection.mode, 'native')
    assert.equal(initial.body.templates.length, 0)
    assert.equal(h.state().templates.length, 0)
    for (const preset of initial.body.presets) {
      const copied = await h.request('template', { name: preset.name, text: preset.text })
      assert.equal(copied.code, 200)
      assert.equal(copied.body.template.text, preset.text)
      await h.request('mode', { sessionId: 'preset-session', mode: 'custom',
        templateId: copied.body.template.id })
      assert.equal(h.state().templates.length > 0, true)
    }
    assert.equal(h.state().templates.length, 3)
    const selected = await h.request('state?sid=preset-session', undefined, 'GET')
    assert.equal(selected.body.selection.mode, 'custom')
  } finally { h.close() }
})

test('native / custom exact replacement / empty override with session isolation', async () => {
  const h = harness()
  try {
    const a = h.agent('session-a')
    const b = h.agent('session-b')
    assert.equal(a.sections.length, 0)
    const saved = await h.request('template', { name: '精确', text: '  纯文本 {{literal}}\n' })
    assert.equal(saved.code, 200)
    const id = saved.body.template.id
    assert.equal((await h.request('mode', { sessionId: 'session-a', mode: 'custom', templateId: id })).code, 200)
    assert.equal(a.sections.length, 1)
    assert.equal(a.sections[0].complete, true)
    assert.equal(a.sections[0].interpolate, false)
    assert.equal(a.sections[0].text(), '  纯文本 {{literal}}\n')
    assert.equal(b.sections.length, 0)
    await h.request('mode', { sessionId: 'session-a', mode: 'none' })
    assert.equal(a.sections[0].text(), '')
    assert.equal(a.sections[0].complete, true)
    await h.request('mode', { sessionId: 'session-a', mode: 'native' })
    assert.equal(a.sections.length, 0)
  } finally { h.close() }
})

test('running tasks hold a frozen snapshot and child inherits it', async () => {
  const h = harness()
  try {
    const p = h.agent('parent')
    const t = (await h.request('template', { name: 'A', text: 'before' })).body.template
    await h.request('mode', { sessionId: 'parent', mode: 'custom', templateId: t.id })
    p.statusChange('running')
    const changed = await h.request('mode', { sessionId: 'parent', mode: 'none' })
    assert.equal(changed.body.pending, true)
    assert.equal(p.sections[0].text(), 'before')
    const child = h.agent('child', 'parent')
    assert.equal(child.sections[0].text(), 'before')
    assert.equal(child.sections[0].complete, true)
    p.statusChange('idle')
    assert.equal(p.sections[0].text(), '')
    assert.equal(child.sections[0].text(), 'before')
    const childState = h.state().selections.child
    assert.equal(childState.frozenSnapshot.text, 'before')
  } finally { h.close() }
})

test('template edit is deferred during active task; delete of referenced template refuses', async () => {
  const h = harness()
  try {
    const a = h.agent('target')
    const t = (await h.request('template', { name: 'A', text: 'v1' })).body.template
    await h.request('mode', { sessionId: 'target', mode: 'custom', templateId: t.id })
    a.statusChange('running')
    await h.request('template', { id: t.id, name: 'A', text: 'v2' })
    assert.equal(a.sections[0].text(), 'v1')
    assert.equal((await h.request('delete', { id: t.id })).code, 409)
    a.statusChange('idle')
    assert.equal(a.sections[0].text(), 'v2')
    await h.request('mode', { sessionId: 'target', mode: 'native' })
    assert.equal((await h.request('delete', { id: t.id })).code, 200)
  } finally { h.close() }
})

test('invalid input fails closed and state remains unmodified', async () => {
  const h = harness()
  try {
    const a = h.agent('target')
    assert.equal((await h.request('mode', { sessionId: 'target', mode: 'custom', templateId: 'missing' })).code, 409)
    assert.equal((await h.request('mode', { sessionId: '../invalid', mode: 'none' })).code, 400)
    assert.equal(a.sections.length, 0)
    assert.equal(h.state().selections.target.mode, 'native')
  } finally { h.close() }
})

test('corrupt persisted data stops plugin load instead of resetting choices', () => {
  const d = mkdtempSync(path.join(tmpdir(), 'spm-invalid-'))
  const before = process.env.DSH_HOME
  process.env.DSH_HOME = d
  try {
    const dest = path.join(d, 'dsh-system-prompt-manager')
    mkdirSync(dest, { recursive: true })
    writeFileSync(path.join(dest, 'state.json'), '{broken}', 'utf8')
    assert.throws(() => apply({}), SyntaxError)
    assert.equal(readFileSync(path.join(dest, 'state.json'), 'utf8'), '{broken}')
  } finally {
    rmSync(d, { recursive: true, force: true })
    if (before === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = before
  }
})

test('persisted session choice and templates survive host restart', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'spm-restart-'))
  try {
    const first = harness(directory)
    try {
      first.agent('persisted')
      const tpl = (await first.request('template', { name: '保存', text: '内容' })).body.template
      await first.request('mode', { sessionId: 'persisted', mode: 'custom', templateId: tpl.id })
    } finally { first.close() }
    const second = harness(directory)
    try {
      const resumed = second.agent('persisted')
      assert.equal(resumed.sections[0].text(), '内容')
      assert.equal(resumed.sections[0].complete, true)
      assert.equal(second.state().templates.length, 1)
    } finally { second.close() }
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
