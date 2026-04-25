import { memo, useEffect, useMemo, useState } from "react";
import type { GraphNode, GraphRow } from "../../hooks/useGitGraph";
import {
	CommitGraphLinesLayer,
	IconCheck,
	IconCloud,
	IconGitBranch,
	IconTag,
} from "../ui/Icons.tsx";

interface WipFile {
	path: string;
	status: string;
	staged: boolean;
}

interface CommitGraphProps {
	commits: GraphNode[];
	rows: GraphRow[];
	selectedHash?: string;
	onSelect?: (hash: string) => void;
	className?: string;
	wipFiles?: WipFile[];
	branch?: string;
}

interface ColumnVisibility {
	author: boolean;
	sha: boolean;
	date: boolean;
}

const ROW_HEIGHT = 28;
const COLUMN_WIDTH = 12;
const AVATAR_SIZE = 16;
const GRAPH_PADDING = 6;
const LINE_WIDTH = 2.5;
const AUTHOR_WIDTH = 136;
const SHA_WIDTH = 68;
const DATE_WIDTH = 100;
const REF_WIDTH = 112;
const COLUMN_PREFS_KEY = "commit-graph-columns-v5";
const DEFAULT_COLUMNS: ColumnVisibility = {
	author: true,
	sha: true,
	date: false,
};

function hexToRgba(hex: string, alpha: number) {
	const c = hex.replace("#", "");
	const n =
		c.length === 3
			? c
					.split("")
					.map((ch) => `${ch}${ch}`)
					.join("")
			: c;
	return `rgba(${Number.parseInt(n.slice(0, 2), 16)}, ${Number.parseInt(n.slice(2, 4), 16)}, ${Number.parseInt(n.slice(4, 6), 16)}, ${alpha})`;
}

interface ParsedRef {
	label: string;
	kind: "head" | "local" | "remote" | "tag";
}

function parseRefs(refs: string[]): ParsedRef[] {
	const out: ParsedRef[] = [];
	const localNames = new Set<string>();

	// First pass: collect local branch names
	for (const raw of refs) {
		if (raw.includes("HEAD -> ")) {
			localNames.add(raw.replace("HEAD -> ", ""));
		} else if (
			!raw.startsWith("origin/") &&
			!raw.startsWith("tag: ") &&
			raw !== "HEAD"
		) {
			localNames.add(raw);
		}
	}

	for (const raw of refs) {
		// Skip bare HEAD, origin/HEAD, and stash refs
		if (raw === "HEAD" || raw === "origin/HEAD" || raw.includes("stash"))
			continue;

		if (raw.includes("HEAD -> ")) {
			out.push({ label: raw.replace("HEAD -> ", ""), kind: "head" });
		} else if (raw.startsWith("tag: ")) {
			out.push({ label: raw.replace("tag: ", ""), kind: "tag" });
		} else if (raw.startsWith("origin/")) {
			// Skip remote ref if we already have the local branch
			const remoteName = raw.replace("origin/", "");
			if (localNames.has(remoteName)) continue;
			out.push({ label: raw, kind: "remote" });
		} else {
			out.push({ label: raw, kind: "local" });
		}
	}

	const order = { head: 0, local: 1, remote: 2, tag: 3 };
	out.sort((a, b) => order[a.kind] - order[b.kind]);
	return out;
}

function loadColumns(): ColumnVisibility {
	try {
		const raw = localStorage.getItem(COLUMN_PREFS_KEY);
		if (!raw) return DEFAULT_COLUMNS;
		return { ...DEFAULT_COLUMNS, ...(JSON.parse(raw) as ColumnVisibility) };
	} catch {
		return DEFAULT_COLUMNS;
	}
}

/** Small SVG icons for ref badges */
function RefIcon({ kind }: { kind: ParsedRef["kind"] }) {
	const size = 10;
	if (kind === "head") {
		return <IconCheck size={size} className="shrink-0" />;
	}
	if (kind === "tag") {
		return <IconTag size={size} className="shrink-0" />;
	}
	if (kind === "remote") {
		return <IconCloud size={size} className="shrink-0" />;
	}
	return <IconGitBranch size={size} className="shrink-0" />;
}

