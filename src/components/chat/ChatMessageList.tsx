import React, { useMemo, useState } from "react";
import { GroupedEditDiff, MiniEditDiff } from "./ChatEditDiff.tsx";
import { AskUserQuestionCard, Markdown } from "./ChatRichContent.tsx";
import { renderTextPills } from "./chat-token-decorators.tsx";

type ChatTheme = {
	bg: string;
	fg: string;
	cursor: string;
	surface: string;
	border: string;
	fgMuted: string;
	fgDim: string;
};

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

function ToolOutputHighlight({
	content,
	theme,
}: {
	content: string;
	theme?: ChatTheme;
}) {
	const accentStyle = { color: theme?.cursor ?? "#007AFF" };
	try {
		if (content.trim().startsWith("{")) {
			const parsed = JSON.parse(content);
			const fileName = parsed.file_path
				? parsed.file_path.split("/").pop() || parsed.file_path
				: undefined;
			if (parsed.file_path && parsed.new_string !== undefined) {
				return (
					<>
						<span style={{ color: theme?.fgDim ?? "#666" }}>{fileName}</span>
						{"\n"}
						<span style={accentStyle}>{parsed.new_string}</span>
					</>
				);
			}
			if (parsed.command)
				return <span style={accentStyle}>$ {parsed.command}</span>;
			if (parsed.pattern)
				return <span style={accentStyle}>/{parsed.pattern}/</span>;
			if (parsed.file_path && parsed.content) {
				const preview =
					parsed.content.length > 300
						? `${parsed.content.slice(0, 300)}...`
						: parsed.content;
				return (
					<>
						<span style={{ color: theme?.fgDim ?? "#666" }}>{fileName}</span>
						{"\n"}
						<span style={accentStyle}>{preview}</span>
					</>
				);
			}
			if (parsed.file_path) return <span style={accentStyle}>{fileName}</span>;
			if (parsed.glob || parsed.include) {
				return <span style={accentStyle}>{parsed.glob || parsed.include}</span>;
			}
			if (parsed.url) {
				return (
					<a
						href={parsed.url}
						target="_blank"
						rel="noopener noreferrer"
						className="underline decoration-current/30 hover:decoration-current/60"
						style={accentStyle}
					>
						{parsed.url}
					</a>
				);
			}
			if (parsed.query) return <span style={accentStyle}>{parsed.query}</span>;
		}
	} catch {}
	return <>{content}</>;
}

