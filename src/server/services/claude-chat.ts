import type { ServerWebSocket } from "bun";
import type { ChatAgentKind } from "../../lib/agents.ts";
import { getAgentAdapter } from "../agents/registry.ts";
import {
	createClaudeEnv,
	resolveClaudeBinary,
} from "../../lib/terminal-command.ts";
import type { AgentHandle, AgentRunContext } from "../agents/types.ts";
import { CheckpointService } from "./checkpoint.ts";

interface ServerChatMessage {
	id: string;
	role: "user" | "assistant" | "tool" | "system";
	content: string;
	toolName?: string;
	isStreaming?: boolean;
}

const MAX_BUFFER_MESSAGES = 100;
const MAX_BUFFER_CHARS = 200_000;
const MAX_STDERR_CHARS = 64_000;
const DISCONNECTED_SESSION_TTL_MS = 5 * 60 * 1000;

let serverMsgId = 0;

class ChatMessageBuffer {
	private messages: ServerChatMessage[] = [];
	private currentAssistantIdx = -1;
	private currentToolIdx = -1;
	private hasStreamed = false;

	private push(
		role: ServerChatMessage["role"],
		content: string,
		extra?: Partial<ServerChatMessage>
	) {
		this.messages.push({ id: `s${++serverMsgId}`, role, content, ...extra });
		this.trim();
	}

	pushUser(text: string) {
		this.push("user", text);
	}
	pushSystem(text: string) {
		this.push("system", text);
	}
	pushAssistant(text: string) {
		this.push("assistant", text);
	}

	applyEvent(event: any) {
		if (!event?.type) return;

		if (event.type === "assistant") {
			const msg = event.message;
			if (!msg?.content || this.hasStreamed) return;
			for (const block of msg.content) {
				if (block.type === "text" && block.text) {
					if (
						this.currentAssistantIdx >= 0 &&
						this.currentAssistantIdx < this.messages.length
					) {
						this.messages[this.currentAssistantIdx]!.content = block.text;
						this.messages[this.currentAssistantIdx]!.isStreaming =
							!msg.stop_reason;
					} else {
						this.currentAssistantIdx = this.messages.length;
						this.push("assistant", block.text, {
							isStreaming: !msg.stop_reason,
						});
					}
				} else if (block.type === "tool_use") {
					this.currentAssistantIdx = -1;
					this.currentToolIdx = this.messages.length;
					const inputStr =
						typeof block.input === "string"
							? block.input
							: JSON.stringify(block.input, null, 2);
					this.push("tool", inputStr, {
						toolName: block.name,
						isStreaming: true,
					});
				}
			}
		} else if (event.type === "content_block_start") {
			this.hasStreamed = true;
			const block = event.content_block;
			if (block?.type === "text") {
				this.currentAssistantIdx = this.messages.length;
				this.push("assistant", block.text || "", { isStreaming: true });
			} else if (block?.type === "tool_use") {
				this.currentAssistantIdx = -1;
				this.currentToolIdx = this.messages.length;
				this.push("tool", "", { toolName: block.name, isStreaming: true });
			}
		} else if (event.type === "content_block_delta") {
			const delta = event.delta;
			if (
				delta?.type === "text_delta" &&
				delta.text &&
				this.currentAssistantIdx >= 0
			) {
				this.messages[this.currentAssistantIdx]!.content += delta.text;
			} else if (
				delta?.type === "input_json_delta" &&
				delta.partial_json &&
				this.currentToolIdx >= 0
			) {
				this.messages[this.currentToolIdx]!.content += delta.partial_json;
			}
		} else if (event.type === "content_block_stop") {
			if (
				this.currentAssistantIdx >= 0 &&
				this.currentAssistantIdx < this.messages.length
			) {
				this.messages[this.currentAssistantIdx]!.isStreaming = false;
				this.currentAssistantIdx = -1;
			}
			if (
				this.currentToolIdx >= 0 &&
				this.currentToolIdx < this.messages.length
			) {
				this.messages[this.currentToolIdx]!.isStreaming = false;
				this.currentToolIdx = -1;
			}
		} else if (event.type === "result" && event.result) {
			if (
				this.currentAssistantIdx >= 0 &&
				this.currentAssistantIdx < this.messages.length
			) {
				this.messages[this.currentAssistantIdx]!.content = event.result;
				this.messages[this.currentAssistantIdx]!.isStreaming = false;
				this.currentAssistantIdx = -1;
			} else {
				this.push("assistant", event.result);
			}
		}
	}