function RefBadge({
	label,
	color,
	kind,
}: {
	label: string;
	color: string;
	kind: ParsedRef["kind"];
}) {
	return (
		<span
			className="inline-flex h-4 max-w-full items-center gap-1 overflow-hidden whitespace-nowrap text-ellipsis rounded-full px-1.5 text-[9px] font-medium leading-none"
			style={{
				border: `1px solid ${hexToRgba(color, 0.28)}`,
				backgroundColor: hexToRgba(color, 0.1),
				color,
			}}
		>
			<RefIcon kind={kind} />
			<span className="truncate">{label}</span>
		</span>
	);
}

function RefBadges({ refs, color }: { refs: string[]; color: string }) {
	const parsed = parseRefs(refs);
	if (!parsed.length) return null;
	const visible = parsed.slice(0, 1);
	const extra = parsed.length - 1;
	return (
		<div className="flex items-center gap-1 overflow-hidden">
			{visible.map((ref) => (
				<RefBadge
					key={ref.label}
					label={ref.label}
					color={color}
					kind={ref.kind}
				/>
			))}
			{extra > 0 && (
				<span className="shrink-0 text-[8px] text-inferay-text-3">
					+{extra}
				</span>
			)}
		</div>
	);
}

// ── Header ──────────────────────────────────────────────────────

