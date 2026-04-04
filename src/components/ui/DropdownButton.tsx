import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconCheck, IconChevronDown } from "./Icons.tsx";

interface DropdownOption {
	id: string;
	label: string;
	detail?: string;
	status?: string;
	icon?: React.ReactNode;
}

interface DropdownButtonProps {
	value: string | null;
	options: DropdownOption[];
	onChange: (id: string) => void;
	placeholder?: string;
	icon?: React.ReactNode;
	emptyLabel?: string;
	minWidth?: number;
	fullWidth?: boolean;
	renderOption?: (opt: DropdownOption, isSelected: boolean) => React.ReactNode;
}

function DropdownCustomOption({
	opt,
	isSelected,
	renderOption,
	onChange,
	setOpen,
}: {
	opt: DropdownOption;
	isSelected: boolean;
	renderOption: (opt: DropdownOption, isSelected: boolean) => React.ReactNode;
	onChange: (id: string) => void;
	setOpen: (v: boolean) => void;
}) {
	return (
		<div
			role="button"
			tabIndex={0}
			onClick={() => {
				onChange(opt.id);
				setOpen(false);
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onChange(opt.id);
					setOpen(false);
				}
			}}
			className="cursor-pointer"
		>
			{renderOption(opt, isSelected)}
		</div>
	);
}

export function DropdownButton({
	value,
	options,
	onChange,
	placeholder = "Select...",
	icon,
	emptyLabel = "No options",
	minWidth = 220,
	fullWidth = false,
	renderOption,
}: DropdownButtonProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const btnRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const [pos, setPos] = useState({ top: 0, left: 0, width: 0, maxH: 300 });
	useEffect(() => {
		if (!open) return;
		const handleClick = (e: MouseEvent) => {
			if (
				menuRef.current &&
				!menuRef.current.contains(e.target as Node) &&
				!btnRef.current?.contains(e.target as Node)
			) {
				setOpen(false);
			}
		};
		const handleScroll = (e: Event) => {
			if (menuRef.current?.contains(e.target as Node)) return;
			setOpen(false);
		};
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", handleClick);
		window.addEventListener("scroll", handleScroll, true);
		document.addEventListener("keydown", handleKey);
		return () => {
			document.removeEventListener("mousedown", handleClick);
			window.removeEventListener("scroll", handleScroll, true);
			document.removeEventListener("keydown", handleKey);
		};
	}, [open]);
	const toggle = () => {
		if (!open && btnRef.current) {
			const rect = btnRef.current.getBoundingClientRect();
			const spaceBelow = window.innerHeight - rect.bottom - 8;
			setPos({
				top: rect.bottom + 4,
				left: rect.left,
				width: Math.max(rect.width, minWidth),
				maxH: Math.min(spaceBelow, 400),
			});
			setSearch("");
			setTimeout(() => searchRef.current?.focus(), 0);
		}
		setOpen(!open);
	};
	const selected = options.find((o) => o.id === value);
	const showSearch = options.length > 5;
	const filtered = search
		? options.filter(
				(o) =>
					o.label.toLowerCase().includes(search.toLowerCase()) ||
					o.detail?.toLowerCase().includes(search.toLowerCase()) ||
					o.status?.toLowerCase().includes(search.toLowerCase())
			)
		: options;
	return (
		<>
			<button
				type="button"
				ref={btnRef}
				onClick={toggle}
				className={`flex h-7 items-center gap-2 rounded-lg border px-3 text-xs transition-colors ${
					fullWidth ? "w-full" : ""
				} ${
					open
						? "border-surgent-accent/40 bg-surgent-text/[0.08] text-surgent-text"
						: "border-surgent-border bg-surgent-surface hover:border-surgent-border text-surgent-text-2"
				}`}
			>
				{icon}
				<span
					className={`${fullWidth ? "flex-1 truncate text-left" : ""} ${selected ? "text-surgent-text" : "text-surgent-text-3"}`}
				>
					{selected?.label || placeholder}
				</span>
				<IconChevronDown
					size={10}
					className={`shrink-0 text-surgent-text-3 transition-transform ${open ? "rotate-180" : ""}`}
				/>
			</button>
			{open &&
				createPortal(
					<div
						ref={menuRef}
						className="fixed z-50 rounded-xl border border-surgent-border bg-surgent-surface/95 shadow-2xl backdrop-blur-xl overflow-hidden"
						style={{
							top: pos.top,
							left: pos.left,
							minWidth: pos.width,
							maxHeight: pos.maxH,
						}}
					>
						{showSearch && (
							<div className="border-b border-surgent-border px-2 py-1.5">
								<input
									ref={searchRef}
									type="text"
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									placeholder="Search..."
									className="w-full rounded-md border border-surgent-border/50 bg-surgent-surface/50 px-2.5 py-1.5 text-xs text-surgent-text placeholder-surgent-text-3 outline-none focus:border-surgent-accent/40"
									onKeyDown={(e) => {
										if (e.key === "Escape") {
											setOpen(false);
										}
									}}
								/>
							</div>
						)}
						<div
							className="overflow-y-auto py-1"
							style={{ maxHeight: pos.maxH - (showSearch ? 42 : 2) }}
						>
							{filtered.length === 0 ? (
								<p className="px-3 py-4 text-center text-xs text-surgent-text-3">
									{search ? "No matches" : emptyLabel}
								</p>
							) : (
								filtered.map((opt) =>
									renderOption ? (
										<DropdownCustomOption
											key={opt.id}
											opt={opt}
											isSelected={opt.id === value}
											renderOption={renderOption}
											onChange={onChange}
											setOpen={setOpen}
										/>
									) : (
										<button
											type="button"
											key={opt.id}
											onClick={() => {
												onChange(opt.id);
												setOpen(false);
											}}
											className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
												opt.id === value
													? "bg-surgent-accent/15 text-surgent-text"
													: "text-surgent-text-3 hover:bg-surgent-text/5 hover:text-surgent-text"
											}`}
										>
											{opt.id === value && (
												<IconCheck
													size={10}
													className="shrink-0 text-surgent-accent"
												/>
											)}
											{!opt.icon && opt.id !== value && (
												<div className="w-[18px] shrink-0" />
											)}
											{opt.icon && opt.id !== value && (
												<span className="shrink-0 text-surgent-text-3">
													{opt.icon}
												</span>
											)}
											<div>
												<span className="font-medium">{opt.label}</span>
												{opt.detail && (
													<span
														className={`ml-2 rounded-md px-1.5 py-0.5 text-[9px] font-medium ${
															opt.detail.includes("★")
																? "bg-amber-500/15 text-amber-400"
																: opt.detail.includes("Best")
																	? "bg-surgent-accent/15 text-surgent-accent"
																	: "bg-surgent-text/[0.06] text-surgent-text-3"
														}`}
													>
														{opt.detail}
													</span>
												)}
												{opt.status && (
													<span className="ml-2 text-[10px] text-surgent-text-3">
														{opt.status}
													</span>
												)}
											</div>
										</button>
									)
								)
							)}
						</div>
					</div>,
					document.body
				)}
		</>
	);
}
