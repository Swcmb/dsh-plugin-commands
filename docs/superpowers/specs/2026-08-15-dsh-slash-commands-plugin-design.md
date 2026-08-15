# DSH 通用斜杠命令插件 · 设计文档

日期：2026-08-15
状态：已与用户逐节确认

## 1. 背景与目标

本仓库原为 OpenCode 长期记忆插件，现改造为 **DeepSeek Harness (DSH) 插件**：提供 opencode 风格的自定义斜杠命令——用户在 DSH Web UI 输入 `/opsx-explore <想法>`，插件把 `.agents/commands/opsx-explore.md` 的正文作为用户消息提交给 AI，等价于 opencode 中的 `/opsx:explore`。

**定位**：通用命令加载器。插件不绑定 OpenSpec，任何放在命令目录里的 markdown 文件都会成为斜杠命令；本仓库的 6 个 opsx 命令只是首个使用者。

**成功标准**：`dsh web --patch ./cordis.yml` 启动后，Web UI `/` 菜单出现 `.agents/commands/` 下所有命令；执行 `/opsx-explore <想法>` 后 AI 收到完整命令正文并进入 explore 模式，体验与 opencode 等价（仅命名由冒号变连字符）。

## 2. 已核实的 DSH API 事实（DSH 0.1.0-rc.6，本机源码核实）

- **命令注册**：`ctx.inject(['commands'], cmdCtx => cmdCtx.commands.register(def))`，服务由 `@deepseek-ai/dsh-commands` 提供。
- `CommandDefinition = { name, description, input?: { hint }, recordInput?, handler }`；handler 收到 `{ commandId, agent, rawInput, signal }`，返回 `{ kind: 'success'|'error', text? }`。
- **命名硬约束**：命令名必须匹配 `^[a-z][a-z0-9_-]*$`（首字符必须小写字母，其余为小写字母/数字/`_`/`-`），**不支持冒号** → `/opsx:explore` 必须写作 `/opsx-explore`。
- 命令 handler 运行在 UI 命令面，**结果不进模型历史**。要把内容交给模型，须用 `agent.steer(message)` 提交 UserMessage（DSH 自带 `/plan` 命令即此做法）。
- `UserMessage` 必须带 branded `id` 与 `role`（`Message` 接口必填字段，`NewMessage = Omit<Message,'id'>` 证实）——**不能内联字面量**，须用官方工厂 `createUserMessage({ content, source })`（DSH 自带 `/plan` 即此做法）。工厂所在包 `@deepseek-ai/dsh-llm@0.0.1-rc.1` 已独立发布到 npm。
- Cordis 插件格式：`export const name / inject / apply(ctx)`；注册即副作用，卸载自动清理；同名同层注册会失败。
- DSH 原生扫描 `.agents/skills/`（模型可调用），但**不扫描** `.agents/commands/`——本插件即补此桥。
- skill registry 的 `userInvocable` 概念在当前 shipped base 中没有斜杠命令适配器，「零插件改 skill」方案不可行（已排除）。

## 3. 架构

```
dsh-plugin-openspec/（仓库根）
├── src/
│   ├── index.ts     # Cordis 入口：name/inject/apply，装配 loader + commands
│   ├── loader.ts    # 扫描命令目录、解析 frontmatter、同名去重
│   └── commands.ts  # 注册命令 + steer 消息构造
├── dist/            # bun build 产物（cordis.yml 指向 dist/index.js）
├── cordis.yml       # --patch 加载配置（name 为产物绝对路径）
├── .agents/commands/   # 6 个 opsx-*.md（现有，被插件加载）
└── .agents/skills/    # 6 个 SKILL.md（DSH 原生扫描，与本插件无关，保持不动）
```

**运行时依赖仅一项**：`@deepseek-ai/dsh-llm` 的 `createUserMessage` 工厂（构建 `--external`，运行时由项目 node_modules 解析，与上个实验 external cordis/dsh-tools 同机制）；`@deepseek-ai/cordis`、`@deepseek-ai/dsh-commands` 仅作 devDependencies 提供类型。frontmatter 用手写极简解析（仅单行 `key: value`），不引 yaml/zod。

