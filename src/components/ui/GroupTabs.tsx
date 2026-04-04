import type React from "react";
import { useState } from "react";
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
		<div className="flex items-center gap-1.5">
			<div
				className={`flex items-center rounded-lg border border-surgent-border bg-surgent-surface overflow-hidden ${compact ? "h-6" : "h-7"}`}
			>
				{items.map((item, index) => {
					const isActive = item.id === activeId;
					const deletable = canDelete ? canDelete(item.id) : items.length > 1;
					const showDivider =
						index > 0 && !isActive && items[index - 1]?.id !== activeId;
					return (
						<div key={item.id} className="flex h-full items-center">
							{showDivider && (
								<div
									className={`w-px bg-surgent-border/40 ${compact ? "h-3" : "h-3.5"}`}
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
								className={`group relative flex h-full cursor-pointer items-center gap-1 font-medium transition-all ${
									isActive
										? "bg-surgent-text/10 text-surgent-text"
										: "text-surgent-text-3 hover:text-surgent-text-2 hover:bg-surgent-text/[0.04]"
								} ${compact ? "px-2 text-[10px]" : "px-2.5 text-xs gap-1.5"}`}
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
										className="w-20 bg-transparent text-xs text-surgent-text outline-none ring-0 border-0 focus:outline-none focus:ring-0"
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
										className={`-ml-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
											isActive
												? "bg-surgent-text/10 text-surgent-text"
												: "bg-surgent-text/5 text-surgent-text-3"
										}`}
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
										className="ml-0.5 rounded p-0.5 text-surgent-text-3 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
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
					className={`flex items-center justify-center rounded-lg border border-surgent-border bg-surgent-surface text-surgent-text-3 transition-colors hover:bg-surgent-text/[0.06] hover:text-surgent-text-2 ${compact ? "h-6 w-6" : "h-7 w-7"}`}
				>
					<IconPlus size={compact ? 8 : 10} />
				</button>
			)}
			{showNew && (
				<div
					className={`flex items-center rounded-lg border border-surgent-border bg-surgent-text/10 overflow-hidden ${compact ? "h-6" : "h-7"}`}
				>
					<div
						className={`flex h-full items-center gap-1.5 ${compact ? "px-1.5" : "px-2"}`}
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
							className="w-20 appearance-none bg-transparent text-xs text-surgent-text caret-surgent-text placeholder-surgent-text-3 outline-none border-none shadow-none ring-0 ring-transparent focus:outline-none focus:border-none focus:shadow-none focus:ring-0 focus:ring-transparent"
						/>
						<button
							type="button"
							onClick={() => {
								setShowNew(false);
								setNewName("");
							}}
							className="text-surgent-text-3 hover:text-surgent-text-2"
						>
							<IconX size={8} />
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
