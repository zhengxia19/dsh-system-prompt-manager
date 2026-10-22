import fs from 'node:fs'
import path from 'node:path'
import { randomUUID, createHash } from 'node:crypto'

export const name = 'dsh-wire-probe'
export const inject = ['webServer', 'sessionController', 'agents', 'agentDefaultModel']
export function apply(ctx) {
  const out = process.env.DSH_WIRE_OUTPUT
  fs.mkdirSync(out, { recursive: true })
  const save = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n')
  const originalFetch = globalThis.fetch
  let active, started = false
  const result = { status: 'ready', testPrompt: '请只回复：WIRE_TEST_OK。不要调用工具。', runs: [] }
  const flush = () => save('result.json', result)
  flush()
  globalThis.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!active || !url.startsWith('https://130.130.130.229/v1/') || !url.includes('/chat/completions')) return originalFetch.call(this, input, init)
    const run = active
    const raw = typeof init?.body === 'string' ? init.body : input instanceof Request ? await input.clone().text() : init?.body ? Buffer.from(init.body).toString('utf8') : ''
    const index = run.requests.length + 1
    const filename = `${run.mode}-${index}.request.json`
    fs.writeFileSync(path.join(out, filename), raw)
    const body = JSON.parse(raw)
    const row = { filename, url, capturedAt: new Date().toISOString(), sha256: createHash('sha256').update(raw).digest('hex'), bytes: Buffer.byteLength(raw), model: body.model, roles: body.messages?.map(m => m.role), systemMessages: body.messages?.filter(m => m.role === 'system' || m.role === 'developer').length, hasSystemField: Object.hasOwn(body, 'system'), tools: body.tools?.length ?? 0 }
    run.requests.push(row)
    flush()
    try {
      const response = await originalFetch.call(this, input, init)
      row.httpStatus = response.status
      row.responseId = response.headers.get('x-request-id')
      flush()
      return response
    } catch (e) { row.error = String(e); flush(); throw e }
  }
  ctx.on('dispose', () => { globalThis.fetch = originalFetch })
  ctx.on('session/event', (session, event) => {
    const run = result.runs.find(r => r.sessionId === session.id)
    if (!run) return
    fs.appendFileSync(path.join(out, `${run.mode}.events.jsonl`), JSON.stringify(event) + '\n')
    if (event.type === 'turn/end') { run.turnEnd = event.data; run.finished = true; flush() }
  })
  async function runTests() {
    result.status = 'running'
    result.selection = ctx.agentDefaultModel.currentSelection()
    flush()
    for (const mode of ['native', 'none']) {
      const created = await ctx.sessionController.create({ cwd: 'D:/Downloads/test2', agentPreset: 'standard' })
      const run = { mode, sessionId: created.sessionId, requests: [] }
      result.runs.push(run)
      flush()
      const modeResponse = await originalFetch(`${ctx.webServer.getOrigin()}/dsh-spm/mode`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: created.sessionId, mode }) })
      run.modeResult = await modeResponse.json()
      if (!modeResponse.ok || !run.modeResult.ok || run.modeResult.pending) throw new Error('mode selection failed: ' + JSON.stringify(run.modeResult))
      active = run
      await ctx.sessionController.prompt({ sessionId: created.sessionId, requestId: randomUUID(), content: [{ type: 'text', text: result.testPrompt }], mode: 'followup', clientTimeZone: 'Asia/Shanghai' }, new AbortController().signal)
      const deadline = Date.now() + 240000
      while (!run.finished && Date.now() < deadline) await new Promise(r => setTimeout(r, 200))
      if (!run.finished) throw new Error('timed out waiting for test turn: ' + mode)
      active = undefined
      if (!run.requests.length) throw new Error('No final HTTP request captured: ' + mode)
    }
    result.status = 'complete'
    flush()
  }
  ctx.webServer.register({ kind: 'exact', path: '/wire-test/run', handler(req, res) {
    if (req.method !== 'POST' || req.headers.host !== new URL(ctx.webServer.getOrigin()).host || req.headers.origin) { res.writeHead(403); res.end(); return }
    if (!started) { started = true; runTests().catch(e => { active = undefined; result.status = 'failed'; result.error = String(e); result.stack = e.stack; flush() }) }
    res.writeHead(202, { 'content-type': 'application/json' }); res.end(JSON.stringify({ status: result.status }))
  } })
  ctx.webServer.register({ kind: 'exact', path: '/wire-test/status', handler(req, res) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(result)) } })
}
