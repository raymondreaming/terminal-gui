import * as stylex from "@stylexjs/stylex";
import type React from "react";
import { useState } from "react";
import { color, controlSize, font } from "../../tokens.stylex.ts";
import { IconPlus, IconX } from "./Icons.tsx";

interface GroupTabItem {
	id: string;
	name: string;
	count?: number;
	icon?: React.ReactNode;
	activeIcon?: React.ReactNode;
}

interface GroupTabsProps {
	items: GroupTabItem[];
	activeId: string | null;
	onSelect: (id: string) => void;
	onRename?: (id: string, name: string) => void;
	onDelete?: (id: string) => void;
	onAdd?: (name: string) => void;
	addLabel?: string;
	canDelete?: (id: string) => boolean;
	compact?: boolean;
}

export function GroupTabs({
	items,
	activeId,
	onSelect,
	onRename,
	onDelete,
	onAdd,
	addLabel = "New",
	canDelete,
	compact = false,
}: GroupTabsProps) {
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editingName, setEditingName] = useState("");
	const [showNew, setShowNew] = useState(false);
	const [newName, setNewName] = useState("");
	const commitRename = (id: string) => {
		if (editingName.trim() && onRename) onRename(id, editingName.trim());
		setEditingId(null);
	};
	const commitAdd = () => {
		if (onAdd) onAdd(newName.trim() || addLabel);
		setShowNew(false);
		setNewName("");
	};
	return (
		<div {...stylex.props(styles.root)}>
			<div
				{...stylex.props(
					styles.list,
					compact ? styles.listCompact : styles.listDefault
				)}
			>
				{items.map((item, index) => {
					const isActive = item.id === activeId;
					const deletable = canDelete ? canDelete(item.id) : items.length > 1;
					const showDivider =
						index > 0 && !isActive && items[index - 1]?.id !== activeId;
					return (
						<div key={item.id} {...stylex.props(styles.itemWrap)}>
							{showDivider && (
								<div
									{...stylex.props(
										styles.divider,
										compact ? styles.dividerCompact : styles.dividerDefault
									)}
								/>
							)}
							<div
								role="button"
								tabIndex={0}
								onClick={() => onSelect(item.id)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										onSelect(item.id);
									}
								}}
								{...stylex.props(
									styles.tab,
									isActive ? styles.tabActive : styles.tabIdle,
									compact ? styles.tabCompact : styles.tabDefault
								)}
							>
								{item.activeIcon && item.icon
									? isActive
										? item.activeIcon
										: item.icon
									: item.icon}
								{editingId === item.id ? (
									<input
										ref={(el) => el?.focus()}
										value={editingName}
										onChange={(e) => setEditingName(e.target.value)}
										onBlur={() => commitRename(item.id)}
										onKeyDown={(e) => {
											if (e.key === "Enter") commitRename(item.id);
											if (e.key === "Escape") setEditingId(null);
										}}
										onClick={(e) => e.stopPropagation()}
										{...stylex.props(styles.inlineInput)}
									/>
								) : (
									<span
										onDoubleClick={(e) => {
											if (!onRename) return;
											e.stopPropagation();
											setEditingId(item.id);
											setEditingName(item.name);
										}}
									>
										{item.name}
									</span>
								)}
								{item.count !== undefined && (
									<span
										{...stylex.props(
											styles.count,
											isActive ? styles.countActive : styles.countIdle
										)}
									>
										{item.count}
									</span>
								)}
								{deletable && onDelete && editingId !== item.id && (
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											onDelete(item.id);
										}}
										{...stylex.props(styles.deleteButton)}
									>
										<IconX size={8} />
									</button>
								)}
							</div>
						</div>
					);
				})}
			</div>
			{onAdd && !showNew && (
				<button
					type="button"
					onClick={() => setShowNew(true)}
					{...stylex.props(
						styles.addButton,
						compact ? styles.addButtonCompact : styles.addButtonDefault
					)}
				>
					<IconPlus size={compact ? 8 : 10} />
				</button>
			)}
			{showNew && (
				<div
					{...stylex.props(
						styles.newWrap,
						compact ? styles.listCompact : styles.listDefault
					)}
				>
					<div
						{...stylex.props(
							styles.newInner,
							compact ? styles.newInnerCompact : styles.newInnerDefault
						)}
					>
						<input
							ref={(el) => el?.focus()}
							value={newName}
							onChange={(e) => setNewName(e.target.value)}
							onBlur={() => {
								if (!newName.trim()) {
									setShowNew(false);
									setNewName("");
								} else {
									commitAdd();
								}
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter") commitAdd();
								if (e.key === "Escape") {
									setShowNew(false);
									setNewName("");
								}
							}}
							placeholder={addLabel}
							{...stylex.props(styles.inlineInput)}
						/>
						<button
							type="button"
							onClick={() => {
								setShowNew(false);
								setNewName("");
							}}
							{...stylex.props(styles.dismissButton)}
						>
							<IconX size={8} />
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

const styles = stylex.create({
	root: {
		alignItems: "center",
		display: "flex",
		gap: "0.375rem",
	},
	list: {
		alignItems: "center",
		backgroundColor: color.backgroundRaised,
		borderColor: color.border,
		borderRadius: 8,
		borderStyle: "solid",
		borderWidth: 1,
		display: "flex",
		overflow: "hidden",
	},
	listCompact: {
		height: controlSize._6,
	},
	listDefault: {
		height: controlSize._7,
	},
	itemWrap: {
		alignItems: "center",
		display: "flex",
		height: "100%",
	},
	divider: {
		backgroundColor: "rgba(255, 255, 255, 0.04)",
		width: 1,
	},
	dividerCompact: {
		height: controlSize._3,
	},
	dividerDefault: {
		height: "0.875rem",
	},
	tab: {
		alignItems: "center",
		cursor: "pointer",
		display: "flex",
		fontWeight: font.weight_5,
		height: "100%",
		position: "relative",
		transitionDuration: "150ms",
		transitionProperty: "background-color, color",
		transitionTimingFunction: "ease",
	},
	tabCompact: {
		fontSize: font.size_2,
		gap: controlSize._1,
		paddingInline: controlSize._2,
	},
	tabDefault: {
		fontSize: font.size_3,
		gap: "0.375rem",
		paddingInline: "0.625rem",
	},
	tabIdle: {
		backgroundColor: {
			default: "transparent",
			":hover": "rgba(255, 255, 255, 0.04)",
		},
		color: {
			default: color.textMuted,
			":hover": color.textSoft,
		},
	},
	tabActive: {
		backgroundColor: color.controlActive,
		color: color.textMain,
	},
	inlineInput: {
		appearance: "none",
		backgroundColor: "transparent",
		borderWidth: 0,
		boxShadow: "none",
		caretColor: color.textMain,
		color: color.textMain,
		fontSize: font.size_3,
		outline: "none",
		width: 80,
		"::placeholder": {
			color: color.textMuted,
		},
	},
	count: {
		borderRadius: 6,
		fontSize: font.size_2,
		fontWeight: "600",
		fontVariantNumeric: "tabular-nums",
		marginLeft: "-0.125rem",
		paddingBlock: "0.125rem",
		paddingInline: "0.375rem",
	},
	countIdle: {
		backgroundColor: "rgba(255, 255, 255, 0.05)",
		color: color.textMuted,
	},
	countActive: {
		backgroundColor: color.controlActive,
		color: color.textMain,
	},
	deleteButton: {
		borderRadius: 4,
		color: {
			default: color.textMuted,
			":hover": color.danger,
		},
		marginLeft: "0.125rem",
		opacity: {
			default: 0.45,
			":hover": 1,
		},
		padding: "0.125rem",
		transitionDuration: "150ms",
		transitionProperty: "color, opacity",
		transitionTimingFunction: "ease",
	},
	addButton: {
		alignItems: "center",
		backgroundColor: {
			default: color.backgroundRaised,
			":hover": color.controlHover,
		},
		borderColor: color.border,
		borderRadius: 8,
		borderStyle: "solid",
		borderWidth: 1,
		color: {
			default: color.textMuted,
			":hover": color.textSoft,
		},
		display: "flex",
		justifyContent: "center",
		transitionDuration: "150ms",
		transitionProperty: "background-color, color",
		transitionTimingFunction: "ease",
	},
	addButtonCompact: {
		height: controlSize._6,
		width: controlSize._6,
	},
	addButtonDefault: {
		height: controlSize._7,
		width: controlSize._7,
	},
	newWrap: {
		alignItems: "center",
		backgroundColor: color.controlActive,
		borderColor: color.border,
		borderRadius: 8,
		borderStyle: "solid",
		borderWidth: 1,
		display: "flex",
		overflow: "hidden",
	},
	newInner: {
		alignItems: "center",
		display: "flex",
		gap: "0.375rem",
		height: "100%",
	},
	newInnerCompact: {
		paddingInline: "0.375rem",
	},
	newInnerDefault: {
		paddingInline: controlSize._2,
	},
	dismissButton: {
		color: {
			default: color.textMuted,
			":hover": color.textSoft,
		},
	},
});
