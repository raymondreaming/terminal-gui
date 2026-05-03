import { mkdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
	createCodexEnv,
	resolveCodexBinary,
} from "../../../features/terminal/terminal-command.ts";
import { summarizeToolInput } from "../events.ts";
import {
	drainStreamToString,
	flushNdjsonLeftover,
	parseNdjsonLines,
} from "../stream-utils.ts";
import type { AgentAdapter, AgentHandle, AgentRunContext } from "../types.ts";

interface CodexRunState {
	outputPath: string;
	debugLogPath: string;
	assistantOpen: boolean;
	toolOpen: boolean;
	sawAssistantStream: boolean;
	hasFinalAssistantMessage: boolean;
	lastAssistantMessage: string;
	currentToolId: string | null;
}

function extractText(value: any): string {
	if (!value) return "";
	if (typeof value === "string") return value;
	if (typeof value.text === "string") return value.text;
	if (typeof value.message === "string") return value.message;
	if (typeof value.content === "string") return value.content;
	if (typeof value.delta === "string") return value.delta;
	if (typeof value.last_agent_message === "string")
		return value.last_agent_message;
	if (typeof value.output_text === "string") return value.output_text;
	if (Array.isArray(value.content)) {
		return value.content
			.map((item: any) => extractText(item))
			.filter(Boolean)
			.join("");
	}
	return "";
}

function basename(value: string): string {
	return value.split("/").pop() || value;
}

function trimSummary(value: string, max = 48): string {
	return value.length > max ? `${value.slice(0, max)}...` : value;
}

function summarizeToolEvent(toolName: string, payload: any): string {
	if (!payload) return toolName;
	if (typeof payload.command === "string" && payload.command) {
		return trimSummary(payload.command);
	}
	if (typeof payload.cmd === "string" && payload.cmd) {
		return trimSummary(payload.cmd);
	}
	if (typeof payload.query === "string" && payload.query) {
		return trimSummary(payload.query);
	}
	if (typeof payload.path === "string" && payload.path) {
		return basename(payload.path);
	}
	if (typeof payload.file === "string" && payload.file) {
		return basename(payload.file);
	}
	if (Array.isArray(payload.files) && payload.files.length > 0) {
		const first = String(payload.files[0] ?? "");
		return payload.files.length === 1
			? basename(first)
			: `${basename(first)} +${payload.files.length - 1}`;
	}
	if (Array.isArray(payload.changes) && payload.changes.length > 0) {
		const first = payload.changes[0];
		const firstFile =
			typeof first === "string"
				? first
				: (first?.file_path ?? first?.path ?? first?.file ?? "");
		if (firstFile) {
			return payload.changes.length === 1
				? basename(firstFile)
				: `${basename(firstFile)} +${payload.changes.length - 1}`;
		}
		return `${payload.changes.length} changes`;
	}
	return toolName;
}

