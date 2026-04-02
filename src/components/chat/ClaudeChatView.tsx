import React, {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { usePrompts } from "../../hooks/usePrompts.ts";
import { getAgentDefinition } from "../../lib/agents.ts";
import { measureTextHeight } from "../../lib/pretext-utils.ts";
import {
	type AgentKind,
	formatElapsedTime,
	getStatusInfo,
} from "../../lib/terminal-utils.ts";
import { wsClient } from "../../lib/websocket.ts";
import {
	IconAlertTriangle,
	IconCheck,
	IconCircle,
	IconMessageCircle,
	IconPencil,
	IconSparkles,
	IconTerminal,
	IconTrash,
	IconWrench,
	IconX,
} from "../ui/Icons.tsx";

interface QueuedMessage {
	id: string;
	text: string;
	displayText: string;
}

let queueIdCounter = 0;

interface TerminalTheme {
	bg: string;
	fg: string;
	cursor: string;
}

interface ClaudeChatViewProps {
	paneId: string;
	cwd?: string;
	showInput?: boolean;
	theme?: TerminalTheme;
	agentKind?: AgentKind;
	onStatusChange?: (paneId: string, status: string) => void;
}

export interface ClaudeChatHandle {
	sendMessage: (text: string) => void;
	getStatus: () => string;
}

interface ChatMessage {
	id: string;
	role: "user" | "assistant" | "tool" | "system" | "btw";
	content: string;
	toolName?: string;
	isStreaming?: boolean;
	btwQuestion?: string;
}

interface CheckpointInfo {
	id: string;
	timestamp: number;
	changedFileCount: number;
	changedFiles: { path: string; action: "created" | "modified" | "deleted" }[];
	reverted: boolean;
	/** ID of the last message when this checkpoint was created */
	afterMessageId: string | null;
}

type RenderItem =
	| { type: "message"; message: ChatMessage }
	| { type: "tool-group"; messages: ChatMessage[] };

const MAX_MESSAGES = 100;
const MAX_TOTAL_CHARS = 200000;
const STORAGE_KEY_PREFIX = "surgent-chat-";
const SESSION_KEY_PREFIX = "surgent-chat-session-";
const INPUT_KEY_PREFIX = "surgent-chat-input-";
const CHECKPOINT_KEY_PREFIX = "surgent-checkpoints-";

let msgId = 0;
function nextId() {
	return `c${++msgId}-${Date.now().toString(36)}`;
}

function trimMessages(msgs: ChatMessage[]): ChatMessage[] {
	let trimmed = msgs.length > MAX_MESSAGES ? msgs.slice(-MAX_MESSAGES) : msgs;

	let totalChars = trimmed.reduce((sum, m) => sum + m.content.length, 0);
	while (totalChars > MAX_TOTAL_CHARS && trimmed.length > 1) {
		totalChars -= trimmed[0]!.content.length;
		trimmed = trimmed.slice(1);
	}

	return trimmed;
}

function isGroupedToolMessage(msg: ChatMessage): boolean {
	return msg.role === "tool" && msg.toolName !== "AskUserQuestion";
}

function buildRenderItems(messages: ChatMessage[]): RenderItem[] {
	const items: RenderItem[] = [];
	let currentToolGroup: ChatMessage[] = [];

	const flushToolGroup = () => {
		if (currentToolGroup.length === 0) return;
		items.push({ type: "tool-group", messages: currentToolGroup });
		currentToolGroup = [];
	};

	for (const message of messages) {
		if (isGroupedToolMessage(message)) {
			currentToolGroup.push(message);
			continue;
		}
		flushToolGroup();
		items.push({ type: "message", message });
	}

	flushToolGroup();
	return items;
}

function loadMessages(paneId: string): ChatMessage[] {
	try {
		const saved = localStorage.getItem(STORAGE_KEY_PREFIX + paneId);
		if (saved) {
			const msgs = JSON.parse(saved) as ChatMessage[];
			return msgs.map((m) => ({ ...m, isStreaming: false }));
		}
	} catch {}
	return [];
}

function saveMessages(paneId: string, msgs: ChatMessage[]) {
	try {
		localStorage.setItem(STORAGE_KEY_PREFIX + paneId, JSON.stringify(msgs));
	} catch {}
}

export function clearChatMessages(paneId: string) {
	try {
		localStorage.removeItem(STORAGE_KEY_PREFIX + paneId);
		localStorage.removeItem(SESSION_KEY_PREFIX + paneId);
		localStorage.removeItem(INPUT_KEY_PREFIX + paneId);
	} catch {}
}

function adjustBrightness(hex: string, percent: number): string {
	const num = parseInt(hex.replace("#", ""), 16);
	const r = Math.min(255, Math.max(0, (num >> 16) + percent));
	const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + percent));
	const b = Math.min(255, Math.max(0, (num & 0x0000ff) + percent));
	return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

interface BubbleTheme {
	bg: string;
	fg: string;
	cursor: string;
	surface: string;
	border: string;
	fgMuted: string;
	fgDim: string;
}

interface SlashCommand {
	id?: string;
	name: string;
	description: string;
	action: "local" | "send";
	promptTemplate?: string;
	category?: string;
	isLocalCommand?: boolean;
	isFromLibrary?: boolean;
}

// Local-only commands that don't send to the active agent
const LOCAL_COMMANDS: SlashCommand[] = [
	{
		name: "clear",
		description: "Clear all messages",
		action: "local",
		isLocalCommand: true,
	},
	{
		name: "help",
		description: "Show available commands",
		action: "local",
		isLocalCommand: true,
	},
];

