import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const dir = path.dirname(fileURLToPath(import.meta.url))
const read = name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8').replace(/^\uFEFF/, ''))
const result = read('result.json')
assert.equal(result.status, 'complete')
const bodies = {}
for (const run of result.runs) {
  assert.equal(run.turnEnd.reason.kind, 'completed')
  assert.equal(run.modeResult.pending, false)
  for (const request of run.requests) {
    const raw = fs.readFileSync(path.join(dir, request.filename))
    assert.equal(createHash('sha256').update(raw).digest('hex'), request.sha256)
    assert.equal(request.httpStatus, 200)
  }
  const body = read(`${run.mode}-1.request.json`)
  assert.ok(body.messages.some(m => m.role === 'user' && m.content === result.testPrompt))
  assert.equal(body.tools.length, 37)
  bodies[run.mode] = body
  const events = fs.readFileSync(path.join(dir, `${run.mode}.events.jsonl`), 'utf8').trim().split('\n').map(JSON.parse)
  assert.equal(events.filter(e => e.type === 'assistant/message').at(-1).data.message.content.filter(b => b.type === 'text').map(b => b.text).join(''), 'WIRE_TEST_OK')
  const internalSystem = events.find(e => e.type === 'system/message').data.message.content.map(b => b.text).join('')
  if (run.mode === 'native') assert.equal(body.messages.find(m => m.role === 'developer').content, internalSystem)
  else assert.equal(internalSystem, '')
}
assert.equal(bodies.native.messages.filter(m => ['system', 'developer'].includes(m.role)).length, 1)
assert.equal(bodies.none.messages.filter(m => ['system', 'developer'].includes(m.role)).length, 0)
assert.equal(Object.hasOwn(bodies.none, 'system'), false)
assert.equal(Object.hasOwn(bodies.none, 'systemPrompt'), false)
assert.deepEqual(bodies.native.tools, bodies.none.tools)
const nativeWithoutSystem = { ...bodies.native, messages: bodies.native.messages.filter(m => !['system', 'developer'].includes(m.role)) }
assert.deepEqual(nativeWithoutSystem, bodies.none)
console.log('PASS: real requests, hashes, HTTP 200, completed responses, exact native prompt, no system/developer in none, all other request fields identical.')
