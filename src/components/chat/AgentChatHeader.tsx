import * as stylex from "@stylexjs/stylex";
import { getAgentIcon } from "../../features/agents/agent-ui.tsx";
import { getAgentDefinition } from "../../features/agents/agents.ts";
import { color, controlSize, font } from "../../tokens.stylex.ts";
import { DropdownButton } from "../ui/DropdownButton.tsx";
import { IconGitBranch, IconX } from "../ui/Icons.tsx";
import type { AgentChatSession } from "./agent-chat-shared.ts";

interface AgentChatHeaderProps {
	paneId: string;
	cwd?: string;
	gitBranch: string | null;
	draggable?: boolean;
	onDragStart?: (e: React.DragEvent) => void;
	onDragEnd?: () => void;
	onClose?: (paneId: string) => void;
	sessions?: AgentChatSession[];
	onSelectSession?: (paneId: string) => void;
}

export function AgentChatHeader({
	paneId,
	cwd,
	gitBranch,
	draggable,
	onDragStart,
	onDragEnd,
	onClose,
	sessions,
	onSelectSession,
}: AgentChatHeaderProps) {
	const dirName = cwd ? cwd.split("/").pop() || cwd : null;
	const hasMultipleSessions =
		sessions && sessions.length > 1 && onSelectSession;
	const sessionOptions = hasMultipleSessions
		? sessions.map((session) => ({
				id: session.paneId,
				label:
					(session.cwd ?? "").split("/").pop() || session.cwd || "No directory",
				detail: getAgentDefinition(session.agentKind).label,
				icon: getAgentIcon(session.agentKind, 12),
			}))
		: [];
	const closeButtonProps = stylex.props(styles.closeButton);

	return (
		<div
			className={`electrobun-webkit-app-region-no-drag shrink-0 flex items-center gap-1.5 px-3 py-1.5 border-b border-inferay-gray-border ${draggable ? "cursor-grab active:cursor-grabbing" : ""} select-none`}
			draggable={draggable}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
		>
			{dirName &&
				(hasMultipleSessions ? (
					<span className="electrobun-webkit-app-region-no-drag">
						<DropdownButton
							value={paneId}
							options={sessionOptions}
							onChange={onSelectSession}
							minWidth={220}
							buttonClassName="h-4 rounded-md border-transparent px-1.5 text-[9px] font-medium hover:bg-inferay-white/[0.06]"
							labelClassName="max-w-[120px] truncate text-[9px]"
						/>
					</span>
				) : (
					<span {...stylex.props(styles.title)} title={cwd}>
						{dirName}
					</span>
				))}
			{gitBranch && (
				<>
					<span {...stylex.props(styles.mutedText)}>›</span>
					<IconGitBranch
						size={9}
						className="shrink-0 text-inferay-muted-gray"
					/>
					<span {...stylex.props(styles.branch)} title={gitBranch}>
						{gitBranch}
					</span>
				</>
			)}
			<span className="flex-1" />
			{onClose && (
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onClose(paneId);
					}}
					{...closeButtonProps}
					className={`electrobun-webkit-app-region-no-drag ${closeButtonProps.className ?? ""}`}
					title="Close"
				>
					<IconX size={8} />
				</button>
			)}
		</div>
	);
}

const styles = stylex.create({
	title: {
		color: color.textMain,
		fontSize: font.size_1,
		fontWeight: font.weight_5,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	mutedText: {
		color: color.textMuted,
		fontSize: font.size_1,
	},
	branch: {
		color: color.textMuted,
		fontSize: font.size_1,
		fontWeight: font.weight_5,
		maxWidth: 80,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	closeButton: {
		alignItems: "center",
		backgroundColor: {
			default: "transparent",
			":hover": color.dangerWash,
		},
		borderRadius: 4,
		color: {
			default: color.textMuted,
			":hover": color.danger,
		},
		display: "flex",
		height: controlSize._4,
		justifyContent: "center",
		transitionDuration: "150ms",
		transitionProperty: "background-color, color",
		transitionTimingFunction: "ease",
		width: controlSize._4,
	},
});
