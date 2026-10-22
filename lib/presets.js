/** Bundled, optional DSH-adapted presets; never mutate persisted user templates. */
import { readFileSync } from 'node:fs'

const definitions = [
  { id: 'codex-dsh', name: 'Codex 风格（DSH 适配）',
    description: '规范化编码实施：AGENTS.md、最小修改、计划与验证。',
    file: '../presets/codex-dsh.txt' },
  { id: 'claude-dsh', name: 'Claude Code 风格（DSH 适配）',
    description: '复杂任务协调：子代理、连续执行、逐项验收与真实报告。',
    file: '../presets/claude-dsh.txt' },
  { id: 'opencode-dsh', name: 'OpenCode 风格（DSH 适配）',
    description: '高效日常开发：工具优先、局部修改、简明交付。',
    file: '../presets/opencode-dsh.txt' },
]

export const PRESETS = Object.freeze(definitions.map(({ id, name, description, file }) =>
  Object.freeze({ id, name, description, text: readFileSync(new URL(file, import.meta.url), 'utf8') })
))
