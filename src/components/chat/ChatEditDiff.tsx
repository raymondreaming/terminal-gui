import React, { useEffect, useMemo, useState } from "react";
import { useShikiSnippet } from "../../hooks/useShikiHighlighter.ts";

type DiffTheme = {
	bg: string;
	fg: string;
	cursor: string;
	surface: string;
	border: string;
	fgMuted: string;
	fgDim: string;
};

type EditMessage = {
	content: string;
};

type DiffLine = {
	type: "context" | "removed" | "added";
	text: string;
	oldLineNum?: number;
	newLineNum?: number;
};

function computeDiffHunks(
	oldStr: string,
	newStr: string,
	contextLines = 2
): DiffLine[][] {
	const oldLines = oldStr.split("\n");
	const newLines = newStr.split("\n");
	const lcs: number[][] = [];

	for (let i = 0; i <= oldLines.length; i++) {
		lcs[i] = [];
		for (let j = 0; j <= newLines.length; j++) {
			if (i === 0 || j === 0) {
				lcs[i][j] = 0;
			} else if (oldLines[i - 1] === newLines[j - 1]) {
				lcs[i][j] = lcs[i - 1]![j - 1]! + 1;
			} else {
				lcs[i][j] = Math.max(lcs[i - 1]![j]!, lcs[i]![j - 1]!);
			}
		}
	}

	const ops: {
		type: "equal" | "delete" | "insert";
		oldIdx?: number;
		newIdx?: number;
	}[] = [];
	let i = oldLines.length;
	let j = newLines.length;

	while (i > 0 || j > 0) {
		if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
			ops.unshift({ type: "equal", oldIdx: i - 1, newIdx: j - 1 });
			i--;
			j--;
		} else if (j > 0 && (i === 0 || lcs[i]![j - 1]! >= lcs[i - 1]![j]!)) {
			ops.unshift({ type: "insert", newIdx: j - 1 });
			j--;
		} else {
			ops.unshift({ type: "delete", oldIdx: i - 1 });
			i--;
		}
	}

	const diffLines: (DiffLine & { opIdx: number })[] = [];
	for (let idx = 0; idx < ops.length; idx++) {
		const op = ops[idx]!;
		if (op.type === "equal") {
			diffLines.push({
				type: "context",
				text: oldLines[op.oldIdx!]!,
				oldLineNum: op.oldIdx! + 1,
				newLineNum: op.newIdx! + 1,
				opIdx: idx,
			});
		} else if (op.type === "delete") {
			diffLines.push({
				type: "removed",
				text: oldLines[op.oldIdx!]!,
				oldLineNum: op.oldIdx! + 1,
				opIdx: idx,
			});
		} else {
			diffLines.push({
				type: "added",
				text: newLines[op.newIdx!]!,
				newLineNum: op.newIdx! + 1,
				opIdx: idx,
			});
		}
	}

	const hunks: DiffLine[][] = [];
	let currentHunk: DiffLine[] = [];
	let lastChangeIdx = -999;

	for (let idx = 0; idx < diffLines.length; idx++) {
		const line = diffLines[idx]!;
		const isChange = line.type !== "context";

		if (isChange) {
			const contextStart = Math.max(
				lastChangeIdx + contextLines + 1,
				idx - contextLines
			);
			for (let c = contextStart; c < idx; c++) {
				const contextLine = diffLines[c];
				if (contextLine && contextLine.type === "context") {
					currentHunk.push({
						type: contextLine.type,
						text: contextLine.text,
						oldLineNum: contextLine.oldLineNum,
						newLineNum: contextLine.newLineNum,
					});
				}
			}
			currentHunk.push({
				type: line.type,
				text: line.text,
				oldLineNum: line.oldLineNum,
				newLineNum: line.newLineNum,
			});
			lastChangeIdx = idx;
		} else if (idx - lastChangeIdx <= contextLines && lastChangeIdx >= 0) {
			currentHunk.push({
				type: line.type,
				text: line.text,
				oldLineNum: line.oldLineNum,
				newLineNum: line.newLineNum,
			});
		} else if (currentHunk.length > 0 && idx - lastChangeIdx > contextLines) {
			hunks.push(currentHunk);
			currentHunk = [];
		}
	}

	if (currentHunk.length > 0) hunks.push(currentHunk);
	return hunks;
}

