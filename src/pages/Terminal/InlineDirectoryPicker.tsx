import type React from "react";
import { useEffect, useReducer, useRef, useState } from "react";
import {
	IconChevronRight,
	IconFolder,
	IconGitBranch,
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
	const inputRef = useRef<HTMLInputElement>(null);
	const isSearching = query.trim().length > 0;
	const displayList = (
		isSearching ? searchState.results : pickerData.quickPicks
	).slice(0, 4);
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
			onSelect(displayList[idx].path);
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
	return (
		<div className="w-[320px] bg-inferay-surface rounded-lg border border-inferay-border overflow-hidden shadow-lg">
			<div className="px-1.5 pt-1.5 pb-1.5">
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
					className="w-full bg-inferay-bg rounded px-2 py-1.5 text-xs text-inferay-text placeholder:text-inferay-text-3 outline-none border border-inferay-border"
				/>
			</div>
			{/* List - fixed height for 4 items to prevent layout shift */}
			<div className="h-[164px] overflow-y-auto">
				{displayList.length === 0 ? (
					<div className="flex items-center justify-center h-full text-xs text-inferay-text-3">
						Nothing matching found
					</div>
				) : (
					displayList.map((pick, i) => (
						<button
							type="button"
							key={pick.path}
							onClick={() => onSelect(pick.path)}
							className={`w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors ${
								i === selectedIndex
									? "bg-inferay-accent/15 text-inferay-text"
									: "text-inferay-text-2 hover:bg-inferay-surface-2"
							}`}
						>
							<span
								className={`shrink-0 ${i === selectedIndex ? "text-inferay-accent" : "text-inferay-text-3"}`}
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
								<span className="block truncate text-[9px] text-inferay-text-3">
									{shortenPath(pick.path)}
								</span>
							</div>
							<IconChevronRight
								size={10}
								className="text-inferay-text-3 shrink-0"
							/>
						</button>
					))
				)}
			</div>
			{loading && (
				<div className="absolute right-3 top-3">
					<div className="w-3 h-3 border border-inferay-text-3 border-t-transparent rounded-full animate-spin" />
				</div>
			)}
		</div>
	);
}
