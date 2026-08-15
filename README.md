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

## 安装

本插件通过 npm 发布，可安装到任意 DSH 项目中。推荐用 DSH 自带的插件命令安装。

> Node ≥22.19（DSH developer preview 要求）。

### 方式一：DSH 插件命令（推荐）

`dsh plugin` 会把参数转发给指定 profile 目录下的 pnpm，把包装进该 profile：

```bash
# 安装到 web profile
dsh plugin --profile web add dsh-plugin-commands@latest
```

装完后还需在 profile 的加载配置里**注册**插件——编辑
`~/.dsh/profiles/web/cordis.yml`，加上：

```yaml
- insert:
    - id: dsh-plugin-commands
      name: '/Users/<你的用户名>/.dsh/profiles/web/node_modules/dsh-plugin-commands/dist/index.js'
```

然后启动：

```bash
dsh web     # 等价于 dsh --profile web
```

启动后，在 Web UI 对话框输入 `/` 即可看到插件从命令目录加载出的全部斜杠命令。

> **坑点**：`dsh plugin add` 需写 `~/.dsh`（凭证目录）。在终端沙箱（TRAE/EDR 等）里会报 `EPERM ... pnpm-lock.yaml`。请在**普通 Terminal** 运行；或临时 `HOME=$PWD/.fake-home dsh plugin --profile web add ...`（假宿主目录，需重新登录 DSH）。

### 方式二：npm 手动安装

```bash
# npm / pnpm / bun 均可
npm install dsh-plugin-commands
# 或
pnpm add dsh-plugin-commands
# 或
bun add dsh-plugin-commands
```

然后在**项目根**的 `cordis.yml` 中注册，`name` 指向**安装后的构建产物**：

```yaml
- insert:
    - id: dsh-plugin-commands
      name: '<你的项目根>/node_modules/dsh-plugin-commands/dist/index.js'
```

启动：

```bash
dsh web --patch ./cordis.yml
```

### 放置命令文件

插件扫描项目根（最近含 `.git` 的祖先目录）下的两个目录：

| 优先级 | 目录 |
|---|---|
| 高 | `<项目根>/.dsh/commands/*.md` |
| 低 | `<项目根>/.agents/commands/*.md` |

每个 Markdown 文件就是一条命令，例如新建 `.dsh/commands/hello.md`：

```markdown
---
description: 打个招呼
argument-hint: "[名字]"
---

向用户打个友好的招呼。如果提供了名字，用 $ARGUMENTS 里的名字称呼对方。
```

重启 DSH 后即可用 `/hello` 触发。

## 本地开发加载（源码方式）

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
