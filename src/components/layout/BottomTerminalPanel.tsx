import * as stylex from "@stylexjs/stylex";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
	loadAppThemeId,
	mapAppThemeToTerminalTheme,
} from "../../lib/app-theme.ts";
import { readStoredJson, writeStoredJson } from "../../lib/stored-json.ts";
import { getThemeById } from "../../lib/terminal-utils.ts";
import { wsClient } from "../../lib/websocket.ts";
import { color, controlSize, font } from "../../tokens.stylex.ts";
import { IconPlus, IconTerminal, IconX } from "../ui/Icons.tsx";

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
			{...stylex.props(styles.terminalInstance)}
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
			<div {...stylex.props(styles.emptyBar)}>
				<button
					type="button"
					onClick={addTerminal}
					{...stylex.props(styles.newTerminalButton)}
				>
					<IconTerminal size={11} />
					<span>Terminal</span>
					<IconPlus size={9} />
				</button>
			</div>
		);
	}

	return (
		<div {...stylex.props(styles.root)}>
			{state.open && (
				<div
					{...stylex.props(styles.resizeHandle)}
					onMouseDown={handleResizeStart}
				/>
			)}
			<div {...stylex.props(styles.tabBar)}>
				{state.terminals.map((term, idx) => (
					<div
						key={term.id}
						draggable
						onDragStart={(e) => handleTabDragStart(e, idx)}
						onDragEnd={handleTabDragEnd}
						onDragOver={(e) => handleTabDragOver(e, idx)}
						onDrop={(e) => handleTabDrop(e, idx)}
						{...stylex.props(
							styles.tab,
							state.selectedId === term.id && state.open
								? styles.tabSelected
								: styles.tabIdle,
							dragOverTabIndex === idx && dragTabIndex !== idx
								? styles.tabDropTarget
								: null,
							dragTabIndex === idx ? styles.tabDragging : null
						)}
					>
						<button
							type="button"
							{...stylex.props(styles.tabButton)}
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
							{...stylex.props(styles.closeButton)}
						>
							<IconX size={7} />
						</button>
					</div>
				))}
				<button
					type="button"
					onClick={addTerminal}
					{...stylex.props(styles.addButton)}
					title="New Terminal"
				>
					<IconPlus size={10} />
				</button>
			</div>
			{/* Terminal panel */}
			{state.open && (
				<div
					{...stylex.props(styles.panel)}
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

const styles = stylex.create({
	terminalInstance: {
		width: "100%",
		height: "100%",
	},
	emptyBar: {
		display: "flex",
		height: "2.5rem",
		flexShrink: 0,
		alignItems: "center",
		gap: controlSize._2,
		borderTopWidth: 1,
		borderTopStyle: "solid",
		borderTopColor: color.border,
		backgroundColor: color.background,
		paddingInline: controlSize._3,
	},
	newTerminalButton: {
		display: "flex",
		height: controlSize._6,
		alignItems: "center",
		gap: "0.375rem",
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: color.border,
		borderRadius: 6,
		backgroundColor: {
			default: color.backgroundRaised,
			":hover": color.controlHover,
		},
		color: color.textSoft,
		fontSize: font.size_2,
		fontWeight: font.weight_5,
		paddingInline: controlSize._2,
		transitionProperty: "background-color, color",
		transitionDuration: "120ms",
	},
	root: {
		display: "flex",
		flexDirection: "column",
		flexShrink: 0,
	},
	resizeHandle: {
		height: "0.25rem",
		cursor: "row-resize",
		backgroundColor: {
			default: "rgba(63, 63, 70, 0.5)",
			":hover": "rgba(99, 102, 241, 0.3)",
		},
		transitionProperty: "background-color",
		transitionDuration: "120ms",
	},
	tabBar: {
		display: "flex",
		height: "2.5rem",
		flexShrink: 0,
		alignItems: "center",
		gap: "0.125rem",
		borderTopWidth: 1,
		borderTopStyle: "solid",
		borderTopColor: color.border,
		backgroundColor: color.background,
		paddingInline: controlSize._2,
	},
	tab: {
		display: "flex",
		height: controlSize._6,
		alignItems: "center",
		gap: "0.375rem",
		borderRadius: 6,
		color: color.textMuted,
		cursor: "grab",
		fontSize: font.size_2,
		fontWeight: font.weight_5,
		paddingInline: controlSize._2,
		userSelect: "none",
		transitionProperty: "background-color, box-shadow, color, opacity",
		transitionDuration: "120ms",
		":active": {
			cursor: "grabbing",
		},
	},
	tabIdle: {
		backgroundColor: {
			default: "transparent",
			":hover": color.backgroundRaised,
		},
		color: {
			default: color.textMuted,
			":hover": color.textSoft,
		},
	},
	tabSelected: {
		backgroundColor: color.controlHover,
		color: color.textMain,
	},
	tabDropTarget: {
		boxShadow: "0 0 0 1px rgba(99, 102, 241, 0.4)",
	},
	tabDragging: {
		opacity: 0.4,
	},
	tabButton: {
		display: "flex",
		alignItems: "center",
		gap: "0.375rem",
		borderWidth: 0,
		backgroundColor: "transparent",
		color: "inherit",
		padding: 0,
	},
	closeButton: {
		display: "flex",
		width: "0.875rem",
		height: "0.875rem",
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 0,
		borderRadius: 4,
		backgroundColor: {
			default: "transparent",
			":hover": "rgba(239, 68, 68, 0.15)",
		},
		color: {
			default: color.textMuted,
			":hover": "#f87171",
		},
		opacity: {
			default: 0,
			":hover": 1,
		},
		transitionProperty: "background-color, color, opacity",
		transitionDuration: "120ms",
	},
	addButton: {
		display: "flex",
		width: controlSize._6,
		height: controlSize._6,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 0,
		borderRadius: 6,
		backgroundColor: {
			default: "transparent",
			":hover": color.backgroundRaised,
		},
		color: {
			default: color.textMuted,
			":hover": color.textSoft,
		},
		transitionProperty: "background-color, color",
		transitionDuration: "120ms",
	},
	panel: {
		overflow: "hidden",
		backgroundColor: color.background,
	},
});
