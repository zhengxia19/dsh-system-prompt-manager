# Codex / Claude Code / OpenCode 系统提示词来源核查与 DSH 适配记录

核查日期：2026-10-22。目标运行时：DSH Desktop `dsh-v0.2.1-rc.2`；插件 `dsh-system-prompt-manager`。本文件的结论限定为**源码和模板文本的适配核查**，不代表 DSH Desktop 实机效果或模型性能 A/B 测试。

## 0. 源码核查的共同前提

1. 插件 `lib/index.js` 自定义模式注册 Agent 作用域 `complete:true`、`interpolate:false`，`lib/state.js` 将模板视为原样纯文本；见仓库 T01 源码核查记录。
2. DSH 当前可用工具、权限和子 Agent 由 Harness 和会话实际环境决定；系统提示词**不能**自行创建缺失工具、放开权限或复刻其他 Agent 的内部状态机。
3. 因此三套文件都是**独立原创改编的 DSH 兼容提示词**，不是原厂提示词逐字复制，也不宣称还原原厂运行效果。三个来源仓库的基础提示词、动态变量和工具说明不能被直接拼接成一份号称“官方完整版”的提示词。
4. 三套均使用纯 UTF-8 文本、无占位符、不需变量插值；添加到用户模板库后执行现有自定义完整替换逻辑。
5. 安装与切换不覆盖历史或当前运行任务：内置参考模板作为只读来源展示；用户点击“添加并使用”后才创建独立可编辑副本、切换会话模式。旧会话历史可能继续影响行为。

## 1. Codex：面向严谨代码实施

**一手来源：** OpenAI 官方仓库
- https://github.com/openai/codex/blob/main/codex-rs/protocol/src/prompts/base_instructions/default.md
- 核查时该文件的 Git blob SHA：`907ff8b877026871b088f01f4366cea36e1f02cd`。
- 文件明确涉及 `AGENTS.md` 作用域、计划、终端与补丁执行、验证原则、执行边界和交付形式；它描述的是 Codex CLI 运行环境，而非通用系统提示词规范。

**明确采用：** 针对适用目录的 `AGENTS.md` 规则、理解代码后编辑、按依赖计划执行、避免无关重构、测试验证后汇报、区分完成和未经核实。

**明确剔除：** `apply_patch`、`update_plan` 等 Codex 工具调用协议、Codex CLI 身份、沙箱与提权授权模型、对 Git 提交的环境假设。改用“本轮实际可用工具”。

**交付：** `presets/codex-dsh.txt`，用于编码实施、重构和缺陷修复；重点是精确执行与验证纪律。

## 2. Claude Code：面向复杂任务协调

**来源性质：** Anthropic 官方 Claude Code 发布包提示词的第三方提取仓库（Piebald-AI），不能说成 Anthropic 发布的完整官方规范。
- https://github.com/Piebald-AI/claude-code-system-prompts
- 本次核查 README 公布的版本为 Claude Code `v2.1.305`（2026-10-20），不同提示词片段内标记的 `ccVersion` 并不完全一致。
- 提取仓库本次索引的 Git commit：`e3a84c51e273bae4a28ab85cc4ecd6cae9d6b611`。
- 查阅的实际文件：
  - `system-prompts/system-prompt-task-approval-continuity.md`
  - `system-prompts/system-prompt-action-safety-and-truthful-reporting.md`
  - `system-prompts/system-prompt-reporting-outcomes.md`
  - `system-prompts/system-prompt-subagent-delegation-restraint.md`
  - `system-prompts/system-prompt-outcome-first-communication-style.md`
  - `system-prompts/agent-prompt-general-purpose.md`
  - `system-prompts/agent-prompt-explore.md`
  - `system-prompts/agent-prompt-plan-mode-enhanced.md`

**核实结果：** Claude Code 主提示词是动态拼装的多个片段，部分内容依赖工具列表和运行时变量。只读 Explore/Plan 提示词是**子代理专用**，不可直接用作能写入代码的 DSH 主代理提示词。

**明确采用：** 多阶段任务划分、谨慎委派、任务授权连续性、结果验证、不可逆操作检查、主代理对子任务验收负责、失败先报告。

**明确剔除：** `Bash`/`Read`/`Write`/`Agent`/`TodoWrite` 专属工具、动态插值表达式、Claude Code 特定子代理配置、强制只读模式的说法。