function applyEditsSequentially(
	edits: { old_string: string; new_string: string }[]
): { originalText: string; finalText: string } | null {
	if (edits.length === 0) return null;

	let currentText = edits[0]!.old_string;
	const originalText = currentText;

	for (const edit of edits) {
		const idx = currentText.indexOf(edit.old_string);
		if (idx !== -1) {
			currentText =
				currentText.slice(0, idx) +
				edit.new_string +
				currentText.slice(idx + edit.old_string.length);
		} else {
			currentText = edit.new_string;
		}
	}

	return { originalText, finalText: currentText };
}

function EditDiffCard({
	fileName,
	hunks,
	stats,
	allLines,
	theme,
	isStreaming,
	editCount,
	resetKey,
}: {
	fileName: string;
	hunks: DiffLine[][];
	stats: { added: number; removed: number };
	allLines: string[];
	theme?: DiffTheme;
	isStreaming?: boolean;
	editCount?: number;
	resetKey: string;
}) {
	const { highlighted, isReady } = useShikiSnippet(allLines, fileName, true);
	const [isExpanded, setIsExpanded] = useState(true);

	useEffect(() => {
		setIsExpanded(true);
	}, [resetKey]);

	const removedBg = "rgba(248,81,73,0.12)";
	const removedBorder = "rgba(248,81,73,0.5)";
	const addedBg = "rgba(46,160,67,0.12)";
	const addedBorder = "rgba(46,160,67,0.5)";
	let globalLineIdx = 0;

	return (
		<div
			className="rounded-lg border overflow-hidden text-[11px] font-mono"
			style={{
				backgroundColor: theme?.surface ?? "var(--color-inferay-surface)",
				borderColor: theme?.border ?? "var(--color-inferay-border)",
			}}
		>
			<button
				type="button"
				onClick={() => setIsExpanded(!isExpanded)}
				className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-left hover:opacity-80 transition-all"
				style={{
					color: theme?.fg ?? "var(--color-inferay-text-2)",
					backgroundColor: theme?.bg ?? "var(--color-inferay-surface-2)",
					borderBottom: isExpanded
						? `1px solid ${theme?.border ?? "var(--color-inferay-border)"}`
						: "none",
				}}
			>
				<svg
					className={`w-2.5 h-2.5 opacity-40 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<polyline points="9 18 15 12 9 6" />
				</svg>
				{isStreaming ? (
					<span className="w-2 h-2 rounded-full bg-current opacity-50 animate-pulse" />
				) : (
					<svg
						className="w-2.5 h-2.5 opacity-40"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
						<polyline points="14 2 14 8 20 8" />
					</svg>
				)}
				<span className="flex-1 truncate opacity-80">{fileName}</span>
				<span className="flex items-center gap-1 text-[10px]">
					{stats.added > 0 && (
						<span style={{ color: "rgba(46,160,67,0.8)" }}>+{stats.added}</span>
					)}
					{stats.removed > 0 && (
						<span style={{ color: "rgba(248,81,73,0.8)" }}>
							−{stats.removed}
						</span>
					)}
				</span>
				{editCount !== undefined && (
					<span
						className="text-[10px] px-1.5 py-px rounded opacity-60"
						style={{
							backgroundColor: theme?.surface ?? "var(--color-inferay-surface)",
							color: theme?.fgDim ?? "var(--color-inferay-text-3)",
						}}
					>
						{editCount}×
					</span>
				)}
			</button>
			{isExpanded && (
				<div className="max-h-60 overflow-auto">
					{hunks.map((hunk, hunkIdx) => {
						let hunkLineIdx = globalLineIdx;
						const changedLines = hunk.filter(
							(line) => line.type !== "context" && line.text.trim() !== ""
						);

						return (
							<div key={hunkIdx}>
								{hunkIdx > 0 && (
									<div
										className="h-px my-0.5"
										style={{
											backgroundColor:
												theme?.border ?? "var(--color-inferay-border)",
											opacity: 0.3,
										}}
									/>
								)}
								{changedLines.map((line, lineIdx) => {
									const currentLineIdx = hunkLineIdx++;
									const highlightedHtml = highlighted.get(currentLineIdx);
									const isRemoved = line.type === "removed";
									const isAdded = line.type === "added";

									if (
										hunkIdx === hunks.length - 1 &&
										lineIdx === changedLines.length - 1
									) {
										globalLineIdx = currentLineIdx + 1;
									}

									return (
										<div
											key={`${hunkIdx}-${lineIdx}`}
											className="flex leading-[15px]"
											style={{
												backgroundColor: isRemoved
													? removedBg
													: isAdded
														? addedBg
														: "transparent",
												borderLeft: `2px solid ${isRemoved ? removedBorder : isAdded ? addedBorder : "transparent"}`,
											}}
										>
											<span
												className="shrink-0 w-5 text-center select-none text-[10px]"
												style={{
													color: isRemoved
														? "rgba(248,81,73,0.7)"
														: "rgba(46,160,67,0.7)",
												}}
											>
												{isRemoved ? "−" : "+"}
											</span>
											<span
												className="flex-1 whitespace-pre pr-2 overflow-hidden text-[10px] shiki-line"
												style={{
													color: theme?.fg ?? "var(--color-inferay-text)",
												}}
												dangerouslySetInnerHTML={
													isReady && highlightedHtml
														? { __html: highlightedHtml }
														: undefined
												}
											>
												{!(isReady && highlightedHtml)
													? line.text || " "
													: undefined}
											</span>
										</div>
									);
								})}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

export function MiniEditDiff({
	oldStr,
	newStr,
	filePath,
	theme,
	isStreaming,
}: {
	oldStr: string;
	newStr: string;
	filePath: string;
	theme?: DiffTheme;
	isStreaming?: boolean;
}) {
	const fileName = filePath.split("/").pop() || filePath;
	const { hunks, stats, allLines } = useMemo(() => {
		const computedHunks = computeDiffHunks(oldStr, newStr, 1);
		let added = 0;
		let removed = 0;
		const lines: string[] = [];

		for (const hunk of computedHunks) {
			for (const line of hunk) {
				if (line.type === "added") added++;
				else if (line.type === "removed") removed++;
				if (line.type !== "context" && line.text.trim() !== "") {
					lines.push(line.text);
				}
			}
		}

		return {
			hunks: computedHunks,
			stats: { added, removed },
			allLines: lines,
		};
	}, [newStr, oldStr]);

	return (
		<EditDiffCard
			fileName={fileName}
			hunks={hunks}
			stats={stats}
			allLines={allLines}
			theme={theme}
			isStreaming={isStreaming}
			resetKey={`${filePath}:${oldStr}:${newStr}:${isStreaming ? "streaming" : "done"}`}
		/>
	);
}

export function GroupedEditDiff({
	filePath,
	edits,
	theme,
}: {
	filePath: string;
	edits: EditMessage[];
	theme?: DiffTheme;
}) {
	const fileName = filePath.split("/").pop() || filePath;
	const editCount = edits.length;
	const { hunks, stats, allLines } = useMemo(() => {
		const parsedEdits: { old_string: string; new_string: string }[] = [];

		for (const edit of edits) {
			if (!edit.content) continue;
			try {
				const parsed = JSON.parse(edit.content);
				if (
					parsed.old_string !== undefined &&
					parsed.new_string !== undefined
				) {
					parsedEdits.push({
						old_string: parsed.old_string,
						new_string: parsed.new_string,
					});
				}
			} catch {}
		}

		const result = applyEditsSequentially(parsedEdits);
		if (!result) {
			return { hunks: [], stats: { added: 0, removed: 0 }, allLines: [] };
		}

		const computedHunks = computeDiffHunks(
			result.originalText,
			result.finalText,
			1
		);
		let added = 0;
		let removed = 0;
		const lines: string[] = [];

		for (const hunk of computedHunks) {
			for (const line of hunk) {
				if (line.type === "added") added++;
				else if (line.type === "removed") removed++;
				if (line.type !== "context" && line.text.trim() !== "") {
					lines.push(line.text);
				}
			}
		}

		return {
			hunks: computedHunks,
			stats: { added, removed },
			allLines: lines,
		};
	}, [edits]);

	if (hunks.length === 0) return null;

	return (
		<EditDiffCard
			fileName={fileName}
			hunks={hunks}
			stats={stats}
			allLines={allLines}
			theme={theme}
			editCount={editCount}
			resetKey={`${filePath}:${editCount}:${edits.map((edit) => edit.content).join("\u0000")}`}
		/>
	);
}
