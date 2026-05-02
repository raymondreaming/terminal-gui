import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { getAgentIcon } from "../../lib/agent-ui.tsx";
import { isChatAgentKind } from "../../lib/agents.ts";
import { loadAppThemeId } from "../../lib/app-theme.ts";
import { resolveServerUrl } from "../../lib/server-origin.ts";
import { readStoredBoolean, writeStoredValue } from "../../lib/stored-json.ts";
import {
	createGroupId,
	createPendingAgentChatPane,
	DEFAULT_COLUMNS,
	DEFAULT_ROWS,
	loadTerminalState,
	saveTerminalState,
	type TerminalPaneModel,
} from "../../lib/terminal-utils.ts";
import {
	loadStoredMessages,
	loadStoredSummary,
	saveStoredSummary,
} from "../chat/chat-session-store.ts";
import {
	IconCamera,
	IconChevronRight,
	IconPlus,
	IconSettings,
	IconSlash,
	IconTerminal,
	IconTrash,
	IconUser,
	IconX,
} from "../ui/Icons.tsx";

interface NavItem {
	label: string;
	path: string;
	icon: React.ComponentType<{ size?: number; className?: string }>;
}

interface ForgeAccount {
	provider: "github";
	host: string;
	login: string;
	name: string | null;
	avatarUrl: string | null;
	email: string | null;
	active: boolean;
}

const navItems: NavItem[] = [
	{ label: "Prompts", path: "/prompts", icon: IconSlash },
	{ label: "Images", path: "/images", icon: IconCamera },
];

const logoUrl = resolveServerUrl("/logo.png");

// Track which panes have a pending title request to avoid duplicates
const pendingTitleRequests = new Set<string>();

function getPaneBaseFolder(pane: TerminalPaneModel): string {
	return pane.cwd?.split("/").filter(Boolean).pop() || "No folder";
}

function deriveSummary(paneId: string): string | null {
	const existing = loadStoredSummary(paneId);
	if (existing) return existing;
	// Try to derive from stored messages
	const messages = loadStoredMessages<{ role: string; content: string }>(
		paneId
	);
	const firstUser = messages.find((m) => m.role === "user");
	if (!firstUser?.content) return null;
	// Fire off AI title generation in background
	if (!pendingTitleRequests.has(paneId)) {
		pendingTitleRequests.add(paneId);
		fetch("/api/generate-title", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ message: firstUser.content }),
		})
			.then((res) => (res.ok ? res.json() : null))
			.then((data: { title?: string } | null) => {
				const title = data?.title?.trim();
				if (title) {
					saveStoredSummary(paneId, title);
					window.dispatchEvent(new Event("terminal-shell-change"));
				}
			})
			.catch(() => {})
			.finally(() => pendingTitleRequests.delete(paneId));
	}
	// Return a temporary placeholder from the first line while AI generates
	const text = firstUser.content.trim().split("\n")[0] ?? "";
	return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

function PaneSummaryItem({
	pane,
	isActive,
	onClick,
}: {
	pane: TerminalPaneModel;
	isActive: boolean;
	onClick: () => void;
}) {
	const isChat = isChatAgentKind(pane.agentKind);
	const summary = isChat ? deriveSummary(pane.id) : null;
	const dirName = pane.cwd?.split("/").pop();
	const primaryLabel = isChat
		? (summary ?? pane.title)
		: (dirName ?? pane.title);
	const secondaryLabel = isChat ? (dirName ?? pane.title) : null;

	return (
		<button
			type="button"
			onClick={onClick}
			className={`group/pane mx-1.5 mb-0.5 flex w-[calc(100%-12px)] items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
				isActive
					? "bg-inferay-gray/60 text-inferay-white"
					: "text-inferay-muted-gray hover:bg-inferay-dark-gray hover:text-inferay-soft-white"
			}`}
		>
			<span className="mt-0.5 shrink-0">
				{isChat ? (
					getAgentIcon(pane.agentKind, 12, "opacity-60")
				) : (
					<IconTerminal size={12} className="opacity-60" />
				)}
			</span>
			<div className="min-w-0 flex-1">
				<p className="truncate text-[10px] font-medium leading-tight">
					{primaryLabel}
				</p>
				{secondaryLabel && secondaryLabel !== primaryLabel && (
					<p className="mt-0.5 truncate text-[9px] leading-tight text-inferay-muted-gray">
						{secondaryLabel}
					</p>
				)}
			</div>
		</button>
	);
}

