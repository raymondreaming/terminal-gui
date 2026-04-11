import React, { useState } from "react";

const features = [
	{
		id: "multi-pane",
		title: "Multi-Pane Layout",
		description:
			"Split your workspace into multiple panes. Run different conversations, models, or projects side by side without switching contexts.",
		demo: "panes",
	},
	{
		id: "git",
		title: "Git Integration",
		description:
			"Stage changes, view diffs, and commit directly from inferay. AI-assisted commit messages and branch management built-in.",
		demo: "git",
	},
	{
		id: "context",
		title: "Smart Context",
		description:
			"Automatically includes relevant files, recent changes, and project structure in your prompts. No more copy-pasting context.",
		demo: "context",
	},
	{
		id: "diff",
		title: "Diff Viewer",
		description:
			"See exactly what the AI changed with syntax-highlighted side-by-side diffs. Accept, reject, or edit changes inline.",
		demo: "diff",
	},
];

function PanesDemo() {
	return (
		<div className="relative h-[300px] rounded-xl overflow-hidden bg-[#0a0a0a] border border-white/[0.06]">
			<div className="absolute inset-0 flex">
				{/* Pane 1 */}
				<div className="flex-1 border-r border-white/[0.06] p-3">
					<div className="flex items-center gap-2 mb-3">
						<span className="w-5 h-5 rounded-md bg-orange-500/20 flex items-center justify-center text-[9px] font-bold text-orange-400">
							C
						</span>
						<span className="text-[10px] text-white/50">Claude 3.5</span>
						<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-auto"></span>
					</div>
					<div className="space-y-2">
						<div className="p-2 rounded-lg bg-white/[0.03] text-[10px] text-white/60">
							How do I optimize this React component?
						</div>
						<div className="p-2 rounded-lg bg-orange-500/10 text-[10px] text-white/70">
							I can see a few optimization opportunities...
						</div>
					</div>
				</div>
				{/* Pane 2 */}
				<div className="flex-1 border-r border-white/[0.06] p-3">
					<div className="flex items-center gap-2 mb-3">
						<span className="w-5 h-5 rounded-md bg-emerald-500/20 flex items-center justify-center text-[9px] font-bold text-emerald-400">
							G
						</span>
						<span className="text-[10px] text-white/50">GPT-4</span>
						<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-auto"></span>
					</div>
					<div className="space-y-2">
						<div className="p-2 rounded-lg bg-white/[0.03] text-[10px] text-white/60">
							Write unit tests for this function
						</div>
						<div className="p-2 rounded-lg bg-emerald-500/10 text-[10px] text-white/70">
							Here are comprehensive unit tests...
						</div>
					</div>
				</div>
				{/* Pane 3 */}
				<div className="flex-1 p-3">
					<div className="flex items-center gap-2 mb-3">
						<span className="w-5 h-5 rounded-md bg-violet-500/20 flex items-center justify-center text-[9px] font-bold text-violet-400">
							X
						</span>
						<span className="text-[10px] text-white/50">Codex</span>
						<span className="w-1.5 h-1.5 rounded-full bg-amber-500 ml-auto animate-pulse"></span>
					</div>
					<div className="space-y-2">
						<div className="p-2 rounded-lg bg-white/[0.03] text-[10px] text-white/60">
							Generate API documentation
						</div>
						<div className="p-2 rounded-lg bg-violet-500/10 text-[10px] text-white/70 animate-pulse">
							Generating...
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function GitDemo() {
	return (
		<div className="relative h-[300px] rounded-xl overflow-hidden bg-[#0a0a0a] border border-white/[0.06]">
			<div className="absolute inset-0 flex">
				{/* Staged files */}
				<div className="w-48 border-r border-white/[0.06] p-3">
					<p className="text-[9px] font-medium text-white/40 uppercase tracking-wider mb-3">
						Staged
					</p>
					<div className="space-y-1">
						{["useDebounce.ts", "api/client.ts"].map((file) => (
							<div
								key={file}
								className="flex items-center gap-2 p-1.5 rounded-md hover:bg-white/[0.03]"
							>
								<span className="w-4 h-4 rounded text-[8px] font-bold bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
									+
								</span>
								<span className="text-[10px] text-white/70 font-mono truncate">
									{file}
								</span>
							</div>
						))}
					</div>
					<p className="text-[9px] font-medium text-white/40 uppercase tracking-wider mt-4 mb-3">
						Unstaged
					</p>
					<div className="space-y-1">
						{["components/Modal.tsx", "styles/global.css", "package.json"].map(
							(file) => (
								<div
									key={file}
									className="flex items-center gap-2 p-1.5 rounded-md hover:bg-white/[0.03]"
								>
									<span className="w-4 h-4 rounded text-[8px] font-bold bg-amber-500/20 text-amber-400 flex items-center justify-center">
										M
									</span>
									<span className="text-[10px] text-white/70 font-mono truncate">
										{file}
									</span>
								</div>
							)
						)}
					</div>
				</div>
				{/* Commit message */}
				<div className="flex-1 p-3">
					<p className="text-[9px] font-medium text-white/40 uppercase tracking-wider mb-3">
						Commit Message
					</p>
					<div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
						<p className="text-[11px] text-white/80 font-mono">
							feat: add useDebounce hook and improve API client
						</p>
						<p className="text-[10px] text-white/50 font-mono mt-2">
							- Add generic useDebounce hook for input optimization
							<br />
							- Refactor API client with better error handling
							<br />- Update Modal component styling
						</p>
					</div>
					<div className="flex items-center gap-2 mt-3">
						<span className="px-2 py-1 rounded-md text-[9px] font-medium bg-violet-500/20 text-violet-400 flex items-center gap-1">
							<svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
								<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-5-5 1.41-1.41L11 14.17l7.59-7.59L20 8l-9 9z" />
							</svg>
							AI Generated
						</span>
						<button className="px-3 py-1 rounded-md text-[10px] font-medium bg-emerald-500 text-white">
							Commit
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

function ContextDemo() {
	return (
		<div className="relative h-[300px] rounded-xl overflow-hidden bg-[#0a0a0a] border border-white/[0.06] p-4">
			<p className="text-[9px] font-medium text-white/40 uppercase tracking-wider mb-3">
				Auto-included Context
			</p>
			<div className="space-y-2">
				{[
					{
						type: "file",
						name: "src/App.tsx",
						lines: "1-45",
						reason: "Currently open",
					},
					{
						type: "file",
						name: "src/hooks/useAuth.ts",
						lines: "all",
						reason: "Referenced import",
					},
					{
						type: "git",
						name: "Recent changes",
						lines: "+24 -8",
						reason: "Modified today",
					},
					{
						type: "tree",
						name: "Project structure",
						lines: "12 files",
						reason: "For context",
					},
				].map((item, i) => (
					<div
						key={i}
						className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]"
					>
						<div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center">
							{item.type === "file" && (
								<svg
									className="w-4 h-4 text-blue-400"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
									/>
								</svg>
							)}
							{item.type === "git" && (
								<svg
									className="w-4 h-4 text-orange-400"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<circle cx="18" cy="18" r="3" />
									<circle cx="6" cy="6" r="3" />
									<path d="M13 6h3a2 2 0 012 2v7M6 9v12" />
								</svg>
							)}
							{item.type === "tree" && (
								<svg
									className="w-4 h-4 text-emerald-400"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
									/>
								</svg>
							)}
						</div>
						<div className="flex-1 min-w-0">
							<p className="text-[11px] font-medium text-white/80 font-mono truncate">
								{item.name}
							</p>
							<p className="text-[9px] text-white/40">{item.reason}</p>
						</div>
						<span className="text-[9px] text-white/30 font-mono">
							{item.lines}
						</span>
					</div>
				))}
			</div>
			<div className="absolute bottom-4 left-4 right-4 p-3 rounded-lg bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20">
				<p className="text-[10px] text-white/60">
					<span className="text-violet-400 font-medium">4 items</span> will be
					included in your next prompt automatically
				</p>
			</div>
		</div>
	);
}

function DiffDemo() {
	return (
		<div className="relative h-[300px] rounded-xl overflow-hidden bg-[#0a0a0a] border border-white/[0.06]">
			<div className="flex h-full">
				{/* Before */}
				<div className="flex-1 border-r border-white/[0.06]">
					<div className="px-3 py-2 border-b border-white/[0.06] bg-white/[0.02]">
						<span className="text-[10px] text-white/40">Before</span>
					</div>
					<div className="p-2 font-mono text-[10px]">
						{[
							{
								num: 1,
								code: "function debounce(fn, delay) {",
								type: "normal",
							},
							{ num: 2, code: "  let timer;", type: "removed" },
							{ num: 3, code: "  return function(...args) {", type: "normal" },
							{ num: 4, code: "    clearTimeout(timer);", type: "normal" },
							{
								num: 5,
								code: "    timer = setTimeout(() => {",
								type: "normal",
							},
							{ num: 6, code: "      fn.apply(this, args);", type: "removed" },
							{ num: 7, code: "    }, delay);", type: "normal" },
							{ num: 8, code: "  };", type: "normal" },
							{ num: 9, code: "}", type: "normal" },
						].map((line) => (
							<div
								key={line.num}
								className={`flex ${line.type === "removed" ? "bg-red-500/10" : ""}`}
							>
								<span className="w-8 text-right pr-2 text-white/20 select-none">
									{line.num}
								</span>
								<span
									className={
										line.type === "removed"
											? "text-red-400/70"
											: "text-white/50"
									}
								>
									{line.code}
								</span>
							</div>
						))}
					</div>
				</div>
				{/* After */}
				<div className="flex-1">
					<div className="px-3 py-2 border-b border-white/[0.06] bg-white/[0.02]">
						<span className="text-[10px] text-white/40">After</span>
					</div>
					<div className="p-2 font-mono text-[10px]">
						{[
							{
								num: 1,
								code: "function debounce<T>(fn: T, delay: number) {",
								type: "normal",
							},
							{
								num: 2,
								code: "  let timer: ReturnType<typeof setTimeout>;",
								type: "added",
							},
							{
								num: 3,
								code: "  return function(...args: Parameters<T>) {",
								type: "normal",
							},
							{ num: 4, code: "    clearTimeout(timer);", type: "normal" },
							{
								num: 5,
								code: "    timer = setTimeout(() => {",
								type: "normal",
							},
							{
								num: 6,
								code: "      (fn as Function).apply(this, args);",
								type: "added",
							},
							{ num: 7, code: "    }, delay);", type: "normal" },
							{ num: 8, code: "  };", type: "normal" },
							{ num: 9, code: "}", type: "normal" },
						].map((line) => (
							<div
								key={line.num}
								className={`flex ${line.type === "added" ? "bg-emerald-500/10" : ""}`}
							>
								<span className="w-8 text-right pr-2 text-white/20 select-none">
									{line.num}
								</span>
								<span
									className={
										line.type === "added"
											? "text-emerald-400/70"
											: "text-white/50"
									}
								>
									{line.code}
								</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

export default function FeatureShowcase() {
	const [activeFeature, setActiveFeature] = useState("multi-pane");

	const renderDemo = () => {
		switch (activeFeature) {
			case "multi-pane":
				return <PanesDemo />;
			case "git":
				return <GitDemo />;
			case "context":
				return <ContextDemo />;
			case "diff":
				return <DiffDemo />;
			default:
				return null;
		}
	};

	return (
		<div className="max-w-6xl mx-auto">
			<div className="text-center mb-12">
				<h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
					Built for developers
				</h2>
				<p className="text-white/40 max-w-lg mx-auto">
					Every feature designed to keep you in flow state
				</p>
			</div>

			{/* Feature tabs */}
			<div className="flex flex-wrap items-center justify-center gap-2 mb-8">
				{features.map((feature) => (
					<button
						key={feature.id}
						onClick={() => setActiveFeature(feature.id)}
						className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
							activeFeature === feature.id
								? "bg-white/10 text-white border border-white/20"
								: "bg-white/[0.03] text-white/40 border border-white/[0.06] hover:border-white/10 hover:text-white/60"
						}`}
					>
						{feature.title}
					</button>
				))}
			</div>

			{/* Demo area */}
			<div className="grid md:grid-cols-2 gap-8 items-center">
				<div>
					<h3 className="text-2xl font-semibold mb-4">
						{features.find((f) => f.id === activeFeature)?.title}
					</h3>
					<p className="text-white/50 leading-relaxed mb-6">
						{features.find((f) => f.id === activeFeature)?.description}
					</p>
					<a
						href="#"
						className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
					>
						Learn more
						<svg
							className="w-4 h-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M17 8l4 4m0 0l-4 4m4-4H3"
							/>
						</svg>
					</a>
				</div>
				<div>{renderDemo()}</div>
			</div>
		</div>
	);
}
