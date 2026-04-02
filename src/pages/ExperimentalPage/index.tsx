import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { ClaudeChatView } from "../../components/chat/ClaudeChatView.tsx";
import {
	IconGitBranch,
	IconLayoutGrid,
	IconLayoutRows,
} from "../../components/ui/Icons.tsx";
import { GitDiffView, type DiffViewMode } from "../Terminal/GitDiffView.tsx";
import { useAgentSessions } from "../../hooks/useAgentSessions.ts";
import { type DiffRequest, useGitDiff } from "../../hooks/useGitDiff.ts";
import {
	type GitFileEntry,
	type GitProjectStatus,
	useGitStatus,
} from "../../hooks/useGitStatus.ts";
import { getAgentDefinition, isChatAgentKind } from "../../lib/agents.ts";
import {
	type TerminalGroupModel,
	getStatusInfo,
	getThemeById,
	loadTerminalState,
} from "../../lib/terminal-utils.ts";
import { StatusIcon } from "../Terminal/StatusIcon.tsx";

interface StoredChatMessage {
	id: string;
	role: "user" | "assistant" | "tool" | "system" | "btw";
	content: string;
}

interface ExperimentalSession {
	groupId: string;
	groupName: string;
	paneId: string;
	paneTitle: string;
	agentKind: "claude" | "codex";
	cwd?: string;
	messageCount: number;
}

interface SelectedFile {
	path: string;
	staged: boolean;
}

const CHAT_STORAGE_KEY_PREFIX = "surgent-chat-";

const STATUS_TONE: Record<string, string> = {
	M: "bg-git-modified/15 text-git-modified border-git-modified/20",
	A: "bg-git-added/15 text-git-added border-git-added/20",
	D: "bg-git-deleted/15 text-git-deleted border-git-deleted/20",
	R: "bg-sky-400/15 text-sky-300 border-sky-400/20",
	U: "bg-orange-400/15 text-orange-300 border-orange-400/20",
	"?": "bg-surgent-text/[0.05] text-surgent-text-3 border-surgent-border",
};

function readStoredMessages(paneId: string): StoredChatMessage[] {
	try {
		const raw = localStorage.getItem(CHAT_STORAGE_KEY_PREFIX + paneId);
		return raw ? (JSON.parse(raw) as StoredChatMessage[]) : [];
	} catch {
		return [];
	}
}

function flattenSessions(groups: TerminalGroupModel[]): ExperimentalSession[] {
	return groups.flatMap((group) =>
		group.panes.flatMap((pane) => {
			if (!isChatAgentKind(pane.agentKind)) return [];
			return [
				{
					groupId: group.id,
					groupName: group.name,
					paneId: pane.id,
					paneTitle: pane.title,
					agentKind: pane.agentKind,
					cwd: pane.cwd,
					messageCount: 0,
				} satisfies ExperimentalSession,
			];
		})
	);
}

// Stable session identity — only rebuild when pane IDs actually change
let prevSessionKey = "";
let prevSessions: ExperimentalSession[] = [];
function stableSessions(next: ExperimentalSession[]): ExperimentalSession[] {
	const key = next.map((s) => s.paneId).join(",");
	if (key === prevSessionKey) return prevSessions;
	prevSessionKey = key;
	prevSessions = next;
	return next;
}

function getAllFiles(project: GitProjectStatus | null): GitFileEntry[] {
	if (!project) return [];
	const unstaged = project.files.filter((file) => !file.staged);
	const staged = project.files.filter((file) => file.staged);
	return [...unstaged, ...staged];
}

function basename(path?: string): string {
	if (!path) return "No directory";
	const parts = path.split("/");
	return parts[parts.length - 1] || path;
}

