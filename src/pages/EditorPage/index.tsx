import * as stylex from "@stylexjs/stylex";
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
import { IconButton } from "../../components/ui/IconButton.tsx";
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
import { color, controlSize, font } from "../../tokens.stylex.ts";
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
			// Re-read selected pane (sidebar may have changed it)
			const storedPane = readStoredValue("editor-selected-pane");
			if (storedPane) setSelectedPaneId(storedPane);
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

			if (e.key === "ArrowDown") {
				e.preventDefault();
				cycleFile(1);
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				cycleFile(-1);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [cycleFile]);

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
		<div {...stylex.props(styles.root)}>
			{!session ? (
				<div {...stylex.props(styles.pageGrid)}>
					<section {...stylex.props(styles.leftPane)}>
						<div {...stylex.props(styles.topBar)}>
							<span {...stylex.props(styles.topBarLabel)}>
								No active session
							</span>
							<span {...stylex.props(styles.spacer)} />
							<IconButton
								type="button"
								onClick={() => setShowSettings(true)}
								variant="ghost"
								size="xs"
								title="Settings"
							>
								<IconSettings size={10} />
							</IconButton>
						</div>
						<EmptyState />
					</section>
					<aside {...stylex.props(styles.rightPane)}>
						<div {...stylex.props(styles.splitBody)}>
							<div {...stylex.props(styles.viewerPane)}>
								<Placeholder label="No diff available" />
							</div>
							<div
								{...stylex.props(styles.sidebarShell)}
								style={{ width: sidebarWidth }}
							>
								<div
									{...stylex.props(styles.sidebarResize)}
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
				<div {...stylex.props(styles.zenLayout)}>
					<div {...stylex.props(styles.hidden)}>
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

					<div {...stylex.props(styles.viewerPane)}>
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
							<div {...stylex.props(styles.centerFull)}>
								<p {...stylex.props(styles.placeholderText)}>
									Loading graph...
								</p>
							</div>
						) : (
							<CommitGraph
								commits={graphCommits}
								rows={graphRows}
								selectedHash={selectedCommitHash ?? undefined}
								onSelect={setSelectedCommitHash}
								className={stylex.props(styles.fullHeight).className}
								wipFiles={files}
								branch={project?.branch}
							/>
						)}
					</div>

					<div
						{...stylex.props(styles.sidebarShell)}
						style={{ width: sidebarWidth }}
					>
						<div
							{...stylex.props(styles.sidebarResize)}
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
				<div {...stylex.props(styles.pageGrid)}>
					<section {...stylex.props(styles.leftPane)}>
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

					<aside {...stylex.props(styles.rightPane)}>
						<div {...stylex.props(styles.splitBody)}>
							<div {...stylex.props(styles.viewerColumn)}>
								<DiffViewerTopBar
									mainViewMode={mainViewMode}
									diffViewMode={diffViewMode}
									filePath={request?.file}
									onMainViewModeChange={setMainViewMode}
									onDiffViewModeChange={setDiffViewMode}
								/>
								<div {...stylex.props(styles.diffHost)}>
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
										<div {...stylex.props(styles.centerFull)}>
											<p {...stylex.props(styles.placeholderText)}>
												Loading graph...
											</p>
										</div>
									) : (
										<CommitGraph
											commits={graphCommits}
											rows={graphRows}
											selectedHash={selectedCommitHash ?? undefined}
											onSelect={setSelectedCommitHash}
											className={stylex.props(styles.fullHeight).className}
											wipFiles={files}
											branch={project?.branch}
										/>
									)}
								</div>
							</div>

							<div
								{...stylex.props(styles.sidebarShell)}
								style={{ width: sidebarWidth }}
							>
								<div
									{...stylex.props(styles.sidebarResize)}
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
		<div {...stylex.props(styles.emptyWrap)}>
			<div {...stylex.props(styles.emptyCard)}>
				<h2 {...stylex.props(styles.emptyTitle)}>No saved agent sessions</h2>
				<p {...stylex.props(styles.emptyDescription)}>
					Open Claude or Codex in the terminal page, pick a project directory,
					and it will appear here.
				</p>
			</div>
		</div>
	);
}

