import * as stylex from "@stylexjs/stylex";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { GitFileEntry } from "../../hooks/useGitStatus.ts";
import { color, controlSize, font } from "../../tokens.stylex.ts";
import { Button } from "../ui/Button.tsx";
import {
	IconChevronRight,
	IconFolderFill,
	IconGitCommit,
	IconPencil,
	IconPlus,
	IconSparkles,
} from "../ui/Icons.tsx";

export interface SelectedFile {
	path: string;
	staged: boolean;
}

/* ── Main reusable changes sidebar component ──────────── */

export function ChangeFileSidebar({
	fileViewMode,
	onFileViewModeChange,
	mainViewMode,
	// Diff mode props
	modified,
	untracked,
	staged,
	selectedFile,
	onSelectFile,
	onStageFile,
	onUnstageFile,
	onStageAll,
	onUnstageAll,
	hasProject,
	// Graph mode props
	selectedCommitHash,
	commitDetailsLoading,
	commitDetails,
	files,
	branch,
	// Commit props
	commitMessage,
	onCommitMessageChange,
	onCommit,
	isCommitting,
	amendMode,
	onAmendModeChange,
	cwd,
	showFileActions = true,
	showCommitSection = true,
}: {
	cwd?: string;
	fileViewMode: "path" | "tree";
	onFileViewModeChange: (mode: "path" | "tree") => void;
	mainViewMode: "diff" | "graph";
	modified: GitFileEntry[];
	untracked: GitFileEntry[];
	staged: GitFileEntry[];
	selectedFile: SelectedFile | null;
	onSelectFile: (f: GitFileEntry) => void;
	onStageFile: (path: string) => void;
	onUnstageFile: (path: string) => void;
	onStageAll: () => void;
	onUnstageAll: () => void;
	hasProject: boolean;
	selectedCommitHash: string | null;
	commitDetailsLoading: boolean;
	commitDetails: {
		hash: string;
		message: string;
		author: string;
		date: string;
		files: Array<{
			path: string;
			status: string;
			additions: number;
			deletions: number;
		}>;
	} | null;
	files: GitFileEntry[];
	branch?: string;
	commitMessage: string;
	onCommitMessageChange: (msg: string) => void;
	onCommit: () => void;
	isCommitting: boolean;
	amendMode: boolean;
	onAmendModeChange: (v: boolean) => void;
	showFileActions?: boolean;
	showCommitSection?: boolean;
}) {
	return (
		<div {...stylex.props(styles.root)}>
			<ChangeFileSidebarHeader
				fileViewMode={fileViewMode}
				onFileViewModeChange={onFileViewModeChange}
			/>

			{mainViewMode !== "graph" && (
				<div {...stylex.props(styles.scrollArea)}>
					<FileGroup
						title="Unstaged"
						files={[...modified, ...untracked]}
						color="text-inferay-soft-white"
						selected={selectedFile}
						onSelect={onSelectFile}
						actionLabel={showFileActions ? "Stage" : undefined}
						onAction={showFileActions ? onStageFile : undefined}
						onActionAll={showFileActions ? onStageAll : undefined}
						viewMode={fileViewMode}
						minHeight={200}
						maxHeight={300}
					/>
					<FileGroup
						title="Staged"
						files={staged}
						color="text-git-added"
						selected={selectedFile}
						onSelect={onSelectFile}
						actionLabel={showFileActions ? "Unstage" : undefined}
						onAction={showFileActions ? onUnstageFile : undefined}
						onActionAll={showFileActions ? onUnstageAll : undefined}
						viewMode={fileViewMode}
					/>

					{hasProject && !files.length && (
						<div {...stylex.props(styles.emptyState)}>
							<p {...stylex.props(styles.emptyText)}>Clean</p>
						</div>
					)}
					{!hasProject && (
						<div {...stylex.props(styles.emptyState)}>
							<p {...stylex.props(styles.emptyText, styles.centerText)}>
								No repository
							</p>
						</div>
					)}
				</div>
			)}

			{mainViewMode === "graph" && (
				<div {...stylex.props(styles.scrollArea)}>
					{selectedCommitHash === "wip" ? (
						<>
							<div {...stylex.props(styles.wipHeader)}>
								<div {...stylex.props(styles.wipDot)} />
								<span {...stylex.props(styles.wipTitle)}>
									WIP on {branch ?? "branch"}
								</span>
								<span {...stylex.props(styles.wipCount)}>
									{files.length} files
								</span>
							</div>
							<div {...stylex.props(styles.listPad)}>
								{files.map((f, i) => (
									<div key={i} {...stylex.props(styles.commitFileRow)}>
										<FileStatusIcon status={f.status} />
										<span {...stylex.props(styles.fileName)}>{f.path}</span>
									</div>
								))}
								{files.length === 0 && (
									<div {...stylex.props(styles.emptyState)}>
										<p {...stylex.props(styles.emptyText)}>No changes</p>
									</div>
								)}
							</div>
						</>
					) : selectedCommitHash ? (
						commitDetailsLoading ? (
							<div {...stylex.props(styles.emptyStateLarge)}>
								<p {...stylex.props(styles.mutedText)}>Loading...</p>
							</div>
						) : commitDetails ? (
							<CommitDetailsPanel details={commitDetails} />
						) : (
							<div {...stylex.props(styles.emptyStateLarge)}>
								<p {...stylex.props(styles.mutedText)}>No details</p>
							</div>
						)
					) : (
						<div {...stylex.props(styles.emptyStateLarge)}>
							<p {...stylex.props(styles.mutedText, styles.centerText)}>
								Select a commit to view details
							</p>
						</div>
					)}
				</div>
			)}

			{hasProject && mainViewMode !== "graph" && showCommitSection && (
				<CommitSection
					cwd={cwd}
					commitMessage={commitMessage}
					onCommitMessageChange={onCommitMessageChange}
					onCommit={onCommit}
					isCommitting={isCommitting}
					amendMode={amendMode}
					onAmendModeChange={onAmendModeChange}
					stagedCount={staged.length}
				/>
			)}
		</div>
	);
}

