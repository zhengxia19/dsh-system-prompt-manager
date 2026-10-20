/**
 * DSH System Prompt Manager — host entry.
 * Uses public DSH agent lifecycle, scoped systemPrompt.section and webServer.
 * No private Agent Loop patching or globally active complete section.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  initialState, validateState, assertSessionId, assertMode, assertTemplate,
  findTemplate, makeSnapshot, resolveSelection, choose, isInUse,
} from './state.js'

export const name = 'dsh-system-prompt-manager'
export const inject = ['systemPrompt', 'webServer', 'agents', 'sessions']
const SECTION_NAME = 'dsh-system-prompt-manager:complete'
const MAX_BODY = 1024 * 1024

function home() { return process.env.DSH_HOME || path.join(homedir(), '.dsh') }
function send(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(obj))
}
function sameOrigin(req) {
  if (!req.headers.origin) return true
  try {
    const target = new URL(req.headers.origin)
    return target.host === req.headers.host && ['http:', 'https:'].includes(target.protocol)
  } catch { return false }
}
async function readBody(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw new TypeError('request body too large')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
function exactSnapshot(s, sid) {
  const selection = resolveSelection(s, sid)
  if (selection.frozenSnapshot) {
    return Object.freeze({ ...selection.frozenSnapshot })
  }
  return makeSnapshot(s, selection)
}
function validSnapshot(snapshot) {
  if (!snapshot || !['native', 'custom', 'none'].includes(snapshot.mode)) throw new TypeError('invalid snapshot')
  if (snapshot.mode === 'custom' && (!snapshot.text || typeof snapshot.text !== 'string')) throw new TypeError('missing snapshot text')
  return snapshot
}

export function apply(ctx) {
  const stateDir = path.join(home(), 'dsh-system-prompt-manager')
  const statePath = path.join(stateDir, 'state.json')
  mkdirSync(stateDir, { recursive: true })
  let state
  if (existsSync(statePath)) {
    // Corrupted persistence must not silently reset user selections.
    state = validateState(JSON.parse(readFileSync(statePath, 'utf8')))
  } else {
    state = initialState()
    writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n')
  }

  function persist(next) {
    validateState(next)
    const tmp = statePath + '.' + process.pid + '.' + randomUUID() + '.tmp'
    writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
    renameSync(tmp, statePath)
    state = next
  }
  function mutate(mutator) {
    const next = structuredClone(state)
    const result = mutator(next)
    persist(next)
    return result
  }

  // Active bindings are explicitly scoped to one Agent, not global.
  const active = new Map()
  function sectionFor(entry, snapshot) {
    if (entry.disposeSection) {
      entry.disposeSection()
      entry.disposeSection = null
    }
    entry.snapshot = validSnapshot(snapshot)
    if (snapshot.mode === 'native') return
    entry.disposeSection = entry.agent.ctx.systemPrompt.section({
      name: SECTION_NAME,
      order: -10000,
      complete: true,
      interpolate: false,
      text: () => entry.snapshot.text,
    })
  }
  function rebind(sid) {
    const entry = active.get(sid)
    if (!entry) return
    // Do not update the prompt of an already-running /goal or child task.
    if (entry.agent.status !== 'idle') {
      entry.pending = true
      return
    }
    entry.pending = false
    sectionFor(entry, exactSnapshot(state, sid))
  }

  function onCreated(payload) {
    const agent = payload?.agent
    if (!agent || !agent.ctx || typeof agent.id !== 'string') throw new TypeError('invalid created agent')
    const sid = agent.id
    assertSessionId(sid)
    let createdSnapshot
    if (!Object.hasOwn(state.selections, sid)) {
      const parent = agent.session?.header?.parentSession
      if (parent) {
        const inherited = active.get(parent)?.snapshot ?? exactSnapshot(state, parent)
        createdSnapshot = Object.freeze({ ...inherited })
        // Keep the precise parent execution text frozen for this child.
        mutate(s => { s.selections[sid] = {
          mode: inherited.mode, templateId: inherited.templateId,
          frozenSnapshot: { ...inherited },
        } })
      } else {
        // Snapshot the default choice when a session first appears.
        const init = { mode: state.defaultMode, templateId: state.defaultTemplateId }
        mutate(s => { s.selections[sid] = init })
        createdSnapshot = makeSnapshot(state, init)
      }
    }
    const snapshot = createdSnapshot ?? exactSnapshot(state, sid)
    const entry = { agent, snapshot: null, disposeSection: null, pending: false }
    sectionFor(entry, snapshot)
    active.set(sid, entry)
    // Scoped listener is owned by the agent scope and automatically cleaned up.
    agent.ctx.on('agent/status', ({ status }) => {
      if (status === 'idle' && active.get(sid) === entry && entry.pending) rebind(sid)
    })
  }
  const offCreated = ctx.on('agent/created', onCreated)
  const offDisposed = ctx.on('agent/disposed', payload => {
    const agent = payload?.agent
    const sid = agent?.id
    const entry = active.get(sid)
    if (!entry || entry.agent !== agent) return
    entry.disposeSection?.()
    active.delete(sid)
  })

  function route(method, url, handler) {
    return ctx.webServer.register({
      kind: 'exact', path: '/dsh-spm/' + url,
      handler: async (req, res) => {
        if (req.method !== method) return send(res, 405, { ok: false, error: 'method not allowed' })
        if (!sameOrigin(req)) return send(res, 403, { ok: false, error: 'untrusted origin' })
        try { await handler(req, res) }
        catch (err) {
          const message = err?.message ?? String(err)
          ctx.logger?.warn?.('dsh-spm: ' + message)
          send(res, err instanceof TypeError ? 400 : 409, { ok: false, error: message })
        }
      },
    })
  }

  ctx.effect(() => {
    const routes = [
      route('GET', 'state', (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const sid = assertSessionId(url.searchParams.get('sid'))
        send(res, 200, {
          ok: true,
          templates: state.templates,
          selection: resolveSelection(state, sid),
          active: active.get(sid)?.snapshot?.mode ?? null,
          pending: active.get(sid)?.pending ?? false,
          defaultMode: state.defaultMode,
          defaultTemplateId: state.defaultTemplateId,
          historyWarning: '切换仅对后续请求生效；历史会话内容仍可能影响输出。',
        })
      }),
      route('POST', 'mode', async (req, res) => {
        const b = await readBody(req)
        const sid = assertSessionId(b.sessionId)
        const mode = assertMode(b.mode)
        const templateId = typeof b.templateId === 'string' ? b.templateId : null
        mutate(s => { choose(s, sid, mode, templateId) })
        rebind(sid)
        send(res, 200, { ok: true, mode, pending: active.get(sid)?.pending ?? false })
      }),
      route('POST', 'template', async (req, res) => {
        const b = await readBody(req)
        const id = typeof b.id === 'string' && b.id ? b.id : 'tpl-' + randomUUID()
        const old = findTemplate(state, id)
        if (b.id && !old) throw new Error('template not found')
        const template = assertTemplate({ ...b, id }, old)
        mutate(s => {
          const index = s.templates.findIndex(t => t.id === id)
          if (index >= 0) s.templates[index] = template
          else s.templates.push(template)
        })
        for (const sid of Object.keys(state.selections)) {
          if (state.selections[sid].templateId === id && !state.selections[sid].frozenSnapshot) rebind(sid)
        }
        send(res, 200, { ok: true, template })
      }),
      route('POST', 'delete', async (req, res) => {
        const b = await readBody(req)
        const id = b.id
        if (!findTemplate(state, id)) throw new Error('template not found')
        // Deleting an in-use template requires explicit reselection.
        if (isInUse(state, id)) throw new Error('template is referenced; switch sessions first')
        mutate(s => { s.templates = s.templates.filter(t => t.id !== id) })
        send(res, 200, { ok: true })
      }),
      route('POST', 'default', async (req, res) => {
        const b = await readBody(req)
        const snapshot = makeSnapshot(state, { mode: assertMode(b.mode), templateId: b.templateId })
        mutate(s => {
          s.defaultMode = snapshot.mode
          s.defaultTemplateId = snapshot.templateId
        })
        send(res, 200, { ok: true })
      }),
      route('GET', 'diagnose', async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const sid = assertSessionId(url.searchParams.get('sid'))
        const entry = active.get(sid)
        if (!entry) throw new Error('agent not active; cannot diagnose a request')
        const snapshot = entry.snapshot
        const assembly = await ctx.systemPrompt.assemble({ scope: entry.agent.scope })
        const complete = assembly.sections.filter(x => x.name === SECTION_NAME)
        send(res, 200, {
          ok: true, mode: snapshot.mode, revision: snapshot.revision,
          sectionRegistered: complete.length > 0,
          sectionsCount: assembly.sections.length,
          expectedSystemChars: snapshot.mode === 'custom' ? snapshot.text.length : null,
          // No text or API keys ever appear in the diagnostic response.
          adapterNote: snapshot.mode === 'none'
            ? 'Empty internal system node: verify provider wire omits it; pi-ai context does so.'
            : null,
        })
      }),
    ]
    return () => { for (const off of routes) off() }
  }, 'dsh-spm:http')

  return () => {
    offCreated()
    offDisposed()
    for (const entry of active.values()) entry.disposeSection?.()
    active.clear()
  }
}
