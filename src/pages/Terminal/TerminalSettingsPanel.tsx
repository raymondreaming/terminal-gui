import { memo, useCallback, useEffect, useRef, useState } from "react";
import { fetchJsonOr } from "../../lib/fetch-json.ts";
import {
	APP_THEMES,
	type AppThemeId,
	applyAppTheme,
	loadAppThemeId,
	mapAppThemeToTerminalTheme,
	saveAppThemeId,
} from "../../lib/app-theme.ts";
import {
	type CustomThemeColors,
	type HexColor,
	loadCustomTheme,
	loadTerminalState,
	saveCustomTheme,
	saveTerminalState,
	type ThemeId,
} from "../../lib/terminal-utils.ts";

interface TerminalSettingsPanelProps {
	themeId: ThemeId;
	onThemeChange: (id: ThemeId) => void;
	onClose: () => void;
}

function ColorInput({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (v: HexColor) => void;
}) {
	return (
		<label className="flex items-center gap-2">
			<input
				type="color"
				value={value}
				onChange={(e) => onChange(e.target.value as HexColor)}
				className="h-7 w-7 cursor-pointer rounded border border-inferay-border bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-none"
			/>
			<span className="text-[10px] text-inferay-text-3">{label}</span>
			<span className="ml-auto font-mono text-[9px] text-inferay-text-3">
				{value}
			</span>
		</label>
	);
}

function ThemeOrb({
	theme,
	selected,
	onClick,
	dashed,
}: {
	theme: {
		id: string;
		name: string;
		colors: { accent: string; bg: string; surface: string };
	};
	selected: boolean;
	onClick: () => void;
	dashed?: boolean;
}) {
	const { accent, bg, surface } = theme.colors;
	return (
		<button
			type="button"
			onClick={onClick}
			className={`group flex flex-col items-center gap-1.5 rounded-xl border p-2 transition-all ${
				selected
					? "border-inferay-border-bold bg-inferay-surface/40"
					: "border-transparent hover:bg-inferay-surface-2"
			}`}
		>
			<div
				className={`relative h-12 w-12 rounded-full ${dashed ? "border border-dashed border-inferay-border" : ""}`}
				style={{ backgroundColor: bg }}
			>
				<div
					className="absolute inset-0 rounded-full transition-transform group-hover:scale-105"
					style={{
						background: `radial-gradient(circle at 35% 35%, ${accent}ee, ${accent}88 40%, ${surface}44 70%, transparent 100%)`,
						boxShadow: selected
							? `0 0 16px 2px ${accent}60, inset 0 0 8px ${accent}30`
							: `0 0 10px 1px ${accent}25`,
					}}
				/>
				<div
					className="absolute rounded-full"
					style={{
						top: "18%",
						left: "22%",
						width: "28%",
						height: "22%",
						background: `radial-gradient(ellipse at center, rgba(255,255,255,0.55), transparent 70%)`,
						filter: "blur(1.5px)",
					}}
				/>
			</div>
			<span
				className={`text-[9px] leading-none ${selected ? "font-semibold text-inferay-text" : "text-inferay-text-3"}`}
			>
				{theme.name}
			</span>
		</button>
	);
}

function SearchFoldersSection() {
	const [folders, setFolders] = useState<string[]>([]);
	const [newFolder, setNewFolder] = useState("");
	const [loaded, setLoaded] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		fetchJsonOr<{ folders: string[] }>("/api/config/search-folders", {
			folders: [],
		}).then((data) => {
			setFolders(data.folders);
			setLoaded(true);
		});
	}, []);

	const saveFolders = useCallback(async (next: string[]) => {
		setFolders(next);
		await fetch("/api/config/search-folders", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ folders: next }),
		});
	}, []);

	const addFolder = useCallback(() => {
		const trimmed = newFolder.trim();
		if (!trimmed || folders.includes(trimmed)) return;
		saveFolders([...folders, trimmed]);
		setNewFolder("");
		inputRef.current?.focus();
	}, [newFolder, folders, saveFolders]);

	const removeFolder = useCallback(
		(idx: number) => {
			saveFolders(folders.filter((_, i) => i !== idx));
		},
		[folders, saveFolders]
	);

	const browseFolder = useCallback(async () => {
		try {
			const res = await fetch("/api/config/pick-folder", { method: "POST" });
			const { folder } = (await res.json()) as { folder: string | null };
			if (folder && !folders.includes(folder)) {
				saveFolders([...folders, folder]);
			}
		} catch {}
	}, [folders, saveFolders]);

	if (!loaded) return null;

	return (
		<div>
			<h4 className="mb-2 text-[10px] font-semibold text-inferay-text-2">
				SEARCH FOLDERS
			</h4>
			<p className="mb-2 text-[9px] text-inferay-text-3">
				Directories to scan when searching for projects. Use ~/path for
				home-relative paths.
			</p>
			<div className="space-y-1 max-h-32 overflow-y-auto mb-2">
				{folders.map((folder, idx) => (
					<div
						key={folder}
						className="flex items-center gap-1.5 rounded px-1.5 py-0.5 group hover:bg-inferay-surface-2"
					>
						<span className="flex-1 truncate font-mono text-[10px] text-inferay-text-2">
							{folder}
						</span>
						<button
							type="button"
							onClick={() => removeFolder(idx)}
							className="opacity-0 group-hover:opacity-100 flex items-center justify-center h-4 w-4 rounded transition-opacity text-inferay-text-3 hover:text-red-400"
							title="Remove"
						>
							<svg
								aria-hidden
								width="8"
								height="8"
								viewBox="0 0 8 8"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
							>
								<path d="M1 1l6 6M7 1l-6 6" />
							</svg>
						</button>
					</div>
				))}
			</div>
			<button
				type="button"
				onClick={browseFolder}
				className="w-full rounded border border-dashed border-inferay-border bg-inferay-bg px-2 py-1.5 text-[10px] text-inferay-text-2 hover:bg-inferay-surface-2 transition-colors mb-1.5"
			>
				+ Browse Folder
			</button>
			<div className="flex gap-1.5">
				<input
					ref={inputRef}
					type="text"
					value={newFolder}
					onChange={(e) => setNewFolder(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") addFolder();
					}}
					placeholder="~/path/to/folder"
					className="flex-1 rounded border border-inferay-border bg-inferay-bg px-2 py-1 text-[10px] text-inferay-text-2 outline-none placeholder:text-inferay-text-3"
				/>
				<button
					type="button"
					onClick={addFolder}
					disabled={!newFolder.trim()}
					className="rounded border border-inferay-border bg-inferay-bg px-2 py-1 text-[10px] text-inferay-text-2 hover:bg-inferay-surface-2 disabled:opacity-30"
				>
					Add
				</button>
			</div>
		</div>
	);
}

