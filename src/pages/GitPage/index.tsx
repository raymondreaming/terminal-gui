import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GroupTabs } from "../../components/ui/GroupTabs.tsx";
import { useGitDiff } from "../../hooks/useGitDiff.ts";
import { type GitFileEntry, useGitStatus } from "../../hooks/useGitStatus.ts";
import { fetchJson } from "../../lib/fetch-json.ts";
import { readStoredJson, writeStoredJson } from "../../lib/stored-json.ts";
import { GitDiffView } from "../Terminal/GitDiffView.tsx";
import { InlineDirectoryPicker } from "../Terminal/InlineDirectoryPicker.tsx";

function persist(dirs: string[]) {
	writeStoredJson("git-watched-dirs", dirs);
}

export function GitPage() {
	const [dirs, setDirs] = useState<string[]>(() =>
		readStoredJson<string[]>("git-watched-dirs", [])
	);
	const [activeCwd, setActiveCwd] = useState<string | null>(null);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [pickerError, setPickerError] = useState<string | null>(null);
	const { projects } = useGitStatus(dirs);
	const {
		diff,
		request: diffReq,
		loading: diffLoading,
		loadDiff,
		clear: clearDiff,
	} = useGitDiff();
	const project = useMemo(() => {
		if (activeCwd) {
			const found = projects.find((p) => p.cwd === activeCwd);
			if (found) return found;
		}
		return projects[0] || null;
	}, [projects, activeCwd]);
	const [selFile, setSelFile] = useState<{
		path: string;
		staged: boolean;
	} | null>(null);
	const prevCwd = useRef<string | null>(null);
	const hasAutoSelected = useRef(false);
	useEffect(() => {
		if (!project || project.files.length === 0) return;
		const cwdChanged = project.cwd !== prevCwd.current;
		if (cwdChanged) {
			hasAutoSelected.current = false;
			prevCwd.current = project.cwd;
		}
		if (hasAutoSelected.current) return;
		hasAutoSelected.current = true;
		const f = project.files[0]!;
		setSelFile({ path: f.path, staged: f.staged });
		loadDiff({ cwd: project.cwd, file: f.path, staged: f.staged });
	}, [project?.cwd, project?.files.length, loadDiff, project]);
	const allFiles = useMemo(() => {
		if (!project) return [];
		const unstaged = project.files.filter((f) => !f.staged);
		const staged = project.files.filter((f) => f.staged);
		return [...unstaged, ...staged];
	}, [project]);

	const selectFile = useCallback(
		(path: string, staged: boolean) => {
			if (!project) return;
			setSelFile({ path, staged });
			loadDiff({ cwd: project.cwd, file: path, staged });
		},
		[project?.cwd, loadDiff, project]
	);
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			const tag = (e.target as HTMLElement)?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
			if (!project || allFiles.length === 0) return;
			if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

			e.preventDefault();
			const currentIdx = selFile
				? allFiles.findIndex(
						(f) => f.path === selFile.path && f.staged === selFile.staged
					)
				: -1;

			let nextIdx: number;
			if (e.key === "ArrowDown") {
				nextIdx = currentIdx >= allFiles.length - 1 ? 0 : currentIdx + 1;
			} else {
				nextIdx = currentIdx <= 0 ? allFiles.length - 1 : currentIdx - 1;
			}

			const next = allFiles[nextIdx]!;
			setSelFile({ path: next.path, staged: next.staged });
			loadDiff({ cwd: project.cwd, file: next.path, staged: next.staged });
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [project?.cwd, allFiles, selFile, loadDiff, project]);

	const switchRepo = useCallback(
		(cwd: string) => {
			prevCwd.current = null;
			hasAutoSelected.current = false;
			setActiveCwd(cwd);
			setSelFile(null);
			clearDiff();
			setPickerOpen(false);
			setPickerError(null);
		},
		[clearDiff]
	);

	const addRepo = useCallback(
		async (dir: string) => {
			if (!dir || dirs.includes(dir)) return;
			setPickerError(null);
			try {
				await fetchJson(`/api/git/status?cwd=${encodeURIComponent(dir)}`);
			} catch {
				setPickerError("Not a git repository");
				return;
			}
			const next = [...dirs, dir];
			setDirs(next);
			persist(next);
			setPickerOpen(false);
			setPickerError(null);
			prevCwd.current = null;
			setActiveCwd(dir);
		},
		[dirs]
	);

	const removeRepo = useCallback(
		(cwd: string) => {
			const next = dirs.filter((d) => d !== cwd);
			setDirs(next);
			persist(next);
			if (activeCwd === cwd) {
				prevCwd.current = null;
				setActiveCwd(next[0] || null);
			}
			setSelFile(null);
			clearDiff();
		},
		[dirs, activeCwd, clearDiff]
	);

	const closePicker = useCallback(() => {
		setPickerOpen(false);
		setPickerError(null);
	}, []);

	const tabs = useMemo(
		() =>
			projects.map((p) => ({
				id: p.cwd,
				name: p.name,
				count: p.stagedCount + p.unstagedCount + p.untrackedCount || undefined,
			})),
		[projects]
	);

	const staged = project?.files.filter((f) => f.staged) || [];
	const modified =
		project?.files.filter((f) => !f.staged && f.status !== "?") || [];
	const untracked = project?.files.filter((f) => f.status === "?") || [];

	if (dirs.length === 0 && !pickerOpen) {
		return (
			<div className="flex h-full items-center justify-center bg-inferay-bg">
				<div className="text-center">
					<div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-inferay-surface border border-inferay-border">
						<svg
							aria-hidden="true"
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
							className="text-inferay-text-3"
						>
							<circle cx="18" cy="18" r="3" />
							<circle cx="6" cy="6" r="3" />
							<path d="M13 6h3a2 2 0 0 1 2 2v7" />
							<path d="M6 9v12" />
						</svg>
					</div>
					<p className="text-[12px] text-inferay-text mb-1">No repositories</p>
					<p className="text-[10px] text-inferay-text-3 mb-4">
						Add a local git repo to get started
					</p>
					<button
						type="button"
						onClick={() => setPickerOpen(true)}
						className="rounded-lg bg-inferay-surface border border-inferay-border px-3 py-1.5 text-[10px] text-inferay-text-2 hover:bg-inferay-surface-2 transition-colors"
					>
						Add Repository
					</button>
				</div>
			</div>
		);
	}

	if (dirs.length === 0 && pickerOpen) {
		return (
			<div className="flex h-full items-center justify-center bg-inferay-bg">
				<div>
					{pickerError && (
						<div className="mb-2 rounded-lg px-3 py-1.5 text-[10px] text-git-deleted bg-git-deleted/5 border border-git-deleted/20">
							{pickerError}
						</div>
					)}
					<InlineDirectoryPicker
						onSelect={(p) => (p ? void addRepo(p) : closePicker())}
						onCancel={closePicker}
					/>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col bg-inferay-bg">
			<div className="shrink-0 flex items-center gap-2 px-2 sm:gap-3 sm:px-3 h-12 border-b border-inferay-border bg-inferay-bg">
				<GroupTabs
					items={tabs}
					activeId={project?.cwd || null}
					onSelect={switchRepo}
					onDelete={removeRepo}
				/>
				<button
					type="button"
					onClick={() => setPickerOpen(true)}
					className="flex items-center justify-center h-7 w-7 rounded-lg border border-inferay-border bg-inferay-surface text-inferay-text-3 hover:bg-inferay-text/[0.06] hover:text-inferay-text-2 transition-colors"
					title="Add repository"
				>
					<svg
						aria-hidden="true"
						width="10"
						height="10"
						viewBox="0 0 12 12"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
					>
						<path d="M6 2v8M2 6h8" />
					</svg>
				</button>
				{project && (
					<>
						<div className="w-px h-4 bg-inferay-border/40" />
						<svg
							aria-hidden="true"
							width="11"
							height="11"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							className="text-inferay-text-3 shrink-0"
						>
							<circle cx="18" cy="18" r="3" />
							<circle cx="6" cy="6" r="3" />
							<path d="M13 6h3a2 2 0 0 1 2 2v7" />
							<path d="M6 9v12" />
						</svg>
						<span className="text-[10px] text-inferay-text-3">
							{project.branch}
						</span>
						{project.ahead > 0 && (
							<span className="text-[9px] text-git-added">
								+{project.ahead}
							</span>
						)}
						{project.behind > 0 && (
							<span className="text-[9px] text-git-deleted">
								-{project.behind}
							</span>
						)}
					</>
				)}
				<span className="flex-1" />
				{selFile && (
					<span
						className="text-[11px] font-mono text-inferay-text-3 truncate max-w-[400px]"
						title={selFile.path}
					>
						{selFile.path}
					</span>
				)}
			</div>

			<div className="flex flex-1 min-h-0 overflow-hidden">
				<div className="flex-1 flex flex-col min-w-0 overflow-hidden">
					{pickerOpen ? (
						<div className="flex h-full items-center justify-center">
							<div>
								{pickerError && (
									<div className="mb-2 rounded-lg px-3 py-1.5 text-[10px] text-git-deleted bg-git-deleted/5 border border-git-deleted/20">
										{pickerError}
									</div>
								)}
								<InlineDirectoryPicker
									onSelect={(p) => (p ? void addRepo(p) : closePicker())}
									onCancel={closePicker}
								/>
							</div>
						</div>
					) : diffLoading ? (
						<div className="flex h-full items-center justify-center">
							<div className="flex items-center gap-2">
								<div className="w-3 h-3 border border-inferay-text-3 border-t-transparent rounded-full animate-spin" />
								<span className="text-[11px] text-inferay-text-3">
									Loading...
								</span>
							</div>
						</div>
					) : diff && diffReq ? (
						<GitDiffView
							diff={diff}
							filePath={diffReq.file}
							staged={diffReq.staged}
							loading={false}
							onClose={() => {
								clearDiff();
								setSelFile(null);
							}}
						/>
					) : (
						<div className="flex h-full items-center justify-center">
							<p className="text-[11px] text-inferay-text-3/40">
								{project ? "Select a file to view changes" : "Add a repository"}
							</p>
						</div>
					)}
				</div>

				{project && (
					<div className="w-52 shrink-0 border-l border-inferay-border flex flex-col bg-inferay-bg">
						<div className="flex-1 overflow-y-auto">
							<FileGroup
								title="Unstaged"
								files={[...modified, ...untracked]}
								color="text-inferay-text-2"
								selFile={selFile}
								onSelect={(p) => selectFile(p, false)}
							/>
							<FileGroup
								title="Staged"
								files={staged}
								color="text-git-added"
								selFile={selFile}
								onSelect={(p) => selectFile(p, true)}
							/>
							{project.files.length === 0 && (
								<div className="flex items-center justify-center h-full">
									<p className="text-[10px] text-inferay-text-3/40">Clean</p>
								</div>
							)}
						</div>
						{project.files.length > 0 && (
							<div className="flex items-center gap-2.5 px-2.5 py-1.5 border-t border-inferay-border text-[8px] text-inferay-text-3/60 tabular-nums">
								{staged.length > 0 && (
									<span className="flex items-center gap-1">
										<span className="w-1 h-1 rounded-full bg-git-added" />
										{staged.length} staged
									</span>
								)}
								{modified.length > 0 && (
									<span className="flex items-center gap-1">
										<span className="w-1 h-1 rounded-full bg-git-modified" />
										{modified.length} modified
									</span>
								)}
								{untracked.length > 0 && (
									<span className="flex items-center gap-1">
										<span className="w-1 h-1 rounded-full bg-inferay-text-3/30" />
										{untracked.length}
									</span>
								)}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

function FileGroup({
	title,
	files,
	color,
	selFile,
	onSelect,
}: {
	title: string;
	files: GitFileEntry[];
	color: string;
	selFile: { path: string; staged: boolean } | null;
	onSelect: (path: string) => void;
}) {
	if (files.length === 0) return null;
	return (
		<div>
			<div className="sticky top-0 z-10 flex items-center justify-between px-2.5 h-6 border-b border-inferay-border/30 bg-inferay-bg">
				<span
					className={`text-[8px] font-medium uppercase tracking-[0.1em] ${color}`}
				>
					{title}
				</span>
				<span className="text-[8px] tabular-nums text-inferay-text-3/50">
					{files.length}
				</span>
			</div>
			{files.map((f) => {
				const name = f.path.split("/").pop() || f.path;
				const active = selFile?.path === f.path && selFile?.staged === f.staged;
				return (
					<button
						type="button"
						key={`${f.staged ? "s" : "u"}-${f.path}`}
						onClick={() => onSelect(f.path)}
						className={`w-full flex items-center px-2.5 h-[24px] text-left transition-colors ${
							active
								? "bg-inferay-accent/8 border-l-[2px] border-inferay-accent"
								: "border-l-[2px] border-transparent hover:bg-inferay-text/[0.03]"
						}`}
						title={f.path}
					>
						<span
							className={`truncate text-[10.5px] font-mono ${active ? "text-inferay-text" : "text-inferay-text-2/80"}`}
						>
							{name}
						</span>
					</button>
				);
			})}
		</div>
	);
}
