import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	type AttachedImageInfo,
	type AgentChatHandle,
	AgentChatView,
	type QueuedMessageInfo,
	type ToolActivity,
} from "../../components/chat/AgentChatView.tsx";
import { clearAgentChatMessages } from "../../components/chat/chat-session-store.ts";
import { CommitGraph } from "../../components/git/CommitGraph.tsx";
import { DropdownButton } from "../../components/ui/DropdownButton.tsx";
import {
	IconGitBranch,
	IconLayoutGrid,
	IconLayoutRows,
	IconSettings,
} from "../../components/ui/Icons.tsx";
import { ActivityIndicator } from "../../features/activity-feed/ActivityFeed.tsx";
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
import { getAgentDefinition, isChatAgentKind } from "../../lib/agents.ts";
import {
	loadAppThemeId,
	mapAppThemeToTerminalTheme,
} from "../../lib/app-theme.ts";
import { readStoredValue, writeStoredValue } from "../../lib/stored-json.ts";
import {
	getThemeById,
	getPaneTitle,
	loadTerminalState,
	saveTerminalState,
	type TerminalGroupModel,
} from "../../lib/terminal-utils.ts";
import { wsClient } from "../../lib/websocket.ts";
import { type DiffViewMode, GitDiffView } from "../Terminal/GitDiffView.tsx";
import { InlineDirectoryPicker } from "../Terminal/InlineDirectoryPicker.tsx";
import { TerminalSettingsPanel } from "../Terminal/TerminalSettingsPanel.tsx";
import {
	EditorSidebar,
	FileStatusIcon,
	type SelectedFile,
} from "./EditorSidebar.tsx";