export const TerminalSettingsPanel = memo(function TerminalSettingsPanel({
	themeId,
	onThemeChange,
	onClose,
}: TerminalSettingsPanelProps) {
	const [appThemeId, setAppThemeId] = useState<AppThemeId>(loadAppThemeId);

	const handleThemeChange = useCallback(
		(id: AppThemeId) => {
			setAppThemeId(id);
			saveAppThemeId(id);
			applyAppTheme(id);
			const termThemeId = mapAppThemeToTerminalTheme(id);
			onThemeChange(termThemeId);
			const state = loadTerminalState();
			if (state) {
				saveTerminalState({ ...state, themeId: termThemeId });
				window.dispatchEvent(new Event("terminal-shell-change"));
			}
		},
		[onThemeChange]
	);

	const [custom, setCustom] = useState<CustomThemeColors>(loadCustomTheme);
	const updateCustom = useCallback(
		(patch: Partial<CustomThemeColors>) => {
			setCustom((prev) => {
				const next = { ...prev, ...patch };
				saveCustomTheme(next);
				if (themeId === "custom") {
					onThemeChange("custom");
					const state = loadTerminalState();
					if (state) {
						saveTerminalState({ ...state, themeId: "custom" });
						window.dispatchEvent(new Event("terminal-shell-change"));
					}
				}
				return next;
			});
		},
		[themeId, onThemeChange]
	);
	useEffect(() => {
		if (themeId === "custom") saveCustomTheme(custom);
	}, [custom, themeId]);
	const isCustom = appThemeId === "custom";

	return (
		<>
			<div
				role="presentation"
				className="fixed inset-0 bg-inferay-bg/30 z-[50]"
				onClick={onClose}
			/>
			<div className="fixed right-3 top-8 z-[51] w-[330px] max-h-[calc(100vh-3rem)] overflow-y-auto rounded-xl border border-inferay-border bg-inferay-bg shadow-2xl">
				<div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2.5 border-b border-inferay-border bg-inferay-bg rounded-t-xl">
					<span className="text-[10px] font-bold tracking-widest text-inferay-text-3">
						THEME
					</span>
					<button
						type="button"
						onClick={onClose}
						className="text-[10px] font-bold text-inferay-text-3 hover:text-inferay-text"
					>
						x
					</button>
				</div>
				<div className="space-y-5 p-4 pb-6">
					<div>
						<div className="grid grid-cols-3 gap-2.5">
							{APP_THEMES.map((t) => (
								<ThemeOrb
									key={t.id}
									theme={t}
									selected={appThemeId === t.id}
									onClick={() => handleThemeChange(t.id)}
								/>
							))}
							<ThemeOrb
								theme={{
									id: "custom",
									name: "Custom",
									colors: {
										accent: custom.cursor,
										surface: custom.bg,
										bg: custom.bg,
									},
								}}
								selected={isCustom}
								onClick={() => handleThemeChange("custom")}
								dashed
							/>
						</div>
					</div>
					{isCustom && (
						<>
							<div className="h-px bg-inferay-border" />
							<div>
								<h4 className="mb-3 text-[10px] font-semibold text-inferay-text-2">
									CUSTOM COLORS
								</h4>
								<div className="space-y-2.5">
									<ColorInput
										label="Background"
										value={custom.bg}
										onChange={(v) => updateCustom({ bg: v })}
									/>
									<ColorInput
										label="Foreground"
										value={custom.fg}
										onChange={(v) => updateCustom({ fg: v })}
									/>
									<ColorInput
										label="Cursor"
										value={custom.cursor}
										onChange={(v) => updateCustom({ cursor: v })}
									/>
									<ColorInput
										label="Separator"
										value={custom.separator}
										onChange={(v) => updateCustom({ separator: v })}
									/>
								</div>
								<div
									className="mt-3 rounded-md p-3 font-mono text-[11px] leading-relaxed border border-inferay-border"
									style={{ backgroundColor: custom.bg, color: custom.fg }}
								>
									<span style={{ color: custom.cursor }}>$</span> terminal-gui
									start
									<br />
									<span style={{ opacity: 0.6 }}>Loading...</span>
									<br />
									<span style={{ color: custom.cursor }}>✓</span> Ready
								</div>
							</div>
						</>
					)}
					<div className="h-px bg-inferay-border" />
					<SearchFoldersSection />
				</div>
			</div>
		</>
	);
});
