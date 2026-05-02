import * as stylex from "@stylexjs/stylex";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import type React from "react";
import { memo, useEffect, useRef } from "react";
import type { AgentChatHandle } from "../../components/chat/AgentChatView.tsx";
import { AgentChatView } from "../../components/chat/AgentChatView.tsx";
import { IconButton } from "../../components/ui/IconButton.tsx";
import { IconTerminal, IconX } from "../../components/ui/Icons.tsx";
import {
	getAgentDefinition,
	isChatAgentKind,
	loadDefaultChatSettings,
} from "../../lib/agents.ts";
import type {
	AgentKind,
	TerminalPaneModel,
	TerminalTheme,
} from "../../lib/terminal-utils.ts";
import { wsClient } from "../../lib/websocket.ts";
import { color, font } from "../../tokens.stylex.ts";

interface TerminalPaneViewProps {
	pane: TerminalPaneModel;
	isSelected: boolean;
	theme: TerminalTheme;
	fontSize: number;
	fontFamily: string;
	onSelect: (paneId: string) => void;
	onClose: (paneId: string, force?: boolean) => void;
	onDirectorySelect?: (
		paneId: string,
		path: string | null,
		referencePaths?: string[]
	) => void;
	onDirectoryCancel?: (paneId: string) => void;
	chatRef: (paneId: string, handle: AgentChatHandle | null) => void;
	onAgentStatusChange?: (paneId: string, status: string) => void;
	paneIndex?: number;
	onHeaderDragStart?: (e: React.DragEvent, index: number) => void;
	onHeaderDragEnd?: () => void;
	onAddPane?: (agentKind: AgentKind) => void;
	onSetPaneAgentKind?: (paneId: string, agentKind: AgentKind) => void;
}