interface Session {
	groupId: string;
	groupName: string;
	paneId: string;
	paneTitle: string;
	agentKind: "claude" | "codex";
	cwd?: string;
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

function basename(p?: string): string {
	if (!p) return "No directory";
	return p.split("/").pop() || p;
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
	const [agentStatuses, setAgentStatuses] = useState<Map<string, string>>(
		new Map()
	);
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
	const [appearance, setAppearance] = useState(() => {
		const ts = loadTerminalState();
		return {
			themeId: ts?.themeId ?? mapAppThemeToTerminalTheme(loadAppThemeId()),
			fontSize: ts?.fontSize ?? 13,
			fontFamily: ts?.fontFamily ?? "SF Mono",
			opacity: ts?.opacity ?? 1,
		};
	});
	const allSessions = useMemo(
		() => stableSessions(flattenSessions(terminalState?.groups ?? [])),
		[terminalState]
	);
	const sessions = useMemo(
		() => allSessions.filter((s) => !closedPaneIds.has(s.paneId)),
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
	const theme = useMemo(
		() =>
			getThemeById(
				terminalState?.themeId ?? mapAppThemeToTerminalTheme(loadAppThemeId())
			),
		[terminalState?.themeId]
	);
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
	const { commits: graphCommits, loading: graphLoading } = useGitGraph(
		mainViewMode === "graph" ? session?.cwd : undefined,
		100
	);
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

	const { events: activityEvents } = useActivityFeed({
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

	const handleDirectorySelect = useCallback((paneId: string, path: string) => {
		const state = loadTerminalState();
		if (!state) return;
		saveTerminalState({
			...state,
			groups: state.groups.map((g) => ({
				...g,
				panes: g.panes.map((p) =>
					p.id === paneId
						? {
								...p,
								cwd: path,
								pendingCwd: false,
								title: getPaneTitle(p.agentKind, path),
							}
						: p
				),
			})),
		});
		setSessionVersion((v) => v + 1);
		window.dispatchEvent(new Event("terminal-shell-change"));
	}, []);

	const handleDirectoryCancel = useCallback(
		(paneId: string) => {
			closePane(paneId);
			const state = loadTerminalState();
			if (!state) return;
			saveTerminalState({
				...state,
				groups: state.groups.map((g) => ({
					...g,
					panes: g.panes.filter((p) => p.id !== paneId),
				})),
			});
			setSessionVersion((v) => v + 1);
			window.dispatchEvent(new Event("terminal-shell-change"));
		},
		[closePane]
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

	const handleAppearanceChange = useCallback(
		(patch: Partial<typeof appearance>) => {
			setAppearance((prev) => {
				const next = { ...prev, ...patch };
				const state = loadTerminalState();
				if (state) {
					saveTerminalState({ ...state, ...next });
					window.dispatchEvent(new Event("terminal-shell-change"));
				}
				return next;
			});
		},
		[]
	);

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
		<div className="flex h-full min-h-0 flex-col bg-inferay-bg">
			{!session ? (
				<EmptyState />
			) : session.pendingCwd ? (
				<div className="flex h-full items-center justify-center">
					<InlineDirectoryPicker
						onSelect={(path) => handleDirectorySelect(session.paneId, path)}
						onCancel={() => handleDirectoryCancel(session.paneId)}
					/>
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
							agentKind={session.agentKind}
							theme={theme}
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
								<p className="text-[11px] text-inferay-text-3">
									Loading graph...
								</p>
							</div>
						) : (
							<CommitGraph
								commits={graphCommits}
								selectedHash={selectedCommitHash ?? undefined}
								onSelect={setSelectedCommitHash}
								className="h-full"
								wipFiles={files}
								branch={project?.branch}
							/>
						)}
					</div>

					<div
						className="flex shrink-0 flex-row border-l border-inferay-border bg-inferay-bg"
						style={{ width: sidebarWidth }}
					>
						<div
							className="w-1 cursor-ew-resize bg-transparent hover:bg-inferay-accent/30 transition-colors shrink-0"
							onMouseDown={handleSidebarDragStart}
						/>
						<EditorSidebar
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
					<section className="flex min-h-0 min-w-0 flex-col border-r border-inferay-border">
						<AgentTopBar
							session={session}
							sessions={sessions}
							activityEvents={activityEvents}
							onSelectPane={setSelectedPaneId}
							onClose={closePane}
							onSettingsClick={() => setShowSettings(true)}
						/>
						<div className="flex-1 min-h-0">
							<AgentChatView
								key={session.paneId}
								ref={chatRef}
								paneId={session.paneId}
								cwd={session.cwd}
								agentKind={session.agentKind}
								theme={theme}
								onStatusChange={(id, status) => {
									setAgentStatuses((cur) => {
										if (cur.get(id) === status) return cur;
										return new Map(cur).set(id, status);
									});
								}}
							/>
						</div>
					</section>

					<aside className="min-h-0 min-w-0 bg-inferay-bg flex flex-col">
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
											<p className="text-[11px] text-inferay-text-3">
												Loading graph...
											</p>
										</div>
									) : (
										<CommitGraph
											commits={graphCommits}
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
								className="flex shrink-0 flex-row border-l border-inferay-border bg-inferay-bg"
								style={{ width: sidebarWidth }}
							>
								<div
									className="w-1 cursor-ew-resize bg-transparent hover:bg-inferay-accent/30 transition-colors shrink-0"
									onMouseDown={handleSidebarDragStart}
								/>
								<EditorSidebar
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
					themeId={appearance.themeId}
					fontSize={appearance.fontSize}
					fontFamily={appearance.fontFamily}
					opacity={appearance.opacity}
					onThemeChange={(v) => handleAppearanceChange({ themeId: v })}
					onFontSizeChange={(v) => handleAppearanceChange({ fontSize: v })}
					onFontFamilyChange={(v) => handleAppearanceChange({ fontFamily: v })}
					onOpacityChange={(v) => handleAppearanceChange({ opacity: v })}
					onClose={() => setShowSettings(false)}
				/>
			)}
		</div>
	);
}

function EmptyState() {
	return (
		<div className="flex flex-1 items-center justify-center px-6">
			<div className="max-w-md border border-inferay-border bg-inferay-surface p-6 text-center">
				<h2 className="text-[15px] font-semibold text-inferay-text">
					No saved agent sessions
				</h2>
				<p className="mt-2 text-[12px] leading-5 text-inferay-text-3">
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
			<p className="max-w-xs text-center text-[12px] leading-5 text-inferay-text-3">
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
		return (
			<svg
				className={`${baseClass} ${animateClass}`}
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
			>
				<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
				<circle cx="12" cy="12" r="3" />
			</svg>
		);
	}
	if (tool === "edit" || tool === "patch") {
		return (
			<svg
				className={`${baseClass} ${animateClass}`}
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
			>
				<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
				<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
			</svg>
		);
	}
	if (tool === "write") {
		return (
			<svg
				className={`${baseClass} ${animateClass}`}
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
	}
	if (tool === "bash" || tool === "exec") {
		return (
			<svg
				className={`${baseClass} ${animateClass}`}
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
			>
				<polyline points="4 17 10 11 4 5" />
				<line x1="12" y1="19" x2="20" y2="19" />
			</svg>
		);
	}
	if (tool === "grep" || tool === "glob") {
		return (
			<svg
				className={`${baseClass} ${animateClass}`}
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
			>
				<circle cx="11" cy="11" r="8" />
				<line x1="21" y1="21" x2="16.65" y2="16.65" />
			</svg>
		);
	}
	if (tool === "task") {
		return (
			<svg
				className={`${baseClass} ${animateClass}`}
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
	}
	return (
		<svg
			className={`${baseClass} ${animateClass}`}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
		>
			<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
		</svg>
	);
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
			<div className="relative flex flex-col rounded-xl border border-inferay-border bg-inferay-surface/95 backdrop-blur-sm shadow-2xl overflow-visible">
				{isLoading && (
					<div
						className="relative flex items-center justify-between gap-3 px-3 py-2 border-b border-inferay-border/50 rounded-t-xl"
						onMouseEnter={() => setIsActivityHovered(true)}
						onMouseLeave={() => setIsActivityHovered(false)}
					>
						{isActivityHovered && activityCount > 0 && (
							<div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg overflow-hidden bg-inferay-surface shadow-lg border border-inferay-border z-50">
								<div className="flex items-center justify-between px-2.5 py-1.5 text-[9px] font-medium uppercase tracking-wider border-b border-inferay-border text-inferay-text-3">
									<span>Activity</span>
									<span className="tabular-nums">{activityCount}</span>
								</div>
								<div className="overflow-y-auto" style={{ maxHeight: "200px" }}>
									{toolActivities.map((activity, idx) => (
										<div
											key={activity.id}
											className={`flex items-center gap-2 px-2.5 py-1.5 text-[10px] ${
												idx < toolActivities.length - 1
													? "border-b border-inferay-border/50"
													: ""
											}`}
										>
											<span className="shrink-0 text-inferay-text-3">
												{getZenToolIcon(activity.toolName, false)}
											</span>
											<span className="flex-1 truncate text-inferay-text-2">
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
								<span className="text-[11px] text-inferay-text truncate">
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
								<span className="text-[11px] text-inferay-text-2">
									Working...
								</span>
							</div>
						)}

						<button
							type="button"
							onClick={handleStop}
							className="shrink-0 flex items-center gap-1.5 h-6 px-2 rounded-md text-[10px] font-medium transition-all bg-inferay-surface-2 text-inferay-text-2 hover:bg-inferay-surface-3 border border-inferay-border"
						>
							<svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
								<rect x="6" y="6" width="12" height="12" rx="1" />
							</svg>
							Stop
						</button>
					</div>
				)}

				{queuedMessages.length > 0 && (
					<div
						className="border-b border-inferay-border/50 overflow-y-auto"
						style={{ maxHeight: "120px" }}
					>
						<div className="px-3 py-1 text-[9px] font-semibold tracking-wide uppercase text-inferay-text-3 border-b border-inferay-border/30">
							Queued messages
						</div>
						{queuedMessages.map((qm, idx) => (
							<div
								key={qm.id}
								className="group flex items-start gap-2 px-3 py-1.5 hover:bg-inferay-text/5 transition-colors"
								style={{
									borderBottom:
										idx < queuedMessages.length - 1
											? "1px solid rgba(255,255,255,0.04)"
											: undefined,
								}}
							>
								<span className="shrink-0 mt-0.5 text-[9px] font-mono tabular-nums text-inferay-text-3">
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
											className="flex-1 bg-inferay-surface-2 text-[11px] outline-none border-none px-1 py-0.5 rounded text-inferay-text"
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
											<svg
												className="w-3 h-3"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="2"
											>
												<polyline points="20 6 9 17 4 12" />
											</svg>
										</button>
										<button
											type="button"
											onClick={() => setEditingQueueId(null)}
											className="shrink-0 p-0.5 rounded text-inferay-text-3"
											title="Cancel"
										>
											<svg
												className="w-3 h-3"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="2"
											>
												<line x1="18" y1="6" x2="6" y2="18" />
												<line x1="6" y1="6" x2="18" y2="18" />
											</svg>
										</button>
									</div>
								) : (
									<>
										<span className="flex-1 text-[11px] truncate text-inferay-text">
											{qm.displayText}
										</span>
										<div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
											<button
												type="button"
												onClick={() => {
													setEditingQueueId(qm.id);
													setEditingQueueText(qm.text);
												}}
												className="p-0.5 rounded transition-colors hover:bg-white/10 text-inferay-text-3"
												title="Edit"
											>
												<svg
													className="w-3 h-3"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="2"
												>
													<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
													<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
												</svg>
											</button>
											<button
												type="button"
												onClick={() =>
													chatRef.current?.removeQueuedMessage(qm.id)
												}
												className="p-0.5 rounded transition-colors hover:bg-red-500/20 text-red-400"
												title="Remove from queue"
											>
												<svg
													className="w-3 h-3"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="2"
												>
													<polyline points="3 6 5 6 21 6" />
													<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
												</svg>
											</button>
										</div>
									</>
								)}
							</div>
						))}
					</div>
				)}

				{attachedImages.length > 0 && (
					<div className="flex items-center gap-2 px-3 py-2 border-b border-inferay-border/50">
						{attachedImages.map((img) => (
							<div key={img.path} className="relative group">
								<img
									src={img.previewUrl}
									alt={img.name}
									className="h-10 w-10 rounded-md object-cover border border-inferay-border"
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
						className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-inferay-text-3 hover:text-inferay-text-2 hover:bg-inferay-text/10 transition-colors"
						title="Attach image"
					>
						<svg
							className="w-4 h-4"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<line x1="12" y1="5" x2="12" y2="19" />
							<line x1="5" y1="12" x2="19" y2="12" />
						</svg>
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
						className="flex-1 bg-transparent text-[13px] text-inferay-text outline-none placeholder:text-inferay-text-3"
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
						<svg
							className="w-4 h-4"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<line x1="22" y1="2" x2="11" y2="13" />
							<polygon points="22 2 15 22 11 13 2 9 22 2" />
						</svg>
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
					? "bg-inferay-text/10 text-inferay-text"
					: "text-inferay-text-3 hover:text-inferay-text-2"
			}`}
		>
			{icon}
		</button>
	);
}

/* ── Top-bar components ─────────────────────────────────── */

const TOPBAR_CLASS =
	"shrink-0 flex items-center gap-2 px-3 h-8 border-b border-inferay-border";

function AgentTopBar({
	session,
	sessions,
	activityEvents,
	onSelectPane,
	onClose,
	onSettingsClick,
}: {
	session: { paneId: string; cwd: string; agentKind: string };
	sessions: Array<{ paneId: string; cwd: string; agentKind: string }>;
	activityEvents: ToolActivity[];
	onSelectPane: (id: string) => void;
	onClose: (id: string) => void;
	onSettingsClick?: () => void;
}) {
	return (
		<div className={TOPBAR_CLASS}>
			<span className="text-inferay-accent">
				{getAgentIcon(session.agentKind, 10)}
			</span>
			<span className="text-[10px] font-medium text-inferay-text-2">
				{getAgentDefinition(session.agentKind).label}
			</span>
			{session.cwd && (
				<>
					<span className="text-[10px] text-inferay-text-3">›</span>
					{sessions.length > 1 ? (
						<DropdownButton
							value={session.paneId}
							options={sessions.map((item) => ({
								id: item.paneId,
								label: basename(item.cwd),
								detail: getAgentDefinition(item.agentKind).label,
								icon: getAgentIcon(item.agentKind, 12),
							}))}
							onChange={onSelectPane}
							minWidth={220}
							buttonClassName="h-5 rounded-md border-transparent px-1.5 text-[10px] font-medium hover:bg-inferay-text/[0.06]"
							labelClassName="max-w-[120px] truncate text-[10px]"
						/>
					) : (
						<span
							className="text-[10px] font-medium text-inferay-text truncate"
							title={session.cwd}
						>
							{session.cwd.split("/").pop() || session.cwd}
						</span>
					)}
				</>
			)}
			<span className="flex-1" />
			<ActivityIndicator events={activityEvents} />
			{onSettingsClick && (
				<button
					type="button"
					onClick={onSettingsClick}
					className="flex items-center justify-center h-4 w-4 rounded transition-colors text-inferay-text-3 hover:text-inferay-text-2"
					title="Settings"
				>
					<IconSettings size={10} />
				</button>
			)}
			<button
				type="button"
				onClick={() => onClose(session.paneId)}
				className="flex items-center justify-center h-4 w-4 rounded transition-colors text-inferay-text-3 hover:text-red-400 hover:bg-red-500/15"
				title="Close session"
			>
				<svg
					aria-hidden
					width="8"
					height="8"
					viewBox="0 0 8 8"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
				>
					<path d="M1 1l6 6M7 1l-6 6" />
				</svg>
			</button>
		</div>
	);
}

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
			<div className="flex h-5 items-center overflow-hidden rounded-md border border-inferay-border bg-inferay-surface">
				<button
					type="button"
					onClick={() => onMainViewModeChange("diff")}
					className={`h-full px-2 text-[8px] font-medium transition-colors ${
						mainViewMode === "diff"
							? "bg-inferay-text/10 text-inferay-text"
							: "text-inferay-text-3 hover:text-inferay-text-2"
					}`}
				>
					Diff
				</button>
				<button
					type="button"
					onClick={() => onMainViewModeChange("graph")}
					className={`h-full px-2 text-[8px] font-medium transition-colors ${
						mainViewMode === "graph"
							? "bg-inferay-text/10 text-inferay-text"
							: "text-inferay-text-3 hover:text-inferay-text-2"
					}`}
				>
					Graph
				</button>
			</div>

			{/* Center: file path */}
			{filePath && (
				<span className="text-[9px] font-mono text-inferay-text-3 truncate min-w-0">
					{filePath}
				</span>
			)}

			<span className="flex-1" />

			{/* Right: view mode icons */}
			<div className="flex h-5 items-center overflow-hidden rounded-md border border-inferay-border bg-inferay-surface">
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
