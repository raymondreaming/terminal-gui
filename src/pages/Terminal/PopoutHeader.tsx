import { memo, type ReactElement, useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button.tsx";
import { IconButton } from "../../components/ui/IconButton.tsx";
import {
	IconArrowLeft,
	IconChevronDown,
	IconCircle,
	IconExternalLink,
	IconFolder,
	IconFolderOpen,
	IconGlobe,
	IconLayout,
	IconPencil,
	IconPlus,
	IconTerminal,
	IconTrash,
	IconX,
} from "../../components/ui/Icons.tsx";
import type { RunningPort } from "../../hooks/useRunningPorts.ts";
import { getAgentIcon } from "../../lib/agent-ui.tsx";
import { getAgentDefinition, NEW_PANE_AGENT_KINDS } from "../../lib/agents.ts";
import {
	type AgentKind,
	getPaneTitle,
	getStatusInfo,
	type TerminalGroupModel,
} from "../../lib/terminal-utils.ts";
import { StatusIcon } from "./StatusIcon.tsx";

interface PopoutHeaderProps {
	groups: TerminalGroupModel[];
	currentGroup: TerminalGroupModel | undefined;
	selectedGroupId: string | null;
	columns: number;
	agentStatuses: Map<string, string>;
	onRestore: () => void;
	onSelectGroup: (id: string) => void;
	onAddGroup: (name: string) => void;
	onRenameGroup: (id: string, name: string) => void;
	onRemoveGroup: (id: string) => void;
	onSelectPane: (id: string) => void;
	onRemovePane: (id: string) => void;
	onAddPane: (agentKind: AgentKind) => void;
	onColumnsChange: (n: number) => void;
	ports: RunningPort[];
	onKillPort: (port: number, pid: number) => void;
	onOpenInBrowser: (port: number) => void;
}

type MenuKey = "newMenu" | "layoutMenu" | "groupMenu" | "servicesMenu";

const SectionHeader = ({
	icon,
	label,
	count,
	color,
	border,
}: {
	icon: ReactElement;
	label: string;
	count: number;
	color: string;
	border: string;
}) => (
	<div
		className={`px-3 py-1.5 flex items-center gap-1.5 ${border} border-inferay-border`}
	>
		{icon}
		<span className="text-[9px] text-inferay-text-3 uppercase tracking-wider font-medium">
			{label}
		</span>
		{count > 0 && <span className={`text-[9px] ${color}`}>{count}</span>}
	</div>
);

const DropdownMenu = ({
	children,
	className = "",
}: {
	children: React.ReactNode;
	className?: string;
}) => (
	<div
		className={`absolute top-full mt-1 z-50 rounded-lg border border-inferay-border bg-inferay-surface shadow-lg overflow-hidden ${className}`}
	>
		{children}
	</div>
);

const MenuTrigger = ({
	onClick,
	icon,
	label,
	isOpen,
	variant = "ghost" as const,
	chevron = true,
}: {
	onClick: () => void;
	icon: ReactElement;
	label?: string;
	isOpen: boolean;
	variant?: "ghost" | "primary";
	chevron?: boolean;
}) => (
	<Button
		size="sm"
		variant={variant}
		onClick={onClick}
		className="flex items-center gap-1"
	>
		{icon}
		{label && <span>{label}</span>}
		{chevron && (
			<IconChevronDown
				size={10}
				className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
			/>
		)}
	</Button>
);

export const PopoutHeader = memo(function PopoutHeader(
	props: PopoutHeaderProps
) {
	const {
		groups,
		currentGroup,
		selectedGroupId,
		columns,
		agentStatuses,
		onRestore,
		onSelectGroup,
		onAddGroup,
		onRenameGroup,
		onRemoveGroup,
		onSelectPane,
		onRemovePane,
		onAddPane,
		onColumnsChange,
		ports,
		onKillPort,
		onOpenInBrowser,
	} = props;

	const [menus, setMenus] = useState({
		newMenu: false,
		layoutMenu: false,
		groupMenu: false,
		servicesMenu: false,
	});
	const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
	const [editingGroupName, setEditingGroupName] = useState("");
	const refs = {
		newMenu: useRef<HTMLDivElement>(null),
		layoutMenu: useRef<HTMLDivElement>(null),
		groupMenu: useRef<HTMLDivElement>(null),
		servicesMenu: useRef<HTMLDivElement>(null),
	};

	const toggleMenu = (key: MenuKey) =>
		setMenus((p) => ({ ...p, [key]: !p[key] }));
	const closeMenu = (key: MenuKey) => setMenus((p) => ({ ...p, [key]: false }));

	useEffect(() => {
		if (
			!menus.newMenu &&
			!menus.layoutMenu &&
			!menus.groupMenu &&
			!menus.servicesMenu
		)
			return;
		const handleClick = (e: MouseEvent) => {
			const updates: Partial<typeof menus> = {};
			for (const key of [
				"newMenu",
				"layoutMenu",
				"groupMenu",
				"servicesMenu",
			] as MenuKey[]) {
				if (
					menus[key] &&
					refs[key].current &&
					!refs[key].current.contains(e.target as Node)
				) {
					updates[key] = false;
					if (key === "groupMenu") setEditingGroupId(null);
				}
			}
			if (Object.keys(updates).length > 0)
				setMenus((p) => ({ ...p, ...updates }));
		};
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [
		menus.newMenu,
		menus.layoutMenu,
		menus.groupMenu,
		menus.servicesMenu,
		menus,
		refs,
	]);

	const commitRename = (gId: string) => {
		if (editingGroupName.trim()) onRenameGroup(gId, editingGroupName.trim());
		setEditingGroupId(null);
	};

	return (
		<div className="relative shrink-0 flex h-14 items-center gap-1.5 border-b border-inferay-border bg-inferay-bg px-2 pt-2 sm:px-3">
			<IconButton
				size="sm"
				onClick={onRestore}
				title="Restore to main window"
				className="relative z-10 text-inferay-text-2 hover:text-inferay-text"
			>
				<IconArrowLeft size={14} />
			</IconButton>
			<div className="relative z-10 h-3 w-px bg-inferay-border" />

			<div className="relative z-10" ref={refs.groupMenu}>
				<MenuTrigger
					onClick={() => toggleMenu("groupMenu")}
					icon={<IconFolderOpen size={12} />}
					label={`${currentGroup?.name ?? "Select Group"} (${currentGroup?.panes.length ?? 0})`}
					isOpen={menus.groupMenu}
				/>
				{menus.groupMenu && (
					<DropdownMenu className="left-0 min-w-[180px]">
						{groups.map((g) => (
							<div
								key={g.id}
								className={`flex items-center gap-2 px-3 py-1.5 transition-colors ${g.id === selectedGroupId ? "bg-inferay-surface-2" : "hover:bg-inferay-surface-2"}`}
							>
								{editingGroupId === g.id ? (
									<input
										value={editingGroupName}
										onChange={(e) => setEditingGroupName(e.target.value)}
										onBlur={() => commitRename(g.id)}
										onKeyDown={(e) => {
											if (e.key === "Enter") commitRename(g.id);
											if (e.key === "Escape") setEditingGroupId(null);
										}}
										onClick={(e) => e.stopPropagation()}
										className="flex-1 bg-transparent text-xs text-inferay-text outline-none border-0"
									/>
								) : (
									<button
										type="button"
										onClick={() => {
											onSelectGroup(g.id);
											closeMenu("groupMenu");
										}}
										className="flex-1 flex items-center gap-2 text-left"
									>
										{g.id === selectedGroupId ? (
											<IconFolderOpen
												size={12}
												className="text-inferay-text-3"
											/>
										) : (
											<IconFolder size={12} className="text-inferay-text-3" />
										)}
										<span
											className={`text-xs ${g.id === selectedGroupId ? "text-inferay-text" : "text-inferay-text-2"}`}
										>
											{g.name}
										</span>
										<span className="text-[10px] text-inferay-text-3">
											({g.panes.length})
										</span>
									</button>
								)}
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										setEditingGroupId(g.id);
										setEditingGroupName(g.name);
									}}
									className="p-1 rounded hover:bg-inferay-surface-3 text-inferay-text-3 hover:text-inferay-text-2 transition-colors"
								>
									<IconPencil size={10} />
								</button>
								{groups.length > 1 && (
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											onRemoveGroup(g.id);
										}}
										className="p-1 rounded hover:bg-red-500/20 text-inferay-text-3 hover:text-red-400 transition-colors"
									>
										<IconTrash size={10} />
									</button>
								)}
							</div>
						))}
						<div className="border-t border-inferay-border">
							<button
								type="button"
								onClick={() => {
									onAddGroup(`Group ${groups.length + 1}`);
									closeMenu("groupMenu");
								}}
								className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-inferay-text-3 hover:bg-inferay-surface-2 hover:text-inferay-text-2 transition-colors"
							>
								<IconPlus size={10} />
								<span>New Group</span>
							</button>
						</div>
					</DropdownMenu>
				)}
			</div>
			<div className="relative z-10 h-3 w-px bg-inferay-border" />

			<div className="relative z-10 flex items-center gap-1 overflow-x-auto flex-1 min-w-0 scrollbar-none">
				{currentGroup?.panes.map((pane) => {
					const si = getStatusInfo(agentStatuses.get(pane.id) ?? "idle");
					const isSelected = pane.id === currentGroup.selectedPaneId;
					const paneIcon =
						pane.agentKind !== "terminal" ? (
							<StatusIcon
								iconType={si.iconType}
								size={13}
								className={`shrink-0 ${si.iconColor} ${si.isActive ? "animate-pulse" : ""}`}
							/>
						) : (
							<IconTerminal size={13} className="text-inferay-text-2" />
						);
					return (
						<button
							key={pane.id}
							type="button"
							onClick={() => onSelectPane(pane.id)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") onSelectPane(pane.id);
							}}
							className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition-colors shrink-0 cursor-pointer ${isSelected ? "bg-inferay-surface-2 text-inferay-text" : "text-inferay-text-3 hover:bg-inferay-surface hover:text-inferay-text-2"}`}
						>
							{paneIcon}
							<span className="text-xs font-medium max-w-[80px] truncate">
								{getPaneTitle(pane)}
							</span>
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									onRemovePane(pane.id);
								}}
								className="rounded p-0.5 hover:bg-inferay-surface-2 text-inferay-text-3 hover:text-inferay-text transition-colors"
							>
								<IconX size={10} />
							</button>
						</button>
					);
				})}
			</div>

			<div className="relative z-10 flex items-center gap-1.5 shrink-0">
				<div className="relative" ref={refs.servicesMenu}>
					<MenuTrigger
						onClick={() => toggleMenu("servicesMenu")}
						icon={<IconGlobe size={14} />}
						isOpen={menus.servicesMenu}
					/>
					{menus.servicesMenu && (
						<DropdownMenu className="right-0 min-w-[200px]">
							<SectionHeader
								icon={<IconGlobe size={11} className="text-inferay-accent" />}
								label="Ports"
								count={ports.length}
								color="text-inferay-accent"
								border="border-b"
							/>
							{ports.length === 0 ? (
								<div className="px-3 py-1.5 text-[10px] text-inferay-text-3">
									None running
								</div>
							) : (
								ports.map((p) => (
									<div
										key={`${p.port}-${p.pid}`}
										className="flex items-center gap-2 px-3 py-1.5 hover:bg-inferay-surface-2 transition-colors group"
									>
										<IconCircle
											size={8}
											className="text-inferay-accent fill-inferay-accent shrink-0"
										/>
										<span className="text-[11px] font-medium text-inferay-text shrink-0">
											:{p.port}
										</span>
										<span className="text-[10px] text-inferay-text-3 truncate min-w-0">
											{p.name}
										</span>
										<div className="flex items-center gap-0.5 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
											<IconButton
												variant="ghost"
												size="xs"
												onClick={() => onOpenInBrowser(p.port)}
												title="Open in browser"
											>
												<IconExternalLink size={11} />
											</IconButton>
											<IconButton
												variant="danger"
												size="xs"
												onClick={() => onKillPort(p.port, p.pid)}
												title="Kill process"
											>
												<IconX size={11} />
											</IconButton>
										</div>
									</div>
								))
							)}
						</DropdownMenu>
					)}
				</div>

				<div className="relative" ref={refs.layoutMenu}>
					<MenuTrigger
						onClick={() => toggleMenu("layoutMenu")}
						icon={<IconLayout size={12} />}
						label={`${columns} col`}
						isOpen={menus.layoutMenu}
					/>
					{menus.layoutMenu && (
						<DropdownMenu className="right-0 p-2">
							<span className="text-[9px] text-inferay-text-3 uppercase tracking-wider font-medium">
								Columns
							</span>
							<div className="flex gap-1 mt-1">
								{[1, 2, 3, 4].map((n) => (
									<button
										type="button"
										key={n}
										onClick={() => onColumnsChange(n)}
										className={`w-6 h-6 text-[10px] rounded transition-colors flex items-center justify-center ${columns === n ? "bg-inferay-accent text-white" : "bg-inferay-surface-2 text-inferay-text-2 hover:bg-inferay-surface-3"}`}
									>
										{n}
									</button>
								))}
							</div>
						</DropdownMenu>
					)}
				</div>

				<div className="relative" ref={refs.newMenu}>
					<MenuTrigger
						onClick={() => toggleMenu("newMenu")}
						icon={<IconPlus size={12} />}
						label="New"
						isOpen={menus.newMenu}
						variant="primary"
					/>
					{menus.newMenu && (
						<DropdownMenu className="right-0 min-w-[100px]">
							{NEW_PANE_AGENT_KINDS.map((kind) => (
								<button
									type="button"
									key={kind}
									onClick={() => {
										onAddPane(kind);
										closeMenu("newMenu");
									}}
									className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-inferay-text-2 hover:bg-inferay-surface-2 transition-colors"
								>
									{getAgentIcon(kind, 12)}
									<span>{getAgentDefinition(kind).label}</span>
								</button>
							))}
						</DropdownMenu>
					)}
				</div>
			</div>
		</div>
	);
});