export const ClaudeChatView = forwardRef<ClaudeChatHandle, ClaudeChatViewProps>(
	function ClaudeChatView(
		{
			paneId,
			cwd,
			showInput = true,
			theme,
			agentKind = "claude",
			onStatusChange,
		},
		ref
	) {
		const [messages, setMessagesRaw] = useState<ChatMessage[]>(() =>
			loadMessages(paneId)
		);
		const messagesRef = useRef(messages);
		messagesRef.current = messages;
		const setMessages = useCallback(
			(update: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
				setMessagesRaw((prev) => {
					const next =
						typeof update === "function"
							? (update as (prev: ChatMessage[]) => ChatMessage[])(prev)
							: update;
					messagesRef.current = next;
					return next;
				});
			},
			[]
		);
		const [input, setInputRaw] = useState(() => {
			try {
				return localStorage.getItem(INPUT_KEY_PREFIX + paneId) ?? "";
			} catch {
				return "";
			}
		});
		const setInput = useCallback(
			(val: string) => {
				setInputRaw(val);
				try {
					if (val) localStorage.setItem(INPUT_KEY_PREFIX + paneId, val);
					else localStorage.removeItem(INPUT_KEY_PREFIX + paneId);
				} catch {}
			},
			[paneId]
		);
		const [chatUiState, setChatUiState] = useState<{
			isLoading: boolean;
			status: string;
			startTime: number | null;
			expandedTools: Set<string>;
		}>({
			isLoading: false,
			status: "idle",
			startTime: null,
			expandedTools: new Set(),
		});
		const { isLoading, status, startTime, expandedTools } = chatUiState;
		const setLoadingState = useCallback(
			(
				v:
					| { isLoading: boolean; status: string; startTime: number | null }
					| ((prev: {
							isLoading: boolean;
							status: string;
							startTime: number | null;
					  }) => {
							isLoading: boolean;
							status: string;
							startTime: number | null;
					  })
			) => {
				setChatUiState((prev) => {
					const next = typeof v === "function" ? v(prev) : v;
					return { ...prev, ...next };
				});
			},
			[]
		);
		const setExpandedTools = useCallback(
			(v: Set<string> | ((prev: Set<string>) => Set<string>)) => {
				setChatUiState((prev) => ({
					...prev,
					expandedTools: typeof v === "function" ? v(prev.expandedTools) : v,
				}));
			},
			[]
		);
		const [isDragOver, setIsDragOver] = useState(false);
		const [attachedImages, setAttachedImages] = useState<
			{ name: string; path: string; previewUrl: string }[]
		>([]);
		const [elapsedTime, setElapsedTime] = useState(0);
		const [commandMenu, setCommandMenu] = useState<{
			show: boolean;
			selectedIdx: number;
			position: {
				top: number;
				left: number;
				width: number;
				maxHeight: number;
			} | null;
		}>({ show: false, selectedIdx: 0, position: null });
		const showCommands = commandMenu.show;
		const selectedCommandIdx = commandMenu.selectedIdx;
		const menuPosition = commandMenu.position;
		// @ file reference menu
		const [fileMenu, setFileMenu] = useState<{
			show: boolean;
			selectedIdx: number;
			query: string;
			atIndex: number; // cursor position of the '@'
			position: {
				top: number;
				left: number;
				width: number;
				maxHeight: number;
			} | null;
		}>({ show: false, selectedIdx: 0, query: "", atIndex: -1, position: null });
		const [fileResults, setFileResults] = useState<
			{ name: string; path: string; isDir: boolean }[]
		>([]);
		// Checkpoint state
		const [checkpoints, setCheckpoints] = useState<CheckpointInfo[]>(() => {
			try {
				const stored = localStorage.getItem(CHECKPOINT_KEY_PREFIX + paneId);
				return stored ? JSON.parse(stored) : [];
			} catch {
				return [];
			}
		});
		const checkpointsRef = useRef(checkpoints);
		checkpointsRef.current = checkpoints;

		const fileSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
			null
		);
		const scrollRef = useRef<HTMLDivElement>(null);
		const textareaRef = useRef<HTMLTextAreaElement>(null);
		const inputContainerRef = useRef<HTMLDivElement>(null);
		const currentAssistantRef = useRef<string | null>(null);
		const currentToolRef = useRef<string | null>(null);
		const hasStreamedRef = useRef(false);
		const queueRef = useRef<QueuedMessage[]>([]);
		const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
		const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
		const [editingQueueText, setEditingQueueText] = useState("");
		const containerRef = useRef<HTMLDivElement>(null);
		const fileInputRef = useRef<HTMLInputElement>(null);
		const currentBtwRef = useRef<string | null>(null);

		useEffect(() => {
			requestAnimationFrame(() => textareaRef.current?.focus());
		}, [paneId]);

		const appendLocalMessages = useCallback(
			(pending: Array<Pick<ChatMessage, "role" | "content">>) => {
				if (pending.length === 0) return;
				setMessages((prev) =>
					trimMessages([
						...prev,
						...pending.map((msg) => ({
							id: nextId(),
							role: msg.role,
							content: msg.content,
						})),
					])
				);
			},
			[]
		);
		const queueMessage = useCallback((text: string, displayText: string) => {
			queueRef.current.push({
				id: String(++queueIdCounter),
				text,
				displayText,
			});
			setQueuedMessages([...queueRef.current]);
		}, []);

		// Load prompts from local JSON
		const { prompts: localPrompts, incrementUsage: incrementLocalUsage } =
			usePrompts();

		// Merge local commands, Claude Code commands, and library prompts
		const allCommands = useMemo<SlashCommand[]>(() => {
			const libraryCommands: SlashCommand[] = localPrompts.map((p) => ({
				id: p._id,
				name: p.command,
				description: p.description,
				action: "send" as const,
				promptTemplate: p.promptTemplate,
				category: p.category,
				isFromLibrary: true,
			}));
			const nativeCommands: SlashCommand[] = getAgentDefinition(
				agentKind
			).nativeSlashCommands.map((cmd) => ({
				name: cmd.name,
				description: cmd.description,
				action: "send",
				isLocalCommand: true,
			}));
			return [...LOCAL_COMMANDS, ...nativeCommands, ...libraryCommands];
		}, [agentKind, localPrompts]);

		const filteredCommands = input.startsWith("/")
			? allCommands.filter((cmd) =>
					cmd.name.toLowerCase().startsWith(input.slice(1).toLowerCase())
				)
			: [];

		// Cache container rects to avoid repeated getBoundingClientRect reflows
		const cachedRects = useRef<{ input: DOMRect; container: DOMRect } | null>(
			null
		);
		useEffect(() => {
			const inputEl = inputContainerRef.current;
			const containerEl = containerRef.current;
			if (!inputEl || !containerEl) return;
			const update = () => {
				cachedRects.current = {
					input: inputEl.getBoundingClientRect(),
					container: containerEl.getBoundingClientRect(),
				};
			};
			update();
			const obs = new ResizeObserver(update);
			obs.observe(inputEl);
			obs.observe(containerEl);
			return () => obs.disconnect();
		}, []);

		const getMenuPosition = useCallback((maxH: number) => {
			const r = cachedRects.current;
			if (!r) return null;
			const availableHeight = r.input.top - r.container.top - 16;
			return {
				top: r.input.top,
				left: r.input.left,
				width: r.input.width,
				maxHeight: Math.min(availableHeight * 0.75, maxH),
			};
		}, []);

		useEffect(() => {
			if (input.startsWith("/") && !input.includes(" ")) {
				setCommandMenu({
					show: true,
					selectedIdx: 0,
					position: getMenuPosition(400),
				});
			} else {
				setCommandMenu({ show: false, selectedIdx: 0, position: null });
			}
		}, [input, getMenuPosition]);

		// @ file reference: detect trigger and search
		const handleInputForFileMenu = useCallback(
			(value: string, cursorPos: number) => {
				// Find the last '@' before the cursor that starts a file reference
				let atIdx = -1;
				for (let i = cursorPos - 1; i >= 0; i--) {
					if (value[i] === "@") {
						// Valid if at start or preceded by whitespace
						if (i === 0 || /\s/.test(value[i - 1]!)) {
							atIdx = i;
						}
						break;
					}
					// Stop searching if we hit whitespace before finding @
					if (/\s/.test(value[i]!)) break;
				}

				if (atIdx === -1) {
					if (fileMenu.show) setFileMenu((prev) => ({ ...prev, show: false }));
					return;
				}

				const query = value.slice(atIdx + 1, cursorPos);

				let position: typeof fileMenu.position = fileMenu.position;
				{
					const pos = getMenuPosition(300);
					if (pos) position = pos;
				}

				setFileMenu({
					show: true,
					selectedIdx: 0,
					query,
					atIndex: atIdx,
					position,
				});

				// Debounce the API call
				if (fileSearchTimerRef.current)
					clearTimeout(fileSearchTimerRef.current);
				fileSearchTimerRef.current = setTimeout(async () => {
					try {
						const params = new URLSearchParams({ q: query, limit: "15" });
						if (cwd) params.set("cwd", cwd);
						const res = await fetch(`/api/files/search?${params}`);
						const data = await res.json();
						setFileResults(data.results || []);
					} catch {
						setFileResults([]);
					}
				}, 150);
			},
			[cwd, fileMenu.show, fileMenu.position]
		);

		// Debounced save as crash safety net (2s), skips during active streaming
		// Main saves happen on chat:done/chat:error
		const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
		useEffect(() => {
			if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
			// Don't save on every streaming delta — wait for a pause
			if (messagesRef.current.some((m) => m.isStreaming)) return;
			saveTimerRef.current = setTimeout(() => {
				saveMessages(paneId, messagesRef.current);
			}, 2000);
			return () => {
				if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
			};
		}, [paneId, messages]);

		// Notify parent of status changes
		useEffect(() => {
			onStatusChange?.(paneId, status);
		}, [paneId, status, onStatusChange]);

		// Track elapsed time while loading
		useEffect(() => {
			if (isLoading && startTime) {
				const interval = setInterval(() => {
					setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
				}, 1000);
				return () => clearInterval(interval);
			} else {
				setElapsedTime(0);
			}
		}, [isLoading, startTime]);

		useImperativeHandle(
			ref,
			() => ({
				sendMessage: (text: string) => {
					if (!text.trim()) return;
					if (isLoading) {
						queueMessage(text.trim(), text.trim());
					} else {
						appendLocalMessages([{ role: "user", content: text.trim() }]);
						sendToServer(text.trim());
					}
				},
				getStatus: () => status,
			}),
			[appendLocalMessages, isLoading, queueMessage, status]
		);

		useEffect(() => {
			const cleanup = wsClient.subscribe(paneId, (msg: any) => {
				if (msg.type === "chat:event") {
					handleChatEvent(msg.event);
					// Preserve legacy Claude events that still include session_id directly.
					if (msg.event?.session_id) {
						try {
							localStorage.setItem(
								SESSION_KEY_PREFIX + paneId,
								msg.event.session_id
							);
						} catch {}
					}
				} else if (msg.type === "chat:session") {
					if (msg.sessionId) {
						try {
							localStorage.setItem(SESSION_KEY_PREFIX + paneId, msg.sessionId);
						} catch {}
					}
				} else if (msg.type === "chat:done") {
					const updated = trimMessages(
						messagesRef.current.map((m) =>
							m.isStreaming ? { ...m, isStreaming: false } : m
						)
					);
					saveMessages(paneId, updated);
					setMessages(updated);
					const ids = new Set(updated.map((m) => m.id));
					setChatUiState((prev) => {
						const pruned = new Set<string>();
						for (const id of prev.expandedTools) {
							if (ids.has(id)) pruned.add(id);
						}
						return {
							isLoading: false,
							status: "idle",
							startTime: null,
							expandedTools:
								pruned.size === prev.expandedTools.size
									? prev.expandedTools
									: pruned,
						};
					});
					currentAssistantRef.current = null;
					currentToolRef.current = null;
					hasStreamedRef.current = false;
					wsClient.send({ type: "chat:reconnect", paneId });
					const next = queueRef.current.shift();
					setQueuedMessages([...queueRef.current]);
					if (next) {
						appendLocalMessages([{ role: "user", content: next.displayText }]);
						sendToServer(next.text);
					}
				} else if (msg.type === "chat:user_message") {
					setMessages((prev) =>
						trimMessages([
							...prev,
							{ id: nextId(), role: "user", content: msg.text },
						])
					);
					setLoadingState({
						isLoading: true,
						status: "thinking",
						startTime: Date.now(),
					});
					currentAssistantRef.current = null;
				} else if (msg.type === "chat:error") {
					setMessages((prev) => {
						const updated = trimMessages([
							...prev,
							{ id: nextId(), role: "system", content: msg.error },
						]);
						saveMessages(paneId, updated);
						return updated;
					});
					setLoadingState({
						isLoading: false,
						status: "error",
						startTime: null,
					});
					const next = queueRef.current.shift();
					setQueuedMessages([...queueRef.current]);
					if (next) {
						appendLocalMessages([{ role: "user", content: next.displayText }]);
						sendToServer(next.text);
					}
				} else if (msg.type === "chat:system") {
					setMessages((prev) => {
						const updated = trimMessages([
							...prev,
							{ id: nextId(), role: "system", content: msg.message },
						]);
						saveMessages(paneId, updated);
						return updated;
					});
				} else if (msg.type === "chat:status") {
					setLoadingState((prev) => ({
						isLoading: msg.isLoading ?? prev.isLoading,
						status: msg.status ?? prev.status,
						startTime: prev.startTime ?? Date.now(),
					}));
				} else if (msg.type === "chat:sync") {
					const serverMessages: ChatMessage[] = msg.messages;
					setMessages(trimMessages(serverMessages));
					saveMessages(paneId, serverMessages);
					if (msg.isStreaming) {
						setLoadingState({
							isLoading: true,
							status: "responding",
							startTime: Date.now(),
						});
						const lastAssistant = serverMessages.findLast?.(
							(m: ChatMessage) => m.isStreaming && m.role === "assistant"
						);
						if (lastAssistant) currentAssistantRef.current = lastAssistant.id;
						const lastTool = serverMessages.findLast?.(
							(m: ChatMessage) => m.isStreaming && m.role === "tool"
						);
						if (lastTool) currentToolRef.current = lastTool.id;
					} else {
						setLoadingState({
							isLoading: false,
							status: "idle",
							startTime: null,
						});
						currentAssistantRef.current = null;
						currentToolRef.current = null;
						hasStreamedRef.current = false;
					}
				}

				// BTW side-chain events
				else if (msg.type === "chat:btw:start") {
					const id = nextId();
					currentBtwRef.current = id;
					setMessages((prev) =>
						trimMessages([
							...prev,
							{
								id,
								role: "btw",
								content: "",
								isStreaming: true,
								btwQuestion: msg.question,
							},
						])
					);
				} else if (msg.type === "chat:btw:delta") {
					const targetId = currentBtwRef.current;
					if (targetId) {
						setMessages((prev) => {
							for (let i = prev.length - 1; i >= 0; i--) {
								if (prev[i]!.id === targetId) {
									const updated = prev.slice();
									updated[i] = {
										...updated[i]!,
										content: updated[i]!.content + msg.text,
									};
									return updated;
								}
							}
							return prev;
						});
					}
				} else if (msg.type === "chat:btw:done") {
					const targetId = currentBtwRef.current;
					currentBtwRef.current = null;
					if (targetId) {
						setMessages((prev) => {
							const updated = prev.slice();
							for (let i = prev.length - 1; i >= 0; i--) {
								if (updated[i]!.id === targetId) {
									updated[i] = {
										...updated[i]!,
										content: msg.answer,
										isStreaming: false,
									};
									break;
								}
							}
							saveMessages(paneId, updated);
							return updated;
						});
					}
				}

				// Checkpoint events
				else if (
					msg.type === "checkpoint:finalized" &&
					msg.changedFileCount > 0
				) {
					setCheckpoints((prev) => {
						// Find the last assistant message to anchor this checkpoint.
						// Prefer non-streaming, but fall back to any assistant message.
						const msgs = messagesRef.current;
						const lastMsg =
							msgs.findLast?.(
								(m) => m.role === "assistant" && !m.isStreaming
							) ?? msgs.findLast?.((m) => m.role === "assistant");
						if (!lastMsg) return prev; // no assistant message at all — skip
						// Prevent duplicate anchoring to the same message
						if (prev.some((c) => c.afterMessageId === lastMsg.id)) return prev;
						const updated = [
							...prev,
							{
								id: msg.checkpointId,
								timestamp: Date.now(),
								changedFileCount: msg.changedFileCount,
								changedFiles: msg.changedFiles,
								reverted: false,
								afterMessageId: lastMsg.id,
							},
						];
						try {
							localStorage.setItem(
								CHECKPOINT_KEY_PREFIX + paneId,
								JSON.stringify(updated)
							);
						} catch {}
						return updated;
					});
				} else if (msg.type === "checkpoint:reverted") {
					setCheckpoints((prev) => {
						const updated = prev.map((cp) =>
							cp.id === msg.checkpointId ? { ...cp, reverted: true } : cp
						);
						try {
							localStorage.setItem(
								CHECKPOINT_KEY_PREFIX + paneId,
								JSON.stringify(updated)
							);
						} catch {}
						return updated;
					});
					setMessages((prev) =>
						trimMessages([
							...prev,
							{
								id: nextId(),
								role: "system",
								content: `Reverted ${msg.restoredFiles?.length ?? 0} file(s) to checkpoint`,
							},
						])
					);
				} else if (msg.type === "checkpoint:error") {
					setMessages((prev) =>
						trimMessages([
							...prev,
							{
								id: nextId(),
								role: "system",
								content: `Revert failed: ${msg.error}`,
							},
						])
					);
				}
			});
			const reconnectChat = () => {
				wsClient.send({ type: "chat:reconnect", paneId });
			};
			reconnectChat();
			const cleanupReconnect = wsClient.onReconnect(reconnectChat);
			return () => {
				cleanupReconnect();
				cleanup();
			};
		}, [paneId]);

		function handleChatEvent(event: any) {
			if (!event?.type) return;

			if (event.type === "assistant") {
				const msg = event.message;
				if (!msg?.content) return;
				// Skip if content was already delivered via content_block_* streaming events
				if (hasStreamedRef.current) return;
				for (const block of msg.content) {
					if (block.type === "text" && block.text) {
						setLoadingState((prev) => ({ ...prev, status: "responding" }));
						if (currentAssistantRef.current) {
							const targetId = currentAssistantRef.current;
							setMessages((prev) => {
								const idx = prev.findIndex((m) => m.id === targetId);
								if (idx === -1) return prev;
								const updated = prev.slice();
								updated[idx] = {
									...updated[idx]!,
									content: block.text,
									isStreaming: !msg.stop_reason,
								};
								return updated;
							});
						} else {
							const id = nextId();
							currentAssistantRef.current = id;
							setMessages((prev) =>
								trimMessages([
									...prev,
									{
										id,
										role: "assistant",
										content: block.text,
										isStreaming: !msg.stop_reason,
									},
								])
							);
						}
					} else if (block.type === "tool_use") {
						const id = nextId();
						currentAssistantRef.current = null;
						currentToolRef.current = id;
						setLoadingState((prev) => ({
							...prev,
							status: `tool:${block.name}`,
						}));
						const inputStr =
							typeof block.input === "string"
								? block.input
								: JSON.stringify(block.input, null, 2);
						setMessages((prev) =>
							trimMessages([
								...prev,
								{
									id,
									role: "tool",
									content: inputStr,
									toolName: block.name,
									isStreaming: true,
								},
							])
						);
					}
				}
			} else if (event.type === "content_block_start") {
				hasStreamedRef.current = true;
				const block = event.content_block;
				if (block?.type === "text") {
					const id = nextId();
					currentAssistantRef.current = id;
					setLoadingState((prev) => ({ ...prev, status: "responding" }));
					setMessages((prev) =>
						trimMessages([
							...prev,
							{
								id,
								role: "assistant",
								content: block.text || "",
								isStreaming: true,
							},
						])
					);
				} else if (block?.type === "tool_use") {
					currentAssistantRef.current = null;
					const id = nextId();
					currentToolRef.current = id;
					setLoadingState((prev) => ({
						...prev,
						status: `tool:${block.name}`,
					}));
					setMessages((prev) =>
						trimMessages([
							...prev,
							{
								id,
								role: "tool",
								content: "",
								toolName: block.name,
								isStreaming: true,
							},
						])
					);
				}
			} else if (event.type === "content_block_delta") {
				const delta = event.delta;
				if (
					delta?.type === "text_delta" &&
					delta.text &&
					currentAssistantRef.current
				) {
					const targetId = currentAssistantRef.current;
					setMessages((prev) => {
						// Streaming target is always near the end — search backwards
						for (let i = prev.length - 1; i >= 0; i--) {
							if (prev[i]!.id === targetId) {
								const updated = prev.slice();
								updated[i] = {
									...updated[i]!,
									content: updated[i]!.content + delta.text,
								};
								return updated;
							}
						}
						return prev;
					});
				} else if (
					delta?.type === "input_json_delta" &&
					delta.partial_json &&
					currentToolRef.current
				) {
					const targetId = currentToolRef.current;
					setMessages((prev) => {
						for (let i = prev.length - 1; i >= 0; i--) {
							if (prev[i]!.id === targetId) {
								const updated = prev.slice();
								updated[i] = {
									...updated[i]!,
									content: updated[i]!.content + delta.partial_json,
								};
								return updated;
							}
						}
						return prev;
					});
				}
			} else if (event.type === "content_block_stop") {
				setMessages((prev) => {
					const updated = prev.slice();
					let changed = false;
					if (currentAssistantRef.current) {
						const targetId = currentAssistantRef.current;
						for (let i = prev.length - 1; i >= 0; i--) {
							if (prev[i]!.id === targetId) {
								updated[i] = { ...updated[i]!, isStreaming: false };
								changed = true;
								break;
							}
						}
					}
					if (currentToolRef.current) {
						const targetId = currentToolRef.current;
						for (let i = prev.length - 1; i >= 0; i--) {
							if (prev[i]!.id === targetId) {
								updated[i] = { ...updated[i]!, isStreaming: false };
								changed = true;
								break;
							}
						}
					}
					currentAssistantRef.current = null;
					currentToolRef.current = null;
					return changed ? updated : prev;
				});
			} else if (event.type === "result") {
				if (event.result) {
					setLoadingState((prev) => ({ ...prev, status: "responding" }));
					if (currentAssistantRef.current) {
						const targetId = currentAssistantRef.current;
						setMessages((prev) => {
							const idx = prev.findIndex((m) => m.id === targetId);
							if (idx === -1) {
								return trimMessages([
									...prev,
									{ id: nextId(), role: "assistant", content: event.result },
								]);
							}
							const updated = prev.slice();
							updated[idx] = {
								...updated[idx]!,
								content: event.result,
								isStreaming: false,
							};
							return updated;
						});
						currentAssistantRef.current = null;
					} else {
						setMessages((prev) => {
							const last = prev[prev.length - 1];
							if (last?.role === "assistant" && last.content === event.result)
								return prev;
							return trimMessages([
								...prev,
								{ id: nextId(), role: "assistant", content: event.result },
							]);
						});
					}
				}
			}
		}

		// Smart scroll anchoring — only auto-scroll if user is near the bottom
		const wasAtBottom = useRef(true);
		useEffect(() => {
			const el = scrollRef.current;
			if (!el) return;
			const handleScroll = () => {
				wasAtBottom.current =
					el.scrollHeight - el.scrollTop - el.clientHeight < 60;
			};
			el.addEventListener("scroll", handleScroll, { passive: true });
			return () => el.removeEventListener("scroll", handleScroll);
		}, []);
		useEffect(() => {
			const el = scrollRef.current;
			if (el && wasAtBottom.current) {
				el.scrollTop = el.scrollHeight;
			}
		}, [messages]);

		useEffect(() => {
			const ta = textareaRef.current;
			if (!ta) return;
			// Use pretext to measure text height without DOM reflow
			const width = ta.clientWidth - 24; // px-3 padding both sides
			if (width > 0 && input) {
				const measured = measureTextHeight(
					input,
					width,
					"12px Geist, -apple-system, system-ui, sans-serif",
					19.2
				);
				const target = Math.min(Math.max(measured + 16, 36), 120); // +padding, min 36, max 120
				ta.style.height = target + "px";
			} else {
				ta.style.height = "auto";
			}
		}, [input]);

		function sendToServer(text: string) {
			setLoadingState({
				isLoading: true,
				status: "thinking",
				startTime: Date.now(),
			});
			currentAssistantRef.current = null;
			let sessionId: string | null = null;
			try {
				sessionId = localStorage.getItem(SESSION_KEY_PREFIX + paneId);
			} catch {}
			wsClient.send({
				type: "chat:send",
				paneId,
				text,
				cwd,
				sessionId,
				agentKind,
			});
		}

		function stopGeneration() {
			wsClient.send({ type: "chat:stop", paneId });
			setLoadingState({ isLoading: false, status: "idle", startTime: null });
			setMessages((prev) =>
				trimMessages([
					...prev,
					{ id: nextId(), role: "system", content: "Generation stopped" },
				])
			);
		}

		function revertCheckpoint(checkpointId: string) {
			wsClient.send({ type: "checkpoint:revert", paneId, checkpointId });
		}

		const executeCommand = useCallback(
			(cmd: SlashCommand, args?: string) => {
				setCommandMenu((prev) => ({ ...prev, show: false }));
				setInput("");

				// /btw — side-chain question, bypasses main session
				if (cmd.name === "btw") {
					const question = (args || "").trim();
					if (!question) {
						setMessages((prev) =>
							trimMessages([
								...prev,
								{
									id: nextId(),
									role: "system",
									content: "Usage: /btw <question>",
								},
							])
						);
						return;
					}
					setMessages((prev) =>
						trimMessages([
							...prev,
							{ id: nextId(), role: "user", content: `/btw ${question}` },
						])
					);
					wsClient.send({ type: "chat:btw", paneId, text: question, cwd });
					return;
				}

				if (cmd.action === "local") {
					if (cmd.name === "clear") {
						setMessages([]);
						clearChatMessages(paneId);
						setCheckpoints([]);
						try {
							localStorage.removeItem(CHECKPOINT_KEY_PREFIX + paneId);
						} catch {}
						setMessages([
							{ id: nextId(), role: "system", content: "Chat cleared" },
						]);
					} else if (cmd.name === "help") {
						const helpText = allCommands
							.map((c) => `/${c.name} - ${c.description}`)
							.join("\n");
						setMessages((prev) =>
							trimMessages([
								...prev,
								{ id: nextId(), role: "system", content: helpText },
							])
						);
					}
				} else {
					// Use prompt template from library if available
					let prompt: string;
					if (cmd.promptTemplate) {
						prompt = cmd.promptTemplate.replace("{args}", args || "").trim();
						// Track usage for library prompts
						if (cmd.id) {
							incrementLocalUsage(cmd.id!).catch(() => {});
						}
					} else {
						prompt = `/${cmd.name} ${args || ""}`.trim();
					}

					if (isLoading) {
						queueMessage(prompt, `/${cmd.name}${args ? " " + args : ""}`);
					} else {
						appendLocalMessages([
							{
								role: "user",
								content: `/${cmd.name}${args ? " " + args : ""}`,
							},
							{
								role: "system",
								content: `Running /${cmd.name}...`,
							},
						]);
						sendToServer(prompt);
					}
				}
			},
			[
				appendLocalMessages,
				isLoading,
				allCommands,
				incrementLocalUsage,
				queueMessage,
			]
		);

		const selectCommand = useCallback(
			(idx: number) => {
				if (filteredCommands[idx]) {
					const cmd = filteredCommands[idx];
					const args = input.slice(1).includes(" ")
						? input.slice(input.indexOf(" ") + 1)
						: undefined;
					executeCommand(cmd, args);
				}
			},
			[filteredCommands, input, executeCommand]
		);

		const selectFile = useCallback(
			(idx: number) => {
				const file = fileResults[idx];
				if (!file) return;
				// Replace @query with @filepath
				const before = input.slice(0, fileMenu.atIndex);
				const cursorPos = textareaRef.current?.selectionStart ?? input.length;
				const after = input.slice(cursorPos);
				const newInput = `${before}@${file.path}${after ? after : " "}`;
				setInput(newInput);
				setFileMenu((prev) => ({ ...prev, show: false }));
				// Focus textarea and set cursor after the inserted path
				requestAnimationFrame(() => {
					const ta = textareaRef.current;
					if (ta) {
						const pos = before.length + 1 + file.path.length + (after ? 0 : 1);
						ta.focus();
						ta.setSelectionRange(pos, pos);
					}
				});
			},
			[fileResults, fileMenu.atIndex, input]
		);

		const sendMessage = useCallback(() => {
			const text = input.trim();
			if (!text && attachedImages.length === 0) return;

			if (text.startsWith("/")) {
				const parts = text.slice(1).split(" ");
				const cmdName = parts[0]?.toLowerCase();
				const args = parts.slice(1).join(" ");
				const cmd = allCommands.find((c) => c.name === cmdName);
				if (cmd) {
					executeCommand(cmd, args || undefined);
					return;
				}
			}

			// Build the full message with image references
			const imagePaths = attachedImages.map((img) => img.path);
			const displayText =
				text || "Attached image" + (attachedImages.length > 1 ? "s" : "");
			const fullText =
				imagePaths.length > 0
					? `${text}${text ? "\n\n" : ""}Here are the images at these paths:\n${imagePaths.join("\n")}`
					: text;

			setInput("");
			setFileMenu((prev) => ({ ...prev, show: false }));
			// Clean up preview URLs
			for (const img of attachedImages) URL.revokeObjectURL(img.previewUrl);
			setAttachedImages([]);
			if (textareaRef.current) textareaRef.current.style.height = "auto";

			if (isLoading) {
				queueMessage(fullText, displayText);
			} else {
				appendLocalMessages([{ role: "user", content: displayText }]);
				sendToServer(fullText);
			}
		}, [
			input,
			isLoading,
			executeCommand,
			attachedImages,
			appendLocalMessages,
			queueMessage,
		]);

		const handleKeyDown = useCallback(
			(e: React.KeyboardEvent) => {
				// File menu keyboard navigation
				if (fileMenu.show && fileResults.length > 0) {
					if (e.key === "ArrowDown") {
						e.preventDefault();
						setFileMenu((prev) => ({
							...prev,
							selectedIdx: (prev.selectedIdx + 1) % fileResults.length,
						}));
						return;
					}
					if (e.key === "ArrowUp") {
						e.preventDefault();
						setFileMenu((prev) => ({
							...prev,
							selectedIdx:
								(prev.selectedIdx - 1 + fileResults.length) %
								fileResults.length,
						}));
						return;
					}
					if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
						e.preventDefault();
						selectFile(fileMenu.selectedIdx);
						return;
					}
					if (e.key === "Escape") {
						e.preventDefault();
						setFileMenu((prev) => ({ ...prev, show: false }));
						return;
					}
				}

				// Command menu keyboard navigation
				if (showCommands && filteredCommands.length > 0) {
					if (e.key === "ArrowDown") {
						e.preventDefault();
						setCommandMenu((prev) => ({
							...prev,
							selectedIdx: (prev.selectedIdx + 1) % filteredCommands.length,
						}));
						return;
					}
					if (e.key === "ArrowUp") {
						e.preventDefault();
						setCommandMenu((prev) => ({
							...prev,
							selectedIdx:
								(prev.selectedIdx - 1 + filteredCommands.length) %
								filteredCommands.length,
						}));
						return;
					}
					if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
						e.preventDefault();
						selectCommand(selectedCommandIdx);
						return;
					}
					if (e.key === "Escape") {
						e.preventDefault();
						setCommandMenu((prev) => ({ ...prev, show: false }));
						return;
					}
				}

				if (e.key === "Enter" && !e.shiftKey) {
					e.preventDefault();
					sendMessage();
				}
			},
			[
				sendMessage,
				showCommands,
				filteredCommands,
				selectedCommandIdx,
				selectCommand,
				fileMenu.show,
				fileMenu.selectedIdx,
				fileResults,
				selectFile,
			]
		);

		const handleDrop = useCallback(
			async (e: React.DragEvent) => {
				e.preventDefault();
				setIsDragOver(false);
				for (const file of Array.from(e.dataTransfer.files)) {
					if (file.type.startsWith("image/")) await attachImage(file);
				}
			},
			[paneId]
		);

		const handlePaste = useCallback(
			async (e: React.ClipboardEvent) => {
				for (const item of Array.from(e.clipboardData.items)) {
					if (item.type.startsWith("image/")) {
						e.preventDefault();
						const file = item.getAsFile();
						if (file) await attachImage(file);
						return;
					}
				}
			},
			[paneId]
		);

		async function attachImage(file: File) {
			try {
				const fd = new FormData();
				fd.append("file", file);
				const res = await fetch("/api/upload-temp", {
					method: "POST",
					body: fd,
				});
				const data = await res.json();
				if (data.path) {
					const previewUrl = URL.createObjectURL(file);
					setAttachedImages((prev) => [
						...prev,
						{ name: file.name, path: data.path, previewUrl },
					]);
				}
			} catch {}
		}

		function removeAttachedImage(path: string) {
			setAttachedImages((prev) => {
				const target = prev.find((img) => img.path === path);
				if (target) URL.revokeObjectURL(target.previewUrl);
				return prev.filter((img) => img.path !== path);
			});
		}

		const toggleTool = useCallback((id: string) => {
			setExpandedTools((prev) => {
				const next = new Set(prev);
				next.has(id) ? next.delete(id) : next.add(id);
				return next;
			});
		}, []);

		const handleSendMessage = useCallback(
			(text: string) => {
				if (!text.trim()) return;
				if (isLoading) {
					queueMessage(text.trim(), text.trim());
				} else {
					appendLocalMessages([{ role: "user", content: text.trim() }]);
					sendToServer(text.trim());
				}
			},
			[appendLocalMessages, isLoading, queueMessage]
		);

		const bgColor = theme?.bg ?? "#000000";
		const fgColor = theme?.fg ?? "#e5e5e5";
		const cursorColor = theme?.cursor ?? "#d6ff00";
		const fgMuted = fgColor + "88";
		const fgDim = fgColor + "55";
		const surfaceColor = theme ? adjustBrightness(bgColor, 15) : undefined;
		const borderColor = theme ? fgColor + "15" : undefined;
		const bubbleTheme = useMemo<BubbleTheme | undefined>(
			() =>
				theme
					? {
							bg: bgColor,
							fg: fgColor,
							cursor: cursorColor,
							surface: surfaceColor!,
							border: borderColor!,
							fgMuted,
							fgDim,
						}
					: undefined,
			[
				theme,
				bgColor,
				fgColor,
				cursorColor,
				surfaceColor,
				borderColor,
				fgMuted,
				fgDim,
			]
		);

		return (
			<div
				ref={containerRef}
				className={`flex h-full flex-col transition-all ${isDragOver ? "ring-2 ring-inset ring-blue-500/60" : ""}`}
				style={theme ? { backgroundColor: bgColor, color: fgColor } : undefined}
				onDragOver={(e) => {
					e.preventDefault();
					setIsDragOver(true);
				}}
				onDragLeave={() => setIsDragOver(false)}
				onDrop={handleDrop}
			>
				<div
					ref={scrollRef}
					className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-none"
					style={theme ? { backgroundColor: bgColor } : undefined}
				>
					<VirtualizedMessages
						messages={messages}
						expandedTools={expandedTools}
						toggleTool={toggleTool}
						bubbleTheme={bubbleTheme}
						checkpoints={checkpoints}
						revertCheckpoint={revertCheckpoint}
						isLoading={isLoading}
						handleSendMessage={handleSendMessage}
						fgDim={fgDim}
						theme={theme}
					/>
				</div>

				{/* Status indicator bar */}
				{status !== "idle" &&
					(() => {
						const statusInfo = getStatusInfo(status);
						const statusColor = theme ? cursorColor : undefined;
						const iconProps = {
							size: 13,
							className: `shrink-0 ${theme ? "" : statusInfo.iconColor} ${statusInfo.isActive ? "animate-pulse" : ""}`,
							...(theme ? { style: { color: statusColor } } : {}),
						};
						const StatusIconEl = () => {
							switch (statusInfo.iconType) {
								case "sparkles":
									return <IconSparkles {...iconProps} />;
								case "message":
									return <IconMessageCircle {...iconProps} />;
								case "alert":
									return <IconAlertTriangle {...iconProps} />;
								case "wrench":
									return <IconWrench {...iconProps} />;
								case "terminal":
									return <IconTerminal {...iconProps} />;
								case "circle":
								default:
									return <IconCircle {...iconProps} />;
							}
						};
						return (
							<div
								className="shrink-0 px-3 py-1.5 flex items-center gap-2"
								style={{
									borderTop: `1px solid ${theme ? borderColor : "var(--color-surgent-border)"}`,
									backgroundColor: theme ? bgColor : "var(--color-surgent-bg)",
								}}
							>
								<StatusIconEl />
								<span
									className={`text-[10px] font-medium ${theme ? "" : statusInfo.textColor}`}
									style={theme ? { color: statusColor } : undefined}
								>
									{statusInfo.toolName ? (
										<>
											Running{" "}
											<span className="font-mono">{statusInfo.toolName}</span>
										</>
									) : (
										statusInfo.label
									)}
								</span>
								<span className="flex-1" />
								{elapsedTime > 0 && (
									<span
										className="text-[9px] tabular-nums"
										style={{
											color: theme ? fgDim : "var(--color-surgent-text-3)",
										}}
									>
										{formatElapsedTime(elapsedTime)}
									</span>
								)}
								{queuedMessages.length > 0 && (
									<span
										className="px-1.5 py-0.5 rounded text-[9px] font-medium tabular-nums"
										style={{
											backgroundColor: theme
												? cursorColor + "20"
												: "rgba(0,122,255,0.15)",
											color: theme
												? cursorColor
												: "var(--color-surgent-accent)",
										}}
									>
										{queuedMessages.length} queued
									</span>
								)}
								{isLoading && (
									<button
										onClick={stopGeneration}
										className="px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors bg-red-500/20 text-red-400 hover:bg-red-500/30"
									>
										Stop
									</button>
								)}
							</div>
						);
					})()}

				{/* Queued messages panel */}
				{queuedMessages.length > 0 && (
					<div
						className="shrink-0 overflow-y-auto"
						style={{
							maxHeight: "140px",
							borderTop: `1px solid ${theme ? borderColor : "var(--color-surgent-border)"}`,
							backgroundColor: theme ? bgColor + "cc" : "rgba(0,0,0,0.4)",
						}}
					>
						<div
							className="px-3 py-1 text-[9px] font-semibold tracking-wide uppercase"
							style={{
								color: theme ? fgDim : "var(--color-surgent-text-3)",
								borderBottom: `1px solid ${theme ? borderColor + "60" : "rgba(255,255,255,0.06)"}`,
							}}
						>
							Queued messages
						</div>
						{queuedMessages.map((qm, idx) => (
							<div
								key={qm.id}
								className="group flex items-start gap-2 px-3 py-1.5 transition-colors"
								style={{
									borderBottom:
										idx < queuedMessages.length - 1
											? `1px solid ${theme ? borderColor + "40" : "rgba(255,255,255,0.04)"}`
											: undefined,
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.backgroundColor = theme
										? cursorColor + "08"
										: "rgba(255,255,255,0.03)";
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.backgroundColor = "transparent";
								}}
							>
								<span
									className="shrink-0 mt-0.5 text-[9px] font-mono tabular-nums"
									style={{
										color: theme ? fgDim : "var(--color-surgent-text-3)",
									}}
								>
									{idx + 1}
								</span>
								{editingQueueId === qm.id ? (
									<div className="flex-1 flex items-center gap-1">
										<input
											type="text"
											ref={(el) => el?.focus()}
											value={editingQueueText}
											onChange={(e) => setEditingQueueText(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter") {
													const trimmed = editingQueueText.trim();
													if (trimmed) {
														const item = queueRef.current.find(
															(q) => q.id === qm.id
														);
														if (item) {
															item.text = trimmed;
															item.displayText = trimmed;
														}
														setQueuedMessages([...queueRef.current]);
													}
													setEditingQueueId(null);
												} else if (e.key === "Escape") {
													setEditingQueueId(null);
												}
											}}
											className="flex-1 bg-transparent text-[11px] outline-none border-none px-1 py-0.5 rounded"
											style={{
												color: theme ? fgColor : "var(--color-surgent-text)",
												backgroundColor: theme
													? surfaceColor
													: "rgba(255,255,255,0.06)",
											}}
										/>
										<button
											onClick={() => {
												const trimmed = editingQueueText.trim();
												if (trimmed) {
													const item = queueRef.current.find(
														(q) => q.id === qm.id
													);
													if (item) {
														item.text = trimmed;
														item.displayText = trimmed;
													}
													setQueuedMessages([...queueRef.current]);
												}
												setEditingQueueId(null);
											}}
											className="shrink-0 p-0.5 rounded transition-colors"
											style={{
												color: theme
													? cursorColor
													: "var(--color-surgent-accent)",
											}}
											title="Save"
										>
											<IconCheck size={11} />
										</button>
										<button
											onClick={() => setEditingQueueId(null)}
											className="shrink-0 p-0.5 rounded transition-colors"
											style={{
												color: theme ? fgDim : "var(--color-surgent-text-3)",
											}}
											title="Cancel"
										>
											<IconX size={11} />
										</button>
									</div>
								) : (
									<>
										<span
											className="flex-1 text-[11px] truncate"
											style={{
												color: theme ? fgColor : "var(--color-surgent-text)",
											}}
										>
											{qm.displayText}
										</span>
										<div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
											<button
												onClick={() => {
													setEditingQueueId(qm.id);
													setEditingQueueText(qm.text);
												}}
												className="p-0.5 rounded transition-colors hover:bg-white/10"
												style={{
													color: theme ? fgDim : "var(--color-surgent-text-3)",
												}}
												title="Edit"
											>
												<IconPencil size={11} />
											</button>
											<button
												onClick={() => {
													queueRef.current = queueRef.current.filter(
														(q) => q.id !== qm.id
													);
													setQueuedMessages([...queueRef.current]);
													if (editingQueueId === qm.id) setEditingQueueId(null);
												}}
												className="p-0.5 rounded transition-colors hover:bg-red-500/20"
												style={{
													color: "rgb(248,113,113)",
												}}
												title="Remove from queue"
											>
												<IconTrash size={11} />
											</button>
										</div>
									</>
								)}
							</div>
						))}
					</div>
				)}

				{showInput && (
					<div
						className="shrink-0 px-3 py-2"
						style={{
							borderTop: `1px solid ${theme ? borderColor : "var(--color-surgent-border)"}`,
						}}
					>
						{/* Attached image previews */}
						{attachedImages.length > 0 && (
							<div className="flex items-center gap-2 pb-2">
								{attachedImages.map((img) => (
									<div key={img.path} className="relative group">
										<img
											src={img.previewUrl}
											alt={img.name}
											className="h-12 w-12 rounded-md object-cover"
											style={{
												border: `1px solid ${theme ? borderColor : "var(--color-surgent-border)"}`,
											}}
										/>
										<button
											onClick={() => removeAttachedImage(img.path)}
											className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"
										>
											×
										</button>
									</div>
								))}
							</div>
						)}
						<input
							type="file"
							ref={fileInputRef}
							accept="image/*"
							multiple
							className="hidden"
							onChange={async (e) => {
								for (const file of Array.from(e.target.files || [])) {
									if (file.type.startsWith("image/")) await attachImage(file);
								}
								e.target.value = "";
							}}
						/>
						<div
							className="relative flex items-end gap-1.5"
							ref={inputContainerRef}
						>
							<button
								type="button"
								onClick={() => fileInputRef.current?.click()}
								className="mb-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors"
								style={{
									color: theme ? fgDim : "var(--color-surgent-text-3)",
									backgroundColor: "transparent",
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.backgroundColor = theme
										? cursorColor + "15"
										: "rgba(255,255,255,0.06)";
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.backgroundColor = "transparent";
								}}
								title="Attach image"
							>
								<svg
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<line x1="12" y1="5" x2="12" y2="19" />
									<line x1="5" y1="12" x2="19" y2="12" />
								</svg>
							</button>
							<div className="relative flex-1">
								{/* @ file reference menu */}
								{fileMenu.show &&
									fileResults.length > 0 &&
									fileMenu.position &&
									createPortal(
										<div
											className="fixed rounded-lg border shadow-lg overflow-y-auto z-[9999]"
											style={{
												top: fileMenu.position.top,
												left: fileMenu.position.left,
												width: fileMenu.position.width,
												maxHeight: fileMenu.position.maxHeight,
												transform: "translateY(-100%) translateY(-4px)",
												backgroundColor: theme
													? surfaceColor
													: "var(--color-surgent-surface)",
												borderColor: theme
													? borderColor
													: "var(--color-surgent-border)",
											}}
										>
											<div
												className="px-3 py-1.5 text-[9px] font-semibold tracking-wide"
												style={{
													color: theme ? fgDim : "var(--color-surgent-text-3)",
													borderBottom: `1px solid ${theme ? borderColor : "var(--color-surgent-border)"}`,
												}}
											>
												FILES
												{fileMenu.query ? ` matching "${fileMenu.query}"` : ""}
											</div>
											{fileResults.map((file, idx) => (
												<button
													key={file.path}
													onClick={() => selectFile(idx)}
													onMouseEnter={() =>
														setFileMenu((prev) => ({
															...prev,
															selectedIdx: idx,
														}))
													}
													className="w-full px-3 py-1.5 text-left flex items-center gap-2 transition-colors"
													style={{
														backgroundColor:
															idx === fileMenu.selectedIdx
																? theme
																	? cursorColor + "20"
																	: "rgba(0,122,255,0.15)"
																: "transparent",
													}}
												>
													<span
														className="text-[11px] shrink-0"
														style={{
															color: theme
																? fgDim
																: "var(--color-surgent-text-3)",
														}}
													>
														{file.isDir ? "\u{1F4C1}" : "\u{1F4C4}"}
													</span>
													<span
														className="font-mono text-[11px] font-medium truncate"
														style={{
															color: theme
																? cursorColor
																: "var(--color-surgent-accent)",
														}}
													>
														{file.name}
													</span>
													<span
														className="text-[9px] truncate flex-1 text-right"
														style={{
															color: theme
																? fgDim
																: "var(--color-surgent-text-3)",
														}}
													>
														{file.path}
													</span>
												</button>
											))}
										</div>,
										document.body
									)}
								{/* / command menu */}
								{showCommands &&
									filteredCommands.length > 0 &&
									menuPosition &&
									createPortal(
										<div
											className="fixed rounded-lg border shadow-lg overflow-y-auto z-[9999]"
											style={{
												top: menuPosition.top,
												left: menuPosition.left,
												width: menuPosition.width,
												maxHeight: menuPosition.maxHeight,
												transform: "translateY(-100%) translateY(-4px)",
												backgroundColor: theme
													? surfaceColor
													: "var(--color-surgent-surface)",
												borderColor: theme
													? borderColor
													: "var(--color-surgent-border)",
											}}
										>
											{filteredCommands.map((cmd, idx) => (
												<button
													key={cmd.id || cmd.name}
													onClick={() => selectCommand(idx)}
													onMouseEnter={() =>
														setCommandMenu((prev) => ({
															...prev,
															selectedIdx: idx,
														}))
													}
													className="w-full px-3 py-1.5 text-left flex items-center gap-2 transition-colors"
													style={{
														backgroundColor:
															idx === selectedCommandIdx
																? theme
																	? cursorColor + "20"
																	: "rgba(0,122,255,0.15)"
																: "transparent",
													}}
												>
													<span
														className="font-mono text-[11px] font-medium shrink-0"
														style={{
															color: theme
																? cursorColor
																: "var(--color-surgent-accent)",
														}}
													>
														/{cmd.name}
													</span>
													<span
														className="text-[10px] truncate flex-1"
														style={{
															color: theme
																? fgDim
																: "var(--color-surgent-text-3)",
														}}
													>
														{cmd.description}
													</span>
													{cmd.isLocalCommand && (
														<span
															className="text-[8px] px-1 py-0.5 rounded shrink-0"
															style={{
																backgroundColor: theme
																	? cursorColor + "15"
																	: "rgba(0,122,255,0.1)",
																color: theme
																	? cursorColor
																	: "var(--color-surgent-accent)",
															}}
														>
															claude code
														</span>
													)}
												</button>
											))}
										</div>,
										document.body
									)}
								<textarea
									ref={textareaRef}
									value={input}
									onChange={(e) => {
										const val = e.target.value;
										setInput(val);
										handleInputForFileMenu(
											val,
											e.target.selectionStart ?? val.length
										);
									}}
									onKeyDown={handleKeyDown}
									onPaste={handlePaste}
									placeholder={
										isLoading
											? "Type to queue next message..."
											: "Message... (/ commands, @ files)"
									}
									rows={1}
									aria-label="Message input"
									spellCheck
									autoCorrect="on"
									autoCapitalize="sentences"
									className={
										theme
											? "block w-full resize-none rounded-lg px-3 py-2 pr-10 text-[12px] outline-none ring-0 border-none shadow-none focus:outline-none focus:ring-0 focus:border-none focus:shadow-none transition-colors"
											: "block w-full resize-none rounded-lg bg-surgent-surface px-3 py-2 pr-10 text-[12px] text-surgent-text placeholder-surgent-text-3 outline-none ring-0 border-none shadow-none focus:outline-none focus:ring-0 focus:border-none focus:shadow-none transition-colors"
									}
									style={{
										maxHeight: "80px",
										backgroundColor: theme ? surfaceColor : undefined,
										color: theme ? fgColor : undefined,
										outline: "none",
										boxShadow: "none",
										border: "none",
										WebkitAppearance: "none",
									}}
								/>
								{isLoading && (
									<div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
										<span
											className="h-1 w-1 rounded-full animate-pulse"
											style={
												theme
													? { backgroundColor: cursorColor + "b3" }
													: undefined
											}
										/>
										<span
											className="h-1 w-1 rounded-full animate-pulse"
											style={
												theme
													? {
															backgroundColor: cursorColor + "b3",
															animationDelay: "150ms",
														}
													: { animationDelay: "150ms" }
											}
										/>
										<span
											className="h-1 w-1 rounded-full animate-pulse"
											style={
												theme
													? {
															backgroundColor: cursorColor + "b3",
															animationDelay: "300ms",
														}
													: { animationDelay: "300ms" }
											}
										/>
									</div>
								)}
							</div>
						</div>
					</div>
				)}
			</div>
		);
	}
);

