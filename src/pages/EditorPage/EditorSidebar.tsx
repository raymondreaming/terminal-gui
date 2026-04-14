import { useCallback, useMemo, useState } from "react";
import type { GitFileEntry } from "../../hooks/useGitStatus.ts";

export interface SelectedFile {
	path: string;
	staged: boolean;
}

/* ── Main EditorSidebar component ─────────────────────── */

export function EditorSidebar({
	fileViewMode,
	onFileViewModeChange,
	mainViewMode,
	// Diff mode props
	modified,
	untracked,
	staged,
	selectedFile,
	onSelectFile,
	onStageFile,
	onUnstageFile,
	onStageAll,
	onUnstageAll,
	hasProject,
	// Graph mode props
	selectedCommitHash,
	commitDetailsLoading,
	commitDetails,
	files,
	branch,
	// Commit props
	commitMessage,
	onCommitMessageChange,
	onCommit,
	isCommitting,
	amendMode,
	onAmendModeChange,
}: {
	fileViewMode: "path" | "tree";
	onFileViewModeChange: (mode: "path" | "tree") => void;
	mainViewMode: "diff" | "graph";
	modified: GitFileEntry[];
	untracked: GitFileEntry[];
	staged: GitFileEntry[];
	selectedFile: SelectedFile | null;
	onSelectFile: (f: GitFileEntry) => void;
	onStageFile: (path: string) => void;
	onUnstageFile: (path: string) => void;
	onStageAll: () => void;
	onUnstageAll: () => void;
	hasProject: boolean;
	selectedCommitHash: string | null;
	commitDetailsLoading: boolean;
	commitDetails: {
		hash: string;
		message: string;
		author: string;
		date: string;
		files: Array<{
			path: string;
			status: string;
			additions: number;
			deletions: number;
		}>;
	} | null;
	files: GitFileEntry[];
	branch?: string;
	commitMessage: string;
	onCommitMessageChange: (msg: string) => void;
	onCommit: () => void;
	isCommitting: boolean;
	amendMode: boolean;
	onAmendModeChange: (v: boolean) => void;
}) {
	return (
		<div className="flex flex-1 flex-col min-w-0">
			<EditorSidebarHeader
				fileViewMode={fileViewMode}
				onFileViewModeChange={onFileViewModeChange}
			/>

			{mainViewMode !== "graph" && (
				<div className="flex-1 min-h-0 overflow-y-auto">
					<FileGroup
						title="Unstaged"
						files={[...modified, ...untracked]}
						color="text-inferay-text-2"
						selected={selectedFile}
						onSelect={onSelectFile}
						actionLabel="Stage"
						onAction={onStageFile}
						onActionAll={onStageAll}
						viewMode={fileViewMode}
						minHeight={200}
						maxHeight={300}
					/>
					<FileGroup
						title="Staged"
						files={staged}
						color="text-git-added"
						selected={selectedFile}
						onSelect={onSelectFile}
						actionLabel="Unstage"
						onAction={onUnstageFile}
						onActionAll={onUnstageAll}
						viewMode={fileViewMode}
					/>

					{hasProject && !files.length && (
						<div className="flex items-center justify-center py-6">
							<p className="text-[10px] text-inferay-text-3/50">Clean</p>
						</div>
					)}
					{!hasProject && (
						<div className="flex items-center justify-center py-6">
							<p className="px-3 text-center text-[10px] text-inferay-text-3/50">
								No repository
							</p>
						</div>
					)}
				</div>
			)}

			{mainViewMode === "graph" && (
				<div className="flex-1 min-h-0 overflow-y-auto">
					{selectedCommitHash === "wip" ? (
						<>
							<div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 border-b border-inferay-border bg-inferay-bg">
								<div className="w-3 h-3 rounded-full border-2 border-dashed border-inferay-accent" />
								<span className="text-[11px] font-medium text-inferay-text">
									WIP on {branch ?? "branch"}
								</span>
								<span className="ml-auto text-[9px] text-inferay-text-3">
									{files.length} files
								</span>
							</div>
							<div className="py-1">
								{files.map((f, i) => (
									<div
										key={i}
										className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-inferay-text/5"
									>
										<FileStatusIcon status={f.status} />
										<span className="flex-1 truncate text-[10px] font-mono text-inferay-text-2">
											{f.path}
										</span>
									</div>
								))}
								{files.length === 0 && (
									<div className="flex items-center justify-center py-6">
										<p className="text-[10px] text-inferay-text-3/50">
											No changes
										</p>
									</div>
								)}
							</div>
						</>
					) : selectedCommitHash ? (
						commitDetailsLoading ? (
							<div className="flex items-center justify-center py-8">
								<p className="text-[10px] text-inferay-text-3">Loading...</p>
							</div>
						) : commitDetails ? (
							<CommitDetailsPanel details={commitDetails} />
						) : (
							<div className="flex items-center justify-center py-8">
								<p className="text-[10px] text-inferay-text-3">No details</p>
							</div>
						)
					) : (
						<div className="flex items-center justify-center py-8">
							<p className="text-[10px] text-inferay-text-3 px-4 text-center">
								Select a commit to view details
							</p>
						</div>
					)}
				</div>
			)}

			{hasProject && mainViewMode !== "graph" && (
				<CommitSection
					commitMessage={commitMessage}
					onCommitMessageChange={onCommitMessageChange}
					onCommit={onCommit}
					isCommitting={isCommitting}
					amendMode={amendMode}
					onAmendModeChange={onAmendModeChange}
					stagedCount={staged.length}
				/>
			)}
		</div>
	);
}

