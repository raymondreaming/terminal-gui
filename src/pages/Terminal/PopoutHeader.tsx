import * as stylex from "@stylexjs/stylex";
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
import {
	type AgentKind,
	getPaneTitle,
	getStatusInfo,
	type TerminalGroupModel,
} from "../../lib/terminal-utils.ts";
import { color, controlSize, font } from "../../tokens.stylex.ts";
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
		{...stylex.props(
			styles.sectionHeader,
			border === "border-b" && styles.borderBottom,
			border === "border-t" && styles.borderTop
		)}
	>
		{icon}
		<span {...stylex.props(styles.sectionLabel)}>{label}</span>
		{count > 0 && (
			<span
				{...stylex.props(
					styles.sectionCount,
					color.includes("accent") && styles.accentText,
					color.includes("red") && styles.dangerText
				)}
			>
				{count}
			</span>
		)}
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
		{...stylex.props(styles.dropdown)}
		className={`${stylex.props(styles.dropdown).className ?? ""} ${className}`}
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
		className={stylex.props(styles.menuTrigger).className}
	>
		{icon}
		{label && <span>{label}</span>}
		{chevron && (
			<IconChevronDown
				size={10}
				{...stylex.props(styles.chevron, isOpen && styles.chevronOpen)}
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
		<div {...stylex.props(styles.root)}>
			<IconButton
				size="sm"
				onClick={onRestore}
				title="Restore to main window"
				className={stylex.props(styles.zLayer).className}
			>
				<IconArrowLeft size={14} />
			</IconButton>
			<div {...stylex.props(styles.divider)} />

			<div {...stylex.props(styles.menuShell)} ref={refs.groupMenu}>
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
								{...stylex.props(
									styles.groupRow,
									g.id === selectedGroupId && styles.menuRowActive
								)}
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
										{...stylex.props(styles.groupInput)}
									/>
								) : (
									<button
										type="button"
										onClick={() => {
											onSelectGroup(g.id);
											closeMenu("groupMenu");
										}}
										{...stylex.props(styles.groupSelect)}
									>
										{g.id === selectedGroupId ? (
											<IconFolderOpen
												size={12}
												{...stylex.props(styles.mutedIcon)}
											/>
										) : (
											<IconFolder
												size={12}
												{...stylex.props(styles.mutedIcon)}
											/>
										)}
										<span
											{...stylex.props(
												styles.groupName,
												g.id === selectedGroupId && styles.selectedText
											)}
										>
											{g.name}
										</span>
										<span {...stylex.props(styles.groupCount)}>
											({g.panes.length})
										</span>
									</button>
								)}
								<IconButton
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										setEditingGroupId(g.id);
										setEditingGroupName(g.name);
									}}
									variant="ghost"
									size="xs"
								>
									<IconPencil size={10} />
								</IconButton>
								{groups.length > 1 && (
									<IconButton
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											onRemoveGroup(g.id);
										}}
										variant="danger"
										size="xs"
									>
										<IconTrash size={10} />
									</IconButton>
								)}
							</div>
						))}
						<div {...stylex.props(styles.borderTop)}>
							<button
								type="button"
								onClick={() => {
									onAddGroup(`Group ${groups.length + 1}`);
									closeMenu("groupMenu");
								}}
								{...stylex.props(styles.menuActionRow)}
							>
								<IconPlus size={10} />
								<span>New Group</span>
							</button>
						</div>
					</DropdownMenu>
				)}
			</div>
			<div {...stylex.props(styles.divider)} />

			<div {...stylex.props(styles.paneTabs)}>
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
							<IconTerminal size={13} className="text-inferay-soft-white" />
						);
					return (
						<button
							key={pane.id}
							type="button"
							onClick={() => onSelectPane(pane.id)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") onSelectPane(pane.id);
							}}
							{...stylex.props(
								styles.paneTab,
								isSelected && styles.paneTabActive
							)}
						>
							{paneIcon}
							<span {...stylex.props(styles.paneTitle)}>
								{getPaneTitle(pane)}
							</span>
							<IconButton
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									onRemovePane(pane.id);
								}}
								variant="ghost"
								size="xs"
							>
								<IconX size={10} />
							</IconButton>
						</button>
					);
				})}
			</div>

			<div {...stylex.props(styles.trailingActions)}>
				<div {...stylex.props(styles.relative)} ref={refs.servicesMenu}>
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
								<div {...stylex.props(styles.emptyMenuRow)}>None running</div>
							) : (
								ports.map((p) => (
									<div
										key={`${p.port}-${p.pid}`}
										{...stylex.props(styles.portRow)}
									>
										<IconCircle size={8} {...stylex.props(styles.portDot)} />
										<span {...stylex.props(styles.portNumber)}>:{p.port}</span>
										<span {...stylex.props(styles.portName)}>{p.name}</span>
										<div {...stylex.props(styles.portActions)}>
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

				<div {...stylex.props(styles.relative)} ref={refs.layoutMenu}>
					<MenuTrigger
						onClick={() => toggleMenu("layoutMenu")}
						icon={<IconLayout size={12} />}
						label={`${columns} col`}
						isOpen={menus.layoutMenu}
					/>
					{menus.layoutMenu && (
						<DropdownMenu className="right-0 p-2">
							<span {...stylex.props(styles.sectionLabel)}>Columns</span>
							<div {...stylex.props(styles.layoutGrid)}>
								{[1, 2, 3, 4].map((n) => (
									<button
										type="button"
										key={n}
										onClick={() => onColumnsChange(n)}
										{...stylex.props(
											styles.layoutButton,
											columns === n && styles.layoutButtonActive
										)}
									>
										{n}
									</button>
								))}
							</div>
						</DropdownMenu>
					)}
				</div>

				<div ref={refs.newMenu}>
					<MenuTrigger
						onClick={() => onAddPane("terminal")}
						icon={<IconPlus size={12} />}
						label="New"
						isOpen={false}
						variant="primary"
					/>
				</div>
			</div>
		</div>
	);
});

