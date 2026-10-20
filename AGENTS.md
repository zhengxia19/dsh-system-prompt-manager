# AGENTS.md

本仓库为 DeepSeek Harness Desktop 系统提示词管理插件。V1.0 功能范围已冻结，已有插件源码与自动化测试，**不能将编译、Mock 和 CLI 添加成功宣称为 Windows 桌面端完整验收**。

## 开发顺序

先读 README.md、docs/设计方案-V1.0.md、docs/实施任务清单-V1.0.md、docs/T01-技术可行性核查记录.md 与 docs/实施与验收进度-2026-10-20.md。按 T01–T10 依赖实施，完成后更新任务状态与证据。

保持三个模式严格语义：原生不干预；自定义使用 scoped complete 且保留模板全文；无提示词必须核查**真正 Provider 请求**没有 system 消息/字段。内部空 system/message 占位与最终 wire 消息不同，不能相互替代证据。

子 Agent 继承任务开始时冻结的模板全文；在已有历史的会话中切换仅下一轮生效并提示旧历史影响。不得静默降级，不修改 DSH 核心或模型工具权限。

变更需运行 npm run check 和打包检查；与目标官方标签 dsh-v0.2.1-rc.2 核对 API。保留 CLI bundle smoke / Windows 自动化验证。故障时回报实际证据，不猜测。

文档使用中文和原始 Unicode 中文文件名。生成可供用户下载的归档时优先真实中文文件名，并提供 ASCII 备用名称（内容一致）。
