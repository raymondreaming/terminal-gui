import { memo, useState } from "react";
import type {
	GitFileEntry,
	GitProjectStatus,
} from "../../hooks/useGitStatus.ts";
import { CollapsibleSidebarSection } from "./CollapsibleSidebarSection.tsx";

interface GitSidebarProps {
	projects: GitProjectStatus[];
	expanded: boolean;
	onToggle: () => void;
	onFileClick: (cwd: string, file: string, staged: boolean) => void;
}

const STATUS_COLORS: Record<string, string> = {
	M: "text-yellow-400 bg-yellow-400/15",
	A: "text-green-400 bg-green-400/15",
	D: "text-red-400 bg-red-400/15",
	"?": "text-inferay-text-3 bg-inferay-text/5",
	R: "text-blue-400 bg-blue-400/15",
	C: "text-purple-400 bg-purple-400/15",
	U: "text-orange-400 bg-orange-400/15",
};

function StatusBadge({ status }: { status: string }) {
	const color =
		STATUS_COLORS[status] || "text-inferay-text-3 bg-inferay-text/5";
	return (
		<span
			className={`inline-flex items-center justify-center w-4 h-4 rounded text-[8px] font-bold ${color}`}
		>
			{status}
		</span>
	);
}

function FileRow({
	file,
	onClick,
}: {
	file: GitFileEntry;
	onClick: () => void;
}) {
	const filename = file.path.split("/").pop() || file.path;
	const dir = file.path.includes("/")
		? file.path.slice(0, file.path.lastIndexOf("/"))
		: "";

	return (
		<button
			type="button"
			onClick={onClick}
			className="w-full flex items-center gap-1.5 px-2 py-1 text-left transition-colors hover:bg-inferay-surface rounded-md group"
			title={file.path}
		>
			<StatusBadge status={file.status} />
			<span className="truncate text-[10px] text-inferay-text flex-1">
				{filename}
			</span>
			{dir && (
				<span className="text-[9px] text-inferay-text-3 truncate max-w-[80px]">
					{dir}
				</span>
			)}
		</button>
	);
}

function ProjectSection({
	project,
	onFileClick,
}: {
	project: GitProjectStatus;
	onFileClick: (cwd: string, file: string, staged: boolean) => void;
}) {
	const [expanded, setExpanded] = useState(false);
	const totalChanges =
		project.stagedCount + project.unstagedCount + project.untrackedCount;
	const stagedFiles = project.files.filter((f) => f.staged);
	const unstagedFiles = project.files.filter(
		(f) => !f.staged && f.status !== "?"
	);
	const untrackedFiles = project.files.filter((f) => f.status === "?");

	return (
		<div className="border-b border-inferay-border/50 last:border-b-0">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-inferay-surface/50"
			>
				<svg
					aria-hidden="true"
					width="8"
					height="8"
					viewBox="0 0 8 8"
					className={`shrink-0 text-inferay-text-3 transition-transform ${expanded ? "rotate-90" : ""}`}
					fill="currentColor"
				>
					<path d="M2 1l4 3-4 3z" />
				</svg>
				<span className="text-[11px] font-medium text-inferay-text truncate flex-1">
					{project.name}
				</span>
				<span className="text-[9px] font-medium text-inferay-accent bg-inferay-accent/10 px-1.5 py-0.5 rounded">
					{project.branch}
				</span>
				{totalChanges > 0 && (
					<span className="text-[9px] font-semibold text-inferay-text-3 tabular-nums">
						{totalChanges}
					</span>
				)}
			</button>

			{expanded && (
				<div className="pb-1">
					{stagedFiles.length > 0 && (
						<div className="px-1">
							<div className="px-2 py-0.5 text-[9px] font-semibold text-green-400/70 uppercase tracking-wider">
								Staged ({stagedFiles.length})
							</div>
							{stagedFiles.map((file) => (
								<FileRow
									key={`s-${file.path}`}
									file={file}
									onClick={() => onFileClick(project.cwd, file.path, true)}
								/>
							))}
						</div>
					)}

					{unstagedFiles.length > 0 && (
						<div className="px-1">
							<div className="px-2 py-0.5 text-[9px] font-semibold text-yellow-400/70 uppercase tracking-wider">
								Modified ({unstagedFiles.length})
							</div>
							{unstagedFiles.map((file) => (
								<FileRow
									key={`u-${file.path}`}
									file={file}
									onClick={() => onFileClick(project.cwd, file.path, false)}
								/>
							))}
						</div>
					)}

					{untrackedFiles.length > 0 && (
						<div className="px-1">
							<div className="px-2 py-0.5 text-[9px] font-semibold text-inferay-text-3/70 uppercase tracking-wider">
								Untracked ({untrackedFiles.length})
							</div>
							{untrackedFiles.map((file) => (
								<FileRow
									key={`?-${file.path}`}
									file={file}
									onClick={() => onFileClick(project.cwd, file.path, false)}
								/>
							))}
						</div>
					)}

					{totalChanges === 0 && (
						<p className="px-3 py-2 text-[10px] text-inferay-text-3">
							Clean working tree
						</p>
					)}
				</div>
			)}
		</div>
	);
}

export const GitSidebar = memo(function GitSidebar({
	projects,
	expanded,
	onToggle,
	onFileClick,
}: GitSidebarProps) {
	const totalChanges = projects.reduce(
		(sum, p) => sum + p.stagedCount + p.unstagedCount + p.untrackedCount,
		0
	);

	return (
		<CollapsibleSidebarSection
			icon={
				<svg
					aria-hidden="true"
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<circle cx="18" cy="18" r="3" />
					<circle cx="6" cy="6" r="3" />
					<path d="M13 6h3a2 2 0 0 1 2 2v7" />
					<path d="M6 9v12" />
				</svg>
			}
			label="Git"
			count={totalChanges}
			countColor={totalChanges > 0 ? "text-yellow-400" : "text-inferay-text-3"}
			expanded={expanded}
			onToggle={onToggle}
			emptyMessage="No git repositories detected"
		>
			{projects.map((project) => (
				<ProjectSection
					key={project.cwd}
					project={project}
					onFileClick={onFileClick}
				/>
			))}
		</CollapsibleSidebarSection>
	);
});
