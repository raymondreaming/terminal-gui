import type React from "react";
import { useEffect, useReducer, useRef, useState } from "react";
import {
	IconChevronRight,
	IconFolder,
	IconGitBranch,
	IconX,
} from "../../components/ui/Icons.tsx";
import { fetchJsonOr } from "../../lib/fetch-json.ts";

interface QuickPick {
	name: string;
	path: string;
	isGitRepo: boolean;
}

interface InlineDirectoryPickerProps {
	onSelect: (path: string | null) => void;
	onCancel: () => void;
	multiSelect?: boolean;
	onMultiSelect?: (paths: string[]) => void;
	hideInput?: boolean;
}

interface SearchState {
	results: QuickPick[];
	selectedIndex: number;
	loading: boolean;
}

type SearchAction =
	| { type: "reset" }
	| { type: "startLoading" }
	| { type: "setResults"; results: QuickPick[] }
	| { type: "error" }
	| { type: "selectNext"; count: number }
	| { type: "selectPrev"; count: number };

const INITIAL_SEARCH_STATE: SearchState = {
	results: [],
	selectedIndex: -1,
	loading: false,
};

function searchReducer(state: SearchState, action: SearchAction): SearchState {
	switch (action.type) {
		case "reset":
			return INITIAL_SEARCH_STATE;
		case "startLoading":
			return { ...state, loading: true };
		case "setResults":
			return { results: action.results, loading: false, selectedIndex: 0 };
		case "error":
			return { results: [], loading: false, selectedIndex: -1 };
		case "selectNext":
			return {
				...state,
				selectedIndex: (state.selectedIndex + 1) % action.count,
			};
		case "selectPrev":
			return {
				...state,
				selectedIndex: (state.selectedIndex - 1 + action.count) % action.count,
			};
	}
}

