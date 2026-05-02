import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	type AgentChatHandle,
	AgentChatView,
} from "../../components/chat/AgentChatView.tsx";
import type {
	AttachedImageInfo,
	QueuedMessageInfo,
} from "../../components/chat/agent-chat-shared.ts";
import type { ToolActivity } from "../../components/chat/chat-agent-utils.ts";
import { clearAgentChatMessages } from "../../components/chat/chat-session-store.ts";
import {
	ChangeFileSidebar,
	type SelectedFile,
} from "../../components/git/ChangeFileSidebar.tsx";
import { CommitGraph } from "../../components/git/CommitGraph.tsx";
import {
	IconCheck,
	IconEye,
	IconFilePlus,
	IconGitBranch,
	IconLayoutGrid,
	IconLayoutRows,
	IconPencil,
	IconPlus,
	IconSend,
	IconSettings,
	IconStop,
	IconTrash,
	IconUsers,
	IconWrench,
	IconX,
} from "../../components/ui/Icons.tsx";
import { useActivityFeed } from "../../features/activity-feed/useActivityFeed.ts";
import { useFileWatcher } from "../../features/file-watcher/useFileWatcher.ts";
import { useAgentSessions } from "../../hooks/useAgentSessions.ts";
import { type DiffRequest, useGitDiff } from "../../hooks/useGitDiff.ts";
import { useCommitDetails, useGitGraph } from "../../hooks/useGitGraph.ts";
import {
	type GitFileEntry,
	type GitProjectStatus,
	useGitStatus,
} from "../../hooks/useGitStatus.ts";
import { getAgentIcon } from "../../lib/agent-ui.tsx";
import { isChatAgentKind } from "../../lib/agents.ts";
import {
	loadAppThemeId,
	mapAppThemeToTerminalTheme,
} from "../../lib/app-theme.ts";
import { readStoredValue, writeStoredValue } from "../../lib/stored-json.ts";
import {
	loadTerminalState,
	type TerminalGroupModel,
} from "../../lib/terminal-utils.ts";
import { wsClient } from "../../lib/websocket.ts";
import { type DiffViewMode, GitDiffView } from "../Terminal/GitDiffView.tsx";
import { TerminalSettingsPanel } from "../Terminal/TerminalSettingsPanel.tsx";

interface Session {
	groupId: string;
	groupName: string;
	paneId: string;
	paneTitle: string;
	agentKind: "claude" | "codex";
	cwd?: string;
	referencePaths?: string[];
	pendingCwd?: boolean;
	messageCount: number;
}

let cachedKey = "";
let cachedSessions: Session[] = [];

function flattenSessions(groups: TerminalGroupModel[]): Session[] {
	return groups.flatMap((g) =>
		g.panes.flatMap((p) =>
			isChatAgentKind(p.agentKind)
				? [
						{
							groupId: g.id,
							groupName: g.name,
							paneId: p.id,
							paneTitle: p.title,
							agentKind: p.agentKind,
							cwd: p.cwd,
							referencePaths: p.referencePaths,
							pendingCwd: p.pendingCwd,
							messageCount: 0,
						},
					]
				: []
		)
	);
}

function stableSessions(next: Session[]): Session[] {
	const key = next.map((s) => s.paneId).join(",");
	if (key === cachedKey) return cachedSessions;
	cachedKey = key;
	cachedSessions = next;
	return next;
}

function getAllFiles(project: GitProjectStatus | null): GitFileEntry[] {
	if (!project) return [];
	return [
		...project.files.filter((f) => !f.staged),
		...project.files.filter((f) => f.staged),
	];
}

function loadZenMode() {
	return readStoredValue("terminal-editor-zen") === "true";
}