export const TerminalPaneView = memo(function TerminalPaneView({
	pane,
	isSelected,
	theme,
	fontSize,
	fontFamily,
	onSelect,
	onClose,
	onDirectorySelect,
	chatRef,
	onAgentStatusChange,
	paneIndex,
	onHeaderDragStart,
	onHeaderDragEnd,
	onAddPane,
}: TerminalPaneViewProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const termRef = useRef<Terminal | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const initializedRef = useRef(false);
	const chatHandleRef = useRef<AgentChatHandle | null>(null);
	const viewAgentKind: AgentKind =
		pane.pendingCwd && !isChatAgentKind(pane.agentKind)
			? "claude"
			: pane.agentKind;
	const isAgentChatPane = isChatAgentKind(viewAgentKind);
	const paneLabel = getAgentDefinition(viewAgentKind).label;

	useEffect(() => {
		if (isAgentChatPane || pane.pendingCwd || !containerRef.current) return;
		const term = new Terminal({
			cursorBlink: true,
			fontSize,
			fontFamily: `"${fontFamily}", monospace`,
			theme: {
				background: theme.bg,
				foreground: theme.fg,
				cursor: theme.cursor,
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
		fitAddonRef.current = fitAddon;

		// Force hide scrollbar after terminal opens
		requestAnimationFrame(() => {
			const viewport = containerRef.current?.querySelector(".xterm-viewport");
			if (viewport instanceof HTMLElement) {
				viewport.style.overflow = "hidden";
				viewport.style.scrollbarWidth = "none";
				viewport.style.msOverflowStyle = "none";
			}
			// Also hide scrollbar on the terminal element itself
			const xtermElement = containerRef.current?.querySelector(".xterm");
			if (xtermElement instanceof HTMLElement) {
				xtermElement.style.overflow = "hidden";
			}
		});
		let reconnectCleanup: (() => void) | null = null;
		requestAnimationFrame(() => {
			fitAddon.fit();
			if (!initializedRef.current) {
				initializedRef.current = true;
				const dims = fitAddon.proposeDimensions();
				reconnectCleanup = wsClient.subscribe(pane.id, (msg: any) => {
					if (msg.type === "terminal:reconnected") {
						if (msg.ok) {
							if (msg.buffer && termRef.current)
								termRef.current.write(msg.buffer);
						} else {
							wsClient.send({
								type: "terminal:create",
								paneId: pane.id,
								agentKind: pane.agentKind,
								isClaude: pane.isClaude,
								cols: dims?.cols ?? 80,
								rows: dims?.rows ?? 24,
								cwd: pane.cwd,
							});
						}
						termRef.current?.focus();
						reconnectCleanup?.();
						reconnectCleanup = null;
					}
				});
				wsClient.send({ type: "terminal:reconnect", paneId: pane.id });
			}
			term.focus();
		});
		const dataDisposable = term.onData((data) => {
			wsClient.send({ type: "terminal:input", paneId: pane.id, data });
		});
		const resizeDisposable = term.onResize(({ cols, rows }) => {
			wsClient.send({ type: "terminal:resize", paneId: pane.id, cols, rows });
		});
		const cleanupMessage = wsClient.subscribe(pane.id, (msg: any) => {
			if (msg.type === "terminal:output") term.write(msg.data);
			else if (msg.type === "terminal:exit")
				term.write(
					`\r\n\x1b[90m[Process exited with code ${msg.exitCode ?? "unknown"}]\x1b[0m\r\n`
				);
			else if (msg.type === "terminal:reconnected" && msg.ok && msg.buffer)
				term.write(msg.buffer);
		});
		const cleanupReconnect = wsClient.onReconnect(() => {
			wsClient.send({ type: "terminal:reconnect", paneId: pane.id });
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
			reconnectCleanup?.();
			dataDisposable.dispose();
			resizeDisposable.dispose();
			cleanupMessage();
			cleanupReconnect();
			if (rafId !== null) cancelAnimationFrame(rafId);
			resizeObserver.disconnect();
			term.dispose();
			termRef.current = null;
			fitAddonRef.current = null;
		};
	}, [
		isAgentChatPane,
		pane.id,
		pane.pendingCwd,
		fontFamily,
		fontSize,
		pane.agentKind,
		pane.cwd,
		pane.isClaude,
		theme.bg,
		theme.cursor,
		theme.fg,
	]);

	useEffect(() => {
		if (termRef.current) {
			termRef.current.options.theme = {
				background: theme.bg,
				foreground: theme.fg,
				cursor: theme.cursor,
			};
		}
	}, [theme]);

	useEffect(() => {
		if (termRef.current) {
			termRef.current.options.fontSize = fontSize;
			termRef.current.options.fontFamily = `"${fontFamily}", monospace`;
			fitAddonRef.current?.fit();
		}
	}, [fontSize, fontFamily]);

	useEffect(() => {
		if (isSelected && !isAgentChatPane && termRef.current)
			termRef.current.focus();
	}, [isAgentChatPane, isSelected]);

	return (
		<div
			onClick={() => onSelect(pane.id)}
			onKeyDown={
				isAgentChatPane
					? undefined
					: (e) => {
							if (e.key === "Enter" || e.key === " ") onSelect(pane.id);
						}
			}
			tabIndex={isAgentChatPane ? undefined : 0}
			role={isAgentChatPane ? undefined : "button"}
			{...stylex.props(styles.root)}
			style={isAgentChatPane ? undefined : { backgroundColor: theme.bg }}
		>
			{!isAgentChatPane && (
				<div
					className={`electrobun-webkit-app-region-no-drag ${stylex.props(styles.header).className ?? ""}`}
					style={{
						borderColor: theme.separator,
						backgroundColor: theme.bg,
					}}
					draggable={paneIndex != null && !!onHeaderDragStart}
					onDragStart={(e) => {
						if (paneIndex != null && onHeaderDragStart) {
							e.dataTransfer.setData("text/plain", pane.id);
							const img = new Image();
							img.src =
								"data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
							e.dataTransfer.setDragImage(img, 0, 0);
							onHeaderDragStart(e, paneIndex);
						}
					}}
					onDragEnd={onHeaderDragEnd}
				>
					<span
						{...stylex.props(
							styles.terminalIcon,
							isSelected && styles.activeAccent
						)}
					>
						<IconTerminal size={10} />
					</span>
					<span
						{...stylex.props(
							styles.paneLabel,
							isSelected && styles.selectedLabel
						)}
					>
						{paneLabel}
					</span>
					{pane.cwd && (
						<>
							<span {...stylex.props(styles.breadcrumbSep)}>›</span>
							<span
								{...stylex.props(
									styles.cwdLabel,
									isSelected && styles.selectedCwd
								)}
								title={pane.cwd}
							>
								{pane.cwd.split("/").pop() || pane.cwd}
							</span>
						</>
					)}
					<span {...stylex.props(styles.spacer)} />
					{isSelected && <div {...stylex.props(styles.selectedDot)} />}
					<IconButton
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onClose(pane.id);
						}}
						className="electrobun-webkit-app-region-no-drag"
						variant="danger"
						size="xs"
						title="Close pane"
					>
						<IconX size={8} />
					</IconButton>
				</div>
			)}
			<div
				ref={containerRef}
				{...stylex.props(styles.termContainer)}
				style={{
					display: isAgentChatPane ? "none" : undefined,
					pointerEvents: isSelected ? "auto" : "none",
					overflow: "hidden",
					padding: 0,
				}}
				onClick={() => termRef.current?.focus()}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") termRef.current?.focus();
				}}
				tabIndex={0}
				role="button"
			/>
			{isAgentChatPane && (
				<div
					{...stylex.props(styles.agentPane)}
					style={{ pointerEvents: isSelected ? "auto" : "none" }}
				>
					<AgentChatView
						paneId={pane.id}
						cwd={pane.cwd}
						referencePaths={pane.referencePaths}
						agentKind={viewAgentKind}
						onStatusChange={onAgentStatusChange}
						onClose={onClose}
						isSelected={isSelected}
						onDirectoryChange={(pid, cwd, refs) => {
							if (pane.pendingCwd && !isChatAgentKind(pane.agentKind)) {
								onSetPaneAgentKind?.(pid, loadDefaultChatSettings().agentKind);
							}
							onDirectorySelect?.(pid, cwd, refs);
						}}
						onAddPane={onAddPane}
						draggable={paneIndex != null && !!onHeaderDragStart}
						onDragStart={(e) => {
							if (paneIndex != null && onHeaderDragStart) {
								e.dataTransfer.setData("text/plain", pane.id);
								const img = new Image();
								img.src =
									"data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
								e.dataTransfer.setDragImage(img, 0, 0);
								onHeaderDragStart(e, paneIndex);
							}
						}}
						onDragEnd={onHeaderDragEnd}
						ref={(handle) => {
							chatHandleRef.current = handle;
							chatRef(pane.id, handle);
						}}
					/>
				</div>
			)}
		</div>
	);
});