function HeaderRow({
	graphWidth,
	columns,
	isColumnsOpen,
	onToggleColumnsMenu,
	onToggleColumn,
}: {
	graphWidth: number;
	columns: ColumnVisibility;
	isColumnsOpen: boolean;
	onToggleColumnsMenu: () => void;
	onToggleColumn: (key: keyof ColumnVisibility) => void;
}) {
	return (
		<div className="sticky top-0 z-10 flex h-7 items-center border-b border-inferay-border bg-inferay-bg/95 text-[9px] font-semibold uppercase tracking-[0.16em] text-inferay-text-3 backdrop-blur">
			<div className="shrink-0 px-2 text-right" style={{ width: REF_WIDTH }}>
				Refs
			</div>
			<div className="shrink-0" style={{ width: graphWidth }} />
			<div className="min-w-0 flex-1 px-3">Description</div>
			{columns.author && (
				<div
					className="shrink-0 border-l border-inferay-border px-3"
					style={{ width: AUTHOR_WIDTH }}
				>
					Author
				</div>
			)}
			{columns.date && (
				<div
					className="shrink-0 border-l border-inferay-border px-3"
					style={{ width: DATE_WIDTH }}
				>
					Date
				</div>
			)}
			{columns.sha && (
				<div
					className="shrink-0 border-l border-inferay-border px-3 text-right"
					style={{ width: SHA_WIDTH }}
				>
					SHA
				</div>
			)}
			<div className="relative shrink-0 border-l border-inferay-border px-2">
				<button
					type="button"
					onClick={onToggleColumnsMenu}
					className="rounded border border-inferay-border px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em] text-inferay-text-3 hover:border-inferay-border-bold hover:text-inferay-text-2"
				>
					Cols
				</button>
				{isColumnsOpen && (
					<div className="absolute right-2 top-8 z-20 w-28 rounded-md border border-inferay-border bg-inferay-surface p-1 shadow-lg">
						{(
							[
								["author", "Author"],
								["sha", "SHA"],
								["date", "Date"],
							] as const
						).map(([key, label]) => (
							<button
								key={key}
								type="button"
								onClick={() => onToggleColumn(key)}
								className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-[10px] text-inferay-text-2 hover:bg-inferay-surface-2"
							>
								{label}
								<span className="text-inferay-text-3">
									{columns[key] ? "On" : "Off"}
								</span>
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

// ── WIP Row ─────────────────────────────────────────────────────

const WipRow = memo(function WipRow({
	graphWidth,
	selected,
	onClick,
	fileCount,
	branch,
	columns,
}: {
	graphWidth: number;
	selected: boolean;
	onClick: () => void;
	fileCount: number;
	branch?: string;
	columns: ColumnVisibility;
}) {
	const nodeLeft = GRAPH_PADDING + COLUMN_WIDTH / 2 - AVATAR_SIZE / 2;
	const nodeTop = ROW_HEIGHT / 2 - AVATAR_SIZE / 2;

	return (
		<div
			className="group relative flex cursor-pointer items-center transition-colors hover:bg-inferay-surface"
			style={{
				height: ROW_HEIGHT,
				backgroundColor: selected
					? "rgba(249,115,22,0.08)"
					: "rgba(249,115,22,0.025)",
			}}
			onClick={onClick}
		>
			{selected && (
				<div className="absolute left-0 top-0 h-full w-[3px] bg-orange-500" />
			)}

			{/* Ref gutter */}
			<div
				className="flex h-full shrink-0 items-center justify-end overflow-hidden px-2"
				style={{ width: REF_WIDTH }}
			>
				<RefBadge label={`WIP ${branch ?? ""}`} color="#f97316" kind="local" />
			</div>

			{/* Graph cell: dashed circle node */}
			<div className="relative h-full shrink-0" style={{ width: graphWidth }}>
				<div
					className="absolute flex items-center justify-center rounded-full border-2 border-dashed"
					style={{
						left: nodeLeft,
						top: nodeTop,
						width: AVATAR_SIZE,
						height: AVATAR_SIZE,
						borderColor: "#f97316",
						backgroundColor: "var(--color-inferay-bg)",
						boxShadow: "0 0 6px rgba(249,115,22,0.2)",
						zIndex: 3,
					}}
				>
					<div
						className="h-2 w-2 rounded-full"
						style={{ backgroundColor: "rgba(249,115,22,0.45)" }}
					/>
				</div>
			</div>

			{/* Message */}
			<div className="flex min-w-0 flex-1 items-center gap-2 px-3">
				<span className="truncate text-[11px] text-inferay-text-2">
					Uncommitted changes
				</span>
				<span className="shrink-0 text-[10px] text-inferay-text-3">
					{fileCount} file{fileCount === 1 ? "" : "s"}
				</span>
			</div>

			{columns.author && (
				<div
					className="flex h-full shrink-0 items-center gap-2 border-l border-inferay-border px-3 text-[10px] text-inferay-text-3"
					style={{ width: AUTHOR_WIDTH }}
				>
					<div className="h-4 w-4 rounded-full border border-dashed border-orange-500/70" />
					<span className="truncate">Workspace</span>
				</div>
			)}
			{columns.date && (
				<div
					className="flex h-full shrink-0 items-center border-l border-inferay-border px-3 text-[10px] text-inferay-text-3"
					style={{ width: DATE_WIDTH }}
				>
					Now
				</div>
			)}
			{columns.sha && (
				<div
					className="flex h-full shrink-0 items-center justify-end border-l border-inferay-border px-3 text-[10px] font-mono text-inferay-text-3"
					style={{ width: SHA_WIDTH }}
				>
					---
				</div>
			)}
			<div className="shrink-0" style={{ width: 38 }} />
		</div>
	);
});

// ── Commit Row ──────────────────────────────────────────────────

const CommitRow = memo(function CommitRow({
	commit,
	graphWidth,
	selected,
	onClick,
	columns,
	index,
}: {
	commit: GraphNode;
	graphWidth: number;
	selected: boolean;
	onClick: () => void;
	columns: ColumnVisibility;
	index: number;
}) {
	const nodeLeft =
		GRAPH_PADDING +
		commit.column * COLUMN_WIDTH +
		COLUMN_WIDTH / 2 -
		AVATAR_SIZE / 2;
	const nodeTop = ROW_HEIGHT / 2 - AVATAR_SIZE / 2;
	const hasRefs = commit.refs.length > 0;

	return (
		<div
			className="group relative flex cursor-pointer items-center transition-colors hover:bg-inferay-surface"
			style={{
				height: ROW_HEIGHT,
				backgroundColor: selected
					? "rgba(255,255,255,0.035)"
					: index % 2 === 1
						? "rgba(255,255,255,0.012)"
						: undefined,
			}}
			onClick={onClick}
		>
			{/* Selected accent bar */}
			{selected && (
				<div
					className="absolute left-0 top-0 h-full w-[3px]"
					style={{ backgroundColor: commit.color }}
				/>
			)}

			{/* Ref gutter */}
			<div
				className="flex h-full shrink-0 items-center justify-end overflow-hidden px-2"
				style={{ width: REF_WIDTH }}
			>
				{hasRefs ? <RefBadges refs={commit.refs} color={commit.color} /> : null}
			</div>

			{/* Graph cell: avatar node on the line */}
			<div className="relative h-full shrink-0" style={{ width: graphWidth }}>
				<img
					src={commit.authorAvatarUrl}
					alt=""
					className="absolute rounded-full"
					style={{
						left: nodeLeft,
						top: nodeTop,
						width: AVATAR_SIZE,
						height: AVATAR_SIZE,
						border: `2.5px solid ${commit.color}`,
						backgroundColor: "var(--color-inferay-bg)",
						boxShadow: `0 0 6px ${hexToRgba(commit.color, 0.25)}`,
						zIndex: 3,
					}}
				/>
			</div>

			{/* Commit message + author */}
			<div className="flex min-w-0 flex-1 items-center gap-2 px-3">
				<div className="min-w-0 truncate text-[11px] leading-none text-inferay-text-2 group-hover:text-inferay-text">
					{commit.message}
				</div>
			</div>

			{columns.author && (
				<div
					className="flex h-full shrink-0 items-center gap-2 border-l border-inferay-border px-3"
					style={{ width: AUTHOR_WIDTH }}
				>
					<img
						src={commit.authorAvatarUrl}
						alt=""
						className="h-4 w-4 shrink-0 rounded-full"
					/>
					<span className="truncate text-[10px] text-inferay-text-3">
						{commit.author}
					</span>
				</div>
			)}
			{columns.date && (
				<div
					className="flex h-full shrink-0 items-center border-l border-inferay-border px-3 text-[10px] text-inferay-text-3"
					style={{ width: DATE_WIDTH }}
				>
					{commit.date}
				</div>
			)}
			{columns.sha && (
				<div
					className="flex h-full shrink-0 items-center justify-end border-l border-inferay-border px-3 text-[10px] font-mono text-inferay-text-3"
					style={{ width: SHA_WIDTH }}
				>
					{commit.hash}
				</div>
			)}
			<div className="shrink-0" style={{ width: 38 }} />
		</div>
	);
});

// ── Connection types & path building ────────────────────────────

interface RowTransition {
	row: number;
	fromCol: number;
	toCol: number;
	color: string;
}

function colX(col: number): number {
	return REF_WIDTH + GRAPH_PADDING + col * COLUMN_WIDTH + COLUMN_WIDTH / 2;
}

function rowY(row: number): number {
	return row * ROW_HEIGHT + ROW_HEIGHT / 2;
}

function rowTop(row: number): number {
	return row * ROW_HEIGHT + 1;
}

function rowBottom(row: number): number {
	return (row + 1) * ROW_HEIGHT - 1;
}

function buildConnection(conn: RowTransition): string {
	const x1 = colX(conn.fromCol);
	const y1 = rowY(conn.row);
	const x2 = colX(conn.toCol);
	const elbowY = y1 + ROW_HEIGHT * 0.36;
	const endY = rowY(conn.row + 1);
	const direction = x2 > x1 ? 1 : -1;
	const radius = 3;

	return [
		`M ${x1} ${y1}`,
		`L ${x1} ${elbowY - radius}`,
		`Q ${x1} ${elbowY} ${x1 + direction * radius} ${elbowY}`,
		`L ${x2 - direction * radius} ${elbowY}`,
		`Q ${x2} ${elbowY} ${x2} ${elbowY + radius}`,
		`L ${x2} ${endY}`,
	].join(" ");
}

// ── Main component ──────────────────────────────────────────────

export const CommitGraph = memo(function CommitGraph({
	commits,
	rows,
	selectedHash,
	onSelect,
	className = "",
	wipFiles = [],
	branch,
}: CommitGraphProps) {
	const [columns, setColumns] = useState<ColumnVisibility>(DEFAULT_COLUMNS);
	const [isColumnsOpen, setIsColumnsOpen] = useState(false);
	const hasWip = wipFiles.length > 0;
	const wipOffset = hasWip ? 1 : 0;

	useEffect(() => setColumns(loadColumns()), []);
	useEffect(() => {
		try {
			localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(columns));
		} catch {}
	}, [columns]);

	const maxColumn = useMemo(() => {
		let max = 0;
		for (const c of commits) if (c.column > max) max = c.column;
		return max;
	}, [commits]);

	const graphWidth = (maxColumn + 1) * COLUMN_WIDTH + GRAPH_PADDING * 2;
	const totalHeight = (commits.length + wipOffset) * ROW_HEIGHT;

	const toggleColumn = (key: keyof ColumnVisibility) =>
		setColumns((cur) => ({ ...cur, [key]: !cur[key] }));

	const railSegments = useMemo(() => {
		const segments: Array<{
			key: string;
			row: number;
			column: number;
			color: string;
		}> = [];
		for (const row of rows) {
			for (const rail of row.rails) {
				segments.push({
					key: `rail-${row.row + wipOffset}-${rail.column}`,
					row: row.row + wipOffset,
					column: rail.column,
					color: rail.color,
				});
			}
		}
		if (hasWip && commits.length > 0) {
			segments.unshift({
				key: "rail-wip-0",
				row: 0,
				column: 0,
				color: commits[0]!.color,
			});
		}
		return segments;
	}, [rows, wipOffset, hasWip, commits]);

	const transitions = useMemo(() => {
		const result: RowTransition[] = [];
		for (const row of rows) {
			for (const transition of row.transitions) {
				result.push({
					row: row.row + wipOffset,
					fromCol: transition.fromColumn,
					toCol: transition.toColumn,
					color: transition.color,
				});
			}
		}
		if (hasWip && commits.length > 0) {
			result.unshift({
				row: 0,
				fromCol: 0,
				toCol: commits[0]!.column,
				color: commits[0]!.color,
			});
		}
		return result;
	}, [rows, wipOffset, hasWip, commits]);

	if (!commits.length && !hasWip) {
		return (
			<div
				className={`flex items-center justify-center rounded-md border border-inferay-border bg-inferay-bg py-8 ${className}`}
			>
				<p className="text-[11px] text-inferay-text-3">No commits</p>
			</div>
		);
	}

	return (
		<div
			className={`relative overflow-auto rounded-md border border-inferay-border bg-inferay-bg ${className}`}
		>
			<HeaderRow
				graphWidth={graphWidth}
				columns={columns}
				isColumnsOpen={isColumnsOpen}
				onToggleColumnsMenu={() => setIsColumnsOpen((o) => !o)}
				onToggleColumn={toggleColumn}
			/>

			{/* SVG lines layer — clipped to ref+graph area */}
			<CommitGraphLinesLayer
				className="pointer-events-none absolute top-7 left-0"
				width={REF_WIDTH + graphWidth}
				height={totalHeight}
				style={{ zIndex: 1 }}
				railSegments={railSegments}
				transitions={transitions}
				colX={colX}
				rowTop={rowTop}
				rowBottom={rowBottom}
				buildConnection={buildConnection}
				lineWidth={LINE_WIDTH}
			/>

			{/* Rows layer — avatar nodes sit on top of lines */}
			<div className="relative" style={{ zIndex: 2 }}>
				{hasWip && (
					<WipRow
						graphWidth={graphWidth}
						selected={selectedHash === "wip"}
						onClick={() => onSelect?.("wip")}
						fileCount={wipFiles.length}
						branch={branch}
						columns={columns}
					/>
				)}
				{commits.map((commit, i) => (
					<CommitRow
						key={commit.hash}
						commit={commit}
						graphWidth={graphWidth}
						selected={selectedHash === commit.hash}
						onClick={() => onSelect?.(commit.hash)}
						columns={columns}
						index={i}
					/>
				))}
			</div>
		</div>
	);
});