function WorkspaceItem({
	group,
	isActive,
	canDelete,
	collapsed,
	selectedPaneId,
	onSelect,
	onSelectPane,
	onDelete,
	onRename,
}: {
	group: {
		id: string;
		name: string;
		panes: TerminalPaneModel[];
		selectedPaneId: string | null;
	};
	isActive: boolean;
	canDelete: boolean;
	collapsed: boolean;
	selectedPaneId: string | null;
	onSelect: () => void;
	onSelectPane: (paneId: string) => void;
	onDelete: () => void;
	onRename: (name: string) => void;
}) {
	const [expanded, setExpanded] = useState(isActive);
	const [editing, setEditing] = useState(false);
	const [editValue, setEditValue] = useState(group.name);
	const inputRef = useRef<HTMLInputElement>(null);
	const paneGroups = useMemo(() => {
		const byFolder = new Map<string, TerminalPaneModel[]>();
		for (const pane of group.panes) {
			const folder = getPaneBaseFolder(pane);
			const panes = byFolder.get(folder) ?? [];
			panes.push(pane);
			byFolder.set(folder, panes);
		}
		return Array.from(byFolder.entries())
			.map(([folder, panes]) => ({ folder, panes }))
			.sort((a, b) => {
				if (a.folder === "No folder") return 1;
				if (b.folder === "No folder") return -1;
				return a.folder.localeCompare(b.folder);
			});
	}, [group.panes]);

	// Auto-expand when workspace becomes active
	useEffect(() => {
		if (isActive) setExpanded(true);
	}, [isActive]);

	useEffect(() => {
		if (editing) {
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	}, [editing]);

	const commitRename = () => {
		const trimmed = editValue.trim();
		if (trimmed && trimmed !== group.name) {
			onRename(trimmed);
		}
		setEditing(false);
	};

	const handleClick = () => {
		if (isActive) {
			// Already active — toggle expand/collapse
			setExpanded((prev) => !prev);
		} else {
			// Select this workspace and expand
			onSelect();
			setExpanded(true);
		}
	};

	if (collapsed) {
		return (
			<div
				className={`group mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-lg border transition-colors relative ${
					isActive
						? "border-inferay-gray-border bg-inferay-gray text-inferay-white"
						: "border-transparent text-inferay-muted-gray hover:bg-inferay-dark-gray hover:text-inferay-soft-white"
				}`}
			>
				<button
					type="button"
					onClick={onSelect}
					className="flex items-center justify-center w-full h-full rounded-lg"
					title={group.name}
				>
					<IconTerminal size={14} className="shrink-0" />
				</button>
				{group.panes.length > 0 && (
					<span className="absolute -bottom-1 -right-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-inferay-gray border border-inferay-gray-border text-[8px] font-medium text-inferay-muted-gray leading-none px-0.5">
						{group.panes.length}
					</span>
				)}
				{canDelete && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onDelete();
						}}
						className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-inferay-black border border-inferay-gray-border text-inferay-muted-gray opacity-0 transition-opacity hover:text-red-400 hover:border-red-400/40 group-hover:opacity-100"
						title="Delete workspace"
					>
						<IconX size={7} />
					</button>
				)}
			</div>
		);
	}

	return (
		<div className="mb-1">
			<div
				className={`group mx-1.5 flex h-8 items-center gap-2 rounded-lg border px-2 text-[11px] font-medium cursor-pointer transition-colors ${
					isActive
						? "border-inferay-gray-border bg-inferay-gray text-inferay-white"
						: "border-transparent text-inferay-muted-gray hover:bg-inferay-dark-gray hover:text-inferay-soft-white"
				}`}
				onClick={handleClick}
			>
				<IconChevronRight
					size={10}
					className={`shrink-0 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
				/>
				<div className="flex-1 min-w-0">
					{editing ? (
						<input
							ref={inputRef}
							value={editValue}
							onChange={(e) => setEditValue(e.target.value)}
							onBlur={commitRename}
							onClick={(e) => e.stopPropagation()}
							onKeyDown={(e) => {
								if (e.key === "Enter") commitRename();
								if (e.key === "Escape") setEditing(false);
							}}
							className="w-full bg-transparent text-[11px] text-inferay-white outline-none border-b border-inferay-accent"
						/>
					) : (
						<div
							className="truncate"
							onDoubleClick={(e) => {
								e.stopPropagation();
								setEditValue(group.name);
								setEditing(true);
							}}
						>
							{group.name}
						</div>
					)}
				</div>
				<span className="ml-1 text-[9px] text-inferay-muted-gray shrink-0">
					{group.panes.length}
				</span>
				{canDelete && !editing && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onDelete();
						}}
						className="ml-1 rounded p-0.5 text-inferay-muted-gray opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100 shrink-0"
						title="Delete workspace"
					>
						<IconTrash size={10} />
					</button>
				)}
			</div>
			{/* Expanded pane list */}
			{expanded && group.panes.length > 0 && (
				<div className="mt-0.5 pb-1">
					{paneGroups.map(({ folder, panes }) => (
						<div key={folder} className="mb-0.5 last:mb-0">
							<div className="mx-2 mb-0.5 flex items-center gap-1 pl-1 text-[8px] font-medium uppercase tracking-[0.12em] text-inferay-muted-gray/60">
								<span className="h-px w-1.5 bg-inferay-gray-border/70" />
								<span className="min-w-0 truncate">{folder}</span>
								<span className="rounded-sm bg-inferay-white/[0.04] px-1 text-[7px] tabular-nums text-inferay-muted-gray/50">
									{panes.length}
								</span>
							</div>
							<div className="ml-2 border-l border-inferay-gray-border/35 pl-0.5">
								{panes.map((pane) => (
									<PaneSummaryItem
										key={pane.id}
										pane={pane}
										isActive={isActive && pane.id === selectedPaneId}
										onClick={() => onSelectPane(pane.id)}
									/>
								))}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export function Sidebar() {
	const navigate = useNavigate();
	const [collapsed, setCollapsed] = useState(() => {
		return readStoredBoolean("sidebar-collapsed");
	});
	const [githubAccount, setGithubAccount] = useState<ForgeAccount | null>(null);

	const isDefault = loadAppThemeId() === "default";
	const logoImageStyle = useMemo(
		() => ({
			filter: "saturate(0.94) contrast(1.04) brightness(0.99)",
			opacity: isDefault ? 1 : 0.7,
		}),
		[isDefault]
	);

	// Workspace state
	const loadWorkspaces = useCallback(() => {
		const state = loadTerminalState();
		return {
			groups: state?.groups ?? [],
			selectedGroupId: state?.selectedGroupId ?? state?.groups[0]?.id ?? null,
		};
	}, []);

	const [workspaces, setWorkspaces] = useState(loadWorkspaces);

	useEffect(() => {
		const refresh = () => setWorkspaces(loadWorkspaces());
		window.addEventListener("terminal-shell-change", refresh);
		return () => window.removeEventListener("terminal-shell-change", refresh);
	}, [loadWorkspaces]);

	const selectWorkspace = useCallback(
		(groupId: string) => {
			// Optimistic update — render immediately, then persist
			setWorkspaces((prev) => ({ ...prev, selectedGroupId: groupId as never }));
			const state = loadTerminalState();
			if (!state) return;
			saveTerminalState({ ...state, selectedGroupId: groupId as never });
			window.dispatchEvent(new Event("terminal-shell-change"));
			if (window.location.hash !== "#/terminal") {
				navigate("/terminal");
			}
		},
		[navigate]
	);

	const selectPane = useCallback(
		(groupId: string, paneId: string) => {
			const state = loadTerminalState();
			if (!state) return;
			const gid = groupId as never;
			const pid = paneId as never;
			saveTerminalState({
				...state,
				selectedGroupId: gid,
				groups: state.groups.map((g) =>
					g.id === groupId ? { ...g, selectedPaneId: pid } : g
				),
			});
			setWorkspaces(loadWorkspaces);
			// When on editor view, also update the editor's selected pane
			writeStoredValue("editor-selected-pane", paneId);
			window.dispatchEvent(new Event("terminal-shell-change"));
			if (window.location.hash !== "#/terminal") {
				navigate("/terminal");
			}
		},
		[navigate, loadWorkspaces]
	);

	const addWorkspace = useCallback(() => {
		const state = loadTerminalState();
		if (!state) return;
		const selectedGroup =
			state.groups.find((group) => group.id === state.selectedGroupId) ??
			state.groups[0];
		const pane = createPendingAgentChatPane();
		const group = {
			id: createGroupId(),
			name: `Workspace ${state.groups.length + 1}`,
			panes: [pane],
			selectedPaneId: pane.id,
			columns: selectedGroup?.columns ?? DEFAULT_COLUMNS,
			rows: selectedGroup?.rows ?? DEFAULT_ROWS,
		};
		saveTerminalState({
			...state,
			groups: [...state.groups, group],
			selectedGroupId: group.id,
		});
		window.dispatchEvent(new Event("terminal-shell-change"));
		navigate("/terminal");
	}, [navigate]);

	const removeWorkspace = useCallback((groupId: string) => {
		const state = loadTerminalState();
		if (!state) return;
		if (state.groups.length <= 1) return;
		const filtered = state.groups.filter((g) => g.id !== groupId);
		const newSelected =
			state.selectedGroupId === groupId
				? (filtered[0]?.id ?? null)
				: state.selectedGroupId;
		saveTerminalState({
			...state,
			groups: filtered,
			selectedGroupId: newSelected,
		});
		window.dispatchEvent(new Event("terminal-shell-change"));
	}, []);

	const renameWorkspace = useCallback((groupId: string, name: string) => {
		const state = loadTerminalState();
		if (!state) return;
		saveTerminalState({
			...state,
			groups: state.groups.map((g) => (g.id === groupId ? { ...g, name } : g)),
		});
		window.dispatchEvent(new Event("terminal-shell-change"));
	}, []);

	useEffect(() => {
		writeStoredValue("sidebar-collapsed", String(collapsed));
	}, [collapsed]);

	useEffect(() => {
		let cancelled = false;
		async function loadGithubAccount() {
			try {
				const response = await fetch("/api/forge/accounts");
				if (!response.ok) return;
				const payload = (await response.json()) as {
					accounts?: ForgeAccount[];
				};
				const accounts = Array.isArray(payload.accounts)
					? payload.accounts
					: [];
				const account =
					accounts.find((item) => item.active) ?? accounts[0] ?? null;
				if (!cancelled) setGithubAccount(account);
			} catch {
				if (!cancelled) setGithubAccount(null);
			}
		}
		void loadGithubAccount();
		window.addEventListener("focus", loadGithubAccount);
		return () => {
			cancelled = true;
			window.removeEventListener("focus", loadGithubAccount);
		};
	}, []);

	const githubLabel =
		githubAccount?.login || githubAccount?.name || "GitHub Account";

	return (
		<aside
			className={`electrobun-webkit-app-region-drag relative flex flex-col border-r border-inferay-gray-border bg-inferay-black transition-all duration-200 ${
				collapsed ? "w-12" : "w-48"
			}`}
		>
			<div className="electrobun-webkit-app-region-drag flex h-12 items-center px-3 border-b border-inferay-gray-border">
				<button
					type="button"
					onClick={() => setCollapsed(!collapsed)}
					className="electrobun-webkit-app-region-no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
				>
					<span className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-md">
						<img
							src={logoUrl}
							alt=""
							className="h-7 w-7 rounded-md object-cover"
							style={logoImageStyle}
						/>
					</span>
				</button>
			</div>
			<nav className="flex-1 overflow-y-auto py-1.5 scrollbar-none">
				{navItems.map((item) => {
					const Icon = item.icon;
					return (
						<NavLink
							key={item.path}
							to={item.path}
							className={({ isActive }) =>
								`electrobun-webkit-app-region-no-drag mx-1.5 mb-1 flex items-center gap-2 rounded-lg border px-2 text-[11px] font-medium transition-colors ${
									isActive
										? "border-inferay-gray-border bg-inferay-gray text-inferay-white"
										: "border-transparent text-inferay-muted-gray hover:bg-inferay-dark-gray hover:text-inferay-soft-white"
								} ${collapsed ? "justify-center h-7 w-7 mx-auto !px-0" : "h-7"}`
							}
							title={collapsed ? item.label : undefined}
						>
							<Icon size={14} className="shrink-0" />
							{!collapsed && <span>{item.label}</span>}
						</NavLink>
					);
				})}

				{/* Workspaces section */}
				<div className="electrobun-webkit-app-region-no-drag mt-2 border-t border-inferay-gray-border pt-2">
					<div
						className={`mx-1.5 mb-1 flex items-center ${collapsed ? "justify-center" : "justify-between px-2"}`}
					>
						{collapsed ? (
							<button
								type="button"
								onClick={addWorkspace}
								className="flex h-7 w-7 mx-auto items-center justify-center rounded-lg border border-transparent text-inferay-muted-gray hover:bg-inferay-dark-gray hover:text-inferay-soft-white"
								title="Add workspace"
							>
								<IconPlus size={14} className="shrink-0" />
							</button>
						) : (
							<>
								<span className="text-[10px] font-medium uppercase tracking-wider text-inferay-muted-gray">
									Workspaces
								</span>
								<button
									type="button"
									onClick={addWorkspace}
									className="rounded p-0.5 text-inferay-muted-gray transition-colors hover:bg-inferay-white/[0.06] hover:text-inferay-soft-white"
									title="New workspace"
								>
									<IconPlus size={12} />
								</button>
							</>
						)}
					</div>
					{workspaces.groups.map((group) => (
						<WorkspaceItem
							key={group.id}
							group={group}
							isActive={group.id === workspaces.selectedGroupId}
							canDelete={workspaces.groups.length > 1}
							collapsed={collapsed}
							selectedPaneId={group.selectedPaneId ?? null}
							onSelect={() => selectWorkspace(group.id)}
							onSelectPane={(paneId) => selectPane(group.id, paneId)}
							onDelete={() => removeWorkspace(group.id)}
							onRename={(name) => renameWorkspace(group.id, name)}
						/>
					))}
				</div>
			</nav>
			<div className="electrobun-webkit-app-region-no-drag border-t border-inferay-gray-border p-1.5">
				<button
					type="button"
					onClick={() =>
						window.dispatchEvent(new Event("terminal-open-theme-panel"))
					}
					className={`flex items-center gap-2 rounded-lg border border-transparent text-[11px] font-medium transition-colors text-inferay-muted-gray hover:bg-inferay-dark-gray hover:text-inferay-soft-white ${collapsed ? "justify-center h-7 w-7 mx-auto p-0" : "h-7 w-full px-2"}`}
					title={collapsed ? "Settings" : undefined}
				>
					<IconSettings size={14} className="shrink-0" />
					{!collapsed ? <span>Settings</span> : null}
				</button>
				<NavLink
					to="/profile"
					className={({ isActive }) =>
						`flex items-center gap-2 rounded-lg border text-[11px] font-medium transition-colors ${
							isActive
								? "border-inferay-gray-border bg-inferay-gray text-inferay-white"
								: "border-transparent text-inferay-muted-gray hover:bg-inferay-dark-gray hover:text-inferay-soft-white"
						} ${collapsed ? "justify-center h-7 w-7 mx-auto p-0" : "h-7 px-2"}`
					}
					title={collapsed ? githubLabel : undefined}
				>
					<SidebarAccountAvatar account={githubAccount} />
					{!collapsed ? <span className="truncate">{githubLabel}</span> : null}
				</NavLink>
			</div>
		</aside>
	);
}

function SidebarAccountAvatar({ account }: { account: ForgeAccount | null }) {
	if (account?.avatarUrl) {
		return (
			<img
				src={account.avatarUrl}
				alt=""
				className="h-4 w-4 shrink-0 rounded-full border border-inferay-gray-border object-cover"
			/>
		);
	}

	return (
		<span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-inferay-gray-border bg-inferay-gray text-[7px] font-semibold uppercase text-inferay-soft-white">
			{account?.login ? account.login.slice(0, 2) : <IconUser size={10} />}
		</span>
	);
}
