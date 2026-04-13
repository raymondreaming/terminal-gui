import {
	readStoredJson,
	readStoredValue,
	writeStoredValue,
} from "./stored-json.ts";

export interface AppThemeColors {
	readonly bg: string;
	readonly surface: string;
	readonly surface2: string;
	readonly surface3: string;
	readonly border: string;
	readonly borderBold: string;
	readonly accent: string;
	readonly accentHover: string;
	readonly success: string;
	readonly warning: string;
	readonly error: string;
	readonly info: string;
	readonly text: string;
	readonly text2: string;
	readonly text3: string;
}

export interface AppTheme {
	readonly id: AppThemeId;
	readonly name: string;
	readonly colors: AppThemeColors;
	readonly light?: boolean;
}

const APP_THEME_IDS = {
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
} as const;

export type AppThemeId = (typeof APP_THEME_IDS)[keyof typeof APP_THEME_IDS];

const CSS_VAR_MAP: Record<keyof AppThemeColors, string> = {
	bg: "--color-surgent-bg",
	surface: "--color-surgent-surface",
	surface2: "--color-surgent-surface-2",
	surface3: "--color-surgent-surface-3",
	border: "--color-surgent-border",
	borderBold: "--color-surgent-border-bold",
	accent: "--color-surgent-accent",
	accentHover: "--color-surgent-accent-hover",
	success: "--color-surgent-success",
	warning: "--color-surgent-warning",
	error: "--color-surgent-error",
	info: "--color-surgent-info",
	text: "--color-surgent-text",
	text2: "--color-surgent-text-2",
	text3: "--color-surgent-text-3",
};

// Compact theme data: [id, name, bg, surface, surface2, surface3, border, borderBold, accent, accentHover, success, warning, error, info, text, text2, text3, light?]
type ThemeTuple = [AppThemeId, string, ...string[]] & { length: 17 | 18 };

function makeTheme(t: ThemeTuple): AppTheme {
	return {
		id: t[0],
		name: t[1],
		...(t.length === 18 ? { light: true } : {}),
		colors: {
			bg: t[2],
			surface: t[3],
			surface2: t[4],
			surface3: t[5],
			border: t[6],
			borderBold: t[7],
			accent: t[8],
			accentHover: t[9],
			success: t[10],
			warning: t[11],
			error: t[12],
			info: t[13],
			text: t[14],
			text2: t[15],
			text3: t[16],
		},
	};
}

// prettier-ignore
const THEME_DATA = [
	[
		"default",
		"Default Dark",
		"#000000",
		"#1c1c1e",
		"#2c2c2e",
		"#3a3a3c",
		"rgba(255, 255, 255, 0.08)",
		"rgba(255, 255, 255, 0.15)",
		"#007AFF",
		"#0A84FF",
		"#30D158",
		"#FF9F0A",
		"#FF453A",
		"#64D2FF",
		"#F5F5F7",
		"rgba(255, 255, 255, 0.55)",
		"rgba(255, 255, 255, 0.3)",
	],
	[
		"nord",
		"Nord",
		"#2e3440",
		"#3b4252",
		"#434c5e",
		"#4c566a",
		"rgba(216, 222, 233, 0.08)",
		"rgba(216, 222, 233, 0.15)",
		"#88c0d0",
		"#8fbcbb",
		"#a3be8c",
		"#ebcb8b",
		"#bf616a",
		"#81a1c1",
		"#eceff4",
		"rgba(216, 222, 233, 0.60)",
		"rgba(216, 222, 233, 0.35)",
	],
	[
		"dracula",
		"Dracula",
		"#282a36",
		"#343746",
		"#3e4155",
		"#4a4d64",
		"rgba(248, 248, 242, 0.08)",
		"rgba(248, 248, 242, 0.15)",
		"#bd93f9",
		"#caa9fa",
		"#50fa7b",
		"#f1fa8c",
		"#ff5555",
		"#8be9fd",
		"#f8f8f2",
		"rgba(248, 248, 242, 0.55)",
		"rgba(248, 248, 242, 0.30)",
	],
	[
		"solarized",
		"Solarized",
		"#002b36",
		"#073642",
		"#0e3e4a",
		"#174652",
		"rgba(131, 148, 150, 0.10)",
		"rgba(131, 148, 150, 0.18)",
		"#268bd2",
		"#2aa1f0",
		"#859900",
		"#b58900",
		"#dc322f",
		"#2aa198",
		"#fdf6e3",
		"rgba(147, 161, 161, 0.70)",
		"rgba(147, 161, 161, 0.40)",
	],
	[
		"monokai",
		"Monokai",
		"#272822",
		"#2e2f28",
		"#383930",
		"#44453a",
		"rgba(248, 248, 242, 0.08)",
		"rgba(248, 248, 242, 0.15)",
		"#a6e22e",
		"#b8f340",
		"#a6e22e",
		"#e6db74",
		"#f92672",
		"#66d9ef",
		"#f8f8f2",
		"rgba(248, 248, 242, 0.55)",
		"rgba(248, 248, 242, 0.30)",
	],
	[
		"github",
		"GitHub Dark",
		"#0d1117",
		"#161b22",
		"#1c2129",
		"#262c36",
		"rgba(240, 246, 252, 0.06)",
		"rgba(240, 246, 252, 0.12)",
		"#58a6ff",
		"#79c0ff",
		"#3fb950",
		"#d29922",
		"#f85149",
		"#58a6ff",
		"#f0f6fc",
		"rgba(201, 209, 217, 0.60)",
		"rgba(201, 209, 217, 0.35)",
	],
	[
		"ocean",
		"Ocean",
		"#0d1b2a",
		"#1b2838",
		"#243447",
		"#2d4056",
		"rgba(180, 220, 255, 0.08)",
		"rgba(180, 220, 255, 0.14)",
		"#00b4d8",
		"#48cae4",
		"#06d6a0",
		"#ffd166",
		"#ef476f",
		"#48cae4",
		"#edf6f9",
		"rgba(200, 225, 240, 0.55)",
		"rgba(200, 225, 240, 0.30)",
	],
	[
		"rose",
		"Rose Pine",
		"#191724",
		"#1f1d2e",
		"#26233a",
		"#2e2b40",
		"rgba(224, 222, 244, 0.08)",
		"rgba(224, 222, 244, 0.15)",
		"#c4a7e7",
		"#d4bdf7",
		"#9ccfd8",
		"#f6c177",
		"#eb6f92",
		"#9ccfd8",
		"#e0def4",
		"rgba(224, 222, 244, 0.55)",
		"rgba(224, 222, 244, 0.30)",
	],
	[
		"light",
		"Default Light",
		"#f5f5f7",
		"#ffffff",
		"#e8e8ed",
		"#d1d1d6",
		"rgba(0, 0, 0, 0.10)",
		"rgba(0, 0, 0, 0.18)",
		"#007AFF",
		"#0A84FF",
		"#28a745",
		"#e69500",
		"#dc3545",
		"#0a84ff",
		"#1c1c1e",
		"rgba(0, 0, 0, 0.55)",
		"rgba(0, 0, 0, 0.30)",
		"L",
	],
	[
		"githubLight",
		"GitHub Light",
		"#ffffff",
		"#f6f8fa",
		"#e1e4e8",
		"#d0d7de",
		"rgba(0, 0, 0, 0.08)",
		"rgba(0, 0, 0, 0.14)",
		"#0969da",
		"#0550ae",
		"#1a7f37",
		"#bf8700",
		"#cf222e",
		"#0969da",
		"#1f2328",
		"rgba(0, 0, 0, 0.55)",
		"rgba(0, 0, 0, 0.30)",
		"L",
	],
	[
		"solarizedLight",
		"Solarized Light",
		"#fdf6e3",
		"#eee8d5",
		"#e0dac7",
		"#d3ccb9",
		"rgba(0, 0, 0, 0.08)",
		"rgba(0, 0, 0, 0.15)",
		"#268bd2",
		"#2aa1f0",
		"#859900",
		"#b58900",
		"#dc322f",
		"#2aa198",
		"#073642",
		"rgba(7, 54, 66, 0.65)",
		"rgba(7, 54, 66, 0.40)",
		"L",
	],
] satisfies [ThemeTuple, ...ThemeTuple[]];

