import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MarkdownPreview } from "../../components/diff/MarkdownPreview.tsx";
import type { DiffLine, HunkDiff } from "../../hooks/useGitDiff.ts";
import { useShikiHighlighter } from "../../hooks/useShikiHighlighter.ts";
import { type Token, tokenizeLine } from "../../lib/syntax-tokens.ts";

export type DiffViewMode = "split" | "stacked" | "hunks";

interface GitDiffViewProps {
	diff: HunkDiff;
	filePath: string;
	staged: boolean;
	loading: boolean;
	onClose: () => void;
	hideHeader?: boolean;
	viewMode?: DiffViewMode;
	onViewModeChange?: (viewMode: DiffViewMode) => void;
	hideToolbar?: boolean;
	scrollToChange?: number;
}

const TOKEN_CLASSES: Record<string, string> = {
	keyword: "text-syntax-keyword",
	string: "text-syntax-string",
	comment: "text-syntax-comment",
	number: "text-syntax-number",
	punctuation: "text-syntax-punctuation",
	tag: "text-syntax-tag",
	attr: "text-syntax-attr",
	default: "",
};
const DIFF_CONFIG = {
	lineHeight: 15, // Height of each line in pixels
	lineNumFontSize: 9, // Line number font size
	signFontSize: 9, // +/- sign font size
	contentFontSize: 10, // Code content font size
	lineNumWidth: 36, // Line number column width
	signWidth: 12, // +/- sign column width
	lineNumColor: "#6b7280", // Gray for line numbers
	addLineNumColor: "rgba(60,180,110,0.7)",
	removeLineNumColor: "rgba(210,80,80,0.7)",
	addSignColor: "rgba(46,160,67,0.9)",
	removeSignColor: "rgba(248,81,73,0.9)",
	addBg: "rgba(60,180,110,0.13)",
	addBgHover: "rgba(60,180,110,0.2)",
	addBgHighlight: "rgba(60,180,110,0.25)",
	removeBg: "rgba(210,80,80,0.13)",
	removeBgHover: "rgba(210,80,80,0.2)",
	removeBgHighlight: "rgba(210,80,80,0.25)",
	overscan: 15, // Extra rows to render above/below viewport
};

const LINE_H = DIFF_CONFIG.lineHeight;
const OVERSCAN = DIFF_CONFIG.overscan;

