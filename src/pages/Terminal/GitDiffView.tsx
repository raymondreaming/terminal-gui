import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MarkdownPreview } from "../../components/MarkdownPreview.tsx";
import type { DiffLine, HunkDiff } from "../../hooks/useGitDiff.ts";
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

const LINE_H = 18;
const OVERSCAN = 15;

const DiffRow = memo(function DiffRow({
	line,
	tokens,
}: {
	line: DiffLine;
	ext: string;
	tokens: Token[] | null;
}) {
	if (line.type === "hunk") {
		return <div className="diff-hatch border-y border-surgent-border/20 h-2" />;
	}

	if (line.type === "spacer") {
		return (
			<div
				className="h-[18px] bg-surgent-surface/30"
				style={{
					backgroundImage:
						"repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(255,255,255,0.04) 6px, rgba(255,255,255,0.04) 7px)",
				}}
			/>
		);
	}

	const isAdd = line.type === "add";
	const isRemove = line.type === "remove";

	return (
		<div
			className={`flex w-max min-w-full h-[18px] leading-[18px] ${
				isAdd
					? "bg-[rgba(60,180,110,0.13)]"
					: isRemove
						? "bg-[rgba(210,80,80,0.13)]"
						: ""
			}`}
		>
			<span
				className={`shrink-0 w-10 text-right pr-1 text-[8px] font-mono select-none ${
					isAdd
						? "text-[rgba(60,180,110,0.5)]"
						: isRemove
							? "text-[rgba(210,80,80,0.5)]"
							: "text-surgent-text-3/20"
				}`}
			>
				{line.number ?? ""}
			</span>
			<span
				className={`shrink-0 w-3 text-center text-[8px] font-mono select-none ${
					isAdd
						? "text-[rgba(60,180,110,0.6)]"
						: isRemove
							? "text-[rgba(210,80,80,0.6)]"
							: ""
				}`}
			>
				{isAdd ? "+" : isRemove ? "-" : ""}
			</span>
			<span className="flex-1 min-w-max text-[10px] font-mono whitespace-pre text-surgent-text pr-3 pl-1">
				{tokens
					? tokens.map((tok, i) => (
							<span key={i} className={TOKEN_CLASSES[tok.type]}>
								{tok.text}
							</span>
						))
					: line.content}
			</span>
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
}: {
	lines: DiffLine[];
	ext: string;
	scrollRef: React.RefObject<HTMLDivElement | null>;
	onScroll: (scrollTop: number, scrollLeft: number) => void;
	disableTokenize: boolean;
	showMinimap?: boolean;
	externalScrollTop?: number;
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
	const start = Math.max(0, Math.floor(scrollTop / LINE_H) - OVERSCAN);
	const end = Math.min(
		lines.length,
		Math.ceil((scrollTop + viewH) / LINE_H) + OVERSCAN
	);

	const scrollToLine = useCallback(
		(lineIndex: number) => {
			if (!scrollRef.current) return;
			scrollRef.current.scrollTop = Math.max(0, lineIndex * LINE_H - viewH / 2);
		},
		[scrollRef, viewH]
	);

	const visibleRows = useMemo(() => {
		const rows: { line: DiffLine; tokens: Token[] | null; key: number }[] = [];
		for (let i = start; i < end; i++) {
			const line = lines[i];
			if (!line) continue;
			rows.push({
				line,
				tokens:
					line.type === "spacer" || line.type === "hunk"
						? null
						: getTokens(line.content, ext, disableTokenize),
				key: i,
			});
		}
		return rows;
	}, [lines, start, end, ext, disableTokenize]);

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
				<div style={{ height: total, position: "relative" }}>
					<div
						style={{
							transform: `translateY(${start * LINE_H}px)`,
							willChange: "transform",
						}}
					>
						{visibleRows.map(({ line, tokens, key }) => (
							<DiffRow key={key} line={line} ext={ext} tokens={tokens} />
						))}
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
				className="w-[14px] shrink-0 bg-surgent-bg border-l border-surgent-border/30"
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
			className="w-[14px] shrink-0 bg-surgent-bg border-l border-surgent-border/30 cursor-pointer relative"
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
				className="absolute left-0 right-0 bg-surgent-text/10 border-y border-surgent-text/20 pointer-events-none"
				style={{ top: thumbTop, height: thumbHeight }}
			/>
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
	const leftRef = useRef<HTMLDivElement>(null);
	const rightRef = useRef<HTMLDivElement>(null);
	const syncing = useRef(false);
	const [internalViewMode, setInternalViewMode] =
		useState<DiffViewMode>("split");
	const viewMode = controlledViewMode ?? internalViewMode;
	const setViewMode = onViewModeChange ?? setInternalViewMode;
	const [externalScrollTop, setExternalScrollTop] = useState(-1);

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
			<div className="flex h-full items-center justify-center bg-surgent-bg">
				<div className="flex items-center gap-2">
					<div className="w-3 h-3 border border-surgent-text-3 border-t-transparent rounded-full animate-spin" />
					<span className="text-[11px] text-surgent-text-3">Loading...</span>
				</div>
			</div>
		);
	}

	if (diff.isBinary) {
		return (
			<div className="flex h-full flex-col bg-surgent-bg">
				{!hideHeader && (
					<DiffHeader filePath={filePath} staged={staged} onClose={onClose} />
				)}
				<div className="flex-1 flex items-center justify-center overflow-auto p-4">
					{diff.isImage && diff.imagePath ? (
						<img
							src={`/api/file?path=${encodeURIComponent(diff.imagePath)}`}
							alt={filePath}
							className="max-w-full max-h-full object-contain rounded border border-surgent-border"
						/>
					) : (
						<span className="text-[11px] text-surgent-text-3">Binary file</span>
					)}
				</div>
			</div>
		);
	}

	if (statusMessage) {
		return (
			<div className="flex h-full flex-col bg-surgent-bg">
				{!hideHeader && (
					<DiffHeader filePath={filePath} staged={staged} onClose={onClose} />
				)}
				<div className="flex flex-1 items-center justify-center px-6">
					<p className="max-w-xs text-center text-[11px] leading-5 text-surgent-text-3">
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
			<div className="flex h-full flex-col bg-surgent-bg">
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
		<div className="flex h-full flex-col bg-surgent-bg">
			{!hideHeader && (
				<DiffHeader filePath={filePath} staged={staged} onClose={onClose} />
			)}
			{!hideToolbar && (
				<DiffViewToolbar viewMode={viewMode} onChange={setViewMode} />
			)}
			<div className="flex flex-1 min-h-0 overflow-hidden">
				{viewMode === "split" ? (
					<>
						<div className="flex-1 flex flex-col min-w-0 border-r border-surgent-border">
							{diff.isNew ? (
								<div className="flex-1 flex items-center justify-center text-[11px] text-surgent-text-3/30">
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
							/>
						</div>
					</>
				) : viewMode === "stacked" ? (
					<div className="flex flex-1 min-h-0 flex-col overflow-hidden">
						<div className="flex-1 flex min-h-0 flex-col border-b border-surgent-border">
							{diff.isNew ? (
								<div className="flex-1 flex items-center justify-center text-[11px] text-surgent-text-3/30">
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
							/>
						</div>
					</div>
				) : (
					<SinglePanel
						lines={hunkLines}
						ext={ext}
						disableTokenize={disableTokenize}
						externalScrollTop={externalScrollTop}
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
}: {
	lines: DiffLine[];
	ext: string;
	disableTokenize: boolean;
	externalScrollTop?: number;
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
		<div className="flex h-8 shrink-0 items-center gap-1 border-b border-surgent-border bg-surgent-bg px-2">
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
					? "bg-surgent-surface-2 text-surgent-text"
					: "text-surgent-text-3 hover:bg-surgent-surface hover:text-surgent-text-2"
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
}: {
	filePath: string;
	staged: boolean;
	onClose: () => void;
}) {
	const dir = filePath.includes("/")
		? filePath.slice(0, filePath.lastIndexOf("/") + 1)
		: "";
	const name = filePath.split("/").pop() || filePath;

	return (
		<div className="shrink-0 flex items-center gap-1.5 px-3 h-9 border-b border-surgent-border bg-surgent-bg">
			{dir && (
				<span className="text-[10px] font-mono text-surgent-text-3/50 truncate">
					{dir}
				</span>
			)}
			<span className="text-[10px] font-mono font-medium text-surgent-text truncate">
				{name}
			</span>
			{staged && (
				<span className="text-[8px] text-surgent-accent/80 bg-surgent-accent/8 px-1 py-0.5 rounded shrink-0">
					staged
				</span>
			)}
			<span className="flex-1" />
			<button
				type="button"
				onClick={onClose}
				className="flex items-center justify-center h-5 w-5 rounded text-surgent-text-3/50 hover:text-surgent-text hover:bg-surgent-surface-2 transition-colors"
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