export const APP_THEMES = THEME_DATA.map(makeTheme) as [
	AppTheme,
	...AppTheme[],
];

const DEFAULT_THEME = makeTheme(THEME_DATA[0]);
const DEFAULT_COLORS: AppThemeColors = DEFAULT_THEME.colors;

const APP_THEME_STORAGE_KEY = "surgent-app-theme-id" as const;

const APP_CUSTOM_THEME_KEY = "surgent-app-custom-theme" as const;

export function loadAppThemeId(): AppThemeId {
	try {
		const saved = readStoredValue(APP_THEME_STORAGE_KEY);
		if (saved && saved in APP_THEME_IDS) return saved as AppThemeId;
	} catch {}
	return "default";
}

export function saveAppThemeId(id: AppThemeId): void {
	writeStoredValue(APP_THEME_STORAGE_KEY, id);
}

function loadAppCustomTheme(): AppThemeColors {
	try {
		const parsed = readStoredJson<Partial<AppThemeColors> | null>(
			APP_CUSTOM_THEME_KEY,
			null
		);
		if (parsed && typeof parsed.bg === "string")
			return { ...DEFAULT_COLORS, ...parsed };
	} catch {}
	return { ...DEFAULT_COLORS };
}

function getAppThemeById(id: AppThemeId): AppTheme {
	if (id === "custom") {
		return { id: "custom", name: "Custom", colors: loadAppCustomTheme() };
	}
	return APP_THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
}

export function applyAppTheme(id: AppThemeId): void {
	const root = document.documentElement;
	const meta = document.querySelector('meta[name="theme-color"]');
	if (id === "default") {
		for (const cssVar of Object.values(CSS_VAR_MAP)) {
			root.style.removeProperty(cssVar);
		}
		root.style.colorScheme = "dark";
		meta?.setAttribute("content", "#09090b");
		return;
	}
	const theme = getAppThemeById(id);
	for (const [key, cssVar] of Object.entries(CSS_VAR_MAP)) {
		const value = theme.colors[key as keyof AppThemeColors];
		root.style.setProperty(cssVar, value);
	}
	const light =
		id === "custom"
			? isLightColor(theme.colors.bg)
			: APP_THEMES.find((t) => t.id === id)?.light;
	root.style.colorScheme = light ? "light" : "dark";
	meta?.setAttribute("content", theme.colors.bg);
}

function isLightColor(hex: string): boolean {
	const clean = hex.replace("#", "");
	const r = parseInt(clean.substring(0, 2), 16);
	const g = parseInt(clean.substring(2, 4), 16);
	const b = parseInt(clean.substring(4, 6), 16);
	return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}