const DiffRow = memo(function DiffRow({
	line,
	tokens,
	highlightedHtml,
	onCopy,
	isHighlighted,
	minWidth,
}: {
	line: DiffLine;
	ext: string;
	tokens: Token[] | null;
	highlightedHtml?: string;
	onCopy?: (content: string) => void;
	isHighlighted?: boolean;
	minWidth?: number;
}) {
	if (line.type === "hunk") {
		return (
			<div
				style={{
					height: 6,
					marginTop: 2,
					marginBottom: 2,
					backgroundColor: "var(--color-inferay-border)",
					opacity: 0.15,
					minWidth: minWidth || "100%",
				}}
			/>
		);
	}

	if (line.type === "spacer") {
		return (
			<div
				style={{
					height: LINE_H,
					backgroundColor: "rgba(255,255,255,0.02)",
					backgroundImage:
						"repeating-linear-gradient(-45deg, transparent, transparent 8px, rgba(255,255,255,0.02) 8px, rgba(255,255,255,0.02) 9px)",
					minWidth: minWidth || "100%",
				}}
			/>
		);
	}

	const isAdd = line.type === "add";
	const isRemove = line.type === "remove";
	const getBgColor = () => {
		if (isHighlighted) {
			return isAdd
				? DIFF_CONFIG.addBgHighlight
				: isRemove
					? DIFF_CONFIG.removeBgHighlight
					: "rgba(255,255,255,0.08)";
		}
		return isAdd
			? DIFF_CONFIG.addBg
			: isRemove
				? DIFF_CONFIG.removeBg
				: "transparent";
	};
	const hoverBg = isAdd
		? DIFF_CONFIG.addBgHover
		: isRemove
			? DIFF_CONFIG.removeBgHover
			: undefined;

	const handleCopy = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (onCopy && line.content) {
			onCopy(line.content);
		}
	};
	const renderContent = () => {
		if (highlightedHtml) {
			return (
				<span
					dangerouslySetInnerHTML={{ __html: highlightedHtml }}
					className="shiki-line"
				/>
			);
		}
		if (tokens) {
			return tokens.map((tok, i) => (
				<span key={i} className={TOKEN_CLASSES[tok.type]}>
					{tok.text}
				</span>
			));
		}
		return line.content;
	};

	return (
		<div
			className="group relative flex diff-row"
			style={{
				height: LINE_H,
				lineHeight: `${LINE_H}px`,
				backgroundColor: getBgColor(),
				minWidth: minWidth || "100%",
				"--hover-bg": hoverBg,
			}}
		>
			<span
				className="shrink-0 text-right font-mono select-none"
				style={{
					width: DIFF_CONFIG.lineNumWidth,
					paddingRight: 4,
					fontSize: DIFF_CONFIG.lineNumFontSize,
					color: isAdd
						? DIFF_CONFIG.addLineNumColor
						: isRemove
							? DIFF_CONFIG.removeLineNumColor
							: DIFF_CONFIG.lineNumColor,
				}}
			>
				{line.number ?? ""}
			</span>

			<span
				className="shrink-0 text-center font-mono select-none"
				style={{
					width: DIFF_CONFIG.signWidth,
					fontSize: DIFF_CONFIG.signFontSize,
					color: isAdd
						? DIFF_CONFIG.addSignColor
						: isRemove
							? DIFF_CONFIG.removeSignColor
							: undefined,
				}}
			>
				{isAdd ? "+" : isRemove ? "-" : ""}
			</span>

			<span
				className="flex-1 min-w-max font-mono whitespace-pre"
				style={{
					fontSize: DIFF_CONFIG.contentFontSize,
					paddingRight: 12,
					paddingLeft: 4,
					color: highlightedHtml ? undefined : "var(--color-inferay-text)",
				}}
			>
				{renderContent()}
			</span>

			{line.content && onCopy && (
				<button
					type="button"
					onClick={handleCopy}
					className="absolute right-1 top-1/2 -translate-y-1/2 rounded bg-inferay-surface-2 p-0.5 opacity-0 transition-opacity group-hover:opacity-50 hover:!opacity-100"
					title="Copy line"
				>
					<svg
						className="w-2.5 h-2.5"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						style={{ color: "var(--color-inferay-text-2)" }}
					>
						<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
						<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
					</svg>
				</button>
			)}
		</div>
	);
});

const tokenCache = new Map<string, Token[]>();

function getTokens(
	content: string,
	ext: string,
	disable: boolean
): Token[] | null {
	if (disable || !content) return null;
	const key = `${ext}:${content}`;
	let tokens = tokenCache.get(key);
	if (!tokens) {
		tokens = tokenizeLine(content, ext);
		tokenCache.set(key, tokens);
		if (tokenCache.size > 3000) {
			const first = tokenCache.keys().next().value;
			if (first) tokenCache.delete(first);
		}
	}
	return tokens;
}