/* ── Sub-components ───────────────────────────────────── */

function EditorSidebarHeader({
	fileViewMode,
	onFileViewModeChange,
}: {
	fileViewMode: "path" | "tree";
	onFileViewModeChange: (mode: "path" | "tree") => void;
}) {
	return (
		<div className="sticky top-0 z-20 flex items-center gap-1.5 border-b border-inferay-border/40 bg-inferay-bg px-2 py-1.5">
			<span className="text-[9px] font-medium text-inferay-text-3">Files</span>
			<span className="flex-1" />
			<div className="flex h-5 items-center overflow-hidden rounded-md border border-inferay-border bg-inferay-surface">
				<button
					type="button"
					onClick={() => onFileViewModeChange("path")}
					title="Path view"
					className={`h-full px-1.5 text-[8px] font-medium transition-colors ${
						fileViewMode === "path"
							? "bg-inferay-text/10 text-inferay-text"
							: "text-inferay-text-3 hover:text-inferay-text-2"
					}`}
				>
					Path
				</button>
				<button
					type="button"
					onClick={() => onFileViewModeChange("tree")}
					title="Tree view"
					className={`h-full px-1.5 text-[8px] font-medium transition-colors ${
						fileViewMode === "tree"
							? "bg-inferay-text/10 text-inferay-text"
							: "text-inferay-text-3 hover:text-inferay-text-2"
					}`}
				>
					Tree
				</button>
			</div>
		</div>
	);
}

