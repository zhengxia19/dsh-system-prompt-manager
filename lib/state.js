/**
 * Pure, dependency-free state and snapshot logic.
 * File and prompt contents are never implicitly trimmed or interpolated.
 */
export const MODES = Object.freeze(['native', 'custom', 'none'])
export const MAX_TEXT = 100000
export const MAX_NAME = 100
export const MAX_ID = 200

export function initialState() {
  return { version: 1, defaultMode: 'native', defaultTemplateId: null, templates: [], selections: {} }
}

export function assertMode(mode) {
  if (!MODES.includes(mode)) throw new TypeError('invalid prompt mode')
  return mode
}

export function assertSessionId(sid) {
  if (typeof sid !== 'string' || !sid || sid.length > MAX_ID || !/^[\w.-]+$/.test(sid)) {
    throw new TypeError('invalid sessionId')
  }
  return sid
}

export function assertTemplate(input, old) {
  if (!input || typeof input !== 'object') throw new TypeError('invalid template')
  const name = input.name
  const text = input.text
  if (typeof name !== 'string' || !name.trim() || name.length > MAX_NAME) throw new TypeError('invalid template name')
  if (typeof text !== 'string' || !text.length || text.length > MAX_TEXT) throw new TypeError('invalid template text')
  if (text.includes('\u0000')) throw new TypeError('NUL is not allowed')
  return {
    id: old?.id ?? input.id,
    name: name.trim(),
    text,
    revision: (old?.revision ?? 0) + 1,
    createdAt: old?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  }
}

export function validateState(s) {
  if (!s || s.version !== 1 || !Array.isArray(s.templates) ||
      !s.selections || typeof s.selections !== 'object') throw new TypeError('unsupported persisted state')
  assertMode(s.defaultMode)
  for (const t of s.templates) {
    if (typeof t.id !== 'string' || !t.id || typeof t.name !== 'string' ||
        typeof t.text !== 'string' || typeof t.revision !== 'number') throw new TypeError('invalid persisted template')
  }
  for (const sel of Object.values(s.selections)) {
    if (!sel || typeof sel !== 'object') throw new TypeError('invalid persisted session selection')
    assertMode(sel.mode)
  }
  return s
}

export function findTemplate(s, id) {
  return s.templates.find(t => t.id === id)
}

export function resolveSelection(s, sid) {
  return s.selections[sid] ?? { mode: s.defaultMode, templateId: s.defaultTemplateId }
}

/** Snapshot is immutable and retains exact text independent of subsequent template edits. */
export function makeSnapshot(s, selection) {
  assertMode(selection.mode)
  const mode = selection.mode
  if (mode === 'custom') {
    const t = findTemplate(s, selection.templateId)
    if (!t) throw new Error('selected template is missing')
    return Object.freeze({ mode, templateId: t.id, revision: t.revision, text: t.text })
  }
  return Object.freeze({ mode, templateId: null, revision: 0, text: '' })
}

export function choose(s, sid, mode, templateId) {
  assertSessionId(sid)
  const snapshot = makeSnapshot(s, { mode: assertMode(mode), templateId })
  s.selections[sid] = { mode: snapshot.mode, templateId: snapshot.templateId }
  return snapshot
}

export function isInUse(s, templateId) {
  return s.defaultMode === 'custom' && s.defaultTemplateId === templateId ||
    Object.values(s.selections).some(x => x.mode === 'custom' && x.templateId === templateId)
}