const styles = stylex.create({
	root: {
		position: "relative",
		display: "flex",
		height: "3.5rem",
		flexShrink: 0,
		alignItems: "center",
		gap: "0.375rem",
		borderBottomWidth: 1,
		borderBottomStyle: "solid",
		borderBottomColor: color.border,
		backgroundColor: color.background,
		paddingTop: controlSize._2,
		paddingInline: {
			default: controlSize._2,
			"@media (min-width: 640px)": controlSize._3,
		},
	},
	zLayer: {
		position: "relative",
		zIndex: 10,
		color: {
			default: color.textSoft,
			":hover": color.textMain,
		},
	},
	divider: {
		position: "relative",
		zIndex: 10,
		width: 1,
		height: font.size_3,
		backgroundColor: color.border,
	},
	menuShell: {
		position: "relative",
		zIndex: 10,
	},
	relative: {
		position: "relative",
	},
	sectionHeader: {
		display: "flex",
		alignItems: "center",
		gap: "0.375rem",
		paddingBlock: "0.375rem",
		paddingInline: controlSize._3,
	},
	borderBottom: {
		borderBottomWidth: 1,
		borderBottomStyle: "solid",
		borderBottomColor: color.border,
	},
	borderTop: {
		borderTopWidth: 1,
		borderTopStyle: "solid",
		borderTopColor: color.border,
	},
	sectionLabel: {
		color: color.textMuted,
		fontSize: font.size_1,
		fontWeight: font.weight_5,
		letterSpacing: "0.08em",
		textTransform: "uppercase",
	},
	sectionCount: {
		fontSize: font.size_1,
	},
	accentText: {
		color: "var(--color-inferay-accent)",
	},
	dangerText: {
		color: color.danger,
	},
	dropdown: {
		position: "absolute",
		top: "100%",
		zIndex: 50,
		marginTop: controlSize._1,
		overflow: "hidden",
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: color.border,
		borderRadius: controlSize._2,
		backgroundColor: color.backgroundRaised,
		boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.6)",
	},
	menuTrigger: {
		display: "flex",
		alignItems: "center",
		gap: controlSize._1,
	},
	chevron: {
		transitionProperty: "transform",
		transitionDuration: "120ms",
	},
	chevronOpen: {
		transform: "rotate(180deg)",
	},
	paneTabs: {
		position: "relative",
		zIndex: 10,
		display: "flex",
		minWidth: 0,
		flex: 1,
		alignItems: "center",
		gap: controlSize._1,
		overflowX: "auto",
		scrollbarWidth: "none",
	},
	paneTab: {
		display: "flex",
		flexShrink: 0,
		cursor: "pointer",
		alignItems: "center",
		gap: "0.375rem",
		borderRadius: "0.375rem",
		color: color.textMuted,
		paddingBlock: "0.375rem",
		paddingInline: "0.625rem",
		transitionProperty: "background-color, color",
		transitionDuration: "120ms",
		backgroundColor: {
			default: "transparent",
			":hover": color.backgroundRaised,
		},
		":hover": {
			color: color.textSoft,
		},
	},
	paneTabActive: {
		backgroundColor: color.controlActive,
		color: color.textMain,
	},
	paneTitle: {
		maxWidth: "80px",
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		fontSize: font.size_3,
		fontWeight: font.weight_5,
	},
	trailingActions: {
		position: "relative",
		zIndex: 10,
		display: "flex",
		flexShrink: 0,
		alignItems: "center",
		gap: "0.375rem",
	},
	groupRow: {
		display: "flex",
		alignItems: "center",
		gap: controlSize._2,
		paddingBlock: "0.375rem",
		paddingInline: controlSize._3,
		transitionProperty: "background-color",
		transitionDuration: "120ms",
		backgroundColor: {
			default: "transparent",
			":hover": color.controlHover,
		},
	},
	menuRowActive: {
		backgroundColor: color.controlActive,
	},
	groupInput: {
		minWidth: 0,
		flex: 1,
		borderWidth: 0,
		backgroundColor: "transparent",
		color: color.textMain,
		fontSize: font.size_3,
		outline: "none",
	},
	groupSelect: {
		display: "flex",
		minWidth: 0,
		flex: 1,
		alignItems: "center",
		gap: controlSize._2,
		textAlign: "left",
	},
	mutedIcon: {
		color: color.textMuted,
	},
	groupName: {
		minWidth: 0,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		color: color.textSoft,
		fontSize: font.size_3,
	},
	selectedText: {
		color: color.textMain,
	},
	groupCount: {
		flexShrink: 0,
		color: color.textMuted,
		fontSize: font.size_2,
	},
	menuActionRow: {
		display: "flex",
		width: "100%",
		alignItems: "center",
		gap: controlSize._2,
		color: color.textMuted,
		fontSize: font.size_3,
		paddingBlock: "0.375rem",
		paddingInline: controlSize._3,
		textAlign: "left",
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
	emptyMenuRow: {
		color: color.textMuted,
		fontSize: font.size_2,
		paddingBlock: "0.375rem",
		paddingInline: controlSize._3,
	},
	portRow: {
		display: "flex",
		alignItems: "center",
		gap: controlSize._2,
		paddingBlock: "0.375rem",
		paddingInline: controlSize._3,
		transitionProperty: "background-color",
		transitionDuration: "120ms",
		backgroundColor: {
			default: "transparent",
			":hover": color.controlHover,
		},
	},
	portDot: {
		flexShrink: 0,
		color: "var(--color-inferay-accent)",
		fill: "var(--color-inferay-accent)",
	},
	portNumber: {
		flexShrink: 0,
		color: color.textMain,
		fontSize: "0.6875rem",
		fontWeight: font.weight_5,
	},
	portName: {
		minWidth: 0,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		color: color.textMuted,
		fontSize: font.size_2,
	},
	portActions: {
		display: "flex",
		flexShrink: 0,
		alignItems: "center",
		gap: "0.125rem",
		marginLeft: "auto",
	},
	layoutGrid: {
		display: "flex",
		gap: controlSize._1,
		marginTop: controlSize._1,
	},
	layoutButton: {
		display: "flex",
		width: controlSize._6,
		height: controlSize._6,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: "0.25rem",
		backgroundColor: {
			default: color.controlActive,
			":hover": color.controlHover,
		},
		color: color.textSoft,
		fontSize: font.size_2,
		transitionProperty: "background-color, color",
		transitionDuration: "120ms",
	},
	layoutButtonActive: {
		backgroundColor: "var(--color-inferay-accent)",
		color: "#ffffff",
	},
});
