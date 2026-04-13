import React, { useState, useRef } from "react";
import { Icons } from "./Icons";
import { ModelSelector } from "./shared";
import { InlineDiffBlock } from "./DiffViewer";
import {
	chatMessages,
	inlineDiffLines,
	inlineDiffVariants,
	chatThreads,
	models,
	type ChatMessage,
} from "./data";

// Main Chat Panel (used in Editor view)
export function ChatPanel({
	selectedModel,
	onSelectModel,
}: {
	selectedModel: string;
	onSelectModel: (id: string) => void;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [inputFocused, setInputFocused] = useState(false);

	return (
		<div className="flex h-full flex-col">
			{/* Header */}
			<div className="shrink-0 flex items-center gap-1.5 px-1.5 py-1 border-b border-inferay-border">
				<ModelSelector selectedModel={selectedModel} onSelect={onSelectModel} />
				<span className="flex-1" />
				<div className="flex items-center gap-1 text-inferay-text-3">
					<Icons.Folder />
					<span className="text-[8px] font-mono truncate max-w-[100px]">
						projects/my-app
					</span>
				</div>
			</div>

			{/* Messages */}
			<div ref={containerRef} className="flex-1 overflow-y-auto p-3 space-y-3">
				{chatMessages.map((msg, i) => (
					<div key={i}>
						{msg.role === "user" ? (
							<div className="flex justify-end">
								<p className="max-w-[85%] px-3 py-2 rounded-2xl rounded-br-sm bg-inferay-accent/20 text-[11px] text-inferay-text leading-relaxed">
									{msg.content}
								</p>
							</div>
						) : (
							<div className="space-y-2">
								<p className="text-[11px] text-inferay-text-2 leading-relaxed">
									{msg.content}
								</p>
								{msg.tool && (
									<div className="rounded-md border border-inferay-border overflow-hidden">
										<div className="flex items-center gap-1 px-1.5 py-1 bg-black border-b border-inferay-border">
											<span
												className={`${msg.inlineDiff ? "rotate-90" : ""} transition-transform text-inferay-text-3`}
											>
												<Icons.Chevron />
											</span>
											{msg.tool.name === "Bash" ? (
												<Icons.Bash />
											) : msg.tool.name === "Search" ? (
												<Icons.Search />
											) : (
												<Icons.File />
											)}
											<span className="flex-1 text-[8px] font-mono text-inferay-text-2 truncate">
												{msg.tool.file || msg.tool.command || msg.tool.query}
											</span>
											{msg.inlineDiff && (
												<span className="flex items-center gap-0.5 text-[8px]">
													<span className="text-green-400">+4</span>
													<span className="text-red-400">−1</span>
												</span>
											)}
										</div>
										{msg.inlineDiff && (
											<InlineDiffBlock
												lines={
													msg.diffVariant &&
													msg.diffVariant in inlineDiffVariants
														? inlineDiffVariants[
																msg.diffVariant as keyof typeof inlineDiffVariants
															]
														: inlineDiffLines
												}
												filePath={msg.tool.file || "file.tsx"}
											/>
										)}
									</div>
								)}
							</div>
						)}
					</div>
				))}
			</div>

			{/* Activity bar */}
			<div className="shrink-0 px-2 py-1 flex items-center gap-1.5 border-t border-inferay-border bg-inferay-bg">
				<div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-inferay-surface-2 border border-inferay-border">
					<span className="text-inferay-text-3">
						<Icons.Edit />
					</span>
					<span className="text-[8px] text-inferay-text-2">Editing...</span>
				</div>
				<span className="flex-1" />
				<span className="text-[8px] tabular-nums text-inferay-text-3">
					0:42
				</span>
				<button className="p-0.5 rounded-md border border-inferay-border bg-inferay-surface text-inferay-text-3 hover:bg-inferay-surface-2">
					<Icons.Pause />
				</button>
			</div>

			{/* Input */}
			<div className="shrink-0 border-t border-inferay-border p-1.5">
				<div
					className={`flex items-center gap-1.5 bg-inferay-surface rounded-lg border px-2 py-1.5 transition-colors ${inputFocused ? "border-inferay-accent/50" : "border-inferay-border"}`}
				>
					<button className="shrink-0 p-0.5 rounded text-inferay-text-3 hover:text-inferay-text hover:bg-inferay-surface-2 transition-colors">
						<Icons.Plus />
					</button>
					<input
						type="text"
						placeholder="Message Claude..."
						className="flex-1 bg-transparent text-[10px] text-inferay-text outline-none placeholder:text-inferay-text-3"
						onFocus={() => setInputFocused(true)}
						onBlur={() => setInputFocused(false)}
					/>
					<kbd className="px-1 py-0.5 rounded text-[7px] bg-inferay-bg border border-inferay-border text-inferay-text-3">
						↵
					</kbd>
				</div>
			</div>
		</div>
	);
}

// Reusable Vertical Chat Panel component (for grid view)
export function VerticalChatPanel({
	title,
	messages,
	status,
	statusFile,
	statusQuery,
	time,
	directory,
	branch,
	showModelSelector = false,
	selectedModel,
	onSelectModel,
	isActive = false,
	onSelect,
}: {
	title?: string;
	messages: ChatMessage[];
	status?: string;
	statusFile?: string;
	statusQuery?: string;
	time?: string;
	directory?: string;
	branch?: string;
	showModelSelector?: boolean;
	selectedModel?: string;
	onSelectModel?: (id: string) => void;
	isActive?: boolean;
	onSelect?: () => void;
}) {
	const [inputFocused, setInputFocused] = useState(false);

	// Get status display info
	const getStatusInfo = () => {
		switch (status) {
			case "editing":
				return {
					icon: <Icons.Edit />,
					label: "Editing...",
					color: "text-amber-400",
				};
			case "reading":
				return {
					icon: <Icons.Eye />,
					label: "Reading...",
					color: "text-blue-400",
				};
			case "searching":
				return {
					icon: <Icons.Search />,
					label: "Searching...",
					color: "text-purple-400",
				};
			case "running":
				return {
					icon: <Icons.Bash />,
					label: "Running...",
					color: "text-green-400",
				};
			default:
				return {
					icon: <Icons.Check />,
					label: "Done",
					color: "text-inferay-text-3",
				};
		}
	};
	const statusInfo = getStatusInfo();

	return (
		<div
			className={`flex-1 min-w-[260px] max-w-[380px] flex flex-col border-r border-inferay-border last:border-r-0 ${isActive ? "bg-inferay-bg" : "bg-inferay-bg/50"}`}
			onClick={onSelect}
		>
			{/* Header */}
			<div
				className={`shrink-0 flex items-center gap-1.5 px-1.5 py-1 border-b border-inferay-border transition-colors cursor-pointer ${
					isActive
						? "bg-inferay-bg"
						: "bg-inferay-bg/50 hover:bg-inferay-surface/50"
				}`}
			>
				{/* Model selector */}
				{showModelSelector && selectedModel && onSelectModel && (
					<ModelSelector
						selectedModel={selectedModel}
						onSelect={onSelectModel}
					/>
				)}
				<span className="flex-1" />
				{/* Directory info */}
				{directory && (
					<div className="flex items-center gap-1 text-inferay-text-3">
						<Icons.Folder />
						<span className="text-[8px] font-mono truncate max-w-[100px]">
							{directory.replace("~/", "")}
						</span>
					</div>
				)}
			</div>

			{/* Messages */}
			<div className="flex-1 overflow-y-auto p-3 space-y-3">
				{messages.map((msg, i) => (
					<div key={i}>
						{msg.role === "user" ? (
							<div className="flex justify-end">
								<p className="max-w-[90%] px-3 py-2 rounded-2xl rounded-br-sm bg-inferay-accent/20 text-[11px] text-inferay-text leading-relaxed">
									{msg.content}
								</p>
							</div>
						) : (
							<div className="space-y-2">
								<p className="text-[11px] text-inferay-text-2 leading-relaxed">
									{msg.content}
								</p>
								{msg.tool && (
									<div className="rounded-md border border-inferay-border overflow-hidden">
										<div className="flex items-center gap-1 px-1.5 py-1 bg-black border-b border-inferay-border">
											<span
												className={`${msg.inlineDiff ? "rotate-90" : ""} transition-transform text-inferay-text-3`}
											>
												<Icons.Chevron />
											</span>
											{msg.tool.name === "Bash" ? (
												<Icons.Bash />
											) : msg.tool.name === "Search" ? (
												<Icons.Search />
											) : (
												<Icons.File />
											)}
											<span className="flex-1 text-[8px] font-mono text-inferay-text-2 truncate">
												{msg.tool.file || msg.tool.command || msg.tool.query}
											</span>
											{msg.inlineDiff && (
												<span className="flex items-center gap-0.5 text-[8px]">
													<span className="text-green-400">+4</span>
													<span className="text-red-400">−1</span>
												</span>
											)}
										</div>
										{msg.inlineDiff && (
											<InlineDiffBlock
												lines={
													msg.diffVariant &&
													msg.diffVariant in inlineDiffVariants
														? inlineDiffVariants[
																msg.diffVariant as keyof typeof inlineDiffVariants
															]
														: inlineDiffLines
												}
												filePath={msg.tool.file || "file.tsx"}
											/>
										)}
									</div>
								)}
							</div>
						)}
					</div>
				))}
			</div>

			{/* Activity bar */}
			{status && status !== "complete" && (
				<div className="shrink-0 px-2 py-1 flex items-center gap-1.5 border-t border-inferay-border bg-inferay-bg">
					<div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-inferay-surface-2 border border-inferay-border">
						<span className={statusInfo.color}>{statusInfo.icon}</span>
						<span className="text-[8px] text-inferay-text-2">
							{statusInfo.label}
						</span>
					</div>
					{(statusFile || statusQuery) && (
						<span className="text-[8px] font-mono text-inferay-text-3 truncate">
							{statusFile || statusQuery}
						</span>
					)}
					<span className="flex-1" />
					{time && (
						<span className="text-[8px] tabular-nums text-inferay-text-3">
							{time}
						</span>
					)}
					<button className="p-0.5 rounded-md border border-inferay-border bg-inferay-surface text-inferay-text-3 hover:bg-inferay-surface-2">
						<Icons.Pause />
					</button>
				</div>
			)}

			{/* Input */}
			<div className="shrink-0 p-1.5 border-t border-inferay-border">
				<div
					className={`flex items-center gap-1.5 bg-inferay-surface rounded-lg border px-2 py-1.5 transition-colors ${inputFocused ? "border-inferay-accent/50" : "border-inferay-border"}`}
				>
					<input
						type="text"
						placeholder="Message..."
						className="flex-1 bg-transparent text-[10px] text-inferay-text outline-none placeholder:text-inferay-text-3"
						onFocus={() => setInputFocused(true)}
						onBlur={() => setInputFocused(false)}
					/>
					<kbd className="px-1 py-0.5 rounded text-[7px] bg-inferay-bg border border-inferay-border text-inferay-text-3">
						↵
					</kbd>
				</div>
			</div>
		</div>
	);
}

// New Chat Configuration Panel
function NewChatPanel({
	onCancel,
	onCreate,
}: {
	onCancel: () => void;
	onCreate: (config: { model: string; directory: string }) => void;
}) {
	const [selectedModel, setSelectedModel] = useState("claude-4");
	const [directory, setDirectory] = useState("~/projects/my-app");

	const directories = [
		"~/projects/my-app",
		"~/projects/website",
		"~/projects/api-server",
		"~/Desktop/experiments",
	];

	return (
		<div className="flex-1 min-w-[280px] max-w-[400px] flex flex-col border-r border-inferay-border bg-inferay-bg">
			{/* Header */}
			<div className="shrink-0 flex items-center gap-2 px-2 py-1 border-b border-inferay-border bg-inferay-bg">
				<Icons.Plus />
				<span className="flex-1 text-[9px] font-medium text-inferay-text">
					New Chat
				</span>
				<button
					onClick={onCancel}
					className="p-1 rounded-md text-inferay-text-3 hover:bg-inferay-surface hover:text-inferay-text transition-colors"
				>
					<Icons.Close />
				</button>
			</div>

			{/* Configuration Form */}
			<div className="flex-1 overflow-y-auto p-4 space-y-4">
				{/* Model Selection */}
				<div className="space-y-1.5">
					<label className="text-[10px] font-medium text-inferay-text-2">
						Model
					</label>
					<div className="space-y-1">
						{models.map((model) => (
							<button
								key={model.id}
								onClick={() => setSelectedModel(model.id)}
								className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors ${
									selectedModel === model.id
										? "border-inferay-accent/50 bg-inferay-surface-2"
										: "border-inferay-border bg-inferay-surface hover:bg-inferay-surface-2"
								}`}
							>
								<span
									className="w-2.5 h-2.5 rounded-full"
									style={{ backgroundColor: model.color }}
								/>
								<span
									className={`flex-1 text-left text-[11px] font-medium ${selectedModel === model.id ? "text-inferay-text" : "text-inferay-text-2"}`}
								>
									{model.name}
								</span>
								<span className="text-[9px] text-inferay-text-3">
									{model.provider}
								</span>
								{selectedModel === model.id && (
									<span className="text-inferay-accent">
										<Icons.Check />
									</span>
								)}
							</button>
						))}
					</div>
				</div>

				{/* Directory Selection */}
				<div className="space-y-1.5">
					<label className="text-[10px] font-medium text-inferay-text-2">
						Working Directory
					</label>
					<div className="space-y-1">
						{directories.map((dir) => (
							<button
								key={dir}
								onClick={() => setDirectory(dir)}
								className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
									directory === dir
										? "border-inferay-accent/50 bg-inferay-surface-2"
										: "border-inferay-border bg-inferay-surface hover:bg-inferay-surface-2"
								}`}
							>
								<Icons.Folder />
								<span
									className={`flex-1 text-left text-[10px] font-mono truncate ${directory === dir ? "text-inferay-text" : "text-inferay-text-2"}`}
								>
									{dir}
								</span>
								{directory === dir && (
									<span className="text-inferay-accent">
										<Icons.Check />
									</span>
								)}
							</button>
						))}
					</div>
					<button className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-inferay-border text-inferay-text-3 hover:border-inferay-accent/50 hover:text-inferay-text-2 transition-colors">
						<Icons.Plus />
						<span className="text-[10px]">Browse...</span>
					</button>
				</div>
			</div>

			{/* Footer Actions */}
			<div className="shrink-0 p-3 border-t border-inferay-border flex items-center gap-2">
				<button
					onClick={onCancel}
					className="flex-1 py-2 rounded-lg border border-inferay-border text-[10px] font-medium text-inferay-text-2 hover:bg-inferay-surface transition-colors"
				>
					Cancel
				</button>
				<button
					onClick={() => onCreate({ model: selectedModel, directory })}
					className="flex-1 py-2 rounded-lg bg-inferay-surface-2 border border-inferay-border text-[10px] font-medium text-inferay-text hover:bg-inferay-surface transition-colors"
				>
					Create Chat
				</button>
			</div>
		</div>
	);
}