const styles = stylex.create({
	root: {
		display: "flex",
		flex: 1,
		flexDirection: "column",
		minWidth: 0,
	},
	scrollArea: {
		flex: 1,
		minHeight: 0,
		overflowY: "auto",
	},
	emptyState: {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		paddingBlock: controlSize._6,
	},
	emptyStateLarge: {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		paddingBlock: controlSize._8,
	},
	emptyText: {
		color: "rgba(255, 255, 255, 0.25)",
		fontSize: font.size_2,
	},
	centerText: {
		paddingInline: controlSize._3,
		textAlign: "center",
	},
	mutedText: {
		color: color.textMuted,
		fontSize: font.size_2,
	},
	mutedTextSmall: {
		color: color.textMuted,
		fontSize: font.size_1,
	},
	sidebarHeader: {
		position: "sticky",
		top: 0,
		zIndex: 20,
		display: "flex",
		alignItems: "center",
		gap: "0.375rem",
		borderBottomWidth: 1,
		borderBottomStyle: "solid",
		borderBottomColor: "rgba(255, 255, 255, 0.06)",
		backgroundColor: color.background,
		paddingBlock: "0.375rem",
		paddingInline: controlSize._2,
	},
	headerLabel: {
		color: color.textMuted,
		fontSize: font.size_1,
		fontWeight: font.weight_5,
	},
	spacer: {
		flex: 1,
	},
	segmented: {
		display: "flex",
		height: controlSize._5,
		alignItems: "center",
		overflow: "hidden",
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: color.border,
		borderRadius: "0.375rem",
		backgroundColor: color.backgroundRaised,
	},
	segmentButton: {
		height: "100%",
		paddingInline: "0.375rem",
		color: color.textMuted,
		fontSize: "0.5rem",
		fontWeight: font.weight_5,
		transitionProperty: "background-color, color",
		transitionDuration: "120ms",
		backgroundColor: {
			default: "transparent",
			":hover": color.controlHover,
		},
	},
	segmentButtonActive: {
		backgroundColor: color.controlActive,
		color: color.textMain,
	},
	wipHeader: {
		position: "sticky",
		top: 0,
		zIndex: 10,
		display: "flex",
		alignItems: "center",
		gap: controlSize._2,
		borderBottomWidth: 1,
		borderBottomStyle: "solid",
		borderBottomColor: color.border,
		backgroundColor: color.background,
		paddingBlock: controlSize._2,
		paddingInline: controlSize._3,
	},
	wipDot: {
		width: font.size_3,
		height: font.size_3,
		borderRadius: "999px",
		borderWidth: 2,
		borderStyle: "dashed",
		borderColor: "var(--color-inferay-accent)",
	},
	wipTitle: {
		color: color.textMain,
		fontSize: "0.6875rem",
		fontWeight: font.weight_5,
	},
	wipCount: {
		marginLeft: "auto",
		color: color.textMuted,
		fontSize: font.size_1,
	},
	listPad: {
		paddingBlock: controlSize._1,
	},
	commitSection: {
		flexShrink: 0,
		borderTopWidth: 1,
		borderTopStyle: "solid",
		borderTopColor: color.border,
	},
	commitHeader: {
		display: "flex",
		height: controlSize._8,
		alignItems: "center",
		justifyContent: "space-between",
		borderBottomWidth: 1,
		borderBottomStyle: "solid",
		borderBottomColor: "rgba(255, 255, 255, 0.06)",
		paddingInline: "0.625rem",
	},
	inlineGroup: {
		display: "flex",
		alignItems: "center",
		gap: "0.375rem",
	},
	inlineGroupWide: {
		display: "flex",
		alignItems: "center",
		gap: controlSize._2,
	},
	mutedIcon: {
		color: color.textMuted,
	},
	sectionTitle: {
		color: color.textSoft,
		fontSize: font.size_1,
		fontWeight: font.weight_5,
	},
	generateButton: {
		height: "1.375rem",
		gap: controlSize._1,
		paddingInline: "0.375rem",
		fontSize: "0.5rem",
	},
	checkRow: {
		display: "flex",
		cursor: "pointer",
		alignItems: "center",
		gap: "0.375rem",
		paddingBlock: "0.375rem",
		paddingInline: "0.625rem",
		backgroundColor: {
			default: "transparent",
			":hover": "rgba(255, 255, 255, 0.03)",
		},
	},
	checkbox: {
		width: font.size_3,
		height: font.size_3,
		accentColor: "var(--color-inferay-accent)",
	},
	commitForm: {
		display: "flex",
		flexDirection: "column",
		gap: controlSize._2,
		paddingInline: "0.625rem",
		paddingBottom: "0.625rem",
	},
	commitEditor: {
		overflow: "hidden",
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: {
			default: color.border,
			":focus-within": "rgba(29, 185, 84, 0.5)",
		},
		borderRadius: "0.5rem",
		backgroundColor: color.backgroundRaised,
	},
	summaryRow: {
		display: "flex",
		alignItems: "center",
		borderBottomWidth: 1,
		borderBottomStyle: "solid",
		borderBottomColor: "rgba(255, 255, 255, 0.04)",
	},
	summaryInput: {
		minWidth: 0,
		flex: 1,
		backgroundColor: "transparent",
		color: color.textMain,
		fontSize: "0.6875rem",
		outline: "none",
		paddingBlock: controlSize._2,
		paddingInline: "0.625rem",
		"::placeholder": {
			color: "rgba(255, 255, 255, 0.3)",
		},
	},
	summaryCount: {
		flexShrink: 0,
		paddingRight: "0.625rem",
		color: "rgba(255, 255, 255, 0.4)",
		fontSize: font.size_1,
		fontVariantNumeric: "tabular-nums",
	},
	warningText: {
		color: "#fbbf24",
	},
	descriptionInput: {
		width: "100%",
		resize: "none",
		backgroundColor: "transparent",
		color: color.textMain,
		fontSize: font.size_2,
		outline: "none",
		paddingBlock: controlSize._2,
		paddingInline: "0.625rem",
		"::placeholder": {
			color: "rgba(255, 255, 255, 0.3)",
		},
	},
	commitButton: {
		width: "100%",
		justifyContent: "center",
		gap: "0.375rem",
	},
	detailsRoot: {
		display: "flex",
		height: "100%",
		flexDirection: "column",
	},
	detailsHeader: {
		flexShrink: 0,
		display: "flex",
		flexDirection: "column",
		gap: controlSize._2,
		borderBottomWidth: 1,
		borderBottomStyle: "solid",
		borderBottomColor: color.border,
		padding: controlSize._3,
	},
	hashText: {
		color: "var(--color-inferay-accent)",
		fontFamily:
			"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
		fontSize: "0.6875rem",
		fontWeight: font.weight_5,
	},
	commitMessage: {
		color: color.textMain,
		fontSize: "0.6875rem",
		lineHeight: 1.55,
	},
	authorText: {
		color: color.textSoft,
		fontSize: font.size_2,
	},
	detailsSubheader: {
		flexShrink: 0,
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		borderBottomWidth: 1,
		borderBottomStyle: "solid",
		borderBottomColor: "rgba(255, 255, 255, 0.06)",
		backgroundColor: "rgba(255, 255, 255, 0.02)",
		paddingBlock: controlSize._2,
		paddingInline: controlSize._3,
	},
	detailsFooter: {
		flexShrink: 0,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		gap: controlSize._3,
		borderTopWidth: 1,
		borderTopStyle: "solid",
		borderTopColor: color.border,
		fontSize: font.size_2,
		paddingBlock: controlSize._2,
		paddingInline: controlSize._3,
	},
	commitFileRow: {
		display: "flex",
		alignItems: "center",
		gap: "0.375rem",
		paddingBlock: "0.375rem",
		paddingInline: controlSize._3,
		backgroundColor: {
			default: "transparent",
			":hover": "rgba(255, 255, 255, 0.05)",
		},
	},
	fileName: {
		minWidth: 0,
		flex: 1,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		color: color.textSoft,
		fontSize: font.size_2,
		fontWeight: font.weight_5,
	},
	fileStats: {
		flexShrink: 0,
		display: "flex",
		alignItems: "center",
		gap: controlSize._1,
		fontSize: font.size_1,
		fontVariantNumeric: "tabular-nums",
	},
	addedText: {
		color: "var(--color-git-added)",
	},
	deletedText: {
		color: "var(--color-git-deleted)",
	},
	statusIcon: {
		flexShrink: 0,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		width: "18px",
		height: "18px",
		borderRadius: "0.125rem",
		fontSize: font.size_1,
		fontWeight: 700,
		lineHeight: 1,
	},
	modified: {
		color: "#fbbf24",
	},
	addedStatus: {
		color: "var(--color-git-added)",
		backgroundColor: "rgba(35, 134, 54, 0.15)",
	},
	deletedStatus: {
		color: "var(--color-git-deleted)",
		backgroundColor: "rgba(248, 81, 73, 0.15)",
	},
	renamedStatus: {
		color: "#60a5fa",
		backgroundColor: "rgba(96, 165, 250, 0.15)",
	},
	defaultStatus: {
		color: color.textMuted,
		backgroundColor: "rgba(255, 255, 255, 0.08)",
	},
	fileGroup: {
		display: "flex",
		flexDirection: "column",
	},
	groupHeader: {
		position: "sticky",
		top: 0,
		zIndex: 10,
		display: "flex",
		height: controlSize._8,
		flexShrink: 0,
		alignItems: "center",
		justifyContent: "space-between",
		borderBottomWidth: 1,
		borderBottomStyle: "solid",
		borderBottomColor: "rgba(255, 255, 255, 0.06)",
		backgroundColor: color.background,
		paddingInline: "0.625rem",
	},
	groupToggle: {
		display: "flex",
		alignItems: "center",
		gap: "0.375rem",
		backgroundColor: "transparent",
	},
	cursorPointer: {
		cursor: "pointer",
	},
	cursorDefault: {
		cursor: "default",
	},
	chevron: {
		flexShrink: 0,
		color: color.textMuted,
		transitionProperty: "transform",
		transitionDuration: "120ms",
	},
	chevronOpen: {
		transform: "rotate(90deg)",
	},
	countPill: {
		display: "flex",
		minWidth: controlSize._4,
		height: controlSize._4,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: "999px",
		backgroundColor: "rgba(255, 255, 255, 0.08)",
		color: color.textMuted,
		fontSize: "0.5rem",
		fontVariantNumeric: "tabular-nums",
		paddingInline: controlSize._1,
	},
	actionAllButton: {
		height: "1.375rem",
		paddingInline: controlSize._2,
		fontSize: "0.5rem",
	},
	groupList: {
		flex: 1,
		overflowY: "auto",
	},
	pathRow: {
		position: "relative",
		display: "flex",
		alignItems: "center",
		gap: "0.375rem",
		borderLeftWidth: 2,
		borderLeftStyle: "solid",
		borderLeftColor: "transparent",
		paddingBlock: controlSize._1,
		paddingInline: controlSize._2,
		transitionProperty: "background-color, border-color",
		transitionDuration: "120ms",
		backgroundColor: {
			default: "transparent",
			":hover": "rgba(255, 255, 255, 0.04)",
		},
	},
	treeRow: {
		position: "relative",
		display: "flex",
		height: controlSize._6,
		cursor: "pointer",
		alignItems: "center",
		gap: controlSize._1,
		borderLeftWidth: 2,
		borderLeftStyle: "solid",
		borderLeftColor: "transparent",
		transitionProperty: "background-color, border-color",
		transitionDuration: "120ms",
		backgroundColor: {
			default: "transparent",
			":hover": "rgba(255, 255, 255, 0.04)",
		},
	},
	fileRowActive: {
		borderLeftColor: "var(--color-inferay-accent)",
		backgroundColor: "rgba(29, 185, 84, 0.08)",
	},
	fileButton: {
		minWidth: 0,
		flex: 1,
		display: "flex",
		flexDirection: "column",
		textAlign: "left",
		backgroundColor: "transparent",
	},
	pathFileName: {
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		color: color.textSoft,
		fontSize: font.size_2,
		fontWeight: font.weight_5,
		lineHeight: 1.25,
		transitionProperty: "color",
		transitionDuration: "120ms",
	},
	activeText: {
		color: color.textMain,
	},
	pathDir: {
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		color: "rgba(255, 255, 255, 0.34)",
		fontSize: "0.5rem",
		lineHeight: 1.25,
	},
	rowAction: {
		position: "absolute",
		right: controlSize._2,
		top: "50%",
		zIndex: 10,
		transform: "translateY(-50%)",
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: "rgba(255, 255, 255, 0.08)",
		borderRadius: "0.375rem",
		backgroundColor: color.backgroundRaised,
		color: color.textMuted,
		fontSize: "0.5rem",
		paddingBlock: "0.125rem",
		paddingInline: "0.375rem",
		opacity: 1,
		pointerEvents: "auto",
	},
	rowActionSubtle: {
		position: "absolute",
		right: controlSize._2,
		top: "50%",
		zIndex: 10,
		transform: "translateY(-50%)",
		borderRadius: "0.25rem",
		color: color.textMuted,
		fontSize: "0.5rem",
		paddingBlock: "0.125rem",
		paddingInline: "0.375rem",
		opacity: 1,
		backgroundColor: {
			default: "transparent",
			":hover": color.controlActive,
		},
	},
	folderIcon: {
		flexShrink: 0,
		color: "rgba(255, 255, 255, 0.3)",
		transitionProperty: "color",
		transitionDuration: "120ms",
	},
	folderIconOpen: {
		color: "rgba(29, 185, 84, 0.6)",
	},
	treeName: {
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		color: color.textSoft,
		fontSize: "0.59375rem",
		fontWeight: font.weight_5,
	},
	treeIndentSpacer: {
		width: "0.625rem",
		flexShrink: 0,
	},
	treeFileName: {
		minWidth: 0,
		flex: 1,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		color: color.textSoft,
		fontSize: "0.59375rem",
		fontWeight: font.weight_5,
		transitionProperty: "color",
		transitionDuration: "120ms",
	},
});

