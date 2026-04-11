import { query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentAdapter, AgentHandle, SessionUsage } from "../types.ts";

const DEFAULT_GUARDRAILS = `IMPORTANT GUARDRAILS — follow these at all times:
- NEVER run git commit, git push, git push --force, or git merge unless the user EXPLICITLY asks you to.
- NEVER delete branches (git branch -D/-d) unless the user EXPLICITLY asks you to.
- NEVER run destructive commands (rm -rf, git reset --hard, git checkout ., git clean) unless the user EXPLICITLY asks you to.
- Before making changes, briefly state what you plan to do and which files you'll modify.
- If you're unsure about something, ask the user rather than guessing.`;

export const claudeAdapter: AgentAdapter<undefined> = {
	kind: "claude",
	displayName: "Claude",

	createState() {
		return undefined;
	},

	createHandle(prompt, ctx): AgentHandle {
		const abortController = new AbortController();

		const env = { ...process.env };
		delete env.CLAUDECODE;

		const sessionId = ctx.getSessionId();

		// Build system prompt with guardrails + user-provided prompt
		const appendParts: string[] = [DEFAULT_GUARDRAILS];
		if (ctx.systemPrompt) {
			appendParts.push(ctx.systemPrompt);
		}
		if (ctx.referencePaths.length > 0) {
			const refLines = ctx.referencePaths
				.map((p) => {
					const name = p.split(/[\\/]/).pop() || p;
					return `- ${name}: ${p}`;
				})
				.join("\n");
			appendParts.push(
				`Reference Directories (read-only context — you have full access to browse these):\n${refLines}\n\nYour primary working directory is: ${ctx.cwd}`
			);
		}

		const systemPrompt = {
			type: "preset" as const,
			preset: "claude_code" as const,
			append: appendParts.join("\n\n"),
		};

		return {
			async run() {
				const q = query({
					prompt,
					options: {
						cwd: ctx.cwd,
						permissionMode: "bypassPermissions",
						allowDangerouslySkipPermissions: true,
						includePartialMessages: true,
						abortController,
						env,
						systemPrompt,
						...(ctx.referencePaths.length > 0
							? { additionalDirectories: ctx.referencePaths }
							: {}),
						...(sessionId ? { resume: sessionId } : {}),
					},
				});

				try {
					let knownSessionId = sessionId;
					for await (const event of q) {
						const e = event as any;

						// Extract session ID (only update when new)
						if (e.session_id && e.session_id !== knownSessionId) {
							knownSessionId = e.session_id;
							ctx.updateSessionId(e.session_id);
						}

						if (e.type === "system" && e.subtype === "init") {
							continue;
						}

						if (e.type === "stream_event" && e.event) {
							ctx.emitChatEvent(e.event);
						} else if (e.type === "assistant") {
							ctx.emitChatEvent({
								type: "assistant",
								message: e.message,
							});

							// Incremental token usage from assistant messages
							const msgUsage = e.message?.usage;
							if (msgUsage) {
								const inputTokens =
									(msgUsage.input_tokens || 0) +
									(msgUsage.cache_creation_input_tokens || 0) +
									(msgUsage.cache_read_input_tokens || 0);
								ctx.emitUsage({
									contextTokens: inputTokens,
									contextLimit: 0,
									totalInputTokens: inputTokens,
									totalOutputTokens: msgUsage.output_tokens || 0,
									totalCostUsd: 0,
									numTurns: 0,
									durationMs: 0,
								});
							}
						} else if (e.type === "result") {
							ctx.emitChatEvent({
								type: "result",
								result: e.result,
								session_id: e.session_id,
							});

							// Final authoritative usage from result event
							const usage: SessionUsage = {
								totalCostUsd: e.total_cost_usd ?? 0,
								numTurns: e.num_turns ?? 0,
								durationMs: e.duration_ms ?? 0,
								totalInputTokens: 0,
								totalOutputTokens: 0,
								contextTokens: 0,
								contextLimit: 200_000,
							};

							if (e.modelUsage) {
								for (const model of Object.values(e.modelUsage) as any[]) {
									usage.totalInputTokens += model.inputTokens ?? 0;
									usage.totalOutputTokens += model.outputTokens ?? 0;
									usage.contextTokens +=
										(model.inputTokens ?? 0) +
										(model.cacheReadInputTokens ?? 0) +
										(model.cacheCreationInputTokens ?? 0);
									if (model.contextWindow) {
										usage.contextLimit = model.contextWindow;
									}
								}
							}

							ctx.emitUsage(usage);
						}
					}
				} catch (err: any) {
					if (err.name === "AbortError") return;
					const msg = err.message || "Claude encountered an error";
					ctx.emitSystemMessage(msg);
				}
			},

			stop() {
				abortController.abort();
			},

			kill() {
				abortController.abort();
			},
		};
	},
};