// Chat Grid View - Multiple chats visible as columns
export function ChatGridView({
	selectedModel,
	onSelectModel,
}: {
	selectedModel: string;
	onSelectModel: (id: string) => void;
}) {
	const [activeChat, setActiveChat] = useState(0);
	const [showNewChat, setShowNewChat] = useState(false);
	const [chats, setChats] = useState(chatThreads);

	const handleCreateChat = (config: { model: string; directory: string }) => {
		const newChat = {
			id: chats.length + 1,
			title: "New Chat",
			lastMessage: "",
			time: "now",
			status: "active",
			directory: config.directory,
			branch: "main",
			messages: [],
		};
		setChats([...chats, newChat]);
		setShowNewChat(false);
		setActiveChat(chats.length); // Select the new chat
	};

	return (
		<div className="flex-1 flex bg-inferay-bg overflow-hidden">
			{/* Existing chat panels */}
			{chats.map((thread: any, idx: number) => (
				<VerticalChatPanel
					key={thread.id}
					title={thread.title}
					messages={thread.messages}
					status={thread.status}
					statusFile={thread.statusFile}
					statusQuery={thread.statusQuery}
					time={thread.time}
					directory={thread.directory}
					branch={thread.branch}
					showModelSelector={true}
					selectedModel={selectedModel}
					onSelectModel={onSelectModel}
					isActive={activeChat === idx && !showNewChat}
					onSelect={() => {
						setActiveChat(idx);
						setShowNewChat(false);
					}}
				/>
			))}
		</div>
	);
}