/* ── Sub-components ───────────────────────────────────── */

export function ChangeFileSidebarHeader({
	fileViewMode,
	onFileViewModeChange,
}: {
	fileViewMode: "path" | "tree";
	onFileViewModeChange: (mode: "path" | "tree") => void;
}) {
	return (
		<div {...stylex.props(styles.sidebarHeader)}>
			<span {...stylex.props(styles.headerLabel)}>Files</span>
			<span {...stylex.props(styles.spacer)} />
			<div {...stylex.props(styles.segmented)}>
				<button
					type="button"
					onClick={() => onFileViewModeChange("path")}
					title="Path view"
					{...stylex.props(
						styles.segmentButton,
						fileViewMode === "path" && styles.segmentButtonActive
					)}
				>
					Path
				</button>
				<button
					type="button"
					onClick={() => onFileViewModeChange("tree")}
					title="Tree view"
					{...stylex.props(
						styles.segmentButton,
						fileViewMode === "tree" && styles.segmentButtonActive
					)}
				>
					Tree
				</button>
			</div>
		</div>
	);
}

function CommitSection({
	cwd,
	commitMessage,
	onCommitMessageChange,
	onCommit,
	isCommitting,
	amendMode,
	onAmendModeChange,
	stagedCount,
}: {
	cwd?: string;
	commitMessage: string;
	onCommitMessageChange: (msg: string) => void;
	onCommit: () => void;
	isCommitting: boolean;
	amendMode: boolean;
	onAmendModeChange: (v: boolean) => void;
	stagedCount: number;
}) {
	const [generating, setGenerating] = useState(false);
	const summary = commitMessage.split("\n")[0] || "";
	const description = commitMessage.split("\n").slice(1).join("\n");

	const generateMessage = async () => {
		if (!cwd || !stagedCount || generating) return;
		setGenerating(true);
		try {
			const res = await fetch("/api/git/generate-commit-message", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ cwd }),
			});
			if (!res.ok) return;
			const data = (await res.json()) as { message?: string };
			if (data.message) {
				onCommitMessageChange(data.message);
			}
		} catch {
			// ignore
		} finally {
			setGenerating(false);
		}
	};

	return (
		<div {...stylex.props(styles.commitSection)}>
			<div {...stylex.props(styles.commitHeader)}>
				<div {...stylex.props(styles.inlineGroup)}>
					<IconGitCommit size={12} {...stylex.props(styles.mutedIcon)} />
					<span {...stylex.props(styles.sectionTitle)}>Commit</span>
				</div>
				<Button
					type="button"
					onClick={generateMessage}
					disabled={!stagedCount || generating || !cwd}
					title="Generate commit message from staged changes"
					variant="secondary"
					size="sm"
					className={stylex.props(styles.generateButton).className}
				>
					<IconSparkles
						size={10}
						className={generating ? "animate-pulse" : ""}
					/>
					{generating ? "Generating..." : "Generate"}
				</Button>
			</div>

			<label {...stylex.props(styles.checkRow)}>
				<input
					type="checkbox"
					checked={amendMode}
					onChange={(e) => onAmendModeChange(e.target.checked)}
					{...stylex.props(styles.checkbox)}
				/>
				<span {...stylex.props(styles.mutedTextSmall)}>
					Amend previous commit
				</span>
			</label>

			<div {...stylex.props(styles.commitForm)}>
				<div {...stylex.props(styles.commitEditor)}>
					<div {...stylex.props(styles.summaryRow)}>
						<input
							type="text"
							value={summary}
							onChange={(e) => {
								const lines = commitMessage.split("\n");
								lines[0] = e.target.value;
								onCommitMessageChange(lines.join("\n"));
							}}
							placeholder="Commit summary"
							{...stylex.props(styles.summaryInput)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
									e.preventDefault();
									onCommit();
								}
							}}
						/>
						{summary.length > 0 && (
							<span
								{...stylex.props(
									styles.summaryCount,
									summary.length > 72 && styles.warningText
								)}
							>
								{summary.length}
							</span>
						)}
					</div>
					<textarea
						value={description}
						onChange={(e) => {
							const sum = commitMessage.split("\n")[0] || "";
							onCommitMessageChange(
								sum + (e.target.value ? "\n" + e.target.value : "")
							);
						}}
						placeholder="Description"
						{...stylex.props(styles.descriptionInput)}
						rows={4}
					/>
				</div>

				<Button
					type="button"
					onClick={onCommit}
					disabled={!commitMessage.trim() || !stagedCount || isCommitting}
					variant="primary"
					size="md"
					className={stylex.props(styles.commitButton).className}
				>
					<IconGitCommit size={12} />
					{isCommitting
						? "Committing..."
						: stagedCount
							? `Commit changes to ${stagedCount} file${stagedCount !== 1 ? "s" : ""}`
							: "Nothing to commit"}
				</Button>
			</div>
		</div>
	);
}

