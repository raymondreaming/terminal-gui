import React, { useState } from "react";
import { Icons } from "./Icons";
import { sessionTimeline } from "./data";
import { UnifiedSidebar } from "./Sidebar";

// Timeline View - Session History
export function TimelineView() {
	const [expandedItem, setExpandedItem] = useState<number | null>(0);
	const [selectedFile, setSelectedFile] = useState("SettingsPanel.tsx");

	return (
		<div className="flex-1 flex overflow-hidden bg-black">
			{/* Timeline */}
			<div className="flex-1 overflow-auto p-4 flex justify-center">
				<div className="w-full max-w-xl">
					<div className="flex items-center gap-2 mb-4">
						<div className="p-1.5 rounded-md bg-surgent-accent/10">
							<Icons.Clock />
						</div>
						<div>
							<h3 className="text-[11px] font-medium text-surgent-text">
								Session Timeline
							</h3>
							<p className="text-[9px] text-surgent-text-3">
								32 minutes • 4 conversations • 11 file changes
							</p>
						</div>
					</div>

					<div className="relative">
						{/* Timeline line */}
						<div className="absolute left-[9px] top-2 bottom-2 w-px bg-surgent-border" />

						{sessionTimeline.map((item, idx) => (
							<div key={idx} className="relative pl-6 pb-3">
								{/* Timeline dot */}
								<div
									className={`absolute left-0 top-1 w-5 h-5 rounded-full flex items-center justify-center ${
										item.status === "checkpoint"
											? "bg-purple-500/20 border-2 border-purple-500"
											: "bg-surgent-surface border-2 border-surgent-border"
									}`}
								>
									{item.status === "checkpoint" ? (
										<Icons.Zap />
									) : (
										<Icons.Check />
									)}
								</div>

								{/* Content */}
								<div
									className={`rounded-lg border transition-all ${
										expandedItem === idx
											? "border-surgent-accent/30 bg-surgent-surface"
											: "border-surgent-border bg-surgent-bg hover:bg-surgent-surface/50"
									}`}
								>
									<button
										className="w-full text-left p-2"
										onClick={() =>
											setExpandedItem(expandedItem === idx ? null : idx)
										}
									>
										<div className="flex items-center gap-2">
											<span className="text-[10px] text-surgent-text">
												{item.summary}
											</span>
											{item.changes && (
												<span className="text-[8px] px-1 py-0.5 rounded-full bg-green-500/10 text-green-400">
													{item.changes} files
												</span>
											)}
											<span className="ml-auto text-[9px] text-surgent-text-3">
												{item.time}
											</span>
										</div>
									</button>

									{expandedItem === idx && item.status === "complete" && (
										<div className="px-2 pb-2 space-y-1.5 border-t border-surgent-border/50 pt-2">
											<div className="flex items-center gap-1.5 text-[9px] text-surgent-text-2">
												<Icons.File />
												<span className="font-mono">SettingsPanel.tsx</span>
												<span className="text-green-400">+4</span>
												<span className="text-red-400">−1</span>
											</div>
											<div className="flex items-center gap-1.5 text-[9px] text-surgent-text-2">
												<Icons.File />
												<span className="font-mono">DarkModeToggle.tsx</span>
												<span className="text-green-400">+28</span>
											</div>
											<div className="flex gap-1.5 mt-2">
												<button className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8px] bg-surgent-surface-2 text-surgent-text-2 hover:text-surgent-text border border-surgent-border">
													<Icons.Undo />
													Revert
												</button>
												<button className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8px] bg-surgent-surface-2 text-surgent-text-2 hover:text-surgent-text border border-surgent-border">
													<Icons.Branch />
													Branch
												</button>
											</div>
										</div>
									)}
								</div>
							</div>
						))}
					</div>
				</div>
			</div>

			{/* Side panel - Activity + Changes */}
			<UnifiedSidebar
				selectedFile={selectedFile}
				onSelectFile={setSelectedFile}
			/>
		</div>
	);
}