function CommitSection({
	commitMessage,
	onCommitMessageChange,
	onCommit,
	isCommitting,
	amendMode,
	onAmendModeChange,
	stagedCount,
}: {
	commitMessage: string;
	onCommitMessageChange: (msg: string) => void;
	onCommit: () => void;
	isCommitting: boolean;
	amendMode: boolean;
	onAmendModeChange: (v: boolean) => void;
	stagedCount: number;
}) {
	const summary = commitMessage.split("\n")[0] || "";
	const description = commitMessage.split("\n").slice(1).join("\n");

	return (
		<div className="shrink-0 border-t border-inferay-border">
			{/* Commit header */}
			<div className="flex items-center justify-between px-2.5 h-8 border-b border-inferay-border/40">
				<div className="flex items-center gap-1.5">
					<svg
						className="w-3 h-3 text-inferay-text-3"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<circle cx="12" cy="12" r="4" />
						<line x1="1.05" y1="12" x2="7" y2="12" />
						<line x1="17.01" y1="12" x2="22.96" y2="12" />
					</svg>
					<span className="text-[9px] font-medium text-inferay-text-2">
						Commit
					</span>
				</div>
			</div>

			{/* Amend toggle */}
			<label className="flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer hover:bg-inferay-text/[0.03] transition-colors">
				<input
					type="checkbox"
					checked={amendMode}
					onChange={(e) => onAmendModeChange(e.target.checked)}
					className="w-3 h-3 rounded border-inferay-border accent-inferay-accent"
				/>
				<span className="text-[9px] text-inferay-text-3">
					Amend previous commit
				</span>
			</label>

			{/* Commit form */}
			<div className="px-2.5 pb-2.5 space-y-2">
				<div className="rounded-lg border border-inferay-border bg-inferay-surface overflow-hidden focus-within:border-inferay-accent/50 transition-colors">
					<div className="flex items-center border-b border-inferay-border/20">
						<input
							type="text"
							value={summary}
							onChange={(e) => {
								const lines = commitMessage.split("\n");
								lines[0] = e.target.value;
								onCommitMessageChange(lines.join("\n"));
							}}
							placeholder="Commit summary"
							className="flex-1 min-w-0 bg-transparent px-2.5 py-2 text-[11px] text-inferay-text placeholder:text-inferay-text-3/30 outline-none"
							onKeyDown={(e) => {
								if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
									e.preventDefault();
									onCommit();
								}
							}}
						/>
						{summary.length > 0 && (
							<span
								className={`shrink-0 pr-2.5 text-[9px] tabular-nums ${
									summary.length > 72
										? "text-amber-400"
										: "text-inferay-text-3/40"
								}`}
							>
								{summary.length}
							</span>
						)}
					</div>
					<textarea
						value={description}
						onChange={(e) => {
							const sum = commitMessage.split("\n")[0] || "";
							onCommitMessageChange(
								sum + (e.target.value ? "\n" + e.target.value : "")
							);
						}}
						placeholder="Description"
						className="w-full resize-none bg-transparent px-2.5 py-2 text-[10px] text-inferay-text placeholder:text-inferay-text-3/30 outline-none"
						rows={4}
					/>
				</div>

				<button
					type="button"
					onClick={onCommit}
					disabled={!commitMessage.trim() || !stagedCount || isCommitting}
					className="w-full flex items-center justify-center gap-1.5 rounded-md bg-inferay-accent hover:bg-inferay-accent/90 px-3 py-2 text-[10px] font-medium text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
				>
					<svg
						className="w-3 h-3"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<circle cx="12" cy="12" r="4" />
						<line x1="1.05" y1="12" x2="7" y2="12" />
						<line x1="17.01" y1="12" x2="22.96" y2="12" />
					</svg>
					{isCommitting
						? "Committing..."
						: stagedCount
							? `Commit changes to ${stagedCount} file${stagedCount !== 1 ? "s" : ""}`
							: "Nothing to commit"}
				</button>
			</div>
		</div>
	);
}

