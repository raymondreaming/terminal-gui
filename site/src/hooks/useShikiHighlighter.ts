/**
 * Shiki Syntax Highlighter Hook for Astro Site
 * Simplified version for highlighting demo code snippets.
 */

import { useEffect, useRef, useState } from "react";
import {
	type BundledLanguage,
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
	html: "html",
	py: "python",
	go: "go",
	rs: "rust",
	sh: "bash",
	yaml: "yaml",
};

// Singleton highlighter instance
let highlighterInstance: Highlighter | null = null;
let highlighterPromise: Promise<Highlighter> | null = null;
const loadedLanguages = new Set<string>();

async function getHighlighter(): Promise<Highlighter> {
	if (highlighterInstance) return highlighterInstance;
	if (highlighterPromise) return highlighterPromise;

	highlighterPromise = createHighlighter({
		themes: ["github-dark-default"],
		langs: [],
	});

	highlighterInstance = await highlighterPromise;
	return highlighterInstance;
}

// Pre-warm the highlighter
getHighlighter().catch(() => {});

function getLanguageFromPath(filePath: string): BundledLanguage | null {
	const ext = filePath.split(".").pop()?.toLowerCase();
	if (!ext) return null;
	return EXTENSION_TO_LANG[ext] ?? null;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
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

/**
 * Hook for highlighting code snippets
 */
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
			} catch (err) {
				console.warn("Failed to highlight snippet:", err);
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

/**
 * Highlight a single line synchronously if highlighter is ready,
 * otherwise return escaped plain text.
 */
export function highlightLine(line: string, filePath: string): string {
	if (!highlighterInstance || !line.trim()) {
		return escapeHtml(line) || " ";
	}

	const language = getLanguageFromPath(filePath);
	if (!language || !loadedLanguages.has(language)) {
		return escapeHtml(line);
	}

	try {
		const html = highlighterInstance.codeToHtml(line, {
			lang: language,
			theme: "github-dark-default",
		});

		const match = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
		const innerHtml = match?.[1] ?? escapeHtml(line);
		return unwrapLineSpan(innerHtml) || escapeHtml(line);
	} catch {
		return escapeHtml(line);
	}
}