function CommitDetailsPanel({
	details,
}: {
	details: {
		hash: string;
		message: string;
		author: string;
		date: string;
		files: Array<{
			path: string;
			status: string;
			additions: number;
			deletions: number;
		}>;
	};
}) {
	return (
		<div {...stylex.props(styles.detailsRoot)}>
			<div {...stylex.props(styles.detailsHeader)}>
				<div {...stylex.props(styles.inlineGroupWide)}>
					<span {...stylex.props(styles.hashText)}>
						{details.hash.slice(0, 7)}
					</span>
					<span {...stylex.props(styles.mutedText)}>{details.date}</span>
				</div>
				<p {...stylex.props(styles.commitMessage)}>{details.message}</p>
				<p {...stylex.props(styles.authorText)}>{details.author}</p>
			</div>

			<div {...stylex.props(styles.detailsSubheader)}>
				<span {...stylex.props(styles.sectionTitle)}>Files Changed</span>
				<span {...stylex.props(styles.mutedTextSmall)}>
					{details.files.length}
				</span>
			</div>

			<div {...stylex.props(styles.scrollArea)}>
				{details.files.map((file, i) => (
					<div
						key={i}
						{...stylex.props(styles.commitFileRow, styles.cursorPointer)}
					>
						<FileStatusIcon status={file.status} />
						<span {...stylex.props(styles.fileName)}>
							{file.path.split("/").pop()}
						</span>
						<div {...stylex.props(styles.fileStats)}>
							{file.additions > 0 && (
								<span {...stylex.props(styles.addedText)}>
									+{file.additions}
								</span>
							)}
							{file.deletions > 0 && (
								<span {...stylex.props(styles.deletedText)}>
									-{file.deletions}
								</span>
							)}
						</div>
					</div>
				))}
			</div>

			<div {...stylex.props(styles.detailsFooter)}>
				<span {...stylex.props(styles.addedText)}>
					+{details.files.reduce((sum, f) => sum + f.additions, 0)}
				</span>
				<span {...stylex.props(styles.deletedText)}>
					-{details.files.reduce((sum, f) => sum + f.deletions, 0)}
				</span>
			</div>
		</div>
	);
}

