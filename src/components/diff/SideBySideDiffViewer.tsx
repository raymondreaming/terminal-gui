/**
 * Side-by-Side Full-File Diff Viewer
 *
 * Shows complete before file on left, complete after file on right.
 * Changed sections are highlighted inline within the full files.
 * Virtualized for performance with large files.
 * Uses Shiki for syntax highlighting (only visible lines).
 */

import React, {
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useShikiHighlighter } from "../../hooks/useShikiHighlighter";
import { type DiffLine, type ParsedDiff } from "../../workers/diff-worker";

interface SideBySideDiffViewerProps {
	/** The parsed diff data from cache */
	diff: ParsedDiff;
	/** File path for syntax highlighting detection */
	filePath: string;
	/** Optional theme overrides */
	theme?: {
		bg?: string;
		lineBg?: string;
		addedBg?: string;
		removedBg?: string;
		lineNumColor?: string;
		textColor?: string;
	};
	/** Height of the viewer */
	height?: number | string;
	/** Show line numbers */
	showLineNumbers?: boolean;
	/** Sync scroll between sides */
	syncScroll?: boolean;
	/** Enable syntax highlighting */
	syntaxHighlight?: boolean;
	/** Callback when a line is clicked */
	onLineClick?: (
		side: "left" | "right",
		lineNum: number,
		content: string
	) => void;
}

// Default theme colors
const DEFAULT_THEME = {
	bg: "var(--color-surgent-surface)",
	lineBg: "var(--color-surgent-surface)",
	addedBg: "rgba(46, 160, 67, 0.15)",
	removedBg: "rgba(248, 81, 73, 0.15)",
	lineNumColor: "var(--color-surgent-text-2)",
	textColor: "var(--color-surgent-text)",
};

const LINE_HEIGHT = 12;
const LINE_NUM_WIDTH = 48;
const OVERSCAN = 10;

interface VirtualizedLineProps {
	line: DiffLine;
	lineIdx: number;
	side: "left" | "right";
	theme: typeof DEFAULT_THEME;
	showLineNumbers: boolean;
	onLineClick?: SideBySideDiffViewerProps["onLineClick"];
	onCopyLine?: (content: string) => void;
	style: React.CSSProperties;
	/** Highlighted HTML content (if syntax highlighting enabled) */
	highlightedHtml?: string;
	/** Whether this line is currently highlighted/focused */
	isHighlighted?: boolean;
}

const VirtualizedLine = memo(function VirtualizedLine({
	line,
	lineIdx,
	side,
	theme,
	showLineNumbers,
	onLineClick,
	onCopyLine,
	style,
	highlightedHtml,
	isHighlighted,
}: VirtualizedLineProps) {
	const [isHovered, setIsHovered] = useState(false);
	const isAdded = line.type === "added";
	const isRemoved = line.type === "removed";
	const isEmpty = line.content === "" && (isAdded || isRemoved);
	const isChanged = isAdded || isRemoved;

	const lineNum = side === "left" ? line.oldLineNum : line.newLineNum;

	const handleClick = useCallback(() => {
		if (onLineClick && lineNum && line.content) {
			onLineClick(side, lineNum, line.content);
		}
	}, [onLineClick, side, lineNum, line.content]);

	const handleCopy = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			if (line.content && onCopyLine) {
				onCopyLine(line.content);
			}
		},
		[line.content, onCopyLine]
	);

	// Render content - use highlighted HTML if available
	const contentElement = useMemo(() => {
		if (isEmpty) return "⎯";
		if (highlightedHtml && line.content) {
			return (
				<span
					dangerouslySetInnerHTML={{ __html: highlightedHtml }}
					className="shiki-line"
				/>
			);
		}
		return line.content || " ";
	}, [isEmpty, highlightedHtml, line.content]);

	// Calculate background color with hover state
	const bgColor = useMemo(() => {
		if (isHighlighted) {
			return isRemoved
				? "rgba(248, 81, 73, 0.25)"
				: isAdded
					? "rgba(46, 160, 67, 0.25)"
					: "rgba(255, 255, 255, 0.08)";
		}
		if (isHovered && isChanged) {
			return isRemoved ? "rgba(248, 81, 73, 0.22)" : "rgba(46, 160, 67, 0.22)";
		}
		return isRemoved
			? theme.removedBg
			: isAdded
				? theme.addedBg
				: "transparent";
	}, [isHighlighted, isHovered, isRemoved, isAdded, isChanged, theme]);

	return (
		<div
			className="flex select-none group relative"
			style={{
				...style,
				height: LINE_HEIGHT,
				backgroundColor: bgColor,
			}}
			onClick={handleClick}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			{/* Line number */}
			{showLineNumbers && (
				<div
					className="shrink-0 px-1.5 text-right text-[9px] select-none"
					style={{
						width: LINE_NUM_WIDTH,
						color: theme.lineNumColor,
						lineHeight: `${LINE_HEIGHT}px`,
					}}
				>
					{isEmpty ? "" : (lineNum ?? "")}
				</div>
			)}
			{/* +/- indicator */}
			<div
				className="shrink-0 w-3 text-center text-[9px] font-mono select-none"
				style={{
					lineHeight: `${LINE_HEIGHT}px`,
					color: isRemoved
						? "rgba(248, 81, 73, 0.8)"
						: isAdded
							? "rgba(46, 160, 67, 0.8)"
							: "transparent",
				}}
			>
				{isRemoved ? "−" : isAdded ? "+" : " "}
			</div>
			{/* Content */}
			<div
				className={`flex-1 pr-1 text-[10px] font-mono overflow-hidden whitespace-pre ${
					onLineClick ? "cursor-pointer" : ""
				}`}
				style={{
					lineHeight: `${LINE_HEIGHT}px`,
					color: highlightedHtml ? undefined : theme.textColor,
					textDecoration:
						isRemoved && side === "left" ? "line-through" : "none",
					opacity: isEmpty ? 0.3 : 1,
				}}
			>
				{contentElement}
			</div>
			{/* Copy button - visible on hover */}
			{isHovered && !isEmpty && line.content && onCopyLine && (
				<button
					type="button"
					onClick={handleCopy}
					className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded opacity-60 hover:opacity-100 transition-opacity"
					style={{ backgroundColor: "var(--color-surgent-surface-2)" }}
					title="Copy line"
				>
					<svg
						className="w-3 h-3"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						style={{ color: "var(--color-surgent-text-2)" }}
					>
						<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
						<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
					</svg>
				</button>
			)}
		</div>
	);
});

