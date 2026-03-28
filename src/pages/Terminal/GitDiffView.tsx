import { memo, useMemo, useRef, useCallback, useState, useEffect } from "react";
import type { HunkDiff, DiffLine } from "../../hooks/useGitDiff.ts";
import { tokenizeLine } from "../../lib/syntax-tokens.ts";

interface GitDiffViewProps {
	diff: HunkDiff;
	filePath: string;
	staged: boolean;
	loading: boolean;
	onClose: () => void;
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

const LINE_H = 20;
const OVERSCAN = 30;

function SyntaxContent({ content, ext }: { content: string; ext: string }) {
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

function DiffRow({ line, ext }: { line: DiffLine; ext: string }) {
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
			className={`flex ${bg}`}
			style={{ height: LINE_H, lineHeight: `${LINE_H}px` }}
		>
			<span
				className={`shrink-0 w-10 text-right pr-1 text-[9px] font-mono select-none ${numColor}`}
			>
				{line.number ?? ""}
			</span>
			<span
				className={`shrink-0 w-3 text-center text-[9px] font-mono select-none ${markerColor}`}
			>
				{marker}
			</span>
			<span className="flex-1 text-[11px] font-mono whitespace-pre overflow-x-hidden text-surgent-text pr-3 pl-1">
				<SyntaxContent content={line.content} ext={ext} />
			</span>
		</div>
	);
}

function VirtualPanel({
	lines,
	ext,
	scrollRef,
	onScroll,
}: {
	lines: DiffLine[];
	ext: string;
	scrollRef: React.RefObject<HTMLDivElement | null>;
	onScroll: () => void;
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
		if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
		onScroll();
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
						<DiffRow key={start + i} line={line} ext={ext} />
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
}: GitDiffViewProps) {
	const leftRef = useRef<HTMLDivElement>(null);
	const rightRef = useRef<HTMLDivElement>(null);
	const syncing = useRef(false);

	const ext = useMemo(() => {
		const p = filePath.split(".");
		return p.length > 1 ? p.pop()! : "";
	}, [filePath]);

	const sync = useCallback((src: "left" | "right") => {
		if (syncing.current) return;
		syncing.current = true;
		const from = src === "left" ? leftRef.current : rightRef.current;
		const to = src === "left" ? rightRef.current : leftRef.current;
		if (from && to) to.scrollTop = from.scrollTop;
		requestAnimationFrame(() => {
			syncing.current = false;
		});
	}, []);

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
				<DiffHeader filePath={filePath} staged={staged} onClose={onClose} />
				<div className="flex-1 flex items-center justify-center">
					<span className="text-[11px] text-surgent-text-3">Binary file</span>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col bg-surgent-bg">
			<div className="flex flex-1 min-h-0 overflow-hidden">
				{/* Left — removed / old */}
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
							onScroll={() => sync("left")}
						/>
					)}
				</div>
				{/* Right — added / new */}
				<div className="flex-1 flex flex-col min-w-0">
					<VirtualPanel
						lines={diff.newLines}
						ext={ext}
						scrollRef={rightRef}
						onScroll={() => sync("right")}
					/>
				</div>
			</div>
		</div>
	);
});

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
