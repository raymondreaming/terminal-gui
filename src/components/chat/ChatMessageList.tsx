import * as stylex from "@stylexjs/stylex";
import React, { useMemo, useState } from "react";
import {
	color,
	controlSize,
	font,
	motion,
	radius,
} from "../../tokens.stylex.ts";
import { ThinkingIndicator } from "../ui/DotMatrixLoader.tsx";
import { IconChevronDown, IconClock } from "../ui/Icons.tsx";
import { GroupedEditDiff, MiniEditDiff } from "./ChatEditDiff.tsx";
import { AskUserQuestionCard, Markdown } from "./ChatRichContent.tsx";
import { renderTextPills } from "./chat-token-decorators.tsx";

type ChatMessage = {
	id: string;
	role: "user" | "assistant" | "tool" | "system" | "btw";
	content: string;
	toolName?: string;
	isStreaming?: boolean;
	btwQuestion?: string;
	images?: string[];
};

type CheckpointInfo = {
	id: string;
	timestamp: number;
	changedFileCount: number;
	changedFiles: { path: string; action: "created" | "modified" | "deleted" }[];
	reverted: boolean;
	afterMessageId: string | null;
};

type RenderItem =
	| { type: "message"; message: ChatMessage }
	| { type: "edit-group"; filePath: string; edits: ChatMessage[] };

function isActivityBarTool(msg: ChatMessage): boolean {
	return (
		msg.role === "tool" &&
		msg.toolName !== "AskUserQuestion" &&
		msg.toolName !== "Edit"
	);
}

function getEditFilePath(msg: ChatMessage): string | null {
	if (msg.role !== "tool" || msg.toolName !== "Edit" || !msg.content)
		return null;
	try {
		const parsed = JSON.parse(msg.content);
		return parsed.file_path || null;
	} catch {
		return null;
	}
}

function buildRenderItems(messages: ChatMessage[]): RenderItem[] {
	const items: RenderItem[] = [];
	const filtered = messages.filter((msg) => !isActivityBarTool(msg));
	const editGroups = new Map<
		number,
		{ filePath: string; edits: ChatMessage[]; lastIdx: number }
	>();
	const skipIndices = new Set<number>();

	for (let i = 0; i < filtered.length; i++) {
		if (skipIndices.has(i)) continue;
		const msg = filtered[i]!;
		const filePath = getEditFilePath(msg);
		if (!filePath) continue;
		const edits: ChatMessage[] = [msg];
		const editIndices: number[] = [i];
		let j = i + 1;

		while (j < filtered.length) {
			const nextMsg = filtered[j]!;
			const nextFilePath = getEditFilePath(nextMsg);
			if (nextFilePath === filePath) {
				edits.push(nextMsg);
				editIndices.push(j);
				j++;
			} else if (nextMsg.role === "assistant" || nextMsg.role === "user") {
				j++;
			} else if (nextFilePath && nextFilePath !== filePath) {
				break;
			} else {
				j++;
			}
		}

		if (edits.length > 1) {
			for (const idx of editIndices) skipIndices.add(idx);
			const lastEditIdx = editIndices[editIndices.length - 1]!;
			editGroups.set(lastEditIdx, { filePath, edits, lastIdx: lastEditIdx });
		}
	}

	for (let i = 0; i < filtered.length; i++) {
		const group = editGroups.get(i);
		if (group) {
			items.push({
				type: "edit-group",
				filePath: group.filePath,
				edits: group.edits,
			});
			continue;
		}
		if (skipIndices.has(i)) continue;
		items.push({ type: "message", message: filtered[i]! });
	}

	return items;
}

