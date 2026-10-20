import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve('.upstream')
const available = existsSync(path.join(root, 'packages/core/system-prompt/src/index.ts'))
function source(relative) { return readFileSync(path.join(root, relative), 'utf8') }
function has(text, fragment, explanation) { assert.ok(text.includes(fragment), explanation) }

test('target DSH tag exports scoped complete prompt and no-interpolation', { skip: !available }, () => {
  const s = source('packages/core/system-prompt/src/index.ts')
  has(s, 'readonly complete?: boolean', 'complete section API was removed')
  has(s, 'readonly interpolate?: boolean', 'no-interpolation section API was removed')
  has(s, 'completeSections.length > 1', 'complete conflict rejection changed')
  has(s, '.filter(text => text.length > 0)', 'empty rendered section behavior changed')
})

test('target DSH tag exposes session-bound agent lifecycle and scoped registration', { skip: !available }, () => {
  const a = source('packages/core/agent/src/index.ts')
  const d = source('packages/core/agent/src/dispatch.ts')
  has(a, "'agent/created'", 'created lifecycle missing')
  has(a, "'agent/disposed'", 'disposed lifecycle missing')
  has(a, 'list(): Agent[]', 'existing-agent enumeration missing')
  has(d, 'scope: agent', 'assembly scope no longer Agent')
})

test('target DSH tag does NOT treat empty internal system node as proof of wire system', { skip: !available }, () => {
  const a = source('packages/core/agent-loop/src/runtime-context.ts')
  const p = source('packages/llm/llm-pi-ai/src/context.ts')
  const d = source('packages/llm/llm-deepseek/src/serialize.ts')
  has(a, 'createSystemMessage(rendered)', 'internal system projection changed')
  has(p, 'systemPrompt || undefined', 'pi-ai empty system omission changed')
  has(p, 'content.length > 0', 'pi-ai empty in-history filtering changed')
  has(d, "system.length === 0 ? {} : { system }", 'DeepSeek wire system omission changed')
})

test('target DSH tag retains composer toolbar injection slot', { skip: !available }, () => {
  const s = source('packages/client/ui-conversation/src/client/contract/slots.ts')
  has(s, "'conversation.input.left'", 'composer plugin slot removed')
})
