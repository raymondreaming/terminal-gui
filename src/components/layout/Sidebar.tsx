import * as stylex from "@stylexjs/stylex";
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
import { color, controlSize, font } from "../../tokens.stylex.ts";
import {
	loadStoredMessages,
	loadStoredSummary,
	saveStoredSummary,
} from "../chat/chat-session-store.ts";
import { IconButton } from "../ui/IconButton.tsx";
import {
	IconCamera,
	IconChevronRight,
	IconPlus,
	IconSettings,
	IconSlash,
	IconTerminal,
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

	return (
		<button
			type="button"
			onClick={onClick}
			{...stylex.props(
				styles.paneSummary,
				styles.paneSummaryIdle,
				isActive && styles.paneSummarySelected
			)}
		>
			<span {...stylex.props(styles.paneSummaryIcon)}>
				{isChat ? (
					getAgentIcon(pane.agentKind, 12, "opacity-60")
				) : (
					<IconTerminal size={12} className="opacity-60" />
				)}
			</span>
			<div {...stylex.props(styles.paneSummaryText)}>
				<p {...stylex.props(styles.paneSummaryTitle)}>{primaryLabel}</p>
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
	const [hovered, setHovered] = useState(false);
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
				{...stylex.props(
					styles.collapsedWorkspace,
					isActive
						? styles.collapsedWorkspaceActive
						: styles.collapsedWorkspaceIdle
				)}
				onMouseEnter={() => setHovered(true)}
				onMouseLeave={() => setHovered(false)}
			>
				<button
					type="button"
					onClick={onSelect}
					{...stylex.props(styles.collapsedWorkspaceButton)}
					title={group.name}
				>
					<IconTerminal size={14} className="shrink-0" />
				</button>
				{group.panes.length > 0 && (
					<span {...stylex.props(styles.collapsedWorkspaceCount)}>
						{group.panes.length}
					</span>
				)}
				{canDelete && hovered && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onDelete();
						}}
						{...stylex.props(styles.collapsedWorkspaceDelete)}
						title="Delete workspace"
					>
						<IconX size={7} />
					</button>
				)}
			</div>
		);
	}

	return (
		<div
			{...stylex.props(styles.workspaceWrap)}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			<div
				{...stylex.props(
					styles.workspaceHeader,
					isActive ? styles.workspaceHeaderActive : styles.workspaceHeaderIdle
				)}
				onClick={handleClick}
			>
				<IconChevronRight
					size={10}
					className={`shrink-0 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
				/>
				<div {...stylex.props(styles.workspaceNameWrap)}>
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
							{...stylex.props(styles.workspaceInput)}
						/>
					) : (
						<div
							{...stylex.props(styles.workspaceName)}
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
				<span {...stylex.props(styles.workspaceCount)}>
					{group.panes.length}
				</span>
				{canDelete && hovered && !editing && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onDelete();
						}}
						{...stylex.props(styles.workspaceDelete)}
						title="Delete workspace"
					>
						<IconX size={9} />
					</button>
				)}
			</div>
			{/* Expanded pane list */}
			{expanded && group.panes.length > 0 && (
				<div {...stylex.props(styles.workspacePaneList)}>
					{paneGroups.map(({ folder, panes }) => (
						<div key={folder} {...stylex.props(styles.folderGroup)}>
							<div {...stylex.props(styles.folderHeader)}>
								<span {...stylex.props(styles.folderRule)} />
								<span {...stylex.props(styles.folderLabel)}>{folder}</span>
								<span {...stylex.props(styles.folderCount)}>
									{panes.length}
								</span>
							</div>
							<div {...stylex.props(styles.folderPaneList)}>
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

	const githubLabel = githubAccount?.login || githubAccount?.name || "";
	const shellProps = stylex.props(
		styles.shell,
		collapsed ? styles.shellCollapsed : styles.shellOpen
	);
	const logoBarProps = stylex.props(styles.logoBar);
	const logoButtonProps = stylex.props(styles.logoButton);
	const workspaceSectionProps = stylex.props(styles.workspaceSection);
	const footerProps = stylex.props(styles.footer);

	return (
		<aside
			{...shellProps}
			className={`electrobun-webkit-app-region-drag ${shellProps.className ?? ""}`}
		>
			<div
				className={`electrobun-webkit-app-region-drag ${logoBarProps.className ?? ""}`}
			>
				<button
					type="button"
					onClick={() => setCollapsed(!collapsed)}
					{...logoButtonProps}
					className={`electrobun-webkit-app-region-no-drag ${logoButtonProps.className ?? ""}`}
				>
					<span {...stylex.props(styles.logoFrame)}>
						<img
							src={logoUrl}
							alt=""
							{...stylex.props(styles.logo)}
							style={logoImageStyle}
						/>
					</span>
				</button>
			</div>
			<nav {...stylex.props(styles.nav)}>
				{navItems.map((item) => {
					const Icon = item.icon;
					return (
						<NavLink
							key={item.path}
							to={item.path}
							className={({ isActive }) =>
								`electrobun-webkit-app-region-no-drag ${
									stylex.props(
										styles.navItem,
										isActive ? styles.navItemActive : styles.navItemIdle,
										collapsed ? styles.navItemCollapsed : styles.navItemOpen
									).className ?? ""
								}`
							}
							title={collapsed ? item.label : undefined}
						>
							<Icon size={14} className="shrink-0" />
							{!collapsed && <span>{item.label}</span>}
						</NavLink>
					);
				})}

				{/* Workspaces section */}
				<div
					className={`electrobun-webkit-app-region-no-drag ${workspaceSectionProps.className ?? ""}`}
				>
					<div
						{...stylex.props(
							styles.workspaceSectionHeader,
							collapsed
								? styles.workspaceSectionHeaderCollapsed
								: styles.workspaceSectionHeaderOpen
						)}
					>
						{collapsed ? (
							<IconButton
								type="button"
								onClick={addWorkspace}
								variant="ghost"
								size="md"
								className="mx-auto h-7 w-7"
								title="Add workspace"
							>
								<IconPlus size={14} className="shrink-0" />
							</IconButton>
						) : (
							<>
								<span {...stylex.props(styles.workspaceSectionLabel)}>
									Workspaces
								</span>
								<IconButton
									type="button"
									onClick={addWorkspace}
									variant="ghost"
									size="xs"
									title="New workspace"
								>
									<IconPlus size={12} />
								</IconButton>
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
			<div
				className={`electrobun-webkit-app-region-no-drag ${footerProps.className ?? ""}`}
			>
				<button
					type="button"
					onClick={() =>
						window.dispatchEvent(new Event("terminal-open-theme-panel"))
					}
					{...stylex.props(
						styles.footerButton,
						styles.footerButtonIdle,
						collapsed ? styles.footerButtonCollapsed : styles.footerButtonOpen
					)}
					title={collapsed ? "Settings" : undefined}
				>
					<IconSettings size={14} className="shrink-0" />
					{!collapsed ? <span>Settings</span> : null}
				</button>
				{githubAccount ? (
					<NavLink
						to="/profile"
						className={
							stylex.props(
								styles.profileButton,
								collapsed
									? styles.profileButtonCollapsed
									: styles.profileButtonOpen
							).className ?? ""
						}
						title={collapsed ? githubLabel : undefined}
					>
						<SidebarAccountAvatar account={githubAccount} />
						{!collapsed ? (
							<span {...stylex.props(styles.profileLabel)}>{githubLabel}</span>
						) : null}
					</NavLink>
				) : null}
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
				{...stylex.props(styles.accountAvatar)}
			/>
		);
	}

	return (
		<span {...stylex.props(styles.accountFallback)}>
			{account?.login ? account.login.slice(0, 2) : <IconUser size={10} />}
		</span>
	);
}

const styles = stylex.create({
	paneSummary: {
		alignItems: "center",
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: "transparent",
		borderRadius: 6,
		display: "flex",
		gap: controlSize._2,
		marginBottom: "0.125rem",
		marginInline: "0.375rem",
		paddingBlock: "0.375rem",
		paddingInline: controlSize._2,
		textAlign: "left",
		transitionDuration: "150ms",
		transitionProperty: "background-color, border-color, color",
		transitionTimingFunction: "ease",
		width: "calc(100% - 12px)",
	},
	paneSummaryIdle: {
		backgroundColor: {
			default: "transparent",
			":hover": color.accentWash,
		},
		borderColor: {
			default: "transparent",
			":hover": color.border,
		},
		color: {
			default: color.textSoft,
			":hover": color.textMain,
		},
	},
	paneSummaryActive: {
		backgroundColor: color.accentWash,
		borderColor: color.border,
		color: color.textMain,
	},
	paneSummarySelected: {
		color: color.textMain,
	},
	paneSummaryIcon: {
		flexShrink: 0,
	},
	paneSummaryText: {
		flex: 1,
		minWidth: 0,
	},
	paneSummaryTitle: {
		fontSize: font.size_2,
		fontWeight: font.weight_5,
		lineHeight: 1.2,
		margin: 0,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	paneSummarySub: {
		color: color.textSoft,
		fontSize: font.size_1,
		lineHeight: 1.2,
		marginBlockEnd: 0,
		marginBlockStart: "0.125rem",
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	collapsedWorkspace: {
		alignItems: "center",
		borderRadius: 8,
		borderStyle: "solid",
		borderWidth: 1,
		color: color.textSoft,
		display: "flex",
		height: controlSize._7,
		justifyContent: "center",
		marginBlockEnd: controlSize._1,
		marginInline: "auto",
		position: "relative",
		transitionDuration: "150ms",
		transitionProperty: "background-color, border-color, color",
		transitionTimingFunction: "ease",
		width: controlSize._7,
	},
	collapsedWorkspaceIdle: {
		backgroundColor: {
			default: "transparent",
			":hover": color.accentWash,
		},
		borderColor: {
			default: "transparent",
			":hover": color.border,
		},
		color: {
			default: color.textSoft,
			":hover": color.textMain,
		},
	},
	collapsedWorkspaceActive: {
		backgroundColor: color.accentWash,
		borderColor: color.border,
		color: color.textMain,
	},
	collapsedWorkspaceButton: {
		alignItems: "center",
		borderRadius: 8,
		display: "flex",
		height: "100%",
		justifyContent: "center",
		width: "100%",
	},
	collapsedWorkspaceCount: {
		alignItems: "center",
		backgroundColor: color.accentWash,
		borderColor: color.border,
		borderRadius: 999,
		borderStyle: "solid",
		borderWidth: 1,
		bottom: -4,
		color: color.textSoft,
		display: "flex",
		fontSize: "0.5rem",
		fontWeight: font.weight_5,
		justifyContent: "center",
		lineHeight: 1,
		minWidth: 14,
		paddingInline: "0.125rem",
		position: "absolute",
		right: -4,
	},
	collapsedWorkspaceDelete: {
		alignItems: "center",
		backgroundColor: color.accentWash,
		borderColor: color.border,
		borderRadius: 999,
		borderStyle: "solid",
		borderWidth: 1,
		color: color.textSoft,
		display: "flex",
		height: 14,
		justifyContent: "center",
		position: "absolute",
		right: -4,
		top: -4,
		transitionDuration: "150ms",
		width: 14,
	},
	workspaceWrap: {
		marginBottom: controlSize._1,
	},
	workspaceHeader: {
		alignItems: "center",
		borderRadius: 8,
		borderStyle: "solid",
		borderWidth: 1,
		cursor: "pointer",
		display: "flex",
		fontSize: "0.6875rem",
		fontWeight: font.weight_5,
		gap: controlSize._2,
		height: controlSize._8,
		marginInline: "0.375rem",
		paddingInline: controlSize._2,
		transitionDuration: "150ms",
		transitionProperty: "background-color, border-color, color",
		transitionTimingFunction: "ease",
	},
	workspaceHeaderIdle: {
		backgroundColor: {
			default: "transparent",
			":hover": color.accentWash,
		},
		borderColor: {
			default: "transparent",
			":hover": color.border,
		},
		color: {
			default: color.textSoft,
			":hover": color.textMain,
		},
	},
	workspaceHeaderActive: {
		backgroundColor: color.accentWash,
		borderColor: color.border,
		color: color.textMain,
	},
	workspaceNameWrap: {
		flex: 1,
		minWidth: 0,
	},
	workspaceInput: {
		backgroundColor: "transparent",
		borderWidth: 0,
		color: color.textMain,
		fontSize: "0.6875rem",
		outline: "none",
		width: "100%",
	},
	workspaceName: {
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	workspaceCount: {
		color: color.textSoft,
		flexShrink: 0,
		fontSize: font.size_1,
		marginLeft: controlSize._1,
	},
	workspaceDelete: {
		borderRadius: 4,
		color: color.textSoft,
		flexShrink: 0,
		marginLeft: controlSize._1,
		padding: "0.125rem",
	},
	workspacePaneList: {
		marginTop: "0.125rem",
		paddingBottom: controlSize._1,
	},
	folderGroup: {
		marginBottom: "0.125rem",
	},
	folderHeader: {
		alignItems: "center",
		color: color.textSoft,
		display: "flex",
		fontSize: "0.5rem",
		fontWeight: font.weight_5,
		gap: controlSize._1,
		letterSpacing: 0,
		marginBottom: "0.125rem",
		marginInline: controlSize._2,
		paddingLeft: controlSize._1,
		textTransform: "uppercase",
	},
	folderRule: {
		backgroundColor: "rgba(255, 255, 255, 0.06)",
		height: 1,
		width: "0.375rem",
	},
	folderLabel: {
		minWidth: 0,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	folderCount: {
		backgroundColor: "rgba(255, 255, 255, 0.04)",
		borderRadius: 2,
		color: color.textSoft,
		fontSize: "0.4375rem",
		fontVariantNumeric: "tabular-nums",
		paddingInline: controlSize._1,
	},
	folderPaneList: {
		borderLeftColor: "rgba(255, 255, 255, 0.035)",
		borderLeftStyle: "solid",
		borderLeftWidth: 1,
		marginLeft: controlSize._2,
		paddingLeft: "0.125rem",
	},
	shell: {
		backgroundColor: color.background,
		borderRightColor: color.border,
		borderRightStyle: "solid",
		borderRightWidth: 1,
		display: "flex",
		flexDirection: "column",
		position: "relative",
		transitionDuration: "200ms",
		transitionProperty: "width",
		transitionTimingFunction: "ease",
	},
	shellCollapsed: {
		width: controlSize._12,
	},
	shellOpen: {
		width: 192,
	},
	logoBar: {
		alignItems: "center",
		borderBottomColor: color.border,
		borderBottomStyle: "solid",
		borderBottomWidth: 1,
		display: "flex",
		height: controlSize._12,
		paddingInline: controlSize._3,
	},
	logoButton: {
		alignItems: "center",
		borderRadius: 6,
		display: "flex",
		flexShrink: 0,
		height: controlSize._7,
		justifyContent: "center",
		width: controlSize._7,
	},
	logoFrame: {
		alignItems: "center",
		borderRadius: 6,
		display: "flex",
		height: controlSize._7,
		justifyContent: "center",
		overflow: "hidden",
		position: "relative",
		width: controlSize._7,
	},
	logo: {
		borderRadius: 6,
		height: controlSize._7,
		objectFit: "cover",
		width: controlSize._7,
	},
	nav: {
		flex: 1,
		overflowY: "auto",
		paddingBlock: "0.375rem",
	},
	navItem: {
		alignItems: "center",
		borderRadius: 8,
		borderStyle: "solid",
		borderWidth: 1,
		color: color.textSoft,
		display: "flex",
		fontSize: "0.6875rem",
		fontWeight: font.weight_5,
		gap: controlSize._2,
		marginBlockEnd: controlSize._1,
		marginInline: "0.375rem",
		paddingInline: controlSize._2,
		transitionDuration: "150ms",
		transitionProperty: "background-color, border-color, color",
		transitionTimingFunction: "ease",
	},
	navItemOpen: {
		height: controlSize._7,
	},
	navItemCollapsed: {
		height: controlSize._7,
		justifyContent: "center",
		marginInline: "auto",
		paddingInline: 0,
		width: controlSize._7,
	},
	navItemIdle: {
		backgroundColor: {
			default: "transparent",
			":hover": color.backgroundRaised,
		},
		borderColor: "transparent",
		color: {
			default: color.textSoft,
			":hover": color.textMain,
		},
	},
	navItemActive: {
		backgroundColor: color.controlActive,
		borderColor: color.border,
		color: color.textMain,
	},
	workspaceSection: {
		borderTopColor: color.border,
		borderTopStyle: "solid",
		borderTopWidth: 1,
		marginTop: controlSize._2,
		paddingTop: controlSize._2,
	},
	workspaceSectionHeader: {
		alignItems: "center",
		display: "flex",
		marginBlockEnd: controlSize._1,
		marginInline: "0.375rem",
	},
	workspaceSectionHeaderCollapsed: {
		justifyContent: "center",
	},
	workspaceSectionHeaderOpen: {
		justifyContent: "space-between",
		paddingInline: controlSize._2,
	},
	workspaceSectionLabel: {
		color: color.textSoft,
		fontSize: font.size_2,
		fontWeight: font.weight_5,
		letterSpacing: 0,
		textTransform: "uppercase",
	},
	footer: {
		borderTopColor: color.border,
		borderTopStyle: "solid",
		borderTopWidth: 1,
		display: "flex",
		flexDirection: "column",
		gap: controlSize._1,
		padding: "0.375rem",
	},
	footerButton: {
		alignItems: "center",
		borderColor: "transparent",
		borderRadius: 8,
		borderStyle: "solid",
		borderWidth: 1,
		display: "flex",
		fontSize: "0.6875rem",
		fontWeight: font.weight_5,
		gap: controlSize._2,
		transitionDuration: "150ms",
		transitionProperty: "background-color, border-color, color",
		transitionTimingFunction: "ease",
	},
	footerButtonOpen: {
		height: controlSize._7,
		paddingInline: controlSize._2,
		width: "100%",
	},
	footerButtonCollapsed: {
		height: controlSize._7,
		justifyContent: "center",
		marginInline: "auto",
		padding: 0,
		width: controlSize._7,
	},
	footerButtonIdle: {
		backgroundColor: {
			default: "transparent",
			":hover": color.backgroundRaised,
		},
		color: {
			default: color.textSoft,
			":hover": color.textMain,
		},
	},
	footerButtonActive: {
		backgroundColor: color.controlActive,
		borderColor: color.border,
		color: color.textMain,
	},
	profileButton: {
		alignItems: "center",
		borderColor: "transparent",
		borderRadius: 8,
		borderStyle: "solid",
		borderWidth: 1,
		color: color.textSoft,
		display: "flex",
		fontSize: "0.6875rem",
		fontWeight: font.weight_5,
		gap: controlSize._1,
	},
	profileButtonOpen: {
		height: controlSize._7,
		paddingInline: "0.375rem",
		width: "100%",
	},
	profileButtonCollapsed: {
		height: controlSize._7,
		justifyContent: "center",
		marginInline: "auto",
		padding: 0,
		width: controlSize._7,
	},
	profileLabel: {
		minWidth: 0,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	accountAvatar: {
		borderColor: color.border,
		borderRadius: 999,
		borderStyle: "solid",
		borderWidth: 1,
		flexShrink: 0,
		height: controlSize._5,
		objectFit: "cover",
		width: controlSize._5,
	},
	accountFallback: {
		alignItems: "center",
		backgroundColor: color.controlActive,
		borderColor: color.border,
		borderRadius: 999,
		borderStyle: "solid",
		borderWidth: 1,
		color: color.textSoft,
		display: "flex",
		flexShrink: 0,
		fontSize: font.size_2,
		fontWeight: "600",
		height: controlSize._5,
		justifyContent: "center",
		textTransform: "uppercase",
		width: controlSize._5,
	},
});
