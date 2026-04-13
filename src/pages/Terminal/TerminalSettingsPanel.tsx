import { memo, useCallback, useEffect, useState } from "react";
import {
	APP_THEMES,
	type AppThemeId,
	applyAppTheme,
	loadAppThemeId,
	saveAppThemeId,
} from "../../lib/app-theme.ts";
import {
	type CustomThemeColors,
	type HexColor,
	loadCustomTheme,
	saveCustomTheme,
	TERMINAL_FONTS,
	TERMINAL_THEMES,
	type ThemeId,
} from "../../lib/terminal-utils.ts";

interface TerminalSettingsPanelProps {
	themeId: ThemeId;
	fontSize: number;
	fontFamily: string;
	opacity: number;
	onThemeChange: (id: ThemeId) => void;
	onFontSizeChange: (size: number) => void;
	onFontFamilyChange: (family: string) => void;
	onOpacityChange: (opacity: number) => void;
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

const APP_TO_TERMINAL: Record<string, ThemeId> = {
	default: "default",
	nord: "nord",
	dracula: "dracula",
	solarized: "solarized",
	monokai: "monokai",
	github: "github",
	ocean: "ocean",
	rose: "rose",
	light: "light",
	githubLight: "githubLight",
	solarizedLight: "solarizedLight",
	custom: "custom",
};

export const TerminalSettingsPanel = memo(function TerminalSettingsPanel({
	themeId,
	fontSize,
	fontFamily,
	opacity,
	onThemeChange,
	onFontSizeChange,
	onFontFamilyChange,
	onOpacityChange,
	onClose,
}: TerminalSettingsPanelProps) {
	const [appThemeId, setAppThemeId] = useState<AppThemeId>(loadAppThemeId);

	const handleThemeChange = useCallback(
		(id: AppThemeId) => {
			setAppThemeId(id);
			saveAppThemeId(id);
			applyAppTheme(id);
			onThemeChange(APP_TO_TERMINAL[id] ?? "midnight");
		},
		[onThemeChange]
	);

	const [custom, setCustom] = useState<CustomThemeColors>(loadCustomTheme);
	const updateCustom = useCallback(
		(patch: Partial<CustomThemeColors>) => {
			setCustom((prev) => {
				const next = { ...prev, ...patch };
				saveCustomTheme(next);
				if (themeId === "custom") onThemeChange("custom");
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
			<div className="fixed right-3 top-14 z-[51] w-[330px] max-h-[calc(100vh-4rem)] overflow-y-auto rounded-xl border border-inferay-border bg-inferay-bg shadow-2xl">
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
					{/* Unified theme picker */}
					<div>
						<div className="grid grid-cols-3 gap-1.5">
							{APP_THEMES.map((t) => {
								const termTheme = TERMINAL_THEMES.find(
									(tt) => tt.id === (APP_TO_TERMINAL[t.id] ?? "midnight")
								);
								return (
									<button
										type="button"
										key={t.id}
										onClick={() => handleThemeChange(t.id)}
										className={`flex flex-col items-center gap-1 rounded-lg p-1.5 transition-colors ${
											appThemeId === t.id
												? "bg-inferay-accent/15 ring-1 ring-inferay-accent"
												: "hover:bg-inferay-surface-2"
										}`}
									>
										<div className="flex h-8 w-full rounded-md overflow-hidden border border-inferay-border/30">
											<div
												className="flex w-1/2 items-center justify-center"
												style={{ backgroundColor: t.colors.bg }}
											>
												<div
													className="h-1 w-1 rounded-full"
													style={{ backgroundColor: t.colors.accent }}
												/>
											</div>
											<div
												className="flex w-1/2 items-center justify-center"
												style={{
													backgroundColor: termTheme?.bg ?? t.colors.bg,
												}}
											>
												<div
													className="h-0.5 w-4 rounded"
													style={{
														backgroundColor: termTheme?.fg ?? t.colors.text,
													}}
												/>
											</div>
										</div>
										<span
											className={`text-[9px] ${appThemeId === t.id ? "font-semibold text-inferay-text" : "text-inferay-text-2"}`}
										>
											{t.name}
										</span>
									</button>
								);
							})}
							{/* Custom theme card */}
							<button
								type="button"
								onClick={() => handleThemeChange("custom")}
								className={`flex flex-col items-center gap-1 rounded-lg p-1.5 transition-colors ${isCustom ? "bg-inferay-accent/15 ring-1 ring-inferay-accent" : "hover:bg-inferay-surface-2"}`}
							>
								<div
									className="flex h-8 w-full items-center justify-center rounded-md border border-dashed border-inferay-border"
									style={{ backgroundColor: custom.bg }}
								>
									<div className="flex items-center gap-1">
										<div
											className="h-1 w-1 rounded-full"
											style={{ backgroundColor: custom.cursor }}
										/>
										<div
											className="h-0.5 w-6 rounded"
											style={{ backgroundColor: custom.fg }}
										/>
									</div>
								</div>
								<span
									className={`text-[9px] ${isCustom ? "font-semibold text-inferay-text" : "text-inferay-text-2"}`}
								>
									Custom
								</span>
							</button>
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
					{/* Font settings */}
					<div>
						<h4 className="mb-2 text-[10px] font-semibold text-inferay-text-2">
							FONT
						</h4>
						<div className="flex items-center gap-3">
							<select
								value={fontFamily}
								onChange={(e) => onFontFamilyChange(e.target.value)}
								className="rounded-md border border-inferay-border bg-inferay-bg px-2 py-1 text-[11px] text-inferay-text-2 outline-none"
							>
								{TERMINAL_FONTS.map((f) => (
									<option key={f} value={f}>
										{f}
									</option>
								))}
							</select>
							<div className="flex items-center gap-1.5">
								<input
									type="range"
									min={9}
									max={24}
									step={1}
									value={fontSize}
									onChange={(e) => onFontSizeChange(Number(e.target.value))}
									className="w-20"
								/>
								<span className="font-mono text-[10px] text-inferay-text-2">
									{fontSize}
								</span>
							</div>
						</div>
					</div>
					<div className="h-px bg-inferay-border" />
					{/* Opacity */}
					<div>
						<h4 className="mb-2 text-[10px] font-semibold text-inferay-text-2">
							OPACITY
						</h4>
						<div className="flex items-center gap-2">
							<input
								type="range"
								min={0.3}
								max={1}
								step={0.05}
								value={opacity}
								onChange={(e) => onOpacityChange(Number(e.target.value))}
								className="w-32"
							/>
							<span className="font-mono text-[10px] text-inferay-text-2">
								{Math.round(opacity * 100)}%
							</span>
						</div>
					</div>
				</div>
			</div>
		</>
	);
});
