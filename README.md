# DSH Commands Plugin（通用斜杠命令加载器）

> 让 DeepSeek Harness (DSH) 拥有 opencode 风格的自定义斜杠命令。
> 项目 `.agents/commands/*.md`（或 `.dsh/commands/*.md`）中的每个 Markdown 文件
> 都会注册为一条 `/` 斜杠命令：命令正文作为用户消息提交给 AI。

## 工作方式

输入 `/opsx-explore 我的想法` 时：

1. 插件读取 `.agents/commands/opsx-explore.md` 的正文
2. 正文含 `$ARGUMENTS` → 原位替换为参数；否则参数以空行拼接到正文末尾
3. 用官方工厂 `createUserMessage()`（`@deepseek-ai/dsh-llm`）构造消息并
   `agent.steer()` 提交给当前会话的 AI（与 DSH 内置 `/plan` 同机制）
4. 命令行与执行结果不进入模型历史

## 命令目录与优先级

| 优先级 | 目录 |
|---|---|
| 高 | `<项目根>/.dsh/commands/*.md` |
| 低 | `<项目根>/.agents/commands/*.md` |

- 项目根 = 最近含 `.git` 的祖先目录（无则用 cwd）
- 同名命令：高优先级目录覆盖低优先级
- 文件名（去 `.md`）即命令名，必须匹配 `^[a-z][a-z0-9_-]*$`（首字符必须小写字母，
  DSH 不支持冒号，opencode 的 `/opsx:explore` 对应 `/opsx-explore`）
- 非法文件名或不可读文件跳过并 warn，不影响其他命令

## frontmatter（可选）

```markdown
---
description: 命令描述（缺省用文件名）
argument-hint: "[想法]"      # 可选，UI 输入框占位提示
---

命令正文……$ARGUMENTS……
```

只解析单行 `key: value`；其余字段忽略；无 frontmatter 或未闭合均合法（视为纯正文）。

## 本地加载（DSH developer preview，Node ≥22.19）

```bash
bun install
bun run build                    # 产出 dist/index.js
dsh web --patch ./cordis.yml     # 在普通终端运行，见下方坑点
```

- `cordis.yml` 的 `name` 必须指向**构建产物** `dist/index.js` 的**绝对路径**；
  换机器/目录需同步修改。不能直接指向 TS 源码（Node ESM 不支持源码中
  无扩展名的相对导入；bundle 已打平）
- 若启动报 `EPERM ... ~/.dsh/profiles/web/cordis.yml`：是终端沙箱
  （如 TRAE/EDR）拦截 node 子进程写 `~/.dsh`。在普通 Terminal 启动即可；
  或临时 `HOME=$PWD/.fake-home dsh web --patch ./cordis.yml`

## 开发

```bash
bun run test        # bun:test 单元测试
bun run typecheck   # tsc --noEmit
bun run build       # bun build → dist/
```

依赖：运行时仅 `@deepseek-ai/dsh-llm` 的 `createUserMessage`（构建
`--external`，由项目 node_modules 解析）；`cordis` / `dsh-commands` 仅类型。

## 已知限制

- 命令启动时一次性加载，无热重载（改 md 后需重启 DSH）
- 不支持用户级 `~/.agents/commands/` 全局命令
- 不支持 opencode 的高级模板（`$1` 位置参数、agent/model frontmatter 字段）

## License

MIT