function VirtualPanel({
	lines,
	ext,
	scrollRef,
	onScroll,
	disableTokenize,
	showMinimap: _showMinimap = false,
	externalScrollTop,
	filePath,
	onCopyLine,
	highlightedChangeIdx,
	changeLineMap,
}: {
	lines: DiffLine[];
	ext: string;
	scrollRef: React.RefObject<HTMLDivElement | null>;
	onScroll: (scrollTop: number, scrollLeft: number) => void;
	disableTokenize: boolean;
	showMinimap?: boolean;
	externalScrollTop?: number;
	filePath?: string;
	onCopyLine?: (content: string) => void;
	highlightedChangeIdx?: number;
	changeLineMap?: Map<number, number>;
}) {
	const [scrollTop, setScrollTop] = useState(0);
	const [viewH, setViewH] = useState(600);
	const rafRef = useRef<number>(0);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		setViewH(el.clientHeight);
		const obs = new ResizeObserver((e) =>
			setViewH(e[0]?.contentRect.height ?? 600)
		);
		obs.observe(el);
		return () => obs.disconnect();
	}, [scrollRef]);

	const lastAppliedScrollRef = useRef(-1);
	useEffect(() => {
		if (externalScrollTop === undefined || externalScrollTop < 0) return;
		if (externalScrollTop === lastAppliedScrollRef.current) return;
		lastAppliedScrollRef.current = externalScrollTop;
		if (scrollRef.current) {
			scrollRef.current.scrollTop = externalScrollTop;
			setScrollTop(externalScrollTop);
		}
	}, [externalScrollTop, scrollRef]);

	const handleScroll = useCallback(() => {
		if (!scrollRef.current) return;
		cancelAnimationFrame(rafRef.current);
		rafRef.current = requestAnimationFrame(() => {
			if (!scrollRef.current) return;
			const { scrollTop: st, scrollLeft: sl } = scrollRef.current;
			setScrollTop(st);
			onScroll(st, sl);
		});
	}, [scrollRef, onScroll]);

	useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

	const total = lines.length * LINE_H;
	const maxLineLength = useMemo(() => {
		let max = 0;
		for (const line of lines) {
			if (line.content && line.content.length > max) {
				max = line.content.length;
			}
		}
		return max;
	}, [lines]);
	const minContentWidth =
		DIFF_CONFIG.lineNumWidth + DIFF_CONFIG.signWidth + maxLineLength * 7 + 20;

	const start = Math.max(0, Math.floor(scrollTop / LINE_H) - OVERSCAN);
	const end = Math.min(
		lines.length,
		Math.ceil((scrollTop + viewH) / LINE_H) + OVERSCAN
	);
	const lineContents = useMemo(() => lines.map((l) => l.content), [lines]);
	const { getHighlightedLine, isReady: shikiReady } = useShikiHighlighter({
		filePath: filePath ?? `file.${ext}`,
		lines: lineContents,
		visibleRange: [start, end],
		enabled: !disableTokenize && !!filePath,
	});

	const scrollToLine = useCallback(
		(lineIndex: number) => {
			if (!scrollRef.current) return;
			scrollRef.current.scrollTop = Math.max(0, lineIndex * LINE_H - viewH / 2);
		},
		[scrollRef, viewH]
	);

	const visibleRows = useMemo(() => {
		const rows: {
			line: DiffLine;
			tokens: Token[] | null;
			highlightedHtml?: string;
			key: number;
			isHighlighted: boolean;
		}[] = [];
		for (let i = start; i < end; i++) {
			const line = lines[i];
			if (!line) continue;

			const changeIdx = changeLineMap?.get(i);
			const isHighlighted =
				highlightedChangeIdx !== undefined &&
				changeIdx === highlightedChangeIdx;
			const useShiki = shikiReady && !disableTokenize && filePath;
			const highlightedHtml = useShiki ? getHighlightedLine(i) : undefined;

			rows.push({
				line,
				tokens:
					line.type === "spacer" || line.type === "hunk" || useShiki
						? null
						: getTokens(line.content, ext, disableTokenize),
				highlightedHtml,
				key: i,
				isHighlighted,
			});
		}
		return rows;
	}, [
		lines,
		start,
		end,
		ext,
		disableTokenize,
		shikiReady,
		getHighlightedLine,
		filePath,
		changeLineMap,
		highlightedChangeIdx,
	]);

	const minimapSegments = useMemo(() => {
		if (!_showMinimap || lines.length === 0 || lines.length >= 3000)
			return null;
		return buildMinimapSegments(lines);
	}, [lines, _showMinimap]);

	return (
		<div className="flex flex-1 min-h-0">
			<div
				ref={scrollRef}
				onScroll={handleScroll}
				className="flex-1 overflow-auto"
			>
				<div
					style={{
						height: total,
						position: "relative",
						minWidth: minContentWidth,
					}}
				>
					<div
						style={{
							transform: `translateY(${start * LINE_H}px)`,
							willChange: "transform",
							minWidth: minContentWidth,
						}}
					>
						{visibleRows.map(
							({ line, tokens, highlightedHtml, key, isHighlighted }) => (
								<DiffRow
									key={key}
									line={line}
									ext={ext}
									tokens={tokens}
									highlightedHtml={highlightedHtml}
									onCopy={onCopyLine}
									isHighlighted={isHighlighted}
									minWidth={minContentWidth}
								/>
							)
						)}
					</div>
				</div>
			</div>
			{minimapSegments && (
				<DiffMinimap
					lines={lines}
					segments={minimapSegments}
					scrollTop={scrollTop}
					viewHeight={viewH}
					totalHeight={total}
					onScrollTo={scrollToLine}
				/>
			)}
		</div>
	);
}

