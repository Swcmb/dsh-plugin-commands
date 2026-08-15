/**
 * 命令发现：扫描项目命令目录、解析 frontmatter、同名去重。
 *
 * 规则（与设计文档 §4 一致）：
 * - 项目根 = 最近含 .git 的祖先目录，无则用起始目录
 * - 目录优先级：.dsh/commands > .agents/commands（同名高优先覆盖）
 * - 文件名去 .md 即命令名，必须匹配 ^[a-z][a-z0-9_-]*$（首字符须小写字母，DSH 不支持冒号）
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

/** DSH 命令名硬约束：首字符必须小写字母，其余为小写字母/数字/下划线/连字符，无冒号 */
const COMMAND_NAME_RE = /^[a-z][a-z0-9_-]*$/;

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
  // 剥 BOM、CRLF 归一为 LF，避免 frontmatter 分隔符匹配失效
  content = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
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