	finalize() {
		for (const m of this.messages) m.isStreaming = false;
		this.currentAssistantIdx = -1;
		this.currentToolIdx = -1;
		this.hasStreamed = false;
		this.trim();
	}

	getMessages(): ServerChatMessage[] {
		return this.messages;
	}
	get streaming(): boolean {
		return this.currentAssistantIdx >= 0 || this.currentToolIdx >= 0;
	}

	private trim() {
		if (this.messages.length > MAX_BUFFER_MESSAGES) {
			const drop = this.messages.length - MAX_BUFFER_MESSAGES;
			this.messages = this.messages.slice(drop);
			this.currentAssistantIdx =
				this.currentAssistantIdx >= drop ? this.currentAssistantIdx - drop : -1;
			this.currentToolIdx =
				this.currentToolIdx >= drop ? this.currentToolIdx - drop : -1;
		}
		let totalChars = this.messages.reduce(
			(sum, m) => sum + m.content.length,
			0
		);
		while (totalChars > MAX_BUFFER_CHARS && this.messages.length > 1) {
			totalChars -= this.messages[0]?.content.length;
			this.messages.shift();
			this.currentAssistantIdx =
				this.currentAssistantIdx >= 1 ? this.currentAssistantIdx - 1 : -1;
			this.currentToolIdx =
				this.currentToolIdx >= 1 ? this.currentToolIdx - 1 : -1;
		}
	}
}

interface ChatSession {
	paneId: string;
	agentKind: ChatAgentKind;
	sessionId: string | null;
	clients: Set<ServerWebSocket<any>>;
	currentHandle: AgentHandle | null;
	cwd: string;
	messageBuffer: ChatMessageBuffer;
	cleanupTimer: ReturnType<typeof setTimeout> | null;
}

interface AgentSessionInfo {
	paneId: string;
	agentKind: ChatAgentKind;
	cwd: string;
	sessionId: string | null;
	isRunning: boolean;
	clientCount: number;
	messageCount: number;
}

const _g = globalThis as any;
if (!_g.__inferay_chatSessions)
	_g.__inferay_chatSessions = new Map<string, ChatSession>();
const sessions: Map<string, ChatSession> = _g.__inferay_chatSessions;

