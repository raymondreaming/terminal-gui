import {
	createClaudeEnv,
	resolveClaudeBinary,
} from "../../../lib/terminal-command.ts";
import type { AgentAdapter, AgentHandle } from "../types.ts";

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
	if (!leftover.trim()) return;
	try {
		handler(JSON.parse(leftover));
	} catch {}
}

export const claudeAdapter: AgentAdapter<undefined> = {
	kind: "claude",
	displayName: "Claude",

	createState() {
		return undefined;
	},

	createHandle(prompt, ctx): AgentHandle {
		const sessionId = ctx.getSessionId();
		let proc: ReturnType<typeof Bun.spawn> | null = null;

		return {
			async run() {
				try {
					const args = [
						resolveClaudeBinary(),
						"-p",
						prompt,
						"--output-format",
						"stream-json",
						"--verbose",
						"--dangerously-skip-permissions",
					];
					if (sessionId) {
						args.push("--resume", sessionId);
					}
					proc = Bun.spawn(args, {
						stdout: "pipe",
						stderr: "pipe",
						cwd: ctx.cwd,
						env: createClaudeEnv(),
					});

					const stderrPromise = drainStreamToString(
						proc.stderr as ReadableStream<Uint8Array>
					);
					const reader = (
						proc.stdout as ReadableStream<Uint8Array>
					).getReader();
					const decoder = new TextDecoder();
					let leftover = "";

					while (true) {
						const { done, value } = await reader.read();
						if (done) break;
						leftover += decoder.decode(value, { stream: true });
						leftover = parseNdjsonLines(leftover, (event) => {
							if (event?.session_id) {
								ctx.updateSessionId(event.session_id);
							}
							ctx.emitChatEvent(event);
						});
					}

					flushNdjsonLeftover(leftover, (event) => {
						if (event?.session_id) {
							ctx.updateSessionId(event.session_id);
						}
						ctx.emitChatEvent(event);
					});

					const exitCode = await proc.exited;
					proc = null;
					const stderrText = (await stderrPromise).trim();
					if (exitCode !== 0 && stderrText) {
						ctx.emitSystemMessage(stderrText);
					}
				} catch (err: any) {
					const msg = err.message || "Claude encountered an error";
					ctx.emitSystemMessage(msg);
				}
			},

			stop() {
				try {
					proc?.kill("SIGINT");
					setTimeout(() => {
						try {
							proc?.kill("SIGINT");
						} catch {}
					}, 150);
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