export function FileStatusIcon({ status }: { status: string }) {
	switch (status) {
		case "M":
			return (
				<span
					{...stylex.props(styles.statusIcon, styles.modified)}
					title="Modified"
				>
					<IconPencil size={10} />
				</span>
			);
		case "A":
			return (
				<span
					{...stylex.props(styles.statusIcon, styles.addedStatus)}
					title="Added"
				>
					A
				</span>
			);
		case "D":
			return (
				<span
					{...stylex.props(styles.statusIcon, styles.deletedStatus)}
					title="Deleted"
				>
					D
				</span>
			);
		case "R":
			return (
				<span
					{...stylex.props(styles.statusIcon, styles.renamedStatus)}
					title="Renamed"
				>
					R
				</span>
			);
		case "?":
			return (
				<span
					{...stylex.props(styles.statusIcon, styles.addedText)}
					title="Untracked"
				>
					<IconPlus size={10} />
				</span>
			);
		default:
			return (
				<span
					{...stylex.props(styles.statusIcon, styles.defaultStatus)}
					title={status}
				>
					{status.charAt(0) || "•"}
				</span>
			);
	}
}

/* ── Tree helpers ─────────────────────────────────────── */

interface TreeNode {
	name: string;
	path: string;
	children: Map<string, TreeNode>;
	file?: GitFileEntry;
}