function sendTo(ws: ServerWebSocket<any>, msg: object) {
	if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(session: ChatSession, msg: object) {
	const json = JSON.stringify(msg);
	for (const ws of session.clients) if (ws.readyState === 1) ws.send(json);
}

function broadcastExcept(
	session: ChatSession,
	exclude: ServerWebSocket<any>,
	msg: object
) {
	const json = JSON.stringify(msg);
	for (const ws of session.clients)
		if (ws !== exclude && ws.readyState === 1) ws.send(json);
}

function clearCleanupTimer(session: ChatSession) {
	if (session.cleanupTimer) {
		clearTimeout(session.cleanupTimer);
		session.cleanupTimer = null;
	}
}

function scheduleSessionCleanup(session: ChatSession) {
	clearCleanupTimer(session);
	if (session.currentHandle || session.clients.size > 0) return;
	session.cleanupTimer = setTimeout(() => {
		const current = sessions.get(session.paneId);
		if (!current || current.currentHandle || current.clients.size > 0) return;
		sessions.delete(session.paneId);
	}, DISCONNECTED_SESSION_TTL_MS);
}

function updateSessionId(
	session: ChatSession,
	paneId: string,
	nextSessionId: string | null
) {
	if (!nextSessionId || session.sessionId === nextSessionId) return;
	session.sessionId = nextSessionId;
	broadcast(session, {
		type: "chat:session",
		paneId,
		sessionId: nextSessionId,
	});
}

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

async function finalizeCheckpoint(
	session: ChatSession,
	paneId: string,
	checkpointId: string | null
) {
	if (!checkpointId) return;
	try {
		const cpMeta = await CheckpointService.finalizeCheckpoint(checkpointId);
		if (cpMeta && cpMeta.changedFileCount > 0) {
			broadcast(session, {
				type: "checkpoint:finalized",
				paneId,
				checkpointId,
				changedFileCount: cpMeta.changedFileCount,
				changedFiles: cpMeta.changedFiles,
			});
		}
	} catch (e) {
		console.error("[Checkpoint] Failed to finalize:", e);
	}
}

async function runAgent(session: ChatSession, paneId: string, text: string) {
	const adapter = getAgentAdapter(session.agentKind);
	const ctx: AgentRunContext = {
		paneId,
		cwd: session.cwd,
		getSessionId: () => session.sessionId,
		updateSessionId: (nextSessionId) =>
			updateSessionId(session, paneId, nextSessionId),
		emitChatEvent: (event) => {
			broadcast(session, { type: "chat:event", paneId, event });
			session.messageBuffer.applyEvent(event);
		},
		emitStatus: (status, isLoading = true) =>
			broadcast(session, { type: "chat:status", paneId, status, isLoading }),
		emitSystemMessage: (message) => {
			session.messageBuffer.pushSystem(message);
			broadcast(session, { type: "chat:system", paneId, message });
		},
	};
	const state = adapter.createState(ctx);
	const handle = adapter.createHandle(text, ctx, state);
	session.currentHandle = handle;

	try {
		await handle.run();
	} finally {
		session.currentHandle = null;
		session.messageBuffer.finalize();
		broadcast(session, {
			type: "chat:sync",
			paneId,
			messages: session.messageBuffer.getMessages(),
			isStreaming: false,
		});
		broadcast(session, { type: "chat:done", paneId });
		scheduleSessionCleanup(session);
	}
}

export const ChatService = {
	async sendMessage(
		paneId: string,
		text: string,
		ws: ServerWebSocket<any>,
		cwd?: string,
		clientSessionId?: string | null,
		agentKind: ChatAgentKind = "claude"
	) {
		let session = sessions.get(paneId);
		if (!session) {
			session = {
				paneId,
				agentKind,
				sessionId: clientSessionId || null,
				clients: new Set([ws]),
				currentHandle: null,
				cwd: cwd || process.cwd(),
				messageBuffer: new ChatMessageBuffer(),
				cleanupTimer: null,
			};
			sessions.set(paneId, session);
		}
		clearCleanupTimer(session);
		session.agentKind = agentKind;
		session.clients.add(ws);
		if (cwd) session.cwd = cwd;
		if (!session.sessionId && clientSessionId)
			updateSessionId(session, paneId, clientSessionId);

		session.messageBuffer.pushUser(text);
		broadcastExcept(session, ws, { type: "chat:user_message", paneId, text });

		if (session.currentHandle) {
			sendTo(ws, {
				type: "chat:error",
				paneId,
				error: `${getAgentAdapter(session.agentKind).displayName} is still responding`,
			});
			return;
		}

		let checkpointId: string | null = null;
		try {
			checkpointId = await CheckpointService.createCheckpoint(
				paneId,
				session.cwd,
				text
			);
			broadcast(session, { type: "checkpoint:created", paneId, checkpointId });
		} catch (e) {
			console.error("[Checkpoint] Failed to create:", e);
		}

		try {
			await runAgent(session, paneId, text);
			await finalizeCheckpoint(session, paneId, checkpointId);
		} catch (e) {
			session.currentHandle = null;
			const errMsg =
				e instanceof Error ? e.message : `Failed to run ${session.agentKind}`;
			session.messageBuffer.pushSystem(errMsg);
			session.messageBuffer.finalize();
			broadcast(session, { type: "chat:error", paneId, error: errMsg });
			await finalizeCheckpoint(session, paneId, checkpointId);
			scheduleSessionCleanup(session);
		}
	},

	async sendBtwMessage(
		paneId: string,
		text: string,
		ws: ServerWebSocket<any>,
		cwd?: string
	) {
		const effectiveCwd = cwd || process.cwd();
		const claudeCmd = resolveClaudeBinary();

		sendTo(ws, { type: "chat:btw:start", paneId, question: text });

		let fullText = "";

		try {
			const proc = Bun.spawn(
				[
					claudeCmd,
					"-p",
					text,
					"--output-format",
					"stream-json",
					"--verbose",
					"--dangerously-skip-permissions",
				],
				{
					stdout: "pipe",
					stderr: "pipe",
					cwd: effectiveCwd,
					env: createClaudeEnv(),
				}
			);
			const stderrPromise = drainStreamToString(
				proc.stderr as ReadableStream<Uint8Array>
			);
			const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
			const decoder = new TextDecoder();
			let leftover = "";

			const handleBtwEvent = (event: any) => {
				if (
					event.type === "content_block_delta" &&
					event.delta?.type === "text_delta"
				) {
					fullText += event.delta.text;
					sendTo(ws, {
						type: "chat:btw:delta",
						paneId,
						text: event.delta.text,
					});
				} else if (
					event.type === "content_block_start" &&
					event.content_block?.type === "text" &&
					event.content_block.text
				) {
					fullText += event.content_block.text;
					sendTo(ws, {
						type: "chat:btw:delta",
						paneId,
						text: event.content_block.text,
					});
				} else if (event.type === "result" && event.result && !fullText) {
					fullText = event.result;
				}
			};

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				leftover += decoder.decode(value, { stream: true });
				leftover = parseNdjsonLines(leftover, handleBtwEvent);
			}
			flushNdjsonLeftover(leftover, handleBtwEvent);
			await proc.exited;
			const stderrText = (await stderrPromise).trim();
			if (!fullText && stderrText) {
				fullText = stderrText;
			}
		} catch (err: any) {
			if (!fullText) {
				fullText = err.message || "(error)";
			}
		}

		sendTo(ws, {
			type: "chat:btw:done",
			paneId,
			answer: fullText || "(no response)",
		});
	},

	stopGeneration(paneId: string) {
		const session = sessions.get(paneId);
		if (session?.currentHandle) {
			try {
				session.currentHandle.stop();
			} catch {}
		}
	},

	destroySession(paneId: string) {
		const session = sessions.get(paneId);
		if (session?.currentHandle) {
			try {
				session.currentHandle.kill();
			} catch {}
		}
		if (session) clearCleanupTimer(session);
		sessions.delete(paneId);
	},

	cleanupWs(ws: ServerWebSocket<any>) {
		for (const session of sessions.values()) {
			session.clients.delete(ws);
			scheduleSessionCleanup(session);
		}
	},

	reassignWs(paneId: string, ws: ServerWebSocket<any>) {
		const session = sessions.get(paneId);
		if (!session) return;
		clearCleanupTimer(session);
		session.clients.add(ws);
		if (session.sessionId)
			sendTo(ws, {
				type: "chat:session",
				paneId,
				sessionId: session.sessionId,
			});
		const messages = session.messageBuffer.getMessages();
		if (messages.length > 0)
			sendTo(ws, {
				type: "chat:sync",
				paneId,
				messages,
				isStreaming: session.messageBuffer.streaming,
			});
		if (session.currentHandle)
			sendTo(ws, {
				type: "chat:status",
				paneId,
				status: session.messageBuffer.streaming ? "responding" : "thinking",
				isLoading: true,
			});
	},

	listSessions(): AgentSessionInfo[] {
		return Array.from(sessions.values())
			.filter((s) => s.currentHandle || s.clients.size > 0)
			.map((s) => ({
				paneId: s.paneId,
				agentKind: s.agentKind,
				cwd: s.cwd,
				sessionId: s.sessionId,
				isRunning: !!s.currentHandle,
				clientCount: s.clients.size,
				messageCount: s.messageBuffer.getMessages().length,
			}));
	},

	destroyAll() {
		for (const [_, session] of sessions) {
			if (session.currentHandle) {
				try {
					session.currentHandle.kill();
				} catch {}
			}
			clearCleanupTimer(session);
		}
		sessions.clear();
	},
};
