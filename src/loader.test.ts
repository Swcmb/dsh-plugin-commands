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

  test("首字符非小写字母（数字/下划线/连字符）返回 null", () => {
    expect(parseCommandFile("1st", "x")).toBeNull();
    expect(parseCommandFile("_draft", "x")).toBeNull();
    expect(parseCommandFile("-x", "x")).toBeNull();
  });

  test("CRLF + BOM 文件：剥 BOM、CRLF 归一为 LF 后正常解析 frontmatter", () => {
    const spec = parseCommandFile(
      "crlf-cmd",
      "\uFEFF---\r\ndescription: CRLF 描述\r\n---\r\n\r\nCRLF 正文",
    );
    expect(spec).not.toBeNull();
    expect(spec!.description).toBe("CRLF 描述");
    expect(spec!.body).toBe("CRLF 正文");
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
