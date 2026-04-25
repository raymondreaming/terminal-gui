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
	IconGitBranch,
	IconLayers,
	IconPlus,
	IconSettings,
	IconSlash,
	IconTrash,
	IconUser,
} from "../ui/Icons.tsx";

interface NavItem {
	label: string;
	path: string;
	icon: React.ComponentType<{ size?: number; className?: string }>;
}

const navItems: NavItem[] = [
	{ label: "Git", path: "/git", icon: IconGitBranch },
	{ label: "Prompts", path: "/prompts", icon: IconSlash },
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
			<button
				type="button"
				onClick={onSelect}
				className={`mx-1 mb-px flex h-8 w-full items-center justify-center rounded-md text-[10px] font-medium transition-colors ${
					isActive
						? "bg-inferay-text/[0.06] text-inferay-text"
						: "text-inferay-text-3 hover:bg-inferay-text/[0.03] hover:text-inferay-text-2"
				}`}
				title={group.name}
			>
				{group.name.charAt(0).toUpperCase()}
			</button>
		);
	}

	return (
		<div
			className={`group mx-1 mb-px flex h-8 items-center rounded-md px-2 text-[11px] cursor-pointer transition-colors ${
				isActive
					? "bg-inferay-text/[0.06] text-inferay-text"
					: "text-inferay-text-3 hover:bg-inferay-text/[0.03] hover:text-inferay-text-2"
			}`}
			onClick={onSelect}
		>
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
						className="w-full bg-transparent text-[11px] text-inferay-text outline-none border-b border-inferay-accent"
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
			<span className="ml-1 text-[9px] text-inferay-text-3 shrink-0">
				{group.panes.length}
			</span>
			{canDelete && !editing && (
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onDelete();
					}}
					className="ml-1 rounded p-0.5 text-inferay-text-3 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100 shrink-0"
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
	const logoOverlayStyle = useMemo(
		() => ({
			backgroundColor: "var(--color-inferay-accent)",
			opacity: 0.06,
			maskImage: `url(${logoUrl})`,
			maskPosition: "center",
			maskRepeat: "no-repeat",
			maskSize: "cover",
			WebkitMaskImage: `url(${logoUrl})`,
			WebkitMaskPosition: "center",
			WebkitMaskRepeat: "no-repeat",
			WebkitMaskSize: "cover",
		}),
		[]
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
			className={`relative flex flex-col border-r border-inferay-border bg-inferay-bg transition-all duration-200 ${
				collapsed ? "w-12" : "w-48"
			}`}
		>
			<div className="electrobun-webkit-app-region-drag flex h-12 items-center px-3 border-b border-inferay-border">
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
						<span
							className="absolute inset-0 pointer-events-none rounded-md"
							style={logoOverlayStyle}
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
								`mx-1 mb-px flex h-10 items-center gap-2 rounded-md px-2 text-[12px] transition-colors ${
									isActive
										? "bg-inferay-text/[0.06] text-inferay-text"
										: "text-inferay-text-3 hover:bg-inferay-text/[0.03] hover:text-inferay-text-2"
								} ${collapsed ? "justify-center !px-0" : ""}`
							}
							title={collapsed ? item.label : undefined}
						>
							<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
								<Icon size={15} className="shrink-0" />
							</span>
							{!collapsed && <span>{item.label}</span>}
						</NavLink>
					);
				})}

				{/* Workspaces section */}
				<div className="mt-2 border-t border-inferay-border pt-2">
					<div
						className={`mx-1 mb-1 flex items-center ${collapsed ? "justify-center" : "justify-between px-2"}`}
					>
						{collapsed ? (
							<button
								type="button"
								onClick={addWorkspace}
								className="flex h-8 w-8 items-center justify-center rounded-md text-inferay-text-3 hover:bg-inferay-text/[0.03] hover:text-inferay-text-2"
								title="Workspaces"
							>
								<IconLayers size={15} />
							</button>
						) : (
							<>
								<span className="text-[10px] font-medium uppercase tracking-wider text-inferay-text-3">
									Workspaces
								</span>
								<button
									type="button"
									onClick={addWorkspace}
									className="rounded p-0.5 text-inferay-text-3 transition-colors hover:bg-inferay-text/[0.06] hover:text-inferay-text-2"
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
			<div className="border-t border-inferay-border p-1.5">
				<button
					type="button"
					onClick={() =>
						window.dispatchEvent(new Event("terminal-open-theme-panel"))
					}
					className={`flex h-10 w-full items-center gap-2 rounded-md px-2 text-[12px] transition-colors text-inferay-text-3 hover:bg-inferay-text/[0.03] hover:text-inferay-text-2 ${collapsed ? "justify-center !px-0" : ""}`}
					title={collapsed ? "Settings" : undefined}
				>
					<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
						<IconSettings size={15} className="shrink-0" />
					</span>
					{!collapsed ? <span>Settings</span> : null}
				</button>
				<NavLink
					to="/profile"
					className={({ isActive }) =>
						`flex h-10 items-center gap-2 rounded-md px-2 text-[12px] transition-colors ${
							isActive
								? "bg-inferay-text/[0.06] text-inferay-text"
								: "text-inferay-text-3 hover:bg-inferay-text/[0.03] hover:text-inferay-text-2"
						} ${collapsed ? "justify-center !px-0" : ""}`
					}
					title={collapsed ? "Profile" : undefined}
				>
					<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
						<IconUser size={15} className="shrink-0" />
					</span>
					{!collapsed ? <span>Profile</span> : null}
				</NavLink>
			</div>
		</aside>
	);
}