function CommitDetailsPanel({
	details,
}: {
	details: {
		hash: string;
		message: string;
		author: string;
		date: string;
		files: Array<{
			path: string;
			status: string;
			additions: number;
			deletions: number;
		}>;
	};
}) {
	return (
		<div className="flex flex-col h-full">
			<div className="shrink-0 border-b border-inferay-border p-3 space-y-2">
				<div className="flex items-center gap-2">
					<span className="font-mono text-[11px] text-inferay-accent font-medium">
						{details.hash.slice(0, 7)}
					</span>
					<span className="text-[10px] text-inferay-text-3">
						{details.date}
					</span>
				</div>
				<p className="text-[11px] text-inferay-text leading-relaxed">
					{details.message}
				</p>
				<p className="text-[10px] text-inferay-text-2">{details.author}</p>
			</div>

			<div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-inferay-border/50 bg-inferay-text/[0.02]">
				<span className="text-[9px] font-medium text-inferay-text-2">
					Files Changed
				</span>
				<span className="text-[9px] text-inferay-text-3">
					{details.files.length}
				</span>
			</div>

			<div className="flex-1 min-h-0 overflow-y-auto">
				{details.files.map((file, i) => (
					<div
						key={i}
						className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-inferay-text/5 cursor-pointer"
					>
						<FileStatusIcon status={file.status} />
						<span className="flex-1 truncate text-[10px] font-mono text-inferay-text-2">
							{file.path.split("/").pop()}
						</span>
						<div className="shrink-0 flex items-center gap-1 text-[9px] tabular-nums">
							{file.additions > 0 && (
								<span className="text-git-added">+{file.additions}</span>
							)}
							{file.deletions > 0 && (
								<span className="text-git-deleted">-{file.deletions}</span>
							)}
						</div>
					</div>
				))}
			</div>

			<div className="shrink-0 flex items-center justify-center gap-3 px-3 py-2 border-t border-inferay-border text-[10px]">
				<span className="text-git-added">
					+{details.files.reduce((sum, f) => sum + f.additions, 0)}
				</span>
				<span className="text-git-deleted">
					-{details.files.reduce((sum, f) => sum + f.deletions, 0)}
				</span>
			</div>
		</div>
	);
}

export function FileStatusIcon({ status }: { status: string }) {
	const base =
		"shrink-0 flex items-center justify-center w-[18px] h-[18px] rounded-sm text-[9px] font-bold leading-none";
	switch (status) {
		case "M":
			return (
				<span
					className={`${base} text-amber-400 bg-amber-400/15`}
					title="Modified"
				>
					M
				</span>
			);
		case "A":
			return (
				<span
					className={`${base} text-git-added bg-git-added/15`}
					title="Added"
				>
					A
				</span>
			);
		case "D":
			return (
				<span
					className={`${base} text-git-deleted bg-git-deleted/15`}
					title="Deleted"
				>
					D
				</span>
			);
		case "R":
			return (
				<span
					className={`${base} text-blue-400 bg-blue-400/15`}
					title="Renamed"
				>
					R
				</span>
			);
		case "?":
			return (
				<span
					className={`${base} text-inferay-text-3 bg-inferay-text/8`}
					title="Untracked"
				>
					U
				</span>
			);
		default:
			return (
				<span
					className={`${base} text-inferay-text-3 bg-inferay-text/8`}
					title={status}
				>
					{status.charAt(0) || "•"}
				</span>
			);
	}
}

/* ── Tree helpers ─────────────────────────────────────── */

interface TreeNode {
	name: string;
	path: string;
	children: Map<string, TreeNode>;
	file?: GitFileEntry;
}

function buildFileTree(files: GitFileEntry[]): TreeNode {
	const root: TreeNode = { name: "", path: "", children: new Map() };

	for (const file of files) {
		const parts = file.path.split("/");
		let current = root;
		let currentPath = "";

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i]!;
			currentPath = currentPath ? `${currentPath}/${part}` : part;

			if (!current.children.has(part)) {
				current.children.set(part, {
					name: part,
					path: currentPath,
					children: new Map(),
				});
			}
			current = current.children.get(part)!;
			if (i === parts.length - 1) {
				current.file = file;
			}
		}
	}

	return root;
}