// Virtualized message list — renders all messages but with smart scroll anchoring
// Uses pretext for height estimation. For conversations under 200 messages,
// renders everything (fast enough). For longer ones, only renders visible range.
const VIRTUALIZE_THRESHOLD = 200;
const MSG_OVERSCAN = 30;
const EST_MSG_HEIGHT = 48; // rough estimate per message for virtualization

function VirtualizedMessages({
	messages,
	expandedTools,
	toggleTool,
	bubbleTheme,
	checkpoints,
	revertCheckpoint,
	isLoading,
	handleSendMessage,
	fgDim,
	theme,
}: {
	messages: ChatMessage[];
	expandedTools: Set<string>;
	toggleTool: (id: string) => void;
	bubbleTheme?: BubbleTheme;
	checkpoints: any[];
	revertCheckpoint: (id: string) => void;
	isLoading: boolean;
	handleSendMessage?: (text: string) => void;
	fgDim: string;
	theme?: any;
}) {
	const renderItems = useMemo(() => buildRenderItems(messages), [messages]);

	// For short conversations, render everything normally
	if (renderItems.length < VIRTUALIZE_THRESHOLD) {
		return (
			<div className="min-w-0 px-3 py-2 space-y-2">
				{messages.length === 0 && (
					<p
						className="pt-8 text-center text-[10px]"
						style={theme ? { color: fgDim } : undefined}
					>
						Ready
					</p>
				)}
				{renderItems.map((item, idx) => {
					if (item.type === "tool-group") {
						return (
							<ToolActivityGroup
								key={`tool-group-${item.messages[0]?.id ?? idx}`}
								messages={item.messages}
								expandedTools={expandedTools}
								onToggle={toggleTool}
								theme={bubbleTheme}
							/>
						);
					}
					const msg = item.message;
					return (
						<React.Fragment key={msg.id}>
							<Bubble
								msg={msg}
								collapsed={!expandedTools.has(msg.id)}
								onToggle={toggleTool}
								theme={bubbleTheme}
								onSendMessage={handleSendMessage}
							/>
							{msg.role === "assistant" &&
								!msg.isStreaming &&
								(() => {
									const cp = checkpoints.find(
										(c) => c.afterMessageId === msg.id
									);
									if (!cp) return null;
									return (
										<CheckpointMarker
											checkpoint={cp}
											theme={bubbleTheme}
											onRevert={revertCheckpoint}
											disabled={isLoading}
										/>
									);
								})()}
						</React.Fragment>
					);
				})}
			</div>
		);
	}

	// For long conversations, virtualize — only render visible + overscan
	return (
		<VirtualizedLongMessages
			renderItems={renderItems}
			expandedTools={expandedTools}
			toggleTool={toggleTool}
			bubbleTheme={bubbleTheme}
			checkpoints={checkpoints}
			revertCheckpoint={revertCheckpoint}
			isLoading={isLoading}
			handleSendMessage={handleSendMessage}
		/>
	);
}

