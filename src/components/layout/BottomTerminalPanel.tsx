import { memo, useCallback, useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import { IconPlus, IconTerminal, IconX } from "../ui/Icons.tsx";
import { readStoredJson, writeStoredJson } from "../../lib/stored-json.ts";
import { wsClient } from "../../lib/websocket.ts";
import {
	loadAppThemeId,
	mapAppThemeToTerminalTheme,
} from "../../lib/app-theme.ts";
import { getThemeById } from "../../lib/terminal-utils.ts";

interface BottomTerminal {
	id: string;
	title: string;
}

interface BottomTerminalState {
	terminals: BottomTerminal[];
	selectedId: string | null;
	panelHeight: number;
	open: boolean;
}

const STORAGE_KEY = "inferay-bottom-terminals";
const DEFAULT_PANEL_HEIGHT = 250;
const MIN_PANEL_HEIGHT = 120;
const MAX_PANEL_HEIGHT = 600;

let idCounter = 0;
function nextTerminalId(): string {
	return `btm-${Date.now().toString(36)}-${++idCounter}`;
}

function loadState(): BottomTerminalState {
	const saved = readStoredJson<BottomTerminalState | null>(STORAGE_KEY, null);
	if (saved && Array.isArray(saved.terminals)) {
		return {
			terminals: saved.terminals,
			selectedId: saved.selectedId ?? saved.terminals[0]?.id ?? null,
			panelHeight: saved.panelHeight ?? DEFAULT_PANEL_HEIGHT,
			open: saved.open ?? false,
		};
	}
	return {
		terminals: [],
		selectedId: null,
		panelHeight: DEFAULT_PANEL_HEIGHT,
		open: false,
	};
}

function saveState(state: BottomTerminalState) {
	writeStoredJson(STORAGE_KEY, state);
}

// ---------- Single terminal instance ----------

const BottomTerminalInstance = memo(function BottomTerminalInstance({
	id,
	visible,
}: {
	id: string;
	visible: boolean;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const termRef = useRef<Terminal | null>(null);
	const fitRef = useRef<FitAddon | null>(null);
	const initializedRef = useRef(false);

	useEffect(() => {
		if (!containerRef.current) return;
		const appThemeId = loadAppThemeId();
		const terminalThemeId = mapAppThemeToTerminalTheme(appThemeId);
		const termTheme = getThemeById(terminalThemeId);
		const term = new Terminal({
			cursorBlink: true,
			fontSize: 13,
			fontFamily: '"SF Mono", monospace',
			theme: {
				background: termTheme.bg,
				foreground: termTheme.fg,
				cursor: termTheme.cursor,
			},
			allowProposedApi: true,
			scrollback: 1000,
			scrollOnUserInput: true,
		});
		const fitAddon = new FitAddon();
		term.loadAddon(fitAddon);
		term.loadAddon(new WebLinksAddon());
		term.open(containerRef.current);
		termRef.current = term;
		fitRef.current = fitAddon;

		requestAnimationFrame(() => {
			const viewport = containerRef.current?.querySelector(".xterm-viewport");
			if (viewport instanceof HTMLElement) {
				viewport.style.overflow = "hidden";
				viewport.style.scrollbarWidth = "none";
			}
		});

		requestAnimationFrame(() => {
			fitAddon.fit();
			if (!initializedRef.current) {
				initializedRef.current = true;
				const dims = fitAddon.proposeDimensions();
				const reconnectCleanup = wsClient.subscribe(id, (msg: any) => {
					if (msg.type === "terminal:reconnected") {
						if (msg.ok && msg.buffer && termRef.current) {
							termRef.current.write(msg.buffer);
						} else if (!msg.ok) {
							wsClient.send({
								type: "terminal:create",
								paneId: id,
								agentKind: "terminal",
								cols: dims?.cols ?? 80,
								rows: dims?.rows ?? 24,
							});
						}
						termRef.current?.focus();
						reconnectCleanup();
					}
				});
				wsClient.send({ type: "terminal:reconnect", paneId: id });
			}
			term.focus();
		});

		const dataDisposable = term.onData((data) => {
			wsClient.send({ type: "terminal:input", paneId: id, data });
		});
		const resizeDisposable = term.onResize(({ cols, rows }) => {
			wsClient.send({ type: "terminal:resize", paneId: id, cols, rows });
		});
		const cleanupMessage = wsClient.subscribe(id, (msg: any) => {
			if (msg.type === "terminal:output") term.write(msg.data);
			else if (msg.type === "terminal:exit")
				term.write(
					`\r\n\x1b[90m[Process exited with code ${msg.exitCode ?? "unknown"}]\x1b[0m\r\n`
				);
			else if (msg.type === "terminal:reconnected" && msg.ok && msg.buffer)
				term.write(msg.buffer);
		});
		const cleanupReconnect = wsClient.onReconnect(() => {
			wsClient.send({ type: "terminal:reconnect", paneId: id });
		});
		let rafId: number | null = null;
		const resizeObserver = new ResizeObserver(() => {
			if (rafId !== null) cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(() => {
				rafId = null;
				fitAddon.fit();
			});
		});
		resizeObserver.observe(containerRef.current);

		return () => {
			dataDisposable.dispose();
			resizeDisposable.dispose();
			cleanupMessage();
			cleanupReconnect();
			if (rafId !== null) cancelAnimationFrame(rafId);
			resizeObserver.disconnect();
			term.dispose();
			termRef.current = null;
			fitRef.current = null;
		};
	}, [id]);

	// refit when visibility changes
	useEffect(() => {
		if (visible && fitRef.current) {
			requestAnimationFrame(() => {
				fitRef.current?.fit();
				termRef.current?.focus();
			});
		}
	}, [visible]);

	return (
		<div
			ref={containerRef}
			className="h-full w-full"
			style={{ display: visible ? "block" : "none" }}
		/>
	);
});

// ---------- Main component ----------

export function BottomTerminalPanel() {
	const [state, setState] = useState(loadState);
	const dragRef = useRef<{
		startY: number;
		startHeight: number;
	} | null>(null);
	const [dragTabIndex, setDragTabIndex] = useState<number | null>(null);
	const [dragOverTabIndex, setDragOverTabIndex] = useState<number | null>(null);
	const dragTabRef = useRef<number | null>(null);

	// persist
	useEffect(() => {
		saveState(state);
	}, [state]);

	const addTerminal = useCallback(() => {
		const id = nextTerminalId();
		const termNum =
			state.terminals.length > 0
				? Math.max(
						...state.terminals.map((t) => {
							const m = t.title.match(/Terminal (\d+)/);
							return m ? Number(m[1]) : 0;
						})
					) + 1
				: 1;
		setState((prev) => ({
			...prev,
			terminals: [...prev.terminals, { id, title: `Terminal ${termNum}` }],
			selectedId: id,
			open: true,
		}));
	}, [state.terminals]);

	const closeTerminal = useCallback((termId: string) => {
		wsClient.send({ type: "terminal:destroy", paneId: termId });
		setState((prev) => {
			const next = prev.terminals.filter((t) => t.id !== termId);
			let nextSelected = prev.selectedId;
			if (prev.selectedId === termId) {
				const idx = prev.terminals.findIndex((t) => t.id === termId);
				nextSelected = next[Math.min(idx, next.length - 1)]?.id ?? null;
			}
			return {
				...prev,
				terminals: next,
				selectedId: nextSelected,
				open: next.length > 0 ? prev.open : false,
			};
		});
	}, []);

	const selectTerminal = useCallback((termId: string) => {
		setState((prev) => ({
			...prev,
			selectedId: termId,
			open: true,
		}));
	}, []);

	const togglePanel = useCallback(() => {
		setState((prev) => ({
			...prev,
			open: prev.terminals.length > 0 ? !prev.open : false,
		}));
	}, []);

	// Resize handle
	const handleResizeStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			dragRef.current = { startY: e.clientY, startHeight: state.panelHeight };
			const onMove = (ev: MouseEvent) => {
				if (!dragRef.current) return;
				const delta = dragRef.current.startY - ev.clientY;
				const next = Math.max(
					MIN_PANEL_HEIGHT,
					Math.min(MAX_PANEL_HEIGHT, dragRef.current.startHeight + delta)
				);
				setState((prev) => ({ ...prev, panelHeight: next }));
			};
			const onUp = () => {
				dragRef.current = null;
				window.removeEventListener("mousemove", onMove);
				window.removeEventListener("mouseup", onUp);
			};
			window.addEventListener("mousemove", onMove);
			window.addEventListener("mouseup", onUp);
		},
		[state.panelHeight]
	);

	// Tab drag-and-drop reorder
	const handleTabDragStart = useCallback(
		(e: React.DragEvent, index: number) => {
			dragTabRef.current = index;
			setDragTabIndex(index);
			e.dataTransfer.effectAllowed = "move";
		},
		[]
	);

	const handleTabDragEnd = useCallback(() => {
		dragTabRef.current = null;
		setDragTabIndex(null);
		setDragOverTabIndex(null);
	}, []);

	const handleTabDragOver = useCallback((e: React.DragEvent, index: number) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		setDragOverTabIndex(index);
	}, []);

	const handleTabDrop = useCallback(
		(e: React.DragEvent, toIndex: number) => {
			e.preventDefault();
			const fromIndex = dragTabRef.current;
			if (fromIndex === null || fromIndex === toIndex) return;
			setState((prev) => {
				const next = [...prev.terminals];
				const moved = next.splice(fromIndex, 1)[0];
				if (!moved) return prev;
				next.splice(toIndex, 0, moved);
				return { ...prev, terminals: next };
			});
			handleTabDragEnd();
		},
		[handleTabDragEnd]
	);

	if (state.terminals.length === 0 && !state.open) {
		// Just the bar with a "New Terminal" button
		return (
			<div className="flex h-10 shrink-0 items-center gap-2 border-t border-inferay-border bg-inferay-bg px-3">
				<button
					type="button"
					onClick={addTerminal}
					className="flex h-6 items-center gap-1.5 rounded-md border border-inferay-border bg-inferay-surface px-2 text-[11px] font-medium text-inferay-text-2 transition-colors hover:bg-inferay-surface-2"
				>
					<IconTerminal size={11} />
					<span>Terminal</span>
					<IconPlus size={9} />
				</button>
			</div>
		);
	}

	return (
		<div className="flex flex-col shrink-0">
			{/* Resize handle */}
			{state.open && (
				<div
					className="h-1 cursor-row-resize bg-inferay-border/50 hover:bg-inferay-accent/30 transition-colors"
					onMouseDown={handleResizeStart}
				/>
			)}
			{/* Tab bar - same height as top bar concept */}
			<div className="flex h-10 shrink-0 items-center gap-0.5 border-t border-inferay-border bg-inferay-bg px-2">
				{state.terminals.map((term, idx) => (
					<div
						key={term.id}
						draggable
						onDragStart={(e) => handleTabDragStart(e, idx)}
						onDragEnd={handleTabDragEnd}
						onDragOver={(e) => handleTabDragOver(e, idx)}
						onDrop={(e) => handleTabDrop(e, idx)}
						className={`group flex items-center gap-1.5 rounded-md px-2 h-6 text-[11px] font-medium cursor-grab active:cursor-grabbing select-none transition-all ${
							state.selectedId === term.id && state.open
								? "bg-inferay-surface-2 text-inferay-text"
								: "text-inferay-text-3 hover:bg-inferay-surface hover:text-inferay-text-2"
						} ${
							dragOverTabIndex === idx && dragTabIndex !== idx
								? "ring-1 ring-inferay-accent/40"
								: ""
						} ${dragTabIndex === idx ? "opacity-40" : ""}`}
					>
						<button
							type="button"
							className="flex items-center gap-1.5"
							onClick={() => {
								if (state.selectedId === term.id && state.open) {
									togglePanel();
								} else {
									selectTerminal(term.id);
								}
							}}
						>
							<IconTerminal size={10} />
							<span>{term.title}</span>
						</button>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								closeTerminal(term.id);
							}}
							className="flex items-center justify-center h-3.5 w-3.5 rounded opacity-0 group-hover:opacity-100 transition-opacity text-inferay-text-3 hover:text-red-400 hover:bg-red-500/15"
						>
							<IconX size={7} />
						</button>
					</div>
				))}
				<button
					type="button"
					onClick={addTerminal}
					className="flex items-center justify-center h-6 w-6 rounded-md text-inferay-text-3 hover:bg-inferay-surface hover:text-inferay-text-2 transition-colors"
					title="New Terminal"
				>
					<IconPlus size={10} />
				</button>
			</div>
			{/* Terminal panel */}
			{state.open && (
				<div
					className="bg-inferay-bg overflow-hidden"
					style={{ height: state.panelHeight }}
				>
					{state.terminals.map((term) => (
						<BottomTerminalInstance
							key={term.id}
							id={term.id}
							visible={term.id === state.selectedId}
						/>
					))}
				</div>
			)}
		</div>
	);
}