function TreeNodeRow({
	node,
	depth,
	selected,
	onSelect,
	onAction,
	actionLabel,
	expandedDirs,
	toggleDir,
}: {
	node: TreeNode;
	depth: number;
	selected: SelectedFile | null;
	onSelect: (f: GitFileEntry) => void;
	onAction?: (path: string) => void;
	actionLabel?: string;
	expandedDirs: Set<string>;
	toggleDir: (path: string) => void;
}) {
	const isDir = node.children.size > 0 && !node.file;
	const isExpanded = expandedDirs.has(node.path);
	const file = node.file;
	const active =
		file && selected?.path === file.path && selected?.staged === file.staged;

	const sortedChildren = [...node.children.values()].sort((a, b) => {
		const aIsDir = a.children.size > 0 && !a.file;
		const bIsDir = b.children.size > 0 && !b.file;
		if (aIsDir && !bIsDir) return -1;
		if (!aIsDir && bIsDir) return 1;
		return a.name.localeCompare(b.name);
	});

	return (
		<>
			<div
				className={`group flex h-[28px] items-center gap-1.5 cursor-pointer transition-colors border-l-2 ${
					active
						? "border-inferay-accent bg-inferay-accent/8"
						: "border-transparent hover:bg-inferay-text/[0.04]"
				}`}
				style={{ paddingLeft: `${6 + depth * 14}px`, paddingRight: 8 }}
				onClick={() => {
					if (isDir) {
						toggleDir(node.path);
					} else if (file) {
						onSelect(file);
					}
				}}
			>
				{isDir ? (
					<>
						<svg
							className={`w-2.5 h-2.5 text-inferay-text-3 transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`}
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<polyline points="9 18 15 12 9 6" />
						</svg>
						<svg
							className={`w-3.5 h-3.5 shrink-0 transition-colors ${isExpanded ? "text-inferay-accent/60" : "text-inferay-text-3/70"}`}
							viewBox="0 0 24 24"
							fill="currentColor"
						>
							<path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
						</svg>
						<span className="truncate text-[10px] font-medium text-inferay-text-2">
							{node.name}
						</span>
					</>
				) : file ? (
					<>
						<span className="w-2.5 shrink-0" />
						<FileStatusIcon status={file.status} />
						<span
							className={`flex-1 truncate text-[10px] font-mono transition-colors ${
								active
									? "text-inferay-text"
									: "text-inferay-text-2 group-hover:text-inferay-text"
							}`}
						>
							{node.name}
						</span>
						{onAction && (
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									onAction(file.path);
								}}
								className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 rounded-md border border-inferay-border/50 bg-inferay-surface px-1.5 py-0.5 text-[8px] text-inferay-text-3 hover:text-inferay-text-2 hover:border-inferay-border transition-all"
							>
								{actionLabel}
							</button>
						)}
					</>
				) : null}
			</div>
			{isDir &&
				isExpanded &&
				sortedChildren.map((child) => (
					<TreeNodeRow
						key={child.path}
						node={child}
						depth={depth + 1}
						selected={selected}
						onSelect={onSelect}
						onAction={onAction}
						actionLabel={actionLabel}
						expandedDirs={expandedDirs}
						toggleDir={toggleDir}
					/>
				))}
		</>
	);
}

