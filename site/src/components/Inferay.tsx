import React, { useState } from "react";

// Import all components from the inferay module
import { Icons } from "./inferay/Icons";
import {
	ClaudeAvatar,
	ModelSelector,
	CommandBar,
	ThinkingIndicator,
	Minimap,
} from "./inferay/shared";
import { ShikiDiffViewer } from "./inferay/DiffViewer";
import { ChatPanel, ChatGridView } from "./inferay/ChatPanel";
import { UnifiedSidebar } from "./inferay/Sidebar";
import { GraphView } from "./inferay/GraphView";
import { TimelineView } from "./inferay/TimelineView";

// ============ MAIN COMPONENT ============

export function Inferay() {
	const [view, setView] = useState<"code" | "chat" | "graph" | "timeline">(
		"code"
	);
	const [showCommandBar, setShowCommandBar] = useState(false);
	const [showSidebar, setShowSidebar] = useState(true);
	const [showMinimap, setShowMinimap] = useState(false);
	const [zenMode, setZenMode] = useState(false);
	const [selectedFile, setSelectedFile] = useState("SettingsPanel.tsx");
	const [selectedModel, setSelectedModel] = useState("claude-4");

	return (
		<section
			className="mb-24 animate-slide-up"
			style={{ animationDelay: "0.3s" }}
		>
			<div className="relative rounded-xl overflow-hidden border border-white/[0.08] shadow-2xl shadow-black/50">
				{/* Window Chrome */}
				<div className="bg-surgent-bg px-3 py-1.5 flex items-center">
					<div className="flex gap-1.5">
						<div className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
						<div className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
						<div className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
					</div>
				</div>

				{/* App Layout */}
				<div className="flex h-[630px] bg-surgent-bg">
					{/* Icon Sidebar - Minimal */}
					<aside className="w-10 flex flex-col border-r border-surgent-border bg-surgent-bg shrink-0">
						{/* Logo */}
						<div className="flex h-8 items-center justify-center">
							<img
								src="/app-icon.png"
								alt="inferay"
								className="h-5 w-5 rounded-md"
							/>
						</div>
						<nav className="flex-1 py-2 flex flex-col items-center gap-0.5">
							<button
								className="w-6 h-6 flex items-center justify-center rounded-md border border-surgent-border bg-surgent-surface-2 text-surgent-text transition-colors"
								title="Chat"
							>
								<Icons.Terminal />
							</button>
							<button
								className="w-6 h-6 flex items-center justify-center rounded-md border border-transparent text-surgent-text-3 hover:bg-surgent-surface hover:text-surgent-text-2 transition-colors"
								title="Git"
							>
								<Icons.Git />
							</button>
						</nav>
						<div className="py-2 flex flex-col items-center gap-0.5">
							<button
								className="w-6 h-6 flex items-center justify-center rounded-md border border-transparent text-surgent-text-3 hover:bg-surgent-surface hover:text-surgent-text-2 transition-colors"
								title="Settings"
							>
								<Icons.Settings />
							</button>
						</div>
					</aside>

					{/* Main Content */}
					<div className="flex-1 flex flex-col min-w-0">
						{/* Header */}
						<div className="flex items-center gap-1.5 border-b border-surgent-border px-2 h-8">
							{/* View tabs */}
							<div className="flex items-center gap-0.5">
								{[
									{ id: "code", label: "Editor", icon: <Icons.Code /> },
									{ id: "chat", label: "Chat", icon: <Icons.Terminal /> },
									{ id: "graph", label: "Graph", icon: <Icons.Graph /> },
									{
										id: "timeline",
										label: "Timeline",
										icon: <Icons.Timeline />,
									},
								].map((tab) => (
									<button
										key={tab.id}
										onClick={() => {
											setView(tab.id as typeof view);
											setZenMode(false);
										}}
										className={`flex items-center gap-1 h-6 px-2 rounded-md border text-[10px] font-medium transition-colors ${
											view === tab.id
												? "border-surgent-border bg-surgent-surface-2 text-surgent-text"
												: "border-transparent text-surgent-text-3 hover:bg-surgent-surface hover:text-surgent-text-2"
										}`}
									>
										{tab.icon}
										{tab.label}
									</button>
								))}
							</div>

							<div className="flex-1" />

							{/* Branch indicator - only show in non-chat views */}
							{view !== "chat" && (
								<div className="hidden md:flex items-center gap-1 h-6 px-1.5 rounded-md bg-surgent-surface border border-surgent-border">
									<Icons.Branch />
									<span className="text-[9px] font-mono text-surgent-text-2">
										main
									</span>
								</div>
							)}

							{/* View toggles - show in code and graph views */}
							{(view === "code" || view === "graph") && (
								<div className="flex items-center gap-0.5 h-6 px-1 rounded-md bg-surgent-surface border border-surgent-border">
									<button
										onClick={() => setShowSidebar(!showSidebar)}
										className={`p-0.5 rounded transition-colors ${showSidebar ? "text-surgent-text" : "text-surgent-text-3 hover:text-surgent-text-2"}`}
										title="Sidebar"
									>
										<Icons.Layers />
									</button>
								</div>
							)}

							<div className="flex items-center h-6 px-1 rounded-md bg-surgent-surface border border-surgent-border">
								<button
									onClick={() => setZenMode(!zenMode)}
									className={`p-0.5 rounded transition-colors ${zenMode ? "text-surgent-accent" : "text-surgent-text-3 hover:text-surgent-text-2"}`}
									title="Focus mode"
								>
									{zenMode ? <Icons.Collapse /> : <Icons.Expand />}
								</button>
							</div>
						</div>

						{/* Content Area */}
						<div className="flex-1 flex overflow-hidden">
							{/* Main View Content */}
							{view === "code" ? (
								<>
									{/* Chat Panel - hidden in zen mode */}
									{!zenMode && (
										<section className="w-[300px] shrink-0 flex flex-col border-r border-surgent-border">
											<ChatPanel
												selectedModel={selectedModel}
												onSelectModel={setSelectedModel}
											/>
										</section>
									)}

									{/* Diff Viewer */}
									<div className="flex-1 min-w-0 flex bg-black relative">
										<ShikiDiffViewer filePath={selectedFile} />
										{showMinimap && !zenMode && <Minimap />}
										{/* Minimap toggle button */}
										{!zenMode && (
											<button
												onClick={() => setShowMinimap(!showMinimap)}
												className={`absolute top-2 right-2 p-1.5 rounded-md border transition-colors ${
													showMinimap
														? "bg-surgent-surface-2 border-surgent-border text-surgent-text"
														: "bg-surgent-surface/80 border-surgent-border/50 text-surgent-text-3 hover:text-surgent-text hover:bg-surgent-surface"
												}`}
												title="Minimap"
											>
												<Icons.Minimap />
											</button>
										)}
									</div>

									{/* Unified Sidebar (Activity + Changes) - always show in code view when enabled */}
									{showSidebar && (
										<UnifiedSidebar
											selectedFile={selectedFile}
											onSelectFile={setSelectedFile}
										/>
									)}
								</>
							) : view === "chat" ? (
								<ChatGridView
									selectedModel={selectedModel}
									onSelectModel={setSelectedModel}
								/>
							) : view === "graph" ? (
								<>
									<GraphView />
									{showSidebar && (
										<UnifiedSidebar
											selectedFile={selectedFile}
											onSelectFile={setSelectedFile}
										/>
									)}
								</>
							) : view === "timeline" ? (
								<TimelineView />
							) : null}
						</div>

						{/* Zen Mode Floating Panel */}
						{zenMode && (
							<div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-6">
								<div className="rounded-2xl border border-surgent-border bg-surgent-surface backdrop-blur-xl shadow-2xl overflow-hidden">
									{/* Combined context + status bar */}
									<div className="flex items-center gap-2 px-4 py-2 border-b border-surgent-border/30">
										{/* Model indicator */}
										<div className="flex items-center gap-1.5">
											<span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
											<span className="text-[10px] font-medium text-surgent-text-2">
												Opus 4.7
											</span>
										</div>
										<span className="text-surgent-text-3/50">/</span>
										{/* Project path */}
										<div className="flex items-center gap-1 text-surgent-text-3">
											<Icons.Folder />
											<span className="text-[10px] font-mono">
												projects/my-app
											</span>
										</div>
										<span className="text-surgent-text-3/50">/</span>
										{/* Branch */}
										<div className="flex items-center gap-1 text-surgent-text-3">
											<Icons.Branch />
											<span className="text-[10px] font-mono">main</span>
										</div>
										<span className="flex-1" />
										{/* Thinking + time */}
										<ThinkingIndicator />
										<span className="text-[10px] tabular-nums text-surgent-text-3">
											0:42
										</span>
										<button className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] bg-surgent-error/10 text-surgent-error border border-surgent-error/30 hover:bg-surgent-error/20 transition-colors">
											<Icons.Pause />
											Stop
										</button>
									</div>

									{/* Input */}
									<div className="flex items-center gap-3 px-4 py-3">
										<input
											type="text"
											placeholder="What would you like to do next?"
											className="flex-1 bg-transparent text-[13px] text-surgent-text outline-none placeholder:text-surgent-text-3"
										/>
										<button className="p-2 rounded-lg text-surgent-text-3 hover:bg-surgent-surface-2 hover:text-surgent-text transition-colors">
											<Icons.Plus />
										</button>
									</div>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>
		</section>
	);
}

export default Inferay;
