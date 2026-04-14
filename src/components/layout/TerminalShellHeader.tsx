import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getAgentIcon } from "../../lib/agent-ui.tsx";
import { getAgentDefinition, NEW_PANE_AGENT_KINDS } from "../../lib/agents.ts";
import { readStoredValue, writeStoredValue } from "../../lib/stored-json.ts";
import {
	createGroupId,
	createTerminalPane,
	DEFAULT_COLUMNS,
	DEFAULT_ROWS,
	loadTerminalState,
	saveTerminalState,
} from "../../lib/terminal-utils.ts";
import { DropdownButton } from "../ui/DropdownButton.tsx";
import {
	IconChevronDown,
	IconCode,
	IconCollapse,
	IconExpand,
	IconGitBranch,
	IconLayoutGrid,
	IconLayoutRows,
	IconMessageCircle,
	IconPlus,
	IconTrash,
} from "../ui/Icons.tsx";

type MainViewMode = "editor" | "chat" | "graph";

function loadShellState() {
	const terminalState = loadTerminalState();
	const mainView = readStoredValue("terminal-main-view");

	return {
		groups: terminalState?.groups ?? [],
		selectedGroupId:
			terminalState?.selectedGroupId ?? terminalState?.groups[0]?.id ?? null,
		mainView: mainView === "chat" || mainView === "graph" ? mainView : "editor",
		editorZenMode: readStoredValue("terminal-editor-zen") === "true",
	};
}