function VirtualizedLongMessages({
	renderItems,
	expandedTools,
	toggleTool,
	bubbleTheme,
	checkpoints,
	revertCheckpoint,
	isLoading,
	handleSendMessage,
}: {
	renderItems: RenderItem[];
	expandedTools: Set<string>;
	toggleTool: (id: string) => void;
	bubbleTheme?: BubbleTheme;
	checkpoints: any[];
	revertCheckpoint: (id: string) => void;
	isLoading: boolean;
	handleSendMessage?: (text: string) => void;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [scrollTop, setScrollTop] = useState(0);
	const [viewHeight, setViewHeight] = useState(600);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		setViewHeight(el.clientHeight);
		const obs = new ResizeObserver((entries) => {
			for (const e of entries) setViewHeight(e.contentRect.height);
		});
		obs.observe(el);
		return () => obs.disconnect();
	}, []);

	const handleScroll = useCallback(() => {
		const el = containerRef.current;
		if (el) setScrollTop(el.scrollTop);
	}, []);

	const totalHeight = renderItems.length * EST_MSG_HEIGHT;
	const startIdx = Math.max(
		0,
		Math.floor(scrollTop / EST_MSG_HEIGHT) - MSG_OVERSCAN
	);
	const endIdx = Math.min(
		renderItems.length,
		Math.ceil((scrollTop + viewHeight) / EST_MSG_HEIGHT) + MSG_OVERSCAN
	);

	return (
		<div
			ref={containerRef}
			onScroll={handleScroll}
			className="min-w-0 px-3 py-2 h-full overflow-y-auto"
		>
			<div style={{ height: totalHeight, position: "relative" }}>
				<div
					className="space-y-2"
					style={{ transform: `translateY(${startIdx * EST_MSG_HEIGHT}px)` }}
				>
					{renderItems.slice(startIdx, endIdx).map((item, i) => {
						const idx = startIdx + i;
						if (item.type === "tool-group") {
							return (
								<ToolActivityGroup
									key={`tool-group-${item.messages[0]?.id ?? idx}`}
									messages={item.messages}
									expandedTools={expandedTools}
									onToggle={toggleTool}
									theme={bubbleTheme}
								/>
							);
						}
						const msg = item.message;
						return (
							<React.Fragment key={msg.id}>
								<Bubble
									msg={msg}
									collapsed={!expandedTools.has(msg.id)}
									onToggle={toggleTool}
									theme={bubbleTheme}
									onSendMessage={handleSendMessage}
								/>
								{msg.role === "assistant" &&
									!msg.isStreaming &&
									(() => {
										const cp = checkpoints.find(
											(c) => c.afterMessageId === msg.id
										);
										if (!cp) return null;
										return (
											<CheckpointMarker
												checkpoint={cp}
												theme={bubbleTheme}
												onRevert={revertCheckpoint}
												disabled={isLoading}
											/>
										);
									})()}
							</React.Fragment>
						);
					})}
				</div>
			</div>
		</div>
	);
}

