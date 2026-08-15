import { describe, test, expect } from "bun:test";
import type { Context } from "@deepseek-ai/cordis";
import { renderPrompt, buildUserMessage, registerCommands } from "./commands";
import type { CommandSpec } from "./loader";

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

describe("registerCommands", () => {
  test("单条注册失败不影响其余命令（坏命令告警跳过，好命令照常注册）", () => {
    const registered: Array<{ name: string }> = [];
    const ctx = {
      commands: {
        register(def: { name: string }) {
          if (def.name === "bad") throw new TypeError("boom");
          registered.push(def);
        },
      },
    } as unknown as Context;
    const specs: CommandSpec[] = [
      { name: "bad", description: "坏命令", body: "x" },
      { name: "good", description: "好命令", body: "y" },
    ];
    registerCommands(ctx, specs);
    expect(registered).toHaveLength(1);
    expect(registered[0].name).toBe("good");
  });

  test("始终提供 input：无 argumentHint 用默认占位，有则用自定义 hint", () => {
    const registered: Array<{ name: string; input?: { hint: string } }> = [];
    const ctx = {
      commands: {
        register(def: { name: string; input?: { hint: string } }) {
          registered.push(def);
        },
      },
    } as unknown as Context;
    const specs: CommandSpec[] = [
      { name: "plain", description: "无 hint", body: "x" },
      { name: "custom", description: "有 hint", argumentHint: "[名字]", body: "y" },
    ];
    registerCommands(ctx, specs);
    expect(registered).toHaveLength(2);
    expect(registered[0].input).toEqual({ hint: "[参数]" });
    expect(registered[1].input).toEqual({ hint: "[名字]" });
  });
});
