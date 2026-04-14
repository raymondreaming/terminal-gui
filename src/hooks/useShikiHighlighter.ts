import { useCallback, useEffect, useRef, useState } from "react";
import {
	type BundledLanguage,
	type BundledTheme,
	type Highlighter,
	createHighlighter,
} from "shiki";

// Map file extensions to Shiki language IDs
const EXTENSION_TO_LANG: Record<string, BundledLanguage> = {
	ts: "typescript",
	tsx: "tsx",
	js: "javascript",
	jsx: "jsx",
	json: "json",
	md: "markdown",
	css: "css",
	scss: "scss",
	html: "html",
	py: "python",
	rb: "ruby",
	go: "go",
	rs: "rust",
	c: "c",
	cpp: "cpp",
	h: "c",
	hpp: "cpp",
	java: "java",
	kt: "kotlin",
	swift: "swift",
	sh: "bash",
	bash: "bash",
	zsh: "bash",
	yaml: "yaml",
	yml: "yaml",
	toml: "toml",
	sql: "sql",
	graphql: "graphql",
	vue: "vue",
	svelte: "svelte",
	php: "php",
	lua: "lua",
	r: "r",
	scala: "scala",
	dart: "dart",
	zig: "zig",
};

// Singleton highlighter instance — eagerly created at module load
let highlighterInstance: Highlighter | null = null;
let highlighterPromise: Promise<Highlighter> | null = null;
const loadedLanguages = new Set<string>();

async function getHighlighter(): Promise<Highlighter> {
	if (highlighterInstance) return highlighterInstance;
	if (highlighterPromise) return highlighterPromise;

	highlighterPromise = createHighlighter({
		themes: ["github-dark-default"],
		langs: [], // Load languages on demand
	});

	highlighterInstance = await highlighterPromise;
	return highlighterInstance;
}

// Kick off creation immediately so it's warm by the time the first diff opens
getHighlighter().catch(() => {});

function getLanguageFromPath(filePath: string): BundledLanguage | null {
	const ext = filePath.split(".").pop()?.toLowerCase();
	if (!ext) return null;
	return EXTENSION_TO_LANG[ext] ?? null;
}

export interface HighlightedLine {
	lineNum: number;
	html: string;
}

export interface UseShikiHighlighterOptions {
	filePath: string;
	lines: string[];
	visibleRange: [number, number];
	theme?: BundledTheme;
	enabled?: boolean;
}

export interface ShikiHighlighterAPI {
	getHighlightedLine: (lineIdx: number) => string;
	isReady: boolean;
	language: string | null;
}

