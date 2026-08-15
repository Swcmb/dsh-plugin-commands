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
    try {
      ctx.commands.register({
        name: spec.name,
        description: spec.description,
        // 始终提供 input：DSH 只有命令带 input 字段时，输入 `/name` 后按空格
        // 才会进入 leadingInput（保留命令名待补参数）。无自定义 hint 时用默认占位，
        // 让任意命令都能以「/命令名 <参数>」的方式补充文字。
        input: { hint: spec.argumentHint ?? "[参数]" },
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
    } catch (err) {
      // 单条注册失败（如与内置/其他插件命令同名）不应拖垮整个插件
      console.warn(
        `[dsh-commands] 注册命令 ${spec.name} 失败，已跳过: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      continue;
    }
  }
}
