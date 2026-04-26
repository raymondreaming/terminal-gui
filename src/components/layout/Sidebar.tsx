import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { loadAppThemeId } from "../../lib/app-theme.ts";
import { resolveServerUrl } from "../../lib/server-origin.ts";
import { readStoredBoolean, writeStoredValue } from "../../lib/stored-json.ts";
import {
	createGroupId,
	createTerminalPane,
	DEFAULT_COLUMNS,
	DEFAULT_ROWS,
	loadTerminalState,
	saveTerminalState,
} from "../../lib/terminal-utils.ts";
import {
	IconCamera,
	IconGitBranch,
	IconLayers,
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

const navItems: NavItem[] = [
	{ label: "Git", path: "/git", icon: IconGitBranch },
	{ label: "Prompts", path: "/prompts", icon: IconSlash },
	{ label: "Images", path: "/images", icon: IconCamera },
];

const logoUrl = resolveServerUrl("/logo.png");

function WorkspaceItem({
	group,
	isActive,
	canDelete,
	collapsed,
	onSelect,
	onDelete,
	onRename,
}: {
	group: { id: string; name: string; panes: unknown[] };
	isActive: boolean;
	canDelete: boolean;
	collapsed: boolean;
	onSelect: () => void;
	onDelete: () => void;
	onRename: (name: string) => void;
}) {
	const [editing, setEditing] = useState(false);
	const [editValue, setEditValue] = useState(group.name);
	const inputRef = useRef<HTMLInputElement>(null);

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
		<div
			className={`group mx-1.5 mb-1 flex h-8 items-center gap-2 rounded-lg border px-2 text-[11px] font-medium cursor-pointer transition-colors ${
				isActive
					? "border-inferay-gray-border bg-inferay-gray text-inferay-white"
					: "border-transparent text-inferay-muted-gray hover:bg-inferay-dark-gray hover:text-inferay-soft-white"
			}`}
			onClick={onSelect}
		>
			<IconTerminal size={13} className="shrink-0" />
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
	);
}

export function Sidebar() {
	const navigate = useNavigate();
	const [collapsed, setCollapsed] = useState(() => {
		return readStoredBoolean("sidebar-collapsed");
	});

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
			setWorkspaces((prev) => ({ ...prev, selectedGroupId: groupId }));
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

	const addWorkspace = useCallback(() => {
		const state = loadTerminalState();
		if (!state) return;
		const pane = createTerminalPane("terminal");
		const group = {
			id: createGroupId(),
			name: `Workspace ${state.groups.length + 1}`,
			panes: [pane],
			selectedPaneId: pane.id,
			columns: DEFAULT_COLUMNS,
			rows: DEFAULT_ROWS,
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
							className="h-7 w-7 rounded-md"
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
							onSelect={() => selectWorkspace(group.id)}
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
					title={collapsed ? "Profile" : undefined}
				>
					<IconUser size={14} className="shrink-0" />
					{!collapsed ? <span>Profile</span> : null}
				</NavLink>
			</div>
		</aside>
	);
}