function buildMinimapSegments(
	lines: DiffLine[]
): { type: string; startLine: number; endLine: number }[] {
	const segments: { type: string; startLine: number; endLine: number }[] = [];
	let currentType = "";
	let startLine = 0;

	for (let i = 0; i < lines.length && segments.length < 100; i++) {
		const t = lines[i]?.type;
		const type = t === "add" || t === "remove" ? t : "";
		if (type !== currentType) {
			if (currentType)
				segments.push({ type: currentType, startLine, endLine: i });
			currentType = type;
			startLine = i;
		}
	}
	if (currentType && segments.length < 100) {
		segments.push({ type: currentType, startLine, endLine: lines.length });
	}
	return segments;
}

const DiffMinimap = memo(function DiffMinimap({
	lines,
	segments,
	scrollTop,
	viewHeight,
	totalHeight,
	onScrollTo,
}: {
	lines: DiffLine[];
	segments: { type: string; startLine: number; endLine: number }[];
	scrollTop: number;
	viewHeight: number;
	totalHeight: number;
	onScrollTo: (lineIndex: number) => void;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [containerHeight, setContainerHeight] = useState(0);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		setContainerHeight(el.clientHeight);
		const obs = new ResizeObserver((e) =>
			setContainerHeight(e[0]?.contentRect.height ?? 0)
		);
		obs.observe(el);
		return () => obs.disconnect();
	}, []);

	if (totalHeight <= 0 || lines.length === 0 || containerHeight <= 0) {
		return (
			<div
				ref={containerRef}
				className="w-[14px] shrink-0 bg-inferay-bg border-l border-inferay-border/30"
			/>
		);
	}

	const scale = containerHeight / totalHeight;
	const thumbHeight = Math.max(
		16,
		Math.min(viewHeight * scale, containerHeight)
	);
	const thumbTop = Math.max(
		0,
		Math.min(scrollTop * scale, containerHeight - thumbHeight)
	);
	const lineHeight = containerHeight / lines.length;

	const handleClick = (e: React.MouseEvent) => {
		if (!containerRef.current) return;
		const rect = containerRef.current.getBoundingClientRect();
		const y = e.clientY - rect.top;
		const lineIndex = Math.floor((y / containerHeight) * lines.length);
		onScrollTo(Math.max(0, Math.min(lines.length - 1, lineIndex)));
	};

	return (
		<div
			ref={containerRef}
			className="w-[14px] shrink-0 bg-inferay-bg border-l border-inferay-border/30 cursor-pointer relative"
			onClick={handleClick}
		>
			{segments.map((seg, i) => (
				<div
					key={i}
					className={`absolute right-0 w-[6px] ${seg.type === "add" ? "bg-git-added" : "bg-git-deleted"}`}
					style={{
						top: seg.startLine * lineHeight,
						height: Math.max(2, (seg.endLine - seg.startLine) * lineHeight),
						opacity: 0.7,
					}}
				/>
			))}
			<div
				className="absolute left-0 right-0 bg-inferay-text/10 border-y border-inferay-text/20 pointer-events-none"
				style={{ top: thumbTop, height: thumbHeight }}
			/>
		</div>
	);
});
const CopyFeedback = memo(function CopyFeedback({ show }: { show: boolean }) {
	if (!show) return null;
	return (
		<div
			className="absolute top-2 right-2 px-2 py-1 rounded text-[10px] font-medium z-10 animate-pulse"
			style={{
				backgroundColor: "var(--color-inferay-accent)",
				color: "var(--color-inferay-surface)",
			}}
		>
			Copied!
		</div>
	);
});

