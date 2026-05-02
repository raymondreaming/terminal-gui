import * as stylex from "@stylexjs/stylex";
import { useEffect, useMemo, useState } from "react";
import { useShikiSnippet } from "../../hooks/useShikiHighlighter.ts";
import { color, controlSize, font } from "../../tokens.stylex.ts";
import { IconChevronRight, IconFilePlus } from "../ui/Icons.tsx";

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
	isStreaming,
	resetKey,
}: {
	fileName: string;
	hunks: DiffLine[][];
	stats: { added: number; removed: number };
	allLines: string[];
	isStreaming?: boolean;
	resetKey: string;
}) {
	const { highlighted, isReady } = useShikiSnippet(allLines, fileName, true);
	const [isExpanded, setIsExpanded] = useState(true);

	// biome-ignore lint/correctness/useExhaustiveDependencies: resetKey intentionally resets expansion when edit content changes.
	useEffect(() => {
		setIsExpanded(true);
	}, [resetKey]);

	const removedBg = "rgba(248,81,73,0.08)";
	const removedBorder = "rgba(248,81,73,0.32)";
	const addedBg = "rgba(46,160,67,0.08)";
	const addedBorder = "rgba(46,160,67,0.32)";
	let globalLineIdx = 0;

	return (
		<div {...stylex.props(styles.card)}>
			<button
				type="button"
				onClick={() => setIsExpanded(!isExpanded)}
				{...stylex.props(styles.header)}
				style={{
					borderBottom: isExpanded
						? "1px solid var(--color-inferay-gray-border)"
						: "none",
				}}
			>
				<IconChevronRight
					size={10}
					{...stylex.props(
						styles.chevron,
						isExpanded ? styles.chevronExpanded : null
					)}
				/>
				{isStreaming ? (
					<span {...stylex.props(styles.streamingDot)} />
				) : (
					<IconFilePlus size={10} {...stylex.props(styles.headerIcon)} />
				)}
				<span {...stylex.props(styles.fileName)}>{fileName}</span>
				<span {...stylex.props(styles.stats)}>
					{stats.added > 0 && (
						<span {...stylex.props(styles.addedStat)}>+{stats.added}</span>
					)}
					{stats.removed > 0 && (
						<span {...stylex.props(styles.removedStat)}>−{stats.removed}</span>
					)}
				</span>
			</button>
			{isExpanded && (
				<div {...stylex.props(styles.body)}>
					{hunks.map((hunk, hunkIdx) => {
						let hunkLineIdx = globalLineIdx;
						const changedLines = hunk.filter(
							(line) => line.type !== "context" && line.text.trim() !== ""
						);

						return (
							<div key={hunkIdx}>
								{hunkIdx > 0 && <div {...stylex.props(styles.hunkDivider)} />}
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

									const lineContent =
										isReady && highlightedHtml ? (
											<span
												{...stylex.props(styles.lineText)}
												// biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki returns escaped syntax-highlighted HTML.
												dangerouslySetInnerHTML={{ __html: highlightedHtml }}
											/>
										) : (
											<span {...stylex.props(styles.lineText)}>
												{line.text || " "}
											</span>
										);

									return (
										<div
											key={`${hunkIdx}-${lineIdx}`}
											{...stylex.props(styles.diffLine)}
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
												{...stylex.props(styles.sign)}
												style={{
													color: isRemoved
														? "rgba(248,81,73,0.7)"
														: "rgba(46,160,67,0.7)",
												}}
											>
												{isRemoved ? "−" : "+"}
											</span>
											{lineContent}
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

const styles = stylex.create({
	card: {
		backgroundColor: color.backgroundRaised,
		borderColor: color.border,
		borderRadius: 8,
		borderStyle: "solid",
		borderWidth: 1,
		fontSize: "0.6875rem",
		overflow: "hidden",
	},
	header: {
		alignItems: "center",
		backgroundColor: color.backgroundRaised,
		color: {
			default: color.textSoft,
			":hover": color.textMain,
		},
		display: "flex",
		fontSize: "0.6875rem",
		fontWeight: font.weight_5,
		gap: "0.375rem",
		paddingBlock: controlSize._1,
		paddingInline: controlSize._2,
		textAlign: "left",
		transitionDuration: "150ms",
		transitionProperty: "color, opacity",
		transitionTimingFunction: "ease",
		width: "100%",
		":hover": {
			opacity: 0.8,
		},
	},
	chevron: {
		opacity: 0.4,
		transitionDuration: "150ms",
		transitionProperty: "transform",
		transitionTimingFunction: "ease",
	},
	chevronExpanded: {
		transform: "rotate(90deg)",
	},
	streamingDot: {
		backgroundColor: "currentColor",
		borderRadius: 999,
		height: controlSize._2,
		opacity: 0.5,
		width: controlSize._2,
	},
	headerIcon: {
		opacity: 0.4,
	},
	fileName: {
		flex: 1,
		minWidth: 0,
		opacity: 0.8,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	stats: {
		alignItems: "center",
		display: "flex",
		fontSize: font.size_2,
		gap: controlSize._1,
	},
	addedStat: {
		color: "rgba(46,160,67,0.68)",
	},
	removedStat: {
		color: "rgba(248,81,73,0.68)",
	},
	body: {
		fontFamily: "var(--font-diff)",
		maxHeight: 240,
		overflow: "auto",
	},
	hunkDivider: {
		backgroundColor: color.border,
		height: 1,
		marginBlock: "0.125rem",
		opacity: 0.3,
	},
	diffLine: {
		display: "flex",
		lineHeight: "15px",
		minWidth: "100%",
		width: "fit-content",
	},
	sign: {
		flexShrink: 0,
		fontSize: font.size_2,
		textAlign: "center",
		userSelect: "none",
		width: controlSize._5,
	},
	lineText: {
		color: color.textMain,
		flex: 1,
		fontSize: font.size_2,
		paddingRight: controlSize._2,
		whiteSpace: "pre",
	},
});

export function MiniEditDiff({
	oldStr,
	newStr,
	filePath,
	isStreaming,
}: {
	oldStr: string;
	newStr: string;
	filePath: string;
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
			isStreaming={isStreaming}
			resetKey={`${filePath}:${oldStr}:${newStr}:${isStreaming ? "streaming" : "done"}`}
		/>
	);
}

export function GroupedEditDiff({
	filePath,
	edits,
}: {
	filePath: string;
	edits: EditMessage[];
}) {
	const fileName = filePath.split("/").pop() || filePath;
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
			resetKey={`${filePath}:${edits.length}:${edits.map((edit) => edit.content).join("\u0000")}`}
		/>
	);
}