function CheckpointMarker({
	checkpoint,
	theme,
	onRevert,
	disabled,
}: {
	checkpoint: CheckpointInfo;
	theme?: ChatTheme;
	onRevert: (id: string) => void;
	disabled?: boolean;
}) {
	const [expanded, setExpanded] = useState(false);
	const accentColor = theme?.cursor ?? "#3b82f6";
	const revertedColor = "#ef4444";
	const baseColor = checkpoint.reverted ? revertedColor : accentColor;
	return (
		<div
			className="rounded my-1"
			style={{
				backgroundColor: `${baseColor}08`,
				borderLeft: `2px solid ${`${baseColor}40`}`,
			}}
		>
			<div className="flex items-center gap-2 px-2 py-1">
				<svg
					aria-hidden="true"
					width="11"
					height="11"
					viewBox="0 0 24 24"
					fill="none"
					stroke={`${baseColor}80`}
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<circle cx="12" cy="12" r="10" />
					<path d="M12 6v6l4 2" />
				</svg>
				<button
					type="button"
					onClick={() => setExpanded(!expanded)}
					className="text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors"
					style={{
						backgroundColor: `${accentColor}15`,
						color: accentColor,
					}}
				>
					{checkpoint.changedFileCount} file
					{checkpoint.changedFileCount !== 1 ? "s" : ""} changed
				</button>
				<span className="flex-1" />
				{!checkpoint.reverted ? (
					<button
						type="button"
						onClick={() => onRevert(checkpoint.id)}
						disabled={disabled}
						className="text-[9px] px-2 py-0.5 rounded font-medium transition-colors disabled:opacity-40"
						style={{
							backgroundColor: `${revertedColor}15`,
							color: revertedColor,
						}}
					>
						Undo
					</button>
				) : (
					<span
						className="text-[9px] italic"
						style={{ color: theme?.fgDim ?? "var(--color-inferay-text-3)" }}
					>
						reverted
					</span>
				)}
			</div>
			{expanded && (
				<div className="pb-1.5 px-2 ml-4 space-y-0.5">
					{checkpoint.changedFiles.map((f) => (
						<div
							key={f.path}
							className="flex items-center gap-1.5 text-[9px] font-mono"
						>
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
							<span
								style={{ color: theme?.fgDim ?? "var(--color-inferay-text-3)" }}
							>
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
	theme,
	onSendMessage,
	onMdFileClick,
}: {
	msg: ChatMessage;
	collapsed: boolean;
	onToggle: (id: string) => void;
	theme?: ChatTheme;
	onSendMessage?: (text: string) => void;
	onMdFileClick?: (path: string) => void;
}) {
	if (msg.role === "user") {
		if (msg.content.match(/^\/([a-zA-Z0-9_-]+)(\s|$)/)) return null;
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
			<div className="flex justify-end">
				<div className="max-w-[85%] rounded-lg rounded-br-sm px-2.5 py-1.5">
					{imagePaths.length > 0 && (
						<div className="flex flex-wrap gap-1.5 mb-1.5">
							{imagePaths.map((imgPath) => (
								<img
									key={imgPath}
									src={`/api/file?path=${encodeURIComponent(imgPath)}`}
									alt=""
									className="rounded max-h-24 max-w-32 object-cover"
									style={{
										border: `1px solid ${theme?.fgDim ?? "rgba(255,255,255,0.2)"}`,
									}}
								/>
							))}
						</div>
					)}
					{displayContent && (
						<p
							className="whitespace-pre-wrap break-words text-[12px]"
							style={theme ? { color: theme.fg } : undefined}
						>
							{renderTextPills(
								displayContent,
								theme ? { cursor: theme.cursor } : undefined
							)}
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
				<div className="flex justify-center py-1">
					<div
						className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg"
						style={{
							backgroundColor: "rgba(0, 122, 255, 0.08)",
							border: "1px solid rgba(0, 122, 255, 0.2)",
						}}
					>
						<div className="flex items-center gap-[3px]">
							<span
								className="h-[5px] w-[5px] rounded-full bg-blue-400 animate-bounce"
								style={{ animationDuration: "0.6s" }}
							/>
							<span
								className="h-[5px] w-[5px] rounded-full bg-blue-400 animate-bounce"
								style={{ animationDuration: "0.6s", animationDelay: "0.1s" }}
							/>
							<span
								className="h-[5px] w-[5px] rounded-full bg-blue-400 animate-bounce"
								style={{ animationDuration: "0.6s", animationDelay: "0.2s" }}
							/>
						</div>
						<span className="font-mono text-[11px] font-medium text-blue-400">
							/{commandName}
						</span>
					</div>
				</div>
			);
		}
		return (
			<p
				className="text-center text-[10px]"
				style={{ color: theme ? theme.fgDim : "var(--color-inferay-text-3)" }}
			>
				{msg.content}
			</p>
		);
	}

	if (msg.role === "btw") {
		return (
			<div
				className="rounded-lg border px-3 py-2"
				style={{
					backgroundColor: "rgba(0, 122, 255, 0.06)",
					borderColor: "rgba(0, 122, 255, 0.2)",
					borderStyle: "dashed",
				}}
			>
				<div className="flex items-center gap-1.5 mb-1.5">
					<span
						className="text-[9px] font-semibold uppercase tracking-wider"
						style={{ color: "rgba(0, 122, 255, 0.7)" }}
					>
						btw
					</span>
					{msg.btwQuestion && (
						<span
							className="text-[10px] font-mono"
							style={{
								color: theme ? theme.fgDim : "var(--color-inferay-text-3)",
							}}
						>
							- {msg.btwQuestion}
						</span>
					)}
				</div>
				<div
					className="text-[12px] leading-[1.6]"
					style={theme ? { color: theme.fgMuted } : undefined}
				>
					{msg.content ? (
						<Markdown
							text={msg.content}
							theme={theme}
							onMdFileClick={onMdFileClick}
						/>
					) : msg.isStreaming ? (
						<div className="flex items-center gap-[3px] py-1">
							<span
								className="h-[4px] w-[4px] rounded-full animate-bounce"
								style={{
									backgroundColor: "rgba(0, 122, 255, 0.5)",
									animationDuration: "0.6s",
								}}
							/>
							<span
								className="h-[4px] w-[4px] rounded-full animate-bounce"
								style={{
									backgroundColor: "rgba(0, 122, 255, 0.5)",
									animationDuration: "0.6s",
									animationDelay: "0.1s",
								}}
							/>
							<span
								className="h-[4px] w-[4px] rounded-full animate-bounce"
								style={{
									backgroundColor: "rgba(0, 122, 255, 0.5)",
									animationDuration: "0.6s",
									animationDelay: "0.2s",
								}}
							/>
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
					theme={theme}
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
							theme={theme}
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
					className="flex items-center gap-1 text-[10px]"
					style={theme ? { color: theme.fgDim } : undefined}
				>
					<svg
						aria-hidden="true"
						width="7"
						height="7"
						viewBox="0 0 8 8"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						className={`transition-transform ${collapsed ? "-rotate-90" : ""}`}
					>
						<path d="M2 2.5L4 5.5L6 2.5" />
					</svg>
					<span className="font-mono text-[9px]">{msg.toolName}</span>
				</button>
				{!collapsed && msg.content && (
					<pre
						className="mt-0.5 max-h-28 overflow-auto rounded px-2 py-1 font-mono text-[9px] leading-relaxed whitespace-pre-wrap break-all"
						style={
							theme
								? { backgroundColor: theme.surface, color: theme.fgDim }
								: undefined
						}
					>
						<ToolOutputHighlight content={msg.content} theme={theme} />
					</pre>
				)}
			</div>
		);
	}

	return (
		<div
			className="group/msg relative w-full min-w-0 break-words text-[12px] leading-[1.6]"
			style={theme ? { color: theme.fgMuted } : undefined}
		>
			<Markdown
				text={msg.content}
				theme={theme}
				onMdFileClick={onMdFileClick}
			/>
		</div>
	);
});

export function ChatMessageList({
	messages,
	expandedTools,
	toggleTool,
	bubbleTheme,
	checkpoints,
	revertCheckpoint,
	isLoading,
	handleSendMessage,
	fgDim,
	theme,
	onMdFileClick,
}: {
	messages: ChatMessage[];
	expandedTools: Set<string>;
	toggleTool: (id: string) => void;
	bubbleTheme?: ChatTheme;
	checkpoints: CheckpointInfo[];
	revertCheckpoint: (id: string) => void;
	isLoading: boolean;
	handleSendMessage?: (text: string) => void;
	fgDim: string;
	theme?: { bg: string; fg: string; cursor: string };
	onMdFileClick?: (path: string) => void;
}) {
	const renderItems = useMemo(() => buildRenderItems(messages), [messages]);
	return (
		<div className="min-w-0 px-3 py-2 space-y-2">
			{messages.length === 0 && (
				<p
					className="pt-8 text-center text-[10px]"
					style={theme ? { color: fgDim } : undefined}
				>
					Ready
				</p>
			)}
			{renderItems.map((item, idx) => {
				if (item.type === "edit-group") {
					return (
						<GroupedEditDiff
							key={`edit-group-${item.filePath}-${idx}`}
							filePath={item.filePath}
							edits={item.edits}
							theme={bubbleTheme}
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
							theme={bubbleTheme}
							onSendMessage={handleSendMessage}
							onMdFileClick={onMdFileClick}
						/>
						{msg.role === "assistant" &&
							!msg.isStreaming &&
							(() => {
								const cp = checkpoints.find((c) => c.afterMessageId === msg.id);
								if (!cp) return null;
								return (
									<CheckpointMarker
										checkpoint={cp}
										theme={bubbleTheme}
										onRevert={revertCheckpoint}
										disabled={isLoading}
									/>
								);
							})()}
					</React.Fragment>
				);
			})}
		</div>
	);
}
