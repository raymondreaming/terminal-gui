import React, { memo, useEffect, useRef } from "react";
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
			return (
				<svg
					className={`${baseClass} text-inferay-accent`}
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
			return (
				<svg
					className={`${baseClass} text-inferay-accent`}
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
					className={`${baseClass} text-git-added`}
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
		case "grep":
			return (
				<svg
					className={`${baseClass} text-inferay-text-2`}
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<circle cx="11" cy="11" r="8" />
					<line x1="21" y1="21" x2="16.65" y2="16.65" />
				</svg>
			);
		case "glob":
			return (
				<svg
					className={`${baseClass} text-inferay-text-2`}
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
				</svg>
			);
		case "bash":
			return (
				<svg
					className={`${baseClass} text-inferay-text-2`}
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<polyline points="4 17 10 11 4 5" />
					<line x1="12" y1="19" x2="20" y2="19" />
				</svg>
			);
		case "task":
			return (
				<svg
					className={`${baseClass} text-inferay-accent`}
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
					<circle cx="9" cy="7" r="4" />
					<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
					<path d="M16 3.13a4 4 0 0 1 0 7.75" />
				</svg>
			);
		case "todowrite":
			return (
				<svg
					className={`${baseClass} text-inferay-text-3`}
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<line x1="8" y1="6" x2="21" y2="6" />
					<line x1="8" y1="12" x2="21" y2="12" />
					<line x1="8" y1="18" x2="21" y2="18" />
					<line x1="3" y1="6" x2="3.01" y2="6" />
					<line x1="3" y1="12" x2="3.01" y2="12" />
					<line x1="3" y1="18" x2="3.01" y2="18" />
				</svg>
			);
		case "webfetch":
		case "websearch":
			return (
				<svg
					className={`${baseClass} text-inferay-accent`}
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
			// Generic tool icon
			return (
				<svg
					className={`${baseClass} text-inferay-text-3`}
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
				</svg>
			);
	}
}

function getActivityIcon(
	type: ActivityType,
	toolName?: string
): React.ReactNode {
	switch (type) {
		case "thinking":
			return (
				<svg
					className="w-3 h-3 text-inferay-text-3 animate-pulse"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<circle cx="12" cy="12" r="10" />
					<path d="M12 6v6l4 2" />
				</svg>
			);
		case "responding":
			return (
				<svg
					className="w-3 h-3 text-inferay-accent animate-pulse"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
				</svg>
			);
		case "tool_start":
			return getToolIcon(toolName ?? "", true);
		case "tool_end":
			return getToolIcon(toolName ?? "", false);
		case "file_changed":
			return (
				<svg
					className="w-3 h-3 text-inferay-accent"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
					<polyline points="14 2 14 8 20 8" />
					<circle cx="12" cy="14" r="2" />
				</svg>
			);
		case "checkpoint":
			return (
				<svg
					className="w-3 h-3 text-inferay-accent"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
				</svg>
			);
		case "error":
			return (
				<svg
					className="w-3 h-3 text-git-removed"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<circle cx="12" cy="12" r="10" />
					<line x1="15" y1="9" x2="9" y2="15" />
					<line x1="9" y1="9" x2="15" y2="15" />
				</svg>
			);
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