## 4. 加载规则（loader.ts）

- **项目根**：最近含 `.git` 的祖先目录；无 `.git` 则用 cwd（与 DSH skill-filesystem 一致）。
- **扫描目录**（优先级降序，同名去重、高者优先）：
  1. `<root>/.dsh/commands/*.md`
  2. `<root>/.agents/commands/*.md`
- **命名**：文件名去 `.md` 即命令名，必须匹配 `/^[a-z][a-z0-9_-]*$/`（首字符必须小写字母），否则跳过并 `console.warn`。
- **frontmatter**（存在则解析，宽容策略）：
  - `description`：命令描述，缺省回退文件名
  - `argument-hint`：可选，映射为 `input.hint`（UI 输入占位提示）
  - 其余字段忽略；无 frontmatter 或 `---` 未闭合的文件合法（视为纯正文）
  - 不存在"解析失败跳过文件"的场景；仅文件名非法或文件不可读才跳过
- **正文**：frontmatter 之后的全部内容，trim。
- 启动时一次性同步加载，不做热重载（YAGNI）。

## 5. 触发行为（commands.ts，opencode 语义）

```
用户输入 /opsx-explore 某个想法
  → renderPrompt(body, rawInput)：
      body 含 $ARGUMENTS 占位符 → 全部原位替换为 trim(rawInput)
      否则 rawInput 非空       → body + "\n\n" + trim(rawInput)
  → agent.steer({ content: [{ type: 'text', text }], source: { kind: 'user' } })
  → return { kind: 'success', text: `已提交 /<name> 给 AI` }   // 仅 UI 显示
```

现有 6 个 opsx md 均无 `$ARGUMENTS`，走末尾拼接路径。

## 6. 错误处理

| 场景 | 行为 |
|------|------|
| 命令目录不存在 | 正常空状态，插件加载成功，注册 0 个命令 |
| 文件名不合法 / 文件不可读 | 跳过该文件 + `console.warn`，不阻塞其他命令 |
| 同名冲突（跨目录） | `.dsh/commands/` 覆盖 `.agents/commands/`（避免 registry 重复名失败） |
| handler 内异常 | try/catch → `{ kind: 'error', text }` 友好提示 |
| openspec CLI 缺失 | 非插件职责：md 正文指示模型自行调用 `openspec`，失败由模型呈现 |

## 7. 仓库清理（干净重开，实现阶段第一步，一次性提交）

1. 清除暂存区与工作区的旧记忆插件遗留：`src/dsh/`、旧 `cordis.yml`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`.trae/documents/`、`.DS_Store`（并加入 .gitignore）等。
2. 清除 `openspec/changes/` 下 3 个旧 change 与 `archive/`（旧项目产物，git 历史可追溯）；保留 `openspec/config.yaml`。
3. README 重写为本插件文档，沿用上个实验沉淀的 DSH 坑点：cordis.yml 需产物绝对路径、终端沙箱 EPERM 问题、Node ≥22.19。
4. `package.json`：更名 `dsh-plugin-commands`（通用定位；可再改），删除 zod 依赖，`build` = `bun build src/index.ts --outdir dist --target node --external @deepseek-ai/cordis`；devDependencies 仅 `@deepseek-ai/cordis`、`@types/node`、`typescript`。

## 8. 测试与验证

- **单元测试**（bun:test，`src/*.test.ts`）：frontmatter 解析、`$ARGUMENTS` 替换与末尾拼接、命名校验、跨目录同名去重、项目根推断。
- **集成验证**（手动）：`pnpm build && dsh web --patch ./cordis.yml` → `/` 菜单见 6 个 opsx 命令 → `/opsx-explore <想法>` → AI 收到完整正文进入 explore 模式。
- `pnpm typecheck`（tsc --noEmit）通过。

## 9. 范围外（Out of Scope）

- 命令文件热重载 / 文件监听
- 用户级（`~/.agents/commands/`）全局命令
- npm 发布（仅本地 `--patch` 加载）
- 多行 YAML frontmatter、`$1` 位置参数等 opencode 高级模板语法
- 子代理 / 模型选择等 frontmatter 字段（`agent`、`model`）
