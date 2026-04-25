import React, { memo, useEffect, useRef } from "react";
import {
	IconBookmark,
	IconClock,
	IconEye,
	IconFilePlus,
	IconGlobe,
	IconMessageSquare,
	IconPencil,
	IconSearch,
	IconUsers,
	IconWrench,
	IconX,
} from "../../components/ui/Icons.tsx";
import type { ActivityEvent, ActivityType } from "./useActivityFeed.ts";

interface ActivityFeedProps {
	events: ActivityEvent[];
	className?: string;
}

// Tool-specific icons - using theme colors
function getToolIcon(toolName: string, isActive: boolean): React.ReactNode {
	const baseClass = `w-3 h-3 ${isActive ? "animate-pulse" : ""}`;

	switch (toolName.toLowerCase()) {
		case "read":
			return <IconEye className={`${baseClass} text-inferay-accent`} />;
		case "edit":
			return <IconPencil className={`${baseClass} text-inferay-accent`} />;
		case "write":
			return <IconFilePlus className={`${baseClass} text-git-added`} />;
		case "grep":
			return <IconSearch className={`${baseClass} text-inferay-text-2`} />;
		case "glob":
			return <IconWrench className={`${baseClass} text-inferay-text-2`} />;
		case "bash":
			return <IconWrench className={`${baseClass} text-inferay-text-2`} />;
		case "task":
			return <IconUsers className={`${baseClass} text-inferay-accent`} />;
		case "todowrite":
			return <IconWrench className={`${baseClass} text-inferay-text-3`} />;
		case "webfetch":
		case "websearch":
			return <IconGlobe className={`${baseClass} text-inferay-accent`} />;
		default:
			return <IconWrench className={`${baseClass} text-inferay-text-3`} />;
	}
}

function getActivityIcon(
	type: ActivityType,
	toolName?: string
): React.ReactNode {
	switch (type) {
		case "thinking":
			return (
				<IconClock className="w-3 h-3 text-inferay-text-3 animate-pulse" />
			);
		case "responding":
			return (
				<IconMessageSquare className="w-3 h-3 text-inferay-accent animate-pulse" />
			);
		case "tool_start":
			return getToolIcon(toolName ?? "", true);
		case "tool_end":
			return getToolIcon(toolName ?? "", false);
		case "file_changed":
			return <IconFilePlus className="w-3 h-3 text-inferay-accent" />;
		case "checkpoint":
			return <IconBookmark className="w-3 h-3 text-inferay-accent" />;
		case "error":
			return <IconX className="w-3 h-3 text-git-removed" />;
		default:
			return <div className="w-1.5 h-1.5 rounded-full bg-inferay-text-3" />;
	}
}

function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;

	if (diff < 1000) return "now";
	if (diff < 60000) return `${Math.floor(diff / 1000)}s`;
	if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
	return `${Math.floor(diff / 3600000)}h`;
}

function getEventLabel(event: ActivityEvent): string {
	switch (event.type) {
		case "thinking":
			return "Thinking";
		case "responding":
			return "Responding";
		case "tool_start":
			return event.toolName ?? "Tool";
		case "tool_end":
			return event.toolName ?? "Tool";
		case "file_changed":
			return event.fileName?.split("/").pop() ?? "File";
		case "checkpoint":
			return `Checkpoint (${event.fileCount ?? 0})`;
		default:
			return event.type;
	}
}

export const ActivityFeed = memo(function ActivityFeed({
	events,
	className = "",
}: ActivityFeedProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const lastEventCountRef = useRef(0);
	const isNearBottomRef = useRef(true);

	// Track if user is near bottom
	const handleScroll = () => {
		if (!containerRef.current) return;
		const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
		isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 30;
	};

	// Auto-scroll only if user is near bottom
	useEffect(() => {
		if (
			events.length > lastEventCountRef.current &&
			containerRef.current &&
			isNearBottomRef.current
		) {
			containerRef.current.scrollTop = containerRef.current.scrollHeight;
		}
		lastEventCountRef.current = events.length;
	}, [events.length]);

	if (events.length === 0) {
		return (
			<div
				className={`flex items-center justify-center text-inferay-text-3 text-[10px] ${className}`}
			>
				No activity yet
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			onScroll={handleScroll}
			className={`overflow-y-auto overflow-x-hidden ${className}`}
		>
			<div className="flex flex-col">
				{events.map((event, index) => {
					const isLatest = index === events.length - 1;
					const isActive =
						event.type === "thinking" ||
						event.type === "tool_start" ||
						event.type === "responding";

					return (
						<div
							key={event.id}
							className={`
								flex items-center gap-2 px-2.5 py-1 text-[10px]
								${isLatest && isActive ? "bg-inferay-accent/10" : ""}
								${event.type === "error" ? "bg-git-removed/10" : ""}
							`}
						>
							<div className="shrink-0 w-3 flex items-center justify-center">
								{getActivityIcon(event.type, event.toolName)}
							</div>
							<span
								className={`
									flex-1 truncate
									${event.type === "error" ? "text-git-removed" : "text-inferay-text-2"}
								`}
								title={event.message}
							>
								{getEventLabel(event)}
							</span>
							<span className="shrink-0 text-inferay-text-3 tabular-nums">
								{formatRelativeTime(event.timestamp)}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
});

// Compact inline version for embedding in headers
export const ActivityIndicator = memo(function ActivityIndicator({
	events,
	className = "",
}: {
	events: ActivityEvent[];
	className?: string;
}) {
	const latestEvent = events[events.length - 1];

	if (!latestEvent) {
		return (
			<div
				className={`flex items-center gap-1.5 text-inferay-text-3 ${className}`}
			>
				<div className="w-1.5 h-1.5 rounded-full bg-inferay-text-3" />
				<span className="text-[10px]">Idle</span>
			</div>
		);
	}

	const isActive =
		latestEvent.type === "thinking" ||
		latestEvent.type === "tool_start" ||
		latestEvent.type === "responding";

	return (
		<div
			className={`flex items-center gap-1.5 ${isActive ? "text-inferay-accent" : "text-inferay-text-2"} ${className}`}
		>
			{getActivityIcon(latestEvent.type, latestEvent.toolName)}
			<span className="text-[10px] truncate max-w-[100px]">
				{getEventLabel(latestEvent)}
			</span>
		</div>
	);
});