export function useShikiHighlighter({
	filePath,
	lines,
	visibleRange,
	theme = "github-dark-default",
	enabled = true,
}: UseShikiHighlighterOptions): ShikiHighlighterAPI {
	const [isReady, setIsReady] = useState(false);
	const [, setHighlightVersion] = useState(0); // Force re-render when highlighting completes
	const cacheRef = useRef<Map<number, string>>(new Map());
	const highlighterRef = useRef<Highlighter | null>(null);
	const langRef = useRef<BundledLanguage | null>(null);

	// Detect language from file path
	const language = getLanguageFromPath(filePath);

	// Store visible range in ref so we can use it in init
	const visibleRangeRef = useRef(visibleRange);
	visibleRangeRef.current = visibleRange;
	const linesRef = useRef(lines);
	linesRef.current = lines;

	// Initialize highlighter and highlight initial visible lines immediately
	useEffect(() => {
		if (!enabled || !language) {
			setIsReady(true); // Ready but won't highlight
			return;
		}

		let cancelled = false;

		async function init() {
			try {
				const hl = await getHighlighter();
				if (cancelled) return;

				// Load language if not already loaded
				if (!loadedLanguages.has(language!)) {
					await hl.loadLanguage(language!);
					loadedLanguages.add(language!);
				}

				if (cancelled) return;

				highlighterRef.current = hl;
				langRef.current = language;

				// Immediately highlight visible lines before setting ready
				const [start, end] = visibleRangeRef.current;
				const currentLines = linesRef.current;
				for (let i = start; i <= end && i < currentLines.length; i++) {
					const line = currentLines[i];
					if (!line) continue;
					try {
						const html = hl.codeToHtml(line, { lang: language!, theme });
						const match = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
						const innerHtml = match?.[1] ?? escapeHtml(line);
						const cleaned = unwrapLineSpan(innerHtml);
						cacheRef.current.set(i, cleaned || escapeHtml(line));
					} catch {
						cacheRef.current.set(i, escapeHtml(line));
					}
				}

				setIsReady(true);
				setHighlightVersion((v) => v + 1); // Force re-render with highlighted content
			} catch {
				setIsReady(true); // Continue without highlighting
			}
		}

		init();

		return () => {
			cancelled = true;
		};
	}, [enabled, language, theme]);

	// Highlight visible lines when range changes
	useEffect(() => {
		if (!isReady || !highlighterRef.current || !langRef.current) return;

		const [start, end] = visibleRange;
		const hl = highlighterRef.current;
		const lang = langRef.current;

		let newLinesHighlighted = false;

		// Highlight lines that aren't cached yet
		for (let i = start; i <= end && i < lines.length; i++) {
			if (cacheRef.current.has(i)) continue;

			const line = lines[i];
			if (!line) continue;

			try {
				// Highlight single line
				const html = hl.codeToHtml(line, {
					lang,
					theme,
				});

				// Extract just the inner content (remove pre/code wrapper)
				const match = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
				const innerHtml = match?.[1] ?? escapeHtml(line);

				const cleaned = unwrapLineSpan(innerHtml);

				cacheRef.current.set(i, cleaned || escapeHtml(line));
				newLinesHighlighted = true;
			} catch {
				cacheRef.current.set(i, escapeHtml(line));
				newLinesHighlighted = true;
			}
		}

		// Force re-render if new lines were highlighted
		if (newLinesHighlighted) {
			setHighlightVersion((v) => v + 1);
		}
	}, [isReady, visibleRange, lines, theme]);

	// Clear cache when lines change significantly
	useEffect(() => {
		cacheRef.current.clear();
	}, [filePath]);

	const getHighlightedLine = useCallback(
		(lineIdx: number): string => {
			const cached = cacheRef.current.get(lineIdx);
			if (cached) return cached;

			// Return escaped plain text if not yet highlighted
			return escapeHtml(lines[lineIdx] ?? "");
		},
		[lines]
	);

	return {
		getHighlightedLine,
		isReady,
		language,
	};
}

const LINE_SPAN_PREFIX = '<span class="line">';
const SPAN_CLOSE = "</span>";
function unwrapLineSpan(html: string): string {
	const trimmed = html.trim();
	if (trimmed.startsWith(LINE_SPAN_PREFIX) && trimmed.endsWith(SPAN_CLOSE)) {
		return trimmed.slice(LINE_SPAN_PREFIX.length, -SPAN_CLOSE.length);
	}
	return trimmed;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}
export function useShikiSnippet(
	lines: string[],
	filePath: string,
	enabled = true
): { highlighted: Map<number, string>; isReady: boolean } {
	const [highlighted, setHighlighted] = useState<Map<number, string>>(
		new Map()
	);
	const [isReady, setIsReady] = useState(false);
	const linesRef = useRef<string[]>([]);

	const language = getLanguageFromPath(filePath);

	useEffect(() => {
		// Only re-highlight if lines actually changed
		const linesChanged =
			lines.length !== linesRef.current.length ||
			lines.some((l, i) => l !== linesRef.current[i]);

		if (!linesChanged && isReady) return;
		linesRef.current = lines;

		if (!enabled || !language || lines.length === 0) {
			setIsReady(true);
			return;
		}

		let cancelled = false;

		async function highlight() {
			try {
				const hl = await getHighlighter();
				if (cancelled) return;

				// Load language if needed
				if (!loadedLanguages.has(language!)) {
					await hl.loadLanguage(language!);
					loadedLanguages.add(language!);
				}

				if (cancelled) return;

				const result = new Map<number, string>();

				for (let i = 0; i < lines.length; i++) {
					const line = lines[i];
					if (!line) {
						result.set(i, "");
						continue;
					}

					try {
						const html = hl.codeToHtml(line, {
							lang: language!,
							theme: "github-dark-default",
						});

						const match = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
						const innerHtml = match?.[1] ?? escapeHtml(line);
						const cleaned = unwrapLineSpan(innerHtml);

						result.set(i, cleaned || escapeHtml(line));
					} catch {
						result.set(i, escapeHtml(line));
					}
				}

				if (!cancelled) {
					setHighlighted(result);
					setIsReady(true);
				}
			} catch {
				if (!cancelled) {
					setIsReady(true);
				}
			}
		}

		highlight();

		return () => {
			cancelled = true;
		};
	}, [lines, language, enabled, isReady]);

	return { highlighted, isReady };
}