function ToolOutputHighlight({ content }: { content: string }) {
	try {
		if (content.trim().startsWith("{")) {
			const parsed = JSON.parse(content);
			const fileName = parsed.file_path
				? parsed.file_path.split("/").pop() || parsed.file_path
				: undefined;
			if (parsed.file_path && parsed.new_string !== undefined) {
				return (
					<>
						<span {...stylex.props(styles.toolMuted)}>{fileName}</span>
						{"\n"}
						<span {...stylex.props(styles.toolAccent)}>
							{parsed.new_string}
						</span>
					</>
				);
			}
			if (parsed.command)
				return (
					<span {...stylex.props(styles.toolAccent)}>$ {parsed.command}</span>
				);
			if (parsed.pattern)
				return (
					<span {...stylex.props(styles.toolAccent)}>/{parsed.pattern}/</span>
				);
			if (parsed.file_path && parsed.content) {
				const preview =
					parsed.content.length > 300
						? `${parsed.content.slice(0, 300)}...`
						: parsed.content;
				return (
					<>
						<span {...stylex.props(styles.toolMuted)}>{fileName}</span>
						{"\n"}
						<span {...stylex.props(styles.toolAccent)}>{preview}</span>
					</>
				);
			}
			if (parsed.file_path)
				return <span {...stylex.props(styles.toolAccent)}>{fileName}</span>;
			if (parsed.glob || parsed.include) {
				return (
					<span {...stylex.props(styles.toolAccent)}>
						{parsed.glob || parsed.include}
					</span>
				);
			}
			if (parsed.url) {
				return (
					<a
						href={parsed.url}
						target="_blank"
						rel="noopener noreferrer"
						{...stylex.props(styles.toolLink)}
					>
						{parsed.url}
					</a>
				);
			}
			if (parsed.query)
				return <span {...stylex.props(styles.toolAccent)}>{parsed.query}</span>;
		}
	} catch {}
	return <>{content}</>;
}