export function InlineDirectoryPicker({
	onSelect,
	onCancel,
	multiSelect,
	onMultiSelect,
	hideInput,
}: InlineDirectoryPickerProps) {
	const [query, setQuery] = useState("");
	const [pickerData, setPickerData] = useState<{
		quickPicks: QuickPick[];
		homePath: string;
	}>({ quickPicks: [], homePath: "" });
	const [searchState, dispatchSearch] = useReducer(
		searchReducer,
		INITIAL_SEARCH_STATE
	);
	const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
	const inputRef = useRef<HTMLInputElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const isSearching = query.trim().length > 0;
	const displayList = (
		isSearching ? searchState.results : pickerData.quickPicks
	)
		.filter((p) => !multiSelect || !selectedPaths.includes(p.path))
		.slice(0, 4);
	const itemCount = displayList.length;
	const selectedIndex = searchState.selectedIndex;
	const loading = searchState.loading;

	useEffect(() => {
		const controller = new AbortController();
		const fetchQuickPicks = async () => {
			try {
				const data = await fetchJsonOr<{
					quickPicks?: QuickPick[];
					home?: string;
				}>(
					"/api/terminal/directories?quickPicks=true",
					{},
					{ signal: controller.signal }
				);
				setPickerData({
					quickPicks: data.quickPicks || [],
					homePath: data.home || "",
				});
			} catch {
				if (!controller.signal.aborted)
					setPickerData((prev) => ({ ...prev, quickPicks: [] }));
			}
		};
		fetchQuickPicks();
		setTimeout(() => inputRef.current?.focus(), 10);
		return () => controller.abort();
	}, []);

	useEffect(() => {
		if (!query.trim()) {
			dispatchSearch({ type: "reset" });
			return;
		}
		const controller = new AbortController();
		const timer = setTimeout(async () => {
			dispatchSearch({ type: "startLoading" });
			try {
				const data = await fetchJsonOr<{
					directories?: Array<{ name: string; path: string }>;
				}>(
					`/api/terminal/directories?q=${encodeURIComponent(query.trim())}`,
					{},
					{ signal: controller.signal }
				);
				dispatchSearch({
					type: "setResults",
					results: (data.directories || []).map((d: any) => ({
						name: d.name,
						path: d.path,
						isGitRepo: false,
					})),
				});
			} catch {
				if (!controller.signal.aborted) {
					dispatchSearch({ type: "error" });
				}
			}
		}, 120);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	}, [query]);

	const togglePath = (path: string) => {
		setSelectedPaths((prev) =>
			prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
		);
	};

	const handleItemClick = (path: string) => {
		if (multiSelect) {
			togglePath(path);
			setQuery("");
		} else {
			onSelect(path);
		}
	};

	const handleStart = () => {
		if (selectedPaths.length > 0 && onMultiSelect) {
			onMultiSelect(selectedPaths);
		} else if (selectedPaths.length === 1) {
			onSelect(selectedPaths[0]!);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (itemCount === 0) {
			if (e.key === "Escape") {
				e.preventDefault();
				onCancel();
			}
			return;
		}
		if (e.key === "ArrowDown" || e.key === "Tab") {
			e.preventDefault();
			dispatchSearch({ type: "selectNext", count: itemCount });
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			dispatchSearch({ type: "selectPrev", count: itemCount });
		} else if (e.key === "Enter") {
			e.preventDefault();
			const idx = selectedIndex >= 0 ? selectedIndex : 0;
			const path = displayList[idx]?.path;
			if (path) handleItemClick(path);
		} else if (e.key === "Escape") {
			e.preventDefault();
			onCancel();
		}
	};

	const shortenPath = (path: string) => {
		if (pickerData.homePath && path.startsWith(pickerData.homePath)) {
			return `~${path.slice(pickerData.homePath.length)}`;
		}
		return path;
	};

	const nameFromPath = (path: string) => path.split("/").pop() || path;

	const showResults = true;

	if (hideInput) {
		return (
			<div className="w-full overflow-hidden rounded-xl border border-inferay-gray-border bg-inferay-dark-gray/95 shadow-lg">
				<div className="max-h-[210px] overflow-y-auto py-1">
					{displayList.map((pick, i) => (
						<button
							type="button"
							key={pick.path}
							onClick={() => handleItemClick(pick.path)}
							className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
								i === selectedIndex
									? "bg-inferay-white/[0.06] text-inferay-white"
									: "text-inferay-soft-white hover:bg-inferay-white/[0.04]"
							}`}
						>
							<span
								className={`shrink-0 ${i === selectedIndex ? "text-inferay-accent" : "text-inferay-muted-gray"}`}
							>
								{pick.isGitRepo ? (
									<IconGitBranch size={13} />
								) : (
									<IconFolder size={13} />
								)}
							</span>
							<div className="min-w-0 flex-1">
								<span className="block truncate text-[12px] font-medium">
									{pick.name}
								</span>
								<span className="block truncate text-[10px] text-inferay-muted-gray">
									{shortenPath(pick.path)}
								</span>
							</div>
							<IconChevronRight
								size={11}
								className="shrink-0 text-inferay-muted-gray/70"
							/>
						</button>
					))}
				</div>
				{multiSelect && selectedPaths.length > 0 && (
					<div className="flex items-center gap-2 border-t border-inferay-gray-border/60 px-3 py-2">
						<div className="flex min-w-0 flex-1 flex-wrap gap-1 overflow-hidden">
							{selectedPaths.slice(0, 3).map((p) => (
								<span
									key={p}
									className="inline-flex max-w-[140px] items-center gap-1 rounded-md bg-inferay-white/[0.05] px-1.5 py-0.5 text-[9px] font-medium text-inferay-soft-white"
								>
									<span className="truncate">{nameFromPath(p)}</span>
									<button
										type="button"
										onClick={() => togglePath(p)}
										className="shrink-0 text-inferay-muted-gray hover:text-inferay-white"
									>
										<IconX size={8} />
									</button>
								</span>
							))}
							{selectedPaths.length > 3 && (
								<span className="text-[9px] text-inferay-muted-gray">
									+{selectedPaths.length - 3}
								</span>
							)}
						</div>
						<button
							type="button"
							onClick={handleStart}
							className="shrink-0 rounded-md border border-inferay-gray-border bg-inferay-gray px-2 py-1 text-[10px] font-medium text-inferay-soft-white transition-colors hover:bg-inferay-light-gray"
						>
							Start
						</button>
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="relative w-full" ref={containerRef}>
			{/* Results popout — above the input */}
			{showResults && itemCount > 0 && (
				<div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-inferay-gray-border bg-inferay-dark-gray shadow-lg overflow-hidden z-10">
					<div className="max-h-[180px] overflow-y-auto">
						{displayList.map((pick, i) => (
							<button
								type="button"
								key={pick.path}
								onMouseDown={(e) => e.preventDefault()}
								onClick={() => handleItemClick(pick.path)}
								className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors ${
									i === selectedIndex
										? "bg-inferay-accent/15 text-inferay-white"
										: "text-inferay-soft-white hover:bg-inferay-gray"
								}`}
							>
								<span
									className={`shrink-0 ${i === selectedIndex ? "text-inferay-accent" : "text-inferay-muted-gray"}`}
								>
									{pick.isGitRepo ? (
										<IconGitBranch size={12} />
									) : (
										<IconFolder size={12} />
									)}
								</span>
								<div className="flex-1 min-w-0">
									<span className="block truncate text-xs font-medium">
										{pick.name}
									</span>
									<span className="block truncate text-[9px] text-inferay-muted-gray">
										{shortenPath(pick.path)}
									</span>
								</div>
								<IconChevronRight
									size={10}
									className="text-inferay-muted-gray shrink-0"
								/>
							</button>
						))}
					</div>
					{loading && (
						<div className="absolute right-2 top-2">
							<div className="w-3 h-3 border border-inferay-muted-gray border-t-transparent rounded-full animate-spin" />
						</div>
					)}
				</div>
			)}

			{/* Selected tags */}
			{multiSelect && selectedPaths.length > 0 && (
				<div className="mb-1.5">
					<div className="flex flex-wrap gap-1 max-h-[60px] overflow-y-auto">
						{selectedPaths.map((p, i) => (
							<span
								key={p}
								className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-inferay-gray text-inferay-soft-white border border-inferay-gray-border"
							>
								{i === 0 ? "● " : ""}
								{nameFromPath(p)}
								<button
									type="button"
									onClick={() => togglePath(p)}
									className="hover:text-inferay-white transition-colors"
								>
									<IconX size={8} />
								</button>
							</span>
						))}
					</div>
				</div>
			)}

			{/* Input — styled like chat message input */}
			<div className="flex items-center gap-2 rounded-xl border border-inferay-gray-border bg-inferay-dark-gray px-3 py-2">
				<span className="shrink-0 text-inferay-muted-gray">
					<IconFolder size={14} />
				</span>
				<input
					ref={inputRef}
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="Search folder..."
					autoComplete="off"
					autoCorrect="off"
					autoCapitalize="off"
					spellCheck={false}
					className="flex-1 bg-transparent text-[13px] text-inferay-white placeholder:text-inferay-muted-gray outline-none"
				/>
				{multiSelect && selectedPaths.length > 0 && (
					<button
						type="button"
						onClick={handleStart}
						className="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-medium bg-inferay-gray text-inferay-soft-white hover:bg-inferay-light-gray transition-colors border border-inferay-gray-border"
					>
						Start{selectedPaths.length > 1 ? ` (${selectedPaths.length})` : ""}
					</button>
				)}
			</div>
		</div>
	);
}
