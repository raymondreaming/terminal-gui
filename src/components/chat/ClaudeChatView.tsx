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
import { getAgentDefinition } from "../../lib/agents.ts";
import { measureTextareaHeight } from "../../lib/pretext-utils.ts";
import { type Token, tokenizeLine } from "../../lib/syntax-tokens.ts";
import { useShikiSnippet } from "../../hooks/useShikiHighlighter.ts";
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
	IconPause,
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
	images?: string[];
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

export interface ToolActivity {
	id: string;
	toolName: string;
	isStreaming: boolean;
	summary: string;
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

export interface ClaudeChatHandle {
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

type RenderItem =
	| { type: "message"; message: ChatMessage }
	| { type: "edit-group"; filePath: string; edits: ChatMessage[] };

const MAX_MESSAGES = 80;
const MAX_TOTAL_CHARS = 150000;
const TRIM_CHECK_INTERVAL = 5; // Only check trim every N new messages
const STORAGE_KEY_PREFIX = "inferay-chat-";
const SESSION_KEY_PREFIX = "inferay-chat-session-";
const INPUT_KEY_PREFIX = "inferay-chat-input-";
const CHECKPOINT_KEY_PREFIX = "inferay-checkpoints-";

let msgId = 0;
function nextId() {
	return `c${++msgId}-${Date.now().toString(36)}`;
}

// Quick check - only do expensive char count if message count is high
function trimMessages(msgs: ChatMessage[]): ChatMessage[] {
	// Fast path: under message limit, skip expensive char calculation
	if (msgs.length <= MAX_MESSAGES) return msgs;

	// Over message limit - trim from front
	let trimmed = msgs.slice(-MAX_MESSAGES);

	// Only check char limit if we have many messages (expensive operation)
	if (trimmed.length > 50) {
		let totalChars = trimmed.reduce((sum, m) => sum + m.content.length, 0);
		while (totalChars > MAX_TOTAL_CHARS && trimmed.length > 1) {
			totalChars -= trimmed[0]?.content.length ?? 0;
			trimmed = trimmed.slice(1);
		}
	}

	return trimmed;
}

// Lightweight version - just adds message, no trimming (for streaming)
function addMessage(msgs: ChatMessage[], msg: ChatMessage): ChatMessage[] {
	return [...msgs, msg];
}

// Tools shown in activity bar, not rendered inline (except Edit and AskUserQuestion)
function isActivityBarTool(msg: ChatMessage): boolean {
	return (
		msg.role === "tool" &&
		msg.toolName !== "AskUserQuestion" &&
		msg.toolName !== "Edit"
	);
}

function getEditFilePath(msg: ChatMessage): string | null {
	if (msg.role !== "tool" || msg.toolName !== "Edit" || !msg.content)
		return null;
	try {
		const parsed = JSON.parse(msg.content);
		return parsed.file_path || null;
	} catch {
		return null;
	}
}

function buildRenderItems(messages: ChatMessage[]): RenderItem[] {
	const items: RenderItem[] = [];
	const filtered = messages.filter((msg) => !isActivityBarTool(msg));

	// First pass: identify edit groups by file path
	// Track which edit message IDs belong to groups (to skip them later)
	const editGroups = new Map<
		number,
		{ filePath: string; edits: ChatMessage[]; lastIdx: number }
	>();
	const skipIndices = new Set<number>();

	for (let i = 0; i < filtered.length; i++) {
		if (skipIndices.has(i)) continue;

		const msg = filtered[i]!;
		const filePath = getEditFilePath(msg);

		if (filePath) {
			const edits: ChatMessage[] = [msg];
			const editIndices: number[] = [i];
			let j = i + 1;

			// Look ahead for more edits to the same file (allow other messages between)
			while (j < filtered.length) {
				const nextMsg = filtered[j]!;
				const nextFilePath = getEditFilePath(nextMsg);

				if (nextFilePath === filePath) {
					// Same file edit - add to group
					edits.push(nextMsg);
					editIndices.push(j);
					j++;
				} else if (nextMsg.role === "assistant" || nextMsg.role === "user") {
					// Non-edit message - skip over but keep looking for more edits
					j++;
				} else if (nextFilePath && nextFilePath !== filePath) {
					// Different file edit - stop looking
					break;
				} else {
					j++;
				}
			}

			if (edits.length > 1) {
				// Mark all these indices to be skipped
				for (const idx of editIndices) {
					skipIndices.add(idx);
				}
				// Store the group at the position of the last edit
				const lastEditIdx = editIndices[editIndices.length - 1]!;
				editGroups.set(lastEditIdx, { filePath, edits, lastIdx: lastEditIdx });
			}
		}
	}

	// Second pass: build render items in order
	for (let i = 0; i < filtered.length; i++) {
		// Check if there's an edit group that should be rendered at this position
		const group = editGroups.get(i);
		if (group) {
			items.push({
				type: "edit-group",
				filePath: group.filePath,
				edits: group.edits,
			});
			continue;
		}

		// Skip if this index is part of a group (but not the last one)
		if (skipIndices.has(i)) continue;

		// Normal message
		items.push({ type: "message", message: filtered[i]! });
	}

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

// Render input text with inline highlights for /commands and @files
// This is for the overlay that sits behind the transparent textarea
// Critical: must maintain exact same text flow as the textarea
function renderInputWithHighlights(
	text: string,
	theme?: { accent?: string; text?: string }
): React.ReactNode {
	if (!text) return <span style={{ color: "transparent" }}>{"\u00A0"}</span>;

	// Find all tokens to highlight
	const tokens: { start: number; end: number }[] = [];

	// Find slash commands: /word (at start or after whitespace)
	// Using a simple approach without lookbehind for compatibility
	const slashRegex = /(^|\s)(\/[a-zA-Z][\w-]*)/g;
	let match: RegExpExecArray | null;
	while ((match = slashRegex.exec(text)) !== null) {
		const prefix = match[1]!;
		const token = match[2]!;
		const start = match.index + prefix.length;
		tokens.push({ start, end: start + token.length });
	}

	// Find file references: @path (at start or after whitespace)
	const fileRegex = /(^|\s)(@[^\s]+)/g;
	while ((match = fileRegex.exec(text)) !== null) {
		const prefix = match[1]!;
		const token = match[2]!;
		const start = match.index + prefix.length;
		tokens.push({ start, end: start + token.length });
	}

	// Sort by position and remove duplicates
	tokens.sort((a, b) => a.start - b.start);

	if (tokens.length === 0) {
		// No tokens - render all text in theme color
		return (
			<span style={{ color: theme?.text ?? "var(--color-inferay-text)" }}>
				{text}
			</span>
		);
	}

	// Build segments with highlights
	const segments: React.ReactNode[] = [];
	let lastEnd = 0;

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i]!;
		// Skip if overlapping with previous
		if (token.start < lastEnd) continue;

		// Plain text before token
		if (token.start > lastEnd) {
			segments.push(
				<span
					key={`t-${lastEnd}`}
					style={{ color: theme?.text ?? "var(--color-inferay-text)" }}
				>
					{text.slice(lastEnd, token.start)}
				</span>
			);
		}
		// Highlighted token - use background highlight
		const tokenText = text.slice(token.start, token.end);
		segments.push(
			<span
				key={`h-${token.start}`}
				className="rounded-sm"
				style={{
					color: theme?.accent ?? "var(--color-inferay-accent)",
					backgroundColor: theme?.accent
						? `${theme.accent}20`
						: "var(--color-inferay-accent-15, rgba(0, 122, 255, 0.15))",
				}}
			>
				{tokenText}
			</span>
		);
		lastEnd = token.end;
	}

	// Remaining text
	if (lastEnd < text.length) {
		segments.push(
			<span
				key={`t-${lastEnd}`}
				style={{ color: theme?.text ?? "var(--color-inferay-text)" }}
			>
				{text.slice(lastEnd)}
			</span>
		);
	}