function Placeholder({ label }: { label: string }) {
	return (
		<div {...stylex.props(styles.centerFull, styles.centerPad)}>
			<p {...stylex.props(styles.placeholderText)}>{label}</p>
		</div>
	);
}

function getZenToolIcon(toolName: string, isAnimated = false): React.ReactNode {
	const iconProps = stylex.props(
		styles.zenToolIcon,
		isAnimated && styles.zenToolIconActive
	);
	const tool = toolName.toLowerCase();

	if (tool === "read") {
		return <IconEye {...iconProps} />;
	}
	if (tool === "edit" || tool === "patch") {
		return <IconPencil {...iconProps} />;
	}
	if (tool === "write") {
		return <IconFilePlus {...iconProps} />;
	}
	if (tool === "bash" || tool === "exec") {
		return <IconWrench {...iconProps} />;
	}
	if (tool === "grep" || tool === "glob") {
		return <IconWrench {...iconProps} />;
	}
	if (tool === "task") {
		return <IconUsers {...iconProps} />;
	}
	return <IconWrench {...iconProps} />;
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
		<div {...stylex.props(styles.zenComposerWrap)}>
			<div {...stylex.props(styles.zenComposerShell)}>
				{isLoading && (
					<div
						{...stylex.props(styles.zenStatusBar)}
						onMouseEnter={() => setIsActivityHovered(true)}
						onMouseLeave={() => setIsActivityHovered(false)}
					>
						{isActivityHovered && activityCount > 0 && (
							<div {...stylex.props(styles.zenActivityPopover)}>
								<div {...stylex.props(styles.zenActivityHeader)}>
									<span>Activity</span>
									<span {...stylex.props(styles.tabularText)}>
										{activityCount}
									</span>
								</div>
								<div {...stylex.props(styles.zenActivityList)}>
									{toolActivities.map((activity, idx) => (
										<div
											key={activity.id}
											{...stylex.props(
												styles.zenActivityRow,
												idx < toolActivities.length - 1
													? styles.zenActivityRowBorder
													: null
											)}
										>
											<span {...stylex.props(styles.mutedNoShrink)}>
												{getZenToolIcon(activity.toolName, false)}
											</span>
											<span {...stylex.props(styles.zenActivitySummary)}>
												{activity.summary}
											</span>
											{activity.isStreaming && (
												<span {...stylex.props(styles.liveDot)} />
											)}
										</div>
									))}
								</div>
							</div>
						)}

						{latestActivity ? (
							<div {...stylex.props(styles.zenLatestActivity)}>
								<span {...stylex.props(styles.accentNoShrink)}>
									{getZenToolIcon(
										latestActivity.toolName,
										latestActivity.isStreaming
									)}
								</span>
								<span {...stylex.props(styles.zenLatestSummary)}>
									{latestActivity.summary}
								</span>
								{activityCount > 1 && (
									<span {...stylex.props(styles.zenActivityCount)}>
										+{activityCount - 1}
									</span>
								)}
							</div>
						) : (
							<div {...stylex.props(styles.zenWorkingRow)}>
								<span {...stylex.props(styles.liveDot)} />
								<span {...stylex.props(styles.zenWorkingText)}>Working...</span>
							</div>
						)}

						<button
							type="button"
							onClick={handleStop}
							{...stylex.props(styles.zenStopButton)}
						>
							<IconStop size={12} {...stylex.props(styles.noShrink)} />
							Stop
						</button>
					</div>
				)}

				{queuedMessages.length > 0 && (
					<div {...stylex.props(styles.zenQueue)}>
						<div {...stylex.props(styles.zenQueueHeader)}>Queued messages</div>
						{queuedMessages.map((qm, idx) => (
							<div
								key={qm.id}
								{...stylex.props(
									styles.zenQueueRow,
									idx < queuedMessages.length - 1
										? styles.zenQueueRowBorder
										: null
								)}
							>
								<span {...stylex.props(styles.zenQueueIndex)}>{idx + 1}</span>
								{editingQueueId === qm.id ? (
									<div {...stylex.props(styles.zenQueueEditor)}>
										<input
											type="text"
											// biome-ignore lint/a11y/noAutofocus: Queue edit mode should focus the transient inline editor immediately.
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
											{...stylex.props(styles.zenQueueInput)}
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
											{...stylex.props(
												styles.zenTinyButton,
												styles.zenTinyButtonAccent
											)}
											title="Save"
										>
											<IconCheck size={12} />
										</button>
										<button
											type="button"
											onClick={() => setEditingQueueId(null)}
											{...stylex.props(styles.zenTinyButton)}
											title="Cancel"
										>
											<IconX size={12} />
										</button>
									</div>
								) : (
									<>
										<span {...stylex.props(styles.zenQueueText)}>
											{qm.displayText}
										</span>
										<div {...stylex.props(styles.zenQueueActions)}>
											<button
												type="button"
												onClick={() => {
													setEditingQueueId(qm.id);
													setEditingQueueText(qm.text);
												}}
												{...stylex.props(styles.zenTinyButton)}
												title="Edit"
											>
												<IconPencil size={12} />
											</button>
											<button
												type="button"
												onClick={() =>
													chatRef.current?.removeQueuedMessage(qm.id)
												}
												{...stylex.props(
													styles.zenTinyButton,
													styles.zenTinyButtonDanger
												)}
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
					<div {...stylex.props(styles.zenImages)}>
						{attachedImages.map((img) => (
							<div key={img.path} {...stylex.props(styles.zenImageThumbWrap)}>
								<img
									src={img.previewUrl}
									alt={img.name}
									{...stylex.props(styles.zenImageThumb)}
								/>
								<button
									type="button"
									onClick={() => chatRef.current?.removeAttachedImage(img.path)}
									{...stylex.props(styles.zenImageRemove)}
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
					{...stylex.props(styles.hidden)}
					onChange={async (e) => {
						for (const file of Array.from(e.target.files || [])) {
							if (file.type.startsWith("image/") && chatRef.current) {
								await chatRef.current.attachImageFile(file);
							}
						}
						e.target.value = "";
					}}
				/>

				<div {...stylex.props(styles.zenInputRow)}>
					<button
						type="button"
						onClick={() => fileInputRef.current?.click()}
						{...stylex.props(styles.zenIconButton)}
						title="Attach image"
					>
						<IconPlus size={16} />
					</button>

					<span {...stylex.props(styles.accentNoShrink)}>
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
						{...stylex.props(styles.zenInput)}
					/>

					{queuedMessages.length > 0 && (
						<span {...stylex.props(styles.zenQueueCount)}>
							+{queuedMessages.length}
						</span>
					)}

					<button
						type="button"
						onClick={handleSubmit}
						disabled={!input.trim()}
						{...stylex.props(styles.zenSendButton)}
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
			{...stylex.props(
				styles.toolbarButton,
				active && styles.toolbarButtonActive
			)}
		>
			{icon}
		</button>
	);
}

/* ── Top-bar components ─────────────────────────────────── */

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
		<div {...stylex.props(styles.topBar)}>
			<div {...stylex.props(styles.segmented)}>
				<button
					type="button"
					onClick={() => onMainViewModeChange("diff")}
					{...stylex.props(
						styles.segmentButton,
						mainViewMode === "diff" && styles.segmentButtonActive
					)}
				>
					Diff
				</button>
				<button
					type="button"
					onClick={() => onMainViewModeChange("graph")}
					{...stylex.props(
						styles.segmentButton,
						mainViewMode === "graph" && styles.segmentButtonActive
					)}
				>
					Graph
				</button>
			</div>

			{filePath && (
				<span {...stylex.props(styles.filePathLabel)}>{filePath}</span>
			)}

			<span {...stylex.props(styles.spacer)} />

			<div {...stylex.props(styles.segmented)}>
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

const styles = stylex.create({
	root: {
		display: "flex",
		height: "100%",
		minHeight: 0,
		flexDirection: "column",
		backgroundColor: color.background,
	},
	pageGrid: {
		display: "grid",
		minHeight: 0,
		flex: 1,
		gridTemplateColumns: {
			default: "1fr",
			"@media (min-width: 1024px)": "400px minmax(0, 1fr)",
		},
	},
	leftPane: {
		display: "flex",
		minWidth: 0,
		minHeight: 0,
		flexDirection: "column",
		borderRightWidth: 1,
		borderRightStyle: "solid",
		borderRightColor: color.border,
	},
	rightPane: {
		display: "flex",
		minWidth: 0,
		minHeight: 0,
		flexDirection: "column",
		backgroundColor: color.background,
	},
	splitBody: {
		display: "flex",
		minHeight: 0,
		flex: 1,
		overflow: "hidden",
	},
	viewerPane: {
		display: "flex",
		minWidth: 0,
		minHeight: 0,
		flex: 1,
		flexDirection: "column",
		overflow: "hidden",
	},
	viewerColumn: {
		display: "flex",
		minWidth: 0,
		minHeight: 0,
		flex: 1,
		flexDirection: "column",
		overflow: "hidden",
	},
	diffHost: {
		minHeight: 0,
		flex: 1,
		overflow: "hidden",
	},
	sidebarShell: {
		display: "flex",
		flexShrink: 0,
		flexDirection: "row",
		borderLeftWidth: 1,
		borderLeftStyle: "solid",
		borderLeftColor: color.border,
		backgroundColor: color.background,
	},
	sidebarResize: {
		width: controlSize._1,
		flexShrink: 0,
		cursor: "ew-resize",
		backgroundColor: {
			default: "transparent",
			":hover": "rgba(29, 185, 84, 0.3)",
		},
		transitionProperty: "background-color",
		transitionDuration: "120ms",
	},
	zenLayout: {
		position: "relative",
		display: "flex",
		minHeight: 0,
		flex: 1,
	},
	hidden: {
		display: "none",
	},
	fullHeight: {
		height: "100%",
	},
	centerFull: {
		display: "flex",
		height: "100%",
		alignItems: "center",
		justifyContent: "center",
	},
	centerPad: {
		paddingInline: controlSize._6,
	},
	topBar: {
		display: "flex",
		flexShrink: 0,
		alignItems: "center",
		gap: controlSize._2,
		borderBottomWidth: 1,
		borderBottomStyle: "solid",
		borderBottomColor: color.border,
		paddingBlock: "0.375rem",
		paddingInline: controlSize._3,
	},
	topBarLabel: {
		color: color.textMuted,
		fontSize: font.size_2,
		fontWeight: font.weight_5,
	},
	spacer: {
		flex: 1,
	},
	emptyWrap: {
		display: "flex",
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingInline: controlSize._6,
	},
	emptyCard: {
		maxWidth: "28rem",
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: color.border,
		backgroundColor: color.backgroundRaised,
		padding: controlSize._6,
		textAlign: "center",
	},
	emptyTitle: {
		color: color.textMain,
		fontSize: "0.9375rem",
		fontWeight: 600,
	},
	emptyDescription: {
		marginTop: controlSize._2,
		color: color.textMuted,
		fontSize: font.size_3,
		lineHeight: 1.65,
	},
	placeholderText: {
		maxWidth: "20rem",
		color: color.textMuted,
		fontSize: font.size_3,
		lineHeight: 1.65,
		textAlign: "center",
	},
	zenToolIcon: {
		width: controlSize._3,
		height: controlSize._3,
		flexShrink: 0,
	},
	zenToolIconActive: {
		animationName: stylex.keyframes({
			"50%": {
				opacity: 0.45,
			},
		}),
		animationDuration: "1s",
		animationIterationCount: "infinite",
	},
	zenComposerWrap: {
		position: "absolute",
		zIndex: 50,
		bottom: controlSize._6,
		left: "50%",
		width: "100%",
		maxWidth: "42rem",
		paddingInline: controlSize._4,
		transform: "translateX(-50%)",
	},
	zenComposerShell: {
		position: "relative",
		display: "flex",
		flexDirection: "column",
		overflow: "visible",
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: color.border,
		borderRadius: "0.75rem",
		backgroundColor: "rgba(24, 24, 27, 0.95)",
		boxShadow: "0 25px 50px rgba(0, 0, 0, 0.45)",
		backdropFilter: "blur(6px)",
	},
	zenStatusBar: {
		position: "relative",
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: controlSize._3,
		borderBottomWidth: 1,
		borderBottomStyle: "solid",
		borderBottomColor: "rgba(63, 63, 70, 0.5)",
		borderTopLeftRadius: "0.75rem",
		borderTopRightRadius: "0.75rem",
		paddingBlock: controlSize._2,
		paddingInline: controlSize._3,
	},
	zenActivityPopover: {
		position: "absolute",
		zIndex: 50,
		left: 0,
		right: 0,
		bottom: "100%",
		marginBottom: controlSize._1,
		overflow: "hidden",
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: color.border,
		borderRadius: 8,
		backgroundColor: color.backgroundRaised,
		boxShadow: "0 10px 25px rgba(0, 0, 0, 0.45)",
	},
	zenActivityHeader: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		borderBottomWidth: 1,
		borderBottomStyle: "solid",
		borderBottomColor: color.border,
		color: color.textMuted,
		fontSize: "0.5625rem",
		fontWeight: font.weight_5,
		letterSpacing: "0.05em",
		paddingBlock: "0.375rem",
		paddingInline: "0.625rem",
		textTransform: "uppercase",
	},
	zenActivityList: {
		maxHeight: "200px",
		overflowY: "auto",
	},
	zenActivityRow: {
		display: "flex",
		alignItems: "center",
		gap: controlSize._2,
		fontSize: "0.625rem",
		paddingBlock: "0.375rem",
		paddingInline: "0.625rem",
	},
	zenActivityRowBorder: {
		borderBottomWidth: 1,
		borderBottomStyle: "solid",
		borderBottomColor: "rgba(63, 63, 70, 0.5)",
	},
	mutedNoShrink: {
		flexShrink: 0,
		color: color.textMuted,
	},
	accentNoShrink: {
		flexShrink: 0,
		color: "#8b5cf6",
	},
	noShrink: {
		flexShrink: 0,
	},
	zenActivitySummary: {
		flex: 1,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		color: color.textSoft,
	},
	liveDot: {
		width: "0.375rem",
		height: "0.375rem",
		flexShrink: 0,
		borderRadius: "999px",
		backgroundColor: "#8b5cf6",
		animationName: stylex.keyframes({
			"50%": {
				opacity: 0.45,
			},
		}),
		animationDuration: "1s",
		animationIterationCount: "infinite",
	},
	zenLatestActivity: {
		display: "flex",
		minWidth: 0,
		flex: 1,
		alignItems: "center",
		gap: controlSize._2,
	},
	zenLatestSummary: {
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		color: color.textMain,
		fontSize: font.size_2,
	},
	zenActivityCount: {
		flexShrink: 0,
		borderRadius: "999px",
		backgroundColor: "rgba(139, 92, 246, 0.1)",
		color: "#8b5cf6",
		fontSize: "0.5625rem",
		fontVariantNumeric: "tabular-nums",
		paddingBlock: "0.125rem",
		paddingInline: "0.375rem",
	},
	tabularText: {
		fontVariantNumeric: "tabular-nums",
	},
	zenWorkingRow: {
		display: "flex",
		alignItems: "center",
		gap: controlSize._2,
	},
	zenWorkingText: {
		color: color.textSoft,
		fontSize: font.size_2,
	},
	zenStopButton: {
		display: "flex",
		height: controlSize._6,
		flexShrink: 0,
		alignItems: "center",
		gap: "0.375rem",
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: color.border,
		borderRadius: 6,
		backgroundColor: {
			default: color.controlHover,
			":hover": color.controlActive,
		},
		color: color.textSoft,
		fontSize: "0.625rem",
		fontWeight: font.weight_5,
		paddingInline: controlSize._2,
		transitionProperty: "background-color, color",
		transitionDuration: "120ms",
	},
	zenQueue: {
		maxHeight: "120px",
		overflowY: "auto",
		borderBottomWidth: 1,
		borderBottomStyle: "solid",
		borderBottomColor: "rgba(63, 63, 70, 0.5)",
	},
	zenQueueHeader: {
		borderBottomWidth: 1,
		borderBottomStyle: "solid",
		borderBottomColor: "rgba(63, 63, 70, 0.3)",
		color: color.textMuted,
		fontSize: "0.5625rem",
		fontWeight: 600,
		letterSpacing: "0.05em",
		paddingBlock: controlSize._1,
		paddingInline: controlSize._3,
		textTransform: "uppercase",
	},
	zenQueueRow: {
		display: "flex",
		alignItems: "flex-start",
		gap: controlSize._2,
		paddingBlock: "0.375rem",
		paddingInline: controlSize._3,
		backgroundColor: {
			default: "transparent",
			":hover": "rgba(255, 255, 255, 0.05)",
		},
		transitionProperty: "background-color",
		transitionDuration: "120ms",
	},
	zenQueueRowBorder: {
		borderBottomWidth: 1,
		borderBottomStyle: "solid",
		borderBottomColor: "rgba(255, 255, 255, 0.04)",
	},
	zenQueueIndex: {
		flexShrink: 0,
		marginTop: "0.125rem",
		color: color.textMuted,
		fontFamily: font.familyMono,
		fontSize: "0.5625rem",
		fontVariantNumeric: "tabular-nums",
	},
	zenQueueEditor: {
		display: "flex",
		flex: 1,
		alignItems: "center",
		gap: controlSize._1,
	},
	zenQueueInput: {
		flex: 1,
		borderWidth: 0,
		borderRadius: 4,
		backgroundColor: color.controlHover,
		color: color.textMain,
		fontSize: font.size_2,
		outline: "none",
		paddingBlock: "0.125rem",
		paddingInline: controlSize._1,
	},
	zenTinyButton: {
		flexShrink: 0,
		borderWidth: 0,
		borderRadius: 4,
		backgroundColor: {
			default: "transparent",
			":hover": "rgba(255, 255, 255, 0.1)",
		},
		color: color.textMuted,
		padding: "0.125rem",
		transitionProperty: "background-color, color",
		transitionDuration: "120ms",
	},
	zenTinyButtonAccent: {
		color: "#8b5cf6",
	},
	zenTinyButtonDanger: {
		backgroundColor: {
			default: "transparent",
			":hover": "rgba(239, 68, 68, 0.2)",
		},
		color: "#f87171",
	},
	zenQueueText: {
		flex: 1,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		color: color.textMain,
		fontSize: font.size_2,
	},
	zenQueueActions: {
		display: "flex",
		flexShrink: 0,
		alignItems: "center",
		gap: "0.125rem",
		opacity: 0.75,
	},
	zenImages: {
		display: "flex",
		alignItems: "center",
		gap: controlSize._2,
		borderBottomWidth: 1,
		borderBottomStyle: "solid",
		borderBottomColor: "rgba(63, 63, 70, 0.5)",
		paddingBlock: controlSize._2,
		paddingInline: controlSize._3,
	},
	zenImageThumbWrap: {
		position: "relative",
	},
	zenImageThumb: {
		width: "2.5rem",
		height: "2.5rem",
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: color.border,
		borderRadius: 6,
		objectFit: "cover",
	},
	zenImageRemove: {
		position: "absolute",
		top: "-0.375rem",
		right: "-0.375rem",
		display: "flex",
		width: controlSize._4,
		height: controlSize._4,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 0,
		borderRadius: "999px",
		backgroundColor: "#ef4444",
		color: "#ffffff",
		fontSize: "0.5rem",
	},
	zenInputRow: {
		display: "flex",
		alignItems: "center",
		gap: controlSize._2,
		paddingBlock: controlSize._2,
		paddingInline: controlSize._3,
	},
	zenIconButton: {
		display: "flex",
		width: controlSize._7,
		height: controlSize._7,
		flexShrink: 0,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 0,
		borderRadius: 6,
		backgroundColor: {
			default: "transparent",
			":hover": "rgba(255, 255, 255, 0.1)",
		},
		color: {
			default: color.textMuted,
			":hover": color.textSoft,
		},
		transitionProperty: "background-color, color",
		transitionDuration: "120ms",
	},
	zenInput: {
		flex: 1,
		borderWidth: 0,
		backgroundColor: "transparent",
		color: color.textMain,
		fontSize: "0.8125rem",
		outline: "none",
		"::placeholder": {
			color: color.textMuted,
		},
	},
	zenQueueCount: {
		flexShrink: 0,
		borderRadius: 4,
		backgroundColor: "rgba(139, 92, 246, 0.1)",
		color: "#8b5cf6",
		fontSize: "0.625rem",
		fontVariantNumeric: "tabular-nums",
		paddingBlock: "0.125rem",
		paddingInline: "0.375rem",
	},
	zenSendButton: {
		display: "flex",
		width: controlSize._7,
		height: controlSize._7,
		flexShrink: 0,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 0,
		borderRadius: 8,
		backgroundColor: {
			default: "rgba(139, 92, 246, 0.2)",
			":hover": "rgba(139, 92, 246, 0.3)",
		},
		color: "#8b5cf6",
		transitionProperty: "background-color, opacity",
		transitionDuration: "120ms",
		":disabled": {
			cursor: "not-allowed",
			opacity: 0.3,
		},
	},
	toolbarButton: {
		display: "flex",
		height: "100%",
		width: controlSize._6,
		alignItems: "center",
		justifyContent: "center",
		color: color.textMuted,
		transitionProperty: "background-color, color",
		transitionDuration: "120ms",
		backgroundColor: {
			default: "transparent",
			":hover": color.controlHover,
		},
		":hover": {
			color: color.textSoft,
		},
	},
	toolbarButtonActive: {
		backgroundColor: color.controlActive,
		color: color.textMain,
	},
	segmented: {
		display: "flex",
		height: controlSize._5,
		alignItems: "center",
		overflow: "hidden",
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: color.border,
		borderRadius: "0.375rem",
		backgroundColor: color.backgroundRaised,
	},
	segmentButton: {
		height: "100%",
		color: color.textMuted,
		fontSize: "0.5rem",
		fontWeight: font.weight_5,
		paddingInline: controlSize._2,
		transitionProperty: "background-color, color",
		transitionDuration: "120ms",
		backgroundColor: {
			default: "transparent",
			":hover": color.controlHover,
		},
		":hover": {
			color: color.textSoft,
		},
	},
	segmentButtonActive: {
		backgroundColor: color.controlActive,
		color: color.textMain,
	},
	filePathLabel: {
		minWidth: 0,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		color: color.textMuted,
		fontFamily: "var(--font-diff)",
		fontSize: font.size_1,
	},
});