const Bubble = React.memo(function Bubble({
	msg,
	collapsed,
	onToggle,
	theme,
	onSendMessage,
}: {
	msg: ChatMessage;
	collapsed: boolean;
	onToggle: (id: string) => void;
	theme?: BubbleTheme;
	onSendMessage?: (text: string) => void;
}) {
	if (msg.role === "user") {
		// Skip rendering user message if it's a slash command (the system "Running /..." message will show instead)
		if (msg.content.match(/^\/([a-zA-Z0-9_-]+)(\s|$)/)) {
			return null;
		}

		return (
			<div className="flex justify-end">
				<div className="max-w-[85%] rounded-lg rounded-br-sm px-2.5 py-1.5">
					<p
						className="whitespace-pre-wrap break-words text-[12px]"
						style={theme ? { color: theme.fg } : undefined}
					>
						{msg.content}
					</p>
				</div>
			</div>
		);
	}

	if (msg.role === "system") {
		const runningMatch = msg.content.match(/^Running \/(.+)\.\.\.$/);
		if (runningMatch && runningMatch[1]) {
			const commandName = runningMatch[1];
			return (
				<div className="flex justify-center py-1">
					<div
						className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg"
						style={{
							backgroundColor: "rgba(0, 122, 255, 0.08)",
							border: "1px solid rgba(0, 122, 255, 0.2)",
						}}
					>
						<div className="flex items-center gap-[3px]">
							<span
								className="h-[5px] w-[5px] rounded-full bg-blue-400 animate-bounce"
								style={{ animationDuration: "0.6s" }}
							/>
							<span
								className="h-[5px] w-[5px] rounded-full bg-blue-400 animate-bounce"
								style={{ animationDuration: "0.6s", animationDelay: "0.1s" }}
							/>
							<span
								className="h-[5px] w-[5px] rounded-full bg-blue-400 animate-bounce"
								style={{ animationDuration: "0.6s", animationDelay: "0.2s" }}
							/>
						</div>
						<span className="font-mono text-[11px] font-medium text-blue-400">
							/{commandName}
						</span>
					</div>
				</div>
			);
		}

		return (
			<p
				className="text-center text-[10px]"
				style={{ color: theme ? theme.fgDim : "var(--color-surgent-text-3)" }}
			>
				{msg.content}
			</p>
		);
	}

	if (msg.role === "btw") {
		return (
			<div
				className="rounded-lg border px-3 py-2"
				style={{
					backgroundColor: "rgba(0, 122, 255, 0.06)",
					borderColor: "rgba(0, 122, 255, 0.2)",
					borderStyle: "dashed",
				}}
			>
				<div className="flex items-center gap-1.5 mb-1.5">
					<span
						className="text-[9px] font-semibold uppercase tracking-wider"
						style={{ color: "rgba(0, 122, 255, 0.7)" }}
					>
						btw
					</span>
					{msg.btwQuestion && (
						<span
							className="text-[10px] font-mono"
							style={{
								color: theme ? theme.fgDim : "var(--color-surgent-text-3)",
							}}
						>
							— {msg.btwQuestion}
						</span>
					)}
				</div>
				<div
					className="text-[12px] leading-[1.6]"
					style={theme ? { color: theme.fgMuted } : undefined}
				>
					{msg.content ? (
						<Markdown text={msg.content} theme={theme} />
					) : msg.isStreaming ? (
						<div className="flex items-center gap-[3px] py-1">
							<span
								className="h-[4px] w-[4px] rounded-full animate-bounce"
								style={{
									backgroundColor: "rgba(0, 122, 255, 0.5)",
									animationDuration: "0.6s",
								}}
							/>
							<span
								className="h-[4px] w-[4px] rounded-full animate-bounce"
								style={{
									backgroundColor: "rgba(0, 122, 255, 0.5)",
									animationDuration: "0.6s",
									animationDelay: "0.1s",
								}}
							/>
							<span
								className="h-[4px] w-[4px] rounded-full animate-bounce"
								style={{
									backgroundColor: "rgba(0, 122, 255, 0.5)",
									animationDuration: "0.6s",
									animationDelay: "0.2s",
								}}
							/>
						</div>
					) : null}
					{msg.isStreaming && msg.content && (
						<span
							className="inline-block ml-0.5 h-2.5 w-[1.5px] animate-pulse align-text-bottom"
							style={{ backgroundColor: "rgba(0, 122, 255, 0.7)" }}
						/>
					)}
				</div>
			</div>
		);
	}

	if (msg.role === "tool") {
		// AskUserQuestion gets a dedicated card renderer — always visible
		if (msg.toolName === "AskUserQuestion") {
			return (
				<AskUserQuestionCard
					content={msg.content}
					theme={theme}
					isStreaming={msg.isStreaming}
					onSendMessage={onSendMessage}
				/>
			);
		}

		return (
			<div>
				<button
					onClick={() => onToggle(msg.id)}
					className="flex items-center gap-1 text-[10px]"
					style={theme ? { color: theme.fgDim } : undefined}
				>
					<svg
						width="7"
						height="7"
						viewBox="0 0 8 8"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						className={`transition-transform ${collapsed ? "-rotate-90" : ""}`}
					>
						<path d="M2 2.5L4 5.5L6 2.5" />
					</svg>
					<span
						className="font-mono text-[9px]"
						style={theme ? { color: theme.fgDim } : undefined}
					>
						{msg.toolName}
					</span>
					{msg.isStreaming && (
						<span
							className="h-1 w-1 rounded-full animate-pulse"
							style={
								theme ? { backgroundColor: theme.cursor + "99" } : undefined
							}
						/>
					)}
				</button>
				{!collapsed && msg.content && (
					<pre
						className="mt-0.5 max-h-28 overflow-auto rounded px-2 py-1 font-mono text-[9px] leading-relaxed whitespace-pre-wrap break-all"
						style={
							theme
								? { backgroundColor: theme.surface, color: theme.fgDim }
								: undefined
						}
					>
						<ToolOutputHighlight content={msg.content} theme={theme} />
					</pre>
				)}
			</div>
		);
	}

	return (
		<div
			className="group/msg relative w-full min-w-0 break-words text-[12px] leading-[1.6]"
			style={theme ? { color: theme.fgMuted } : undefined}
		>
			<Markdown text={msg.content} theme={theme} />
			{msg.isStreaming && (
				<span
					className="inline-block ml-0.5 h-2.5 w-[1.5px] animate-pulse align-text-bottom"
					style={theme ? { backgroundColor: theme.cursor + "b3" } : undefined}
				/>
			)}
			{!msg.isStreaming && msg.content.length > 0 && (
				<div className="absolute top-0 right-0 opacity-0 group-hover/msg:opacity-100 transition-opacity">
					<CopyButton text={msg.content} theme={theme} />
				</div>
			)}
		</div>
	);
});

