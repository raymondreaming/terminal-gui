import { memo } from "react";
import { IconButton } from "../../components/ui/IconButton.tsx";
import { IconCircle, IconRobot, IconX } from "../../components/ui/Icons.tsx";
import type { ClaudeProcess } from "../../hooks/useClaudeProcesses.ts";
import { CollapsibleSidebarSection } from "./CollapsibleSidebarSection.tsx";

function formatRss(rssKb: number): string {
	if (rssKb >= 1024 * 1024) return `${(rssKb / (1024 * 1024)).toFixed(1)}G`;
	if (rssKb >= 1024) return `${Math.round(rssKb / 1024)}M`;
	return `${rssKb}K`;
}

function formatElapsed(elapsed: string): string {
	// ps etime format: [[dd-]hh:]mm:ss
	const parts = elapsed.trim().split(/[-:]/);
	if (parts.length === 2) return `${parts[0]}m`;
	if (parts.length === 3) return `${parts[0]}h ${parts[1]}m`;
	if (parts.length === 4) return `${parts[0]}d ${parts[1]}h`;
	return elapsed;
}

function cwdLabel(cwd: string): string {
	if (!cwd) return "unknown";
	return cwd.split("/").pop() || cwd;
}

export const ClaudeProcessesSidebar = memo(function ClaudeProcessesSidebar({
	processes,
	onKillProcess,
	onKillAll,
	expanded,
	onToggle,
}: {
	processes: ClaudeProcess[];
	onKillProcess: (pid: number) => void;
	onKillAll: () => void;
	expanded: boolean;
	onToggle: () => void;
}) {
	const totalRss = processes.reduce((sum, p) => sum + p.rss, 0);
	return (
		<CollapsibleSidebarSection
			icon={<IconRobot size={12} />}
			label="Processes"
			count={processes.length}
			countColor={
				processes.length > 5
					? "text-red-400"
					: processes.length > 0
						? "text-amber-400"
						: "text-inferay-text-3"
			}
			expanded={expanded}
			onToggle={onToggle}
			emptyMessage="No Claude processes running"
		>
			{processes.length > 0 && (
				<div className="flex items-center justify-between px-2 py-1 mb-1 rounded-md bg-inferay-surface/50">
					<span className="text-[9px] text-inferay-text-3">
						{processes.length} process{processes.length !== 1 ? "es" : ""} ·{" "}
						{formatRss(totalRss)}
					</span>
					{processes.length > 1 && (
						<button
							type="button"
							onClick={onKillAll}
							className="text-[9px] font-medium text-red-400 hover:text-red-300 transition-colors"
						>
							Kill All
						</button>
					)}
				</div>
			)}
			{processes.map((p) => (
				<div
					key={p.pid}
					className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors mb-0.5 hover:bg-inferay-surface group"
				>
					<div className="shrink-0">
						<IconCircle
							size={8}
							className={`fill-current ${p.cpu > 10 ? "text-red-400" : p.cpu > 2 ? "text-amber-400" : "text-inferay-accent"}`}
						/>
					</div>
					<div className="min-w-0 flex-1">
						<p
							className="truncate text-[11px] font-medium text-inferay-text"
							title={p.cwd || `PID ${p.pid}`}
						>
							{cwdLabel(p.cwd) || `PID ${p.pid}`}
						</p>
						<p className="truncate text-[9px] text-inferay-text-3">
							{p.cpu}% CPU · {formatRss(p.rss)} · {formatElapsed(p.elapsed)}
						</p>
					</div>
					<IconButton
						variant="danger"
						size="xs"
						onClick={() => onKillProcess(p.pid)}
						title={`Kill PID ${p.pid}`}
						className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
					>
						<IconX size={10} />
					</IconButton>
				</div>
			))}
		</CollapsibleSidebarSection>
	);
});