export function EditorPage() {
	const [, setTick] = useState(0);
	const [selectedPaneId, setSelectedPaneId] = useState<string | null>(
		() => readStoredValue("editor-selected-pane") ?? null
	);
	const [selectedFiles, setSelectedFiles] = useState<
		Record<string, SelectedFile | null>
	>({});
	const [, setAgentStatuses] = useState<Map<string, string>>(new Map());
	const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>("split");
	const [closedPaneIds, setClosedPaneIds] = useState<Set<string>>(new Set());
	const [commitMessage, setCommitMessage] = useState("");
	const [isCommitting, setIsCommitting] = useState(false);
	const [amendMode, setAmendMode] = useState(false);
	const [scrollToChange, setScrollToChange] = useState(0);
	const [zenMode, setZenMode] = useState(loadZenMode);
	const [sidebarWidth, setSidebarWidth] = useState(224); // Default w-56 = 224px
	const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(
		null
	);
	const [fileViewMode, setFileViewMode] = useState<"path" | "tree">("tree");
	const [mainViewMode, setMainViewMode] = useState<"diff" | "graph">("diff");
	const [showSettings, setShowSettings] = useState(false);
	const chatRef = useRef<AgentChatHandle>(null);
	const sidebarDragRef = useRef<{
		startX: number;
		startWidth: number;
	} | null>(null);

	const [sessionVersion, setSessionVersion] = useState(0);
	const terminalState = useMemo(() => loadTerminalState(), [sessionVersion]);
	const themeId =
		terminalState?.themeId ?? mapAppThemeToTerminalTheme(loadAppThemeId());
	const allSessions = useMemo(
		() => stableSessions(flattenSessions(terminalState?.groups ?? [])),
		[terminalState]
	);
	const sessions = useMemo(
		() =>
			allSessions.filter((s) => !closedPaneIds.has(s.paneId) && !s.pendingCwd),
		[allSessions, closedPaneIds]
	);
	const { sessions: liveAgentSessions } = useAgentSessions();
	const trackedDirs = useMemo(
		() => [
			...new Set(
				sessions.map((s) => s.cwd).filter((cwd): cwd is string => Boolean(cwd))
			),
		],
		[sessions]
	);
	const { projectMap } = useGitStatus(trackedDirs);
	const {
		diff,
		request,
		loading: diffLoading,
		loadDiff,
		clear: clearDiff,
	} = useGitDiff();

	const refresh = useCallback(() => setTick((v) => v + 1), []);
	useEffect(() => {
		wsClient.connect();
	}, []);

	useEffect(() => {
		const id = setInterval(refresh, 5000);
		return () => clearInterval(id);
	}, [refresh]);

	useEffect(() => {
		setAgentStatuses((cur) => {
			const next = new Map(cur);
			for (const s of liveAgentSessions) {
				const existing = next.get(s.paneId);
				if (!existing || existing === "idle" || existing === "thinking") {
					next.set(s.paneId, s.isRunning ? "thinking" : "idle");
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
		setSelectedPaneId((cur) =>
			cur && sessions.some((s) => s.paneId === cur)
				? cur
				: (sessions[0]?.paneId ?? null)
		);
	}, [sessions]);

	useEffect(() => {
		if (selectedPaneId) {
			writeStoredValue("editor-selected-pane", selectedPaneId);
		} else {
			try {
				localStorage.removeItem("editor-selected-pane");
			} catch {}
		}
	}, [selectedPaneId]);

	const sessionIdx = useMemo(
		() => sessions.findIndex((s) => s.paneId === selectedPaneId),
		[sessions, selectedPaneId]
	);
	const session =
		sessionIdx >= 0 ? sessions[sessionIdx] : (sessions[0] ?? null);
	const project = session?.cwd ? (projectMap.get(session.cwd) ?? null) : null;
	const files = useMemo(() => getAllFiles(project), [project]);
	const staged = project?.files.filter((f) => f.staged) ?? [];
	const modified =
		project?.files.filter((f) => !f.staged && f.status !== "?") ?? [];
	const untracked = project?.files.filter((f) => f.status === "?") ?? [];
	const selectedFile = session ? (selectedFiles[session.paneId] ?? null) : null;
	const {
		commits: graphCommits,
		rows: graphRows,
		loading: graphLoading,
	} = useGitGraph(mainViewMode === "graph" ? session?.cwd : undefined, 100);
	const { details: commitDetails, loading: commitDetailsLoading } =
		useCommitDetails(
			mainViewMode === "graph" ? session?.cwd : undefined,
			selectedCommitHash ?? undefined
		);

	const selectFile = useCallback(
		(paneId: string, req: DiffRequest) => {
			setSelectedFiles((cur) => ({
				...cur,
				[paneId]: { path: req.file, staged: req.staged },
			}));
			loadDiff(req);
		},
		[loadDiff]
	);

	useActivityFeed({
		paneId: session?.paneId,
		cwd: session?.cwd,
	});

	const { checkPendingScroll } = useFileWatcher({
		enabled: zenMode,
		cwd: session?.cwd,
		paneId: session?.paneId,
		currentFile: request?.file,
		loadDiff,
		setSelectedFile: useCallback(
			(path: string, staged: boolean) => {
				if (!session?.paneId) return;
				setSelectedFiles((cur) => ({
					...cur,
					[session.paneId]: { path, staged },
				}));
			},
			[session?.paneId]
		),
		onDiffLoaded: useCallback(() => {
			refresh();
			setTimeout(() => setScrollToChange((v) => v + 1), 50);
		}, [refresh]),
	});

	const updateZenMode = useCallback((next: boolean) => {
		setZenMode(next);
		writeStoredValue("terminal-editor-zen", next ? "true" : "false");
		window.dispatchEvent(new Event("terminal-shell-change"));
	}, []);

	useEffect(() => {
		const syncEditorShellState = () => {
			setZenMode(loadZenMode());
			setSessionVersion((v) => v + 1);
		};
		window.addEventListener("terminal-shell-change", syncEditorShellState);
		return () =>
			window.removeEventListener("terminal-shell-change", syncEditorShellState);
	}, []);

	useEffect(() => {
		const handleSettingsOpen = () => setShowSettings(true);
		window.addEventListener("terminal-open-theme-panel", handleSettingsOpen);
		return () =>
			window.removeEventListener(
				"terminal-open-theme-panel",
				handleSettingsOpen
			);
	}, []);

	useEffect(() => {
		if (diff && !diffLoading) checkPendingScroll();
	}, [diff, diffLoading, checkPendingScroll]);

	const selectedFilesRef = useRef(selectedFiles);
	selectedFilesRef.current = selectedFiles;
	const requestRef = useRef(request);
	requestRef.current = request;

	useEffect(() => {
		if (!session?.cwd) {
			clearDiff();
			return;
		}
		if (!files.length) {
			clearDiff();
			setSelectedFiles((cur) => ({ ...cur, [session.paneId]: null }));
			return;
		}

		const cur = selectedFilesRef.current[session.paneId] ?? null;
		const match = cur
			? files.find((f) => f.path === cur.path && f.staged === cur.staged)
			: null;
		const target = match ?? files[0]!;

		if (!cur || cur.path !== target.path || cur.staged !== target.staged) {
			setSelectedFiles((c) => ({
				...c,
				[session.paneId]: { path: target.path, staged: target.staged },
			}));
		}

		const req = requestRef.current;
		if (
			req?.cwd !== session.cwd ||
			req?.file !== target.path ||
			req?.staged !== target.staged
		) {
			loadDiff({ cwd: session.cwd, file: target.path, staged: target.staged });
		}
	}, [clearDiff, files, loadDiff, session]);

	const cycleSession = useCallback(
		(dir: -1 | 1) => {
			if (!sessions.length) return;
			const idx = sessionIdx >= 0 ? sessionIdx : 0;
			const next =
				dir === 1
					? idx >= sessions.length - 1
						? 0
						: idx + 1
					: idx <= 0
						? sessions.length - 1
						: idx - 1;
			setSelectedPaneId(sessions[next]?.paneId ?? null);
		},
		[sessionIdx, sessions]
	);

	const cycleFile = useCallback(
		(dir: -1 | 1) => {
			if (!session?.cwd || !files.length) return;
			const idx = selectedFile
				? files.findIndex(
						(f) =>
							f.path === selectedFile.path && f.staged === selectedFile.staged
					)
				: -1;
			const next =
				dir === 1
					? idx >= files.length - 1
						? 0
						: idx + 1
					: idx <= 0
						? files.length - 1
						: idx - 1;
			const f = files[next]!;
			selectFile(session.paneId, {
				cwd: session.cwd,
				file: f.path,
				staged: f.staged,
			});
		},
		[files, selectFile, selectedFile, session]
	);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement;
			const isEditable =
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable;
			if (isEditable) return;

			if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
				e.preventDefault();
				cycleSession(e.key === "ArrowLeft" ? -1 : 1);
				setTimeout(() => chatRef.current?.focusInput(true), 50);
			} else if (e.key === "ArrowDown") {
				e.preventDefault();
				cycleFile(1);
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				cycleFile(-1);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [cycleFile, cycleSession]);

	const closePane = useCallback(
		(paneId: string) => {
			clearAgentChatMessages(paneId);
			setClosedPaneIds((prev) => new Set(prev).add(paneId));
			if (selectedPaneId === paneId) {
				const rest = sessions.filter((s) => s.paneId !== paneId);
				setSelectedPaneId(rest[0]?.paneId ?? null);
			}
		},
		[selectedPaneId, sessions]
	);

	const gitAction = useCallback(
		async (endpoint: string, body: object) => {
			await fetch(`/api/git/${endpoint}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			refresh();
		},
		[refresh]
	);

	const stageFile = useCallback(
		(file: string) =>
			session?.cwd && gitAction("stage", { cwd: session.cwd, file }),
		[session?.cwd, gitAction]
	);
	const unstageFile = useCallback(
		(file: string) =>
			session?.cwd && gitAction("unstage", { cwd: session.cwd, file }),
		[session?.cwd, gitAction]
	);
	const stageAll = useCallback(
		() => session?.cwd && gitAction("stage", { cwd: session.cwd }),
		[session?.cwd, gitAction]
	);
	const unstageAll = useCallback(
		() => session?.cwd && gitAction("unstage", { cwd: session.cwd }),
		[session?.cwd, gitAction]
	);

	const handleCommit = useCallback(async () => {
		if (!session?.cwd || !commitMessage.trim() || isCommitting) return;
		setIsCommitting(true);
		try {
			const res = await fetch("/api/git/commit", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ cwd: session.cwd, message: commitMessage }),
			});
			const result = await res.json();
			if (result.success) {
				setCommitMessage("");
				refresh();
			}
		} finally {
			setIsCommitting(false);
		}
	}, [session?.cwd, commitMessage, isCommitting, refresh]);

	const handleSidebarDragStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			sidebarDragRef.current = {
				startX: e.clientX,
				startWidth: sidebarWidth,
			};

			const handleMouseMove = (e: MouseEvent) => {
				if (!sidebarDragRef.current) return;
				const delta = sidebarDragRef.current.startX - e.clientX;
				const newWidth = Math.min(
					400,
					Math.max(160, sidebarDragRef.current.startWidth + delta)
				);
				setSidebarWidth(newWidth);
			};

			const handleMouseUp = () => {
				sidebarDragRef.current = null;
				document.removeEventListener("mousemove", handleMouseMove);
				document.removeEventListener("mouseup", handleMouseUp);
			};

			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
		},
		[sidebarWidth]
	);

	return (
		<div className="flex h-full min-h-0 flex-col bg-inferay-black">
			{!session ? (
				<div className="grid min-h-0 flex-1 lg:grid-cols-[400px_minmax(0,1fr)]">
					<section className="flex min-h-0 min-w-0 flex-col border-r border-inferay-gray-border">
						<div className={TOPBAR_CLASS}>
							<span className="text-[10px] font-medium text-inferay-muted-gray">
								No active session
							</span>
							<span className="flex-1" />
							<button
								type="button"
								onClick={() => setShowSettings(true)}
								className="flex items-center justify-center h-4 w-4 rounded transition-colors text-inferay-muted-gray hover:text-inferay-soft-white"
								title="Settings"
							>
								<IconSettings size={10} />
							</button>
						</div>
						<EmptyState />
					</section>
					<aside className="min-h-0 min-w-0 bg-inferay-black flex flex-col">
						<div className="flex min-h-0 flex-1 overflow-hidden">
							<div className="min-h-0 min-w-0 flex-1 flex flex-col overflow-hidden">
								<Placeholder label="No diff available" />
							</div>
							<div
								className="flex shrink-0 flex-row border-l border-inferay-gray-border bg-inferay-black"
								style={{ width: sidebarWidth }}
							>
								<div
									className="w-1 cursor-ew-resize bg-transparent hover:bg-inferay-accent/30 transition-colors shrink-0"
									onMouseDown={handleSidebarDragStart}
								/>
								<ChangeFileSidebar
									cwd={undefined}
									fileViewMode={fileViewMode}
									onFileViewModeChange={setFileViewMode}
									mainViewMode="diff"
									modified={[]}
									untracked={[]}
									staged={[]}
									selectedFile={null}
									onSelectFile={() => {}}
									onStageFile={() => {}}
									onUnstageFile={() => {}}
									onStageAll={() => {}}
									onUnstageAll={() => {}}
									hasProject={false}
									selectedCommitHash={null}
									commitDetailsLoading={false}
									commitDetails={null}
									files={[]}
									branch={undefined}
									commitMessage=""
									onCommitMessageChange={setCommitMessage}
									onCommit={() => {}}
									isCommitting={false}
									amendMode={false}
									onAmendModeChange={setAmendMode}
								/>
							</div>
						</div>
					</aside>
				</div>
			) : zenMode ? (
				/* ===== ZEN MODE LAYOUT ===== */
				<div className="relative flex min-h-0 flex-1">
					<div className="hidden">
						<AgentChatView
							key={session.paneId}
							ref={chatRef}
							paneId={session.paneId}
							cwd={session.cwd}
							referencePaths={session.referencePaths}
							agentKind={session.agentKind}
							onStatusChange={(id, status) => {
								setAgentStatuses((cur) => {
									if (cur.get(id) === status) return cur;
									return new Map(cur).set(id, status);
								});
							}}
						/>
					</div>

					<div className="flex-1 min-h-0 min-w-0 overflow-hidden">
						{mainViewMode === "diff" ? (
							diffLoading ? (
								<Placeholder label="Loading diff..." />
							) : diff && request ? (
								<GitDiffView
									diff={diff}
									filePath={request.file}
									staged={request.staged}
									scrollToChange={scrollToChange}
									loading={false}
									onClose={clearDiff}
									hideHeader
									hideToolbar
									viewMode={diffViewMode}
									onViewModeChange={setDiffViewMode}
								/>
							) : (
								<Placeholder
									label={
										project ? "Select a changed file" : "No diff available"
									}
								/>
							)
						) : graphLoading ? (
							<div className="flex items-center justify-center h-full">
								<p className="text-[11px] text-inferay-muted-gray">
									Loading graph...
								</p>
							</div>
						) : (
							<CommitGraph
								commits={graphCommits}
								rows={graphRows}
								selectedHash={selectedCommitHash ?? undefined}
								onSelect={setSelectedCommitHash}
								className="h-full"
								wipFiles={files}
								branch={project?.branch}
							/>
						)}
					</div>

					<div
						className="flex shrink-0 flex-row border-l border-inferay-gray-border bg-inferay-black"
						style={{ width: sidebarWidth }}
					>
						<div
							className="w-1 cursor-ew-resize bg-transparent hover:bg-inferay-accent/30 transition-colors shrink-0"
							onMouseDown={handleSidebarDragStart}
						/>
						<ChangeFileSidebar
							cwd={session?.cwd}
							fileViewMode={fileViewMode}
							onFileViewModeChange={setFileViewMode}
							mainViewMode="diff"
							modified={modified}
							untracked={untracked}
							staged={staged}
							selectedFile={selectedFile}
							onSelectFile={(f) =>
								session.cwd &&
								selectFile(session.paneId, {
									cwd: session.cwd,
									file: f.path,
									staged: f.staged,
								})
							}
							onStageFile={stageFile}
							onUnstageFile={unstageFile}
							onStageAll={stageAll}
							onUnstageAll={unstageAll}
							hasProject={!!project}
							selectedCommitHash={null}
							commitDetailsLoading={false}
							commitDetails={null}
							files={files}
							branch={project?.branch}
							commitMessage={commitMessage}
							onCommitMessageChange={setCommitMessage}
							onCommit={handleCommit}
							isCommitting={isCommitting}
							amendMode={amendMode}
							onAmendModeChange={setAmendMode}
						/>
					</div>

					<ZenModeInput
						chatRef={chatRef}
						agentKind={session.agentKind}
						onExitZen={() => updateZenMode(false)}
					/>
				</div>
			) : (
				/* ===== NORMAL MODE LAYOUT ===== */
				<div className="grid min-h-0 flex-1 lg:grid-cols-[400px_minmax(0,1fr)]">
					<section className="flex min-h-0 min-w-0 flex-col border-r border-inferay-gray-border">
						<AgentChatView
							key={session.paneId}
							ref={chatRef}
							paneId={session.paneId}
							cwd={session.cwd}
							referencePaths={session.referencePaths}
							agentKind={session.agentKind}
							onStatusChange={(id, status) => {
								setAgentStatuses((cur) => {
									if (cur.get(id) === status) return cur;
									return new Map(cur).set(id, status);
								});
							}}
							onClose={closePane}
							sessions={sessions}
							onSelectSession={setSelectedPaneId}
						/>
					</section>

					<aside className="min-h-0 min-w-0 bg-inferay-black flex flex-col">
						<div className="flex min-h-0 flex-1 overflow-hidden">
							<div className="min-h-0 min-w-0 flex-1 flex flex-col overflow-hidden">
								<DiffViewerTopBar
									mainViewMode={mainViewMode}
									diffViewMode={diffViewMode}
									filePath={request?.file}
									onMainViewModeChange={setMainViewMode}
									onDiffViewModeChange={setDiffViewMode}
								/>
								<div className="min-h-0 flex-1 overflow-hidden">
									{mainViewMode === "diff" ? (
										diffLoading ? (
											<Placeholder label="Loading diff..." />
										) : diff && request ? (
											<GitDiffView
												diff={diff}
												filePath={request.file}
												staged={request.staged}
												scrollToChange={scrollToChange}
												loading={false}
												onClose={clearDiff}
												hideHeader
												hideToolbar
												viewMode={diffViewMode}
												onViewModeChange={setDiffViewMode}
											/>
										) : (
											<Placeholder
												label={
													project
														? "Select a changed file"
														: "No diff available"
												}
											/>
										)
									) : // Graph View - full width, details show in sidebar
									graphLoading ? (
										<div className="flex items-center justify-center h-full">
											<p className="text-[11px] text-inferay-muted-gray">
												Loading graph...
											</p>
										</div>
									) : (
										<CommitGraph
											commits={graphCommits}
											rows={graphRows}
											selectedHash={selectedCommitHash ?? undefined}
											onSelect={setSelectedCommitHash}
											className="h-full"
											wipFiles={files}
											branch={project?.branch}
										/>
									)}
								</div>
							</div>

							<div
								className="flex shrink-0 flex-row border-l border-inferay-gray-border bg-inferay-black"
								style={{ width: sidebarWidth }}
							>
								<div
									className="w-1 cursor-ew-resize bg-transparent hover:bg-inferay-accent/30 transition-colors shrink-0"
									onMouseDown={handleSidebarDragStart}
								/>
								<ChangeFileSidebar
									cwd={session?.cwd}
									fileViewMode={fileViewMode}
									onFileViewModeChange={setFileViewMode}
									mainViewMode={mainViewMode}
									modified={modified}
									untracked={untracked}
									staged={staged}
									selectedFile={selectedFile}
									onSelectFile={(f) =>
										session.cwd &&
										selectFile(session.paneId, {
											cwd: session.cwd,
											file: f.path,
											staged: f.staged,
										})
									}
									onStageFile={stageFile}
									onUnstageFile={unstageFile}
									onStageAll={stageAll}
									onUnstageAll={unstageAll}
									hasProject={!!project}
									selectedCommitHash={selectedCommitHash}
									commitDetailsLoading={commitDetailsLoading}
									commitDetails={commitDetails}
									files={files}
									branch={project?.branch}
									commitMessage={commitMessage}
									onCommitMessageChange={setCommitMessage}
									onCommit={handleCommit}
									isCommitting={isCommitting}
									amendMode={amendMode}
									onAmendModeChange={setAmendMode}
								/>
							</div>
						</div>
					</aside>
				</div>
			)}
			{showSettings && (
				<TerminalSettingsPanel
					themeId={themeId}
					onThemeChange={() => setSessionVersion((v) => v + 1)}
					onClose={() => setShowSettings(false)}
				/>
			)}
		</div>
	);
}

function EmptyState() {
	return (
		<div className="flex flex-1 items-center justify-center px-6">
			<div className="max-w-md border border-inferay-gray-border bg-inferay-dark-gray p-6 text-center">
				<h2 className="text-[15px] font-semibold text-inferay-white">
					No saved agent sessions
				</h2>
				<p className="mt-2 text-[12px] leading-5 text-inferay-muted-gray">
					Open Claude or Codex in the terminal page, pick a project directory,
					and it will appear here.
				</p>
			</div>
		</div>
	);
}

function Placeholder({ label }: { label: string }) {
	return (
		<div className="flex h-full items-center justify-center px-6">
			<p className="max-w-xs text-center text-[12px] leading-5 text-inferay-muted-gray">
				{label}
			</p>
		</div>
	);
}

function getZenToolIcon(toolName: string, isAnimated = false): React.ReactNode {
	const baseClass = "w-3 h-3 shrink-0";
	const animateClass = isAnimated ? "animate-pulse" : "";
	const tool = toolName.toLowerCase();

	if (tool === "read") {
		return <IconEye className={`${baseClass} ${animateClass}`} />;
	}
	if (tool === "edit" || tool === "patch") {
		return <IconPencil className={`${baseClass} ${animateClass}`} />;
	}
	if (tool === "write") {
		return <IconFilePlus className={`${baseClass} ${animateClass}`} />;
	}
	if (tool === "bash" || tool === "exec") {
		return <IconWrench className={`${baseClass} ${animateClass}`} />;
	}
	if (tool === "grep" || tool === "glob") {
		return <IconWrench className={`${baseClass} ${animateClass}`} />;
	}
	if (tool === "task") {
		return <IconUsers className={`${baseClass} ${animateClass}`} />;
	}
	return <IconWrench className={`${baseClass} ${animateClass}`} />;
}
function ZenModeInput({
	chatRef,
	agentKind,
	onExitZen,
}: {
	chatRef: React.RefObject<AgentChatHandle | null>;
	agentKind: "claude" | "codex";
	onExitZen: () => void;
}) {
	const [input, setInput] = useState("");
	const [isActivityHovered, setIsActivityHovered] = useState(false);
	const [toolActivities, setToolActivities] = useState<ToolActivity[]>([]);
	const [queuedMessages, setQueuedMessages] = useState<QueuedMessageInfo[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [attachedImages, setAttachedImages] = useState<AttachedImageInfo[]>([]);
	const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
	const [editingQueueText, setEditingQueueText] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		const interval = setInterval(() => {
			if (chatRef.current) {
				setToolActivities(chatRef.current.getToolActivities());
				setQueuedMessages(chatRef.current.getQueuedMessages());
				setIsLoading(chatRef.current.isLoading());
				setAttachedImages(chatRef.current.getAttachedImages());
			}
		}, 100);
		return () => clearInterval(interval);
	}, [chatRef]);

	const handleSubmit = useCallback(() => {
		if (!input.trim() || !chatRef.current) return;
		const imagePaths = attachedImages.map((img) => img.path);
		if (imagePaths.length > 0) {
			chatRef.current.sendMessageWithImages(input.trim(), imagePaths);
		} else {
			chatRef.current.sendMessage(input.trim());
		}
		setInput("");
	}, [input, chatRef, attachedImages]);

	const handleStop = useCallback(() => {
		chatRef.current?.stopGeneration();
	}, [chatRef]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSubmit();
			} else if (e.key === "Escape") {
				onExitZen();
			}
		},
		[handleSubmit, onExitZen]
	);
	useEffect(() => {
		inputRef.current?.focus();
	}, []);
	const latestActivity = toolActivities[toolActivities.length - 1];
	const activityCount = toolActivities.length;

	return (
		<div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4">
			<div className="relative flex flex-col rounded-xl border border-inferay-gray-border bg-inferay-dark-gray/95 backdrop-blur-sm shadow-2xl overflow-visible">
				{isLoading && (
					<div
						className="relative flex items-center justify-between gap-3 px-3 py-2 border-b border-inferay-gray-border/50 rounded-t-xl"
						onMouseEnter={() => setIsActivityHovered(true)}
						onMouseLeave={() => setIsActivityHovered(false)}
					>
						{isActivityHovered && activityCount > 0 && (
							<div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg overflow-hidden bg-inferay-dark-gray shadow-lg border border-inferay-gray-border z-50">
								<div className="flex items-center justify-between px-2.5 py-1.5 text-[9px] font-medium uppercase tracking-wider border-b border-inferay-gray-border text-inferay-muted-gray">
									<span>Activity</span>
									<span className="tabular-nums">{activityCount}</span>
								</div>
								<div className="overflow-y-auto" style={{ maxHeight: "200px" }}>
									{toolActivities.map((activity, idx) => (
										<div
											key={activity.id}
											className={`flex items-center gap-2 px-2.5 py-1.5 text-[10px] ${
												idx < toolActivities.length - 1
													? "border-b border-inferay-gray-border/50"
													: ""
											}`}
										>
											<span className="shrink-0 text-inferay-muted-gray">
												{getZenToolIcon(activity.toolName, false)}
											</span>
											<span className="flex-1 truncate text-inferay-soft-white">
												{activity.summary}
											</span>
											{activity.isStreaming && (
												<span className="h-1.5 w-1.5 rounded-full shrink-0 bg-inferay-accent animate-pulse" />
											)}
										</div>
									))}
								</div>
							</div>
						)}

						{latestActivity ? (
							<div className="flex items-center gap-2 min-w-0 flex-1">
								<span className="shrink-0 text-inferay-accent">
									{getZenToolIcon(
										latestActivity.toolName,
										latestActivity.isStreaming
									)}
								</span>
								<span className="text-[11px] text-inferay-white truncate">
									{latestActivity.summary}
								</span>
								{activityCount > 1 && (
									<span className="shrink-0 text-[9px] text-inferay-accent bg-inferay-accent/10 px-1.5 py-0.5 rounded-full tabular-nums">
										+{activityCount - 1}
									</span>
								)}
							</div>
						) : (
							<div className="flex items-center gap-2">
								<span className="h-1.5 w-1.5 rounded-full animate-pulse bg-inferay-accent" />
								<span className="text-[11px] text-inferay-soft-white">
									Working...
								</span>
							</div>
						)}

						<button
							type="button"
							onClick={handleStop}
							className="shrink-0 flex items-center gap-1.5 h-6 px-2 rounded-md text-[10px] font-medium transition-all bg-inferay-gray text-inferay-soft-white hover:bg-inferay-light-gray border border-inferay-gray-border"
						>
							<IconStop className="w-3 h-3" />
							Stop
						</button>
					</div>
				)}

				{queuedMessages.length > 0 && (
					<div
						className="border-b border-inferay-gray-border/50 overflow-y-auto"
						style={{ maxHeight: "120px" }}
					>
						<div className="px-3 py-1 text-[9px] font-semibold tracking-wide uppercase text-inferay-muted-gray border-b border-inferay-gray-border/30">
							Queued messages
						</div>
						{queuedMessages.map((qm, idx) => (
							<div
								key={qm.id}
								className="group flex items-start gap-2 px-3 py-1.5 hover:bg-inferay-white/5 transition-colors"
								style={{
									borderBottom:
										idx < queuedMessages.length - 1
											? "1px solid rgba(255,255,255,0.04)"
											: undefined,
								}}
							>
								<span className="shrink-0 mt-0.5 text-[9px] font-mono tabular-nums text-inferay-muted-gray">
									{idx + 1}
								</span>
								{editingQueueId === qm.id ? (
									<div className="flex-1 flex items-center gap-1">
										<input
											type="text"
											autoFocus
											value={editingQueueText}
											onChange={(e) => setEditingQueueText(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter") {
													const trimmed = editingQueueText.trim();
													if (trimmed && chatRef.current) {
														chatRef.current.updateQueuedMessage(qm.id, trimmed);
													}
													setEditingQueueId(null);
												} else if (e.key === "Escape") {
													setEditingQueueId(null);
												}
											}}
											className="flex-1 bg-inferay-gray text-[11px] outline-none border-none px-1 py-0.5 rounded text-inferay-white"
										/>
										<button
											type="button"
											onClick={() => {
												const trimmed = editingQueueText.trim();
												if (trimmed && chatRef.current) {
													chatRef.current.updateQueuedMessage(qm.id, trimmed);
												}
												setEditingQueueId(null);
											}}
											className="shrink-0 p-0.5 rounded text-inferay-accent"
											title="Save"
										>
											<IconCheck size={12} />
										</button>
										<button
											type="button"
											onClick={() => setEditingQueueId(null)}
											className="shrink-0 p-0.5 rounded text-inferay-muted-gray"
											title="Cancel"
										>
											<IconX size={12} />
										</button>
									</div>
								) : (
									<>
										<span className="flex-1 text-[11px] truncate text-inferay-white">
											{qm.displayText}
										</span>
										<div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
											<button
												type="button"
												onClick={() => {
													setEditingQueueId(qm.id);
													setEditingQueueText(qm.text);
												}}
												className="p-0.5 rounded transition-colors hover:bg-white/10 text-inferay-muted-gray"
												title="Edit"
											>
												<IconPencil size={12} />
											</button>
											<button
												type="button"
												onClick={() =>
													chatRef.current?.removeQueuedMessage(qm.id)
												}
												className="p-0.5 rounded transition-colors hover:bg-red-500/20 text-red-400"
												title="Remove from queue"
											>
												<IconTrash size={12} />
											</button>
										</div>
									</>
								)}
							</div>
						))}
					</div>
				)}

				{attachedImages.length > 0 && (
					<div className="flex items-center gap-2 px-3 py-2 border-b border-inferay-gray-border/50">
						{attachedImages.map((img) => (
							<div key={img.path} className="relative group">
								<img
									src={img.previewUrl}
									alt={img.name}
									className="h-10 w-10 rounded-md object-cover border border-inferay-gray-border"
								/>
								<button
									type="button"
									onClick={() => chatRef.current?.removeAttachedImage(img.path)}
									className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"
								>
									×
								</button>
							</div>
						))}
					</div>
				)}

				<input
					type="file"
					ref={fileInputRef}
					accept="image/*"
					multiple
					className="hidden"
					onChange={async (e) => {
						for (const file of Array.from(e.target.files || [])) {
							if (file.type.startsWith("image/") && chatRef.current) {
								await chatRef.current.attachImageFile(file);
							}
						}
						e.target.value = "";
					}}
				/>

				<div className="flex items-center gap-2 px-3 py-2">
					<button
						type="button"
						onClick={() => fileInputRef.current?.click()}
						className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-inferay-muted-gray hover:text-inferay-soft-white hover:bg-inferay-white/10 transition-colors"
						title="Attach image"
					>
						<IconPlus size={16} />
					</button>

					<span className="shrink-0 text-inferay-accent">
						{getAgentIcon(agentKind, 14)}
					</span>

					<input
						ref={inputRef}
						type="text"
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={
							isLoading
								? "Type to queue next message..."
								: "Message... (Esc to exit)"
						}
						className="flex-1 bg-transparent text-[13px] text-inferay-white outline-none placeholder:text-inferay-muted-gray"
					/>

					{queuedMessages.length > 0 && (
						<span className="shrink-0 text-[10px] text-inferay-accent bg-inferay-accent/10 px-1.5 py-0.5 rounded tabular-nums">
							+{queuedMessages.length}
						</span>
					)}

					<button
						type="button"
						onClick={handleSubmit}
						disabled={!input.trim()}
						className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-inferay-accent/20 text-inferay-accent hover:bg-inferay-accent/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
					>
						<IconSend size={16} />
					</button>
				</div>
			</div>
		</div>
	);
}
function ToolbarButton({
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
			className={`flex h-full w-6 items-center justify-center transition-all ${
				active
					? "bg-inferay-white/10 text-inferay-white"
					: "text-inferay-muted-gray hover:text-inferay-soft-white"
			}`}
		>
			{icon}
		</button>
	);
}

/* ── Top-bar components ─────────────────────────────────── */

const TOPBAR_CLASS =
	"shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-inferay-gray-border";

function DiffViewerTopBar({
	mainViewMode,
	diffViewMode,
	filePath,
	onMainViewModeChange,
	onDiffViewModeChange,
}: {
	mainViewMode: "diff" | "graph";
	diffViewMode: DiffViewMode;
	filePath?: string;
	onMainViewModeChange: (mode: "diff" | "graph") => void;
	onDiffViewModeChange: (mode: DiffViewMode) => void;
}) {
	return (
		<div className={TOPBAR_CLASS}>
			{/* Left: Diff / Graph toggle */}
			<div className="flex h-5 items-center overflow-hidden rounded-md border border-inferay-gray-border bg-inferay-dark-gray">
				<button
					type="button"
					onClick={() => onMainViewModeChange("diff")}
					className={`h-full px-2 text-[8px] font-medium transition-colors ${
						mainViewMode === "diff"
							? "bg-inferay-white/10 text-inferay-white"
							: "text-inferay-muted-gray hover:text-inferay-soft-white"
					}`}
				>
					Diff
				</button>
				<button
					type="button"
					onClick={() => onMainViewModeChange("graph")}
					className={`h-full px-2 text-[8px] font-medium transition-colors ${
						mainViewMode === "graph"
							? "bg-inferay-white/10 text-inferay-white"
							: "text-inferay-muted-gray hover:text-inferay-soft-white"
					}`}
				>
					Graph
				</button>
			</div>

			{/* Center: file path */}
			{filePath && (
				<span className="text-[9px] font-mono text-inferay-muted-gray truncate min-w-0">
					{filePath}
				</span>
			)}

			<span className="flex-1" />

			{/* Right: view mode icons */}
			<div className="flex h-5 items-center overflow-hidden rounded-md border border-inferay-gray-border bg-inferay-dark-gray">
				<ToolbarButton
					active={diffViewMode === "split"}
					title="Split diff"
					onClick={() => onDiffViewModeChange("split")}
					icon={<IconLayoutGrid size={11} />}
				/>
				<ToolbarButton
					active={diffViewMode === "stacked"}
					title="Vertical diff"
					onClick={() => onDiffViewModeChange("stacked")}
					icon={<IconLayoutRows size={11} />}
				/>
				<ToolbarButton
					active={diffViewMode === "hunks"}
					title="Hunk view"
					onClick={() => onDiffViewModeChange("hunks")}
					icon={<IconGitBranch size={11} />}
				/>
			</div>
		</div>
	);
}