const styles = stylex.create({
	root: {
		position: "relative",
		display: "flex",
		height: "100%",
		minHeight: 0,
		flexDirection: "column",
		overflow: "hidden",
	},
	header: {
		display: "flex",
		flexShrink: 0,
		cursor: "grab",
		userSelect: "none",
		alignItems: "center",
		gap: "0.5rem",
		borderBottomWidth: 1,
		borderBottomStyle: "solid",
		paddingBlock: "0.375rem",
		paddingInline: "0.75rem",
		":active": {
			cursor: "grabbing",
		},
	},
	terminalIcon: {
		color: color.textMuted,
	},
	activeAccent: {
		color: "var(--color-inferay-accent)",
	},
	paneLabel: {
		color: color.textMuted,
		fontSize: font.size_1,
		fontWeight: font.weight_5,
	},
	selectedLabel: {
		color: color.textSoft,
	},
	breadcrumbSep: {
		color: color.textMuted,
		fontSize: font.size_1,
	},
	cwdLabel: {
		minWidth: 0,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		color: color.textMuted,
		fontSize: font.size_1,
		fontWeight: font.weight_5,
	},
	selectedCwd: {
		color: color.textMain,
	},
	spacer: {
		flex: 1,
	},
	selectedDot: {
		width: "0.375rem",
		height: "0.375rem",
		borderRadius: "999px",
		backgroundColor: "var(--color-inferay-accent)",
	},
	termContainer: {
		minHeight: 0,
		flex: 1,
	},
	agentPane: {
		display: "flex",
		minHeight: 0,
		flex: 1,
		flexDirection: "column",
		overflow: "hidden",
	},
});