function handleCodexEvent(
	event: any,
	ctx: AgentRunContext,
	state: CodexRunState
) {
	const closeTool = () => {
		if (!state.toolOpen) return;
		ctx.emitChatEvent({ type: "content_block_stop" });
		if (state.currentToolId) {
			ctx.emitAgentEvent({
				type: "tool-call-end",
				toolCallId: state.currentToolId,
			});
		}
		state.toolOpen = false;
		state.currentToolId = null;
	};
	const closeAssistant = () => {
		if (!state.assistantOpen) return;
		ctx.emitChatEvent({ type: "content_block_stop" });
		state.assistantOpen = false;
	};
	const startAssistant = () => {
		if (state.assistantOpen) return;
		closeTool();
		ctx.emitChatEvent({
			type: "content_block_start",
			content_block: { type: "text", text: "" },
		});
		state.assistantOpen = true;
		state.sawAssistantStream = true;
	};
	const startTool = (name: string, input: unknown = {}) => {
		closeAssistant();
		closeTool();
		const toolCallId = `${name}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
		ctx.emitChatEvent({
			type: "content_block_start",
			content_block: { type: "tool_use", name, input },
		});
		ctx.emitAgentEvent({
			type: "tool-call-start",
			toolCallId,
			toolName: name,
			input,
			summary: summarizeToolInput(name, input),
		});
		state.toolOpen = true;
		state.currentToolId = toolCallId;
	};
	const toolDelta = (textDelta: string) => {
		if (!state.toolOpen || !textDelta) return;
		ctx.emitChatEvent({
			type: "content_block_delta",
			delta: { type: "input_json_delta", partial_json: textDelta },
		});
		if (state.currentToolId) {
			ctx.emitAgentEvent({
				type: "tool-call-delta",
				toolCallId: state.currentToolId,
				delta: textDelta,
			});
		}
	};
	const assistantDelta = (textDelta: string) => {
		if (!textDelta) return;
		startAssistant();
		ctx.emitChatEvent({
			type: "content_block_delta",
			delta: { type: "text_delta", text: textDelta },
		});
		ctx.emitAgentEvent({ type: "text-delta", text: textDelta });
	};

	const eventType = String(event?.type ?? "");
	const eventText = extractText(event);

	if (event?.type === "thread.started" && event.thread_id) {
		ctx.updateSessionId(event.thread_id);
		ctx.emitAgentEvent({ type: "session", providerSessionId: event.thread_id });
	} else if (event?.type === "turn.started") {
		ctx.emitStatus("thinking", true);
		ctx.emitAgentEvent({ type: "status", status: "thinking" });
	} else if (event?.type === "agent_message_delta") {
		assistantDelta(event.delta ?? event.text ?? event.content ?? "");
		ctx.emitStatus("responding", true);
		ctx.emitAgentEvent({ type: "status", status: "responding" });
	} else if (event?.type === "agent_message") {
		const content = event.message ?? event.content ?? event.text ?? "";
		if (typeof content === "string" && content) {
			assistantDelta(content);
		}
	} else if (event?.type === "exec_command_begin") {
		const payload = {
			command: event.parsed_cmd ?? event.command ?? event.cmd ?? "",
			cwd: event.cwd ?? ctx.cwd,
		};
		ctx.emitStatus("tool:exec", true);
		ctx.emitActivity({
			toolName: "exec",
			summary: summarizeToolEvent("exec", payload),
			isStreaming: true,
		});
		startTool("exec", payload);
	} else if (event?.type === "exec_command_output_delta") {
		const chunk =
			typeof event.chunk === "string"
				? Buffer.from(event.chunk, "base64").toString("utf8")
				: "";
		toolDelta(chunk);
	} else if (event?.type === "exec_command_end") {
		closeTool();
	} else if (event?.type === "patch_apply_begin") {
		const payload = { changes: event.changes ?? event.files ?? [] };
		ctx.emitStatus("tool:patch", true);
		ctx.emitActivity({
			toolName: "patch",
			summary: summarizeToolEvent("patch", payload),
			isStreaming: true,
		});
		startTool("patch", payload);
	} else if (event?.type === "patch_apply_end") {
		closeTool();
	} else if (event?.type === "web_search_begin") {
		const payload = { query: event.query ?? "" };
		ctx.emitStatus("tool:web_search", true);
		ctx.emitActivity({
			toolName: "web_search",
			summary: summarizeToolEvent("web_search", payload),
			isStreaming: true,
		});
		startTool("web_search", payload);
	} else if (event?.type === "web_search_end") {
		if (event.query) toolDelta(event.query);
		closeTool();
	} else if (event?.type === "mcp_tool_call_begin") {
		const toolName = event.invocation?.tool ?? event.tool ?? "mcp_tool";
		const payload = event.invocation?.arguments ?? event.arguments ?? {};
		ctx.emitStatus(`tool:${toolName}`, true);
		ctx.emitActivity({
			toolName,
			summary: summarizeToolEvent(toolName, payload),
			isStreaming: true,
		});
		startTool(toolName, payload);
	} else if (event?.type === "mcp_tool_call_end") {
		closeTool();
	} else if (
		event?.type === "item.completed" &&
		event.item?.type === "error" &&
		event.item.message
	) {
		ctx.emitAgentEvent({ type: "error", message: event.item.message });
		ctx.emitSystemMessage(event.item.message);
	} else if (
		event?.type === "item.completed" &&
		event.item &&
		extractText(event.item)
	) {
		const itemText = extractText(event.item);
		if (!state.sawAssistantStream && itemText) {
			ctx.emitChatEvent({ type: "result", result: itemText });
			ctx.emitAgentEvent({ type: "result", text: itemText });
			state.hasFinalAssistantMessage = true;
		}
	} else if (event?.type === "error" && event.message) {
		ctx.emitAgentEvent({ type: "error", message: event.message });
		ctx.emitSystemMessage(event.message);
	} else if (
		event?.type === "task_complete" &&
		typeof event.last_agent_message === "string" &&
		event.last_agent_message
	) {
		if (!state.sawAssistantStream) {
			ctx.emitChatEvent({
				type: "result",
				result: event.last_agent_message,
			});
			ctx.emitAgentEvent({ type: "result", text: event.last_agent_message });
			state.hasFinalAssistantMessage = true;
		}
	} else if (
		eventText &&
		/message|assistant|output_text|text_delta/i.test(eventType) &&
		!/error|tool|exec_command|patch|web_search|mcp/i.test(eventType)
	) {
		assistantDelta(eventText);
		ctx.emitStatus("responding", true);
		ctx.emitAgentEvent({ type: "status", status: "responding" });
	}
}

export const codexAdapter: AgentAdapter<CodexRunState> = {
	kind: "codex",
	displayName: "Codex",

	createState(ctx) {
		return {
			outputPath: resolve(
				tmpdir(),
				`inferay-codex-${ctx.paneId}-${Date.now()}.txt`
			),
			debugLogPath: resolve(
				process.cwd(),
				"data",
				"codex-debug",
				`codex-events-${ctx.paneId}-${Date.now()}.json`
			),
			assistantOpen: false,
			toolOpen: false,
			sawAssistantStream: false,
			hasFinalAssistantMessage: false,
			lastAssistantMessage: "",
			currentToolId: null,
		};
	},

	createHandle(prompt, ctx, state): AgentHandle {
		let proc: ReturnType<typeof Bun.spawn> | null = null;

		return {
			async run() {
				const codexCmd = resolveCodexBinary();
				const baseArgs = [
					"--json",
					"--skip-git-repo-check",
					"--dangerously-bypass-approvals-and-sandbox",
					"--output-last-message",
					state.outputPath,
				];
				if (ctx.model) {
					baseArgs.push("--model", ctx.model);
				}
				if (ctx.reasoningLevel) {
					const reasoningEffort =
						ctx.reasoningLevel === "extra_high" ? "xhigh" : ctx.reasoningLevel;
					baseArgs.push("-c", `reasoning_effort="${reasoningEffort}"`);
				}
				const sessionId = ctx.getSessionId();
				const args = sessionId
					? [codexCmd, "exec", "resume", ...baseArgs, sessionId, "--", prompt]
					: [codexCmd, "exec", ...baseArgs, "--", prompt];

				proc = Bun.spawn(args, {
					stdout: "pipe",
					stderr: "pipe",
					cwd: ctx.cwd,
					env: createCodexEnv(),
				});

				const stderrPromise = drainStreamToString(
					proc.stderr as ReadableStream<Uint8Array>
				);
				const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
				const decoder = new TextDecoder();
				let leftover = "";
				const rawEvents: any[] = [];

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					leftover += decoder.decode(value, { stream: true });
					leftover = parseNdjsonLines(leftover, (event) => {
						rawEvents.push(event);
						handleCodexEvent(event, ctx, state);
					});
				}
				flushNdjsonLeftover(leftover, (event) => {
					rawEvents.push(event);
					handleCodexEvent(event, ctx, state);
				});

				const exitCode = await proc.exited;
				proc = null;
				const stderrText = (await stderrPromise).trim();

				// Finalize
				if (state.toolOpen || state.assistantOpen) {
					if (state.currentToolId) {
						ctx.emitAgentEvent({
							type: "tool-call-end",
							toolCallId: state.currentToolId,
						});
					}
					ctx.emitChatEvent({ type: "content_block_stop" });
					state.toolOpen = false;
					state.assistantOpen = false;
					state.currentToolId = null;
				}

				let assistantText = "";
				const outputFile = Bun.file(state.outputPath);
				try {
					if (await outputFile.exists()) {
						assistantText = (await outputFile.text()).trim();
						state.lastAssistantMessage = assistantText;
					}
				} finally {
					await unlink(state.outputPath).catch(() => {});
				}
				await mkdir(resolve(process.cwd(), "data", "codex-debug"), {
					recursive: true,
				});
				await writeFile(
					state.debugLogPath,
					JSON.stringify(
						{
							createdAt: new Date().toISOString(),
							paneId: ctx.paneId,
							cwd: ctx.cwd,
							referencePaths: ctx.referencePaths ?? [],
							model: ctx.model ?? null,
							reasoningLevel: ctx.reasoningLevel ?? null,
							exitCode,
							stderr: stderrText,
							lastAssistantMessage: assistantText,
							events: rawEvents,
						},
						null,
						2
					)
				);

				if (
					assistantText &&
					!state.sawAssistantStream &&
					!state.hasFinalAssistantMessage
				) {
					ctx.emitChatEvent({
						type: "result",
						result: assistantText,
					});
					ctx.emitAgentEvent({ type: "result", text: assistantText });
				} else if (exitCode !== 0 && stderrText) {
					ctx.emitAgentEvent({ type: "error", message: stderrText });
					ctx.emitSystemMessage(stderrText);
				}
				ctx.emitAgentEvent({
					type: "finish",
					reason: exitCode === 0 ? "completed" : `exit:${exitCode}`,
				});

				return { lastAssistantMessage: state.lastAssistantMessage };
			},

			stop() {
				try {
					proc?.kill();
				} catch {}
			},

			kill() {
				try {
					proc?.kill();
				} catch {}
			},
		};
	},
};