interface VirtualizedPaneProps {
	lines: DiffLine[];
	side: "left" | "right";
	theme: typeof DEFAULT_THEME;
	showLineNumbers: boolean;
	onLineClick?: SideBySideDiffViewerProps["onLineClick"];
	onCopyLine?: (content: string) => void;
	scrollTop: number;
	height: number;
	onScroll: (scrollTop: number) => void;
	/** File path for syntax highlighting */
	filePath: string;
	/** Enable syntax highlighting */
	syntaxHighlight: boolean;
	/** Index of currently highlighted change */
	highlightedChangeIdx?: number;
	/** Map of line indices that are part of each change */
	changeLineMap?: Map<number, number>;
}

const VirtualizedPane = memo(function VirtualizedPane({
	lines,
	side,
	theme,
	showLineNumbers,
	onLineClick,
	onCopyLine,
	scrollTop,
	height,
	onScroll,
	filePath,
	syntaxHighlight,
	highlightedChangeIdx,
	changeLineMap,
}: VirtualizedPaneProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const totalHeight = lines.length * LINE_HEIGHT;

	// Calculate visible range
	const startIdx = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - OVERSCAN);
	const endIdx = Math.min(
		lines.length,
		Math.ceil((scrollTop + height) / LINE_HEIGHT) + OVERSCAN
	);

	// Extract plain text content for highlighting
	const lineContents = useMemo(() => lines.map((l) => l.content), [lines]);

	// Use Shiki highlighter for visible lines only
	const { getHighlightedLine, isReady } = useShikiHighlighter({
		filePath,
		lines: lineContents,
		visibleRange: [startIdx, endIdx],
		enabled: syntaxHighlight,
	});

	const handleScroll = useCallback(
		(e: React.UIEvent<HTMLDivElement>) => {
			onScroll(e.currentTarget.scrollTop);
		},
		[onScroll]
	);

	// Sync scroll position
	useEffect(() => {
		if (containerRef.current) {
			containerRef.current.scrollTop = scrollTop;
		}
	}, [scrollTop]);

	return (
		<div
			ref={containerRef}
			className="flex-1 overflow-auto"
			style={{ height }}
			onScroll={handleScroll}
		>
			<div style={{ height: totalHeight, position: "relative" }}>
				<div
					style={{
						position: "absolute",
						top: startIdx * LINE_HEIGHT,
						left: 0,
						right: 0,
					}}
				>
					{lines.slice(startIdx, endIdx).map((line, idx) => {
						const lineIdx = startIdx + idx;
						const changeIdx = changeLineMap?.get(lineIdx);
						const isHighlighted =
							highlightedChangeIdx !== undefined &&
							changeIdx === highlightedChangeIdx;
						return (
							<VirtualizedLine
								key={lineIdx}
								line={line}
								lineIdx={lineIdx}
								side={side}
								theme={theme}
								showLineNumbers={showLineNumbers}
								onLineClick={onLineClick}
								onCopyLine={onCopyLine}
								style={{ height: LINE_HEIGHT }}
								highlightedHtml={
									syntaxHighlight && isReady
										? getHighlightedLine(lineIdx)
										: undefined
								}
								isHighlighted={isHighlighted}
							/>
						);
					})}
				</div>
			</div>
		</div>
	);
});