export const GitDiffView = memo(function GitDiffView({
	diff,
	filePath,
	staged,
	loading,
	onClose,
	hideHeader = false,
	viewMode: controlledViewMode,
	onViewModeChange,
	hideToolbar = false,
	scrollToChange,
}: GitDiffViewProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const leftRef = useRef<HTMLDivElement>(null);
	const rightRef = useRef<HTMLDivElement>(null);
	const syncing = useRef(false);
	const [internalViewMode, setInternalViewMode] =
		useState<DiffViewMode>("split");
	const viewMode = controlledViewMode ?? internalViewMode;
	const setViewMode = onViewModeChange ?? setInternalViewMode;
	const [externalScrollTop, setExternalScrollTop] = useState(-1);
	const [showCopyFeedback, setShowCopyFeedback] = useState(false);
	const [highlightedChangeIdx, setHighlightedChangeIdx] = useState<
		number | undefined
	>();
	const stats = useMemo(() => {
		let added = 0;
		let removed = 0;
		for (const line of diff.newLines) {
			if (line.type === "add") added++;
		}
		for (const line of diff.oldLines) {
			if (line.type === "remove") removed++;
		}
		return { added, removed };
	}, [diff.newLines, diff.oldLines]);
	const { changePositions, changeLineMap } = useMemo(() => {
		const positions: number[] = [];
		const lineMap = new Map<number, number>();

		let currentChangeIdx = -1;
		let inChange = false;

		diff.newLines.forEach((line, idx) => {
			const isChanged = line.type === "add" || line.type === "remove";
			if (isChanged && !inChange) {
				currentChangeIdx++;
				positions.push(idx);
				inChange = true;
			} else if (!isChanged) {
				inChange = false;
			}
			if (isChanged) {
				lineMap.set(idx, currentChangeIdx);
			}
		});

		return { changePositions: positions, changeLineMap: lineMap };
	}, [diff.newLines]);

	const totalChanges = changePositions.length;
	const scrollToChangeIdx = useCallback(
		(changeIdx: number) => {
			if (changeIdx < 0 || changeIdx >= changePositions.length) return;
			const lineIdx = changePositions[changeIdx];
			if (lineIdx === undefined) return;
			const scrollPos = Math.max(0, (lineIdx - 5) * LINE_H);
			setExternalScrollTop(scrollPos);
			setHighlightedChangeIdx(changeIdx);

			setTimeout(() => {
				setExternalScrollTop(-1);
				setTimeout(() => setHighlightedChangeIdx(undefined), 1500);
			}, 100);
		},
		[changePositions]
	);
	const goToNextChange = useCallback(() => {
		const currentScroll =
			rightRef.current?.scrollTop ?? leftRef.current?.scrollTop ?? 0;
		const currentLine = Math.floor(currentScroll / LINE_H);
		const nextIdx = changePositions.findIndex((pos) => pos > currentLine + 2);
		if (nextIdx !== -1) {
			scrollToChangeIdx(nextIdx);
		} else if (changePositions.length > 0) {
			scrollToChangeIdx(0);
		}
	}, [changePositions, scrollToChangeIdx]);

	const goToPrevChange = useCallback(() => {
		const currentScroll =
			rightRef.current?.scrollTop ?? leftRef.current?.scrollTop ?? 0;
		const currentLine = Math.floor(currentScroll / LINE_H);
		let prevIdx = -1;
		for (let i = changePositions.length - 1; i >= 0; i--) {
			const changeLine = changePositions[i];
			if (changeLine !== undefined && changeLine < currentLine - 2) {
				prevIdx = i;
				break;
			}
		}
		if (prevIdx !== -1) {
			scrollToChangeIdx(prevIdx);
		} else if (changePositions.length > 0) {
			scrollToChangeIdx(changePositions.length - 1);
		}
	}, [changePositions, scrollToChangeIdx]);
	const handleCopyLine = useCallback((content: string) => {
		navigator.clipboard.writeText(content).then(() => {
			setShowCopyFeedback(true);
			setTimeout(() => setShowCopyFeedback(false), 1000);
		});
	}, []);
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement;
			if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
			if (!containerRef.current?.matches(":hover")) return;

			if (e.key === "n" && !e.metaKey && !e.ctrlKey) {
				e.preventDefault();
				goToNextChange();
			} else if (e.key === "p" && !e.metaKey && !e.ctrlKey) {
				e.preventDefault();
				goToPrevChange();
			} else if (e.key === "j") {
				e.preventDefault();
				goToNextChange();
			} else if (e.key === "k") {
				e.preventDefault();
				goToPrevChange();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [goToNextChange, goToPrevChange]);

	useEffect(() => {
		if (!scrollToChange) return;

		let lastChangeIdx = -1;
		for (let i = diff.newLines.length - 1; i >= 0; i--) {
			if (diff.newLines[i]?.type === "add") {
				lastChangeIdx = i;
				break;
			}
		}
		if (lastChangeIdx < 0) {
			for (let i = diff.oldLines.length - 1; i >= 0; i--) {
				if (diff.oldLines[i]?.type === "remove") {
					lastChangeIdx = i;
					break;
				}
			}
		}

		if (lastChangeIdx >= 0) {
			const scrollPos = Math.max(0, (lastChangeIdx - 10) * LINE_H);
			setExternalScrollTop(scrollPos);
			const resetTimer = setTimeout(() => setExternalScrollTop(-1), 100);
			return () => clearTimeout(resetTimer);
		}
	}, [scrollToChange, diff.newLines, diff.oldLines]);

	const ext = useMemo(() => {
		const p = filePath.split(".");
		return p.length > 1 ? p.pop()! : "";
	}, [filePath]);

	const hunkLines = useMemo(
		() => buildStackedLines(diff.oldLines, diff.newLines, true),
		[diff.oldLines, diff.newLines]
	);

	const statusMessage = useMemo(() => {
		if (diff.oldLines.length !== 0 || diff.newLines.length !== 1) return null;
		const line = diff.newLines[0];
		if (!line || line.type !== "context") return null;
		const text = line.content.trim();
		return /too large|cannot read/i.test(text) ? text : null;
	}, [diff.newLines, diff.oldLines.length]);

	const disableTokenize = useMemo(() => {
		const allLines = [...diff.oldLines, ...diff.newLines];
		return (
			allLines.length > 10_000 ||
			allLines.some((line) => line.content.length > 1000)
		);
	}, [diff.newLines, diff.oldLines]);

	const sync = useCallback(
		(src: "left" | "right", scrollTop: number, scrollLeft: number) => {
			if (syncing.current) return;
			syncing.current = true;
			const to = src === "left" ? rightRef.current : leftRef.current;
			if (to) {
				to.scrollTop = scrollTop;
				to.scrollLeft = scrollLeft;
			}
			requestAnimationFrame(() => {
				syncing.current = false;
			});
		},
		[]
	);

	if (loading) {
		return (
			<div className="flex h-full items-center justify-center bg-inferay-bg">
				<div className="flex items-center gap-2">
					<div className="w-3 h-3 border border-inferay-text-3 border-t-transparent rounded-full animate-spin" />
					<span className="text-[11px] text-inferay-text-3">Loading...</span>
				</div>
			</div>
		);
	}

	if (diff.isBinary) {
		return (
			<div className="flex h-full flex-col bg-inferay-bg">
				{!hideHeader && (
					<DiffHeader filePath={filePath} staged={staged} onClose={onClose} />
				)}
				<div className="flex-1 flex items-center justify-center overflow-auto p-4">
					{diff.isImage && diff.imagePath ? (
						<img
							src={`/api/file?path=${encodeURIComponent(diff.imagePath)}`}
							alt={filePath}
							className="max-w-full max-h-full object-contain rounded border border-inferay-border"
						/>
					) : (
						<span className="text-[11px] text-inferay-text-3">Binary file</span>
					)}
				</div>
			</div>
		);
	}

	if (statusMessage) {
		return (
			<div className="flex h-full flex-col bg-inferay-bg">
				{!hideHeader && (
					<DiffHeader filePath={filePath} staged={staged} onClose={onClose} />
				)}
				<div className="flex flex-1 items-center justify-center px-6">
					<p className="max-w-xs text-center text-[11px] leading-5 text-inferay-text-3">
						{statusMessage}
					</p>
				</div>
			</div>
		);
	}

	const isMarkdown = ext === "md" || ext === "mdx";
	const markdownContent = isMarkdown
		? diff.newLines
				.filter((l) => l.type !== "hunk" && l.type !== "spacer")
				.map((l) => l.content)
				.join("\n")
		: "";

	if (isMarkdown) {
		return (
			<div className="flex h-full flex-col bg-inferay-bg">
				{!hideHeader && (
					<DiffHeader filePath={filePath} staged={staged} onClose={onClose} />
				)}
				<div className="flex-1 overflow-y-auto p-6">
					<div className="mx-auto max-w-3xl">
						<MarkdownPreview content={markdownContent} />
					</div>
				</div>
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			className="flex h-full flex-col bg-inferay-bg relative"
		>
			<CopyFeedback show={showCopyFeedback} />
			{!hideHeader && (
				<DiffHeader
					filePath={filePath}
					staged={staged}
					onClose={onClose}
					stats={stats}
					totalChanges={totalChanges}
					onPrevChange={goToPrevChange}
					onNextChange={goToNextChange}
				/>
			)}
			{!hideToolbar && (
				<DiffViewToolbar viewMode={viewMode} onChange={setViewMode} />
			)}
			<div className="flex flex-1 min-h-0 overflow-hidden">
				{viewMode === "split" ? (
					<>
						<div className="flex-1 flex flex-col min-w-0 border-r border-inferay-border">
							{diff.isNew ? (
								<div className="flex-1 flex items-center justify-center text-[11px] text-inferay-text-3/30">
									New file
								</div>
							) : (
								<VirtualPanel
									lines={diff.oldLines}
									ext={ext}
									scrollRef={leftRef}
									disableTokenize={disableTokenize}
									onScroll={(st, sl) => sync("left", st, sl)}
									externalScrollTop={externalScrollTop}
									filePath={filePath}
									onCopyLine={handleCopyLine}
									highlightedChangeIdx={highlightedChangeIdx}
									changeLineMap={changeLineMap}
								/>
							)}
						</div>
						<div className="flex-1 flex flex-col min-w-0">
							<VirtualPanel
								lines={diff.newLines}
								ext={ext}
								scrollRef={rightRef}
								disableTokenize={disableTokenize}
								onScroll={(st, sl) => sync("right", st, sl)}
								showMinimap
								externalScrollTop={externalScrollTop}
								filePath={filePath}
								onCopyLine={handleCopyLine}
								highlightedChangeIdx={highlightedChangeIdx}
								changeLineMap={changeLineMap}
							/>
						</div>
					</>
				) : viewMode === "stacked" ? (
					<div className="flex flex-1 min-h-0 flex-col overflow-hidden">
						<div className="flex-1 flex min-h-0 flex-col border-b border-inferay-border">
							{diff.isNew ? (
								<div className="flex-1 flex items-center justify-center text-[11px] text-inferay-text-3/30">
									New file
								</div>
							) : (
								<VirtualPanel
									lines={diff.oldLines}
									ext={ext}
									scrollRef={leftRef}
									disableTokenize={disableTokenize}
									onScroll={(st, sl) => sync("left", st, sl)}
									externalScrollTop={externalScrollTop}
									filePath={filePath}
									onCopyLine={handleCopyLine}
									highlightedChangeIdx={highlightedChangeIdx}
									changeLineMap={changeLineMap}
								/>
							)}
						</div>
						<div className="flex-1 flex min-h-0 flex-col">
							<VirtualPanel
								lines={diff.newLines}
								ext={ext}
								scrollRef={rightRef}
								disableTokenize={disableTokenize}
								onScroll={(st, sl) => sync("right", st, sl)}
								showMinimap
								externalScrollTop={externalScrollTop}
								filePath={filePath}
								onCopyLine={handleCopyLine}
								highlightedChangeIdx={highlightedChangeIdx}
								changeLineMap={changeLineMap}
							/>
						</div>
					</div>
				) : (
					<SinglePanel
						lines={hunkLines}
						ext={ext}
						disableTokenize={disableTokenize}
						externalScrollTop={externalScrollTop}
						filePath={filePath}
						onCopyLine={handleCopyLine}
					/>
				)}
			</div>
		</div>
	);
});

function buildStackedLines(
	oldLines: DiffLine[],
	newLines: DiffLine[],
	onlyChanges: boolean
): DiffLine[] {
	const result: DiffLine[] = [];
	const max = Math.max(oldLines.length, newLines.length);

	for (let index = 0; index < max; index++) {
		const oldLine = oldLines[index];
		const newLine = newLines[index];

		if (oldLine?.type === "hunk" || newLine?.type === "hunk") {
			result.push({ number: null, content: "", type: "hunk" });
			continue;
		}

		if (oldLine?.type === "context" && newLine?.type === "context") {
			if (!onlyChanges) result.push(newLine);
			continue;
		}

		if (oldLine && oldLine.type !== "spacer") {
			if (!onlyChanges || oldLine.type !== "context") result.push(oldLine);
		}
		if (newLine && newLine.type !== "spacer") {
			if (!onlyChanges || newLine.type !== "context") result.push(newLine);
		}
	}

	return result;
}

function SinglePanel({
	lines,
	ext,
	disableTokenize,
	externalScrollTop,
	filePath,
	onCopyLine,
}: {
	lines: DiffLine[];
	ext: string;
	disableTokenize: boolean;
	externalScrollTop?: number;
	filePath?: string;
	onCopyLine?: (content: string) => void;
}) {
	const scrollRef = useRef<HTMLDivElement>(null);
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<VirtualPanel
				lines={lines}
				ext={ext}
				scrollRef={scrollRef}
				disableTokenize={disableTokenize}
				onScroll={() => {}}
				showMinimap
				externalScrollTop={externalScrollTop}
				filePath={filePath}
				onCopyLine={onCopyLine}
			/>
		</div>
	);
}

