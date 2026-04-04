import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createCodexEnv, resolveCodexBinary } from "../terminal-command.ts";
import type { AgentAdapter, AgentHandle, AgentRunContext } from "../types.ts";

interface CodexRunState {
	outputPath: string;
	assistantOpen: boolean;
	toolOpen: boolean;
	sawAssistantStream: boolean;
	hasFinalAssistantMessage: boolean;
}

const MAX_STDERR_CHARS = 64_000;

async function drainStreamToString(
	stream: ReadableStream<Uint8Array>,
	maxChars = MAX_STDERR_CHARS
) {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let text = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		text += decoder.decode(value, { stream: true });
		if (text.length > maxChars) text = text.slice(-maxChars);
	}
	return text + decoder.decode();
}

function parseNdjsonLines(
	leftover: string,
	handler: (event: any) => void
): string {
	const lines = leftover.split("\n");
	const remainder = lines.pop()!;
	for (const line of lines) {
		if (!line.trim()) continue;
		try {
			handler(JSON.parse(line));
		} catch {}
	}
	return remainder;
}

function flushNdjsonLeftover(leftover: string, handler: (event: any) => void) {
	if (leftover.trim()) {
		try {
			handler(JSON.parse(leftover));
		} catch {}
	}
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

function handleCodexEvent(
	event: any,
	ctx: AgentRunContext,
	state: CodexRunState
) {
	const closeTool = () => {
		if (!state.toolOpen) return;
		ctx.emitChatEvent({ type: "content_block_stop" });
		state.toolOpen = false;
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
		ctx.emitChatEvent({
			type: "content_block_start",
			content_block: { type: "tool_use", name, input },
		});
		state.toolOpen = true;
	};
	const toolDelta = (textDelta: string) => {
		if (!state.toolOpen || !textDelta) return;
		ctx.emitChatEvent({
			type: "content_block_delta",
			delta: { type: "input_json_delta", partial_json: textDelta },
		});
	};
	const assistantDelta = (textDelta: string) => {
		if (!textDelta) return;
		startAssistant();
		ctx.emitChatEvent({
			type: "content_block_delta",
			delta: { type: "text_delta", text: textDelta },
		});
	};

	const eventType = String(event?.type ?? "");
	const eventText = extractText(event);

	if (event?.type === "thread.started" && event.thread_id) {
		ctx.updateSessionId(event.thread_id);
	} else if (event?.type === "turn.started") {
		ctx.emitStatus("thinking", true);
	} else if (event?.type === "agent_message_delta") {
		assistantDelta(event.delta ?? event.text ?? event.content ?? "");
		ctx.emitStatus("responding", true);
	} else if (event?.type === "agent_message") {
		const content = event.message ?? event.content ?? event.text ?? "";
		if (typeof content === "string" && content) {
			assistantDelta(content);
		}
	} else if (event?.type === "exec_command_begin") {
		ctx.emitStatus("tool:exec", true);
		startTool("exec", {
			command: event.parsed_cmd ?? event.command ?? event.cmd ?? "",
			cwd: event.cwd ?? ctx.cwd,
		});
	} else if (event?.type === "exec_command_output_delta") {
		const chunk =
			typeof event.chunk === "string"
				? Buffer.from(event.chunk, "base64").toString("utf8")
				: "";
		toolDelta(chunk);
	} else if (event?.type === "exec_command_end") {
		closeTool();
	} else if (event?.type === "patch_apply_begin") {
		ctx.emitStatus("tool:patch", true);
		startTool("patch", { changes: event.changes ?? event.files ?? [] });
	} else if (event?.type === "patch_apply_end") {
		closeTool();
	} else if (event?.type === "web_search_begin") {
		ctx.emitStatus("tool:web_search", true);
		startTool("web_search", { query: event.query ?? "" });
	} else if (event?.type === "web_search_end") {
		if (event.query) toolDelta(event.query);
		closeTool();
	} else if (event?.type === "mcp_tool_call_begin") {
		const toolName = event.invocation?.tool ?? event.tool ?? "mcp_tool";
		ctx.emitStatus(`tool:${toolName}`, true);
		startTool(toolName, event.invocation?.arguments ?? event.arguments ?? {});
	} else if (event?.type === "mcp_tool_call_end") {
		closeTool();
	} else if (
		event?.type === "item.completed" &&
		event.item?.type === "error" &&
		event.item.message
	) {
		ctx.emitSystemMessage(event.item.message);
	} else if (
		event?.type === "item.completed" &&
		event.item &&
		extractText(event.item)
	) {
		const itemText = extractText(event.item);
		if (!state.sawAssistantStream && itemText) {
			ctx.emitChatEvent({ type: "result", result: itemText });
			state.hasFinalAssistantMessage = true;
		}
	} else if (event?.type === "error" && event.message) {
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
			state.hasFinalAssistantMessage = true;
		}
	} else if (
		eventText &&
		/message|assistant|output_text|text_delta/i.test(eventType) &&
		!/error|tool|exec_command|patch|web_search|mcp/i.test(eventType)
	) {
		assistantDelta(eventText);
		ctx.emitStatus("responding", true);
	}
}

export const codexAdapter: AgentAdapter<CodexRunState> = {
	kind: "codex",
	displayName: "Codex",

	createState(ctx) {
		return {
			outputPath: resolve(
				tmpdir(),
				`surgent-codex-${ctx.paneId}-${Date.now()}.txt`
			),
			assistantOpen: false,
			toolOpen: false,
			sawAssistantStream: false,
			hasFinalAssistantMessage: false,
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
				const sessionId = ctx.getSessionId();
				const args = sessionId
					? [codexCmd, "exec", "resume", ...baseArgs, sessionId, prompt]
					: [codexCmd, "exec", ...baseArgs, prompt];

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

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					leftover += decoder.decode(value, { stream: true });
					leftover = parseNdjsonLines(leftover, (event) =>
						handleCodexEvent(event, ctx, state)
					);
				}
				flushNdjsonLeftover(leftover, (event) =>
					handleCodexEvent(event, ctx, state)
				);

				const exitCode = await proc.exited;
				proc = null;
				const stderrText = (await stderrPromise).trim();

				// Finalize
				if (state.toolOpen || state.assistantOpen) {
					ctx.emitChatEvent({ type: "content_block_stop" });
					state.toolOpen = false;
					state.assistantOpen = false;
				}

				let assistantText = "";
				const outputFile = Bun.file(state.outputPath);
				try {
					if (await outputFile.exists()) {
						assistantText = (await outputFile.text()).trim();
					}
				} finally {
					await unlink(state.outputPath).catch(() => {});
				}

				if (
					assistantText &&
					!state.sawAssistantStream &&
					!state.hasFinalAssistantMessage
				) {
					ctx.emitChatEvent({
						type: "result",
						result: assistantText,
					});
				} else if (exitCode !== 0 && stderrText) {
					ctx.emitSystemMessage(stderrText);
				}
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