// Copy feedback component
const CopyFeedback = memo(function CopyFeedback({ show }: { show: boolean }) {
	if (!show) return null;
	return (
		<div
			className="absolute top-2 right-2 px-2 py-1 rounded text-[10px] font-medium z-10 animate-pulse"
			style={{
				backgroundColor: "var(--color-surgent-accent)",
				color: "var(--color-surgent-surface)",
			}}
		>
			Copied!
		</div>
	);
});

export const SideBySideDiffViewer = memo(function SideBySideDiffViewer({
	diff,
	filePath,
	theme: themeProp,
	height = 400,
	showLineNumbers = true,
	syncScroll = true,
	syntaxHighlight = true,
	onLineClick,
}: SideBySideDiffViewerProps) {
	const theme = useMemo(
		() => ({ ...DEFAULT_THEME, ...themeProp }),
		[themeProp]
	);

	const [scrollTop, setScrollTop] = useState(0);
	const [highlightedChangeIdx, setHighlightedChangeIdx] = useState<
		number | undefined
	>();
	const [showCopyFeedback, setShowCopyFeedback] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const containerHeight = typeof height === "number" ? height : 400;

	const fileName = useMemo(
		() => filePath.split("/").pop() ?? filePath,
		[filePath]
	);

	// Build a map of change indices and their line positions
	const { changePositions, changeLineMap } = useMemo(() => {
		const positions: number[] = []; // Line indices where changes start
		const lineMap = new Map<number, number>(); // lineIdx -> changeIdx

		let currentChangeIdx = -1;
		let inChange = false;

		diff.newLines.forEach((line, idx) => {
			const isChanged = line.type === "added" || line.type === "removed";
			if (isChanged && !inChange) {
				// Start of a new change
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

	// Navigate to a specific change
	const scrollToChange = useCallback(
		(changeIdx: number) => {
			if (changeIdx < 0 || changeIdx >= changePositions.length) return;
			const lineIdx = changePositions[changeIdx];
			const targetScrollTop = Math.max(
				0,
				lineIdx * LINE_HEIGHT - containerHeight / 3
			);
			setScrollTop(targetScrollTop);
			setHighlightedChangeIdx(changeIdx);

			// Clear highlight after a delay
			setTimeout(() => setHighlightedChangeIdx(undefined), 1500);
		},
		[changePositions, containerHeight]
	);

	// Navigate to next/previous change
	const goToNextChange = useCallback(() => {
		const currentLine = Math.floor(scrollTop / LINE_HEIGHT);
		const nextIdx = changePositions.findIndex((pos) => pos > currentLine + 2);
		if (nextIdx !== -1) {
			scrollToChange(nextIdx);
		} else if (changePositions.length > 0) {
			// Wrap to first change
			scrollToChange(0);
		}
	}, [scrollTop, changePositions, scrollToChange]);

	const goToPrevChange = useCallback(() => {
		const currentLine = Math.floor(scrollTop / LINE_HEIGHT);
		let prevIdx = -1;
		for (let i = changePositions.length - 1; i >= 0; i--) {
			if (changePositions[i] < currentLine - 2) {
				prevIdx = i;
				break;
			}
		}
		if (prevIdx !== -1) {
			scrollToChange(prevIdx);
		} else if (changePositions.length > 0) {
			// Wrap to last change
			scrollToChange(changePositions.length - 1);
		}
	}, [scrollTop, changePositions, scrollToChange]);

	// Copy line content
	const handleCopyLine = useCallback((content: string) => {
		navigator.clipboard.writeText(content).then(() => {
			setShowCopyFeedback(true);
			setTimeout(() => setShowCopyFeedback(false), 1000);
		});
	}, []);

	// Keyboard navigation
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Only handle if this viewer is focused/hovered
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

	const handleScroll = useCallback(
		(newScrollTop: number) => {
			if (syncScroll) {
				setScrollTop(newScrollTop);
			}
		},
		[syncScroll]
	);

	return (
		<div
			ref={containerRef}
			className="rounded-lg border overflow-hidden relative"
			style={{
				backgroundColor: theme.bg,
				borderColor: "var(--color-surgent-border)",
			}}
		>
			<CopyFeedback show={showCopyFeedback} />

			{/* Header */}
			<div
				className="flex items-center border-b"
				style={{ borderColor: "var(--color-surgent-border)" }}
			>
				{/* Left header */}
				<div
					className="flex-1 flex items-center gap-2 px-3 py-1.5 text-[10px] font-medium"
					style={{
						backgroundColor: "var(--color-surgent-surface-2)",
						color: "var(--color-surgent-text-2)",
						borderRight: "1px solid var(--color-surgent-border)",
					}}
				>
					<span className="opacity-50">Before</span>
					<span className="opacity-70">{fileName}</span>
					{diff.stats.removed > 0 && (
						<span
							className="ml-auto text-[9px] px-1 rounded"
							style={{
								backgroundColor: "rgba(248, 81, 73, 0.2)",
								color: "rgba(248, 81, 73, 0.9)",
							}}
						>
							−{diff.stats.removed}
						</span>
					)}
				</div>
				{/* Right header */}
				<div
					className="flex-1 flex items-center gap-2 px-3 py-1.5 text-[10px] font-medium"
					style={{
						backgroundColor: "var(--color-surgent-surface-2)",
						color: "var(--color-surgent-text-2)",
					}}
				>
					<span className="opacity-50">After</span>
					<span className="opacity-70">{fileName}</span>
					{diff.stats.added > 0 && (
						<span
							className="ml-auto text-[9px] px-1 rounded"
							style={{
								backgroundColor: "rgba(46, 160, 67, 0.2)",
								color: "rgba(46, 160, 67, 0.9)",
							}}
						>
							+{diff.stats.added}
						</span>
					)}
				</div>
			</div>

			{/* Diff panes */}
			<div className="flex" style={{ height: containerHeight }}>
				{/* Left pane (before) */}
				<VirtualizedPane
					lines={diff.oldLines}
					side="left"
					theme={theme}
					showLineNumbers={showLineNumbers}
					onLineClick={onLineClick}
					onCopyLine={handleCopyLine}
					scrollTop={scrollTop}
					height={containerHeight}
					onScroll={handleScroll}
					filePath={filePath}
					syntaxHighlight={syntaxHighlight}
					highlightedChangeIdx={highlightedChangeIdx}
					changeLineMap={changeLineMap}
				/>

				{/* Divider */}
				<div
					className="w-px shrink-0"
					style={{ backgroundColor: "var(--color-surgent-border)" }}
				/>

				{/* Right pane (after) */}
				<VirtualizedPane
					lines={diff.newLines}
					side="right"
					theme={theme}
					showLineNumbers={showLineNumbers}
					onLineClick={onLineClick}
					onCopyLine={handleCopyLine}
					scrollTop={scrollTop}
					height={containerHeight}
					onScroll={handleScroll}
					filePath={filePath}
					syntaxHighlight={syntaxHighlight}
					highlightedChangeIdx={highlightedChangeIdx}
					changeLineMap={changeLineMap}
				/>
			</div>

			{/* Footer with stats and navigation */}
			<div
				className="flex items-center justify-between px-3 py-1 text-[9px] border-t"
				style={{
					backgroundColor: "var(--color-surgent-surface-2)",
					borderColor: "var(--color-surgent-border)",
					color: "var(--color-surgent-text-3)",
				}}
			>
				<span>
					{diff.oldLines.filter((l) => l.type !== "added").length} lines
				</span>

				{/* Change navigation */}
				{totalChanges > 0 && (
					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={goToPrevChange}
							className="px-1.5 py-0.5 rounded hover:bg-surgent-surface-3 transition-colors"
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
						<span className="px-1 tabular-nums">
							{totalChanges} {totalChanges === 1 ? "change" : "changes"}
						</span>
						<button
							type="button"
							onClick={goToNextChange}
							className="px-1.5 py-0.5 rounded hover:bg-surgent-surface-3 transition-colors"
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

				<span className="flex items-center gap-3">
					<span style={{ color: "rgba(46, 160, 67, 0.8)" }}>
						+{diff.stats.added}
					</span>
					<span style={{ color: "rgba(248, 81, 73, 0.8)" }}>
						−{diff.stats.removed}
					</span>
					<span>{diff.stats.unchanged} unchanged</span>
				</span>
				<span>
					{diff.newLines.filter((l) => l.type !== "removed").length} lines
				</span>
			</div>
		</div>
	);
});

export default SideBySideDiffViewer;