	return <>{segments}</>;
}

// Parse text and return segments with pills for /commands and @files
// Uses theme CSS variables for consistent theming
// When bubbleTheme is provided (for terminal panes with custom themes), uses those colors
function parseTextWithPills(
	text: string,
	bubbleTheme?: { cursor?: string; fg?: string }
): React.ReactNode[] {
	if (!text) return [];

	// Find all matches
	const matches: {
		start: number;
		end: number;
		text: string;
		type: "command" | "file";
	}[] = [];

	// Find slash commands
	let match: RegExpExecArray | null;
	const slashRegex = /(?:^|\s)(\/[a-zA-Z][\w-]*)/g;
	while ((match = slashRegex.exec(text)) !== null) {
		const fullMatch = match[1]!;
		const start = match.index + (match[0].length - fullMatch.length);
		matches.push({
			start,
			end: start + fullMatch.length,
			text: fullMatch,
			type: "command",
		});
	}

	// Find file references
	const fileRegex = /(?:^|\s)(@[^\s]+)/g;
	while ((match = fileRegex.exec(text)) !== null) {
		const fullMatch = match[1]!;
		const start = match.index + (match[0].length - fullMatch.length);
		matches.push({
			start,
			end: start + fullMatch.length,
			text: fullMatch,
			type: "file",
		});
	}

	// Sort by position
	matches.sort((a, b) => a.start - b.start);

	// If no matches, return plain text
	if (matches.length === 0) return [text];

	// Build segments
	const segments: React.ReactNode[] = [];
	let lastEnd = 0;

	for (const m of matches) {
		// Add text before this match
		if (m.start > lastEnd) {
			segments.push(text.slice(lastEnd, m.start));
		}
		// Add the pill - use bubbleTheme colors if provided (terminal panes), otherwise CSS variables
		if (bubbleTheme?.cursor) {
			segments.push(
				<span
					key={`${m.type}-${m.start}`}
					className="inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] font-medium leading-none"
					style={{
						backgroundColor: `${bubbleTheme.cursor}20`,
						color: bubbleTheme.cursor,
					}}
				>
					{m.text}
				</span>
			);
		} else {
			segments.push(
				<span
					key={`${m.type}-${m.start}`}
					className="inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] font-medium leading-none bg-inferay-accent/15 text-inferay-accent"
				>
					{m.text}
				</span>
			);
		}
		lastEnd = m.end;
	}

	// Add remaining text
	if (lastEnd < text.length) {
		segments.push(text.slice(lastEnd));
	}

	return segments;
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
		const _menuPosition = commandMenu.position;
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
		// / command menu for mid-sentence detection
		const [slashMenu, setSlashMenu] = useState<{
			show: boolean;
			selectedIdx: number;
			query: string;
			slashIndex: number; // cursor position of the '/'
		}>({ show: false, selectedIdx: 0, query: "", slashIndex: -1 });
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
		const fileInputRef = useRef<HTMLInputElement>(null);
		const currentBtwRef = useRef<string | null>(null);

		// Markdown file preview modal state
		const [mdPreview, setMdPreview] = useState<{
			show: boolean;
			path: string;
			content: string | null;
			loading: boolean;
			error: string | null;
		}>({ show: false, path: "", content: null, loading: false, error: null });

		const handleMdFileClick = useCallback((filePath: string) => {
			setMdPreview({
				show: true,
				path: filePath,
				content: null,
				loading: true,
				error: null,
			});
			// Fetch the file content via websocket
			wsClient.send({ type: "file:read", path: filePath });
		}, []);

		// Listen for file read response
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

		// Mid-sentence slash command detection
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

		// Handle slash command menu detection (mid-sentence)
		const handleInputForSlashMenu = useCallback(
			(value: string, cursorPos: number) => {
				// Find the last '/' before cursor that starts a command reference
				let slashIdx = -1;
				for (let i = cursorPos - 1; i >= 0; i--) {
					if (value[i] === "/") {
						// Valid if at start or preceded by whitespace
						if (i === 0 || /\s/.test(value[i - 1]!)) {
							slashIdx = i;
						}
						break;
					}
					// Stop searching if we hit whitespace before finding /
					if (/\s/.test(value[i]!)) break;
				}

				if (slashIdx === -1) {
					if (slashMenu.show)
						setSlashMenu((prev) => ({ ...prev, show: false }));
					return;
				}

				const query = value.slice(slashIdx + 1, cursorPos);

				setSlashMenu({
					show: true,
					selectedIdx: 0,
					query,
					slashIndex: slashIdx,
				});
			},
			[slashMenu.show]
		);

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
			[cwd, fileMenu.show, fileMenu.position, getMenuPosition]
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
		}, [paneId]);

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

		const sendToServer = useCallback(
			(text: string) => {
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
			},
			[paneId, cwd, agentKind, setLoadingState]
		);

		// Extract tool activities from messages (same logic as ChatStatusBar)
		const extractToolActivities = useCallback((): ToolActivity[] => {
			const activities: ToolActivity[] = [];
			for (const msg of messagesRef.current) {
				if (msg.role === "tool" && msg.toolName) {
					let summary = "";
					try {
						if (msg.content) {
							const parsed = JSON.parse(msg.content);
							if (parsed.file_path) {
								summary = parsed.file_path.split("/").pop() || parsed.file_path;
							} else if (parsed.command) {
								const cmd = parsed.command.slice(0, 40);
								summary = `${cmd}${parsed.command.length > 40 ? "..." : ""}`;
							} else if (parsed.pattern) {
								summary = `/${parsed.pattern.slice(0, 30)}/`;
							} else if (parsed.query) {
								summary = parsed.query.slice(0, 40);
							} else if (parsed.url) {
								try {
									const url = new URL(parsed.url);
									summary = url.hostname;
								} catch {
									summary = parsed.url.slice(0, 40);
								}
							} else if (parsed.skill) {
								summary = `/${parsed.skill}`;
							} else if (parsed.prompt) {
								summary = parsed.prompt.slice(0, 40);
							}
						}
					} catch {}
					activities.push({
						id: msg.id,
						toolName: msg.toolName,
						isStreaming: msg.isStreaming ?? false,
						summary: summary || msg.toolName,
					});
				}
			}
			return activities;
		}, []);

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
				getToolActivities: extractToolActivities,
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
				extractToolActivities,
				queuedMessages,
				stopGeneration,
				attachedImages,
			]
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
					// User message already added locally with display text in sendMessage()
					// Server echoes back the full/expanded text - ignore it to keep display clean
					// Just update loading state
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
					// Don't replace local history if server has nothing (e.g., after server restart)
					// Local history from localStorage is more valuable than empty server state
					if (serverMessages.length === 0) return;

					// Check if we should skip this sync (server has stale/fewer messages)
					const currentMessages = messagesRef.current;
					const shouldSkipSync =
						serverMessages.length < currentMessages.length && !msg.isStreaming;

					if (shouldSkipSync) {
						// Server lost state (restart) - don't update anything, keep local state
						return;
					}

					// Preserve local user message display text instead of server's expanded version
					// Match by position since IDs differ between client and server
					setMessages((prev) => {
						const localUserMsgs = prev.filter((m) => m.role === "user");
						const serverUserMsgs = serverMessages.filter(
							(m) => m.role === "user"
						);
						// Build a map of server user message index -> local display text
						const displayTextMap = new Map<number, string>();
						for (
							let i = 0;
							i < serverUserMsgs.length && i < localUserMsgs.length;
							i++
						) {
							// Only preserve if local version is shorter (likely a /command)
							if (
								localUserMsgs[i]!.content.length <
								serverUserMsgs[i]!.content.length
							) {
								displayTextMap.set(i, localUserMsgs[i]!.content);
							}
						}
						let userIdx = 0;
						const merged = serverMessages.map((m) => {
							if (m.role === "user") {
								const displayText = displayTextMap.get(userIdx);
								userIdx++;
								if (displayText) {
									return { ...m, content: displayText };
								}
							}
							return m;
						});
						return trimMessages(merged);
					});
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
						// Only set to idle if we're not already in a loading state
						// (prevents flicker when reconnect sync comes after user sends new message)
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
								if (prev[i]?.id === targetId) {
									const updated = prev.slice();
									updated[i] = {
										...updated[i]!,
										content: updated[i]?.content + msg.text,
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
								if (updated[i]?.id === targetId) {
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
					// Use addMessage during streaming - no expensive trim
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
					// Use addMessage during streaming - no expensive trim
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
					setMessages((prev) => {
						// Streaming target is always near the end — search backwards
						for (let i = prev.length - 1; i >= 0; i--) {
							if (prev[i]?.id === targetId) {
								const updated = prev.slice();
								updated[i] = {
									...updated[i]!,
									content: updated[i]?.content + delta.text,
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
							if (prev[i]?.id === targetId) {
								const updated = prev.slice();
								updated[i] = {
									...updated[i]!,
									content: updated[i]?.content + delta.partial_json,
								};
								return updated;
							}
						}
						return prev;
					});
				}
			} else if (event.type === "content_block_stop") {
				setMessages((prev) => {
					let updated = prev.slice();
					let changed = false;
					if (currentAssistantRef.current) {
						const targetId = currentAssistantRef.current;
						for (let i = prev.length - 1; i >= 0; i--) {
							if (prev[i]?.id === targetId) {
								updated[i] = { ...updated[i]!, isStreaming: false };
								changed = true;
								break;
							}
						}
					}
					if (currentToolRef.current) {
						const targetId = currentToolRef.current;
						for (let i = prev.length - 1; i >= 0; i--) {
							if (prev[i]?.id === targetId) {
								updated[i] = { ...updated[i]!, isStreaming: false };
								changed = true;
								break;
							}
						}
					}
					currentAssistantRef.current = null;
					currentToolRef.current = null;
					// Trim after message is finalized (not during streaming)
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

		// Removed auto-scroll - was causing lag when scrolling up

		useEffect(() => {
			const ta = textareaRef.current;
			if (!ta) return;
			// Use pretext with pre-wrap mode for accurate textarea measurement
			const width = ta.clientWidth - 24; // px-3 padding both sides
			if (width > 0 && input) {
				const measured = measureTextareaHeight(
					input,
					width,
					"12px Geist, -apple-system, system-ui, sans-serif",
					18 // Match lineHeight in textarea style
				);
				const target = Math.min(Math.max(measured + 16, 36), 120); // +padding, min 36, max 120
				ta.style.height = `${target}px`;
			} else {
				ta.style.height = "36px";
			}
			// Sync overlay scroll position after height change
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
						queueMessage(prompt, `/${cmd.name}${args ? ` ${args}` : ""}`);
					} else {
						appendLocalMessages([
							{
								role: "user",
								content: `/${cmd.name}${args ? ` ${args}` : ""}`,
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
				// Insert command inline (like file references) instead of executing
				const before = input.slice(0, slashMenu.slashIndex);
				const cursorPos = textareaRef.current?.selectionStart ?? input.length;
				const after = input.slice(cursorPos);
				const newInput = `${before}/${cmd.name}${after ? after : " "}`;
				setInput(newInput);
				setSlashMenu((prev) => ({ ...prev, show: false }));
				// Focus textarea and set cursor after the inserted command
				requestAnimationFrame(() => {
					const ta = textareaRef.current;
					if (ta) {
						const pos = before.length + 1 + cmd.name.length + (after ? 0 : 1);
						ta.focus();
						ta.setSelectionRange(pos, pos);
					}
				});
			},
			[filteredCommands, input, slashMenu.slashIndex, setInput]
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
			[fileResults, fileMenu.atIndex, input, setInput]
		);

		const sendMessage = useCallback(() => {
			const text = input.trim();
			if (!text && attachedImages.length === 0) return;

			// Handle message that starts with just a command (legacy behavior)
			if (text.startsWith("/") && !text.includes(" ")) {
				const cmdName = text.slice(1).toLowerCase();
				const cmd = allCommands.find((c) => c.name.toLowerCase() === cmdName);
				if (cmd) {
					executeCommand(cmd, undefined);
					return;
				}
			}

			// Build the full message with image references
			const imagePaths = attachedImages.map((img) => img.path);

			// Expand any /commands in the text to their full prompts for sending
			// But keep the display text showing just the /command
			let expandedText = text;

			// Find and expand all /commands in the message
			const cmdRegex = /(^|\s)(\/[a-zA-Z][\w-]*)(?=\s|$)/g;
			let match: RegExpExecArray | null;
			const expansions: {
				original: string;
				expanded: string;
				cmd: SlashCommand;
			}[] = [];

			while ((match = cmdRegex.exec(text)) !== null) {
				const cmdToken = match[2]!;
				const cmdName = cmdToken.slice(1).toLowerCase();
				const cmd = allCommands.find((c) => c.name.toLowerCase() === cmdName);
				if (cmd) {
					let expanded: string;
					if (cmd.promptTemplate) {
						expanded = cmd.promptTemplate.replace("{args}", "").trim();
						// Track usage for library prompts
						if (cmd.id) {
							incrementLocalUsage(cmd.id).catch(() => {});
						}
					} else {
						expanded = cmdToken; // Native commands stay as-is
					}
					expansions.push({ original: cmdToken, expanded, cmd });
				}
			}

			// Apply expansions to the text for sending to agent
			for (const exp of expansions) {
				expandedText = expandedText.replace(exp.original, exp.expanded);
			}

			// Display text keeps the /command tokens, doesn't show expanded prompts
			const displayText =
				text || `Attached image${attachedImages.length > 1 ? "s" : ""}`;

			const fullText =
				imagePaths.length > 0
					? `${expandedText}${expandedText ? "\n\n" : ""}Here are the images at these paths:\n${imagePaths.join("\n")}`
					: expandedText;

			setInput("");
			setSlashMenu((prev) => ({ ...prev, show: false }));
			setFileMenu((prev) => ({ ...prev, show: false }));
			// Clean up preview URLs
			for (const img of attachedImages) URL.revokeObjectURL(img.previewUrl);
			setAttachedImages([]);
			if (textareaRef.current) textareaRef.current.style.height = "36px";

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

		// Memoize input highlight to avoid recalculation on status/elapsedTime changes
		const inputHighlightTheme = useMemo(
			() => (theme ? { accent: cursorColor, text: fgColor } : undefined),
			[theme, cursorColor, fgColor]
		);
		const inputHighlights = useMemo(
			() => renderInputWithHighlights(input, inputHighlightTheme),
			[input, inputHighlightTheme]
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
					className="relative flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-none"
					style={theme ? { backgroundColor: bgColor } : undefined}
				>
					<MessageList
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

				{/* Status bar with activity pill and stop button */}
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

				{/* Queued messages panel */}
				{queuedMessages.length > 0 && (
					<div
						className="shrink-0 overflow-y-auto"
						style={{
							maxHeight: "140px",
							borderTop: `1px solid ${theme ? borderColor : "var(--color-inferay-border)"}`,
							backgroundColor: theme ? `${bgColor}cc` : "rgba(0,0,0,0.4)",
						}}
					>
						<div
							className="px-3 py-1 text-[9px] font-semibold tracking-wide uppercase"
							style={{
								color: theme ? fgDim : "var(--color-inferay-text-3)",
								borderBottom: `1px solid ${theme ? `${borderColor}60` : "rgba(255,255,255,0.06)"}`,
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
											? `1px solid ${theme ? `${borderColor}40` : "rgba(255,255,255,0.04)"}`
											: undefined,
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.backgroundColor = theme
										? `${cursorColor}08`
										: "rgba(255,255,255,0.03)";
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.backgroundColor = "transparent";
								}}
							>
								<span
									className="shrink-0 mt-0.5 text-[9px] font-mono tabular-nums"
									style={{
										color: theme ? fgDim : "var(--color-inferay-text-3)",
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
												color: theme ? fgColor : "var(--color-inferay-text)",
												backgroundColor: theme
													? surfaceColor
													: "rgba(255,255,255,0.06)",
											}}
										/>
										<button
											type="button"
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
													: "var(--color-inferay-accent)",
											}}
											title="Save"
										>
											<IconCheck size={11} />
										</button>
										<button
											type="button"
											onClick={() => setEditingQueueId(null)}
											className="shrink-0 p-0.5 rounded transition-colors"
											style={{
												color: theme ? fgDim : "var(--color-inferay-text-3)",
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
												color: theme ? fgColor : "var(--color-inferay-text)",
											}}
										>
											{qm.displayText}
										</span>
										<div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
											<button
												type="button"
												onClick={() => {
													setEditingQueueId(qm.id);
													setEditingQueueText(qm.text);
												}}
												className="p-0.5 rounded transition-colors hover:bg-white/10"
												style={{
													color: theme ? fgDim : "var(--color-inferay-text-3)",
												}}
												title="Edit"
											>
												<IconPencil size={11} />
											</button>
											<button
												type="button"
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
							borderTop: `1px solid ${theme ? borderColor : "var(--color-inferay-border)"}`,
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
												border: `1px solid ${theme ? borderColor : "var(--color-inferay-border)"}`,
											}}
										/>
										<button
											type="button"
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
									color: theme ? fgDim : "var(--color-inferay-text-3)",
									backgroundColor: "transparent",
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.backgroundColor = theme
										? `${cursorColor}15`
										: "rgba(255,255,255,0.06)";
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.backgroundColor = "transparent";
								}}
								title="Attach image"
							>
								<svg
									aria-hidden="true"
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
								{fileMenu.show && fileResults.length > 0 && (
									<div
										className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border shadow-lg overflow-y-auto z-[9999]"
										style={{
											maxHeight: 300,
											backgroundColor: theme
												? surfaceColor
												: "var(--color-inferay-surface)",
											borderColor: theme
												? borderColor
												: "var(--color-inferay-border)",
										}}
									>
										<div
											className="px-3 py-1.5 text-[9px] font-semibold tracking-wide"
											style={{
												color: theme ? fgDim : "var(--color-inferay-text-3)",
												borderBottom: `1px solid ${theme ? borderColor : "var(--color-inferay-border)"}`,
											}}
										>
											FILES
											{fileMenu.query ? ` matching "${fileMenu.query}"` : ""}
										</div>
										{fileResults.map((file, idx) => (
											<button
												type="button"
												key={file.path}
												onClick={() => selectFile(idx)}
												onMouseEnter={() =>
													setFileMenu((prev) => ({
														...prev,
														selectedIdx: idx,
													}))
												}
												className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors"
												style={{
													backgroundColor:
														idx === fileMenu.selectedIdx
															? theme
																? `${cursorColor}20`
																: "rgba(0,122,255,0.15)"
															: "transparent",
												}}
											>
												<span
													className="shrink-0 text-[11px]"
													style={{
														color: theme
															? fgDim
															: "var(--color-inferay-text-3)",
													}}
												>
													{file.isDir ? "\u{1F4C1}" : "\u{1F4C4}"}
												</span>
												<span
													className="truncate font-mono text-[11px] font-medium"
													style={{
														color: theme
															? cursorColor
															: "var(--color-inferay-accent)",
													}}
												>
													{file.name}
												</span>
												<span
													className="flex-1 truncate text-right text-[9px]"
													style={{
														color: theme
															? fgDim
															: "var(--color-inferay-text-3)",
													}}
												>
													{file.path}
												</span>
											</button>
										))}
									</div>
								)}
								{/* / command menu - Skills dropdown */}
								{showCommands && filteredCommands.length > 0 && (
									<div
										className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border shadow-2xl overflow-hidden z-[9999]"
										style={{
											maxHeight: 320,
											backgroundColor: "#1a1a1a",
											borderColor: "#333",
										}}
									>
										{/* Skills header */}
										<div
											className="px-3 py-2 text-[10px] font-medium tracking-wide uppercase"
											style={{ color: "#888" }}
										>
											Skills
										</div>
										<div className="overflow-y-auto" style={{ maxHeight: 280 }}>
											{filteredCommands.map((cmd, idx) => {
												const isSelected = idx === slashMenu.selectedIdx;
												return (
													<button
														type="button"
														key={cmd.id || cmd.name}
														onClick={() => selectCommand(idx)}
														onMouseEnter={() =>
															setSlashMenu((prev) => ({
																...prev,
																selectedIdx: idx,
															}))
														}
														className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors"
														style={{
															backgroundColor: isSelected
																? "#2a2a2a"
																: "transparent",
														}}
													>
														<span
															className="font-mono text-[12px] font-medium"
															style={{
																color: isSelected ? "#f5a623" : "#e5e5e5",
															}}
														>
															/{cmd.name}
														</span>
														<span
															className="text-[11px]"
															style={{ color: "#888" }}
														>
															{cmd.description}
														</span>
													</button>
												);
											})}
										</div>
									</div>
								)}
								{/* Textarea with highlight backdrop */}
								<div
									className="relative flex-1 rounded-lg overflow-hidden"
									style={{
										backgroundColor: theme
											? surfaceColor
											: "var(--color-inferay-surface)",
										maxHeight: "120px",
									}}
								>
									{/* Backdrop div that shows highlighted text - scrolls with textarea */}
									<div
										ref={highlightOverlayRef}
										className="absolute top-0 left-0 right-0 px-3 py-2 pr-10 text-[12px] pointer-events-none whitespace-pre-wrap"
										style={{
											lineHeight: "18px",
											wordBreak: "break-word",
											overflowWrap: "break-word",
										}}
										aria-hidden="true"
									>
										{inputHighlights}
									</div>
									<textarea
										ref={textareaRef}
										value={input}
										onChange={(e) => {
											const val = e.target.value;
											setInput(val);
											const cursor = e.target.selectionStart ?? val.length;
											handleInputForFileMenu(val, cursor);
											handleInputForSlashMenu(val, cursor);
											// Height is managed by useEffect with pretext - just sync overlay scroll
											if (highlightOverlayRef.current) {
												highlightOverlayRef.current.style.transform = `translateY(-${e.target.scrollTop}px)`;
											}
										}}
										onScroll={(e) => {
											// Move overlay up/down to match textarea scroll
											if (highlightOverlayRef.current) {
												highlightOverlayRef.current.style.transform = `translateY(-${e.currentTarget.scrollTop}px)`;
											}
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
										className="relative block w-full resize-none rounded-lg px-3 py-2 pr-10 text-[12px] outline-none ring-0 border-none shadow-none focus:outline-none focus:ring-0 focus:border-none focus:shadow-none bg-transparent overflow-y-auto scrollbar-none"
										style={{
											minHeight: "36px",
											color: "transparent",
											caretColor: theme
												? cursorColor
												: "var(--color-inferay-text)",
											WebkitTextFillColor: "transparent",
											lineHeight: "18px",
											wordBreak: "break-word",
											overflowWrap: "break-word",
										}}
									/>
								</div>
								{isLoading && (
									<div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
										<span
											className="h-1 w-1 rounded-full animate-pulse"
											style={
												theme
													? { backgroundColor: `${cursorColor}b3` }
													: undefined
											}
										/>
										<span
											className="h-1 w-1 rounded-full animate-pulse"
											style={
												theme
													? {
															backgroundColor: `${cursorColor}b3`,
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
															backgroundColor: `${cursorColor}b3`,
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

				{/* Markdown file preview modal */}
				{mdPreview.show && (
					<div
						className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
						onClick={() =>
							setMdPreview({
								show: false,
								path: "",
								content: null,
								loading: false,
								error: null,
							})
						}
					>
						<div
							className="relative w-[90%] max-w-2xl max-h-[80%] rounded-lg border overflow-hidden flex flex-col"
							style={{
								backgroundColor: theme ? bgColor : "var(--color-inferay-bg)",
								borderColor: theme
									? borderColor
									: "var(--color-inferay-border)",
							}}
							onClick={(e) => e.stopPropagation()}
						>
							{/* Header */}
							<div
								className="flex items-center justify-between px-3 py-2 border-b"
								style={{
									borderColor: theme
										? borderColor
										: "var(--color-inferay-border)",
								}}
							>
								<span
									className="text-[11px] font-medium truncate"
									style={{
										color: theme ? fgColor : "var(--color-inferay-text)",
									}}
								>
									{mdPreview.path}
								</span>
								<button
									type="button"
									onClick={() =>
										setMdPreview({
											show: false,
											path: "",
											content: null,
											loading: false,
											error: null,
										})
									}
									className="p-1 rounded hover:bg-white/10 transition-colors"
								>
									<IconX
										className="w-3.5 h-3.5"
										style={{
											color: theme ? fgDim : "var(--color-inferay-text-3)",
										}}
									/>
								</button>
							</div>
							{/* Content */}
							<div
								className="flex-1 overflow-y-auto p-4 text-[12px]"
								style={{
									color: theme ? fgColor : "var(--color-inferay-text)",
								}}
							>
								{mdPreview.loading && (
									<div className="flex items-center justify-center py-8">
										<span
											className="text-[10px]"
											style={{
												color: theme ? fgDim : "var(--color-inferay-text-3)",
											}}
										>
											Loading...
										</span>
									</div>
								)}
								{mdPreview.error && (
									<div className="flex items-center justify-center py-8">
										<span className="text-[10px] text-inferay-error">
											{mdPreview.error}
										</span>
									</div>
								)}
								{mdPreview.content && (
									<Markdown text={mdPreview.content} theme={bubbleTheme} />
								)}
							</div>
						</div>
					</div>
				)}
			</div>
		);
	}
);

// Simple message list - no virtualization to avoid scroll conflicts
// The parent container handles all scrolling
function MessageList({
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
	onMdFileClick,
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
	onMdFileClick?: (path: string) => void;
}) {
	const renderItems = useMemo(() => buildRenderItems(messages), [messages]);

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
				if (item.type === "edit-group") {
					return (
						<GroupedEditViewer
							key={`edit-group-${item.filePath}-${idx}`}
							filePath={item.filePath}
							edits={item.edits}
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
							onMdFileClick={onMdFileClick}
						/>
						{msg.role === "assistant" &&
							!msg.isStreaming &&
							(() => {
								const cp = checkpoints.find((c) => c.afterMessageId === msg.id);
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

const Bubble = React.memo(function Bubble({
	msg,
	collapsed,
	onToggle,
	theme,
	onSendMessage,
	onMdFileClick,
}: {
	msg: ChatMessage;
	collapsed: boolean;
	onToggle: (id: string) => void;
	theme?: BubbleTheme;
	onSendMessage?: (text: string) => void;
	onMdFileClick?: (path: string) => void;
}) {
	if (msg.role === "user") {
		// Skip rendering user message if it's a slash command (the system "Running /..." message will show instead)
		if (msg.content.match(/^\/([a-zA-Z0-9_-]+)(\s|$)/)) {
			return null;
		}

		// Extract image paths from content if not in msg.images
		// Pattern: "Here are the images at these paths:\n/path/to/image.png"
		let imagePaths = msg.images ?? [];
		let displayContent = msg.content;
		if (
			imagePaths.length === 0 &&
			msg.content.includes("Here are the images at these paths:")
		) {
			const parts = msg.content.split("Here are the images at these paths:\n");
			displayContent = parts[0]?.trim() ?? "";
			const pathLines = parts[1]?.split("\n").filter((p) => p.trim()) ?? [];
			imagePaths = pathLines.filter((p) => p.includes("/.tmp/"));
		}

		return (
			<div className="flex justify-end">
				<div className="max-w-[85%] rounded-lg rounded-br-sm px-2.5 py-1.5">
					{imagePaths.length > 0 && (
						<div className="flex flex-wrap gap-1.5 mb-1.5">
							{imagePaths.map((imgPath) => (
								<img
									key={imgPath}
									src={`/api/file?path=${encodeURIComponent(imgPath)}`}
									alt=""
									className="rounded max-h-24 max-w-32 object-cover"
									style={{
										border: `1px solid ${theme?.fgDim ?? "rgba(255,255,255,0.2)"}`,
									}}
								/>
							))}
						</div>
					)}
					{displayContent && (
						<p
							className="whitespace-pre-wrap break-words text-[12px]"
							style={theme ? { color: theme.fg } : undefined}
						>
							{parseTextWithPills(
								displayContent,
								theme ? { cursor: theme.cursor, fg: theme.fg } : undefined
							)}
						</p>
					)}
				</div>
			</div>
		);
	}

	if (msg.role === "system") {
		const runningMatch = msg.content.match(/^Running \/(.+)\.\.\.$/);
		if (runningMatch?.[1]) {
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
				style={{ color: theme ? theme.fgDim : "var(--color-inferay-text-3)" }}
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
								color: theme ? theme.fgDim : "var(--color-inferay-text-3)",
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
						<Markdown
							text={msg.content}
							theme={theme}
							onMdFileClick={onMdFileClick}
						/>
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

		// Edit tool renders as a standalone diff viewer (even while streaming if we can parse it)
		if (msg.toolName === "Edit" && msg.content) {
			try {
				const parsed = JSON.parse(msg.content);
				if (
					parsed.file_path &&
					parsed.old_string !== undefined &&
					parsed.new_string !== undefined
				) {
					return (
						<MiniDiffViewer
							oldStr={parsed.old_string}
							newStr={parsed.new_string}
							filePath={parsed.file_path}
							theme={theme}
							isStreaming={msg.isStreaming}
						/>
					);
				}
			} catch {
				// JSON not complete yet during streaming - fall through to normal tool rendering
			}
		}

		return (
			<div>
				<button
					type="button"
					onClick={() => onToggle(msg.id)}
					className="flex items-center gap-1 text-[10px]"
					style={theme ? { color: theme.fgDim } : undefined}
				>
					<svg
						aria-hidden="true"
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
								theme ? { backgroundColor: `${theme.cursor}99` } : undefined
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
			<Markdown
				text={msg.content}
				theme={theme}
				onMdFileClick={onMdFileClick}
			/>
			{msg.isStreaming && (
				<span
					className="inline-block ml-0.5 h-2.5 w-[1.5px] animate-pulse align-text-bottom"
					style={theme ? { backgroundColor: `${theme.cursor}b3` } : undefined}
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

// Status icon component - extracted to avoid recreating on every render
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

// Memoized status bar to prevent re-renders from parent state changes
const StatusBar = React.memo(function StatusBar({
	status,
	elapsedTime,
	queuedCount,
	isLoading,
	onStop,
	theme,
	cursorColor,
	borderColor,
	bgColor,
	fgDim,
}: {
	status: string;
	elapsedTime: number;
	queuedCount: number;
	isLoading: boolean;
	onStop: () => void;
	theme?: { bg: string; fg: string; cursor: string };
	cursorColor: string;
	borderColor?: string;
	bgColor: string;
	fgDim: string;
}) {
	// Don't render anything when idle - avoids layout shift
	if (status === "idle") return null;

	const statusInfo = getStatusInfo(status);
	const statusColor = theme ? cursorColor : undefined;
	const iconClassName = `shrink-0 ${theme ? "" : statusInfo.iconColor} ${statusInfo.isActive ? "animate-pulse" : ""}`;

	return (
		<div
			className="shrink-0 px-3 py-1.5 flex items-center gap-2"
			style={{
				borderTop: `1px solid ${theme ? borderColor : "var(--color-inferay-border)"}`,
				backgroundColor: theme ? bgColor : "var(--color-inferay-bg)",
			}}
		>
			<StatusIcon
				iconType={statusInfo.iconType}
				size={13}
				className={iconClassName}
				style={theme ? { color: statusColor } : undefined}
			/>
			<span
				className={`text-[10px] font-medium ${theme ? "" : statusInfo.textColor}`}
				style={theme ? { color: statusColor } : undefined}
			>
				{statusInfo.toolName ? (
					<>
						Running <span className="font-mono">{statusInfo.toolName}</span>
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
						color: theme ? fgDim : "var(--color-inferay-text-3)",
					}}
				>
					{formatElapsedTime(elapsedTime)}
				</span>
			)}
			{queuedCount > 0 && (
				<span
					className="px-1.5 py-0.5 rounded text-[9px] font-medium tabular-nums"
					style={{
						backgroundColor: theme
							? `${cursorColor}20`
							: "rgba(0,122,255,0.15)",
						color: theme ? cursorColor : "var(--color-inferay-accent)",
					}}
				>
					{queuedCount} queued
				</span>
			)}
			{isLoading && (
				<button
					type="button"
					onClick={onStop}
					className="p-1 rounded-md transition-all border"
					style={{
						color: theme ? fgDim : "var(--color-inferay-text-3)",
						backgroundColor: theme
							? `${bgColor}`
							: "var(--color-inferay-surface)",
						borderColor: theme ? borderColor : "var(--color-inferay-border)",
					}}
					title="Stop"
				>
					<IconPause size={10} />
				</button>
			)}
		</div>
	);
});

// Bottom toolbar showing status, activity pill, and stop button
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

	// Extract tool activity from messages
	const toolActivities = useMemo(() => {
		const activities: {
			id: string;
			toolName: string;
			isStreaming: boolean;
			summary: string;
		}[] = [];

		for (const msg of messages) {
			if (msg.role === "tool" && msg.toolName) {
				let summary = "";
				try {
					if (msg.content) {
						const parsed = JSON.parse(msg.content);
						if (parsed.file_path) {
							summary = parsed.file_path.split("/").pop() || parsed.file_path;
						} else if (parsed.command) {
							const cmd = parsed.command.slice(0, 40);
							summary = `${cmd}${parsed.command.length > 40 ? "..." : ""}`;
						} else if (parsed.pattern) {
							summary = `/${parsed.pattern.slice(0, 30)}/`;
						} else if (parsed.query) {
							summary = parsed.query.slice(0, 40);
						} else if (parsed.url) {
							try {
								const url = new URL(parsed.url);
								summary = url.hostname;
							} catch {
								summary = parsed.url.slice(0, 40);
							}
						} else if (parsed.skill) {
							summary = `/${parsed.skill}`;
						} else if (parsed.prompt) {
							summary = parsed.prompt.slice(0, 40);
						}
					}
				} catch {}
				activities.push({
					id: msg.id,
					toolName: msg.toolName,
					isStreaming: msg.isStreaming ?? false,
					summary: summary || msg.toolName,
				});
			}
		}
		return activities;
	}, [messages]);

	if (!isLoading) return null;

	// If we have tool activities from messages, use those.
	// Otherwise, derive activity from the current status (helps with timing before tool message arrives)
	const latestActivity = toolActivities[toolActivities.length - 1];
	const statusToolName = status?.startsWith("tool:") ? status.slice(5) : null;

	// Show either tool activities or status-derived activity
	const hasActivity = toolActivities.length > 0 || statusToolName;

	const getToolIcon = (toolName: string) => {
		const baseClass = "w-3 h-3 shrink-0";
		switch (toolName.toLowerCase()) {
			case "read":
				return (
					<svg
						className={baseClass}
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
						<circle cx="12" cy="12" r="3" />
					</svg>
				);
			case "edit":
			case "patch": // Codex patch tool
				return (
					<svg
						className={baseClass}
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
						<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
					</svg>
				);
			case "write":
				return (
					<svg
						className={baseClass}
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
						<polyline points="14 2 14 8 20 8" />
						<line x1="12" y1="18" x2="12" y2="12" />
						<line x1="9" y1="15" x2="15" y2="15" />
					</svg>
				);
			case "bash":
			case "exec": // Codex exec tool
				return (
					<svg
						className={baseClass}
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<polyline points="4 17 10 11 4 5" />
						<line x1="12" y1="19" x2="20" y2="19" />
					</svg>
				);
			case "grep":
			case "glob":
				return (
					<svg
						className={baseClass}
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<circle cx="11" cy="11" r="8" />
						<line x1="21" y1="21" x2="16.65" y2="16.65" />
					</svg>
				);
			case "web_search": // Codex web search
			case "websearch":
			case "webfetch":
				return (
					<svg
						className={baseClass}
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<circle cx="12" cy="12" r="10" />
						<line x1="2" y1="12" x2="22" y2="12" />
						<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
					</svg>
				);
			default:
				return (
					<svg
						className={baseClass}
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
					</svg>
				);
		}
	};

	// Determine the display name and count
	const displayToolName = latestActivity?.toolName ?? statusToolName;
	const displaySummary = latestActivity?.summary ?? statusToolName;
	const activityCount = toolActivities.length;

	return (
		<div className="shrink-0 flex items-center justify-between gap-2 px-3 py-1.5 bg-inferay-bg border-t border-inferay-border">
			{/* Left side: Activity pill with hover dropdown */}
			{hasActivity ? (
				<div
					className="relative"
					onMouseEnter={() => setIsHovered(true)}
					onMouseLeave={() => setIsHovered(false)}
				>
					{/* The pill */}
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

					{/* Dropdown (appears above) - only show if we have tool activities */}
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

			{/* Right side: Stop button with icon */}
			<button
				type="button"
				onClick={onStop}
				className="shrink-0 flex items-center gap-1.5 h-6 px-2 rounded-md text-[10px] font-medium transition-all bg-inferay-surface-2 text-inferay-text-2 hover:bg-inferay-surface-3 border border-inferay-border"
			>
				<svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
					<rect x="6" y="6" width="12" height="12" rx="1" />
				</svg>
				Stop
			</button>
		</div>
	);
});

function Markdown({
	text,
	theme,
	onMdFileClick,
}: {
	text: string;
	theme?: BubbleTheme;
	onMdFileClick?: (path: string) => void;
}) {
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
								<Inline
									text={b.content}
									theme={theme}
									onMdFileClick={onMdFileClick}
								/>
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
													<Inline
														text={cell}
														theme={theme}
														onMdFileClick={onMdFileClick}
													/>
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
						<Inline
							text={b.content}
							theme={theme}
							onMdFileClick={onMdFileClick}
						/>
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
			while (i < lines.length && !lines[i]?.trimStart().startsWith("```")) {
				code.push(lines[i]!);
				i++;
			}
			i++;
			blocks.push({ type: "code", content: code.join("\n") });
			continue;
		}
		const hm = line.match(/^(#{1,4})\s+(.+)/);
		if (hm) {
			blocks.push({
				type: "heading",
				content: hm[2] ?? "",
				level: hm[1]?.length ?? 1,
			});
			i++;
			continue;
		}
		const lm = line.match(/^(\s*(?:[-*]|\d+\.)\s+)(.+)/);
		if (lm) {
			blocks.push({
				type: "list-item",
				content: lm[2] ?? "",
				bullet: lm[1]?.trim() ?? "-",
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
				lines[i]?.trim().startsWith("|") &&
				lines[i]?.trim().endsWith("|")
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
				const startRow = tableLines[1]?.trim().match(/^\|[\s:?-]+\|/) ? 2 : 1;
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
			lines[i]?.trim() &&
			!lines[i]?.trimStart().startsWith("```") &&
			!lines[i]?.match(/^#{1,4}\s+/) &&
			!lines[i]?.match(/^\s*(?:[-*]|\d+\.)\s+/)
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
								aria-hidden="true"
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
										backgroundColor: `${accentColor}18`,
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
											type="button"
											key={oi}
											onClick={() => toggleOption(qi, oi, !!q.multiSelect)}
											disabled={submitted}
											className="flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-left transition-all"
											style={{
												backgroundColor: isSelected
													? `${accentColor}18`
													: theme
														? `${theme.bg}80`
														: "rgba(0,0,0,0.15)",
												border: `1px solid ${isSelected ? `${accentColor}50` : borderClr}`,
												cursor: submitted ? "default" : "pointer",
												opacity: submitted && !isSelected ? 0.4 : 1,
											}}
										>
											<span
												className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold transition-colors"
												style={{
													backgroundColor: isSelected
														? accentColor
														: `${accentColor}20`,
													color: isSelected ? "#fff" : accentColor,
												}}
											>
												{isSelected ? (
													<svg
														aria-hidden="true"
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
					type="button"
					onClick={handleSubmit}
					disabled={!hasSelections}
					className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition-all"
					style={{
						backgroundColor: hasSelections ? accentColor : `${accentColor}30`,
						color: hasSelections ? "#fff" : fgDim,
						cursor: hasSelections ? "pointer" : "not-allowed",
						opacity: hasSelections ? 1 : 0.6,
					}}
				>
					<svg
						aria-hidden="true"
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
						aria-hidden="true"
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

// ---------------------------------------------------------------------------
// Mini diff viewer — inline diff for Edit tool operations with syntax highlighting
// ---------------------------------------------------------------------------

const SYNTAX_TOKEN_CLASSES: Record<string, string> = {
	keyword: "text-syntax-keyword",
	string: "text-syntax-string",
	comment: "text-syntax-comment",
	number: "text-syntax-number",
	punctuation: "text-syntax-punctuation",
	tag: "text-syntax-tag",
	attr: "text-syntax-attr",
	default: "",
};

// Compute diff hunks between old and new strings
// Returns array of hunks, each containing lines with type: 'context' | 'removed' | 'added'
function computeDiffHunks(
	oldStr: string,
	newStr: string,
	contextLines = 2
): {
	type: "context" | "removed" | "added";
	text: string;
	oldLineNum?: number;
	newLineNum?: number;
}[][] {
	const oldLines = oldStr.split("\n");
	const newLines = newStr.split("\n");

	// Simple LCS-based diff
	const lcs: number[][] = [];
	for (let i = 0; i <= oldLines.length; i++) {
		lcs[i] = [];
		for (let j = 0; j <= newLines.length; j++) {
			if (i === 0 || j === 0) {
				lcs[i][j] = 0;
			} else if (oldLines[i - 1] === newLines[j - 1]) {
				lcs[i][j] = lcs[i - 1]![j - 1]! + 1;
			} else {
				lcs[i][j] = Math.max(lcs[i - 1]![j]!, lcs[i]![j - 1]!);
			}
		}
	}

	// Backtrack to get diff operations
	const ops: {
		type: "equal" | "delete" | "insert";
		oldIdx?: number;
		newIdx?: number;
	}[] = [];
	let i = oldLines.length;
	let j = newLines.length;
	while (i > 0 || j > 0) {
		if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
			ops.unshift({ type: "equal", oldIdx: i - 1, newIdx: j - 1 });
			i--;
			j--;
		} else if (j > 0 && (i === 0 || lcs[i]![j - 1]! >= lcs[i - 1]![j]!)) {
			ops.unshift({ type: "insert", newIdx: j - 1 });
			j--;
		} else {
			ops.unshift({ type: "delete", oldIdx: i - 1 });
			i--;
		}
	}

	// Convert to diff lines
	const diffLines: {
		type: "context" | "removed" | "added";
		text: string;
		oldLineNum?: number;
		newLineNum?: number;
		opIdx: number;
	}[] = [];
	for (let idx = 0; idx < ops.length; idx++) {
		const op = ops[idx]!;
		if (op.type === "equal") {
			diffLines.push({
				type: "context",
				text: oldLines[op.oldIdx!]!,
				oldLineNum: op.oldIdx! + 1,
				newLineNum: op.newIdx! + 1,
				opIdx: idx,
			});
		} else if (op.type === "delete") {
			diffLines.push({
				type: "removed",
				text: oldLines[op.oldIdx!]!,
				oldLineNum: op.oldIdx! + 1,
				opIdx: idx,
			});
		} else {
			diffLines.push({
				type: "added",
				text: newLines[op.newIdx!]!,
				newLineNum: op.newIdx! + 1,
				opIdx: idx,
			});
		}
	}

	// Group into hunks with context
	const hunks: {
		type: "context" | "removed" | "added";
		text: string;
		oldLineNum?: number;
		newLineNum?: number;
	}[][] = [];
	let currentHunk: (typeof hunks)[0] = [];
	let lastChangeIdx = -999;

	for (let idx = 0; idx < diffLines.length; idx++) {
		const line = diffLines[idx]!;
		const isChange = line.type !== "context";

		if (isChange) {
			// Add context lines before this change
			const contextStart = Math.max(
				lastChangeIdx + contextLines + 1,
				idx - contextLines
			);
			for (let c = contextStart; c < idx; c++) {
				const contextLine = diffLines[c];
				if (contextLine && contextLine.type === "context") {
					currentHunk.push({
						type: contextLine.type,
						text: contextLine.text,
						oldLineNum: contextLine.oldLineNum,
						newLineNum: contextLine.newLineNum,
					});
				}
			}
			currentHunk.push({
				type: line.type,
				text: line.text,
				oldLineNum: line.oldLineNum,
				newLineNum: line.newLineNum,
			});
			lastChangeIdx = idx;
		} else if (idx - lastChangeIdx <= contextLines && lastChangeIdx >= 0) {
			// Context line within range after a change
			currentHunk.push({
				type: line.type,
				text: line.text,
				oldLineNum: line.oldLineNum,
				newLineNum: line.newLineNum,
			});
		} else if (currentHunk.length > 0 && idx - lastChangeIdx > contextLines) {
			// End of hunk
			hunks.push(currentHunk);
			currentHunk = [];
		}
	}

	if (currentHunk.length > 0) {
		hunks.push(currentHunk);
	}

	return hunks;
}

function MiniDiffViewer({
	oldStr,
	newStr,
	filePath,
	theme,
	isStreaming,
}: {
	oldStr: string;
	newStr: string;
	filePath: string;
	theme?: BubbleTheme;
	isStreaming?: boolean;
}) {
	const fileName = filePath.split("/").pop() || filePath;

	// Compute hunks with minimal context (just 1 line)
	const { hunks, stats, totalChanges, allLines } = useMemo(() => {
		const computedHunks = computeDiffHunks(oldStr, newStr, 1);
		let added = 0;
		let removed = 0;
		const lines: string[] = [];
		for (const hunk of computedHunks) {
			for (const line of hunk) {
				if (line.type === "added") added++;
				else if (line.type === "removed") removed++;
				// Collect all lines for highlighting
				if (line.type !== "context" && line.text.trim() !== "") {
					lines.push(line.text);
				}
			}
		}
		return {
			hunks: computedHunks,
			stats: { added, removed },
			totalChanges: added + removed,
			allLines: lines,
		};
	}, [oldStr, newStr]);

	// Use Shiki for syntax highlighting
	const { highlighted, isReady } = useShikiSnippet(allLines, filePath, true);

	// Auto-expand for small diffs (3 lines or less), collapse for larger ones
	const [isExpanded, setIsExpanded] = useState(totalChanges <= 3);

	// Colors
	const removedBg = "rgba(248,81,73,0.12)";
	const removedBorder = "rgba(248,81,73,0.5)";
	const addedBg = "rgba(46,160,67,0.12)";
	const addedBorder = "rgba(46,160,67,0.5)";

	// Track line index for highlighting lookup
	let globalLineIdx = 0;

	return (
		<div
			className="rounded-lg border overflow-hidden text-[10px] font-mono"
			style={{
				backgroundColor: theme?.surface ?? "var(--color-inferay-surface)",
				borderColor: theme?.border ?? "var(--color-inferay-border)",
			}}
		>
			{/* Compact header - clickable to expand */}
			<button
				type="button"
				onClick={() => setIsExpanded(!isExpanded)}
				className="w-full flex items-center gap-1.5 px-2 py-1 text-[9px] font-medium text-left hover:opacity-80 transition-all"
				style={{
					color: theme?.fg ?? "var(--color-inferay-text-2)",
					backgroundColor: theme?.bg ?? "var(--color-inferay-surface-2)",
					borderBottom: isExpanded
						? `1px solid ${theme?.border ?? "var(--color-inferay-border)"}`
						: "none",
				}}
			>
				{/* Chevron */}
				<svg
					className={`w-2.5 h-2.5 opacity-40 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<polyline points="9 18 15 12 9 6" />
				</svg>
				{/* File icon or streaming indicator */}
				{isStreaming ? (
					<span className="w-2 h-2 rounded-full bg-current opacity-50 animate-pulse" />
				) : (
					<svg
						className="w-2.5 h-2.5 opacity-40"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
						<polyline points="14 2 14 8 20 8" />
					</svg>
				)}
				<span className="flex-1 truncate opacity-80">{fileName}</span>
				{/* Stats */}
				<span className="flex items-center gap-1 text-[8px]">
					{stats.added > 0 && (
						<span style={{ color: "rgba(46,160,67,0.8)" }}>+{stats.added}</span>
					)}
					{stats.removed > 0 && (
						<span style={{ color: "rgba(248,81,73,0.8)" }}>
							−{stats.removed}
						</span>
					)}
				</span>
			</button>
			{/* Diff content - collapsible */}
			{isExpanded && (
				<div className="max-h-60 overflow-auto">
					{hunks.map((hunk, hunkIdx) => {
						// Reset line counter for each render
						let hunkLineIdx = globalLineIdx;

						return (
							<div key={hunkIdx}>
								{/* Subtle hunk separator - just a thin line */}
								{hunkIdx > 0 && (
									<div
										className="h-px my-0.5"
										style={{
											backgroundColor:
												theme?.border ?? "var(--color-inferay-border)",
											opacity: 0.3,
										}}
									/>
								)}
								{/* Hunk lines - skip context lines and empty lines */}
								{hunk
									.filter(
										(line) => line.type !== "context" && line.text.trim() !== ""
									)
									.map((line, lineIdx) => {
										const currentLineIdx = hunkLineIdx++;
										const highlightedHtml = highlighted.get(currentLineIdx);
										const isRemoved = line.type === "removed";
										const isAdded = line.type === "added";

										// Update global counter
										if (
											hunkIdx === hunks.length - 1 &&
											lineIdx ===
												hunk.filter(
													(l) => l.type !== "context" && l.text.trim() !== ""
												).length -
													1
										) {
											globalLineIdx = currentLineIdx + 1;
										}

										return (
											<div
												key={`${hunkIdx}-${lineIdx}`}
												className="flex leading-[12px]"
												style={{
													backgroundColor: isRemoved
														? removedBg
														: isAdded
															? addedBg
															: "transparent",
													borderLeft: `2px solid ${isRemoved ? removedBorder : isAdded ? addedBorder : "transparent"}`,
												}}
											>
												<span
													className="shrink-0 w-4 text-center select-none text-[8px]"
													style={{
														color: isRemoved
															? "rgba(248,81,73,0.7)"
															: "rgba(46,160,67,0.7)",
													}}
												>
													{isRemoved ? "−" : "+"}
												</span>
												<span
													className="flex-1 whitespace-pre pr-1 overflow-hidden text-[8px] shiki-line"
													style={{
														color: theme?.fg ?? "var(--color-inferay-text)",
													}}
													dangerouslySetInnerHTML={
														isReady && highlightedHtml
															? { __html: highlightedHtml }
															: undefined
													}
												>
													{!(isReady && highlightedHtml)
														? line.text || " "
														: undefined}
												</span>
											</div>
										);
									})}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

// Applies a series of edits to build the final content, then diffs against original
function applyEditsSequentially(
	edits: { old_string: string; new_string: string }[]
): { originalText: string; finalText: string } | null {
	if (edits.length === 0) return null;

	// The first edit's old_string is our starting point
	// We'll track what the "original" would look like and what the "final" is
	let currentText = edits[0]!.old_string;
	const originalText = currentText;

	for (const edit of edits) {
		// Apply this edit
		const idx = currentText.indexOf(edit.old_string);
		if (idx !== -1) {
			currentText =
				currentText.slice(0, idx) +
				edit.new_string +
				currentText.slice(idx + edit.old_string.length);
		} else {
			// old_string not found - this edit might be based on a different state
			// Try to find partial match or just append the new content
			currentText = edit.new_string;
		}
	}

	return { originalText, finalText: currentText };
}

function GroupedEditViewer({
	filePath,
	edits,
	theme,
}: {
	filePath: string;
	edits: ChatMessage[];
	theme?: BubbleTheme;
}) {
	const fileName = filePath.split("/").pop() || filePath;
	const editCount = edits.length;

	// Parse all edits and compute combined diff
	const { hunks, stats, totalChanges, allLines } = useMemo(() => {
		const parsedEdits: { old_string: string; new_string: string }[] = [];

		for (const edit of edits) {
			if (!edit.content) continue;
			try {
				const parsed = JSON.parse(edit.content);
				if (
					parsed.old_string !== undefined &&
					parsed.new_string !== undefined
				) {
					parsedEdits.push({
						old_string: parsed.old_string,
						new_string: parsed.new_string,
					});
				}
			} catch {}
		}

		const result = applyEditsSequentially(parsedEdits);
		if (!result) {
			return { hunks: [], stats: { added: 0, removed: 0 }, allLines: [] };
		}

		const computedHunks = computeDiffHunks(
			result.originalText,
			result.finalText,
			1
		);

		// Count added/removed lines and collect lines for highlighting
		let added = 0;
		let removed = 0;
		const lines: string[] = [];
		for (const hunk of computedHunks) {
			for (const line of hunk) {
				if (line.type === "added") added++;
				else if (line.type === "removed") removed++;
				// Collect all lines for highlighting
				if (line.type !== "context" && line.text.trim() !== "") {
					lines.push(line.text);
				}
			}
		}

		const total = added + removed;
		return {
			hunks: computedHunks,
			stats: { added, removed },
			totalChanges: total,
			allLines: lines,
		};
	}, [edits]);

	// Use Shiki for syntax highlighting
	const { highlighted, isReady } = useShikiSnippet(allLines, filePath, true);

	// Auto-expand for small diffs (4 lines or less), collapse for larger ones
	const [isExpanded, setIsExpanded] = useState(() => (totalChanges ?? 0) <= 4);

	// Colors
	const removedBg = "rgba(248,81,73,0.12)";
	const removedBorder = "rgba(248,81,73,0.5)";
	const addedBg = "rgba(46,160,67,0.12)";
	const addedBorder = "rgba(46,160,67,0.5)";

	if (hunks.length === 0) {
		return null;
	}

	// Track line index for highlighting lookup
	let globalLineIdx = 0;

	return (
		<div
			className="rounded-lg border overflow-hidden text-[10px] font-mono"
			style={{
				backgroundColor: theme?.surface ?? "var(--color-inferay-surface)",
				borderColor: theme?.border ?? "var(--color-inferay-border)",
			}}
		>
			{/* Compact header - clickable to expand */}
			<button
				type="button"
				onClick={() => setIsExpanded(!isExpanded)}
				className="w-full flex items-center gap-1.5 px-2 py-1 text-[9px] font-medium text-left hover:opacity-80 transition-all"
				style={{
					color: theme?.fg ?? "var(--color-inferay-text-2)",
					backgroundColor: theme?.bg ?? "var(--color-inferay-surface-2)",
					borderBottom: isExpanded
						? `1px solid ${theme?.border ?? "var(--color-inferay-border)"}`
						: "none",
				}}
			>
				{/* Chevron */}
				<svg
					className={`w-2.5 h-2.5 opacity-40 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<polyline points="9 18 15 12 9 6" />
				</svg>
				{/* File icon */}
				<svg
					className="w-2.5 h-2.5 opacity-40"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
					<polyline points="14 2 14 8 20 8" />
				</svg>
				<span className="flex-1 truncate opacity-80">{fileName}</span>
				{/* Stats */}
				<span className="flex items-center gap-1 text-[8px]">
					{stats.added > 0 && (
						<span style={{ color: "rgba(46,160,67,0.8)" }}>+{stats.added}</span>
					)}
					{stats.removed > 0 && (
						<span style={{ color: "rgba(248,81,73,0.8)" }}>
							−{stats.removed}
						</span>
					)}
				</span>
				<span
					className="text-[8px] px-1 py-px rounded opacity-60"
					style={{
						backgroundColor: theme?.surface ?? "var(--color-inferay-surface)",
						color: theme?.fgDim ?? "var(--color-inferay-text-3)",
					}}
				>
					{editCount}×
				</span>
			</button>
			{/* Diff content - collapsible */}
			{isExpanded && (
				<div className="max-h-60 overflow-auto">
					{hunks.map((hunk, hunkIdx) => {
						// Reset line counter for each render
						let hunkLineIdx = globalLineIdx;

						return (
							<div key={hunkIdx}>
								{/* Subtle hunk separator - just a thin line */}
								{hunkIdx > 0 && (
									<div
										className="h-px my-0.5"
										style={{
											backgroundColor:
												theme?.border ?? "var(--color-inferay-border)",
											opacity: 0.3,
										}}
									/>
								)}
								{/* Hunk lines - skip context lines and empty lines */}
								{hunk
									.filter(
										(line) => line.type !== "context" && line.text.trim() !== ""
									)
									.map((line, lineIdx) => {
										const currentLineIdx = hunkLineIdx++;
										const highlightedHtml = highlighted.get(currentLineIdx);
										const isRemoved = line.type === "removed";
										const isAdded = line.type === "added";

										// Update global counter
										if (
											hunkIdx === hunks.length - 1 &&
											lineIdx ===
												hunk.filter(
													(l) => l.type !== "context" && l.text.trim() !== ""
												).length -
													1
										) {
											globalLineIdx = currentLineIdx + 1;
										}

										return (
											<div
												key={`${hunkIdx}-${lineIdx}`}
												className="flex leading-[12px]"
												style={{
													backgroundColor: isRemoved
														? removedBg
														: isAdded
															? addedBg
															: "transparent",
													borderLeft: `2px solid ${isRemoved ? removedBorder : isAdded ? addedBorder : "transparent"}`,
												}}
											>
												<span
													className="shrink-0 w-4 text-center select-none text-[8px]"
													style={{
														color: isRemoved
															? "rgba(248,81,73,0.7)"
															: "rgba(46,160,67,0.7)",
													}}
												>
													{isRemoved ? "−" : "+"}
												</span>
												<span
													className="flex-1 whitespace-pre pr-1 overflow-hidden text-[8px] shiki-line"
													style={{
														color: theme?.fg ?? "var(--color-inferay-text)",
													}}
													dangerouslySetInnerHTML={
														isReady && highlightedHtml
															? { __html: highlightedHtml }
															: undefined
													}
												>
													{!(isReady && highlightedHtml)
														? line.text || " "
														: undefined}
												</span>
											</div>
										);
									})}
							</div>
						);
					})}
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
						? `${parsed.content.slice(0, 300)}...`
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
			type="button"
			onClick={handleCopy}
			className={`flex items-center justify-center h-5 w-5 rounded transition-colors ${className ?? ""}`}
			style={{
				backgroundColor: theme ? theme.surface : "var(--color-inferay-surface)",
				color: copied
					? "#22c55e"
					: theme
						? theme.fgDim
						: "var(--color-inferay-text-3)",
			}}
			title={copied ? "Copied!" : "Copy"}
		>
			{copied ? (
				<svg
					aria-hidden="true"
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
					aria-hidden="true"
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
				backgroundColor: `${baseColor}08`,
				borderLeft: `2px solid ${`${baseColor}40`}`,
			}}
		>
			<div className="flex items-center gap-2 px-2 py-1">
				{/* Clock icon */}
				<svg
					aria-hidden="true"
					width="11"
					height="11"
					viewBox="0 0 24 24"
					fill="none"
					stroke={`${baseColor}80`}
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<circle cx="12" cy="12" r="10" />
					<path d="M12 6v6l4 2" />
				</svg>

				{/* File count badge (clickable to expand) */}
				<button
					type="button"
					onClick={() => setExpanded(!expanded)}
					className="text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors"
					style={{
						backgroundColor: `${accentColor}15`,
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
						type="button"
						onClick={() => onRevert(checkpoint.id)}
						disabled={disabled}
						className="text-[9px] px-2 py-0.5 rounded font-medium transition-colors disabled:opacity-40"
						style={{
							backgroundColor: `${revertedColor}15`,
							color: revertedColor,
						}}
					>
						Undo
					</button>
				) : (
					<span
						className="text-[9px] italic"
						style={{ color: theme?.fgDim ?? "var(--color-inferay-text-3)" }}
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
								style={{ color: theme?.fgDim ?? "var(--color-inferay-text-3)" }}
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

function Inline({
	text,
	theme,
	onMdFileClick,
}: {
	text: string;
	theme?: BubbleTheme;
	onMdFileClick?: (path: string) => void;
}) {
	const parts = useMemo(
		() =>
			text.split(
				// Match: inline code, bold, italic, markdown links, URLs with protocol, domain URLs, .md file paths
				/(`[^`\n]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)<>]+|[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}[^\s)<>]*|[\w./-]+\.md\b)/g
			),
		[text]
	);
	const linkStyle = theme ? { color: `${theme.cursor}cc` } : undefined;
	return (
		<>
			{parts.map((p, i) => {
				const partKey = `${i}-${p.slice(0, 12)}`;
				if (p.startsWith("`") && p.endsWith("`") && p.length > 2) {
					const cs = theme
						? { backgroundColor: theme.surface, color: `${theme.cursor}cc` }
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
				// File path ending in .md - open preview modal (check FIRST before URL checks)
				if (/\.md$/i.test(p) && onMdFileClick) {
					return (
						<button
							key={partKey}
							type="button"
							onClick={() => onMdFileClick(p)}
							className="underline decoration-current/30 hover:decoration-current/60 cursor-pointer"
							style={linkStyle}
						>
							{p}
						</button>
					);
				}
				// Full URL with protocol
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
				// Domain URL without protocol (e.g., example.com/path)
				if (/^[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}/.test(p)) {
					const href = `https://${p}`;
					return (
						<a
							key={partKey}
							href={href}
							target="_blank"
							rel="noopener noreferrer"
							className="underline decoration-current/30 hover:decoration-current/60"
							style={linkStyle}
						>
							{p}
						</a>
					);
				}
				return <React.Fragment key={partKey}>{p}</React.Fragment>;
			})}
		</>
	);
}
