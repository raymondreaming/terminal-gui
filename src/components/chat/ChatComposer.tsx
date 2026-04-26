import type React from "react";
import { useMemo, useRef } from "react";
import {
	IconCheck,
	IconPencil,
	IconPlus,
	IconTrash,
	IconX,
} from "../ui/Icons.tsx";
import { Markdown } from "./ChatRichContent.tsx";
import { renderInputHighlights } from "./chat-token-decorators.tsx";

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
	statusBar,
}: {
	showInput: boolean;
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
	statusBar?: React.ReactNode;
}) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const inputHighlights = useMemo(() => renderInputHighlights(input), [input]);

	return (
		<>
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

			{attachedImages.length > 0 && (
				<div
					role="group"
					className="shrink-0 flex items-center gap-2 overflow-x-auto overflow-y-hidden px-3 py-1.5"
					aria-label="Attached images"
				>
					{attachedImages.map((img) => (
						<div
							key={img.path}
							className="relative group h-14 w-14 shrink-0 overflow-hidden rounded-lg"
							style={{
								border: "1px solid var(--color-inferay-gray-border)",
							}}
						>
							<img
								src={img.previewUrl}
								alt={img.name}
								title={img.name}
								className="h-full w-full object-cover"
							/>
							<button
								type="button"
								onClick={() => removeAttachedImage(img.path)}
								className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
								title="Remove image"
							>
								<IconX size={10} />
							</button>
						</div>
					))}
				</div>
			)}

			{queuedMessages.length > 0 && (
				<div
					className="shrink-0 overflow-y-auto"
					style={{ maxHeight: "140px" }}
				>
					{queuedMessages.map((qm, idx) => (
						<div
							key={qm.id}
							className="group flex items-start gap-2 px-3 py-1 transition-colors"
						>
							<span
								className="shrink-0 mt-0.5 text-[9px] font-mono tabular-nums"
								style={{
									color: "var(--color-inferay-muted-gray)",
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
											color: "var(--color-inferay-white)",
											backgroundColor: "rgba(255,255,255,0.06)",
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
											color: "var(--color-inferay-accent)",
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
											color: "var(--color-inferay-muted-gray)",
										}}
										title="Cancel"
									>
										<IconX size={11} />
									</button>
								</div>
							) : (
								<>
									{qm.images && qm.images.length > 0 && (
										<img
											src={`/api/file?path=${encodeURIComponent(qm.images[0]!)}`}
											alt=""
											className="shrink-0 h-6 w-6 rounded object-cover"
										/>
									)}
									<span
										className="flex-1 text-[11px] truncate"
										style={{
											color: "var(--color-inferay-white)",
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
												color: "var(--color-inferay-muted-gray)",
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

			{statusBar}

			{showInput && (
				<div className="shrink-0 px-3 pb-2 pt-1">
					<div
						className="relative flex flex-col rounded-xl overflow-visible"
						ref={inputContainerRef}
						style={{
							border: "1px solid var(--color-inferay-gray-border)",
							backgroundColor: "var(--color-inferay-dark-gray)",
						}}
					>
						{fileMenu.show && fileResults.length > 0 && (
							<div
								className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border shadow-lg overflow-y-auto z-[9999]"
								style={{
									maxHeight: 300,
									backgroundColor: "var(--color-inferay-dark-gray)",
									borderColor: "var(--color-inferay-gray-border)",
								}}
							>
								<div
									className="px-3 py-1.5 text-[9px] font-semibold tracking-wide"
									style={{
										color: "var(--color-inferay-muted-gray)",
										borderBottom: "1px solid var(--color-inferay-gray-border)",
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
													? "rgba(0,122,255,0.15)"
													: "transparent",
										}}
									>
										<span
											className="shrink-0 text-[11px]"
											style={{
												color: "var(--color-inferay-muted-gray)",
											}}
										>
											{file.isDir ? "\u{1F4C1}" : "\u{1F4C4}"}
										</span>
										<span
											className="truncate font-mono text-[11px] font-medium"
											style={{
												color: "var(--color-inferay-accent)",
											}}
										>
											{file.name}
										</span>
										<span
											className="flex-1 truncate text-right text-[9px]"
											style={{
												color: "var(--color-inferay-muted-gray)",
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
									backgroundColor: "var(--color-inferay-dark-gray)",
									borderColor: "var(--color-inferay-gray-border)",
								}}
							>
								<div
									className="px-3 py-2 text-[10px] font-medium tracking-wide uppercase"
									style={{ color: "var(--color-inferay-muted-gray)" }}
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
														? "var(--color-inferay-gray)"
														: "transparent",
												}}
											>
												<span
													className="font-mono text-[12px] font-medium"
													style={{
														color: isSelected
															? "var(--color-inferay-accent)"
															: "var(--color-inferay-white)",
													}}
												>
													/{cmd.name}
												</span>
												<span
													className="text-[11px]"
													style={{ color: "var(--color-inferay-muted-gray)" }}
												>
													{cmd.description}
												</span>
											</button>
										);
									})}
								</div>
							</div>
						)}

						<div className="flex items-end gap-2 px-3 py-1.5">
							<button
								type="button"
								onClick={() => fileInputRef.current?.click()}
								className="shrink-0 flex items-center justify-center w-6 h-6 rounded-md transition-colors"
								style={{
									color: "var(--color-inferay-muted-gray)",
								}}
								title="Attach image"
							>
								<IconPlus size={16} />
							</button>

							<div
								className="relative min-w-0 flex-1 overflow-hidden"
								style={{ maxHeight: "120px" }}
							>
								<div
									ref={highlightOverlayRef}
									className="absolute top-0 left-0 right-0 pr-8 text-[13px] pointer-events-none whitespace-pre-wrap"
									style={{
										lineHeight: "20px",
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
									className="relative block w-full resize-none pr-8 text-[13px] outline-none ring-0 border-none shadow-none focus:outline-none focus:ring-0 focus:border-none focus:shadow-none bg-transparent overflow-y-auto scrollbar-none"
									style={{
										minHeight: "20px",
										color: "transparent",
										caretColor: "var(--color-inferay-white)",
										WebkitTextFillColor: "transparent",
										lineHeight: "20px",
										wordBreak: "break-word",
										overflowWrap: "break-word",
									}}
								/>
								{isLoading && (
									<div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
										<span
											className="h-1 w-1 rounded-full animate-pulse"
											style={{
												backgroundColor: "var(--color-inferay-accent)",
											}}
										/>
										<span
											className="h-1 w-1 rounded-full animate-pulse"
											style={{
												backgroundColor: "var(--color-inferay-accent)",
												animationDelay: "150ms",
											}}
										/>
										<span
											className="h-1 w-1 rounded-full animate-pulse"
											style={{
												backgroundColor: "var(--color-inferay-accent)",
												animationDelay: "300ms",
											}}
										/>
									</div>
								)}
							</div>
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
							backgroundColor: "var(--color-inferay-black)",
							borderColor: "var(--color-inferay-gray-border)",
						}}
						onClick={(e) => e.stopPropagation()}
					>
						<div
							className="flex items-center justify-between px-3 py-2 border-b"
							style={{
								borderColor: "var(--color-inferay-gray-border)",
							}}
						>
							<span
								className="text-[11px] font-medium truncate"
								style={{
									color: "var(--color-inferay-white)",
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
										color: "var(--color-inferay-muted-gray)",
									}}
								/>
							</button>
						</div>
						<div
							className="flex-1 overflow-y-auto p-4 text-[12px]"
							style={{
								color: "var(--color-inferay-white)",
							}}
						>
							{mdPreview.loading && (
								<div className="flex items-center justify-center py-8">
									<span
										className="text-[10px]"
										style={{
											color: "var(--color-inferay-muted-gray)",
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
