import React, { useState } from "react";
import { Icons } from "./Icons";
import { chatThreads } from "./data";

// Timeline View - Per-chat session history
export function TimelineView() {
	const [selectedChatId, setSelectedChatId] = useState(1);
	const selectedChat =
		chatThreads.find((c) => c.id === selectedChatId) || chatThreads[0];

	// Build timeline from chat messages
	const buildTimeline = () => {
		const items: Array<{
			type: "user" | "assistant" | "tool";
			content: string;
			tool?: { name: string; file?: string; command?: string };
			hasChanges?: boolean;
		}> = [];

		for (const msg of selectedChat.messages) {
			if (msg.role === "user") {
				items.push({ type: "user", content: msg.content });
			} else if (msg.tool) {
				items.push({
					type: "tool",
					content: msg.content,
					tool: msg.tool,
					hasChanges: msg.tool.name === "Edit",
				});
			} else {
				items.push({ type: "assistant", content: msg.content });
			}
		}

		return items;
	};

	const timeline = buildTimeline();

	return (
		<div className="flex-1 flex overflow-hidden bg-black">
			{/* Chat list sidebar */}
			<div className="w-48 shrink-0 border-r border-surgent-border bg-surgent-bg p-1.5 overflow-auto">
				<div className="text-[8px] font-medium text-surgent-text-3 px-1.5 mb-1">
					Sessions
				</div>
				{chatThreads.map((chat) => (
					<button
						key={chat.id}
						onClick={() => setSelectedChatId(chat.id)}
						className={`w-full text-left px-2 py-1.5 rounded-lg border transition-colors mb-1 ${
							selectedChatId === chat.id
								? "border-surgent-border bg-surgent-surface-2"
								: "border-surgent-border/50 hover:bg-surgent-surface/50 hover:border-surgent-border"
						}`}
					>
						<div className="text-[9px] text-surgent-text truncate">
							{chat.title}
						</div>
						<div className="text-[8px] text-surgent-text-3 truncate font-mono">
							{chat.directory}
						</div>
						<div className="flex items-center gap-1 mt-0.5">
							<Icons.Branch />
							<span className="text-[7px] text-surgent-text-3">
								{chat.branch}
							</span>
							<span className="ml-auto text-[7px] text-surgent-text-3">
								{chat.time}
							</span>
						</div>
					</button>
				))}
			</div>

			{/* Timeline content */}
			<div className="flex-1 overflow-auto p-4">
				<div className="max-w-2xl mx-auto">
					{/* Header */}
					<div className="flex items-center gap-2 mb-4">
						<div className="p-1.5 rounded-md bg-surgent-accent/10">
							<Icons.Clock />
						</div>
						<div className="flex-1">
							<h3 className="text-[11px] font-medium text-surgent-text">
								{selectedChat.title}
							</h3>
							<div className="flex items-center gap-2 text-[9px] text-surgent-text-3">
								<span className="font-mono">{selectedChat.directory}</span>
								<span>•</span>
								<span className="flex items-center gap-0.5">
									<Icons.Branch />
									{selectedChat.branch}
								</span>
								<span>•</span>
								<span>{timeline.length} actions</span>
							</div>
						</div>
						<div
							className={`px-1.5 py-0.5 rounded-md text-[8px] ${
								selectedChat.status === "complete"
									? "bg-surgent-surface-2 text-surgent-text-2"
									: selectedChat.status === "running"
										? "bg-surgent-accent/10 text-surgent-accent"
										: "bg-surgent-surface text-surgent-text-2"
							}`}
						>
							{selectedChat.status}
						</div>
					</div>

					{/* Timeline */}
					<div className="relative">
						{/* Timeline line */}
						<div className="absolute left-[9px] top-2 bottom-2 w-px bg-surgent-border" />

						{timeline.map((item, idx) => (
							<div key={idx} className="relative pl-6 pb-2">
								{/* Timeline dot */}
								<div
									className={`absolute left-0 top-1.5 w-5 h-5 rounded-full flex items-center justify-center ${
										item.type === "user"
											? "bg-surgent-surface-2 border-2 border-surgent-border"
											: item.type === "tool"
												? "bg-surgent-accent/20 border-2 border-surgent-accent"
												: "bg-surgent-surface border-2 border-surgent-border"
									}`}
								>
									{item.type === "user" ? (
										<Icons.User />
									) : item.type === "tool" ? (
										item.tool?.name === "Edit" ? (
											<Icons.Edit />
										) : item.tool?.name === "Read" ? (
											<Icons.Eye />
										) : (
											<Icons.Bash />
										)
									) : (
										<Icons.Sparkle />
									)}
								</div>

								{/* Content */}
								<div
									className={`rounded-lg border p-2 ${
										item.type === "user"
											? "border-surgent-border/50 bg-surgent-surface/30"
											: item.hasChanges
												? "border-surgent-border bg-surgent-surface-2"
												: "border-surgent-border/50"
									}`}
								>
									{item.tool && (
										<div className="flex items-center gap-1 mb-1">
											<span className="text-[8px] px-1 py-0.5 rounded bg-surgent-surface-2 text-surgent-text-2">
												{item.tool.name}
											</span>
											{item.tool.file && (
												<span className="text-[8px] font-mono text-surgent-accent">
													{item.tool.file}
												</span>
											)}
											{item.tool.command && (
												<span className="text-[8px] font-mono text-surgent-text-2">
													{item.tool.command}
												</span>
											)}
										</div>
									)}
									<p className="text-[9px] text-surgent-text leading-relaxed">
										{item.content}
									</p>
									{item.hasChanges && (
										<div className="flex gap-1.5 mt-2 pt-1.5 border-t border-surgent-border/50">
											<button className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8px] bg-surgent-surface text-surgent-text-2 hover:text-surgent-text border border-surgent-border">
												<Icons.Eye />
												View diff
											</button>
											<button className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8px] bg-surgent-surface text-surgent-text-2 hover:text-surgent-text border border-surgent-border">
												<Icons.Undo />
												Revert
											</button>
										</div>
									)}
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
