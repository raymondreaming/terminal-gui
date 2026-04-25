import React, {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import { usePrompts } from "../../hooks/usePrompts.ts";
import { useGitStatus } from "../../hooks/useGitStatus.ts";
import { getAgentDefinition } from "../../lib/agents.ts";
import { measureTextareaHeight } from "../../lib/pretext-utils.ts";
import {
	type AgentKind,
	changePaneAgentKind,
	getStatusInfo,
} from "../../lib/terminal-utils.ts";
import { wsClient } from "../../lib/websocket.ts";
import { ChatComposer } from "./ChatComposer.tsx";
import { ChatMessageList } from "./ChatMessageList.tsx";
import {
	applyInlineCompletion,
	getCommandDisplayText,
	getCommandPrompt,
	expandInlineCommandPrompts,
} from "./chat-command-utils.ts";
import {
	extractToolActivities,
	findTriggerAtCursor,
	getStatusToolName,
	type ToolActivity,
} from "./chat-agent-utils.ts";
import {
	appendMessageContent,
	mergeSyncedMessages,
	patchMessageById,
} from "./chat-state-utils.ts";
import {
	clearAgentChatMessages,
	clearStoredCheckpoints,
	clearStoredSessionId,
	loadStoredCheckpoints,
	loadStoredInput,
	loadStoredMessages,
	loadStoredSessionId,
	saveStoredCheckpoints,
	saveStoredInput,
	saveStoredMessages,
	saveStoredSessionId,
} from "./chat-session-store.ts";
import {
	IconAlertTriangle,
	IconArrowDown,
	IconCircle,
	IconEye,
	IconFilePlus,
	IconGitBranch,
	IconGlobe,
	IconMessageCircle,
	IconPencil,
	IconSearch,
	IconSparkles,
	IconStop,
	IconTerminal,
	IconWrench,
	IconX,
} from "../ui/Icons.tsx";
import { getAgentIcon } from "../../lib/agent-ui.tsx";
import { DropdownButton } from "../ui/DropdownButton.tsx";

interface QueuedMessage {
	id: string;
	text: string;
	displayText: string;
	images?: string[];
}

let queueIdCounter = 0;

interface TerminalTheme {
	bg: string;
	fg: string;
	cursor: string;
}

export interface AgentChatSession {
	paneId: string;
	cwd?: string;
	agentKind: AgentKind;
}

interface AgentChatViewProps {
	paneId: string;
	cwd?: string;
	showInput?: boolean;
	theme?: TerminalTheme;
	agentKind?: AgentKind;
	onStatusChange?: (paneId: string, status: string) => void;
	hideHeader?: boolean;
	onClose?: (paneId: string) => void;
	isSelected?: boolean;
	draggable?: boolean;
	onDragStart?: (e: React.DragEvent) => void;
	onDragEnd?: () => void;
	sessions?: AgentChatSession[];
	onSelectSession?: (paneId: string) => void;
}

export interface QueuedMessageInfo {
	id: string;
	text: string;
	displayText: string;
	images?: string[];
}

export interface AttachedImageInfo {
	name: string;
	path: string;
	previewUrl: string;
}

export interface AgentChatHandle {
	sendMessage: (text: string) => void;
	sendMessageWithImages: (text: string, images?: string[]) => void;
	getStatus: () => string;
	focusInput: (atEnd?: boolean) => void;
	getToolActivities: () => ToolActivity[];
	getQueuedCount: () => number;
	getQueuedMessages: () => QueuedMessageInfo[];
	removeQueuedMessage: (id: string) => void;
	updateQueuedMessage: (id: string, text: string) => void;
	stopGeneration: () => void;
	isLoading: () => boolean;
	getAttachedImages: () => AttachedImageInfo[];
	attachImageFile: (file: File) => Promise<void>;
	removeAttachedImage: (path: string) => void;
}

interface ChatMessage {
	id: string;
	role: "user" | "assistant" | "tool" | "system" | "btw";
	content: string;
	toolName?: string;
	isStreaming?: boolean;
	btwQuestion?: string;
	/** Image paths attached to user messages */
	images?: string[];
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

const MAX_MESSAGES = 80;
const MAX_TOTAL_CHARS = 150000;

let msgId = 0;
function nextId() {
	return `c${++msgId}-${Date.now().toString(36)}`;
}
function trimMessages(msgs: ChatMessage[]): ChatMessage[] {
	if (msgs.length <= MAX_MESSAGES) return msgs;
	let trimmed = msgs.slice(-MAX_MESSAGES);
	if (trimmed.length > 50) {
		let totalChars = trimmed.reduce((sum, m) => sum + m.content.length, 0);
		while (totalChars > MAX_TOTAL_CHARS && trimmed.length > 1) {
			totalChars -= trimmed[0]?.content.length ?? 0;
			trimmed = trimmed.slice(1);
		}
	}

	return trimmed;
}
function addMessage(msgs: ChatMessage[], msg: ChatMessage): ChatMessage[] {
	return [...msgs, msg];
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

export const AgentChatView = forwardRef<AgentChatHandle, AgentChatViewProps>(
	function AgentChatView(
		{
			paneId,
			cwd,
			showInput = true,
			theme,
			agentKind = "claude",
			onStatusChange,
			hideHeader,
			onClose,
			isSelected,
			draggable,
			onDragStart,
			onDragEnd,
			sessions,
			onSelectSession,
		},
		ref
	) {
		const [messages, setMessagesRaw] = useState<ChatMessage[]>(() =>
			loadStoredMessages<ChatMessage>(paneId).map((message) => ({
				...message,
				isStreaming: false,
			}))
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
		const [input, setInputRaw] = useState(() => loadStoredInput(paneId));
		const setInput = useCallback(
			(val: string) => {
				setInputRaw(val);
				saveStoredInput(paneId, val);
			},
			[paneId]
		);

		const cwdList = useMemo(() => (cwd ? [cwd] : []), [cwd]);
		const { projects: gitProjects } = useGitStatus(cwdList);
		const gitBranch = gitProjects[0]?.branch ?? null;

		const agentKindOptions = useMemo(
			() => [
				{
					id: "claude" as const,
					label: "Claude",
					icon: getAgentIcon("claude", 11),
				},
				{
					id: "codex" as const,
					label: "Codex",
					icon: getAgentIcon("codex", 11),
				},
			],
			[]
		);

		// Track when agent kind switches so the next message includes prior context
		const prevAgentKindRef = useRef(agentKind);
		const agentKindJustChanged = useRef(false);
		useEffect(() => {
			if (prevAgentKindRef.current !== agentKind) {
				prevAgentKindRef.current = agentKind;
				agentKindJustChanged.current = true;
				clearStoredSessionId(paneId);
			}
		}, [agentKind, paneId]);

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
		const [slashMenu, setSlashMenu] = useState<{
			show: boolean;
			selectedIdx: number;
			query: string;
			slashIndex: number; // cursor position of the '/'
		}>({ show: false, selectedIdx: 0, query: "", slashIndex: -1 });
		const [fileResults, setFileResults] = useState<
			{ name: string; path: string; isDir: boolean }[]
		>([]);
		const [checkpoints, setCheckpoints] = useState<CheckpointInfo[]>(() => {
			return loadStoredCheckpoints<CheckpointInfo>(paneId);
		});
		const checkpointsRef = useRef(checkpoints);
		checkpointsRef.current = checkpoints;

		const fileSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
			null
		);
		const scrollRef = useRef<HTMLDivElement>(null);
		const textareaRef = useRef<HTMLTextAreaElement>(null);
		const highlightOverlayRef = useRef<HTMLDivElement>(null);
		const inputContainerRef = useRef<HTMLDivElement>(null);
		const currentAssistantRef = useRef<string | null>(null);
		const currentToolRef = useRef<string | null>(null);
		const hasStreamedRef = useRef(false);
		const queueRef = useRef<QueuedMessage[]>([]);
		const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
		const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
		const [editingQueueText, setEditingQueueText] = useState("");
		const containerRef = useRef<HTMLDivElement>(null);
		const [isAtBottom, setIsAtBottom] = useState(true);
		const currentBtwRef = useRef<string | null>(null);
		const [mdPreview, setMdPreview] = useState<{
			show: boolean;
			path: string;
			content: string | null;
			loading: boolean;
			error: string | null;
		}>({ show: false, path: "", content: null, loading: false, error: null });

		const handleScroll = useCallback(() => {
			const el = scrollRef.current;
			if (!el) return;
			const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
			setIsAtBottom(atBottom);
		}, []);

		const scrollToBottom = useCallback(() => {
			const el = scrollRef.current;
			if (!el) return;
			el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
		}, []);

		useEffect(() => {
			if (!isSelected) return;
			const onKeyDown = (e: KeyboardEvent) => {
				if (e.key !== "ArrowDown") return;
				const active = document.activeElement;
				if (
					active &&
					(active.tagName === "TEXTAREA" || active.tagName === "INPUT")
				)
					return;
				if (!isAtBottom) {
					e.preventDefault();
					scrollToBottom();
				}
			};
			window.addEventListener("keydown", onKeyDown);
			return () => window.removeEventListener("keydown", onKeyDown);
		}, [isSelected, isAtBottom, scrollToBottom]);

		const handleMdFileClick = useCallback((filePath: string) => {
			setMdPreview({
				show: true,
				path: filePath,
				content: null,
				loading: true,
				error: null,
			});
			wsClient.send({ type: "file:read", path: filePath });
		}, []);
		useEffect(() => {
			const handleMessage = (msg: Record<string, unknown>) => {
				if (msg.type === "file:content" && mdPreview.loading) {
					setMdPreview((prev) => ({
						...prev,
						content: msg.content as string,
						loading: false,
					}));
				} else if (msg.type === "file:error" && mdPreview.loading) {
					setMdPreview((prev) => ({
						...prev,
						error: (msg.error as string) || "Failed to read file",
						loading: false,
					}));
				}
			};
			return wsClient.onMessage(handleMessage);
		}, [mdPreview.loading]);

		useEffect(() => {
			requestAnimationFrame(() => textareaRef.current?.focus());
		}, []);

		const appendLocalMessages = useCallback(
			(pending: Array<Pick<ChatMessage, "role" | "content" | "images">>) => {
				if (pending.length === 0) return;
				setMessages((prev) =>
					trimMessages([
						...prev,
						...pending.map((msg) => ({
							id: nextId(),
							role: msg.role,
							content: msg.content,
							images: msg.images,
						})),
					])
				);
			},
			[setMessages]
		);
		const queueMessage = useCallback(
			(text: string, displayText: string, images?: string[]) => {
				queueRef.current.push({
					id: String(++queueIdCounter),
					text,
					displayText,
					images: images?.length ? images : undefined,
				});
				setQueuedMessages([...queueRef.current]);
			},
			[]
		);
		const { prompts: localPrompts, incrementUsage: incrementLocalUsage } =
			usePrompts();
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
			const deduped = new Map<string, SlashCommand>();
			for (const cmd of [
				...LOCAL_COMMANDS,
				...libraryCommands,
				...nativeCommands,
			]) {
				const key = cmd.name.toLowerCase();
				if (!deduped.has(key)) deduped.set(key, cmd);
			}
			return [...deduped.values()];
		}, [agentKind, localPrompts]);
		const slashCommandInfo = useMemo(() => {
			if (!slashMenu.show || slashMenu.slashIndex === -1) {
				return { query: "", filtered: [] };
			}
			const query = slashMenu.query.toLowerCase();
			const filtered = allCommands.filter((cmd) =>
				cmd.name.toLowerCase().startsWith(query)
			);
			return { query, filtered };
		}, [slashMenu.show, slashMenu.slashIndex, slashMenu.query, allCommands]);

		const filteredCommands = slashCommandInfo.filtered;
		const showCommands = slashMenu.show && filteredCommands.length > 0;
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
		const handleInputForSlashMenu = useCallback(
			(value: string, cursorPos: number) => {
				const trigger = findTriggerAtCursor(value, cursorPos, "/");
				if (!trigger) {
					if (slashMenu.show)
						setSlashMenu((prev) => ({ ...prev, show: false }));
					return;
				}

				setSlashMenu({
					show: true,
					selectedIdx: 0,
					query: trigger.query,
					slashIndex: trigger.index,
				});
			},
			[slashMenu.show]
		);
		const handleInputForFileMenu = useCallback(
			(value: string, cursorPos: number) => {
				const trigger = findTriggerAtCursor(value, cursorPos, "@");
				if (!trigger) {
					if (fileMenu.show) setFileMenu((prev) => ({ ...prev, show: false }));
					return;
				}

				let position: typeof fileMenu.position = fileMenu.position;
				{
					const pos = getMenuPosition(300);
					if (pos) position = pos;
				}

				setFileMenu({
					show: true,
					selectedIdx: 0,
					query: trigger.query,
					atIndex: trigger.index,
					position,
				});
				if (fileSearchTimerRef.current)
					clearTimeout(fileSearchTimerRef.current);
				fileSearchTimerRef.current = setTimeout(async () => {
					try {
						const params = new URLSearchParams({
							q: trigger.query,
							limit: "15",
						});
						if (cwd) params.set("cwd", cwd);
						const res = await fetch(`/api/files/search?${params}`);
						const data = await res.json();
						setFileResults(data.results || []);
					} catch {
						setFileResults([]);
					}
				}, 150);
			},
			[cwd, fileMenu.show, fileMenu.position, getMenuPosition]
		);
		const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
		useEffect(() => {
			if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
			if (messagesRef.current.some((m) => m.isStreaming)) return;
			saveTimerRef.current = setTimeout(() => {
				saveStoredMessages(paneId, messagesRef.current);
			}, 2000);
			return () => {
				if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
			};
		}, [paneId]);
		useEffect(() => {
			onStatusChange?.(paneId, status);
		}, [paneId, status, onStatusChange]);

		const sendToServer = useCallback(
			(text: string) => {
				setLoadingState({
					isLoading: true,
					status: "thinking",
					startTime: Date.now(),
				});
				currentAssistantRef.current = null;

				let prompt = text;
				// On first message after switching agent kind, prepend prior conversation context
				if (agentKindJustChanged.current) {
					agentKindJustChanged.current = false;
					const history = messagesRef.current;
					if (history.length > 0) {
						const contextLines: string[] = [];
						// Take the last ~20 messages, skip tool/system noise
						const recent = history.slice(-20);
						for (const msg of recent) {
							if (msg.role === "user") {
								contextLines.push(`User: ${msg.content.slice(0, 500)}`);
							} else if (msg.role === "assistant" && msg.content) {
								contextLines.push(`Assistant: ${msg.content.slice(0, 500)}`);
							}
						}
						if (contextLines.length > 0) {
							prompt = `<prior-conversation-context>\nThe following is a summary of the prior conversation in this chat session (from a different model). Use it as context for the request below.\n\n${contextLines.join("\n\n")}\n</prior-conversation-context>\n\n${text}`;
						}
					}
				}

				let sessionId: string | null = null;
				sessionId = loadStoredSessionId(paneId);
				wsClient.send({
					type: "chat:send",
					paneId,
					text: prompt,
					cwd,
					sessionId,
					agentKind,
				});
			},
			[paneId, cwd, agentKind, setLoadingState]
		);
		const extractToolActivitiesForHandle = useCallback(
			(): ToolActivity[] => extractToolActivities(messagesRef.current),
			[]
		);

		const stopGeneration = useCallback(() => {
			wsClient.send({ type: "chat:stop", paneId });
			setLoadingState({ isLoading: false, status: "idle", startTime: null });
			setMessages((prev) =>
				trimMessages([
					...prev,
					{ id: nextId(), role: "system", content: "Generation stopped" },
				])
			);
		}, [paneId, setLoadingState, setMessages]);

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
				sendMessageWithImages: (text: string, images?: string[]) => {
					if (!text.trim()) return;
					if (isLoading) {
						queueMessage(text.trim(), text.trim(), images);
					} else {
						appendLocalMessages([
							{ role: "user", content: text.trim(), images },
						]);
						sendToServer(text.trim());
					}
				},
				getStatus: () => status,
				focusInput: (atEnd?: boolean) => {
					const ta = textareaRef.current;
					if (ta) {
						ta.focus();
						if (atEnd) {
							const len = ta.value.length;
							ta.setSelectionRange(len, len);
						}
					}
				},
				getToolActivities: extractToolActivitiesForHandle,
				getQueuedCount: () => queuedMessages.length,
				getQueuedMessages: () =>
					queuedMessages.map((q) => ({
						id: q.id,
						text: q.text,
						displayText: q.displayText,
						images: q.images,
					})),
				removeQueuedMessage: (id: string) => {
					queueRef.current = queueRef.current.filter((q) => q.id !== id);
					setQueuedMessages([...queueRef.current]);
				},
				updateQueuedMessage: (id: string, text: string) => {
					const item = queueRef.current.find((q) => q.id === id);
					if (item) {
						item.text = text;
						item.displayText = text;
						setQueuedMessages([...queueRef.current]);
					}
				},
				stopGeneration,
				isLoading: () => isLoading,
				getAttachedImages: () => [...attachedImages],
				attachImageFile: async (file: File) => {
					await attachImage(file);
				},
				removeAttachedImage: (path: string) => {
					removeAttachedImage(path);
				},
			}),
			[
				appendLocalMessages,
				isLoading,
				queueMessage,
				status,
				sendToServer,
				extractToolActivitiesForHandle,
				queuedMessages,
				stopGeneration,
				attachedImages,
			]
		);

		useEffect(() => {
			const cleanup = wsClient.subscribe(paneId, (msg: any) => {
				if (msg.type === "chat:event") {
					handleChatEvent(msg.event);
					if (msg.event?.session_id) {
						saveStoredSessionId(paneId, msg.event.session_id);
					}
				} else if (msg.type === "chat:session") {
					if (msg.sessionId) {
						saveStoredSessionId(paneId, msg.sessionId);
					}
				} else if (msg.type === "chat:done") {
					const updated = trimMessages(
						messagesRef.current.map((m) =>
							m.isStreaming ? { ...m, isStreaming: false } : m
						)
					);
					saveStoredMessages(paneId, updated);
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
						appendLocalMessages([
							{
								role: "user",
								content: next.displayText,
								images: next.images,
							},
						]);
						sendToServer(next.text);
					}
				} else if (msg.type === "chat:user_message") {
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
						saveStoredMessages(paneId, updated);
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
						appendLocalMessages([
							{
								role: "user",
								content: next.displayText,
								images: next.images,
							},
						]);
						sendToServer(next.text);
					}
				} else if (msg.type === "chat:system") {
					setMessages((prev) => {
						const updated = trimMessages([
							...prev,
							{ id: nextId(), role: "system", content: msg.message },
						]);
						saveStoredMessages(paneId, updated);
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
					if (serverMessages.length === 0) return;
					const currentMessages = messagesRef.current;
					const shouldSkipSync =
						serverMessages.length < currentMessages.length && !msg.isStreaming;

					if (shouldSkipSync) {
						return;
					}
					setMessages((prev) =>
						trimMessages(mergeSyncedMessages(prev, serverMessages))
					);
					saveStoredMessages(paneId, serverMessages);
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
						setLoadingState((prev) => {
							if (prev.isLoading) return prev; // Don't interrupt active loading
							return {
								isLoading: false,
								status: "idle",
								startTime: null,
							};
						});
						currentAssistantRef.current = null;
						currentToolRef.current = null;
						hasStreamedRef.current = false;
					}
				} else if (msg.type === "chat:btw:start") {
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
						setMessages((prev) =>
							appendMessageContent(prev, targetId, msg.text)
						);
					}
				} else if (msg.type === "chat:btw:done") {
					const targetId = currentBtwRef.current;
					currentBtwRef.current = null;
					if (targetId) {
						setMessages((prev) => {
							const updated = patchMessageById(prev, targetId, {
								content: msg.answer,
								isStreaming: false,
							});
							saveStoredMessages(paneId, updated);
							return updated;
						});
					}
				} else if (
					msg.type === "checkpoint:finalized" &&
					msg.changedFileCount > 0
				) {
					setCheckpoints((prev) => {
						const msgs = messagesRef.current;
						const lastMsg =
							msgs.findLast?.(
								(m) => m.role === "assistant" && !m.isStreaming
							) ?? msgs.findLast?.((m) => m.role === "assistant");
						if (!lastMsg) return prev; // no assistant message at all — skip
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
						saveStoredCheckpoints(paneId, updated);
						return updated;
					});
				} else if (msg.type === "checkpoint:reverted") {
					setCheckpoints((prev) => {
						const updated = prev.map((cp) =>
							cp.id === msg.checkpointId ? { ...cp, reverted: true } : cp
						);
						saveStoredCheckpoints(paneId, updated);
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
		}, [
			paneId,
			appendLocalMessages,
			handleChatEvent,
			sendToServer,
			setLoadingState,
			setMessages,
		]);

		function handleChatEvent(event: any) {
			if (!event?.type) return;

			if (event.type === "assistant") {
				const msg = event.message;
				if (!msg?.content) return;
				if (hasStreamedRef.current) return;
				for (const block of msg.content) {
					if (block.type === "text" && block.text) {
						setLoadingState((prev) => ({ ...prev, status: "responding" }));
						if (currentAssistantRef.current) {
							const targetId = currentAssistantRef.current;
							setMessages((prev) => {
								const updated = patchMessageById(
									prev,
									targetId,
									{
										content: block.text,
										isStreaming: !msg.stop_reason,
									},
									false
								);
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
						addMessage(prev, {
							id,
							role: "assistant",
							content: block.text || "",
							isStreaming: true,
						})
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
						addMessage(prev, {
							id,
							role: "tool",
							content: "",
							toolName: block.name,
							isStreaming: true,
						})
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
					setMessages((prev) =>
						appendMessageContent(prev, targetId, delta.text)
					);
				} else if (
					delta?.type === "input_json_delta" &&
					delta.partial_json &&
					currentToolRef.current
				) {
					const targetId = currentToolRef.current;
					setMessages((prev) =>
						appendMessageContent(prev, targetId, delta.partial_json)
					);
				}
			} else if (event.type === "content_block_stop") {
				setMessages((prev) => {
					let updated = prev.slice();
					let changed = false;
					if (currentAssistantRef.current) {
						const targetId = currentAssistantRef.current;
						const next = patchMessageById(updated, targetId, {
							isStreaming: false,
						});
						changed = next !== updated || changed;
						updated = next;
					}
					if (currentToolRef.current) {
						const targetId = currentToolRef.current;
						const next = patchMessageById(updated, targetId, {
							isStreaming: false,
						});
						changed = next !== updated || changed;
						updated = next;
					}
					currentAssistantRef.current = null;
					currentToolRef.current = null;
					if (changed) {
						updated = trimMessages(updated);
					}
					return changed ? updated : prev;
				});
			} else if (event.type === "result") {
				if (event.result) {
					setLoadingState((prev) => ({ ...prev, status: "responding" }));
					if (currentAssistantRef.current) {
						const targetId = currentAssistantRef.current;
						setMessages((prev) => {
							const updated = patchMessageById(
								prev,
								targetId,
								{ content: event.result, isStreaming: false },
								false
							);
							if (updated === prev) {
								return trimMessages([
									...prev,
									{ id: nextId(), role: "assistant", content: event.result },
								]);
							}
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

		useEffect(() => {
			const ta = textareaRef.current;
			if (!ta) return;
			const width = ta.clientWidth - 32;
			if (width > 0 && input) {
				const measured = measureTextareaHeight(
					input,
					width,
					"13px Geist, -apple-system, system-ui, sans-serif",
					20
				);
				const target = Math.min(Math.max(measured, 20), 120);
				ta.style.height = `${target}px`;
			} else {
				ta.style.height = "20px";
			}
			if (highlightOverlayRef.current && ta) {
				highlightOverlayRef.current.style.transform = `translateY(-${ta.scrollTop}px)`;
			}
		}, [input]);

		const revertCheckpoint = useCallback(
			(checkpointId: string) => {
				wsClient.send({ type: "checkpoint:revert", paneId, checkpointId });
			},
			[paneId]
		);

		const executeCommand = useCallback(
			(cmd: SlashCommand, args?: string) => {
				setCommandMenu((prev) => ({ ...prev, show: false }));
				setInput("");
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
						clearAgentChatMessages(paneId);
						setCheckpoints([]);
						clearStoredCheckpoints(paneId);
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
					const prompt = getCommandPrompt(cmd, args);
					const displayText = getCommandDisplayText(cmd, args);
					if (cmd.id) {
						incrementLocalUsage(cmd.id).catch(() => {});
					}

					if (isLoading) {
						queueMessage(prompt, displayText);
					} else {
						appendLocalMessages([
							{ role: "user", content: displayText },
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
				cwd,
				paneId,
				sendToServer,
				setInput,
				setMessages,
			]
		);

		const selectCommand = useCallback(
			(idx: number) => {
				const cmd = filteredCommands[idx];
				if (!cmd) return;
				const cursorPos = textareaRef.current?.selectionStart ?? input.length;
				const { nextValue, nextCursor } = applyInlineCompletion(
					input,
					cursorPos,
					slashMenu.slashIndex,
					`/${cmd.name}`
				);
				setInput(nextValue);
				setSlashMenu((prev) => ({ ...prev, show: false }));
				requestAnimationFrame(() => {
					const ta = textareaRef.current;
					if (ta) {
						ta.focus();
						ta.setSelectionRange(nextCursor, nextCursor);
					}
				});
			},
			[filteredCommands, input, slashMenu.slashIndex, setInput]
		);

		const selectFile = useCallback(
			(idx: number) => {
				const file = fileResults[idx];
				if (!file) return;
				const cursorPos = textareaRef.current?.selectionStart ?? input.length;
				const { nextValue, nextCursor } = applyInlineCompletion(
					input,
					cursorPos,
					fileMenu.atIndex,
					`@${file.path}`
				);
				setInput(nextValue);
				setFileMenu((prev) => ({ ...prev, show: false }));
				requestAnimationFrame(() => {
					const ta = textareaRef.current;
					if (ta) {
						ta.focus();
						ta.setSelectionRange(nextCursor, nextCursor);
					}
				});
			},
			[fileResults, fileMenu.atIndex, input, setInput]
		);

		const sendMessage = useCallback(() => {
			const text = input.trim();
			if (!text && attachedImages.length === 0) return;
			if (text.startsWith("/") && !text.includes(" ")) {
				const cmdName = text.slice(1).toLowerCase();
				const cmd = allCommands.find((c) => c.name.toLowerCase() === cmdName);
				if (cmd) {
					executeCommand(cmd, undefined);
					return;
				}
			}
			const imagePaths = attachedImages.map((img) => img.path);

			const { expandedText, usedCommandIds } = expandInlineCommandPrompts(
				text,
				allCommands
			);
			usedCommandIds.forEach((id) => {
				incrementLocalUsage(id).catch(() => {});
			});
			const displayText =
				text || `Attached image${attachedImages.length > 1 ? "s" : ""}`;

			const fullText =
				imagePaths.length > 0
					? `${expandedText}${expandedText ? "\n\n" : ""}Here are the images at these paths:\n${imagePaths.join("\n")}`
					: expandedText;

			setInput("");
			setSlashMenu((prev) => ({ ...prev, show: false }));
			setFileMenu((prev) => ({ ...prev, show: false }));
			for (const img of attachedImages) URL.revokeObjectURL(img.previewUrl);
			setAttachedImages([]);
			if (textareaRef.current) textareaRef.current.style.height = "20px";

			if (isLoading) {
				queueMessage(fullText, displayText, imagePaths);
			} else {
				appendLocalMessages([
					{
						role: "user",
						content: displayText,
						images: imagePaths.length > 0 ? imagePaths : undefined,
					},
				]);
				sendToServer(fullText);
			}
		}, [
			input,
			isLoading,
			executeCommand,
			attachedImages,
			appendLocalMessages,
			queueMessage,
			allCommands,
			incrementLocalUsage,
			sendToServer,
			setInput,
		]);

		const handleKeyDown = useCallback(
			(e: React.KeyboardEvent) => {
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
				if (showCommands && filteredCommands.length > 0) {
					if (e.key === "ArrowDown") {
						e.preventDefault();
						setSlashMenu((prev) => ({
							...prev,
							selectedIdx: (prev.selectedIdx + 1) % filteredCommands.length,
						}));
						return;
					}
					if (e.key === "ArrowUp") {
						e.preventDefault();
						setSlashMenu((prev) => ({
							...prev,
							selectedIdx:
								(prev.selectedIdx - 1 + filteredCommands.length) %
								filteredCommands.length,
						}));
						return;
					}
					if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
						e.preventDefault();
						selectCommand(slashMenu.selectedIdx);
						return;
					}
					if (e.key === "Escape") {
						e.preventDefault();
						setSlashMenu((prev) => ({ ...prev, show: false }));
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
				slashMenu.selectedIdx,
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
			[attachImage]
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
			[attachImage]
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

		const toggleTool = useCallback(
			(id: string) => {
				setExpandedTools((prev) => {
					const next = new Set(prev);
					next.has(id) ? next.delete(id) : next.add(id);
					return next;
				});
			},
			[setExpandedTools]
		);

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
			[appendLocalMessages, isLoading, queueMessage, sendToServer]
		);

		const bgColor = theme?.bg ?? "#000000";
		const fgColor = theme?.fg ?? "#e5e5e5";
		const cursorColor = theme?.cursor ?? "#d6ff00";
		const fgMuted = `${fgColor}88`;
		const fgDim = `${fgColor}55`;
		const surfaceColor = theme ? adjustBrightness(bgColor, 15) : undefined;
		const borderColor = theme ? `${fgColor}15` : undefined;
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
				style={theme ? { color: fgColor } : undefined}
				onDragOver={(e) => {
					e.preventDefault();
					setIsDragOver(true);
				}}
				onDragLeave={() => setIsDragOver(false)}
				onDrop={handleDrop}
			>
				{!hideHeader &&
					(() => {
						const dimStyle = theme ? { color: fgDim } : undefined;
						const textStyle = theme ? { color: fgColor } : undefined;
						const agentLabel = getAgentDefinition(agentKind).label;
						const dirName = cwd ? cwd.split("/").pop() || cwd : null;
						const hasMultipleSessions =
							sessions && sessions.length > 1 && onSelectSession;
						const sessionOptions = hasMultipleSessions
							? sessions.map((s) => ({
									id: s.paneId,
									label:
										(s.cwd ?? "").split("/").pop() || s.cwd || "No directory",
									detail: getAgentDefinition(s.agentKind).label,
									icon: getAgentIcon(s.agentKind, 12),
								}))
							: [];

						return (
							<div
								className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 border-b ${theme ? "" : "border-inferay-border"} ${draggable ? "cursor-grab active:cursor-grabbing" : ""} select-none`}
								style={
									theme ? { borderColor, backgroundColor: bgColor } : undefined
								}
								draggable={draggable}
								onDragStart={onDragStart}
								onDragEnd={onDragEnd}
							>
								{/* Agent kind selector — Claude / Codex */}
								<div
									draggable={false}
									onMouseDown={(e) => e.stopPropagation()}
									onDragStart={(e) => e.preventDefault()}
								>
									<DropdownButton
										value={agentKind}
										options={agentKindOptions}
										onChange={(id) => {
											changePaneAgentKind(paneId, id as AgentKind);
											clearStoredSessionId(paneId);
										}}
										icon={
											<span className="text-inferay-accent">
												{getAgentIcon(agentKind, 10)}
											</span>
										}
										minWidth={110}
										buttonClassName="h-4 rounded-md border-transparent px-1 text-[9px] font-medium text-inferay-accent hover:bg-inferay-text/[0.06] gap-1"
										labelClassName="text-[9px]"
										renderOption={(opt, isSelected) => (
											<div
												className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
													isSelected
														? "bg-inferay-accent/15 text-inferay-text"
														: "text-inferay-text-3 hover:bg-inferay-text/5 hover:text-inferay-text"
												}`}
											>
												<span className="shrink-0">{opt.icon}</span>
												<span className="font-medium">{opt.label}</span>
											</div>
										)}
									/>
								</div>
								{/* Directory */}
								{dirName && (
									<>
										<span className="text-[9px]" style={dimStyle}>
											›
										</span>
										{hasMultipleSessions ? (
											<DropdownButton
												value={paneId}
												options={sessionOptions}
												onChange={onSelectSession}
												minWidth={220}
												buttonClassName="h-4 rounded-md border-transparent px-1.5 text-[9px] font-medium hover:bg-inferay-text/[0.06]"
												labelClassName="max-w-[120px] truncate text-[9px]"
											/>
										) : (
											<span
												className="text-[9px] font-medium truncate"
												style={textStyle}
												title={cwd}
											>
												{dirName}
											</span>
										)}
									</>
								)}
								{/* Git branch */}
								{gitBranch && (
									<>
										<span className="text-[9px]" style={dimStyle}>
											›
										</span>
										<IconGitBranch
											size={9}
											className="text-inferay-text-3 shrink-0"
										/>
										<span
											className="text-[9px] font-medium text-inferay-text-3 truncate max-w-[80px]"
											title={gitBranch}
										>
											{gitBranch}
										</span>
									</>
								)}
								<span className="flex-1" />
								{isSelected && (
									<div className="h-1.5 w-1.5 rounded-full bg-inferay-accent" />
								)}
								{onClose && (
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											onClose(paneId);
										}}
										className="flex items-center justify-center h-4 w-4 rounded transition-colors text-inferay-text-3 hover:text-red-400 hover:bg-red-500/15"
										title="Close"
									>
										<IconX size={8} />
									</button>
								)}
							</div>
						);
					})()}
				<div className="relative flex-1 overflow-hidden">
					<div
						ref={scrollRef}
						className="h-full overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-none"
						style={theme ? { backgroundColor: bgColor } : undefined}
						onScroll={handleScroll}
					>
						<ChatMessageList
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
							onMdFileClick={handleMdFileClick}
						/>
					</div>
					{!isAtBottom && (
						<button
							type="button"
							onClick={scrollToBottom}
							className="absolute bottom-2 right-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-inferay-border bg-inferay-surface shadow-sm transition-opacity hover:bg-inferay-surface-2"
						>
							<IconArrowDown size={12} className="text-inferay-text-2" />
						</button>
					)}
				</div>

				<div className="relative shrink-0">
					{/* Eased gradient fade behind the bottom bar */}
					<div
						className="pointer-events-none absolute left-0 right-0 bottom-0"
						style={{
							top: "-64px",
							background: `linear-gradient(to bottom, ${bgColor}00 0%, ${bgColor}18 12%, ${bgColor}50 24%, ${bgColor}90 36%, ${bgColor}cc 48%, ${bgColor} 60%, ${bgColor} 100%)`,
						}}
					/>
					<div className="relative z-10">
						<ChatComposer
							statusBar={
								<ChatStatusBar
									messages={messages}
									isLoading={isLoading}
									status={status}
									onStop={stopGeneration}
									theme={theme}
									borderColor={borderColor}
									bgColor={bgColor}
									fgDim={fgDim}
								/>
							}
							showInput={showInput}
							theme={theme}
							bgColor={bgColor}
							fgColor={fgColor}
							cursorColor={cursorColor}
							fgDim={fgDim}
							borderColor={borderColor}
							surfaceColor={surfaceColor}
							bubbleTheme={bubbleTheme}
							input={input}
							setInput={setInput}
							isLoading={isLoading}
							attachedImages={attachedImages}
							removeAttachedImage={removeAttachedImage}
							attachImage={attachImage}
							queuedMessages={queuedMessages}
							editingQueueId={editingQueueId}
							setEditingQueueId={setEditingQueueId}
							editingQueueText={editingQueueText}
							setEditingQueueText={setEditingQueueText}
							queueRef={queueRef}
							setQueuedMessages={setQueuedMessages}
							fileMenu={fileMenu}
							setFileMenu={setFileMenu}
							fileResults={fileResults}
							selectFile={selectFile}
							slashMenu={slashMenu}
							setSlashMenu={setSlashMenu}
							showCommands={showCommands}
							filteredCommands={filteredCommands}
							selectCommand={selectCommand}
							handleInputForFileMenu={handleInputForFileMenu}
							handleInputForSlashMenu={handleInputForSlashMenu}
							handleKeyDown={handleKeyDown}
							handlePaste={handlePaste}
							textareaRef={textareaRef}
							highlightOverlayRef={highlightOverlayRef}
							inputContainerRef={inputContainerRef}
							mdPreview={mdPreview}
							setMdPreview={setMdPreview}
							onMdFileClick={handleMdFileClick}
						/>
					</div>
				</div>
			</div>
		);
	}
);
function StatusIcon({
	iconType,
	size,
	className,
	style,
}: {
	iconType: string;
	size: number;
	className: string;
	style?: React.CSSProperties;
}) {
	const props = { size, className, style };
	switch (iconType) {
		case "sparkles":
			return <IconSparkles {...props} />;
		case "message":
			return <IconMessageCircle {...props} />;
		case "alert":
			return <IconAlertTriangle {...props} />;
		case "wrench":
			return <IconWrench {...props} />;
		case "terminal":
			return <IconTerminal {...props} />;
		default:
			return <IconCircle {...props} />;
	}
}

const ChatStatusBar = React.memo(function ChatStatusBar({
	messages,
	isLoading,
	status,
	onStop,
	theme,
	borderColor,
	bgColor,
	fgDim,
}: {
	messages: ChatMessage[];
	isLoading: boolean;
	status: string;
	onStop: () => void;
	theme?: { bg: string; fg: string; cursor: string };
	borderColor?: string;
	bgColor: string;
	fgDim: string;
}) {
	const [isHovered, setIsHovered] = useState(false);
	const toolActivities = useMemo(
		() => extractToolActivities(messages),
		[messages]
	);

	if (!isLoading) return null;
	const latestActivity = toolActivities[toolActivities.length - 1];
	const statusToolName = getStatusToolName(status);
	const hasActivity = toolActivities.length > 0 || statusToolName;

	const getToolIcon = (toolName: string) => {
		const baseClass = "w-3 h-3 shrink-0";
		switch (toolName.toLowerCase()) {
			case "read":
				return <IconEye className={baseClass} />;
			case "edit":
			case "patch": // Codex patch tool
				return <IconPencil className={baseClass} />;
			case "write":
				return <IconFilePlus className={baseClass} />;
			case "bash":
			case "exec": // Codex exec tool
				return <IconTerminal className={baseClass} />;
			case "grep":
			case "glob":
				return <IconSearch className={baseClass} />;
			case "web_search": // Codex web search
			case "websearch":
			case "webfetch":
				return <IconGlobe className={baseClass} />;
			default:
				return <IconWrench className={baseClass} />;
		}
	};
	const displayToolName = latestActivity?.toolName ?? statusToolName;
	const displaySummary = latestActivity?.summary ?? statusToolName;
	const activityCount = toolActivities.length;

	return (
		<div className="shrink-0 flex items-center justify-between gap-2 px-3 py-1">
			{hasActivity ? (
				<div
					className="relative"
					onMouseEnter={() => setIsHovered(true)}
					onMouseLeave={() => setIsHovered(false)}
				>
					<div className="flex items-center gap-1.5 h-6 px-2.5 rounded-md text-xs font-medium cursor-default bg-inferay-surface-2 text-inferay-text-2 hover:bg-inferay-surface-3 transition-all border border-inferay-border">
						{displayToolName && (
							<span className="text-inferay-text-3">
								{getToolIcon(displayToolName)}
							</span>
						)}
						<span className="max-w-[150px] truncate">
							{displaySummary || "Working..."}
						</span>
						{activityCount > 1 && (
							<span className="text-[9px] tabular-nums text-inferay-text-3">
								+{activityCount - 1}
							</span>
						)}
					</div>

					{isHovered && activityCount > 0 && (
						<div className="absolute bottom-full left-0 mb-1 min-w-[240px] max-w-[320px] rounded-lg overflow-hidden bg-inferay-surface shadow-lg border border-inferay-border">
							<div className="flex items-center justify-between px-2.5 py-1.5 text-[9px] font-medium uppercase tracking-wider border-b border-inferay-border text-inferay-text-3">
								<span>Activity</span>
								<span className="tabular-nums">{activityCount}</span>
							</div>
							<div className="overflow-y-auto" style={{ maxHeight: "200px" }}>
								{toolActivities.map((activity, idx) => (
									<div
										key={activity.id}
										className={`flex items-center gap-2 px-2.5 py-1.5 text-[10px] ${
											idx < toolActivities.length - 1
												? "border-b border-inferay-border/50"
												: ""
										}`}
									>
										<span className="shrink-0 text-inferay-text-3">
											{getToolIcon(activity.toolName)}
										</span>
										<span className="flex-1 truncate text-inferay-text-2">
											{activity.summary}
										</span>
										{activity.isStreaming && (
											<span className="h-1.5 w-1.5 rounded-full shrink-0 bg-inferay-text-3" />
										)}
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			) : (
				<div className="flex items-center gap-2">
					<span className="h-1.5 w-1.5 rounded-full animate-pulse bg-inferay-text-3" />
					<span className="text-[10px] text-inferay-text-3">Working...</span>
				</div>
			)}

			<button
				type="button"
				onClick={onStop}
				className="shrink-0 flex items-center gap-1.5 h-6 px-2 rounded-md text-[10px] font-medium transition-all bg-inferay-surface-2 text-inferay-text-2 hover:bg-inferay-surface-3 border border-inferay-border"
			>
				<IconStop className="w-3 h-3" />
				Stop
			</button>
		</div>
	);
});