function buildFileTree(files: GitFileEntry[]): TreeNode {
	const root: TreeNode = { name: "", path: "", children: new Map() };

	for (const file of files) {
		const parts = file.path.split("/");
		let current = root;
		let currentPath = "";

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i]!;
			currentPath = currentPath ? `${currentPath}/${part}` : part;

			if (!current.children.has(part)) {
				current.children.set(part, {
					name: part,
					path: currentPath,
					children: new Map(),
				});
			}
			current = current.children.get(part)!;
			if (i === parts.length - 1) {
				current.file = file;
			}
		}
	}

	return root;
}

function getExpandedDirs(files: GitFileEntry[]): Set<string> {
	const dirs = new Set<string>();
	for (const f of files) {
		const parts = f.path.split("/");
		let path = "";
		for (let i = 0; i < parts.length - 1; i++) {
			path = path ? `${path}/${parts[i]}` : parts[i]!;
			dirs.add(path);
		}
	}
	return dirs;
}

function TreeNodeRow({
	node,
	depth,
	selected,
	onSelect,
	onAction,
	actionLabel,
	expandedDirs,
	toggleDir,
}: {
	node: TreeNode;
	depth: number;
	selected: SelectedFile | null;
	onSelect: (f: GitFileEntry) => void;
	onAction?: (path: string) => void;
	actionLabel?: string;
	expandedDirs: Set<string>;
	toggleDir: (path: string) => void;
}) {
	const isDir = node.children.size > 0 && !node.file;
	const isExpanded = expandedDirs.has(node.path);
	const file = node.file;
	const active =
		file && selected?.path === file.path && selected?.staged === file.staged;

	const sortedChildren = [...node.children.values()].sort((a, b) => {
		const aIsDir = a.children.size > 0 && !a.file;
		const bIsDir = b.children.size > 0 && !b.file;
		if (aIsDir && !bIsDir) return -1;
		if (!aIsDir && bIsDir) return 1;
		return a.name.localeCompare(b.name);
	});

	return (
		<>
			<div
				{...stylex.props(styles.treeRow, active && styles.fileRowActive)}
				style={{ paddingLeft: `${5 + depth * 11}px`, paddingRight: 8 }}
				onClick={() => {
					if (isDir) {
						toggleDir(node.path);
					} else if (file) {
						onSelect(file);
					}
				}}
			>
				{isDir ? (
					<>
						<IconChevronRight
							size={10}
							{...stylex.props(
								styles.chevron,
								isExpanded && styles.chevronOpen
							)}
						/>
						<IconFolderFill
							size={12}
							{...stylex.props(
								styles.folderIcon,
								isExpanded && styles.folderIconOpen
							)}
						/>
						<span {...stylex.props(styles.treeName)}>{node.name}</span>
					</>
				) : file ? (
					<>
						<span {...stylex.props(styles.treeIndentSpacer)} />
						<FileStatusIcon status={file.status} />
						<span
							{...stylex.props(
								styles.treeFileName,
								active && styles.activeText
							)}
						>
							{node.name}
						</span>
						{onAction && (
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									onAction(file.path);
								}}
								{...stylex.props(styles.rowAction)}
							>
								{actionLabel}
							</button>
						)}
					</>
				) : null}
			</div>
			{isDir &&
				isExpanded &&
				sortedChildren.map((child) => (
					<TreeNodeRow
						key={child.path}
						node={child}
						depth={depth + 1}
						selected={selected}
						onSelect={onSelect}
						onAction={onAction}
						actionLabel={actionLabel}
						expandedDirs={expandedDirs}
						toggleDir={toggleDir}
					/>
				))}
		</>
	);
}