function CheckpointMarker({
	checkpoint,
	onRevert,
	disabled,
}: {
	checkpoint: CheckpointInfo;
	onRevert: (id: string) => void;
	disabled?: boolean;
}) {
	const [expanded, setExpanded] = useState(false);
	return (
		<div {...stylex.props(styles.checkpointCard)}>
			<div
				{...stylex.props(styles.checkpointHeader)}
				style={{
					borderBottom: expanded
						? "1px solid var(--color-inferay-gray-border)"
						: "none",
				}}
			>
				<button
					type="button"
					onClick={() => setExpanded(!expanded)}
					{...stylex.props(styles.checkpointToggle)}
				>
					<IconChevronDown
						size={11}
						{...stylex.props(
							styles.checkpointChevron,
							!expanded && styles.rotateClosed
						)}
					/>
					<IconClock
						size={11}
						{...stylex.props(
							styles.checkpointIcon,
							checkpoint.reverted && styles.revertedIcon
						)}
					/>
					<span {...stylex.props(styles.checkpointTitle)}>
						{checkpoint.changedFileCount} file
						{checkpoint.changedFileCount !== 1 ? "s" : ""} changed
					</span>
				</button>
				<span {...stylex.props(styles.spacer)} />
				{!checkpoint.reverted ? (
					<button
						type="button"
						onClick={() => onRevert(checkpoint.id)}
						disabled={disabled}
						{...stylex.props(styles.undoButton)}
					>
						Undo
					</button>
				) : (
					<span {...stylex.props(styles.revertedLabel)}>reverted</span>
				)}
			</div>
			{expanded && (
				<div {...stylex.props(styles.checkpointFiles)}>
					{checkpoint.changedFiles.map((f) => (
						<div key={f.path} {...stylex.props(styles.checkpointFile)}>
							<span
								style={{
									color:
										f.action === "created"
											? "#22c55e"
											: f.action === "deleted"
												? "#ef4444"
												: "#eab308",
								}}
							>
								{f.action === "created"
									? "+"
									: f.action === "deleted"
										? "-"
										: "~"}
							</span>
							<span {...stylex.props(styles.toolMuted)}>
								{f.path.split("/").pop()}
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

const Bubble = React.memo(function Bubble({
	msg,
	collapsed,
	onToggle,
	onSendMessage,
	onMdFileClick,
	slashCommandNames,
}: {
	msg: ChatMessage;
	collapsed: boolean;
	onToggle: (id: string) => void;
	onSendMessage?: (text: string) => void;
	onMdFileClick?: (path: string) => void;
	slashCommandNames: readonly string[];
}) {
	if (msg.role === "user") {
		const commandMatch = msg.content.match(/^\/([a-zA-Z0-9_-]+)(\s|$)/);
		if (
			commandMatch?.[1] &&
			slashCommandNames.some(
				(command) => command.toLowerCase() === commandMatch[1]!.toLowerCase()
			)
		) {
			return null;
		}
		let imagePaths = msg.images ?? [];
		let displayContent = msg.content;
		if (
			imagePaths.length === 0 &&
			msg.content.includes("Here are the images at these paths:")
		) {
			const parts = msg.content.split("Here are the images at these paths:\n");
			displayContent = parts[0]?.trim() ?? "";
			const pathLines = parts[1]?.split("\n").filter((p) => p.trim()) ?? [];
			imagePaths = pathLines.filter((p) => p.includes("/.tmp/"));
		}
		return (
			<div {...stylex.props(styles.userRow)}>
				<div {...stylex.props(styles.userBubble)}>
					{imagePaths.length > 0 && (
						<div {...stylex.props(styles.userImages)}>
							{imagePaths.map((imgPath) => (
								<img
									key={imgPath}
									src={`/api/file?path=${encodeURIComponent(imgPath)}`}
									alt=""
									{...stylex.props(styles.userImage)}
								/>
							))}
						</div>
					)}
					{displayContent && (
						<p {...stylex.props(styles.userText)}>
							{renderTextPills(displayContent, slashCommandNames)}
						</p>
					)}
				</div>
			</div>
		);
	}

	if (msg.role === "system") {
		const runningMatch = msg.content.match(/^Running \/(.+)\.\.\.$/);
		if (runningMatch?.[1]) {
			const commandName = runningMatch[1];
			return (
				<div {...stylex.props(styles.systemRunRow)}>
					<div {...stylex.props(styles.systemRunPill)}>
						<span {...stylex.props(styles.runningCommand)}>/{commandName}</span>
					</div>
				</div>
			);
		}
		return <p {...stylex.props(styles.systemText)}>{msg.content}</p>;
	}

	if (msg.role === "btw") {
		return (
			<div {...stylex.props(styles.btwCard)}>
				<div {...stylex.props(styles.btwHeader)}>
					<span {...stylex.props(styles.btwLabel)}>btw</span>
					{msg.btwQuestion && (
						<span {...stylex.props(styles.btwQuestion)}>
							- {msg.btwQuestion}
						</span>
					)}
				</div>
				<div {...stylex.props(styles.btwBody)}>
					{msg.content ? (
						<Markdown text={msg.content} onMdFileClick={onMdFileClick} />
					) : msg.isStreaming ? (
						<div {...stylex.props(styles.btwDots)}>
							<span {...stylex.props(styles.smallDot)} />
							<span {...stylex.props(styles.smallDot, styles.dot2)} />
							<span {...stylex.props(styles.smallDot, styles.dot3)} />
						</div>
					) : null}
				</div>
			</div>
		);
	}

	if (msg.role === "tool") {
		if (msg.toolName === "AskUserQuestion") {
			return (
				<AskUserQuestionCard
					content={msg.content}
					isStreaming={msg.isStreaming}
					onSendMessage={onSendMessage}
				/>
			);
		}
		if (msg.toolName === "Edit" && msg.content) {
			try {
				const parsed = JSON.parse(msg.content);
				if (
					parsed.file_path &&
					parsed.old_string !== undefined &&
					parsed.new_string !== undefined
				) {
					return (
						<MiniEditDiff
							oldStr={parsed.old_string}
							newStr={parsed.new_string}
							filePath={parsed.file_path}
							isStreaming={msg.isStreaming}
						/>
					);
				}
			} catch {}
		}
		return (
			<div>
				<button
					type="button"
					onClick={() => onToggle(msg.id)}
					{...stylex.props(styles.toolToggle)}
				>
					<IconChevronDown
						size={7}
						{...stylex.props(collapsed && styles.rotateClosed)}
					/>
					<span {...stylex.props(styles.toolName)}>{msg.toolName}</span>
				</button>
				{!collapsed && msg.content && (
					<pre {...stylex.props(styles.toolOutput)}>
						<ToolOutputHighlight content={msg.content} />
					</pre>
				)}
			</div>
		);
	}

	return (
		<div {...stylex.props(styles.assistantMessage)}>
			<Markdown text={msg.content} onMdFileClick={onMdFileClick} />
		</div>
	);
});

export function ChatMessageList({
	messages,
	expandedTools,
	toggleTool,
	checkpoints,
	revertCheckpoint,
	isLoading,
	startTime,
	handleSendMessage,
	onMdFileClick,
	slashCommandNames,
}: {
	messages: ChatMessage[];
	expandedTools: Set<string>;
	toggleTool: (id: string) => void;
	checkpoints: CheckpointInfo[];
	revertCheckpoint: (id: string) => void;
	isLoading: boolean;
	startTime?: number | null;
	handleSendMessage?: (text: string) => void;
	onMdFileClick?: (path: string) => void;
	slashCommandNames: readonly string[];
}) {
	const renderItems = useMemo(() => buildRenderItems(messages), [messages]);
	return (
		<div {...stylex.props(styles.messageList)}>
			{renderItems.map((item, idx) => {
				if (item.type === "edit-group") {
					return (
						<GroupedEditDiff
							key={`edit-group-${item.filePath}-${idx}`}
							filePath={item.filePath}
							edits={item.edits}
						/>
					);
				}
				const msg = item.message;
				return (
					<React.Fragment key={msg.id}>
						<Bubble
							msg={msg}
							collapsed={!expandedTools.has(msg.id)}
							onToggle={toggleTool}
							onSendMessage={handleSendMessage}
							onMdFileClick={onMdFileClick}
							slashCommandNames={slashCommandNames}
						/>
						{msg.role === "assistant" &&
							!msg.isStreaming &&
							(() => {
								const cp = checkpoints.find((c) => c.afterMessageId === msg.id);
								if (!cp) return null;
								return (
									<CheckpointMarker
										checkpoint={cp}
										onRevert={revertCheckpoint}
										disabled={isLoading}
									/>
								);
							})()}
					</React.Fragment>
				);
			})}
			{isLoading && startTime && <ThinkingIndicator startTime={startTime} />}
		</div>
	);
}

const styles = stylex.create({
	toolMuted: {
		color: color.textMuted,
	},
	toolAccent: {
		color: color.accent,
	},
	toolLink: {
		color: color.accent,
		textDecorationColor: {
			default: color.accentBorder,
			":hover": color.accent,
		},
		textDecorationLine: "underline",
	},
	checkpointCard: {
		backgroundColor: color.backgroundRaised,
		borderColor: color.border,
		borderRadius: radius.sm,
		borderStyle: "solid",
		borderWidth: 1,
		marginBlock: controlSize._1,
		overflow: "hidden",
	},
	checkpointHeader: {
		alignItems: "center",
		display: "flex",
		gap: controlSize._1,
		minHeight: controlSize._5,
		paddingBlock: controlSize._0_5,
		paddingInline: controlSize._1_5,
	},
	checkpointToggle: {
		alignItems: "center",
		color: color.textSoft,
		display: "flex",
		flex: 1,
		fontSize: font.size_1,
		fontWeight: font.weight_5,
		gap: controlSize._1,
		minWidth: 0,
		textAlign: "left",
		transitionDuration: motion.durationBase,
		transitionProperty: "opacity",
		transitionTimingFunction: motion.ease,
		":hover": {
			opacity: 0.8,
		},
	},
	undoButton: {
		borderRadius: radius.sm,
		color: color.textMuted,
		fontSize: font.size_1,
		fontWeight: font.weight_5,
		paddingBlock: 0,
		paddingInline: controlSize._1,
		transitionDuration: motion.durationBase,
		transitionProperty: "color, opacity",
		transitionTimingFunction: motion.ease,
		":hover": {
			color: color.textSoft,
		},
		":disabled": {
			opacity: 0.4,
		},
	},
	revertedLabel: {
		borderRadius: radius.md,
		color: color.textMuted,
		fontSize: font.size_2,
		fontStyle: "italic",
		paddingBlock: 1,
		paddingInline: controlSize._1_5,
	},
	checkpointFiles: {
		display: "flex",
		flexDirection: "column",
		gap: controlSize._0_5,
		paddingBottom: controlSize._2,
		paddingInline: controlSize._2,
		paddingTop: controlSize._1,
	},
	checkpointFile: {
		alignItems: "center",
		display: "flex",
		fontFamily: font.familyMono,
		fontSize: font.size_1,
		gap: controlSize._1_5,
		paddingInline: controlSize._1,
	},
	checkpointChevron: {
		flexShrink: 0,
		opacity: 0.4,
		transitionDuration: motion.durationBase,
		transitionProperty: "transform",
	},
	rotateClosed: {
		transform: "rotate(-90deg)",
	},
	checkpointIcon: {
		flexShrink: 0,
		opacity: 0.4,
		color: color.textMuted,
	},
	revertedIcon: {
		color: color.danger,
	},
	checkpointTitle: {
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		opacity: 0.8,
	},
	spacer: {
		flex: 1,
	},
	userRow: {
		display: "flex",
		justifyContent: "flex-end",
	},
	userBubble: {
		maxWidth: "85%",
		borderRadius: radius.lg,
		borderBottomRightRadius: radius.xs,
		paddingBlock: controlSize._1_5,
		paddingInline: controlSize._2_5,
	},
	userImages: {
		display: "flex",
		flexWrap: "wrap",
		gap: controlSize._1_5,
		marginBottom: controlSize._1_5,
	},
	userImage: {
		maxWidth: "8rem",
		maxHeight: "6rem",
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: color.borderControl,
		borderRadius: radius.sm,
		objectFit: "cover",
	},
	userText: {
		whiteSpace: "pre-wrap",
		overflowWrap: "break-word",
		fontSize: font.size_3,
	},
	systemRunRow: {
		display: "flex",
		justifyContent: "center",
		paddingBlock: controlSize._1,
	},
	systemRunPill: {
		display: "inline-flex",
		alignItems: "center",
		gap: controlSize._2_5,
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: color.accentBorder,
		borderRadius: radius.lg,
		backgroundColor: color.accentWash,
		paddingBlock: controlSize._1_5,
		paddingInline: controlSize._3,
	},
	runningCommand: {
		color: color.accent,
		fontFamily: font.familyMono,
		fontSize: font.size_4,
		fontWeight: font.weight_5,
	},
	dot2: {
		animationDelay: "0.1s",
	},
	dot3: {
		animationDelay: "0.2s",
	},
	systemText: {
		color: color.textMuted,
		fontSize: font.size_2,
		textAlign: "center",
	},
	btwCard: {
		borderWidth: 1,
		borderStyle: "dashed",
		borderColor: color.accentBorder,
		borderRadius: radius.lg,
		backgroundColor: color.accentWash,
		paddingBlock: controlSize._2,
		paddingInline: controlSize._3,
	},
	btwHeader: {
		display: "flex",
		alignItems: "center",
		gap: controlSize._1_5,
		marginBottom: controlSize._1_5,
	},
	btwLabel: {
		color: color.accent,
		fontSize: font.size_1,
		fontWeight: font.weight_6,
		letterSpacing: "0.08em",
		textTransform: "uppercase",
	},
	btwQuestion: {
		color: color.textMuted,
		fontFamily: font.familyMono,
		fontSize: font.size_2,
	},
	btwBody: {
		color: color.textSoft,
		fontSize: font.size_3,
		lineHeight: 1.6,
	},
	btwDots: {
		display: "flex",
		alignItems: "center",
		gap: controlSize._0_5,
		paddingBlock: controlSize._1,
	},
	smallDot: {
		width: controlSize._1,
		height: controlSize._1,
		borderRadius: radius.pill,
		backgroundColor: color.accent,
		animationName: stylex.keyframes({
			"50%": {
				transform: "translateY(-2px)",
			},
		}),
		animationDuration: "0.6s",
		animationIterationCount: "infinite",
	},
	toolToggle: {
		display: "flex",
		alignItems: "center",
		gap: controlSize._1,
		color: color.textMuted,
		fontSize: font.size_2,
	},
	toolName: {
		fontFamily: font.familyMono,
		fontSize: font.size_1,
	},
	toolOutput: {
		maxHeight: "7rem",
		overflow: "auto",
		whiteSpace: "pre-wrap",
		overflowWrap: "break-word",
		borderRadius: radius.sm,
		backgroundColor: color.backgroundRaised,
		color: color.textMuted,
		fontFamily: font.familyMono,
		fontSize: font.size_1,
		lineHeight: 1.6,
		marginTop: "0.125rem",
		paddingBlock: controlSize._1,
		paddingInline: controlSize._2,
	},
	assistantMessage: {
		position: "relative",
		width: "100%",
		minWidth: 0,
		overflowWrap: "break-word",
		color: color.textSoft,
		fontSize: font.size_3,
		lineHeight: 1.6,
	},
	messageList: {
		display: "flex",
		flexDirection: "column",
		gap: controlSize._2,
		minWidth: 0,
		paddingBottom: controlSize._8,
		paddingInline: controlSize._3,
		paddingTop: controlSize._2,
	},
});
