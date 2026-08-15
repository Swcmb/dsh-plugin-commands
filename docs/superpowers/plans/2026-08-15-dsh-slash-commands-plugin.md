# DSH 通用斜杠命令插件 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把本仓库改造为 DSH 插件——扫描 `.agents/commands/*.md` / `.dsh/commands/*.md`，把每个 md 注册为 DSH 斜杠命令，命令正文经 `agent.steer()` 作为用户消息提交给 AI（opencode 语义）。

**Architecture:** 标准 Cordis 插件（`src/index.ts` 入口 + `loader.ts` 命令发现 + `commands.ts` 注册/消息构造），`bun build` 产出 `dist/index.js`，经 `dsh web --patch ./cordis.yml` 本地加载。设计文档：`docs/superpowers/specs/2026-08-15-dsh-slash-commands-plugin-design.md`。

**Tech Stack:** TypeScript（strict）+ Bun（构建/测试 bun:test）+ `@deepseek-ai/cordis` 类型 + `@deepseek-ai/dsh-llm` 的 `createUserMessage`（运行时唯一外部依赖）。

## Global Constraints

- DSH 0.1.0-rc.6（本机已核实 API）；命令名必须匹配 `^[a-z0-9_-]+$`（无冒号）
- Node ≥22.19 运行 DSH；构建只用 `bun build`，`tsc` 仅 `--noEmit` 类型检查
- 运行时依赖仅 `@deepseek-ai/dsh-llm`（构建 `--external`，由项目 node_modules 解析）；`@deepseek-ai/cordis`、`@deepseek-ai/dsh-commands` 仅为类型的 devDependencies
- 代码注释一律中文
- 保留 `.npmrc`（`@deepseek-ai` 系列走官方 registry）、`openspec/config.yaml`、`.agents/skills/`、`.agents/commands/`、`docs/`
- 每个 Task 结束提交一次；`dist/` 不入库（gitignored）
- 仓库绝对路径：`/Users/yuqiang/Documents/study/dsh-plugin-openspec`（cordis.yml 中使用）

---

### Task 1: 干净基线（清理旧实验 + 重写工程文件）

**Files:**
- Delete: 暂存区遗留的全部旧记忆插件文件（`src/`、旧 `cordis.yml`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`.trae/`、`AGENTS.md`、`CHANGELOG.md`、`scripts/`、`.opencode/`、`.kilo/`、`bun.lock`、`.DS_Store` 等——`git add -A` 一次性收敛）
- Delete: `openspec/changes/`（3 个旧 change + `archive/`）
- Overwrite: `.gitignore`、`package.json`、`README.md`
- Keep: `tsconfig.json`（现有内容已适用，不改）、`.npmrc`、`openspec/config.yaml`、`.agents/`、`docs/`

**Interfaces:**
- Consumes: 无
- Produces: 可安装、可构建的空壳工程（`bun install` 可跑通；src/ 由后续任务创建）

- [ ] **Step 1: 收敛 git 状态（暂存遗留 + 工作区删除 → 净删除）**

```bash
git add -A
git rm -r openspec/changes
```

说明：当前暂存区有旧实验的新增文件、工作区又有大量删除，`git add -A` 后以工作区为准（旧文件全部消失）。`openspec/changes/` 是旧项目产物，连同 `archive/` 一起删（git 历史可追溯）。

- [ ] **Step 2: 重写 `.gitignore`**

```
dist/
node_modules/
.DS_Store
.fake-home/
.ref/
```

- [ ] **Step 3: 重写 `package.json`**

```json
{
  "name": "dsh-plugin-commands",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "bun build src/index.ts --outdir dist --target node --external @deepseek-ai/cordis --external @deepseek-ai/dsh-llm --external @deepseek-ai/dsh-commands",
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "devDependencies": {
    "@deepseek-ai/cordis": "4.0.1",
    "@deepseek-ai/dsh-commands": "0.0.1-rc.1",
    "@deepseek-ai/dsh-llm": "0.0.1-rc.1",
    "@types/bun": "latest",
    "@types/node": "latest",
    "typescript": "5.8.2"
  },
  "license": "MIT"
}
```

