import React, { useState } from "react";

const commands = [
	{ keys: ["Cmd", "K"], action: "Command palette", category: "Navigation" },
	{ keys: ["Cmd", "N"], action: "New session", category: "Sessions" },
	{ keys: ["Cmd", "W"], action: "Close session", category: "Sessions" },
	{ keys: ["Cmd", "1-9"], action: "Switch to session", category: "Sessions" },
	{ keys: ["Cmd", "Shift", "M"], action: "Switch model", category: "AI" },
	{ keys: ["Cmd", "Enter"], action: "Send message", category: "AI" },
	{
		keys: ["Cmd", "Shift", "C"],
		action: "Copy code block",
		category: "Editor",
	},
	{ keys: ["Cmd", "S"], action: "Save conversation", category: "Files" },
	{ keys: ["Cmd", ","], action: "Settings", category: "App" },
	{ keys: ["Cmd", "D"], action: "Toggle diff view", category: "Editor" },
	{ keys: ["Cmd", "G"], action: "Open git panel", category: "Git" },
	{ keys: ["Cmd", "Shift", "P"], action: "Open project", category: "Files" },
];

const paletteItems = [
	{ icon: "plus", label: "New Session", hint: "Start a new AI conversation" },
	{ icon: "switch", label: "Switch Model", hint: "Change active AI model" },
	{ icon: "folder", label: "Open Project", hint: "Open a project folder" },
	{ icon: "git", label: "Git Status", hint: "View uncommitted changes" },
	{ icon: "settings", label: "Settings", hint: "Configure preferences" },
	{ icon: "theme", label: "Change Theme", hint: "Switch color theme" },
];

function KeyboardKey({ children }: { children: React.ReactNode }) {
	return (
		<kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md text-[11px] font-medium bg-white/[0.08] border border-white/[0.12] text-white/70 shadow-sm">
			{children}
		</kbd>
	);
}

export default function CommandPalette() {
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);

	const filteredItems = paletteItems.filter(
		(item) =>
			item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
			item.hint.toLowerCase().includes(searchQuery.toLowerCase())
	);

	return (
		<div className="max-w-6xl mx-auto">
			<div className="text-center mb-12">
				<h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
					Keyboard-first workflow
				</h2>
				<p className="text-white/40 max-w-lg mx-auto">
					Every action at your fingertips. Never leave the keyboard.
				</p>
			</div>

			<div className="grid md:grid-cols-2 gap-8 items-start">
				{/* Command Palette Mock */}
				<div className="relative">
					<div className="absolute -inset-4 bg-gradient-to-r from-blue-500/20 via-violet-500/20 to-fuchsia-500/20 rounded-3xl blur-2xl opacity-30"></div>
					<div className="relative rounded-2xl border border-white/[0.1] bg-[#0a0a0a] shadow-2xl overflow-hidden">
						{/* Search input */}
						<div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
							<svg
								className="w-4 h-4 text-white/30"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
								/>
							</svg>
							<input
								type="text"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								placeholder="Type a command or search..."
								className="flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/30 outline-none"
							/>
							<div className="flex items-center gap-1">
								<KeyboardKey>Esc</KeyboardKey>
							</div>
						</div>

						{/* Results */}
						<div className="p-2 max-h-[320px] overflow-y-auto">
							{filteredItems.map((item, idx) => (
								<div
									key={item.label}
									className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
										idx === selectedIndex
											? "bg-white/[0.08]"
											: "hover:bg-white/[0.04]"
									}`}
									onMouseEnter={() => setSelectedIndex(idx)}
								>
									<div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center">
										{item.icon === "plus" && (
											<svg
												className="w-4 h-4 text-white/60"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M12 4v16m8-8H4"
												/>
											</svg>
										)}
										{item.icon === "switch" && (
											<svg
												className="w-4 h-4 text-white/60"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
												/>
											</svg>
										)}
										{item.icon === "folder" && (
											<svg
												className="w-4 h-4 text-white/60"
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
										{item.icon === "git" && (
											<svg
												className="w-4 h-4 text-white/60"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<circle cx="18" cy="18" r="3" />
												<circle cx="6" cy="6" r="3" />
												<path d="M13 6h3a2 2 0 012 2v7M6 9v12" />
											</svg>
										)}
										{item.icon === "settings" && (
											<svg
												className="w-4 h-4 text-white/60"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
												/>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
												/>
											</svg>
										)}
										{item.icon === "theme" && (
											<svg
												className="w-4 h-4 text-white/60"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
												/>
											</svg>
										)}
									</div>
									<div className="flex-1 min-w-0">
										<p className="text-sm font-medium text-white/90">
											{item.label}
										</p>
										<p className="text-xs text-white/40 truncate">
											{item.hint}
										</p>
									</div>
									{idx === selectedIndex && (
										<span className="text-[10px] text-white/30">
											Enter to select
										</span>
									)}
								</div>
							))}
						</div>

						{/* Footer */}
						<div className="flex items-center justify-between px-4 py-2 border-t border-white/[0.06] bg-white/[0.02]">
							<div className="flex items-center gap-4 text-[10px] text-white/30">
								<span className="flex items-center gap-1">
									<KeyboardKey>↑</KeyboardKey>
									<KeyboardKey>↓</KeyboardKey>
									Navigate
								</span>
								<span className="flex items-center gap-1">
									<KeyboardKey>↵</KeyboardKey>
									Select
								</span>
							</div>
						</div>
					</div>
				</div>

				{/* Keyboard shortcuts list */}
				<div className="space-y-6">
					{["Navigation", "Sessions", "AI", "Editor"].map((category) => (
						<div key={category}>
							<h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3">
								{category}
							</h3>
							<div className="space-y-2">
								{commands
									.filter((c) => c.category === category)
									.map((cmd) => (
										<div
											key={cmd.action}
											className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.08] transition-colors"
										>
											<span className="text-sm text-white/70">
												{cmd.action}
											</span>
											<div className="flex items-center gap-1">
												{cmd.keys.map((key, i) => (
													<React.Fragment key={key}>
														<KeyboardKey>
															{key === "Cmd" ? "⌘" : key}
														</KeyboardKey>
														{i < cmd.keys.length - 1 && (
															<span className="text-white/20 text-xs">+</span>
														)}
													</React.Fragment>
												))}
											</div>
										</div>
									))}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