function FileGroup({
	title,
	files,
	selected,
	onSelect,
	actionLabel,
	onAction,
	onActionAll,
	isCollapsible = true,
	viewMode = "path",
	minHeight,
	maxHeight,
}: {
	title: string;
	files: GitFileEntry[];
	color?: string;
	selected: SelectedFile | null;
	onSelect: (f: GitFileEntry) => void;
	actionLabel?: string;
	onAction?: (path: string) => void;
	onActionAll?: () => void;
	isCollapsible?: boolean;
	viewMode?: "path" | "tree";
	minHeight?: number;
	maxHeight?: number;
}) {
	const [isCollapsed, setIsCollapsed] = useState(false);
	const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => {
		const dirs = new Set<string>();
		for (const f of files) {
			const parts = f.path.split("/");
			let path = "";
			for (let i = 0; i < parts.length - 1; i++) {
				path = path ? `${path}/${parts[i]}` : parts[i]!;
				dirs.add(path);
			}
		}
		return dirs;
	});

	const toggleDir = useCallback((path: string) => {
		setExpandedDirs((prev) => {
			const next = new Set(prev);
			if (next.has(path)) {
				next.delete(path);
			} else {
				next.add(path);
			}
			return next;
		});
	}, []);

	const tree = useMemo(() => buildFileTree(files), [files]);

	if (!files.length) return null;
	return (
		<div
			className="flex flex-col"
			style={{
				minHeight: minHeight && !isCollapsed ? minHeight : undefined,
			}}
		>
			{/* Section header */}
			<div className="sticky top-0 z-10 flex h-8 shrink-0 items-center justify-between border-b border-inferay-border/40 bg-inferay-bg px-2.5">
				<button
					type="button"
					onClick={() => isCollapsible && setIsCollapsed(!isCollapsed)}
					className={`flex items-center gap-1.5 ${isCollapsible ? "cursor-pointer" : "cursor-default"}`}
				>
					{isCollapsible && (
						<svg
							className={`w-2.5 h-2.5 text-inferay-text-3 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<polyline points="9 18 15 12 9 6" />
						</svg>
					)}
					<span className="text-[9px] font-medium text-inferay-text-2">
						{title} Files
					</span>
					<span className="min-w-[16px] h-4 flex items-center justify-center rounded-full bg-inferay-text/[0.08] text-[8px] tabular-nums text-inferay-text-3 px-1">
						{files.length}
					</span>
				</button>
				{onActionAll && !isCollapsed && (
					<button
						type="button"
						onClick={onActionAll}
						className="flex items-center gap-1 rounded-md border border-inferay-border/50 bg-inferay-surface px-2 py-0.5 text-[8px] font-medium text-inferay-text-3 hover:text-inferay-text-2 hover:border-inferay-border hover:bg-inferay-surface-2 transition-colors"
					>
						{actionLabel} All
					</button>
				)}
			</div>
			{/* File rows */}
			{!isCollapsed && (
				<div
					className="flex-1 overflow-y-auto"
					style={{ maxHeight: maxHeight ?? undefined }}
				>
					{viewMode === "path" &&
						files.map((f) => {
							const active =
								selected?.path === f.path && selected?.staged === f.staged;
							const name = f.path.split("/").pop() || f.path;
							const dir = f.path.includes("/")
								? f.path.slice(0, f.path.lastIndexOf("/"))
								: "";
							return (
								<div
									key={`${f.staged ? "s" : "u"}-${f.path}`}
									className={`group flex items-center gap-1.5 px-2 py-1 border-l-2 transition-colors ${
										active
											? "border-inferay-accent bg-inferay-accent/8"
											: "border-transparent hover:bg-inferay-text/[0.04]"
									}`}
								>
									<FileStatusIcon status={f.status} />
									<button
										type="button"
										onClick={() => onSelect(f)}
										className="flex-1 min-w-0 flex flex-col text-left"
										title={f.path}
									>
										<span
											className={`truncate text-[10px] font-mono leading-tight transition-colors ${active ? "text-inferay-text" : "text-inferay-text-2 group-hover:text-inferay-text"}`}
										>
											{name}
										</span>
										{dir && (
											<span className="truncate text-[8px] leading-tight text-inferay-text-3/50">
												{dir}
											</span>
										)}
									</button>
									{onAction && (
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												onAction(f.path);
											}}
											className="shrink-0 opacity-0 group-hover:opacity-100 rounded px-1.5 py-0.5 text-[8px] text-inferay-text-3 hover:bg-inferay-text/10 hover:text-inferay-text transition-all"
											title={`${actionLabel} ${f.path}`}
										>
											{actionLabel}
										</button>
									)}
								</div>
							);
						})}
					{viewMode === "tree" && (
						<div>
							{[...tree.children.values()]
								.sort((a, b) => {
									const aIsDir = a.children.size > 0 && !a.file;
									const bIsDir = b.children.size > 0 && !b.file;
									if (aIsDir && !bIsDir) return -1;
									if (!aIsDir && bIsDir) return 1;
									return a.name.localeCompare(b.name);
								})
								.map((child) => (
									<TreeNodeRow
										key={child.path}
										node={child}
										depth={0}
										selected={selected}
										onSelect={onSelect}
										onAction={onAction}
										actionLabel={actionLabel}
										expandedDirs={expandedDirs}
										toggleDir={toggleDir}
									/>
								))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