function ViewTab({
	active,
	icon,
	label,
	onClick,
}: {
	active: boolean;
	icon: ReactNode;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
				active
					? "border-inferay-border bg-inferay-surface-2 text-inferay-text"
					: "border-transparent text-inferay-text-3 hover:bg-inferay-surface hover:text-inferay-text-2"
			}`}
		>
			{icon}
			<span>{label}</span>
		</button>
	);
}

export function TerminalShellHeader() {
	const location = useLocation();
	const navigate = useNavigate();
	const [shellState, setShellState] = useState(loadShellState);
	const [showNewMenu, setShowNewMenu] = useState(false);
	const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
	const newMenuRef = useRef<HTMLDivElement>(null);
	const workspaceMenuRef = useRef<HTMLDivElement>(null);
	const [layoutMode, setLayoutMode] = useState<"grid" | "rows">(() =>
		readStoredValue("terminal-layout-mode") === "grid" ? "grid" : "rows"
	);

	const refreshShellState = useCallback(() => {
		setShellState(loadShellState());
	}, []);

	useEffect(() => {
		window.addEventListener("terminal-shell-change", refreshShellState);
		return () =>
			window.removeEventListener("terminal-shell-change", refreshShellState);
	}, [refreshShellState]);

	useEffect(() => {
		const handleShellChange = () => {
			setLayoutMode(
				readStoredValue("terminal-layout-mode") === "grid" ? "grid" : "rows"
			);
		};
		window.addEventListener("terminal-shell-change", handleShellChange);
		return () =>
			window.removeEventListener("terminal-shell-change", handleShellChange);
	}, []);

	useEffect(() => {
		if (!showNewMenu) return;
		const handleClick = (event: MouseEvent) => {
			if (
				newMenuRef.current &&
				!newMenuRef.current.contains(event.target as Node)
			) {
				setShowNewMenu(false);
			}
		};
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [showNewMenu]);

	useEffect(() => {
		if (!showWorkspaceMenu) return;
		const handleClick = (event: MouseEvent) => {
			if (
				workspaceMenuRef.current &&
				!workspaceMenuRef.current.contains(event.target as Node)
			) {
				setShowWorkspaceMenu(false);
			}
		};
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [showWorkspaceMenu]);

	const updateSelectedGroup = useCallback((groupId: string) => {
		const terminalState = loadTerminalState();
		if (!terminalState) return;
		saveTerminalState({ ...terminalState, selectedGroupId: groupId as never });
		window.dispatchEvent(new Event("terminal-shell-change"));
	}, []);

	const updateMainView = useCallback(
		(view: MainViewMode) => {
			writeStoredValue("terminal-main-view", view);
			window.dispatchEvent(new Event("terminal-shell-change"));
			navigate("/terminal");
		},
		[navigate]
	);

	const addGroup = useCallback(
		(name: string) => {
			const terminalState = loadTerminalState();
			if (!terminalState) return;
			const pane = createTerminalPane("terminal");
			const group = {
				id: createGroupId(),
				name: name || `Group ${terminalState.groups.length + 1}`,
				panes: [pane],
				selectedPaneId: pane.id,
				columns: DEFAULT_COLUMNS,
				rows: DEFAULT_ROWS,
			};
			saveTerminalState({
				...terminalState,
				groups: [...terminalState.groups, group],
				selectedGroupId: group.id,
			});
			window.dispatchEvent(new Event("terminal-shell-change"));
			navigate("/terminal");
		},
		[navigate]
	);

	const removeGroup = useCallback((groupId: string) => {
		const terminalState = loadTerminalState();
		if (!terminalState) return;
		if (terminalState.groups.length <= 1) return; // Keep at least one group
		const filteredGroups = terminalState.groups.filter((g) => g.id !== groupId);
		const newSelectedGroupId =
			terminalState.selectedGroupId === groupId
				? (filteredGroups[0]?.id ?? null)
				: terminalState.selectedGroupId;
		saveTerminalState({
			...terminalState,
			groups: filteredGroups,
			selectedGroupId: newSelectedGroupId,
		});
		window.dispatchEvent(new Event("terminal-shell-change"));
	}, []);

	const addPaneToSelectedGroup = useCallback(
		(agentKind: (typeof NEW_PANE_AGENT_KINDS)[number]) => {
			const terminalState = loadTerminalState();
			if (!terminalState) return;
			const selectedGroupId =
				terminalState.selectedGroupId ?? terminalState.groups[0]?.id;
			if (!selectedGroupId) return;
			const pane = createTerminalPane(agentKind, undefined, true);
			saveTerminalState({
				...terminalState,
				groups: terminalState.groups.map((group) =>
					group.id === selectedGroupId
						? {
								...group,
								panes: [...group.panes, pane],
								selectedPaneId: pane.id,
							}
						: group
				),
			});
			window.dispatchEvent(new Event("terminal-shell-change"));
			setShowNewMenu(false);
			navigate("/terminal");
		},
		[navigate]
	);

	const selectedGroup =
		shellState.groups.find(
			(group) => group.id === shellState.selectedGroupId
		) ?? null;

	const updateLayoutMode = useCallback((mode: "grid" | "rows") => {
		writeStoredValue("terminal-layout-mode", mode);
		setLayoutMode(mode);
		window.dispatchEvent(new Event("terminal-shell-change"));
	}, []);

	const updateSelectedGroupGrid = useCallback(
		(patch: { columns?: number; rows?: number }) => {
			const terminalState = loadTerminalState();
			if (!terminalState?.selectedGroupId) return;
			saveTerminalState({
				...terminalState,
				groups: terminalState.groups.map((group) =>
					group.id === terminalState.selectedGroupId
						? {
								...group,
								columns: patch.columns ?? group.columns,
								rows: patch.rows ?? group.rows,
							}
						: group
				),
			});
			window.dispatchEvent(new Event("terminal-shell-change"));
		},
		[]
	);

	const updateEditorZenMode = useCallback((next: boolean) => {
		writeStoredValue("terminal-editor-zen", next ? "true" : "false");
		window.dispatchEvent(new Event("terminal-shell-change"));
	}, []);

	return (
		<div className="flex h-12 shrink-0 items-center gap-3 border-b border-inferay-border bg-inferay-bg px-3">
			<div className="flex items-center gap-1 shrink-0">
				<ViewTab
					active={shellState.mainView === "editor"}
					icon={<IconCode size={12} />}
					label="Editor"
					onClick={() => updateMainView("editor")}
				/>
				<ViewTab
					active={shellState.mainView === "chat"}
					icon={<IconMessageCircle size={12} />}
					label="Chat"
					onClick={() => updateMainView("chat")}
				/>
				<ViewTab
					active={shellState.mainView === "graph"}
					icon={<IconGitBranch size={12} />}
					label="Graph"
					onClick={() => updateMainView("graph")}
				/>
			</div>
			{location.pathname === "/terminal" && (
				<>
					<div className="flex-1 min-w-0" />
					<div className="relative shrink-0" ref={workspaceMenuRef}>
						<button
							type="button"
							onClick={() => setShowWorkspaceMenu((v) => !v)}
							className="flex h-7 items-center gap-1.5 rounded-lg border border-inferay-border bg-inferay-surface px-2.5 text-xs font-medium text-inferay-text-2 transition-colors hover:bg-inferay-surface-2"
						>
							<span>{selectedGroup?.name ?? "Workspace"}</span>
							<span className="text-[9px] text-inferay-text-3">
								{selectedGroup?.panes.length ?? 0}
							</span>
							<IconChevronDown
								size={10}
								className={`transition-transform ${showWorkspaceMenu ? "rotate-180" : ""}`}
							/>
						</button>
						{showWorkspaceMenu && (
							<div className="absolute right-0 top-full z-50 mt-1 min-w-[200px] overflow-hidden rounded-lg border border-inferay-border bg-inferay-surface shadow-lg">
								<div className="max-h-[300px] overflow-y-auto">
									{shellState.groups.map((group) => {
										const active = group.id === shellState.selectedGroupId;
										const canDelete = shellState.groups.length > 1;
										return (
											<div
												key={group.id}
												className={`group flex items-center justify-between px-3 py-2 text-xs transition-colors ${
													active
														? "bg-inferay-surface-2 text-inferay-text"
														: "text-inferay-text-2 hover:bg-inferay-surface-2"
												}`}
											>
												<button
													type="button"
													onClick={() => {
														updateSelectedGroup(group.id);
														setShowWorkspaceMenu(false);
													}}
													className="flex items-center gap-2 flex-1 min-w-0"
												>
													<span className="truncate">{group.name}</span>
													<span className="text-[9px] text-inferay-text-3">
														{group.panes.length}
													</span>
												</button>
												{canDelete && (
													<button
														type="button"
														onClick={(e) => {
															e.stopPropagation();
															removeGroup(group.id);
														}}
														className="ml-2 rounded p-1 text-inferay-text-3 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
														title="Delete workspace"
													>
														<IconTrash size={10} />
													</button>
												)}
											</div>
										);
									})}
								</div>
								<div className="border-t border-inferay-border">
									<button
										type="button"
										onClick={() => {
											addGroup("Workspace");
											setShowWorkspaceMenu(false);
										}}
										className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-inferay-text-2 transition-colors hover:bg-inferay-surface-2"
									>
										<IconPlus size={10} />
										<span>New Workspace</span>
									</button>
								</div>
							</div>
						)}
					</div>
					{shellState.mainView === "chat" && (
						<>
							<div className="flex items-center shrink-0 rounded-lg border border-inferay-border bg-inferay-surface overflow-hidden h-7">
								<button
									type="button"
									onClick={() => updateLayoutMode("grid")}
									className={`flex items-center justify-center h-full w-7 transition-all ${layoutMode === "grid" ? "bg-inferay-text/10 text-inferay-text" : "text-inferay-text-3 hover:text-inferay-text-2"}`}
									title="Grid layout"
								>
									<IconLayoutGrid size={13} />
								</button>
								<button
									type="button"
									onClick={() => updateLayoutMode("rows")}
									className={`flex items-center justify-center h-full w-7 transition-all ${layoutMode === "rows" ? "bg-inferay-text/10 text-inferay-text" : "text-inferay-text-3 hover:text-inferay-text-2"}`}
									title="Row layout"
								>
									<IconLayoutRows size={13} />
								</button>
							</div>
							{layoutMode === "grid" && selectedGroup && (
								<>
									<div className="flex items-center gap-1.5 shrink-0">
										<span className="text-[9px] text-inferay-text-3 sm:text-[10px]">
											Col
										</span>
										<DropdownButton
											value={String(selectedGroup.columns)}
											options={[1, 2, 3, 4].map((n) => ({
												id: String(n),
												label: String(n),
											}))}
											onChange={(id) =>
												updateSelectedGroupGrid({ columns: Number(id) })
											}
											minWidth={60}
										/>
									</div>
									<div className="flex items-center gap-1.5 shrink-0">
										<span className="text-[9px] text-inferay-text-3 sm:text-[10px]">
											Row
										</span>
										<DropdownButton
											value={String(selectedGroup.rows)}
											options={[1, 2, 3, 4].map((n) => ({
												id: String(n),
												label: String(n),
											}))}
											onChange={(id) =>
												updateSelectedGroupGrid({ rows: Number(id) })
											}
											minWidth={60}
										/>
									</div>
								</>
							)}
						</>
					)}
					<div className="relative shrink-0" ref={newMenuRef}>
						<button
							type="button"
							onClick={() => setShowNewMenu((value) => !value)}
							className="flex h-7 items-center gap-1.5 rounded-lg border border-inferay-border bg-inferay-surface px-2.5 text-xs font-medium text-inferay-text-2 transition-colors hover:bg-inferay-surface-2"
						>
							<span>New</span>
							<IconPlus size={10} />
							<IconChevronDown
								size={10}
								className={`transition-transform ${showNewMenu ? "rotate-180" : ""}`}
							/>
						</button>
						{showNewMenu && (
							<div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-inferay-border bg-inferay-surface shadow-lg">
								{NEW_PANE_AGENT_KINDS.map((agentKind) => (
									<button
										type="button"
										key={agentKind}
										onClick={() => addPaneToSelectedGroup(agentKind)}
										className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-inferay-text-2 transition-colors hover:bg-inferay-surface-2"
									>
										{getAgentIcon(agentKind, 12, "text-inferay-text-3")}
										<span>{getAgentDefinition(agentKind).label}</span>
									</button>
								))}
							</div>
						)}
					</div>
					{shellState.mainView === "editor" && (
						<button
							type="button"
							onClick={() => updateEditorZenMode(!shellState.editorZenMode)}
							title={
								shellState.editorZenMode ? "Exit zen mode" : "Enter zen mode"
							}
							className={`flex h-7 w-7 items-center justify-center rounded-lg border border-inferay-border bg-inferay-surface transition-colors ${
								shellState.editorZenMode
									? "bg-inferay-surface-2 text-inferay-text"
									: "text-inferay-text-3 hover:bg-inferay-surface-2 hover:text-inferay-text-2"
							}`}
						>
							{shellState.editorZenMode ? (
								<IconCollapse size={12} />
							) : (
								<IconExpand size={12} />
							)}
						</button>
					)}
				</>
			)}
		</div>
	);
}
