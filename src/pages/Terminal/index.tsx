import {
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";
import type { ClaudeChatHandle } from "../../components/chat/ClaudeChatView.tsx";
import { clearChatMessages } from "../../components/chat/ClaudeChatView.tsx";
import { ProjectFileGraphView } from "../../components/graph/ProjectFileGraphView.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { EmptyState } from "../../components/ui/EmptyState.tsx";
import { IconButton } from "../../components/ui/IconButton.tsx";
import {
	IconArrowLeft,
	IconCircle,
	IconExternalLink,
	IconGitBranch,
	IconGlobe,
	IconMessageCircle,
	IconX,
} from "../../components/ui/Icons.tsx";
import { useAgentSessions } from "../../hooks/useAgentSessions.ts";
import { useClaudeProcesses } from "../../hooks/useClaudeProcesses.ts";
import { useGitStatus } from "../../hooks/useGitStatus.ts";
import { useRunningPorts } from "../../hooks/useRunningPorts.ts";
import { isChatAgentKind } from "../../lib/agents.ts";
import { resolveServerUrl } from "../../lib/server-origin.ts";
import { wsClient } from "../../lib/websocket.ts";
import { ExperimentalPage } from "../ExperimentalPage/index.tsx";
import { AgentSidebar, CollapsedAgentBar } from "./AgentSidebar.tsx";
import { ClaudeProcessesSidebar } from "./ClaudeProcessesSidebar.tsx";
import { CollapsibleSidebarSection } from "./CollapsibleSidebarSection.tsx";
import { NewSessionButtons } from "./NewSessionButtons.tsx";
import { PopoutHeader } from "./PopoutHeader.tsx";
import { TerminalGrid } from "./TerminalGrid.tsx";
import { TerminalSettingsPanel } from "./TerminalSettingsPanel.tsx";

import "@xterm/xterm/css/xterm.css";

import { readStoredValue, writeStoredValue } from "../../lib/stored-json.ts";
import {
	type AgentKind,
	createGroupId,
	createTerminalPane,
	DEFAULT_COLUMNS,
	DEFAULT_FONT_FAMILY,
	DEFAULT_FONT_SIZE,
	DEFAULT_OPACITY,
	DEFAULT_ROWS,
	DEFAULT_THEME_ID,
	cacheTerminalState,
	getInitialGroups,
	getPaneTitle,
	getThemeById,
	loadTerminalState,
	migrateGroup,
	POPOUT_CHANNEL,
	saveTerminalState,
	type TerminalGroupModel,
	type ThemeId,
} from "../../lib/terminal-utils.ts";

type MainViewMode = "editor" | "chat" | "graph";

interface TerminalPageProps {
	isPopout?: boolean;
	isStandalone?: boolean;
}

function wasPopoutRestored(): boolean {
	try {
		return sessionStorage.getItem("inferay-popout-restored") === "true";
	} catch {
		return false;
	}
}

function markPopoutRestored() {
	try {
		sessionStorage.setItem("inferay-popout-restored", "true");
	} catch {}
}

const logoUrl = resolveServerUrl("/logo.png");

function TerminalEmptyStateBrand() {
	return (
		<div className="rounded-2xl border border-inferay-border bg-inferay-surface p-4 shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
			<img src={logoUrl} alt="inferay logo" className="h-14 w-14 rounded-xl" />
		</div>
	);
}

function GraphEmptyState({ message }: { message: string }) {
	return (
		<div className="flex h-full items-center justify-center p-6">
			<div className="max-w-sm text-center">
				<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-inferay-border bg-inferay-surface text-inferay-text-3">
					<IconGitBranch size={18} />
				</div>
				<p className="text-sm text-inferay-text">{message}</p>
			</div>
		</div>
	);
}

type GroupAction =
	| {
			type: "addPane";
			groupId: string;
			agentKind: AgentKind;
			cwd?: string;
			pendingCwd?: boolean;
	  }
	| { type: "removePane"; groupId: string; paneId: string; force?: boolean }
	| { type: "selectPane"; groupId: string; paneId: string }
	| {
			type: "directorySelected";
			groupId: string;
			paneId: string;
			path: string | null;
	  }
	| { type: "setColumns"; groupId: string; columns: number }
	| { type: "setRows"; groupId: string; rows: number }
	| { type: "addGroup"; group: TerminalGroupModel }
	| { type: "removeGroup"; groupId: string }
	| { type: "renameGroup"; groupId: string; name: string }
	| {
			type: "reorderPanes";
			groupId: string;
			fromIndex: number;
			toIndex: number;
	  }
	| { type: "replaceAll"; groups: TerminalGroupModel[] };

function groupsReducer(
	state: TerminalGroupModel[],
	action: GroupAction
): TerminalGroupModel[] {
	switch (action.type) {
		case "addPane": {
			const pane = createTerminalPane(
				action.agentKind,
				action.cwd,
				action.pendingCwd
			);
			return state.map((g) => {
				if (g.id !== action.groupId) return g;
				return { ...g, panes: [...g.panes, pane], selectedPaneId: pane.id };
			});
		}
		case "removePane": {
			return state.map((g) => {
				if (g.id !== action.groupId) return g;
				const panes = g.panes.filter((p) => p.id !== action.paneId);
				return {
					...g,
					panes,
					selectedPaneId:
						g.selectedPaneId === action.paneId
							? (panes[0]?.id ?? null)
							: g.selectedPaneId,
				};
			});
		}
		case "selectPane":
			return state.map((g) =>
				g.id === action.groupId ? { ...g, selectedPaneId: action.paneId } : g
			);
		case "directorySelected":
			return state.map((g) =>
				g.id === action.groupId
					? {
							...g,
							panes: g.panes.map((p) =>
								p.id === action.paneId
									? {
											...p,
											cwd: action.path ?? undefined,
											pendingCwd: false,
											title: getPaneTitle(
												p.agentKind,
												action.path ?? undefined
											),
										}
									: p
							),
						}
					: g
			);
		case "setColumns":
			return state.map((g) =>
				g.id === action.groupId ? { ...g, columns: action.columns } : g
			);
		case "setRows":
			return state.map((g) =>
				g.id === action.groupId ? { ...g, rows: action.rows } : g
			);
		case "addGroup":
			return [...state, action.group];
		case "removeGroup":
			return state.filter((g) => g.id !== action.groupId);
		case "renameGroup":
			return state.map((g) =>
				g.id === action.groupId ? { ...g, name: action.name } : g
			);
		case "reorderPanes":
			return state.map((g) => {
				if (g.id !== action.groupId) return g;
				const panes = [...g.panes];
				const [moved] = panes.splice(action.fromIndex, 1);
				if (moved) panes.splice(action.toIndex, 0, moved);
				return { ...g, panes };
			});
		case "replaceAll":
			return action.groups;
	}
}

export function TerminalPage({
	isPopout = false,
	isStandalone = false,
}: TerminalPageProps) {
	useEffect(() => {
		wsClient.connect();
	}, []);
	const [compactMode, setCompactMode] = useState(false);
	const [layoutMode, setLayoutMode] = useState<"grid" | "rows">(() =>
		readStoredValue("terminal-layout-mode") === "grid" ? "grid" : "rows"
	);
	const [mainView, setMainView] = useState<MainViewMode>(() => {
		const stored = readStoredValue("terminal-main-view");
		return stored === "chat" || stored === "graph" ? stored : "editor";
	});
	useEffect(() => {
		writeStoredValue("terminal-layout-mode", layoutMode);
	}, [layoutMode]);
	useEffect(() => {
		writeStoredValue("terminal-main-view", mainView);
	}, [mainView]);
	const initialState = useMemo(() => loadTerminalState(), []);
	const initGroups = useMemo(() => getInitialGroups(), []);
	const [groups, groupsDispatch] = useReducer(groupsReducer, initGroups);
	const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
		() => initialState?.selectedGroupId ?? initGroups[0]?.id ?? null
	);
	const [isPoppedOut, setIsPoppedOut] = useState(false);
	const [showSettings, setShowSettings] = useState(false);
	const [appearance, setAppearance] = useState(() => ({
		themeId: (initialState?.themeId ?? DEFAULT_THEME_ID) as ThemeId,
		fontSize: initialState?.fontSize ?? DEFAULT_FONT_SIZE,
		fontFamily: initialState?.fontFamily ?? DEFAULT_FONT_FAMILY,
		opacity: initialState?.opacity ?? DEFAULT_OPACITY,
	}));
	const { themeId, fontSize, fontFamily, opacity } = appearance;
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [sidebarSections, setSidebarSections] = useState({
		ports: true,
		agentSessions: true,
		claudeProcesses: true,
		git: true,
	});
	const toggleSection = useCallback(
		(key: keyof typeof sidebarSections) =>
			setSidebarSections((prev) => ({ ...prev, [key]: !prev[key] })),
		[]
	);
	const popoutWindowRef = useRef<Window | null>(null);
	const broadcastChannel = useRef<BroadcastChannel | null>(null);
	const chatRefs = useRef<Map<string, ClaudeChatHandle>>(new Map());
	const [agentStatuses, setAgentStatuses] = useState<Map<string, string>>(
		new Map()
	);
	const { ports: runningPorts, killPort, openInBrowser } = useRunningPorts();
	useAgentSessions();
	const {
		processes: claudeProcesses,
		killProcess: killClaudeProcess,
		killAll: killAllClaudeProcesses,
	} = useClaudeProcesses();
	const theme = useMemo(() => getThemeById(themeId), [themeId]);
	const currentGroup = useMemo(
		() => groups.find((g) => g.id === selectedGroupId),
		[groups, selectedGroupId]
	);
	const chatPanes = useMemo(
		() =>
			currentGroup?.panes.filter((pane) => isChatAgentKind(pane.agentKind)) ??
			[],
		[currentGroup]
	);
	const selectedChatPane = useMemo(() => {
		if (!currentGroup) return null;
		const selectedPane = currentGroup.panes.find(
			(pane) => pane.id === currentGroup.selectedPaneId
		);
		if (selectedPane && isChatAgentKind(selectedPane.agentKind)) {
			return selectedPane;
		}
		return chatPanes[0] ?? null;
	}, [chatPanes, currentGroup]);
	const graphCwds = useMemo(
		() =>
			Array.from(
				new Set(
					(currentGroup?.panes ?? [])
						.map((pane) => pane.cwd)
						.filter((cwd): cwd is string => Boolean(cwd))
				)
			),
		[currentGroup]
	);
	const [activeGraphCwd, setActiveGraphCwd] = useState<string | null>(null);
	useEffect(() => {
		const selectedPaneCwd =
			currentGroup?.panes.find(
				(pane) => pane.id === currentGroup.selectedPaneId
			)?.cwd ?? null;
		if (selectedPaneCwd && graphCwds.includes(selectedPaneCwd)) {
			setActiveGraphCwd(selectedPaneCwd);
			return;
		}
		setActiveGraphCwd((current) =>
			current && graphCwds.includes(current) ? current : (graphCwds[0] ?? null)
		);
	}, [currentGroup, graphCwds]);
	const { projectMap } = useGitStatus(graphCwds);
	const activeGraphProject = activeGraphCwd
		? (projectMap.get(activeGraphCwd) ?? null)
		: null;
	const restoreSavedState = useCallback(
		(s: ReturnType<typeof loadTerminalState>) => {
			setIsPoppedOut(false);
			if (!s) return;
			groupsDispatch({
				type: "replaceAll",
				groups: s.groups.map(migrateGroup),
			});
			setSelectedGroupId(s.selectedGroupId);
			setAppearance({
				themeId: s.themeId,
				fontSize: s.fontSize,
				fontFamily: s.fontFamily,
				opacity: s.opacity,
			});
		},
		[]
	);
	const cleanupPane = useCallback((paneId: string) => {
		wsClient.send({ type: "terminal:destroy", paneId });
		chatRefs.current.delete(paneId);
		clearChatMessages(paneId);
	}, []);
	const withSelectedGroup = useCallback(
		(fn: (groupId: string) => void) => {
			if (selectedGroupId) fn(selectedGroupId);
		},
		[selectedGroupId]
	);
	const handleRestore = useCallback(() => {
		if (isPopout) {
			markPopoutRestored();
			broadcastChannel.current?.postMessage({ type: "popout-restored" });
			try {
				window.close();
			} catch {}
			return;
		}
		popoutWindowRef.current = null;
		restoreSavedState(loadTerminalState());
		broadcastChannel.current?.postMessage({ type: "request-restore" });
	}, [isPopout, restoreSavedState]);
	useEffect(() => {
		if (isStandalone) return;
		if (isPopout) {
			if (wasPopoutRestored()) return;
			broadcastChannel.current = new BroadcastChannel(POPOUT_CHANNEL);
			broadcastChannel.current.postMessage({ type: "popout-opened" });
			const handleMessage = (event: MessageEvent) => {
				if (event.data.type === "request-restore") {
					handleRestore();
				} else if (event.data.type === "popout-ping") {
					if (!wasPopoutRestored()) {
						broadcastChannel.current?.postMessage({ type: "popout-pong" });
					}
				}
			};
			broadcastChannel.current.onmessage = handleMessage;
			const handleUnload = () => {
				broadcastChannel.current?.postMessage({ type: "popout-closed" });
			};
			window.addEventListener("beforeunload", handleUnload);
			return () => {
				window.removeEventListener("beforeunload", handleUnload);
				broadcastChannel.current?.close();
			};
		} else {
			const bc = new BroadcastChannel(POPOUT_CHANNEL);
			broadcastChannel.current = bc;
			let staleTimeout: ReturnType<typeof setTimeout> | null = null;
			const handleMessage = (event: MessageEvent) => {
				const { type } = event.data;
				if (type === "popout-opened" || type === "popout-pong") {
					if (staleTimeout) {
						clearTimeout(staleTimeout);
						staleTimeout = null;
					}
					setIsPoppedOut(true);
				} else if (type === "popout-closed" || type === "popout-restored") {
					popoutWindowRef.current = null;
					restoreSavedState(loadTerminalState());
				}
			};
			bc.addEventListener("message", handleMessage);
			bc.postMessage({ type: "popout-ping" });
			staleTimeout = setTimeout(() => {
				staleTimeout = null;
			}, 1500);
			return () => {
				if (staleTimeout) clearTimeout(staleTimeout);
				bc.removeEventListener("message", handleMessage);
				bc.close();
			};
		}
	}, [handleRestore, isPopout, isStandalone, restoreSavedState]);
	const latestStateRef = useRef({
		groups,
		selectedGroupId,
		themeId,
		fontSize,
		fontFamily,
		opacity,
	});
	const pendingSaveRef = useRef(false);
	useEffect(() => {
		latestStateRef.current = {
			groups,
			selectedGroupId,
			themeId,
			fontSize,
			fontFamily,
			opacity,
		};
		cacheTerminalState(latestStateRef.current);
	}, [groups, selectedGroupId, themeId, fontSize, fontFamily, opacity]);
	useEffect(() => {
		pendingSaveRef.current = true;
		const id = setTimeout(() => {
			saveTerminalState(latestStateRef.current);
			pendingSaveRef.current = false;
			window.dispatchEvent(new Event("terminal-shell-change"));
		}, 100);
		return () => clearTimeout(id);
	});
	useEffect(
		() => () => {
			saveTerminalState(latestStateRef.current);
		},
		[]
	);
	useEffect(() => {
		const handleShellChange = () => {
			// Skip restore check if we have a pending save - this prevents undoing local changes
			if (pendingSaveRef.current) {
				return;
			}
			const savedState = loadTerminalState();
			if (savedState) {
				const savedShellKey = JSON.stringify({
					selectedGroupId: savedState.selectedGroupId,
					groups: savedState.groups.map((group) => ({
						id: group.id,
						name: group.name,
						selectedPaneId: group.selectedPaneId,
						columns: group.columns,
						rows: group.rows,
						panes: group.panes.map((pane) => ({
							id: pane.id,
							agentKind: pane.agentKind,
							cwd: pane.cwd ?? null,
							pendingCwd: pane.pendingCwd ?? false,
							title: pane.title,
						})),
					})),
				});
				const currentShellKey = JSON.stringify({
					selectedGroupId,
					groups: groups.map((group) => ({
						id: group.id,
						name: group.name,
						selectedPaneId: group.selectedPaneId,
						columns: group.columns,
						rows: group.rows,
						panes: group.panes.map((pane) => ({
							id: pane.id,
							agentKind: pane.agentKind,
							cwd: pane.cwd ?? null,
							pendingCwd: pane.pendingCwd ?? false,
							title: pane.title,
						})),
					})),
				});
				if (savedShellKey !== currentShellKey) {
					restoreSavedState(savedState);
				}
			}
			const storedView = readStoredValue("terminal-main-view");
			const nextMainView =
				storedView === "chat" || storedView === "graph" ? storedView : "editor";
			if (nextMainView !== mainView) {
				setMainView(nextMainView);
			}
			const nextLayoutMode =
				readStoredValue("terminal-layout-mode") === "grid" ? "grid" : "rows";
			setLayoutMode(nextLayoutMode);
		};
		window.addEventListener("terminal-shell-change", handleShellChange);
		return () =>
			window.removeEventListener("terminal-shell-change", handleShellChange);
	}, [groups, mainView, restoreSavedState, selectedGroupId]);
	useEffect(() => {
		const handleThemeOpen = () => {
			setShowSettings(true);
		};
		window.addEventListener("terminal-open-theme-panel", handleThemeOpen);
		return () =>
			window.removeEventListener("terminal-open-theme-panel", handleThemeOpen);
	}, []);
	const handleAgentStatusChange = useCallback(
		(paneId: string, status: string) => {
			setAgentStatuses((prev) => {
				if (prev.get(paneId) === status) return prev;
				return new Map(prev).set(paneId, status);
			});
		},
		[]
	);
	const handleAddPane = useCallback(
		(agentKind: AgentKind) =>
			withSelectedGroup((groupId) =>
				groupsDispatch({
					type: "addPane",
					groupId,
					agentKind,
					pendingCwd: true,
				})
			),
		[withSelectedGroup]
	);
	const removePane = useCallback(
		(paneId: string, force?: boolean) =>
			withSelectedGroup((groupId) => {
				cleanupPane(paneId);
				groupsDispatch({ type: "removePane", groupId, paneId, force });
			}),
		[cleanupPane, withSelectedGroup]
	);
	const reorderPanes = useCallback(
		(fromIndex: number, toIndex: number) =>
			withSelectedGroup((groupId) =>
				groupsDispatch({ type: "reorderPanes", groupId, fromIndex, toIndex })
			),
		[withSelectedGroup]
	);
	const handleDirectorySelected = useCallback(
		(paneId: string, path: string | null) =>
			withSelectedGroup((groupId) =>
				groupsDispatch({ type: "directorySelected", groupId, paneId, path })
			),
		[withSelectedGroup]
	);
	const selectPane = useCallback(
		(paneId: string) =>
			withSelectedGroup((groupId) =>
				groupsDispatch({ type: "selectPane", groupId, paneId })
			),
		[withSelectedGroup]
	);
	const addGroup = useCallback(
		(name: string) => {
			const pane = createTerminalPane("terminal");
			const group: TerminalGroupModel = {
				id: createGroupId(),
				name: name || `Group ${groups.length + 1}`,
				panes: [pane],
				selectedPaneId: pane.id,
				columns: DEFAULT_COLUMNS,
				rows: DEFAULT_ROWS,
			};
			groupsDispatch({ type: "addGroup", group });
			setSelectedGroupId(group.id);
		},
		[groups.length]
	);
	const setGroupColumns = useCallback(
		(columns: number) =>
			withSelectedGroup((groupId) =>
				groupsDispatch({ type: "setColumns", groupId, columns })
			),
		[withSelectedGroup]
	);
	const removeGroup = useCallback(
		(groupId: string) => {
			if (groups.length <= 1) return;
			const group = groups.find((g) => g.id === groupId);
			if (group) {
				for (const p of group.panes) cleanupPane(p.id);
			}
			groupsDispatch({ type: "removeGroup", groupId });
			if (selectedGroupId === groupId)
				setSelectedGroupId(groups.find((g) => g.id !== groupId)?.id ?? null);
		},
		[groups, selectedGroupId, cleanupPane]
	);
	const renameGroup = useCallback((groupId: string, name: string) => {
		if (!name.trim()) return;
		groupsDispatch({ type: "renameGroup", groupId, name });
	}, []);
	const handleChatRef = useCallback(
		(paneId: string, handle: ClaudeChatHandle | null) => {
			if (handle) chatRefs.current.set(paneId, handle);
			else chatRefs.current.delete(paneId);
		},
		[]
	);
	const editorViewKey = useMemo(
		() =>
			groups
				.map(
					(group) =>
						`${group.id}:${group.selectedPaneId ?? "none"}:${group.panes
							.map((pane) => `${pane.id}:${pane.cwd ?? ""}`)
							.join(",")}`
				)
				.join("|"),
		[groups]
	);
	if (isPopout || (isStandalone && compactMode)) {
		return (
			<div className="flex h-screen flex-col bg-inferay-bg">
				<PopoutHeader
					groups={groups}
					currentGroup={currentGroup}
					selectedGroupId={selectedGroupId}
					columns={currentGroup?.columns ?? DEFAULT_COLUMNS}
					agentStatuses={agentStatuses}
					onRestore={isStandalone ? () => setCompactMode(false) : handleRestore}
					onSelectGroup={setSelectedGroupId}
					onAddGroup={addGroup}
					onRenameGroup={renameGroup}
					onRemoveGroup={removeGroup}
					onSelectPane={selectPane}
					onRemovePane={removePane}
					onAddPane={handleAddPane}
					onColumnsChange={setGroupColumns}
					ports={runningPorts}
					onKillPort={killPort}
					onOpenInBrowser={openInBrowser}
				/>
				<div className="flex-1 overflow-y-auto">
					{!currentGroup || currentGroup.panes.length === 0 ? (
						<div className="flex h-full items-center justify-center">
							<div className="flex w-full max-w-sm flex-col items-center gap-4 px-6 text-center">
								<TerminalEmptyStateBrand />
								<div>
									<p className="text-sm text-inferay-text-2">
										Start a new terminal or agent session
									</p>
								</div>
								<NewSessionButtons
									labelPrefix="New"
									layout="column"
									onAddPane={handleAddPane}
								/>
							</div>
						</div>
					) : (
						<TerminalGrid
							panes={currentGroup.panes}
							selectedPaneId={currentGroup.selectedPaneId}
							columns={currentGroup.columns}
							rows={currentGroup.rows ?? DEFAULT_ROWS}
							layoutMode="grid"
							theme={theme}
							fontSize={fontSize}
							fontFamily={fontFamily}
							onSelectPane={selectPane}
							onClosePane={removePane}
							onDirectorySelect={handleDirectorySelected}
							onDirectoryCancel={removePane}
							onChatRef={handleChatRef}
							onAgentStatusChange={handleAgentStatusChange}
							onReorderPanes={reorderPanes}
						/>
					)}
				</div>
			</div>
		);
	}
	if (isPoppedOut) {
		return (
			<div className="flex h-full flex-col bg-inferay-bg">
				<div className="relative h-12 shrink-0 border-b border-inferay-border bg-inferay-bg"></div>
				<div className="flex flex-1 items-center justify-center">
					<div className="text-center">
						<div className="mb-4 flex items-center justify-center">
							<div className="rounded-full bg-inferay-surface p-4">
								<IconExternalLink size={32} className="text-inferay-accent" />
							</div>
						</div>
						<h2 className="text-lg font-medium text-inferay-text mb-2">
							Terminal in Separate Window
						</h2>
						<p className="text-sm text-inferay-text-3 mb-4">
							The terminal is currently open in a pop-out window.
						</p>
						<Button variant="primary" onClick={handleRestore}>
							<IconArrowLeft size={14} className="mr-1.5" />
							Restore Here
						</Button>
					</div>
				</div>
			</div>
		);
	}
	return (
		<div
			className={`flex flex-col bg-inferay-bg ${isStandalone ? "h-screen" : "h-full"}`}
		>
			<div className="relative flex flex-1 flex-col overflow-hidden">
				<div className="flex flex-1 flex-col overflow-hidden">
					{false &&
						mainView === "editor" &&
						!sidebarOpen &&
						currentGroup &&
						currentGroup.panes.length > 0 && (
							<CollapsedAgentBar
								panes={currentGroup.panes}
								selectedPaneId={currentGroup.selectedPaneId}
								agentStatuses={agentStatuses}
								onSelectPane={selectPane}
								onExpand={() => setSidebarOpen((v) => !v)}
							/>
						)}
					<div className="flex flex-1 overflow-hidden">
						<div
							className={`relative flex-1 flex flex-col ${mainView === "editor" && layoutMode === "rows" ? "overflow-hidden" : "overflow-y-auto overscroll-none"}`}
						>
							{!currentGroup || currentGroup.panes.length === 0 ? (
								<EmptyState
									icon={<TerminalEmptyStateBrand />}
									title="No Sessions"
									description="Start a new terminal or agent session"
									action={
										<NewSessionButtons
											labelPrefix="New"
											layout="column"
											onAddPane={handleAddPane}
										/>
									}
								/>
							) : mainView === "editor" ? (
								<ExperimentalPage key={editorViewKey} />
							) : mainView === "chat" ? (
								!currentGroup || currentGroup.panes.length === 0 ? (
									<EmptyState
										icon={
											<IconMessageCircle
												size={18}
												className="text-inferay-text-3"
											/>
										}
										title="No Panes"
										description="Add a terminal or agent session to get started"
										action={
											<NewSessionButtons
												labelPrefix="New"
												layout="row"
												onAddPane={handleAddPane}
											/>
										}
									/>
								) : (
									<TerminalGrid
										panes={currentGroup.panes}
										selectedPaneId={currentGroup.selectedPaneId}
										columns={currentGroup.columns}
										rows={currentGroup.rows ?? DEFAULT_ROWS}
										layoutMode={layoutMode}
										theme={theme}
										fontSize={fontSize}
										fontFamily={fontFamily}
										onSelectPane={selectPane}
										onClosePane={removePane}
										onDirectorySelect={handleDirectorySelected}
										onDirectoryCancel={removePane}
										onChatRef={handleChatRef}
										onAgentStatusChange={handleAgentStatusChange}
										onReorderPanes={reorderPanes}
									/>
								)
							) : mainView === "graph" ? (
								graphCwds.length === 0 ? (
									<GraphEmptyState message="Open a project directory in one of this group's panes to populate the file graph." />
								) : (
									<ProjectFileGraphView
										cwds={graphCwds}
										activeCwd={activeGraphCwd}
										onSelectCwd={setActiveGraphCwd}
										project={activeGraphProject}
									/>
								)
							) : (
								<TerminalGrid
									panes={currentGroup.panes}
									selectedPaneId={currentGroup.selectedPaneId}
									columns={currentGroup.columns}
									rows={currentGroup.rows ?? DEFAULT_ROWS}
									layoutMode={layoutMode}
									theme={theme}
									fontSize={fontSize}
									fontFamily={fontFamily}
									onSelectPane={selectPane}
									onClosePane={removePane}
									onDirectorySelect={handleDirectorySelected}
									onDirectoryCancel={removePane}
									onChatRef={handleChatRef}
									onAgentStatusChange={handleAgentStatusChange}
									onReorderPanes={reorderPanes}
								/>
							)}
							{showSettings && (
								<TerminalSettingsPanel
									themeId={themeId}
									fontSize={fontSize}
									fontFamily={fontFamily}
									opacity={opacity}
									onThemeChange={(v: ThemeId) =>
										setAppearance((prev) => ({ ...prev, themeId: v }))
									}
									onFontSizeChange={(v: number) =>
										setAppearance((prev) => ({ ...prev, fontSize: v }))
									}
									onFontFamilyChange={(v: string) =>
										setAppearance((prev) => ({ ...prev, fontFamily: v }))
									}
									onOpacityChange={(v: number) =>
										setAppearance((prev) => ({ ...prev, opacity: v }))
									}
									onClose={() => setShowSettings(false)}
								/>
							)}
						</div>
						{false &&
							mainView === "editor" &&
							sidebarOpen &&
							currentGroup &&
							currentGroup.panes.length > 0 && (
								<div className="flex flex-col shrink-0 border-l border-inferay-border bg-inferay-bg order-last">
									<AgentSidebar
										panes={currentGroup.panes}
										selectedPaneId={currentGroup.selectedPaneId}
										agentStatuses={agentStatuses}
										onSelectPane={selectPane}
										onRemovePane={removePane}
										onCollapse={() => setSidebarOpen((v) => !v)}
									/>
									<CollapsibleSidebarSection
										icon={<IconGlobe size={12} />}
										label="Ports"
										count={runningPorts.length}
										countColor="text-inferay-accent"
										expanded={sidebarSections.ports}
										onToggle={() => toggleSection("ports")}
										emptyMessage="No ports running"
									>
										{runningPorts.map((p) => (
											<div
												key={`${p.port}-${p.pid}`}
												className="group mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-inferay-surface"
											>
												<div className="shrink-0">
													<IconCircle
														size={8}
														className="fill-inferay-accent text-inferay-accent"
													/>
												</div>
												<div className="min-w-0 flex-1">
													<p
														className="truncate text-[11px] font-medium text-inferay-text"
														title={p.command}
													>
														:{p.port}
													</p>
													<p
														className="truncate text-[9px] text-inferay-text-3"
														title={p.command}
													>
														{p.name}
													</p>
												</div>
												<div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
													<IconButton
														variant="ghost"
														size="xs"
														onClick={() => openInBrowser(p.port)}
														title="Open in browser"
													>
														<IconExternalLink size={10} />
													</IconButton>
													<IconButton
														variant="danger"
														size="xs"
														onClick={() => killPort(p.pid)}
														title="Kill process"
													>
														<IconX size={10} />
													</IconButton>
												</div>
											</div>
										))}
									</CollapsibleSidebarSection>
									<ClaudeProcessesSidebar
										processes={claudeProcesses}
										onKillProcess={killClaudeProcess}
										onKillAll={killAllClaudeProcesses}
										expanded={sidebarSections.claudeProcesses}
										onToggle={() => toggleSection("claudeProcesses")}
									/>
								</div>
							)}
					</div>
				</div>
			</div>
		</div>
	);
}