function DiffViewToolbar({
	viewMode,
	onChange,
}: {
	viewMode: DiffViewMode;
	onChange: (viewMode: DiffViewMode) => void;
}) {
	return (
		<div className="flex h-8 shrink-0 items-center gap-1 border-b border-inferay-border bg-inferay-bg px-2">
			<DiffViewButton
				active={viewMode === "split"}
				label="Split"
				onClick={() => onChange("split")}
			/>
			<DiffViewButton
				active={viewMode === "stacked"}
				label="Vertical"
				onClick={() => onChange("stacked")}
			/>
			<DiffViewButton
				active={viewMode === "hunks"}
				label="Hunks"
				onClick={() => onChange("hunks")}
			/>
		</div>
	);
}

function DiffViewButton({
	active,
	label,
	onClick,
}: {
	active: boolean;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`rounded-md px-2 py-1 text-[10px] transition-colors ${
				active
					? "bg-inferay-surface-2 text-inferay-text"
					: "text-inferay-text-3 hover:bg-inferay-surface hover:text-inferay-text-2"
			}`}
		>
			{label}
		</button>
	);
}

function DiffHeader({
	filePath,
	staged,
	onClose,
	stats,
	totalChanges,
	onPrevChange,
	onNextChange,
}: {
	filePath: string;
	staged: boolean;
	onClose: () => void;
	stats?: { added: number; removed: number };
	totalChanges?: number;
	onPrevChange?: () => void;
	onNextChange?: () => void;
}) {
	const dir = filePath.includes("/")
		? filePath.slice(0, filePath.lastIndexOf("/") + 1)
		: "";
	const name = filePath.split("/").pop() || filePath;

	return (
		<div className="shrink-0 flex items-center gap-1.5 px-3 h-9 border-b border-inferay-border bg-inferay-bg">
			{dir && (
				<span className="text-[10px] font-mono text-inferay-text-3/50 truncate">
					{dir}
				</span>
			)}
			<span className="text-[10px] font-mono font-medium text-inferay-text truncate">
				{name}
			</span>
			{staged && (
				<span className="text-[8px] text-inferay-accent/80 bg-inferay-accent/8 px-1 py-0.5 rounded shrink-0">
					staged
				</span>
			)}

			{stats && (stats.added > 0 || stats.removed > 0) && (
				<div className="flex items-center gap-1.5 text-[9px] ml-2">
					{stats.added > 0 && (
						<span className="text-git-added">+{stats.added}</span>
					)}
					{stats.removed > 0 && (
						<span className="text-git-deleted">−{stats.removed}</span>
					)}
				</div>
			)}

			<span className="flex-1" />

			{totalChanges !== undefined &&
				totalChanges > 0 &&
				onPrevChange &&
				onNextChange && (
					<div className="flex items-center gap-0.5 mr-2">
						<button
							type="button"
							onClick={onPrevChange}
							className="flex items-center justify-center h-5 w-5 rounded text-inferay-text-3 hover:text-inferay-text hover:bg-inferay-surface-2 transition-colors"
							title="Previous change (k/p)"
						>
							<svg
								className="w-2.5 h-2.5"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
							>
								<polyline points="15 18 9 12 15 6" />
							</svg>
						</button>
						<span className="text-[9px] text-inferay-text-3 tabular-nums px-1">
							{totalChanges}
						</span>
						<button
							type="button"
							onClick={onNextChange}
							className="flex items-center justify-center h-5 w-5 rounded text-inferay-text-3 hover:text-inferay-text hover:bg-inferay-surface-2 transition-colors"
							title="Next change (j/n)"
						>
							<svg
								className="w-2.5 h-2.5"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
							>
								<polyline points="9 18 15 12 9 6" />
							</svg>
						</button>
					</div>
				)}

			<button
				type="button"
				onClick={onClose}
				className="flex items-center justify-center h-5 w-5 rounded text-inferay-text-3/50 hover:text-inferay-text hover:bg-inferay-surface-2 transition-colors"
			>
				<svg
					aria-hidden
					width="9"
					height="9"
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
	);
}