**交付：** `presets/claude-dsh.txt`，用于依赖明确的长任务、跨模块实施和子 Agent 协同；优先按实际能力委派，不强制拆任务。

## 3. OpenCode：面向日常高效开发

**一手来源：** OpenCode 官方仓库（`dev` 分支），本次通过仓库实时接口获取了下列真实文件：
- https://github.com/anomalyco/opencode/blob/dev/packages/core/src/session/runner/prompt/system.txt（Git blob SHA `0e02ced78d7aa90f23b5dbb2c7146dfa0d0bb409`）
- https://github.com/anomalyco/opencode/blob/dev/packages/core/src/plugin/system-prompt/gpt.txt（Git blob SHA `4a30126f768e3014c67126ce1234f9f4a4ab4140`）
- https://github.com/anomalyco/opencode/blob/dev/packages/core/src/plugin/system-prompt/meta.txt（Git blob SHA `bb6094bf605ac5e6cab14aa7f57528b2c426b427`）
- https://github.com/anomalyco/opencode/blob/dev/packages/core/src/plugin/agent.ts
- https://github.com/anomalyco/opencode/blob/dev/packages/core/src/session/model-request.ts

**必须纠正的旧资料：** 搜索索引还可找到 `packages/opencode/src/session/prompt/default.txt` 等旧结构，**但这些路径在本次当前 `dev` 分支实际读取时返回 404**。因此未以索引旧文件当作当前主运行时真实实现。

**核实结果：** 当前提示词要求简洁、可核实、遵守邻近代码风格、谨慎处理未提交修改；Agent 的 `system` 与工具权限分属不同配置/运行路径，不能把完整的 Build/Plan 能力归功于文本本身。

**明确采用：** 日常工具优先、准确文件引用、局部修改、检查实际依赖、测试与事实核验、简明交付。

**明确剔除：** OpenCode CLI 身份、专用 `shell`/`read`/`edit`/`subagent` 工具名、模型身份模板占位符、`system-reminder` 专属解释、Build/Plan 权限承诺。

**交付：** `presets/opencode-dsh.txt`，用于小到中型开发任务和快速定位修复。

## 4. 功能集成与验收判定

| 验收项 | 判定标准 | 本次状态 |
|---|---|---|
| 源码来源 | 每种至少有读取到的真实源码或可明确定位的提示词片段；记录差异 | 已完成 |
| 三份内容 | 三个不同 UTF-8 文件，均为不依赖外部工具名的独立完整指令 | 已写入；自动化检查待 CI |
| 原样替换 | 使用现有 `complete:true` / `interpolate:false`，保存文本逐字一致 | 已有 Mock 契约；真实 wire 待验收 |
| 可直接选择 | UI 展示内置来源并可预览、独立复制到用户库、会话切换 | 源码已编码；Windows UI 待验收 |
| 用户数据 | 插件不自动改写 `state.json` 中已有模板或当前默认模式 | 源码实现；自动化回归待 CI |
| 构建与发布 | `npm run check`、`npm pack --dry-run`、CI 和 CLI bundle smoke | 待最新运行结果 |
| 实际效果 | DSH Windows Desktop v0.2.1-rc.2 中各模板正确到达 Provider，长任务、工具调用行为有效 | **未验收** |
| 性能优劣 | 同模型、同任务集进行 A/B 比较，以完成率/误操作/Token 和耗时评估 | **未知，不做提升保证** |

## 5. 建议的实机 A/B 用例（尚未执行）

1. **Codex**：已有 `AGENTS.md` 的 TS/JS 仓库中做范围明确的修复，观察是否阅读规则、最小化修改并运行正确检查。
2. **Claude**：三个具有前置关系的任务、其中包含可并行独立调查，观察是否避免重复委派、按依赖验收、保持任务状态。
3. **OpenCode**：一个小型局部问题定位修复，观察搜索/读取次数、无关改动数量、验证与最终反馈。
4. 三套均要验证：自定义模式实际发送的是所选纯文本、历史切换警告可见、任务运行中提示词不漂移、子 Agent 继承效果符合插件 V1.0 约定。
5. 同一模型和模型参数、相同代码快照、新建干净会话、相同用户指令作为比较条件。未运行实测前不得宣称某模板“更强”。