版本依据：`@deepseek-ai/cordis@4.0.1` 与上个实验一致；`@deepseek-ai/dsh-commands@0.0.1-rc.1`、`@deepseek-ai/dsh-llm@0.0.1-rc.1` 为 npm 实测存在的独立发布版。

- [ ] **Step 4: 安装依赖**

```bash
bun install
```

Expected: 成功生成 `bun.lock` 与 `node_modules/`（走 `.npmrc` 的官方 registry 拉 @deepseek-ai 系列）。

- [ ] **Step 5: 重写 `README.md`**

````markdown
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
- 文件名（去 `.md`）即命令名，必须匹配 `^[a-z0-9_-]+$`（DSH 不支持冒号，
  opencode 的 `/opsx:explore` 对应 `/opsx-explore`）
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
````

- [ ] **Step 6: 验证基线**

```bash
git status
```

Expected: 工作区干净后仅剩本次改写文件待提交；`ls` 应看到 `.agents/ docs/ openspec/ node_modules/ .gitignore .npmrc README.md package.json tsconfig.json bun.lock`，无 `src/`、无 `openspec/changes/`。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: 清空旧记忆插件，建立 DSH 通用斜杠命令插件基线"
```

---

### Task 2: loader.ts — 命令发现与 frontmatter 解析（TDD）

**Files:**
- Create: `src/loader.ts`
- Test: `src/loader.test.ts`

**Interfaces:**
- Consumes: 无（仅 `node:fs` / `node:path`）
- Produces（后续任务依赖的精确签名）:
  - `interface CommandSpec { readonly name: string; readonly description: string; readonly argumentHint?: string; readonly body: string }`
  - `findProjectRoot(startDir: string): string`
  - `parseCommandFile(filename: string, content: string): CommandSpec | null`
  - `loadCommands(root: string): CommandSpec[]`

- [ ] **Step 1: 写失败测试 `src/loader.test.ts`**

```typescript
import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findProjectRoot, parseCommandFile, loadCommands } from "./loader";

/** 建临时目录的辅助函数（用例结束负责清理） */
function mkTmp(): string {
  return mkdtempSync(join(tmpdir(), "dsh-cmd-"));
}

describe("findProjectRoot", () => {
  test("向上找到含 .git 的祖先目录", () => {
    const base = mkTmp();
    mkdirSync(join(base, ".git"), { recursive: true });
    mkdirSync(join(base, "a", "b"), { recursive: true });
    expect(findProjectRoot(join(base, "a", "b"))).toBe(base);
    rmSync(base, { recursive: true, force: true });
  });

  test("无 .git 祖先时回退到起始目录", () => {
    const base = mkTmp();
    expect(findProjectRoot(base)).toBe(base);
    rmSync(base, { recursive: true, force: true });
  });
});

describe("parseCommandFile", () => {
  test("合法名 + frontmatter：提取 description / argument-hint，其余字段忽略", () => {
    const spec = parseCommandFile(
      "opsx-explore",
      "---\ndescription: 探索模式\nargument-hint: [想法]\nother: 忽略\n---\n\n正文内容",
    );
    expect(spec).not.toBeNull();
    expect(spec!.name).toBe("opsx-explore");
    expect(spec!.description).toBe("探索模式");
    expect(spec!.argumentHint).toBe("[想法]");
    expect(spec!.body).toBe("正文内容");
  });

  test("无 frontmatter：description 回退文件名，正文原样", () => {
    const spec = parseCommandFile("my-cmd", "只是正文");
    expect(spec!.description).toBe("my-cmd");
    expect(spec!.body).toBe("只是正文");
    expect(spec!.argumentHint).toBeUndefined();
  });

  test("frontmatter 未闭合：整文件视为正文", () => {
    const spec = parseCommandFile("my-cmd", "---\ndescription: 不算数\n正文在这里");
    expect(spec!.description).toBe("my-cmd");
    expect(spec!.body).toContain("正文在这里");
  });

  test("非法文件名返回 null（大写/冒号/中文/空格）", () => {
    expect(parseCommandFile("Ops:Bad", "x")).toBeNull();
    expect(parseCommandFile("中文命令", "x")).toBeNull();
    expect(parseCommandFile("has space", "x")).toBeNull();
  });
});