export function ExperimentalPage() {
	const [refreshTick, setRefreshTick] = useState(0);
	const [selectedPaneId, setSelectedPaneId] = useState<string | null>(null);
	const [selectedFiles, setSelectedFiles] = useState<
		Record<string, SelectedFile | null>
	>({});
	const [agentStatuses, setAgentStatuses] = useState<Map<string, string>>(
		new Map()
	);
	const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>("split");

	const terminalState = useMemo(() => loadTerminalState(), [refreshTick]);
	const sessions = useMemo(
		() => stableSessions(flattenSessions(terminalState?.groups ?? [])),
		[terminalState]
	);
	const { sessions: liveAgentSessions } = useAgentSessions();
	const trackedDirs = useMemo(
		() => [...new Set(sessions.map((session) => session.cwd).filter(Boolean))],
		[sessions]
	);
	const { projects, projectMap } = useGitStatus(trackedDirs);
	const theme = useMemo(
		() => getThemeById(terminalState?.themeId ?? "default"),
		[terminalState?.themeId]
	);
	const {
		diff,
		request,
		loading: diffLoading,
		loadDiff,
		clear: clearDiff,
	} = useGitDiff();

	useEffect(() => {
		const id = window.setInterval(
			() => setRefreshTick((value) => value + 1),
			5000
		);
		return () => window.clearInterval(id);
	}, []);

	useEffect(() => {
		setAgentStatuses((current) => {
			const next = new Map(current);
			for (const session of liveAgentSessions) {
				const existing = next.get(session.paneId);
				if (!existing || existing === "idle" || existing === "thinking") {
					next.set(session.paneId, session.isRunning ? "thinking" : "idle");
				}
			}
			return next;
		});
	}, [liveAgentSessions]);

	useEffect(() => {
		if (!sessions.length) {
			setSelectedPaneId(null);
			return;
		}
		setSelectedPaneId((current) =>
			current && sessions.some((session) => session.paneId === current)
				? current
				: sessions[0]!.paneId
		);
	}, [sessions]);

	const sessionIndex = useMemo(
		() => sessions.findIndex((session) => session.paneId === selectedPaneId),
		[sessions, selectedPaneId]
	);
	const selectedSession =
		sessionIndex >= 0
			? (sessions[sessionIndex] ?? null)
			: (sessions[0] ?? null);
	const selectedProject = selectedSession?.cwd
		? (projectMap.get(selectedSession.cwd) ?? null)
		: null;
	const files = useMemo(() => getAllFiles(selectedProject), [selectedProject]);
	const staged = selectedProject?.files.filter((file) => file.staged) ?? [];
	const modified =
		selectedProject?.files.filter(
			(file) => !file.staged && file.status !== "?"
		) ?? [];
	const untracked =
		selectedProject?.files.filter((file) => file.status === "?") ?? [];
	const selectedFile = selectedSession
		? (selectedFiles[selectedSession.paneId] ?? null)
		: null;

	const selectFile = useCallback(
		(paneId: string, req: DiffRequest) => {
			setSelectedFiles((current) => ({
				...current,
				[paneId]: { path: req.file, staged: req.staged },
			}));
			loadDiff(req);
		},
		[loadDiff]
	);

	const selectedFilesRef = useRef(selectedFiles);
	selectedFilesRef.current = selectedFiles;
	const requestRef = useRef(request);
	requestRef.current = request;

	useEffect(() => {
		if (!selectedSession?.cwd) {
			clearDiff();
			return;
		}
		if (!files.length) {
			clearDiff();
			setSelectedFiles((current) => ({
				...current,
				[selectedSession.paneId]: null,
			}));
			return;
		}

		const currentSelection =
			selectedFilesRef.current[selectedSession.paneId] ?? null;
		const matchingFile = currentSelection
			? files.find(
					(file) =>
						file.path === currentSelection.path &&
						file.staged === currentSelection.staged
				)
			: null;

		const target = matchingFile ?? files[0]!;
		if (
			!currentSelection ||
			currentSelection.path !== target.path ||
			currentSelection.staged !== target.staged
		) {
			setSelectedFiles((current) => ({
				...current,
				[selectedSession.paneId]: { path: target.path, staged: target.staged },
			}));
		}
		const req = requestRef.current;
		if (
			req?.cwd !== selectedSession.cwd ||
			req?.file !== target.path ||
			req?.staged !== target.staged
		) {
			loadDiff({
				cwd: selectedSession.cwd,
				file: target.path,
				staged: target.staged,
			});
		}
	}, [clearDiff, files, loadDiff, selectedSession]);

	const cycleSession = useCallback(
		(direction: -1 | 1) => {
			if (!sessions.length) return;
			const currentIndex = sessionIndex >= 0 ? sessionIndex : 0;
			const nextIndex =
				direction === 1
					? currentIndex >= sessions.length - 1
						? 0
						: currentIndex + 1
					: currentIndex <= 0
						? sessions.length - 1
						: currentIndex - 1;
			setSelectedPaneId(sessions[nextIndex]!.paneId);
		},
		[sessionIndex, sessions]
	);

	const cycleFile = useCallback(
		(direction: -1 | 1) => {
			if (!selectedSession?.cwd || files.length === 0) return;
			const currentIndex = selectedFile
				? files.findIndex(
						(file) =>
							file.path === selectedFile.path &&
							file.staged === selectedFile.staged
					)
				: -1;
			const nextIndex =
				direction === 1
					? currentIndex >= files.length - 1
						? 0
						: currentIndex + 1
					: currentIndex <= 0
						? files.length - 1
						: currentIndex - 1;
			const nextFile = files[nextIndex]!;
			selectFile(selectedSession.paneId, {
				cwd: selectedSession.cwd,
				file: nextFile.path,
				staged: nextFile.staged,
			});
		},
		[files, selectFile, selectedFile, selectedSession]
	);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const tag = (event.target as HTMLElement | null)?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				cycleSession(-1);
				return;
			}
			if (event.key === "ArrowRight") {
				event.preventDefault();
				cycleSession(1);
				return;
			}
			if (event.key === "ArrowDown") {
				event.preventDefault();
				cycleFile(1);
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				cycleFile(-1);
			}
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [cycleFile, cycleSession]);

	return (
		<div className="flex h-full min-h-0 flex-col bg-surgent-bg">
			<div className="flex min-h-12 shrink-0 items-center gap-2 border-b border-surgent-border bg-surgent-bg px-2">
				<div className="min-w-0 flex-1 overflow-x-auto">
					<AgentStrip
						sessions={sessions}
						agentStatuses={agentStatuses}
						selectedPaneId={selectedSession?.paneId ?? null}
						onSelectPane={setSelectedPaneId}
					/>
				</div>
				<div className="flex shrink-0 items-center rounded-lg border border-surgent-border bg-surgent-surface overflow-hidden h-7">
					<DiffModeButton
						active={diffViewMode === "split"}
						title="Split diff"
						onClick={() => setDiffViewMode("split")}
						icon={<IconLayoutGrid size={13} />}
					/>
					<DiffModeButton
						active={diffViewMode === "stacked"}
						title="Vertical diff"
						onClick={() => setDiffViewMode("stacked")}
						icon={<IconLayoutRows size={13} />}
					/>
					<DiffModeButton
						active={diffViewMode === "hunks"}
						title="Hunk view"
						onClick={() => setDiffViewMode("hunks")}
						icon={<IconGitBranch size={13} />}
					/>
				</div>
			</div>

			{!selectedSession ? (
				<div className="flex flex-1 items-center justify-center px-6">
					<div className="max-w-md border border-surgent-border bg-surgent-surface p-6 text-center">
						<h2 className="text-[15px] font-semibold text-surgent-text">
							No saved agent sessions
						</h2>
						<p className="mt-2 text-[12px] leading-5 text-surgent-text-3">
							Open Claude or Codex in the terminal page, pick a project
							directory, and it will appear here.
						</p>
					</div>
				</div>
			) : (
				<div className="grid min-h-0 flex-1 lg:grid-cols-[400px_minmax(0,1fr)]">
					<section className="min-h-0 min-w-0 border-r border-surgent-border">
						<ClaudeChatView
							paneId={selectedSession.paneId}
							cwd={selectedSession.cwd}
							agentKind={selectedSession.agentKind}
							theme={theme}
							onStatusChange={(paneId, status) => {
								setAgentStatuses((current) => {
									if (current.get(paneId) === status) return current;
									return new Map(current).set(paneId, status);
								});
							}}
						/>
					</section>

					<aside className="min-h-0 min-w-0 bg-surgent-bg">
						<div className="flex h-full min-h-0 flex-col">
							<div className="flex min-h-0 flex-1 overflow-hidden">
								<div className="min-h-0 min-w-0 flex-1 overflow-hidden">
									{diffLoading ? (
										<CenteredState label="Loading diff..." />
									) : diff && request ? (
										<GitDiffView
											diff={diff}
											filePath={request.file}
											staged={request.staged}
											loading={false}
											onClose={() => clearDiff()}
											hideHeader
											hideToolbar
											viewMode={diffViewMode}
											onViewModeChange={setDiffViewMode}
										/>
									) : (
										<CenteredState
											label={
												selectedProject
													? "Select a changed file"
													: "No diff available"
											}
										/>
									)}
								</div>
								<div className="flex w-52 shrink-0 flex-col border-l border-surgent-border bg-surgent-bg">
									<div className="flex-1 overflow-y-auto">
										<div className="sticky top-0 z-10 border-b border-surgent-border bg-surgent-bg px-2.5 py-2">
											<div className="truncate text-[11px] font-medium text-surgent-text">
												{selectedProject
													? selectedProject.branch
													: "No repo data"}
											</div>
										</div>
										<FileGroup
											title="Unstaged"
											files={[...modified, ...untracked]}
											color="text-surgent-text-2"
											selected={selectedFile}
											onSelect={(file) => {
												if (!selectedSession.cwd) return;
												selectFile(selectedSession.paneId, {
													cwd: selectedSession.cwd,
													file: file.path,
													staged: file.staged,
												});
											}}
										/>
										<FileGroup
											title="Staged"
											files={staged}
											color="text-git-added"
											selected={selectedFile}
											onSelect={(file) => {
												if (!selectedSession.cwd) return;
												selectFile(selectedSession.paneId, {
													cwd: selectedSession.cwd,
													file: file.path,
													staged: file.staged,
												});
											}}
										/>
										{selectedProject && selectedProject.files.length === 0 && (
											<div className="flex items-center justify-center py-6">
												<p className="text-[10px] text-surgent-text-3/50">
													Clean
												</p>
											</div>
										)}
										{!selectedProject && (
											<div className="flex items-center justify-center py-6">
												<p className="px-3 text-center text-[10px] text-surgent-text-3/50">
													No repository
												</p>
											</div>
										)}
									</div>
									{selectedProject && selectedProject.files.length > 0 && (
										<div className="flex items-center gap-2.5 border-t border-surgent-border px-2.5 py-1.5 text-[8px] tabular-nums text-surgent-text-3/60">
											{staged.length > 0 && (
												<span className="flex items-center gap-1">
													<span className="h-1 w-1 rounded-full bg-git-added" />
													{staged.length} staged
												</span>
											)}
											{modified.length > 0 && (
												<span className="flex items-center gap-1">
													<span className="h-1 w-1 rounded-full bg-git-modified" />
													{modified.length} modified
												</span>
											)}
											{untracked.length > 0 && (
												<span className="flex items-center gap-1">
													<span className="h-1 w-1 rounded-full bg-surgent-text-3/30" />
													{untracked.length}
												</span>
											)}
										</div>
									)}
								</div>
							</div>
						</div>
					</aside>
				</div>
			)}
		</div>
	);
}

