import { memo, useMemo, useRef, useCallback, useState, useEffect } from "react";
import type { HunkDiff, DiffLine } from "../../hooks/useGitDiff.ts";
import { tokenizeLine } from "../../lib/syntax-tokens.ts";
import { MarkdownPreview } from "../../components/MarkdownPreview.tsx";

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
const OVERSCAN = 30;

function SyntaxContent({
	content,
	ext,
	disableTokenize,
}: {
	content: string;
	ext: string;
	disableTokenize: boolean;
}) {
	if (disableTokenize) return content;
	const tokens = useMemo(() => tokenizeLine(content, ext), [content, ext]);
	return (
		<>
			{/* Tokens are static per render and never reorder — index key is safe */}
			{tokens.map((tok, i) => (
				<span key={`${tok.type}-${i}`} className={TOKEN_CLASSES[tok.type]}>
					{tok.text}
				</span>
			))}
		</>
	);
}

function DiffRow({
	line,
	ext,
	disableTokenize,
}: {
	line: DiffLine;
	ext: string;
	disableTokenize: boolean;
}) {
	if (line.type === "hunk") {
		return (
			<div
				className="diff-hatch border-y border-surgent-border/20"
				style={{ height: 8 }}
			/>
		);
	}

	if (line.type === "spacer") {
		return (
			<div
				style={{
					height: LINE_H,
					background: `repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(255,255,255,0.20) 3px, rgba(255,255,255,0.20) 4px), rgba(255,255,255,0.06)`,
				}}
			/>
		);
	}

	let bg = "";
	let numColor = "text-surgent-text-3/20";
	let marker = "";
	let markerColor = "";

	if (line.type === "add") {
		bg = "bg-[rgba(60,180,110,0.13)]";
		numColor = "text-[rgba(60,180,110,0.5)]";
		marker = "+";
		markerColor = "text-[rgba(60,180,110,0.6)]";
	} else if (line.type === "remove") {
		bg = "bg-[rgba(210,80,80,0.13)]";
		numColor = "text-[rgba(210,80,80,0.5)]";
		marker = "-";
		markerColor = "text-[rgba(210,80,80,0.6)]";
	}

	return (
		<div
			className={`flex w-max min-w-full ${bg}`}
			style={{ height: LINE_H, lineHeight: `${LINE_H}px` }}
		>
			<span
				className={`shrink-0 w-10 text-right pr-1 text-[8px] font-mono select-none ${numColor}`}
			>
				{line.number ?? ""}
			</span>
			<span
				className={`shrink-0 w-3 text-center text-[8px] font-mono select-none ${markerColor}`}
			>
				{marker}
			</span>
			<span className="flex-1 min-w-max text-[10px] font-mono whitespace-pre text-surgent-text pr-3 pl-1">
				<SyntaxContent
					content={line.content}
					ext={ext}
					disableTokenize={disableTokenize}
				/>
			</span>
		</div>
	);
}

function VirtualPanel({
	lines,
	ext,
	scrollRef,
	onScroll,
	disableTokenize,
}: {
	lines: DiffLine[];
	ext: string;
	scrollRef: React.RefObject<HTMLDivElement | null>;
	onScroll: (scrollTop: number, scrollLeft: number) => void;
	disableTokenize: boolean;
}) {
	const [scrollTop, setScrollTop] = useState(0);
	const [viewH, setViewH] = useState(600);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		setViewH(el.clientHeight);
		const obs = new ResizeObserver((e) => setViewH(e[0]!.contentRect.height));
		obs.observe(el);
		return () => obs.disconnect();
	}, [scrollRef]);

	const handleScroll = useCallback(() => {
		if (!scrollRef.current) return;
		setScrollTop(scrollRef.current.scrollTop);
		onScroll(scrollRef.current.scrollTop, scrollRef.current.scrollLeft);
	}, [scrollRef, onScroll]);

	const total = lines.length * LINE_H;
	const start = Math.max(0, Math.floor(scrollTop / LINE_H) - OVERSCAN);
	const end = Math.min(
		lines.length,
		Math.ceil((scrollTop + viewH) / LINE_H) + OVERSCAN
	);

	return (
		<div
			ref={scrollRef}
			onScroll={handleScroll}
			className="flex-1 overflow-auto"
		>
			<div style={{ height: total, position: "relative" }}>
				<div style={{ transform: `translateY(${start * LINE_H}px)` }}>
					{lines.slice(start, end).map((line, i) => (
						<DiffRow
							key={start + i}
							line={line}
							ext={ext}
							disableTokenize={disableTokenize}
						/>
					))}
				</div>
			</div>
		</div>
	);
}

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
}: GitDiffViewProps) {
	const leftRef = useRef<HTMLDivElement>(null);
	const rightRef = useRef<HTMLDivElement>(null);
	const syncing = useRef(false);
	const [internalViewMode, setInternalViewMode] =
		useState<DiffViewMode>("split");
	const viewMode = controlledViewMode ?? internalViewMode;
	const setViewMode = onViewModeChange ?? setInternalViewMode;

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
			allLines.length > 1_200 ||
			allLines.some((line) => line.content.length > 400)
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
				<div className="flex-1 flex items-center justify-center">
					<span className="text-[11px] text-surgent-text-3">Binary file</span>
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
									onScroll={(scrollTop, scrollLeft) =>
										sync("left", scrollTop, scrollLeft)
									}
								/>
							)}
						</div>
						<div className="flex-1 flex flex-col min-w-0">
							<VirtualPanel
								lines={diff.newLines}
								ext={ext}
								scrollRef={rightRef}
								disableTokenize={disableTokenize}
								onScroll={(scrollTop, scrollLeft) =>
									sync("right", scrollTop, scrollLeft)
								}
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
									onScroll={(scrollTop, scrollLeft) =>
										sync("left", scrollTop, scrollLeft)
									}
								/>
							)}
						</div>
						<div className="flex-1 flex min-h-0 flex-col">
							<VirtualPanel
								lines={diff.newLines}
								ext={ext}
								scrollRef={rightRef}
								disableTokenize={disableTokenize}
								onScroll={(scrollTop, scrollLeft) =>
									sync("right", scrollTop, scrollLeft)
								}
							/>
						</div>
					</div>
				) : (
					<SinglePanel
						lines={hunkLines}
						ext={ext}
						disableTokenize={disableTokenize}
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
}: {
	lines: DiffLine[];
	ext: string;
	disableTokenize: boolean;
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
				onClick={onClose}
				className="flex items-center justify-center h-5 w-5 rounded text-surgent-text-3/50 hover:text-surgent-text hover:bg-surgent-surface-2 transition-colors"
			>
				<svg
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
