import type React from "react";
import { useMemo, useRef } from "react";
import { IconCheck, IconPencil, IconTrash, IconX } from "../ui/Icons.tsx";
import { Markdown } from "./ChatRichContent.tsx";
import { renderInputHighlights } from "./chat-token-decorators.tsx";

type ChatTheme = {
	bg: string;
	fg: string;
	cursor: string;
	surface: string;
	border: string;
	fgMuted: string;
	fgDim: string;
};

type SlashCommand = {
	id?: string;
	name: string;
	description: string;
	action: "local" | "send";
	promptTemplate?: string;
	category?: string;
	isLocalCommand?: boolean;
	isFromLibrary?: boolean;
};

type QueuedMessage = {
	id: string;
	text: string;
	displayText: string;
	images?: string[];
};

type AttachedImageInfo = {
	name: string;
	path: string;
	previewUrl: string;
};

export function ChatComposer({
	showInput,
	theme,
	bgColor,
	fgColor,
	cursorColor,
	fgDim,
	borderColor,
	surfaceColor,
	bubbleTheme,
	input,
	setInput,
	isLoading,
	attachedImages,
	removeAttachedImage,
	attachImage,
	queuedMessages,
	editingQueueId,
	setEditingQueueId,
	editingQueueText,
	setEditingQueueText,
	queueRef,
	setQueuedMessages,
	fileMenu,
	setFileMenu,
	fileResults,
	selectFile,
	slashMenu,
	setSlashMenu,
	showCommands,
	filteredCommands,
	selectCommand,
	handleInputForFileMenu,
	handleInputForSlashMenu,
	handleKeyDown,
	handlePaste,
	textareaRef,
	highlightOverlayRef,
	inputContainerRef,
	mdPreview,
	setMdPreview,
	onMdFileClick,
}: {
	showInput: boolean;
	theme?: { bg: string; fg: string; cursor: string };
	bgColor: string;
	fgColor: string;
	cursorColor: string;
	fgDim: string;
	borderColor?: string;
	surfaceColor?: string;
	bubbleTheme?: ChatTheme;
	input: string;
	setInput: (value: string) => void;
	isLoading: boolean;
	attachedImages: AttachedImageInfo[];
	removeAttachedImage: (path: string) => void;
	attachImage: (file: File) => Promise<void>;
	queuedMessages: QueuedMessage[];
	editingQueueId: string | null;
	setEditingQueueId: (id: string | null) => void;
	editingQueueText: string;
	setEditingQueueText: (text: string) => void;
	queueRef: React.RefObject<QueuedMessage[]>;
	setQueuedMessages: (messages: QueuedMessage[]) => void;
	fileMenu: { show: boolean; selectedIdx: number; query: string };
	setFileMenu: React.Dispatch<
		React.SetStateAction<{
			show: boolean;
			selectedIdx: number;
			query: string;
			atIndex: number;
			position: {
				top: number;
				left: number;
				width: number;
				maxHeight: number;
			} | null;
		}>
	>;
	fileResults: { name: string; path: string; isDir: boolean }[];
	selectFile: (idx: number) => void;
	slashMenu: { selectedIdx: number };
	setSlashMenu: React.Dispatch<
		React.SetStateAction<{
			show: boolean;
			selectedIdx: number;
			query: string;
			slashIndex: number;
		}>
	>;
	showCommands: boolean;
	filteredCommands: SlashCommand[];
	selectCommand: (idx: number) => void;
	handleInputForFileMenu: (value: string, cursorPos: number) => void;
	handleInputForSlashMenu: (value: string, cursorPos: number) => void;
	handleKeyDown: (e: React.KeyboardEvent) => void;
	handlePaste: (e: React.ClipboardEvent) => void;
	textareaRef: React.RefObject<HTMLTextAreaElement | null>;
	highlightOverlayRef: React.RefObject<HTMLDivElement | null>;
	inputContainerRef: React.RefObject<HTMLDivElement | null>;
	mdPreview: {
		show: boolean;
		path: string;
		content: string | null;
		loading: boolean;
		error: string | null;
	};
	setMdPreview: React.Dispatch<
		React.SetStateAction<{
			show: boolean;
			path: string;
			content: string | null;
			loading: boolean;
			error: string | null;
		}>
	>;
	onMdFileClick: (path: string) => void;
}) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const inputHighlightTheme = useMemo(
		() => (theme ? { accent: cursorColor, text: fgColor } : undefined),
		[theme, cursorColor, fgColor]
	);
	const inputHighlights = useMemo(
		() => renderInputHighlights(input, inputHighlightTheme),
		[input, inputHighlightTheme]
	);

	return (
		<>
			{queuedMessages.length > 0 && (
				<div
					className="shrink-0 overflow-y-auto"
					style={{
						maxHeight: "140px",
						borderTop: `1px solid ${theme ? borderColor : "var(--color-inferay-border)"}`,
						backgroundColor: theme ? `${bgColor}cc` : "rgba(0,0,0,0.4)",
					}}
				>
					<div
						className="px-3 py-1 text-[9px] font-semibold tracking-wide uppercase"
						style={{
							color: theme ? fgDim : "var(--color-inferay-text-3)",
							borderBottom: `1px solid ${theme ? `${borderColor}60` : "rgba(255,255,255,0.06)"}`,
						}}
					>
						Queued messages
					</div>
					{queuedMessages.map((qm, idx) => (
						<div
							key={qm.id}
							className="group flex items-start gap-2 px-3 py-1.5 transition-colors"
							style={{
								borderBottom:
									idx < queuedMessages.length - 1
										? `1px solid ${theme ? `${borderColor}40` : "rgba(255,255,255,0.04)"}`
										: undefined,
							}}
						>
							<span
								className="shrink-0 mt-0.5 text-[9px] font-mono tabular-nums"
								style={{
									color: theme ? fgDim : "var(--color-inferay-text-3)",
								}}
							>
								{idx + 1}
							</span>
							{editingQueueId === qm.id ? (
								<div className="flex-1 flex items-center gap-1">
									<input
										type="text"
										ref={(el) => el?.focus()}
										value={editingQueueText}
										onChange={(e) => setEditingQueueText(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												const trimmed = editingQueueText.trim();
												if (trimmed) {
													const item = queueRef.current?.find(
														(q) => q.id === qm.id
													);
													if (item) {
														item.text = trimmed;
														item.displayText = trimmed;
													}
													setQueuedMessages([...(queueRef.current ?? [])]);
												}
												setEditingQueueId(null);
											} else if (e.key === "Escape") {
												setEditingQueueId(null);
											}
										}}
										className="flex-1 bg-transparent text-[11px] outline-none border-none px-1 py-0.5 rounded"
										style={{
											color: theme ? fgColor : "var(--color-inferay-text)",
											backgroundColor: theme
												? surfaceColor
												: "rgba(255,255,255,0.06)",
										}}
									/>
									<button
										type="button"
										onClick={() => {
											const trimmed = editingQueueText.trim();
											if (trimmed) {
												const item = queueRef.current?.find(
													(q) => q.id === qm.id
												);
												if (item) {
													item.text = trimmed;
													item.displayText = trimmed;
												}
												setQueuedMessages([...(queueRef.current ?? [])]);
											}
											setEditingQueueId(null);
										}}
										className="shrink-0 p-0.5 rounded transition-colors"
										style={{
											color: theme
												? cursorColor
												: "var(--color-inferay-accent)",
										}}
										title="Save"
									>
										<IconCheck size={11} />
									</button>
									<button
										type="button"
										onClick={() => setEditingQueueId(null)}
										className="shrink-0 p-0.5 rounded transition-colors"
										style={{
											color: theme ? fgDim : "var(--color-inferay-text-3)",
										}}
										title="Cancel"
									>
										<IconX size={11} />
									</button>
								</div>
							) : (
								<>
									<span
										className="flex-1 text-[11px] truncate"
										style={{
											color: theme ? fgColor : "var(--color-inferay-text)",
										}}
									>
										{qm.displayText}
									</span>
									<div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
										<button
											type="button"
											onClick={() => {
												setEditingQueueId(qm.id);
												setEditingQueueText(qm.text);
											}}
											className="p-0.5 rounded transition-colors hover:bg-white/10"
											style={{
												color: theme ? fgDim : "var(--color-inferay-text-3)",
											}}
											title="Edit"
										>
											<IconPencil size={11} />
										</button>
										<button
											type="button"
											onClick={() => {
												const next = (queueRef.current ?? []).filter(
													(q) => q.id !== qm.id
												);
												if (queueRef.current) queueRef.current = next;
												setQueuedMessages([...next]);
												if (editingQueueId === qm.id) setEditingQueueId(null);
											}}
											className="p-0.5 rounded transition-colors hover:bg-red-500/20"
											style={{ color: "rgb(248,113,113)" }}
											title="Remove from queue"
										>
											<IconTrash size={11} />
										</button>
									</div>
								</>
							)}
						</div>
					))}
				</div>
			)}

			{showInput && (
				<div
					className="shrink-0 px-3 py-2"
					style={{
						borderTop: `1px solid ${theme ? borderColor : "var(--color-inferay-border)"}`,
					}}
				>
					{attachedImages.length > 0 && (
						<div className="flex items-center gap-2 pb-2">
							{attachedImages.map((img) => (
								<div key={img.path} className="relative group">
									<img
										src={img.previewUrl}
										alt={img.name}
										className="h-12 w-12 rounded-md object-cover"
										style={{
											border: `1px solid ${theme ? borderColor : "var(--color-inferay-border)"}`,
										}}
									/>
									<button
										type="button"
										onClick={() => removeAttachedImage(img.path)}
										className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"
									>
										x
									</button>
								</div>
							))}
						</div>
					)}
					<input
						type="file"
						ref={fileInputRef}
						accept="image/*"
						multiple
						className="hidden"
						onChange={async (e) => {
							for (const file of Array.from(e.target.files || [])) {
								if (file.type.startsWith("image/")) await attachImage(file);
							}
							e.target.value = "";
						}}
					/>
					<div
						className="relative flex items-end gap-1.5"
						ref={inputContainerRef}
					>
						<button
							type="button"
							onClick={() => fileInputRef.current?.click()}
							className="mb-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors"
							style={{
								color: theme ? fgDim : "var(--color-inferay-text-3)",
								backgroundColor: "transparent",
							}}
							title="Attach image"
						>
							<svg
								aria-hidden="true"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<line x1="12" y1="5" x2="12" y2="19" />
								<line x1="5" y1="12" x2="19" y2="12" />
							</svg>
						</button>
						<div className="relative flex-1">
							{fileMenu.show && fileResults.length > 0 && (
								<div
									className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border shadow-lg overflow-y-auto z-[9999]"
									style={{
										maxHeight: 300,
										backgroundColor: theme
											? surfaceColor
											: "var(--color-inferay-surface)",
										borderColor: theme
											? borderColor
											: "var(--color-inferay-border)",
									}}
								>
									<div
										className="px-3 py-1.5 text-[9px] font-semibold tracking-wide"
										style={{
											color: theme ? fgDim : "var(--color-inferay-text-3)",
											borderBottom: `1px solid ${theme ? borderColor : "var(--color-inferay-border)"}`,
										}}
									>
										FILES
										{fileMenu.query ? ` matching "${fileMenu.query}"` : ""}
									</div>
									{fileResults.map((file, idx) => (
										<button
											type="button"
											key={file.path}
											onClick={() => selectFile(idx)}
											onMouseEnter={() =>
												setFileMenu((prev) => ({ ...prev, selectedIdx: idx }))
											}
											className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors"
											style={{
												backgroundColor:
													idx === fileMenu.selectedIdx
														? theme
															? `${cursorColor}20`
															: "rgba(0,122,255,0.15)"
														: "transparent",
											}}
										>
											<span
												className="shrink-0 text-[11px]"
												style={{
													color: theme ? fgDim : "var(--color-inferay-text-3)",
												}}
											>
												{file.isDir ? "\u{1F4C1}" : "\u{1F4C4}"}
											</span>
											<span
												className="truncate font-mono text-[11px] font-medium"
												style={{
													color: theme
														? cursorColor
														: "var(--color-inferay-accent)",
												}}
											>
												{file.name}
											</span>
											<span
												className="flex-1 truncate text-right text-[9px]"
												style={{
													color: theme ? fgDim : "var(--color-inferay-text-3)",
												}}
											>
												{file.path}
											</span>
										</button>
									))}
								</div>
							)}
							{showCommands && filteredCommands.length > 0 && (
								<div
									className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border shadow-2xl overflow-hidden z-[9999]"
									style={{
										maxHeight: 320,
										backgroundColor: "#1a1a1a",
										borderColor: "#333",
									}}
								>
									<div
										className="px-3 py-2 text-[10px] font-medium tracking-wide uppercase"
										style={{ color: "#888" }}
									>
										Skills
									</div>
									<div className="overflow-y-auto" style={{ maxHeight: 280 }}>
										{filteredCommands.map((cmd, idx) => {
											const isSelected = idx === slashMenu.selectedIdx;
											return (
												<button
													type="button"
													key={cmd.id || cmd.name}
													onClick={() => selectCommand(idx)}
													onMouseEnter={() =>
														setSlashMenu((prev) => ({
															...prev,
															selectedIdx: idx,
														}))
													}
													className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors"
													style={{
														backgroundColor: isSelected
															? "#2a2a2a"
															: "transparent",
													}}
												>
													<span
														className="font-mono text-[12px] font-medium"
														style={{
															color: isSelected ? "#f5a623" : "#e5e5e5",
														}}
													>
														/{cmd.name}
													</span>
													<span
														className="text-[11px]"
														style={{ color: "#888" }}
													>
														{cmd.description}
													</span>
												</button>
											);
										})}
									</div>
								</div>
							)}
							<div
								className="relative flex-1 rounded-lg overflow-hidden"
								style={{
									backgroundColor: theme
										? surfaceColor
										: "var(--color-inferay-surface)",
									maxHeight: "120px",
								}}
							>
								<div
									ref={highlightOverlayRef}
									className="absolute top-0 left-0 right-0 px-3 py-2 pr-10 text-[12px] pointer-events-none whitespace-pre-wrap"
									style={{
										lineHeight: "18px",
										wordBreak: "break-word",
										overflowWrap: "break-word",
									}}
									aria-hidden="true"
								>
									{inputHighlights}
								</div>
								<textarea
									ref={textareaRef}
									value={input}
									onChange={(e) => {
										const val = e.target.value;
										setInput(val);
										const cursor = e.target.selectionStart ?? val.length;
										handleInputForFileMenu(val, cursor);
										handleInputForSlashMenu(val, cursor);
										if (highlightOverlayRef.current) {
											highlightOverlayRef.current.style.transform = `translateY(-${e.target.scrollTop}px)`;
										}
									}}
									onScroll={(e) => {
										if (highlightOverlayRef.current) {
											highlightOverlayRef.current.style.transform = `translateY(-${e.currentTarget.scrollTop}px)`;
										}
									}}
									onKeyDown={handleKeyDown}
									onPaste={handlePaste}
									placeholder={
										isLoading
											? "Type to queue next message..."
											: "Message... (/ commands, @ files)"
									}
									rows={1}
									aria-label="Message input"
									spellCheck
									autoCorrect="on"
									autoCapitalize="sentences"
									className="relative block w-full resize-none rounded-lg px-3 py-2 pr-10 text-[12px] outline-none ring-0 border-none shadow-none focus:outline-none focus:ring-0 focus:border-none focus:shadow-none bg-transparent overflow-y-auto scrollbar-none"
									style={{
										minHeight: "36px",
										color: "transparent",
										caretColor: theme
											? cursorColor
											: "var(--color-inferay-text)",
										WebkitTextFillColor: "transparent",
										lineHeight: "18px",
										wordBreak: "break-word",
										overflowWrap: "break-word",
									}}
								/>
							</div>
							{isLoading && (
								<div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
									<span
										className="h-1 w-1 rounded-full animate-pulse"
										style={
											theme
												? { backgroundColor: `${cursorColor}b3` }
												: undefined
										}
									/>
									<span
										className="h-1 w-1 rounded-full animate-pulse"
										style={
											theme
												? {
														backgroundColor: `${cursorColor}b3`,
														animationDelay: "150ms",
													}
												: { animationDelay: "150ms" }
										}
									/>
									<span
										className="h-1 w-1 rounded-full animate-pulse"
										style={
											theme
												? {
														backgroundColor: `${cursorColor}b3`,
														animationDelay: "300ms",
													}
												: { animationDelay: "300ms" }
										}
									/>
								</div>
							)}
						</div>
					</div>
				</div>
			)}

			{mdPreview.show && (
				<div
					className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
					onClick={() =>
						setMdPreview({
							show: false,
							path: "",
							content: null,
							loading: false,
							error: null,
						})
					}
				>
					<div
						className="relative w-[90%] max-w-2xl max-h-[80%] rounded-lg border overflow-hidden flex flex-col"
						style={{
							backgroundColor: theme ? bgColor : "var(--color-inferay-bg)",
							borderColor: theme ? borderColor : "var(--color-inferay-border)",
						}}
						onClick={(e) => e.stopPropagation()}
					>
						<div
							className="flex items-center justify-between px-3 py-2 border-b"
							style={{
								borderColor: theme
									? borderColor
									: "var(--color-inferay-border)",
							}}
						>
							<span
								className="text-[11px] font-medium truncate"
								style={{
									color: theme ? fgColor : "var(--color-inferay-text)",
								}}
							>
								{mdPreview.path}
							</span>
							<button
								type="button"
								onClick={() =>
									setMdPreview({
										show: false,
										path: "",
										content: null,
										loading: false,
										error: null,
									})
								}
								className="p-1 rounded hover:bg-white/10 transition-colors"
							>
								<IconX
									className="w-3.5 h-3.5"
									style={{
										color: theme ? fgDim : "var(--color-inferay-text-3)",
									}}
								/>
							</button>
						</div>
						<div
							className="flex-1 overflow-y-auto p-4 text-[12px]"
							style={{
								color: theme ? fgColor : "var(--color-inferay-text)",
							}}
						>
							{mdPreview.loading && (
								<div className="flex items-center justify-center py-8">
									<span
										className="text-[10px]"
										style={{
											color: theme ? fgDim : "var(--color-inferay-text-3)",
										}}
									>
										Loading...
									</span>
								</div>
							)}
							{mdPreview.error && (
								<div className="flex items-center justify-center py-8">
									<span className="text-[10px] text-inferay-error">
										{mdPreview.error}
									</span>
								</div>
							)}
							{mdPreview.content && (
								<Markdown
									text={mdPreview.content}
									theme={bubbleTheme}
									onMdFileClick={onMdFileClick}
								/>
							)}
						</div>
					</div>
				</div>
			)}
		</>
	);
}
