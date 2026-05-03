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
import { clearAgentChatMessages } from "../../components/chat/chat-session-store.ts";
import {
	ChangeFileSidebar,
	type SelectedFile,
} from "../../components/git/ChangeFileSidebar.tsx";
import { CommitGraph } from "../../components/git/CommitGraph.tsx";
import { IconButton } from "../../components/ui/IconButton.tsx";
import {
	IconGitBranch,
	IconLayoutGrid,
	IconSettings,
} from "../../components/ui/Icons.tsx";
import { useActivityFeed } from "../../features/activity-feed/useActivityFeed.ts";
import { useFileWatcher } from "../../features/file-watcher/useFileWatcher.ts";
import { useAgentSessions } from "../../features/agents/useAgentSessions.ts";
import { useGitChangeActions } from "../../features/git/useGitChangeActions.ts";
import { type DiffRequest, useGitDiff } from "../../features/git/useGitDiff.ts";
import {
	useCommitDetails,
	useGitGraph,
} from "../../features/git/useGitGraph.ts";
import {
	type GitFileEntry,
	type GitProjectStatus,
	useGitStatus,
} from "../../features/git/useGitStatus.ts";
import { isChatAgentKind } from "../../features/agents/agents.ts";
import {
	loadAppThemeId,
	mapAppThemeToTerminalTheme,
} from "../../lib/app-theme.ts";
import { readStoredValue, writeStoredValue } from "../../lib/stored-json.ts";
import {
	loadTerminalState,
	type TerminalGroupModel,
} from "../../features/terminal/terminal-utils.ts";
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
	const [scrollToChange, setScrollToChange] = useState(0);
	const [zenMode, setZenMode] = useState(loadZenMode);
	const [sidebarWidth, setSidebarWidth] = useState(280); // Default 17.5rem
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
	const {
		projectMap,
		refetch: refetchGit,
		applyOptimistic,
	} = useGitStatus(trackedDirs);
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
	const {
		commit,
		commitMessage,
		setCommitMessage,
		isCommitting,
		amendMode,
		setAmendMode,
		stageFile,
		unstageFile,
		stageAll,
		unstageAll,
	} = useGitChangeActions({
		cwd: session?.cwd,
		onRefresh: refresh,
		applyOptimistic,
		refetchStatus: refetchGit,
	});
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

	const handleAgentStatusChange = useCallback((id: string, status: string) => {
		setAgentStatuses((cur) => {
			if (cur.get(id) === status) return cur;
			return new Map(cur).set(id, status);
		});
	}, []);

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

	const renderViewer = () =>
		mainViewMode === "diff" ? (
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
					label={project ? "Select a changed file" : "No diff available"}
				/>
			)
		) : graphLoading ? (
			<div {...stylex.props(styles.centerFull)}>
				<p {...stylex.props(styles.placeholderText)}>Loading graph...</p>
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
		);

	const renderSidebar = (showCommitDetails: boolean) => (
		<div {...stylex.props(styles.sidebarShell)} style={{ width: sidebarWidth }}>
			<div
				{...stylex.props(styles.sidebarResize)}
				onMouseDown={handleSidebarDragStart}
			/>
			<ChangeFileSidebar
				cwd={session?.cwd}
				fileViewMode={fileViewMode}
				onFileViewModeChange={setFileViewMode}
				mainViewMode={showCommitDetails ? mainViewMode : "diff"}
				modified={modified}
				untracked={untracked}
				staged={staged}
				selectedFile={selectedFile}
				onSelectFile={(f) =>
					session?.cwd &&
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
				selectedCommitHash={showCommitDetails ? selectedCommitHash : null}
				commitDetailsLoading={showCommitDetails && commitDetailsLoading}
				commitDetails={showCommitDetails ? commitDetails : null}
				files={files}
				branch={project?.branch}
				commitMessage={commitMessage}
				onCommitMessageChange={setCommitMessage}
				onCommit={commit}
				isCommitting={isCommitting}
				amendMode={amendMode}
				onAmendModeChange={setAmendMode}
			/>
		</div>
	);

	const renderEmptyWorkspace = () => (
		<EditorWorkspace
			viewer={<Placeholder label="No diff available" />}
			sidebar={renderSidebar(false)}
		/>
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
					{renderEmptyWorkspace()}
				</div>
			) : zenMode ? (
				/* ===== ZEN MODE LAYOUT ===== */
				<EditorWorkspace
					zen
					leading={
						<EditorAgentChat
							session={session}
							chatRef={chatRef}
							onStatusChange={handleAgentStatusChange}
							composerOnly
							onExitComposerOnly={() => updateZenMode(false)}
						/>
					}
					viewer={renderViewer()}
					sidebar={renderSidebar(false)}
				/>
			) : (
				/* ===== NORMAL MODE LAYOUT ===== */
				<div {...stylex.props(styles.pageGrid)}>
					<section {...stylex.props(styles.leftPane)}>
						<EditorAgentChat
							session={session}
							chatRef={chatRef}
							onStatusChange={handleAgentStatusChange}
							onClose={closePane}
							sessions={sessions}
							onSelectSession={setSelectedPaneId}
						/>
					</section>

					<EditorWorkspace
						toolbar={
							<DiffViewerTopBar
								mainViewMode={mainViewMode}
								diffViewMode={diffViewMode}
								filePath={request?.file}
								onMainViewModeChange={setMainViewMode}
								onDiffViewModeChange={setDiffViewMode}
							/>
						}
						viewer={renderViewer()}
						sidebar={renderSidebar(true)}
					/>
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

function EditorWorkspace({
	leading,
	toolbar,
	viewer,
	sidebar,
	zen,
}: {
	leading?: ReactNode;
	toolbar?: ReactNode;
	viewer: ReactNode;
	sidebar: ReactNode;
	zen?: boolean;
}) {
	const body = (
		<>
			{leading}
			<div {...stylex.props(toolbar ? styles.viewerColumn : styles.viewerPane)}>
				{toolbar}
				{toolbar ? (
					<div {...stylex.props(styles.diffHost)}>{viewer}</div>
				) : (
					viewer
				)}
			</div>
			{sidebar}
		</>
	);

	return zen ? (
		<div {...stylex.props(styles.zenLayout)}>{body}</div>
	) : (
		<aside {...stylex.props(styles.rightPane)}>
			<div {...stylex.props(styles.splitBody)}>{body}</div>
		</aside>
	);
}

function EditorAgentChat({
	session,
	chatRef,
	onStatusChange,
	onClose,
	sessions,
	onSelectSession,
	composerOnly,
	onExitComposerOnly,
}: {
	session: Session;
	chatRef: React.RefObject<AgentChatHandle | null>;
	onStatusChange: (paneId: string, status: string) => void;
	onClose?: (paneId: string) => void;
	sessions?: Session[];
	onSelectSession?: (paneId: string) => void;
	composerOnly?: boolean;
	onExitComposerOnly?: () => void;
}) {
	return (
		<AgentChatView
			key={session.paneId}
			ref={chatRef}
			paneId={session.paneId}
			cwd={session.cwd}
			referencePaths={session.referencePaths}
			agentKind={session.agentKind}
			onStatusChange={onStatusChange}
			onClose={onClose}
			sessions={sessions}
			onSelectSession={onSelectSession}
			composerOnly={composerOnly}
			onExitComposerOnly={onExitComposerOnly}
		/>
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
