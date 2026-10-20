# DSH System Prompt Manager

DeepSeek Harness Desktop 的**会话级系统提示词控制插件**，支持原生、自定义完整替换、无系统提示词三种模式。

> 开发状态：源码与自动化测试已建立；Windows DSH Desktop v0.2.1-rc.2 实机兼容和最终模型 API 请求验收尚未完成。不要将 CI 通过理解为插件已在桌面端完整验收。

## 三种模式

| 模式 | 实际语义 |
|---|---|
| 原生 | 不注册额外完整提示词段，由 DSH 生成默认系统提示词 |
| 自定义 | 选一个 UTF-8 模板，经 Agent 作用域 complete 段完整替换原生文本，且不插值 |
| 无提示词 | Agent 产生空提示词；pi-ai/DeepSeek 适配器将其从 wire 省略（最终仍须通过真实请求验证） |

切换在下一轮生效；运行中的任务保持之前快照，子 Agent 继承主任务当前执行快照。旧会话历史可能继续影响生成效果。模板与会话选择存于 `$DSH_HOME/dsh-system-prompt-manager/state.json`，默认位置为用户主目录的 `.dsh` 下。

## 安装（待 Windows Desktop 验证）

DSH Desktop → Plugins → Add plugin → Install a third-party plugin，在包地址中输入：

```text
https://github.com/zhengxia19/dsh-system-prompt-manager.git
```

官方插件管理器说明支持 Git 仓库、npm 包、tarball 和本地路径。安装后启用插件，在会话输入框左侧查找“系统提示词”控件。**实际运行验证未完成前请勿将此步骤当作已测试安装流程。**

本地仅构建/校验：

```bash
npm run check
npm pack --dry-run
npm pack
```

不依赖额外 npm 运行时包；与 DSH 的对接通过 `package.json` 的 `dsh.bundle` 与 `dsh.client` 字段完成。

## 功能

- 会话级切换，重启后恢复，新的会话默认使用原生模式（可配置）。
- 多模板新建、编辑、重命名、复制、删除、导入和 JSON 导出。
- 原文保留包括换行、空格及 `{{...}}` 等字面内容。
- 子 Agent 继承任务启动时的完整文本快照，运行中切换延后处理。
- 冲突导致官方 complete 组装失败时阻止模型请求，不静默降级。
- 状态和组装诊断接口；不直接向诊断结果返回模板全文。

## 已知限制与验证状态

- 源码级兼容分析基于官方 `dsh-v0.2.1-rc.2`，详见 [T01 核查记录](docs/T01-技术可行性核查记录.md)。
- CI 覆盖 Node 22 语法、独立状态/Mock Agent 测试、npm 打包与官方源码接口断言；不包含真实 DSH Desktop 的图形界面或网络请求。
- 与任意第三方 Provider 适配器的“完全无 system”兼容性不可推定，需要分别抓包确认。
- 历史会话中存在旧系统消息和其他运行时数据时，本插件不修改历史。

## 文档

- [V1.0 设计方案](docs/设计方案-V1.0.md)
- [功能清单](docs/功能清单-V1.0.md)
- [任务状态](docs/实施任务清单-V1.0.md)
- [验收标准](docs/验收标准-V1.0.md)
- [技术风险](docs/技术可行性与风险.md)
- [T01 源码级证据](docs/T01-技术可行性核查记录.md)
- [变更记录](CHANGELOG.md)
- [协作规范](AGENTS.md)

## 相关项目

- [DSH 官方仓库](https://github.com/deepseek-ai/deepseek-harness)
- [dsh-plugin-masterprompt](https://github.com/lw-storm/dsh-plugin-masterprompt)（参考 UI/HTTP 交互，非运行时依赖）
