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
