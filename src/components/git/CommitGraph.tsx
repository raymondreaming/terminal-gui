import { memo, useMemo } from "react";
import type { GraphNode } from "../../hooks/useGitGraph";

interface WipFile {
	path: string;
	status: string;
	staged: boolean;
}

interface CommitGraphProps {
	commits: GraphNode[];
	selectedHash?: string;
	onSelect?: (hash: string) => void;
	className?: string;
	wipFiles?: WipFile[];
	branch?: string;
}

const ROW_HEIGHT = 32;
const COLUMN_WIDTH = 16;
const NODE_RADIUS = 4;
const GRAPH_PADDING = 8;

function RefBadge({ ref: refName }: { ref: string }) {
	const isHead = refName.includes("HEAD");
	const isBranch =
		refName.startsWith("origin/") || (!refName.includes("tag:") && !isHead);
	const isTag = refName.startsWith("tag:");

	let bg = "bg-inferay-text/10";
	let text = "text-inferay-text-2";
	let displayName = refName;

	if (isHead) {
		bg = "bg-cyan-500/20";
		text = "text-cyan-400";
		displayName = refName.replace("HEAD -> ", "").replace("HEAD", "HEAD");
	} else if (refName.startsWith("origin/")) {
		bg = "bg-blue-500/15";
		text = "text-blue-400";
		displayName = refName.replace("origin/", "");
	} else if (isTag) {
		bg = "bg-amber-500/15";
		text = "text-amber-400";
		displayName = refName.replace("tag: ", "");
	} else if (isBranch) {
		bg = "bg-green-500/15";
		text = "text-green-400";
	}

	return (
		<span
			className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${bg} ${text}`}
		>
			{displayName}
		</span>
	);
}

// WIP (Work in Progress) row at the top
const WipRow = memo(function WipRow({
	maxColumn,
	selected,
	onClick,
	fileCount,
	branch,
}: {
	maxColumn: number;
	selected: boolean;
	onClick: () => void;
	fileCount: number;
	branch?: string;
}) {
	const graphWidth = (maxColumn + 1) * COLUMN_WIDTH + GRAPH_PADDING * 2;
	const cx = GRAPH_PADDING + COLUMN_WIDTH / 2; // Always column 0
	const cy = ROW_HEIGHT / 2;

	return (
		<div
			className={`group flex items-center h-8 px-2 cursor-pointer transition-colors ${
				selected ? "bg-inferay-accent/15" : "hover:bg-inferay-text/5"
			}`}
			onClick={onClick}
		>
			{/* Graph column */}
			<div className="shrink-0 flex items-center" style={{ width: graphWidth }}>
				<svg
					width={graphWidth}
					height={ROW_HEIGHT}
					className="overflow-visible"
				>
					{/* Dashed circle for WIP */}
					<circle
						cx={cx}
						cy={cy}
						r={NODE_RADIUS}
						fill="none"
						stroke="#f97316"
						strokeWidth={2}
						strokeDasharray="2 2"
					/>
				</svg>
			</div>

			{/* WIP info */}
			<div className="flex-1 min-w-0 flex items-center gap-2">
				{/* WIP badge */}
				<span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium bg-orange-500/20 text-orange-400">
					WIP on {branch ?? "branch"}
				</span>

				{/* File count */}
				{fileCount > 0 && (
					<span className="text-[10px] text-inferay-text-3">
						{fileCount} file{fileCount !== 1 ? "s" : ""} changed
					</span>
				)}
			</div>

			{/* Stats placeholder */}
			<div className="shrink-0 flex items-center gap-1 ml-2 text-[9px] tabular-nums">
				<span className="text-inferay-text-3/60">uncommitted</span>
			</div>
		</div>
	);
});

const CommitRow = memo(function CommitRow({
	commit,
	maxColumn,
	selected,
	onClick,
	rowOffset,
}: {
	commit: GraphNode;
	maxColumn: number;
	selected: boolean;
	onClick: () => void;
	rowOffset: number;
}) {
	const graphWidth = (maxColumn + 1) * COLUMN_WIDTH + GRAPH_PADDING * 2;
	const cx = GRAPH_PADDING + commit.column * COLUMN_WIDTH + COLUMN_WIDTH / 2;
	const cy = ROW_HEIGHT / 2;

	return (
		<div
			className={`group flex items-center h-8 px-2 cursor-pointer transition-colors ${
				selected ? "bg-inferay-accent/15" : "hover:bg-inferay-text/5"
			}`}
			onClick={onClick}
		>
			{/* Graph column */}
			<div className="shrink-0 flex items-center" style={{ width: graphWidth }}>
				<svg
					width={graphWidth}
					height={ROW_HEIGHT}
					className="overflow-visible"
				>
					{/* Commit node */}
					<circle
						cx={cx}
						cy={cy}
						r={NODE_RADIUS}
						fill={commit.color}
						stroke={selected ? "#fff" : commit.color}
						strokeWidth={selected ? 2 : 0}
					/>
				</svg>
			</div>

			{/* Commit info */}
			<div className="flex-1 min-w-0 flex items-center gap-2">
				{/* Hash */}
				<span className="shrink-0 font-mono text-[10px] text-inferay-accent">
					{commit.hash}
				</span>

				{/* Refs/badges */}
				{commit.refs.length > 0 && (
					<div className="shrink-0 flex items-center gap-1">
						{commit.refs.slice(0, 3).map((ref, i) => (
							<RefBadge key={i} ref={ref} />
						))}
						{commit.refs.length > 3 && (
							<span className="text-[9px] text-inferay-text-3">
								+{commit.refs.length - 3}
							</span>
						)}
					</div>
				)}

				{/* Message */}
				<span className="truncate text-[11px] text-inferay-text-2 group-hover:text-inferay-text">
					{commit.message}
				</span>
			</div>

			{/* Author & date */}
			<div className="shrink-0 flex items-center gap-3 ml-2">
				<span className="text-[10px] text-inferay-text-3 truncate max-w-[80px]">
					{commit.author}
				</span>
				<span className="text-[10px] text-inferay-text-3/60 tabular-nums">
					{commit.date}
				</span>
			</div>
		</div>
	);
});

export const CommitGraph = memo(function CommitGraph({
	commits,
	selectedHash,
	onSelect,
	className = "",
	wipFiles = [],
	branch,
}: CommitGraphProps) {
	const hasWip = wipFiles.length > 0;
	const wipOffset = hasWip ? 1 : 0; // Offset for WIP row

	const maxColumn = useMemo(() => {
		let max = 0;
		for (const c of commits) {
			if (c.column > max) max = c.column;
		}
		return max;
	}, [commits]);

	// Build connection lines between commits
	const connections = useMemo(() => {
		const lines: Array<{
			fromRow: number;
			toRow: number;
			fromCol: number;
			toCol: number;
			color: string;
		}> = [];

		const hashToRow = new Map<string, number>();
		commits.forEach((c, i) => hashToRow.set(c.hash, i + wipOffset));

		// Connect WIP to first commit
		if (hasWip && commits.length > 0) {
			lines.push({
				fromRow: 0,
				toRow: wipOffset,
				fromCol: 0,
				toCol: commits[0]!.column,
				color: "#f97316",
			});
		}

		for (let i = 0; i < commits.length; i++) {
			const commit = commits[i]!;
			const row = i + wipOffset;
			for (const parentHash of commit.parents) {
				const parentRow = hashToRow.get(parentHash);
				if (parentRow !== undefined) {
					const parentCommit = commits[parentRow - wipOffset]!;
					lines.push({
						fromRow: row,
						toRow: parentRow,
						fromCol: commit.column,
						toCol: parentCommit.column,
						color: commit.color,
					});
				}
			}
		}

		return lines;
	}, [commits, hasWip, wipOffset]);

	if (!commits.length && !hasWip) {
		return (
			<div className={`flex items-center justify-center py-8 ${className}`}>
				<p className="text-[11px] text-inferay-text-3">No commits</p>
			</div>
		);
	}

	const graphWidth = (maxColumn + 1) * COLUMN_WIDTH + GRAPH_PADDING * 2;
	const totalHeight = (commits.length + wipOffset) * ROW_HEIGHT;

	return (
		<div className={`relative overflow-auto ${className}`}>
			{/* SVG layer for connection lines */}
			<svg
				className="absolute top-0 left-2 pointer-events-none"
				width={graphWidth}
				height={totalHeight}
				style={{ zIndex: 0 }}
			>
				{connections.map((conn, i) => {
					const x1 =
						GRAPH_PADDING + conn.fromCol * COLUMN_WIDTH + COLUMN_WIDTH / 2;
					const y1 = conn.fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
					const x2 =
						GRAPH_PADDING + conn.toCol * COLUMN_WIDTH + COLUMN_WIDTH / 2;
					const y2 = conn.toRow * ROW_HEIGHT + ROW_HEIGHT / 2;

					// If same column, draw straight line
					if (conn.fromCol === conn.toCol) {
						return (
							<line
								key={i}
								x1={x1}
								y1={y1}
								x2={x2}
								y2={y2}
								stroke={conn.color}
								strokeWidth={2}
								strokeOpacity={0.6}
							/>
						);
					}

					// Otherwise, draw a curved path (merge/branch)
					const midY = (y1 + y2) / 2;
					const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
					return (
						<path
							key={i}
							d={path}
							stroke={conn.color}
							strokeWidth={2}
							strokeOpacity={0.6}
							fill="none"
						/>
					);
				})}
			</svg>

			{/* Rows */}
			<div className="relative" style={{ zIndex: 1 }}>
				{/* WIP row at top */}
				{hasWip && (
					<WipRow
						maxColumn={maxColumn}
						selected={selectedHash === "wip"}
						onClick={() => onSelect?.("wip")}
						fileCount={wipFiles.length}
						branch={branch}
					/>
				)}

				{/* Commit rows */}
				{commits.map((commit, i) => (
					<CommitRow
						key={commit.hash}
						commit={commit}
						maxColumn={maxColumn}
						selected={selectedHash === commit.hash}
						onClick={() => onSelect?.(commit.hash)}
						rowOffset={wipOffset}
					/>
				))}
			</div>
		</div>
	);
});
