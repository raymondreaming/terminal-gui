import * as stylex from "@stylexjs/stylex";
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
} from "../../features/agents/agents.ts";
import type {
	AgentKind,
	TerminalPaneModel,
	TerminalTheme,
} from "../../features/terminal/terminal-utils.ts";
import { useXtermTerminal } from "../../hooks/useXtermTerminal.ts";
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
	onSetPaneAgentKind,
}: TerminalPaneViewProps) {
	const chatHandleRef = useRef<AgentChatHandle | null>(null);
	const viewAgentKind: AgentKind =
		pane.pendingCwd && !isChatAgentKind(pane.agentKind)
			? "claude"
			: pane.agentKind;
	const isAgentChatPane = isChatAgentKind(viewAgentKind);
	const paneLabel = getAgentDefinition(viewAgentKind).label;
	const { containerRef, termRef, refit } = useXtermTerminal({
		enabled: !isAgentChatPane && !pane.pendingCwd,
		paneId: pane.id,
		agentKind: pane.agentKind,
		isClaude: pane.isClaude,
		cwd: pane.cwd,
		theme,
		fontSize,
		fontFamily,
	});

	useEffect(() => {
		if (isSelected && !isAgentChatPane) refit();
	}, [isAgentChatPane, isSelected, refit]);

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