const ToolActivityGroup = React.memo(function ToolActivityGroup({
	messages,
	expandedTools,
	onToggle,
	theme,
}: {
	messages: ChatMessage[];
	expandedTools: Set<string>;
	onToggle: (id: string) => void;
	theme?: BubbleTheme;
}) {
	const activeCount = messages.filter((msg) => msg.isStreaming).length;
	const toolCounts = new Map<string, number>();
	for (const msg of messages) {
		if (!msg.toolName) continue;
		toolCounts.set(msg.toolName, (toolCounts.get(msg.toolName) ?? 0) + 1);
	}
	const summary = Array.from(toolCounts.entries())
		.slice(0, 4)
		.map(([name, count]) => `${name}${count > 1 ? ` x${count}` : ""}`)
		.join(", ");

	return (
		<div
			className="w-full overflow-hidden rounded-xl border"
			style={{
				borderColor: theme?.border ?? "rgba(255,255,255,0.08)",
				backgroundColor: theme?.bg ?? "transparent",
			}}
		>
			<div
				className="flex items-start justify-between gap-3 px-3 py-2"
				style={{
					borderBottom: `1px solid ${theme?.border ?? "rgba(255,255,255,0.08)"}`,
					backgroundColor: theme?.surface ?? "rgba(255,255,255,0.02)",
				}}
			>
				<div className="min-w-0">
					<div
						className="text-[10px] font-medium"
						style={{ color: theme?.fg ?? "var(--color-surgent-text)" }}
					>
						Tool Activity
					</div>
					{summary && (
						<div
							className="mt-0.5 truncate text-[10px]"
							style={{ color: theme?.fgDim ?? "var(--color-surgent-text-3)" }}
						>
							{summary}
						</div>
					)}
				</div>
				<div className="shrink-0 flex items-center gap-2">
					{activeCount > 0 && (
						<span
							className="inline-flex items-center gap-1 text-[9px] font-medium"
							style={{ color: theme?.cursor ?? "var(--color-surgent-accent)" }}
						>
							<span
								className="h-1.5 w-1.5 rounded-full animate-pulse"
								style={{
									backgroundColor:
										theme?.cursor ?? "var(--color-surgent-accent)",
								}}
							/>
							Running
						</span>
					)}
					<span
						className="rounded-full px-2 py-0.5 text-[9px] font-medium tabular-nums"
						style={{
							backgroundColor: theme?.bg ?? "rgba(255,255,255,0.04)",
							color: theme?.fgDim ?? "var(--color-surgent-text-3)",
							border: `1px solid ${theme?.border ?? "rgba(255,255,255,0.08)"}`,
						}}
					>
						{messages.length} steps
					</span>
				</div>
			</div>
			<div className="overflow-x-auto">
				<table className="w-full border-collapse text-[10px]">
					<tbody>
						{messages.map((msg, index) => {
							const expanded = expandedTools.has(msg.id);
							return (
								<React.Fragment key={msg.id}>
									<tr
										className="cursor-pointer"
										onClick={() => onToggle(msg.id)}
										style={{
											backgroundColor: expanded
												? (theme?.surface ?? "rgba(255,255,255,0.02)")
												: "transparent",
											borderBottom:
												index < messages.length - 1 || expanded
													? `1px solid ${theme?.border ?? "rgba(255,255,255,0.06)"}`
													: "none",
										}}
									>
										<td className="w-6 px-2 py-1.5 align-top">
											<svg
												width="7"
												height="7"
												viewBox="0 0 8 8"
												fill="none"
												stroke="currentColor"
												strokeWidth="1.5"
												className={`transition-transform ${expanded ? "" : "-rotate-90"}`}
												style={{
													color: theme?.fgDim ?? "var(--color-surgent-text-3)",
												}}
											>
												<path d="M2 2.5L4 5.5L6 2.5" />
											</svg>
										</td>
										<td
											className="px-2 py-1.5 align-top"
											style={{
												color: theme?.fg ?? "var(--color-surgent-text)",
											}}
										>
											<div className="font-medium">{msg.toolName}</div>
										</td>
										<td
											className="w-16 px-2 py-1.5 align-top text-right"
											style={{
												color: theme?.fgDim ?? "var(--color-surgent-text-3)",
											}}
										>
											{msg.isStreaming ? (
												<span
													className="inline-flex items-center gap-1"
													style={{
														color:
															theme?.cursor ?? "var(--color-surgent-accent)",
													}}
												>
													<span
														className="h-1.5 w-1.5 rounded-full animate-pulse"
														style={{
															backgroundColor:
																theme?.cursor ?? "var(--color-surgent-accent)",
														}}
													/>
													Live
												</span>
											) : (
												"Done"
											)}
										</td>
									</tr>
									{expanded && msg.content && (
										<tr>
											<td colSpan={3} className="px-2 pb-2 pt-0">
												<pre
													className="mt-1 max-h-32 overflow-auto rounded-lg border px-3 py-2 font-mono text-[9px] leading-relaxed whitespace-pre-wrap break-all"
													style={{
														backgroundColor:
															theme?.surface ?? "rgba(255,255,255,0.03)",
														borderColor:
															theme?.border ?? "rgba(255,255,255,0.08)",
														color:
															theme?.fgDim ?? "var(--color-surgent-text-3)",
													}}
												>
													<ToolOutputHighlight
														content={msg.content}
														theme={theme}
													/>
												</pre>
											</td>
										</tr>
									)}
								</React.Fragment>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
});

function Markdown({ text, theme }: { text: string; theme?: BubbleTheme }) {
	const blocks = useMemo(() => parseBlocks(text), [text]);
	return (
		<div className="min-w-0 space-y-1 break-words">
			{blocks.map((b, i) => {
				const blockKey = `${b.type}-${i}`;
				if (b.type === "code") {
					return (
						<div key={blockKey} className="group/code relative">
							<pre
								className="overflow-x-auto rounded border px-2 py-1.5 font-mono text-[10px] leading-relaxed"
								style={
									theme
										? {
												backgroundColor: theme.surface,
												borderColor: theme.border,
												color: theme.fgMuted,
											}
										: undefined
								}
							>
								{b.content}
							</pre>
							<div className="absolute top-1 right-1 opacity-0 group-hover/code:opacity-100 transition-opacity">
								<CopyButton text={b.content} theme={theme} />
							</div>
						</div>
					);
				}
				if (b.type === "heading")
					return (
						<p
							key={blockKey}
							className="font-medium text-[11px]"
							style={theme ? { color: theme.fg } : undefined}
						>
							{b.content}
						</p>
					);
				if (b.type === "list-item") {
					return (
						<div key={blockKey} className="flex gap-1 pl-0.5 text-[12px]">
							<span
								className="shrink-0 select-none"
								style={theme ? { color: theme.fgDim } : undefined}
							>
								{b.bullet}
							</span>
							<span className="min-w-0">
								<Inline text={b.content} theme={theme} />
							</span>
						</div>
					);
				}
				if (b.type === "table") {
					return (
						<div
							key={blockKey}
							className="overflow-x-auto rounded border text-[10px]"
							style={{
								borderColor: theme?.border ?? "rgba(255,255,255,0.1)",
								backgroundColor: theme?.surface ?? "rgba(255,255,255,0.03)",
							}}
						>
							<table className="w-full border-collapse">
								<thead>
									<tr>
										{b.headers.map((h, hi) => (
											<th
												key={hi}
												className="px-2 py-1 text-left font-semibold whitespace-nowrap"
												style={{
													borderBottom: `1px solid ${theme?.border ?? "rgba(255,255,255,0.12)"}`,
													color: theme?.fg ?? "#e5e5e5",
												}}
											>
												{h}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{b.rows.map((row, ri) => (
										<tr key={ri}>
											{row.map((cell, ci) => (
												<td
													key={ci}
													className="px-2 py-1 whitespace-pre-wrap"
													style={{
														borderBottom:
															ri < b.rows.length - 1
																? `1px solid ${theme?.border ?? "rgba(255,255,255,0.06)"}`
																: "none",
														color: theme?.fg ?? "#e5e5e5",
													}}
												>
													<Inline text={cell} theme={theme} />
												</td>
											))}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					);
				}
				return (
					<p key={blockKey}>
						<Inline text={b.content} theme={theme} />
					</p>
				);
			})}
		</div>
	);
}

type Block =
	| { type: "paragraph"; content: string }
	| { type: "code"; content: string }
	| { type: "heading"; content: string; level: number }
	| { type: "list-item"; content: string; bullet: string }
	| { type: "table"; headers: string[]; rows: string[][] };

function parseBlocks(text: string): Block[] {
	const blocks: Block[] = [];
	const lines = text.split("\n");
	let i = 0;
	while (i < lines.length) {
		const line = lines[i]!;
		if (line.trimStart().startsWith("```")) {
			const code: string[] = [];
			i++;
			while (i < lines.length && !lines[i]!.trimStart().startsWith("```")) {
				code.push(lines[i]!);
				i++;
			}
			i++;
			blocks.push({ type: "code", content: code.join("\n") });
			continue;
		}
		const hm = line.match(/^(#{1,4})\s+(.+)/);
		if (hm) {
			blocks.push({ type: "heading", content: hm[2]!, level: hm[1]!.length });
			i++;
			continue;
		}
		const lm = line.match(/^(\s*(?:[-*]|\d+\.)\s+)(.+)/);
		if (lm) {
			blocks.push({
				type: "list-item",
				content: lm[2]!,
				bullet: lm[1]!.trim(),
			});
			i++;
			continue;
		}
		// Markdown table: detect rows starting with |
		if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
			const tableLines: string[] = [line];
			i++;
			while (
				i < lines.length &&
				lines[i]!.trim().startsWith("|") &&
				lines[i]!.trim().endsWith("|")
			) {
				tableLines.push(lines[i]!);
				i++;
			}
			if (tableLines.length >= 2) {
				const parseCells = (row: string) =>
					row
						.split("|")
						.slice(1, -1)
						.map((c) => c.trim());
				const headers = parseCells(tableLines[0]!);
				// Skip separator row (e.g. |---|---|)
				const startRow = tableLines[1]!.trim().match(/^\|[\s:?-]+\|/) ? 2 : 1;
				const rows = tableLines.slice(startRow).map(parseCells);
				blocks.push({ type: "table", headers, rows });
			} else {
				blocks.push({ type: "paragraph", content: tableLines.join("\n") });
			}
			continue;
		}
		if (!line.trim()) {
			i++;
			continue;
		}
		const p: string[] = [line];
		i++;
		while (
			i < lines.length &&
			lines[i]!.trim() &&
			!lines[i]!.trimStart().startsWith("```") &&
			!lines[i]!.match(/^#{1,4}\s+/) &&
			!lines[i]!.match(/^\s*(?:[-*]|\d+\.)\s+/)
		) {
			p.push(lines[i]!);
			i++;
		}
		blocks.push({ type: "paragraph", content: p.join("\n") });
	}
	return blocks;
}

// ---------------------------------------------------------------------------
// AskUserQuestion — rich card for Claude's multi-choice questions
// ---------------------------------------------------------------------------

function AskUserQuestionCard({
	content,
	theme,
	isStreaming,
	onSendMessage,
}: {
	content: string;
	theme?: BubbleTheme;
	isStreaming?: boolean;
	onSendMessage?: (text: string) => void;
}) {
	const parsed = useMemo(() => {
		try {
			const data = JSON.parse(content);
			if (data.questions && Array.isArray(data.questions))
				return data.questions as Array<{
					question: string;
					header?: string;
					options?: Array<{ label: string; description?: string }>;
					multiSelect?: boolean;
				}>;
		} catch {}
		return null;
	}, [content]);

	// selections[questionIndex] = Set of selected option indices
	const [selections, setSelections] = useState<Map<number, Set<number>>>(
		new Map()
	);
	const [submitted, setSubmitted] = useState(false);

	const accentColor = theme?.cursor ?? "#007AFF";
	const surfaceBg = theme?.surface ?? "rgba(255,255,255,0.04)";
	const borderClr = theme?.border ?? "rgba(255,255,255,0.08)";
	const fgColor = theme?.fg ?? "#e5e5e5";
	const fgMuted = theme?.fgMuted ?? "#e5e5e588";
	const fgDim = theme?.fgDim ?? "#e5e5e555";

	const toggleOption = useCallback(
		(qi: number, oi: number, multiSelect: boolean) => {
			if (submitted) return;
			setSelections((prev) => {
				const next = new Map(prev);
				const current = new Set(prev.get(qi) ?? []);
				if (multiSelect) {
					current.has(oi) ? current.delete(oi) : current.add(oi);
				} else {
					// Single select — replace
					current.clear();
					current.add(oi);
				}
				next.set(qi, current);
				return next;
			});
		},
		[submitted]
	);

	const hasSelections = useMemo(() => {
		if (!parsed) return false;
		return parsed.every((_, qi) => {
			const sel = selections.get(qi);
			return sel && sel.size > 0;
		});
	}, [parsed, selections]);

	const handleSubmit = useCallback(() => {
		if (!parsed || !onSendMessage || submitted) return;
		setSubmitted(true);

		// Format selections as a readable answer
		const parts: string[] = [];
		for (let qi = 0; qi < parsed.length; qi++) {
			const q = parsed[qi]!;
			const sel = selections.get(qi);
			if (!sel || sel.size === 0) continue;
			const labels = Array.from(sel)
				.sort()
				.map((oi) => q.options?.[oi]?.label)
				.filter(Boolean);
			if (q.header) {
				parts.push(`**${q.header}**: ${labels.join(", ")}`);
			} else {
				parts.push(labels.join(", "));
			}
		}
		onSendMessage(parts.join("\n"));
	}, [parsed, selections, onSendMessage, submitted]);

	// Fallback: if we can't parse the JSON, show raw content nicely
	if (!parsed) {
		return (
			<pre
				className="mt-0.5 max-h-40 overflow-auto rounded-lg px-3 py-2 font-mono text-[9px] leading-relaxed whitespace-pre-wrap break-all"
				style={{
					backgroundColor: surfaceBg,
					color: fgDim,
					border: `1px solid ${borderClr}`,
				}}
			>
				{content}
			</pre>
		);
	}

	return (
		<div className="space-y-2 py-1">
			{parsed.map((q, qi) => {
				const qSelections = selections.get(qi) ?? new Set<number>();
				return (
					<div
						key={qi}
						className="rounded-lg overflow-hidden"
						style={{
							backgroundColor: surfaceBg,
							border: `1px solid ${borderClr}`,
						}}
					>
						{/* Header bar */}
						<div
							className="flex items-center gap-2 px-3 py-1.5"
							style={{ borderBottom: `1px solid ${borderClr}` }}
						>
							<svg
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke={accentColor}
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<circle cx="12" cy="12" r="10" />
								<path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
								<line x1="12" y1="17" x2="12.01" y2="17" />
							</svg>
							{q.header && (
								<span
									className="rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider"
									style={{
										backgroundColor: accentColor + "18",
										color: accentColor,
									}}
								>
									{q.header}
								</span>
							)}
							{q.multiSelect && (
								<span
									className="text-[8px] uppercase tracking-wider"
									style={{ color: fgDim }}
								>
									multi-select
								</span>
							)}
							{isStreaming && (
								<span
									className="ml-auto h-1.5 w-1.5 rounded-full animate-pulse"
									style={{ backgroundColor: accentColor }}
								/>
							)}
						</div>

						{/* Question text */}
						<div className="px-3 pt-2 pb-1.5">
							<p
								className="text-[11px] font-medium leading-snug"
								style={{ color: fgColor }}
							>
								{q.question}
							</p>
						</div>

						{/* Options */}
						{q.options && q.options.length > 0 && (
							<div className="px-3 pb-2.5 space-y-1">
								{q.options.map((opt, oi) => {
									const isSelected = qSelections.has(oi);
									return (
										<button
											key={oi}
											onClick={() => toggleOption(qi, oi, !!q.multiSelect)}
											disabled={submitted}
											className="flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-left transition-all"
											style={{
												backgroundColor: isSelected
													? accentColor + "18"
													: theme
														? theme.bg + "80"
														: "rgba(0,0,0,0.15)",
												border: `1px solid ${isSelected ? accentColor + "50" : borderClr}`,
												cursor: submitted ? "default" : "pointer",
												opacity: submitted && !isSelected ? 0.4 : 1,
											}}
										>
											<span
												className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold transition-colors"
												style={{
													backgroundColor: isSelected
														? accentColor
														: accentColor + "20",
													color: isSelected ? "#fff" : accentColor,
												}}
											>
												{isSelected ? (
													<svg
														width="8"
														height="8"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														strokeWidth="3"
														strokeLinecap="round"
														strokeLinejoin="round"
													>
														<path d="M20 6L9 17l-5-5" />
													</svg>
												) : (
													String.fromCharCode(65 + oi)
												)}
											</span>
											<div className="min-w-0">
												<span
													className="text-[11px] font-medium"
													style={{ color: isSelected ? fgColor : fgColor }}
												>
													{opt.label}
												</span>
												{opt.description && (
													<p
														className="text-[9px] leading-snug mt-0.5"
														style={{ color: fgMuted }}
													>
														{opt.description}
													</p>
												)}
											</div>
										</button>
									);
								})}
							</div>
						)}
					</div>
				);
			})}

			{/* Submit button */}
			{!submitted && !isStreaming && onSendMessage && (
				<button
					onClick={handleSubmit}
					disabled={!hasSelections}
					className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition-all"
					style={{
						backgroundColor: hasSelections ? accentColor : accentColor + "30",
						color: hasSelections ? "#fff" : fgDim,
						cursor: hasSelections ? "pointer" : "not-allowed",
						opacity: hasSelections ? 1 : 0.6,
					}}
				>
					<svg
						width="10"
						height="10"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<line x1="22" y1="2" x2="11" y2="13" />
						<polygon points="22 2 15 22 11 13 2 9 22 2" />
					</svg>
					Send selections
				</button>
			)}

			{/* Submitted confirmation */}
			{submitted && (
				<div
					className="flex items-center gap-1.5 text-[9px]"
					style={{ color: fgDim }}
				>
					<svg
						width="10"
						height="10"
						viewBox="0 0 24 24"
						fill="none"
						stroke={accentColor}
						strokeWidth="2.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M20 6L9 17l-5-5" />
					</svg>
					Selections sent
				</div>
			)}
		</div>
	);
}

function ToolOutputHighlight({
	content,
	theme,
}: {
	content: string;
	theme?: BubbleTheme;
}) {
	const accentStyle = { color: theme?.cursor ?? "#007AFF" };
	try {
		if (content.trim().startsWith("{")) {
			const parsed = JSON.parse(content);
			const fileName = parsed.file_path
				? parsed.file_path.split("/").pop() || parsed.file_path
				: undefined;

			if (parsed.file_path && parsed.new_string !== undefined) {
				return (
					<>
						<span style={{ color: theme?.fgDim ?? "#666" }}>{fileName}</span>
						{"\n"}
						<span style={accentStyle}>{parsed.new_string}</span>
					</>
				);
			}

			if (parsed.command) {
				return <span style={accentStyle}>$ {parsed.command}</span>;
			}

			if (parsed.pattern) {
				return <span style={accentStyle}>/{parsed.pattern}/</span>;
			}

			if (parsed.file_path && parsed.content) {
				const preview =
					parsed.content.length > 300
						? parsed.content.slice(0, 300) + "..."
						: parsed.content;
				return (
					<>
						<span style={{ color: theme?.fgDim ?? "#666" }}>{fileName}</span>
						{"\n"}
						<span style={accentStyle}>{preview}</span>
					</>
				);
			}

			// Read, Glob, or any tool with just a file_path
			if (parsed.file_path) {
				return <span style={accentStyle}>{fileName}</span>;
			}

			// Glob pattern
			if (parsed.glob || parsed.include) {
				return <span style={accentStyle}>{parsed.glob || parsed.include}</span>;
			}

			// URL-based tools (WebFetch, etc.)
			if (parsed.url) {
				return (
					<a
						href={parsed.url}
						target="_blank"
						rel="noopener noreferrer"
						className="underline decoration-current/30 hover:decoration-current/60"
						style={accentStyle}
					>
						{parsed.url}
					</a>
				);
			}

			// Query-based tools (WebSearch, etc.)
			if (parsed.query) {
				return <span style={accentStyle}>{parsed.query}</span>;
			}
		}
	} catch {}

	return <>{content}</>;
}

// ---------------------------------------------------------------------------
// Copy button — appears on hover over assistant messages
// ---------------------------------------------------------------------------

function CopyButton({
	text,
	theme,
	className,
}: {
	text: string;
	theme?: BubbleTheme;
	className?: string;
}) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(() => {
		navigator.clipboard
			.writeText(text)
			.then(() => {
				setCopied(true);
				setTimeout(() => setCopied(false), 1500);
			})
			.catch(() => {});
	}, [text]);

	return (
		<button
			onClick={handleCopy}
			className={`flex items-center justify-center h-5 w-5 rounded transition-colors ${className ?? ""}`}
			style={{
				backgroundColor: theme ? theme.surface : "var(--color-surgent-surface)",
				color: copied
					? "#22c55e"
					: theme
						? theme.fgDim
						: "var(--color-surgent-text-3)",
			}}
			title={copied ? "Copied!" : "Copy"}
		>
			{copied ? (
				<svg
					width="10"
					height="10"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="M20 6L9 17l-5-5" />
				</svg>
			) : (
				<svg
					width="10"
					height="10"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
					<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
				</svg>
			)}
		</button>
	);
}

// ---------------------------------------------------------------------------
// Checkpoint marker — shown between message bubbles after each Claude turn
// ---------------------------------------------------------------------------

function CheckpointMarker({
	checkpoint,
	theme,
	onRevert,
	disabled,
}: {
	checkpoint: CheckpointInfo;
	theme?: BubbleTheme;
	onRevert: (id: string) => void;
	disabled?: boolean;
}) {
	const [expanded, setExpanded] = useState(false);
	const accentColor = theme?.cursor ?? "#3b82f6";
	const revertedColor = "#ef4444";
	const baseColor = checkpoint.reverted ? revertedColor : accentColor;

	return (
		<div
			className="rounded my-1"
			style={{
				backgroundColor: baseColor + "08",
				borderLeft: `2px solid ${baseColor + "40"}`,
			}}
		>
			<div className="flex items-center gap-2 px-2 py-1">
				{/* Clock icon */}
				<svg
					width="11"
					height="11"
					viewBox="0 0 24 24"
					fill="none"
					stroke={baseColor + "80"}
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<circle cx="12" cy="12" r="10" />
					<path d="M12 6v6l4 2" />
				</svg>

				{/* File count badge (clickable to expand) */}
				<button
					onClick={() => setExpanded(!expanded)}
					className="text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors"
					style={{
						backgroundColor: accentColor + "15",
						color: accentColor,
					}}
				>
					{checkpoint.changedFileCount} file
					{checkpoint.changedFileCount !== 1 ? "s" : ""} changed
				</button>

				<span className="flex-1" />

				{/* Revert / reverted state */}
				{!checkpoint.reverted ? (
					<button
						onClick={() => onRevert(checkpoint.id)}
						disabled={disabled}
						className="text-[9px] px-2 py-0.5 rounded font-medium transition-colors disabled:opacity-40"
						style={{
							backgroundColor: revertedColor + "15",
							color: revertedColor,
						}}
					>
						Undo
					</button>
				) : (
					<span
						className="text-[9px] italic"
						style={{ color: theme?.fgDim ?? "var(--color-surgent-text-3)" }}
					>
						reverted
					</span>
				)}
			</div>

			{/* Expanded file list */}
			{expanded && (
				<div className="pb-1.5 px-2 ml-4 space-y-0.5">
					{checkpoint.changedFiles.map((f) => (
						<div
							key={f.path}
							className="flex items-center gap-1.5 text-[9px] font-mono"
						>
							<span
								style={{
									color:
										f.action === "created"
											? "#22c55e"
											: f.action === "deleted"
												? "#ef4444"
												: "#eab308",
								}}
							>
								{f.action === "created"
									? "+"
									: f.action === "deleted"
										? "-"
										: "~"}
							</span>
							<span
								style={{ color: theme?.fgDim ?? "var(--color-surgent-text-3)" }}
							>
								{f.path.split("/").pop()}
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function Inline({ text, theme }: { text: string; theme?: BubbleTheme }) {
	const parts = useMemo(
		() =>
			text.split(
				/(`[^`\n]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)<>]+)/g
			),
		[text]
	);
	const linkStyle = theme ? { color: theme.cursor + "cc" } : undefined;
	return (
		<>
			{parts.map((p, i) => {
				const partKey = `${i}-${p.slice(0, 12)}`;
				if (p.startsWith("`") && p.endsWith("`") && p.length > 2) {
					const cs = theme
						? { backgroundColor: theme.surface, color: theme.cursor + "cc" }
						: undefined;
					return (
						<code
							key={partKey}
							className="rounded px-0.5 font-mono text-[10px]"
							style={cs}
						>
							{p.slice(1, -1)}
						</code>
					);
				}
				if (p.startsWith("**") && p.endsWith("**"))
					return (
						<strong
							key={partKey}
							className="font-medium"
							style={theme ? { color: theme.fg } : undefined}
						>
							{p.slice(2, -2)}
						</strong>
					);
				if (p.startsWith("*") && p.endsWith("*") && !p.startsWith("**"))
					return (
						<em
							key={partKey}
							style={theme ? { color: theme.fgMuted } : undefined}
						>
							{p.slice(1, -1)}
						</em>
					);
				const lm = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
				if (lm)
					return (
						<a
							key={partKey}
							href={lm[2]}
							target="_blank"
							rel="noopener noreferrer"
							className="hover:underline"
							style={linkStyle}
						>
							{lm[1]}
						</a>
					);
				if (/^https?:\/\//.test(p))
					return (
						<a
							key={partKey}
							href={p}
							target="_blank"
							rel="noopener noreferrer"
							className="underline decoration-current/30 hover:decoration-current/60"
							style={linkStyle}
						>
							{p}
						</a>
					);
				return <React.Fragment key={partKey}>{p}</React.Fragment>;
			})}
		</>
	);
}