export function FileGroup({
	title,
	files,
	selected,
	onSelect,
	actionLabel,
	onAction,
	onActionAll,
	isCollapsible = true,
	viewMode = "path",
	minHeight,
	maxHeight,
}: {
	title: string;
	files: GitFileEntry[];
	color?: string;
	selected: SelectedFile | null;
	onSelect: (f: GitFileEntry) => void;
	actionLabel?: string;
	onAction?: (path: string) => void;
	onActionAll?: () => void;
	isCollapsible?: boolean;
	viewMode?: "path" | "tree";
	minHeight?: number;
	maxHeight?: number;
}) {
	const [isCollapsed, setIsCollapsed] = useState(false);
	const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() =>
		getExpandedDirs(files)
	);

	useEffect(() => {
		if (viewMode === "tree") {
			setExpandedDirs(getExpandedDirs(files));
		}
	}, [files, viewMode]);

	const toggleDir = useCallback((path: string) => {
		setExpandedDirs((prev) => {
			const next = new Set(prev);
			if (next.has(path)) {
				next.delete(path);
			} else {
				next.add(path);
			}
			return next;
		});
	}, []);

	const tree = useMemo(() => buildFileTree(files), [files]);

	if (!files.length) return null;
	return (
		<div
			{...stylex.props(styles.fileGroup)}
			style={{
				minHeight: minHeight && !isCollapsed ? minHeight : undefined,
			}}
		>
			<div {...stylex.props(styles.groupHeader)}>
				<button
					type="button"
					onClick={() => isCollapsible && setIsCollapsed(!isCollapsed)}
					{...stylex.props(
						styles.groupToggle,
						isCollapsible ? styles.cursorPointer : styles.cursorDefault
					)}
				>
					{isCollapsible && (
						<IconChevronRight
							size={10}
							{...stylex.props(
								styles.chevron,
								!isCollapsed && styles.chevronOpen
							)}
						/>
					)}
					<span {...stylex.props(styles.sectionTitle)}>{title} Files</span>
					<span {...stylex.props(styles.countPill)}>{files.length}</span>
				</button>
				{onActionAll && !isCollapsed && (
					<Button
						type="button"
						onClick={onActionAll}
						variant="secondary"
						size="sm"
						className={stylex.props(styles.actionAllButton).className}
					>
						{actionLabel} All
					</Button>
				)}
			</div>
			{!isCollapsed && (
				<div
					{...stylex.props(styles.groupList)}
					style={{ maxHeight: maxHeight ?? undefined }}
				>
					{viewMode === "path" &&
						files.map((f) => {
							const active =
								selected?.path === f.path && selected?.staged === f.staged;
							const name = f.path.split("/").pop() || f.path;
							const dir = f.path.includes("/")
								? f.path.slice(0, f.path.lastIndexOf("/"))
								: "";
							return (
								<div
									key={`${f.staged ? "s" : "u"}-${f.path}`}
									{...stylex.props(
										styles.pathRow,
										active && styles.fileRowActive
									)}
								>
									<FileStatusIcon status={f.status} />
									<button
										type="button"
										onClick={() => onSelect(f)}
										{...stylex.props(styles.fileButton)}
										title={f.path}
									>
										<span
											{...stylex.props(
												styles.pathFileName,
												active && styles.activeText
											)}
										>
											{name}
										</span>
										{dir && (
											<span {...stylex.props(styles.pathDir)}>{dir}</span>
										)}
									</button>
									{onAction && (
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												onAction(f.path);
											}}
											{...stylex.props(styles.rowActionSubtle)}
											title={`${actionLabel} ${f.path}`}
										>
											{actionLabel}
										</button>
									)}
								</div>
							);
						})}
					{viewMode === "tree" && (
						<div>
							{[...tree.children.values()]
								.sort((a, b) => {
									const aIsDir = a.children.size > 0 && !a.file;
									const bIsDir = b.children.size > 0 && !b.file;
									if (aIsDir && !bIsDir) return -1;
									if (!aIsDir && bIsDir) return 1;
									return a.name.localeCompare(b.name);
								})
								.map((child) => (
									<TreeNodeRow
										key={child.path}
										node={child}
										depth={0}
										selected={selected}
										onSelect={onSelect}
										onAction={onAction}
										actionLabel={actionLabel}
										expandedDirs={expandedDirs}
										toggleDir={toggleDir}
									/>
								))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
