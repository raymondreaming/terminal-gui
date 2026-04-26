import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import type React from "react";
import { memo, useEffect, useRef } from "react";
import type { AgentChatHandle } from "../../components/chat/AgentChatView.tsx";
import { AgentChatView } from "../../components/chat/AgentChatView.tsx";
import { IconTerminal, IconX } from "../../components/ui/Icons.tsx";
import { getAgentIcon } from "../../lib/agent-ui.tsx";
import { getAgentDefinition, isChatAgentKind } from "../../lib/agents.ts";
import type {
	AgentKind,
	TerminalPaneModel,
	TerminalTheme,
} from "../../lib/terminal-utils.ts";
import { wsClient } from "../../lib/websocket.ts";
import { InlineDirectoryPicker } from "./InlineDirectoryPicker.tsx";
import { NewSessionButtons } from "./NewSessionButtons.tsx";

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
	onDirectoryCancel,
	chatRef,
	onAgentStatusChange,
	paneIndex,
	onHeaderDragStart,
	onHeaderDragEnd,
	onAddPane,
	onSetPaneAgentKind,
}: TerminalPaneViewProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const termRef = useRef<Terminal | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const initializedRef = useRef(false);
	const chatHandleRef = useRef<AgentChatHandle | null>(null);
	const isAgentChatPane = isChatAgentKind(pane.agentKind);
	const paneLabel = getAgentDefinition(pane.agentKind).label;

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

	if (pane.pendingCwd) {
		return (
			<div
				tabIndex={0}
				onClick={() => onSelect(pane.id)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") onSelect(pane.id);
				}}
				className="relative flex h-full min-h-0 flex-col overflow-hidden"
				style={{ backgroundColor: theme.bg }}
			>
				<div
					className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b"
					style={{
						borderColor: theme.separator,
						backgroundColor: theme.bg,
					}}
				>
					<span className="text-[9px] font-medium text-inferay-soft-white">
						New Session
					</span>
					<span className="flex-1" />
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onClose(pane.id, true);
						}}
						className="flex items-center justify-center h-4 w-4 rounded transition-colors text-inferay-muted-gray hover:text-red-400 hover:bg-red-500/15"
						title="Close pane"
					>
						<IconX size={8} />
					</button>
				</div>
				<div className="flex-1 flex flex-col">
					<div className="flex-1 flex items-center justify-center">
						<div className="flex flex-col items-center gap-4">
							<p className="text-xs text-inferay-soft-white">
								Start a new terminal or agent session
							</p>
							<NewSessionButtons
								selectedKind={pane.agentKind}
								onAddPane={(kind) => {
									if (onSetPaneAgentKind) {
										onSetPaneAgentKind(pane.id, kind);
									}
								}}
							/>
						</div>
					</div>
					<div className="shrink-0 px-3 pb-2">
						<InlineDirectoryPicker
							onSelect={(path) => onDirectorySelect?.(pane.id, path)}
							onCancel={() => onDirectoryCancel?.(pane.id)}
							multiSelect
							onMultiSelect={(paths) => {
								if (paths.length > 0) {
									onDirectorySelect?.(pane.id, paths[0]!, paths.slice(1));
								}
							}}
						/>
					</div>
				</div>
			</div>
		);
	}

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
			className="relative flex h-full min-h-0 flex-col overflow-hidden"
			style={isAgentChatPane ? undefined : { backgroundColor: theme.bg }}
		>
			{!isAgentChatPane && (
				<div
					className="electrobun-webkit-app-region-drag shrink-0 flex items-center gap-2 px-3 py-1.5 border-b cursor-grab active:cursor-grabbing select-none"
					style={{
						borderColor: theme.separator,
						backgroundColor: theme.bg,
					}}
					draggable={paneIndex != null && !!onHeaderDragStart}
					onDragStart={(e) => {
						if (paneIndex != null && onHeaderDragStart) {
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
						className={
							isSelected ? "text-inferay-accent" : "text-inferay-muted-gray"
						}
					>
						<IconTerminal size={10} />
					</span>
					<span
						className={`font-medium ${isSelected ? "text-inferay-soft-white" : "text-inferay-muted-gray"} text-[9px]`}
					>
						{getAgentDefinition(pane.agentKind).label}
					</span>
					{pane.cwd && (
						<>
							<span className="text-[9px] text-inferay-muted-gray">›</span>
							<span
								className={`font-medium ${isSelected ? "text-inferay-white" : "text-inferay-muted-gray"} text-[9px] truncate`}
								title={pane.cwd}
							>
								{pane.cwd.split("/").pop() || pane.cwd}
							</span>
						</>
					)}
					<span className="flex-1" />
					{isSelected && (
						<div className="h-1.5 w-1.5 rounded-full bg-inferay-accent" />
					)}
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onClose(pane.id);
						}}
						className="electrobun-webkit-app-region-no-drag flex items-center justify-center h-4 w-4 rounded transition-colors text-inferay-muted-gray hover:text-red-400 hover:bg-red-500/15"
						title="Close pane"
					>
						<IconX size={8} />
					</button>
				</div>
			)}
			<div
				ref={containerRef}
				className="min-h-0 flex-1"
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
					className="min-h-0 flex-1 flex flex-col overflow-hidden"
					style={{ pointerEvents: isSelected ? "auto" : "none" }}
				>
					<AgentChatView
						paneId={pane.id}
						cwd={pane.cwd}
						referencePaths={pane.referencePaths}
						theme={theme}
						agentKind={pane.agentKind}
						onStatusChange={onAgentStatusChange}
						onClose={onClose}
						isSelected={isSelected}
						onDirectoryChange={(pid, cwd, refs) =>
							onDirectorySelect?.(pid, cwd, refs)
						}
						onAddPane={onAddPane}
						draggable={paneIndex != null && !!onHeaderDragStart}
						onDragStart={(e) => {
							if (paneIndex != null && onHeaderDragStart) {
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