function AgentStrip({
	sessions,
	agentStatuses,
	selectedPaneId,
	onSelectPane,
}: {
	sessions: ExperimentalSession[];
	agentStatuses: Map<string, string>;
	selectedPaneId: string | null;
	onSelectPane: (id: string) => void;
}) {
	return (
		<div className="flex items-center gap-1 overflow-x-auto py-1">
			{sessions.map((session) => {
				const isSelected = session.paneId === selectedPaneId;
				const info = getStatusInfo(agentStatuses.get(session.paneId) ?? "idle");
				return (
					<button
						key={session.paneId}
						type="button"
						onClick={() => onSelectPane(session.paneId)}
						className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 transition-colors ${
							isSelected
								? "bg-surgent-surface-2 text-surgent-text"
								: "text-surgent-text-3 hover:bg-surgent-surface hover:text-surgent-text-2"
						}`}
						title={`${basename(session.cwd)} - ${getAgentDefinition(session.agentKind).label}`}
					>
						<StatusIcon
							iconType={info.iconType}
							size={12}
							className={info.iconColor}
						/>
						<span className="max-w-[110px] truncate text-[10px] font-medium">
							{basename(session.cwd)}
						</span>
						{session.messageCount > 0 && (
							<span
								className={`rounded-md px-1.5 py-0.5 text-[9px] tabular-nums ${
									isSelected
										? "bg-surgent-text/10 text-surgent-text"
										: "bg-surgent-text/5 text-surgent-text-3"
								}`}
							>
								{session.messageCount}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}

function CenteredState({ label }: { label: string }) {
	return (
		<div className="flex h-full items-center justify-center px-6">
			<p className="max-w-xs text-center text-[12px] leading-5 text-surgent-text-3">
				{label}
			</p>
		</div>
	);
}

function FileGroup({
	title,
	files,
	color,
	selected,
	onSelect,
}: {
	title: string;
	files: GitFileEntry[];
	color: string;
	selected: SelectedFile | null;
	onSelect: (file: GitFileEntry) => void;
}) {
	if (files.length === 0) return null;
	return (
		<div>
			<div className="sticky top-0 z-10 flex h-6 items-center justify-between border-b border-surgent-border/30 bg-surgent-bg px-2.5">
				<span
					className={`text-[8px] font-medium uppercase tracking-[0.1em] ${color}`}
				>
					{title}
				</span>
				<span className="text-[8px] tabular-nums text-surgent-text-3/50">
					{files.length}
				</span>
			</div>
			{files.map((file) => {
				const active =
					selected?.path === file.path && selected?.staged === file.staged;
				const name = file.path.split("/").pop() || file.path;
				return (
					<button
						key={`${file.staged ? "s" : "u"}-${file.path}`}
						type="button"
						onClick={() => onSelect(file)}
						className={`flex h-[24px] w-full items-center border-l-[2px] px-2.5 text-left transition-colors ${
							active
								? "border-surgent-accent bg-surgent-accent/8"
								: "border-transparent hover:bg-surgent-text/[0.03]"
						}`}
						title={file.path}
					>
						<span
							className={`truncate text-[10.5px] font-mono ${
								active ? "text-surgent-text" : "text-surgent-text-2/80"
							}`}
						>
							{name}
						</span>
					</button>
				);
			})}
		</div>
	);
}

function DiffModeButton({
	active,
	title,
	icon,
	onClick,
}: {
	active: boolean;
	title: string;
	icon: ReactNode;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			title={title}
			className={`flex h-full w-7 items-center justify-center transition-all ${
				active
					? "bg-surgent-text/10 text-surgent-text"
					: "text-surgent-text-3 hover:text-surgent-text-2"
			}`}
		>
			{icon}
		</button>
	);
}
