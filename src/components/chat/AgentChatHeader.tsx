import type React from "react";
import { getAgentIcon } from "../../lib/agent-ui.tsx";
import { getAgentDefinition } from "../../lib/agents.ts";
import type { AgentKind } from "../../lib/terminal-utils.ts";
import { DropdownButton } from "../ui/DropdownButton.tsx";
import { IconGitBranch, IconX } from "../ui/Icons.tsx";
import type { AgentChatSession } from "./agent-chat-shared.ts";

interface AgentOption {
	id: AgentKind;
	label: string;
	icon: React.ReactNode;
}

interface AgentChatHeaderProps {
	paneId: string;
	cwd?: string;
	theme?: { bg: string; fg: string; cursor: string };
	bgColor: string;
	borderColor?: string;
	fgColor: string;
	fgDim: string;
	agentKind: AgentKind;
	agentKindOptions: AgentOption[];
	gitBranch: string | null;
	draggable?: boolean;
	onDragStart?: (e: React.DragEvent) => void;
	onDragEnd?: () => void;
	isSelected?: boolean;
	onClose?: (paneId: string) => void;
	sessions?: AgentChatSession[];
	onSelectSession?: (paneId: string) => void;
	onAgentKindChange: (agentKind: AgentKind) => void;
}

export function AgentChatHeader({
	paneId,
	cwd,
	theme,
	bgColor,
	borderColor,
	fgColor,
	fgDim,
	agentKind,
	agentKindOptions,
	gitBranch,
	draggable,
	onDragStart,
	onDragEnd,
	isSelected,
	onClose,
	sessions,
	onSelectSession,
	onAgentKindChange,
}: AgentChatHeaderProps) {
	const dimStyle = theme ? { color: fgDim } : undefined;
	const textStyle = theme ? { color: fgColor } : undefined;
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

	return (
		<div
			className={`electrobun-webkit-app-region-drag shrink-0 flex items-center gap-1.5 px-3 py-1.5 border-b ${theme ? "" : "border-inferay-gray-border"} ${draggable ? "cursor-grab active:cursor-grabbing" : ""} select-none`}
			style={theme ? { borderColor, backgroundColor: bgColor } : undefined}
			draggable={draggable}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
		>
			<div
				className="electrobun-webkit-app-region-no-drag"
				draggable={false}
				onMouseDown={(e) => e.stopPropagation()}
				onDragStart={(e) => e.preventDefault()}
			>
				<DropdownButton
					value={agentKind}
					options={agentKindOptions}
					onChange={(id) => onAgentKindChange(id as AgentKind)}
					icon={
						<span className="text-inferay-accent">
							{getAgentIcon(agentKind, 10)}
						</span>
					}
					minWidth={110}
					buttonClassName="h-4 rounded-md border-transparent px-1 text-[9px] font-medium text-inferay-accent hover:bg-inferay-white/[0.06] gap-1"
					labelClassName="text-[9px]"
					renderOption={(opt, isOptionSelected) => (
						<div
							className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
								isOptionSelected
									? "bg-inferay-accent/15 text-inferay-white"
									: "text-inferay-muted-gray hover:bg-inferay-white/5 hover:text-inferay-white"
							}`}
						>
							<span className="shrink-0">{opt.icon}</span>
							<span className="font-medium">{opt.label}</span>
						</div>
					)}
				/>
			</div>
			{dirName && (
				<>
					<span className="text-[9px]" style={dimStyle}>
						›
					</span>
					{hasMultipleSessions ? (
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
			{gitBranch && (
				<>
					<span className="text-[9px]" style={dimStyle}>
						›
					</span>
					<IconGitBranch
						size={9}
						className="text-inferay-muted-gray shrink-0"
					/>
					<span
						className="text-[9px] font-medium text-inferay-muted-gray truncate max-w-[80px]"
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
					className="electrobun-webkit-app-region-no-drag flex items-center justify-center h-4 w-4 rounded transition-colors text-inferay-muted-gray hover:text-red-400 hover:bg-red-500/15"
					title="Close"
				>
					<IconX size={8} />
				</button>
			)}
		</div>
	);
}