describe("loadCommands", () => {
  test("目录不存在 → 空数组", () => {
    const root = mkTmp();
    expect(loadCommands(root)).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });

  test("加载 .agents/commands 下的 md；跳过非法名与非 md", () => {
    const root = mkTmp();
    mkdirSync(join(root, ".agents", "commands"), { recursive: true });
    writeFileSync(join(root, ".agents", "commands", "opsx-explore.md"), "---\ndescription: d\n---\nbody");
    writeFileSync(join(root, ".agents", "commands", "Bad:Name.md"), "x");
    writeFileSync(join(root, ".agents", "commands", "notes.txt"), "x");
    const specs = loadCommands(root);
    expect(specs.map((s) => s.name)).toEqual(["opsx-explore"]);
    rmSync(root, { recursive: true, force: true });
  });

  test("同名时 .dsh/commands 覆盖 .agents/commands", () => {
    const root = mkTmp();
    mkdirSync(join(root, ".agents", "commands"), { recursive: true });
    mkdirSync(join(root, ".dsh", "commands"), { recursive: true });
    writeFileSync(join(root, ".agents", "commands", "dup.md"), "agents 版");
    writeFileSync(join(root, ".dsh", "commands", "dup.md"), "dsh 版");
    const specs = loadCommands(root);
    expect(specs).toHaveLength(1);
    expect(specs[0].body).toBe("dsh 版");
    rmSync(root, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/loader.test.ts`
Expected: FAIL —— `Cannot find module './loader'`

- [ ] **Step 3: 写实现 `src/loader.ts`**

```typescript
/**
 * 命令发现：扫描项目命令目录、解析 frontmatter、同名去重。
 *
 * 规则（与设计文档 §4 一致）：
 * - 项目根 = 最近含 .git 的祖先目录，无则用起始目录
 * - 目录优先级：.dsh/commands > .agents/commands（同名高优先覆盖）
 * - 文件名去 .md 即命令名，必须匹配 ^[a-z0-9_-]+$（DSH 不支持冒号）
 * - frontmatter 只解析单行 key: value，取 description / argument-hint
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** 一个命令文件解析后的全部信息 */
export interface CommandSpec {
  readonly name: string;
  readonly description: string;
  readonly argumentHint?: string;
  readonly body: string;
}

/** DSH 命令名硬约束：小写字母/数字/下划线/连字符，无冒号 */
const COMMAND_NAME_RE = /^[a-z0-9_-]+$/;

/** 命令目录，数组顺序即优先级（前面的覆盖后面的） */
const COMMAND_DIRS = [".dsh/commands", ".agents/commands"];

/** 向上查找最近含 .git 的祖先目录；找不到则回退 startDir */
export function findProjectRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return startDir;
    dir = parent;
  }
}

/**
 * 解析单个命令文件内容。
 * @param filename 文件名（可带可不带 .md 后缀）
 * @param content 文件全文
 * @returns 非法命令名返回 null；frontmatter 缺失或未闭合均视为纯正文
 */
export function parseCommandFile(filename: string, content: string): CommandSpec | null {
  const name = filename.replace(/\.md$/i, "");
  if (!COMMAND_NAME_RE.test(name)) return null;

  let description = name;
  let argumentHint: string | undefined;
  let body = content;

  if (content.startsWith("---\n")) {
    const end = content.indexOf("\n---", 4);
    if (end !== -1) {
      // frontmatter 闭合：解析键值，正文取闭合 --- 之后的部分
      const frontmatter = content.slice(4, end);
      const bodyStart = content.indexOf("\n", end + 1);
      body = bodyStart === -1 ? "" : content.slice(bodyStart + 1);
      for (const line of frontmatter.split("\n")) {
        const m = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
        if (!m) continue;
        const value = m[2].trim().replace(/^["']|["']$/g, "");
        if (m[1] === "description" && value) description = value;
        else if (m[1] === "argument-hint" && value) argumentHint = value;
      }
    }
    // end === -1：frontmatter 未闭合，整文件按正文处理
  }

  return { name, description, argumentHint, body: body.trim() };
}

/** 扫描项目根下的命令目录，返回去重后的命令清单（高优先级目录优先） */
export function loadCommands(root: string): CommandSpec[] {
  const byName = new Map<string, CommandSpec>();
  for (const rel of COMMAND_DIRS) {
    const dir = join(root, rel);
    if (!existsSync(dir)) continue;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch (err) {
      console.warn(`[dsh-commands] 无法读取目录: ${dir}`, err);
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      let content: string;
      try {
        content = readFileSync(join(dir, entry), "utf-8");
      } catch (err) {
        console.warn(`[dsh-commands] 跳过不可读文件: ${join(dir, entry)}`, err);
        continue;
      }
      const spec = parseCommandFile(entry.slice(0, -3), content);
      if (!spec) {
        console.warn(`[dsh-commands] 跳过非法命令名: ${join(dir, entry)}`);
        continue;
      }
      if (!byName.has(spec.name)) byName.set(spec.name, spec);
    }
  }
  return [...byName.values()];
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test src/loader.test.ts`
Expected: 全部 PASS（9 个用例）

- [ ] **Step 5: Commit**

```bash
git add src/loader.ts src/loader.test.ts
git commit -m "feat(loader): 命令目录扫描与 frontmatter 解析"
```

---

### Task 3: commands.ts — prompt 渲染、消息构造与命令注册（TDD）

**Files:**
- Create: `src/commands.ts`
- Test: `src/commands.test.ts`

**Interfaces:**
- Consumes: `CommandSpec`（Task 2）；`createUserMessage`（`@deepseek-ai/dsh-llm`）；`ctx.commands.register`（`@deepseek-ai/dsh-commands` 类型增强）
- Produces:
  - `renderPrompt(body: string, rawInput: string): string`
  - `buildUserMessage(text: string): ReturnType<typeof createUserMessage>`
  - `registerCommands(ctx: Context, specs: readonly CommandSpec[]): void`

- [ ] **Step 1: 写失败测试 `src/commands.test.ts`**

```typescript
import { describe, test, expect } from "bun:test";
import { renderPrompt, buildUserMessage } from "./commands";

describe("renderPrompt", () => {
  test("含 $ARGUMENTS：原位替换（含多处），参数两端空白被 trim", () => {
    expect(renderPrompt("对 $ARGUMENTS 做探索，围绕 $ARGUMENTS", "  某想法  ")).toBe(
      "对 某想法 做探索，围绕 某想法",
    );
  });

  test("$ARGUMENTS + 空参数：占位符替换为空串", () => {
    expect(renderPrompt("对 $ARGUMENTS 探索", "   ")).toBe("对  探索");
  });

  test("无占位符 + 有参数：正文后空行拼接", () => {
    expect(renderPrompt("body", "想法X")).toBe("body\n\n想法X");
  });

  test("无占位符 + 空参数：正文原样", () => {
    expect(renderPrompt("body", "")).toBe("body");
  });
});

describe("buildUserMessage", () => {
  test("构造 UserMessage（工厂补齐 id/role，source 为 user）", () => {
    const msg = buildUserMessage("hi");
    expect(msg.role).toBe("user");
    expect(msg.source).toEqual({ kind: "user" });
    expect(msg.content).toEqual([{ type: "text", text: "hi" }]);
    expect(typeof msg.id).toBe("string");
    expect(msg.id.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/commands.test.ts`
Expected: FAIL —— `Cannot find module './commands'`

- [ ] **Step 3: 写实现 `src/commands.ts`**

```typescript
/**
 * 命令注册与消息构造（opencode 语义）。
 *
 * - renderPrompt：$ARGUMENTS 原位替换；无占位符时参数以空行拼接正文末尾
 * - buildUserMessage：用官方工厂 createUserMessage 构造（UserMessage 必须带
 *   branded id/role，不能内联字面量——见设计文档 §2）
 * - registerCommands：逐个注册到 DSH 命令面板，handler 内 steer 给当前 agent
 */

import type { Context } from "@deepseek-ai/cordis";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
// 仅为引入 commands 服务的模块类型增强（ augmentation），无运行时效果
import type {} from "@deepseek-ai/dsh-commands";
import type { CommandSpec } from "./loader";

/** 渲染最终提交给模型的文本 */
export function renderPrompt(body: string, rawInput: string): string {
  const args = rawInput.trim();
  if (body.includes("$ARGUMENTS")) return body.split("$ARGUMENTS").join(args);
  return args ? `${body}\n\n${args}` : body;
}

/** 构造一条用户消息（工厂负责补齐 id/role 并冻结对象） */
export function buildUserMessage(text: string) {
  return createUserMessage({
    content: [{ type: "text", text }],
    source: { kind: "user" },
  });
}

/** 把加载到的命令逐个注册到 DSH 命令面板 */
export function registerCommands(ctx: Context, specs: readonly CommandSpec[]): void {
  for (const spec of specs) {
    ctx.commands.register({
      name: spec.name,
      description: spec.description,
      ...(spec.argumentHint ? { input: { hint: spec.argumentHint } } : {}),
      async handler({ agent, rawInput }) {
        try {
          agent.steer(buildUserMessage(renderPrompt(spec.body, rawInput)));
          return { kind: "success", text: `已提交 /${spec.name} 给 AI` };
        } catch (err) {
          return {
            kind: "error",
            text: `/${spec.name} 执行失败: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    });
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test src/commands.test.ts`
Expected: 全部 PASS（5 个用例）

- [ ] **Step 5: 类型检查（验证 dsh-commands 类型增强生效）**

Run: `bun run typecheck`
Expected: PASS。若 `ctx.commands` 或 `input` 字段报类型错误（published `0.0.1-rc.1` 与内部 `0.1.0-rc.6` 类型有出入），创建 `src/types/dsh-commands.d.ts` 本地最小声明替代该 import：

```typescript
// 本地最小类型增强（仅当 published @deepseek-ai/dsh-commands 类型不兼容时使用）
// 使用时删除 commands.ts 中的 `import type {} from "@deepseek-ai/dsh-commands";`
export interface CommandInvocationLike {
  commandId: string;
  agent: { steer(message: unknown): void };
  rawInput: string;
  signal: AbortSignal;
}
export interface CommandDefinitionLike {
  name: string;
  description: string;
  input?: { hint: string };
  handler: (
    inv: CommandInvocationLike,
  ) =>
    | { kind: "success"; text?: string }
    | { kind: "error"; text: string }
    | Promise<{ kind: "success"; text?: string } | { kind: "error"; text: string }>;
}
declare module "@deepseek-ai/cordis" {
  interface Context {
    commands: { register(def: CommandDefinitionLike): unknown };
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/commands.ts src/commands.test.ts src/types/ 2>/dev/null || git add src/commands.ts src/commands.test.ts
git commit -m "feat(commands): prompt 渲染、UserMessage 构造与命令注册"
```

---

### Task 4: index.ts — 插件入口 + 全量验证 + 构建

**Files:**
- Create: `src/index.ts`

**Interfaces:**
- Consumes: `findProjectRoot` / `loadCommands`（Task 2）、`registerCommands`（Task 3）
- Produces: Cordis 插件入口 `export const name = "commands-loader"` + `export function apply(ctx: Context): void`（cordis.yml 加载的入口；dist/index.js）

- [ ] **Step 1: 写 `src/index.ts`**

```typescript
/**
 * DSH 通用斜杠命令插件入口。
 *
 * 加载方式：dsh web --patch ./cordis.yml（指向构建产物 dist/index.js）
 * 行为：启动时扫描项目命令目录（.dsh/commands 与 .agents/commands），
 * 把每个 md 文件注册为一条斜杠命令；命令触发时正文经 agent.steer()
 * 作为用户消息提交给 AI（opencode 自定义命令语义）。
 */

import type { Context } from "@deepseek-ai/cordis";
import { findProjectRoot, loadCommands } from "./loader";
import { registerCommands } from "./commands";

export const name = "commands-loader";

export function apply(ctx: Context): void {
  const root = findProjectRoot(process.cwd());
  const specs = loadCommands(root);
  if (specs.length === 0) return;

  // commands 服务由交互式 UI 组合提供；无命令面板的环境（headless/ACP）静默跳过
  ctx.inject(["commands"], (commandCtx: Context) => {
    registerCommands(commandCtx, specs);
  });
}
```

- [ ] **Step 2: 全量测试 + 类型检查**

Run: `bun test && bun run typecheck`
Expected: 14 个用例全部 PASS；typecheck 无错误

- [ ] **Step 3: 构建并验证产物**

Run: `bun run build && ls -la dist/`
Expected: 生成 `dist/index.js`；确认其中**没有**打包进 `@deepseek-ai/*` 源码（external 生效，只应有裸 import 声明）。可用 `grep -c "createUserMessage" dist/index.js` 确认引用存在，`head -5 dist/index.js` 看外部 import。

- [ ] **Step 4: 对本仓库做真实冒烟（不启动 DSH 也可验证 loader 路径）**

Run: `bun -e 'import {findProjectRoot, loadCommands} from "./src/loader"; const root = findProjectRoot(process.cwd()); console.log(root, loadCommands(root).map(s => s.name))'`
Expected: 输出本仓库根路径 + `["opsx-apply","opsx-archive","opsx-bulk-archive","opsx-explore","opsx-propose","opsx-verify"]`（按 Map 插入序，即 .agents/commands 的 readdir 序）

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat(index): Cordis 插件入口（命令面板注册装配）"
```

---

### Task 5: cordis.yml + 集成验证（手动）+ 收尾

**Files:**
- Create: `cordis.yml`
- Modify（仅当实测与文档有出入时）: `README.md`

**Interfaces:**
- Consumes: `dist/index.js`（Task 4 构建产物）
- Produces: 可交付的本地加载配置 + 端到端验证结论

- [ ] **Step 1: 写 `cordis.yml`**

```yaml
# Cordis 加载配置（本地开发）
# 启动：dsh web --patch ./cordis.yml
# 注意：name 必须是构建产物 dist/index.js 的绝对路径（Node ESM 不支持 TS 源码的
# 无扩展名相对导入，bundle 已打平）；换机器/目录需同步修改
- insert:
    - id: dsh-plugin-commands
      name: '/Users/yuqiang/Documents/study/dsh-plugin-openspec/dist/index.js'
```

- [ ] **Step 2: 重新构建**

Run: `bun run build`
Expected: `dist/index.js` 为最新

- [ ] **Step 3: 启动 DSH Web（在普通 Terminal，非沙箱终端）**

```bash
dsh web --patch ./cordis.yml
```

Expected: 正常启动（若报 `EPERM ~/.dsh/...`，见 README 坑点——换普通 Terminal 或 `HOME=$PWD/.fake-home` 重定向）。

- [ ] **Step 4: 验证命令面板**

在 DSH Web UI 对话输入框输入 `/`：
Expected: 菜单出现 6 条命令（opsx-apply / opsx-archive / opsx-bulk-archive / opsx-explore / opsx-propose / opsx-verify），描述来自各自 md 的 frontmatter `description`。

- [ ] **Step 5: 验证 opencode 语义（核心验收）**

1. 输入 `/opsx-explore 想测试斜杠命令` → UI 显示「已提交 /opsx-explore 给 AI」，AI 回复应体现它收到了 opsx-explore.md 的**完整正文**且末尾带「想测试斜杠命令」，进入 explore 思考模式（提问而非写码）
2. 输入 `/opsx-explore`（无参数）→ AI 收到纯正文
3. （可选）`/opsx-propose 添加深色模式` → AI 走 propose 流程

Expected: 全部符合。若任何一步失败，回到对应 Task 修复后重跑本步。

- [ ] **Step 6: 修正 README（如有出入）+ 提交**

```bash
git add cordis.yml README.md
git commit -m "build: cordis.yml 本地加载配置与集成验证"
```

---

## Self-Review 记录

- **Spec coverage**：设计 §3 架构→Task 1/4；§4 加载规则→Task 2；§5 触发行为→Task 3/5；§6 错误处理→Task 2（warn/跳过/去重）+ Task 3（try/catch）；§7 仓库清理→Task 1；§8 测试→Task 2/3/4/5。无遗漏。
- **Placeholder scan**：无 TBD/TODO/「适当处理」类占位；所有代码步骤含完整代码。
- **Type consistency**：`CommandSpec` 四字段（name/description/argumentHint/body）在 Task 2 定义、Task 3/4 消费一致；`renderPrompt`/`buildUserMessage`/`registerCommands` 签名前后一致。
