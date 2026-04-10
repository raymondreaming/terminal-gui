import React, { useState, useCallback } from "react";

// Syntax highlighting colors (github-dark-default)
const colors = {
	keyword: "#ff7b72",
	text: "#c9d1d9",
	string: "#a5d6ff",
	type: "#ffa657",
	function: "#d2a8ff",
	tag: "#7ee787",
	attribute: "#79c0ff",
	added: "rgba(46, 160, 67, 0.15)",
	removed: "rgba(248, 81, 73, 0.15)",
};

// Mock diff data - paired rows for side-by-side view
// Each row has left (before) and right (after) with their own line numbers
const diffRows = [
	{
		left: {
			num: 1,
			content: 'import React, { useState } from "react";',
			type: "normal",
		},
		right: {
			num: 1,
			content: 'import React, { useState } from "react";',
			type: "normal",
		},
	},
	{
		left: {
			num: 2,
			content: 'import { ThemeSelector } from "./ThemeSelector";',
			type: "normal",
		},
		right: {
			num: 2,
			content: 'import { ThemeSelector } from "./ThemeSelector";',
			type: "normal",
		},
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 3,
			content: 'import { DarkModeToggle } from "./DarkModeToggle";',
			type: "added",
		},
	},
	{
		left: {
			num: 3,
			content: 'import { useSettings } from "../hooks/useSettings";',
			type: "normal",
		},
		right: {
			num: 4,
			content: 'import { useSettings } from "../hooks/useSettings";',
			type: "normal",
		},
	},
	{
		left: { num: 4, content: "", type: "normal" },
		right: { num: 5, content: "", type: "normal" },
	},
	{
		left: { num: 5, content: "interface SettingsPanelProps {", type: "normal" },
		right: {
			num: 6,
			content: "interface SettingsPanelProps {",
			type: "normal",
		},
	},
	{
		left: { num: 6, content: "  onClose: () => void;", type: "normal" },
		right: { num: 7, content: "  onClose: () => void;", type: "normal" },
	},
	{
		left: { num: 7, content: "  initialTab?: string;", type: "normal" },
		right: { num: 8, content: "  initialTab?: string;", type: "normal" },
	},
	{
		left: { num: 8, content: "}", type: "normal" },
		right: { num: 9, content: "}", type: "normal" },
	},
	{
		left: { num: 9, content: "", type: "normal" },
		right: { num: 10, content: "", type: "normal" },
	},
	{
		left: {
			num: 10,
			content:
				"export function SettingsPanel({ onClose, initialTab }: SettingsPanelProps) {",
			type: "normal",
		},
		right: {
			num: 11,
			content:
				"export function SettingsPanel({ onClose, initialTab }: SettingsPanelProps) {",
			type: "normal",
		},
	},
	{
		left: {
			num: 11,
			content:
				'  const [activeTab, setActiveTab] = useState(initialTab ?? "general");',
			type: "normal",
		},
		right: {
			num: 12,
			content:
				'  const [activeTab, setActiveTab] = useState(initialTab ?? "general");',
			type: "normal",
		},
	},
	{
		left: {
			num: 12,
			content: "  const { settings, updateSetting } = useSettings();",
			type: "normal",
		},
		right: {
			num: 13,
			content: "  const { settings, updateSetting } = useSettings();",
			type: "normal",
		},
	},
	{
		left: { num: 13, content: "", type: "normal" },
		right: { num: 14, content: "", type: "normal" },
	},
	{
		left: { num: 14, content: "  return (", type: "normal" },
		right: { num: 15, content: "  return (", type: "normal" },
	},
	{
		left: {
			num: 15,
			content: '    <div className="settings-panel">',
			type: "normal",
		},
		right: {
			num: 16,
			content: '    <div className="settings-panel">',
			type: "normal",
		},
	},
	{
		left: { num: 16, content: "      <h2>Settings</h2>", type: "removed" },
		right: { num: null, content: "", type: "empty" },
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 17,
			content: '      <div className="flex justify-between items-center">',
			type: "added",
		},
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: { num: 18, content: "        <h2>Settings</h2>", type: "added" },
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: { num: 19, content: "        <DarkModeToggle />", type: "added" },
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: { num: 20, content: "      </div>", type: "added" },
	},
	{
		left: { num: 17, content: "      <ThemeSelector />", type: "normal" },
		right: { num: 21, content: "      <ThemeSelector />", type: "normal" },
	},
	{
		left: { num: 18, content: '      <div className="tabs">', type: "normal" },
		right: { num: 22, content: '      <div className="tabs">', type: "normal" },
	},
	{
		left: { num: 19, content: "        {TABS.map((tab) => (", type: "normal" },
		right: { num: 23, content: "        {TABS.map((tab) => (", type: "normal" },
	},
	{
		left: { num: 20, content: "          <button", type: "normal" },
		right: { num: 24, content: "          <button", type: "normal" },
	},
	{
		left: { num: 21, content: "            key={tab.id}", type: "normal" },
		right: { num: 25, content: "            key={tab.id}", type: "normal" },
	},
	{
		left: {
			num: 22,
			content: "            onClick={() => setActiveTab(tab.id)}",
			type: "normal",
		},
		right: {
			num: 26,
			content: "            onClick={() => setActiveTab(tab.id)}",
			type: "normal",
		},
	},
	{
		left: {
			num: 23,
			content: '            className={activeTab === tab.id ? "active" : ""}',
			type: "normal",
		},
		right: {
			num: 27,
			content: '            className={activeTab === tab.id ? "active" : ""}',
			type: "normal",
		},
	},
	{
		left: { num: 24, content: "          >", type: "normal" },
		right: { num: 28, content: "          >", type: "normal" },
	},
	{
		left: { num: 25, content: "            {tab.label}", type: "normal" },
		right: { num: 29, content: "            {tab.label}", type: "normal" },
	},
	{
		left: { num: 26, content: "          </button>", type: "normal" },
		right: { num: 30, content: "          </button>", type: "normal" },
	},
	{
		left: { num: 27, content: "        ))}", type: "normal" },
		right: { num: 31, content: "        ))}", type: "normal" },
	},
	{
		left: { num: 28, content: "      </div>", type: "normal" },
		right: { num: 32, content: "      </div>", type: "normal" },
	},
	{
		left: {
			num: 29,
			content: '      <div className="content">',
			type: "normal",
		},
		right: {
			num: 33,
			content: '      <div className="content">',
			type: "normal",
		},
	},
	{
		left: {
			num: 30,
			content: "        {renderTabContent(activeTab)}",
			type: "normal",
		},
		right: {
			num: 34,
			content: "        {renderTabContent(activeTab)}",
			type: "normal",
		},
	},
	{
		left: { num: 31, content: "      </div>", type: "normal" },
		right: { num: 35, content: "      </div>", type: "normal" },
	},
	{
		left: { num: 32, content: "    </div>", type: "normal" },
		right: { num: 36, content: "    </div>", type: "normal" },
	},
	{
		left: { num: 33, content: "  );", type: "normal" },
		right: { num: 37, content: "  );", type: "normal" },
	},
	{
		left: { num: 34, content: "}", type: "normal" },
		right: { num: 38, content: "}", type: "normal" },
	},
];

// Simple syntax highlighter for TSX
function highlightLine(line: string): React.ReactNode {
	if (!line.trim()) return " ";

	const parts: React.ReactNode[] = [];
	let remaining = line;
	let key = 0;

	const patterns: [RegExp, string][] = [
		[
			/^(\s*)(import|export|from|const|let|var|function|return|interface|type|if|else|=>)(?=\s|$|[({])/,
			"keyword",
		],
		[
			/^(\s*)(import|export|from|const|let|var|function|return|interface|type|if|else)(?=\s)/,
			"keyword",
		],
		[/"[^"]*"|'[^']*'/, "string"],
		[/<\/?[a-z][a-zA-Z]*/, "tag"],
		[/[A-Z][a-zA-Z]*(?=\s*[<(/>])/, "type"],
		[/[a-z][a-zA-Z]*(?=\s*\()/, "function"],
		[/\b(className|key|onClick|onChange|onClose|initialTab)\b/, "attribute"],
	];

	// Simple approach: colorize known tokens
	const tokens = line.split(/(\s+|[{}()[\]<>.,;:?!=&|]+|"[^"]*"|'[^']*')/);

	for (const token of tokens) {
		if (!token) continue;

		let color = colors.text;

		if (
			/^(import|export|from|const|let|var|function|return|interface|type|if|else|=>|===|!==|&&|\|\||:|\?)$/.test(
				token
			)
		) {
			color = colors.keyword;
		} else if (/^["'].*["']$/.test(token)) {
			color = colors.string;
		} else if (/^[A-Z][a-zA-Z]*$/.test(token)) {
			color = colors.type;
		} else if (
			/^(className|key|onClick|onChange|onClose|initialTab|void|string|number|boolean)$/.test(
				token
			)
		) {
			color = colors.attribute;
		} else if (
			/^(useState|useSettings|setActiveTab|renderTabContent|map)$/.test(token)
		) {
			color = colors.function;
		} else if (/^(div|button|h2|span)$/.test(token)) {
			color = colors.tag;
		}

		parts.push(
			<span key={key++} style={{ color }}>
				{token}
			</span>
		);
	}

	return parts;
}

// File sidebar data
const unstagedFiles = [
	{ name: "SettingsPanel.tsx", status: "modified", selected: true },
	{ name: "DarkModeToggle.tsx", status: "added" },
	{ name: "ThemeContext.tsx", status: "modified" },
	{ name: "index.css", status: "modified" },
];

const stagedFiles = [
	{ name: "theme-utils.ts", status: "added" },
	{ name: "useTheme.ts", status: "added" },
];

// Chat messages for Terminal page
const terminalChats = [
	{
		project: "terminal-gui",
		status: "active",
		messages: [
			{
				role: "user",
				content: "can you check the current performance of the diff viewer?",
			},
			{
				role: "assistant",
				content:
					"I'll analyze the diff viewer performance. Let me read the component.",
				tool: { name: "Read", file: "SideBySideDiffViewer.tsx" },
			},
			{
				role: "assistant",
				content:
					"The component renders all lines at once which causes lag on large diffs. I recommend using virtualization.",
			},
			{
				role: "user",
				content: "refactor it to use virtualization for better performance",
			},
			{
				role: "assistant",
				content:
					"I'll refactor to use react-window. Reading the current implementation first.",
				tool: {
					name: "Read",
					file: "src/components/diff/SideBySideDiffViewer.tsx",
				},
			},
		],
		activity: {
			type: "Read",
			label: "Reading file...",
			queued: 2,
			elapsed: "0:03",
		},
	},
	{
		project: "api-server",
		status: "idle",
		messages: [
			{ role: "user", content: "what rate limiting options do we have?" },
			{
				role: "assistant",
				content:
					"Common approaches include fixed window, sliding window, token bucket, and leaky bucket algorithms. Sliding window is most accurate.",
			},
			{
				role: "user",
				content: "add rate limiting to the API endpoints using sliding window",
			},
			{
				role: "assistant",
				content:
					"I'll implement rate limiting with a sliding window algorithm.",
				tool: { name: "Edit", file: "src/middleware/rateLimit.ts" },
			},
			{
				role: "assistant",
				content: "Done. Created rate limiter with 100 req/min default:",
				files: ["+ src/middleware/rateLimit.ts", "~ src/routes/api.ts"],
			},
		],
		activity: {
			type: "Edit",
			label: "Editing file...",
			queued: 0,
			elapsed: "0:15",
		},
	},
	{
		project: "docs-site",
		status: "running",
		messages: [
			{
				role: "user",
				content: "what tools can generate docs from typescript?",
			},
			{
				role: "assistant",
				content:
					"TypeDoc is the standard choice. It extracts JSDoc comments and type information to generate HTML documentation.",
			},
			{
				role: "user",
				content: "generate API documentation from the TypeScript types",
			},
			{
				role: "assistant",
				content:
					"I'll generate documentation using TypeDoc. Running the command now...",
				tool: { name: "Bash", command: "npx typedoc --out docs src/types" },
			},
		],
		activity: {
			type: "Bash",
			label: "Running Bash",
			queued: 1,
			elapsed: "0:12",
		},
	},
];

// Experimental page chat
const experimentalChat = {
	project: "terminal-gui",
	status: "active",
	messages: [
		{ role: "user", content: "what's the best way to add theme support?" },
		{
			role: "assistant",
			content:
				"Use CSS variables with a context provider. Store preference in localStorage for persistence.",
		},
		{ role: "user", content: "add dark mode toggle to settings panel" },
		{
			role: "assistant",
			content:
				"I'll add a dark mode toggle. Reading the settings component first.",
			tool: { name: "Read", file: "SettingsPanel.tsx" },
		},
		{
			role: "assistant",
			content: "Adding the toggle with theme persistence:",
			tool: { name: "Edit", file: "SettingsPanel.tsx" },
		},
	],
	activity: {
		type: "Edit",
		label: "Editing file...",
		queued: 1,
		elapsed: "0:08",
	},
};

// Icon components
const TerminalIcon = () => (
	<svg
		width="14"
		height="14"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.8"
	>
		<polyline points="4 17 10 11 4 5" />
		<line x1="12" y1="19" x2="20" y2="19" />
	</svg>
);

const ExperimentalIcon = () => (
	<svg
		width="14"
		height="14"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.8"
	>
		<rect x="3.5" y="4.5" width="8" height="15" rx="2" />
		<path d="M6.5 8.5h2M6.5 12h2.5M14.5 7.5h5M17 7.5v8" />
		<circle cx="17" cy="17.5" r="2.5" />
	</svg>
);

const GitIcon = () => (
	<svg
		width="14"
		height="14"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.8"
	>
		<circle cx="18" cy="18" r="3" />
		<circle cx="6" cy="6" r="3" />
		<path d="M13 6h3a2 2 0 0 1 2 2v7M6 9v12" />
	</svg>
);

const CloseIcon = () => (
	<svg
		width="8"
		height="8"
		viewBox="0 0 8 8"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.5"
		strokeLinecap="round"
	>
		<path d="M1 1l6 6M7 1l-6 6" />
	</svg>
);

const SendIcon = () => (
	<svg
		width="10"
		height="10"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
	>
		<line x1="22" y1="2" x2="11" y2="13" />
		<polygon points="22 2 15 22 11 13 2 9 22 2" />
	</svg>
);

const PauseIcon = () => (
	<svg
		width="10"
		height="10"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
	>
		<rect x="6" y="4" width="4" height="16" rx="1" />
		<rect x="14" y="4" width="4" height="16" rx="1" />
	</svg>
);

const ReadIcon = () => (
	<svg
		width="10"
		height="10"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
	>
		<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
		<circle cx="12" cy="12" r="3" />
	</svg>
);

const EditIcon = () => (
	<svg
		width="10"
		height="10"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
	>
		<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
		<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
	</svg>
);

const BashIcon = () => (
	<svg
		width="10"
		height="10"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
	>
		<polyline points="4 17 10 11 4 5" />
		<line x1="12" y1="19" x2="20" y2="19" />
	</svg>
);

// Chat Panel Component
function ChatPanel({
	chat,
	showClose = true,
}: {
	chat: (typeof terminalChats)[0];
	showClose?: boolean;
}) {
	const getStatusColor = () => {
		if (chat.status === "active") return "bg-surgent-success animate-pulse";
		if (chat.status === "running") return "bg-surgent-warning animate-pulse";
		return "bg-surgent-text-3";
	};

	const getActivityIcon = () => {
		if (chat.activity.type === "Read") return <ReadIcon />;
		if (chat.activity.type === "Edit") return <EditIcon />;
		if (chat.activity.type === "Bash") return <BashIcon />;
		return <ReadIcon />;
	};

	const getActivityColor = () => {
		if (chat.activity.type === "Edit") return "text-surgent-success";
		if (chat.activity.type === "Bash")
			return "text-surgent-warning animate-pulse";
		return "text-surgent-text-3";
	};

	return (
		<div className="flex h-full flex-col">
			{/* Header */}
			<div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-surgent-border">
				<div className="flex items-center gap-2">
					<svg
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						className="text-surgent-accent"
					>
						<circle cx="12" cy="12" r="10" />
					</svg>
					<span className="text-[11px] font-medium text-surgent-text">
						Claude
					</span>
					<span className="text-[10px] text-surgent-text-3">›</span>
					<span className="text-[10px] text-surgent-text-2">
						{chat.project}
					</span>
					<span
						className={`w-1.5 h-1.5 rounded-full ${getStatusColor()}`}
					></span>
				</div>
				{showClose && (
					<button className="w-5 h-5 flex items-center justify-center rounded text-surgent-text-3 hover:text-red-400 hover:bg-red-500/15 transition-colors">
						<CloseIcon />
					</button>
				)}
			</div>

			{/* Messages */}
			<div className="flex-1 overflow-y-auto p-3 space-y-3">
				{chat.messages.map((msg, i) => (
					<div key={i}>
						{msg.role === "user" ? (
							<p className="text-[11px] text-surgent-text leading-relaxed">
								{msg.content}
							</p>
						) : (
							<div className="space-y-2">
								<p className="text-[11px] text-surgent-text-2 leading-relaxed">
									{msg.content}
								</p>
								{msg.tool && (
									<div className="rounded-lg border border-surgent-border bg-surgent-surface p-2">
										<div className="flex items-center gap-2">
											{msg.tool.name === "Read" && <ReadIcon />}
											{msg.tool.name === "Edit" && <EditIcon />}
											{msg.tool.name === "Bash" && <BashIcon />}
											<span
												className={`text-[9px] font-medium ${msg.tool.name === "Edit" ? "text-surgent-success" : msg.tool.name === "Bash" ? "text-surgent-warning" : "text-surgent-text-3"}`}
											>
												{msg.tool.name}
											</span>
											<span className="text-[9px] text-surgent-text-2 font-mono">
												{msg.tool.file || msg.tool.command}
											</span>
										</div>
									</div>
								)}
								{msg.files && (
									<div className="space-y-1 text-[10px] font-mono">
										{msg.files.map((f, j) => (
											<p
												key={j}
												className={
													f.startsWith("+")
														? "text-git-added"
														: "text-git-modified"
												}
											>
												{f}
											</p>
										))}
									</div>
								)}
							</div>
						)}
					</div>
				))}
			</div>

			{/* Activity Bar */}
			<div className="shrink-0 px-3 py-1.5 flex items-center gap-2 border-t border-surgent-border bg-surgent-bg">
				<div className="flex items-center gap-1.5 h-6 px-2.5 rounded-md text-xs font-medium bg-surgent-surface-2 text-surgent-text-2 border border-surgent-border">
					<span className={getActivityColor()}>{getActivityIcon()}</span>
					<span className="max-w-[100px] truncate text-[10px]">
						{chat.activity.label}
					</span>
				</div>
				<span className="flex-1"></span>
				<span className="text-[9px] tabular-nums text-surgent-text-3">
					{chat.activity.elapsed}
				</span>
				{chat.activity.queued > 0 && (
					<span className="px-1.5 py-0.5 rounded text-[9px] font-medium tabular-nums bg-surgent-accent/15 text-surgent-accent">
						{chat.activity.queued} queued
					</span>
				)}
				<button className="p-1 rounded-md border border-surgent-border bg-surgent-surface text-surgent-text-3 hover:bg-surgent-surface-2 transition-colors">
					<PauseIcon />
				</button>
			</div>

			{/* Input */}
			<div className="shrink-0 border-t border-surgent-border p-2">
				<div className="flex items-center gap-2 bg-surgent-surface rounded-lg border border-surgent-border px-3 py-1.5">
					<input
						type="text"
						placeholder="Message..."
						className="flex-1 bg-transparent text-[11px] text-surgent-text outline-none placeholder:text-surgent-text-3"
					/>
					<button className="shrink-0 w-5 h-5 flex items-center justify-center rounded bg-surgent-accent/20 text-surgent-accent">
						<SendIcon />
					</button>
				</div>
			</div>
		</div>
	);
}

// Diff Line Component
function DiffLine({
	lineNum,
	content,
	type,
}: {
	lineNum: number | null;
	content: string;
	type: string;
}) {
	const bg =
		type === "added"
			? colors.added
			: type === "removed"
				? colors.removed
				: type === "empty"
					? "rgba(128,128,128,0.05)"
					: "transparent";

	return (
		<div className="flex h-[18px]" style={{ background: bg }}>
			<span
				className="w-10 px-1.5 text-right text-surgent-text-3 select-none shrink-0"
				style={{ lineHeight: "18px", fontSize: "11px" }}
			>
				{lineNum ?? ""}
			</span>
			<span
				className="flex-1 pr-2 whitespace-pre font-mono overflow-hidden"
				style={{ lineHeight: "18px", fontSize: "11px" }}
			>
				{type !== "empty" ? highlightLine(content) : ""}
			</span>
		</div>
	);
}

// File Sidebar Component
function FileSidebar({
	selectedFile,
	onSelectFile,
}: {
	selectedFile: string;
	onSelectFile: (name: string) => void;
}) {
	return (
		<div className="w-48 shrink-0 flex flex-col border-l border-surgent-border bg-surgent-bg">
			{/* Header */}
			<div className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-surgent-border bg-surgent-bg px-2.5 py-2">
				<GitIcon />
				<span className="flex-1 truncate text-[11px] font-medium text-surgent-text">
					main
				</span>
			</div>

			{/* File groups */}
			<div className="flex-1 min-h-0 overflow-y-auto">
				{/* Unstaged */}
				<div className="sticky top-0 z-10 flex h-7 items-center justify-between border-b border-surgent-border/30 bg-surgent-bg px-2">
					<div className="flex items-center gap-1.5">
						<svg
							className="w-2.5 h-2.5 text-surgent-text-3 rotate-90"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<polyline points="9 18 15 12 9 6" />
						</svg>
						<span className="text-[9px] font-medium uppercase tracking-wide text-surgent-text-2">
							Unstaged
						</span>
						<span className="text-[9px] text-surgent-text-3">
							({unstagedFiles.length})
						</span>
					</div>
					<button className="rounded px-1.5 py-0.5 text-[8px] text-surgent-accent hover:bg-surgent-accent/10 transition-colors">
						Stage All
					</button>
				</div>

				{unstagedFiles.map((file) => (
					<div
						key={file.name}
						onClick={() => onSelectFile(file.name)}
						className={`group flex h-[28px] items-center gap-1.5 px-2 cursor-pointer ${
							selectedFile === file.name
								? "bg-surgent-accent/10"
								: "hover:bg-surgent-text/5"
						}`}
					>
						{file.status === "modified" ? (
							<span className="shrink-0 flex items-center justify-center w-4 h-4 rounded text-amber-400 bg-amber-400/15">
								<EditIcon />
							</span>
						) : (
							<span className="shrink-0 flex items-center justify-center w-4 h-4 rounded text-git-added bg-git-added/15 text-[8px] font-bold">
								+
							</span>
						)}
						<span
							className={`truncate text-[10px] font-mono ${selectedFile === file.name ? "text-surgent-text" : "text-surgent-text-2"}`}
						>
							{file.name}
						</span>
					</div>
				))}

				{/* Staged */}
				<div className="sticky top-0 z-10 flex h-7 items-center justify-between border-b border-surgent-border/30 bg-surgent-bg px-2 mt-1">
					<div className="flex items-center gap-1.5">
						<svg
							className="w-2.5 h-2.5 text-surgent-text-3 rotate-90"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<polyline points="9 18 15 12 9 6" />
						</svg>
						<span className="text-[9px] font-medium uppercase tracking-wide text-git-added">
							Staged
						</span>
						<span className="text-[9px] text-surgent-text-3">
							({stagedFiles.length})
						</span>
					</div>
				</div>

				{stagedFiles.map((file) => (
					<div
						key={file.name}
						onClick={() => onSelectFile(file.name)}
						className={`group flex h-[28px] items-center gap-1.5 px-2 cursor-pointer ${
							selectedFile === file.name
								? "bg-surgent-accent/10"
								: "hover:bg-surgent-text/5"
						}`}
					>
						<span className="shrink-0 flex items-center justify-center w-4 h-4 rounded text-git-added bg-git-added/15 text-[8px] font-bold">
							+
						</span>
						<span
							className={`truncate text-[10px] font-mono ${selectedFile === file.name ? "text-surgent-text" : "text-surgent-text-2"}`}
						>
							{file.name}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

// Main Inferay Component
export function Inferay() {
	const [currentPage, setCurrentPage] = useState<"terminal" | "experimental">(
		"terminal"
	);
	const [zenMode, setZenMode] = useState(false);
	const [viewMode, setViewMode] = useState<"tree" | "path">("tree");
	const [selectedFile, setSelectedFile] = useState("SettingsPanel.tsx");

	return (
		<section
			className="mb-24 animate-slide-up"
			style={{ animationDelay: "0.3s" }}
		>
			<div className="relative rounded-xl overflow-hidden border border-white/[0.08] shadow-2xl shadow-black/50">
				{/* Window Chrome */}
				<div className="bg-surgent-bg border-b border-surgent-border px-3 py-2 flex items-center gap-2">
					<div className="flex gap-1.5">
						<div className="w-2.5 h-2.5 rounded-full bg-surgent-error"></div>
						<div className="w-2.5 h-2.5 rounded-full bg-surgent-warning"></div>
						<div className="w-2.5 h-2.5 rounded-full bg-surgent-success"></div>
					</div>
				</div>

				{/* App Layout */}
				<div className="flex h-[660px] bg-surgent-bg">
					{/* Icon Sidebar */}
					<aside className="w-12 flex flex-col border-r border-surgent-border bg-surgent-bg shrink-0">
						<div className="flex h-12 items-center px-3 border-b border-surgent-border">
							<button className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-surgent-text/[0.05] transition-colors">
								<img src="/app-icon.png" alt="" className="h-7 w-7 rounded" />
							</button>
						</div>
						<nav className="flex-1 py-1.5">
							<button
								onClick={() => {
									setCurrentPage("terminal");
									setZenMode(false);
								}}
								className={`mx-1 mb-px flex items-center justify-center rounded-md px-0 py-1.5 text-[12px] w-10 transition-colors ${
									currentPage === "terminal"
										? "bg-surgent-text/[0.06] text-surgent-text"
										: "text-surgent-text-3 hover:bg-surgent-text/[0.03] hover:text-surgent-text-2"
								}`}
								title="Terminal"
							>
								<TerminalIcon />
							</button>
							<button
								onClick={() => setCurrentPage("experimental")}
								className={`mx-1 mb-px flex items-center justify-center rounded-md px-0 py-1.5 text-[12px] w-10 transition-colors ${
									currentPage === "experimental"
										? "bg-surgent-text/[0.06] text-surgent-text"
										: "text-surgent-text-3 hover:bg-surgent-text/[0.03] hover:text-surgent-text-2"
								}`}
								title="Experimental"
							>
								<ExperimentalIcon />
							</button>
							<button
								onClick={() => {
									setCurrentPage("experimental");
									setZenMode(false);
								}}
								className="mx-1 mb-px flex items-center justify-center rounded-md px-0 py-1.5 text-[12px] text-surgent-text-3 hover:bg-surgent-text/[0.03] hover:text-surgent-text-2 w-10 transition-colors"
								title="Git"
							>
								<GitIcon />
							</button>
						</nav>
					</aside>

					{/* Main Content */}
					<div className="flex-1 flex flex-col min-w-0">
						{/* Header Bar */}
						<div className="relative flex items-center gap-2 border-b border-surgent-border bg-surgent-bg px-2 h-12">
							{currentPage === "terminal" ? (
								/* Terminal Header */
								<>
									<div className="relative z-10 overflow-x-auto shrink-0">
										<div className="flex items-center gap-1.5">
											<div className="flex items-center rounded-lg border border-surgent-border bg-surgent-surface overflow-hidden h-7">
												<div className="group relative flex h-full cursor-pointer items-center gap-1.5 font-medium bg-surgent-text/10 text-surgent-text px-2.5 text-xs">
													<svg
														width="12"
														height="12"
														viewBox="0 0 24 24"
														fill="currentColor"
														stroke="none"
													>
														<path d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h5l2 2h7a2 2 0 012 2v10a2 2 0 01-2 2z" />
													</svg>
													<span>Project</span>
													<span className="-ml-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums bg-surgent-text/10 text-surgent-text">
														3
													</span>
												</div>
											</div>
											<button className="flex items-center justify-center rounded-lg border border-surgent-border bg-surgent-surface text-surgent-text-3 h-7 w-7 hover:bg-surgent-text/[0.06] hover:text-surgent-text-2">
												<svg
													width="10"
													height="10"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="2.5"
													strokeLinecap="round"
												>
													<line x1="12" y1="5" x2="12" y2="19" />
													<line x1="5" y1="12" x2="19" y2="12" />
												</svg>
											</button>
										</div>
									</div>
									<div className="flex-1 min-w-0"></div>
									<div className="relative z-10 flex items-center gap-2 shrink-0">
										<button className="h-7 px-2.5 rounded-lg text-xs font-medium text-surgent-text-3 hover:bg-surgent-text/[0.06] hover:text-surgent-text-2 transition-colors">
											Theme
										</button>
										<div className="flex items-center shrink-0 rounded-lg border border-surgent-border bg-surgent-surface overflow-hidden h-7">
											<button className="flex items-center justify-center h-full w-7 text-surgent-text-3 hover:text-surgent-text-2">
												<svg
													width="13"
													height="13"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="2"
												>
													<rect x="3" y="3" width="7" height="7" />
													<rect x="14" y="3" width="7" height="7" />
													<rect x="14" y="14" width="7" height="7" />
													<rect x="3" y="14" width="7" height="7" />
												</svg>
											</button>
											<button className="flex items-center justify-center h-full w-7 bg-surgent-text/10 text-surgent-text">
												<svg
													width="13"
													height="13"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="2"
												>
													<line x1="3" y1="6" x2="21" y2="6" />
													<line x1="3" y1="12" x2="21" y2="12" />
													<line x1="3" y1="18" x2="21" y2="18" />
												</svg>
											</button>
										</div>
										<button className="flex items-center gap-1 h-7 px-2.5 rounded-lg border border-surgent-border bg-surgent-surface-2 text-xs font-medium text-surgent-text hover:bg-surgent-surface-3">
											<span>New</span>
											<svg
												width="10"
												height="10"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="2.5"
												strokeLinecap="round"
											>
												<line x1="12" y1="5" x2="12" y2="19" />
												<line x1="5" y1="12" x2="19" y2="12" />
											</svg>
										</button>
									</div>
								</>
							) : (
								/* Experimental Header */
								<>
									<div className="relative z-10 min-w-0 shrink-0 overflow-x-auto">
										<div className="flex items-center gap-1 py-1">
											<div className="group flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 cursor-pointer bg-surgent-surface-2 text-surgent-text">
												<svg
													width="12"
													height="12"
													viewBox="0 0 24 24"
													fill="currentColor"
													className="text-surgent-success shrink-0"
												>
													<circle cx="12" cy="12" r="5" />
												</svg>
												<span className="max-w-[110px] truncate text-[10px] font-medium">
													terminal-gui
												</span>
											</div>
											<div className="group flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 cursor-pointer text-surgent-text-3 hover:bg-surgent-surface hover:text-surgent-text-2">
												<svg
													width="12"
													height="12"
													viewBox="0 0 24 24"
													fill="currentColor"
													className="text-surgent-text-3 shrink-0"
												>
													<circle cx="12" cy="12" r="5" />
												</svg>
												<span className="max-w-[110px] truncate text-[10px] font-medium">
													api-server
												</span>
											</div>
										</div>
									</div>
									<div className="flex-1 min-w-0"></div>
									<div className="relative z-10 flex shrink-0 items-center rounded-lg border border-surgent-border bg-surgent-surface overflow-hidden h-7">
										<button className="px-2.5 h-full text-[10px] font-medium bg-surgent-text/10 text-surgent-text">
											Diff
										</button>
										<button className="px-2.5 h-full text-[10px] font-medium text-surgent-text-3 hover:text-surgent-text-2">
											Graph
										</button>
									</div>
									<div className="relative z-10 flex shrink-0 items-center rounded-lg border border-surgent-border bg-surgent-surface overflow-hidden h-7">
										<button
											onClick={() => setViewMode("tree")}
											className={`px-2.5 h-full text-[10px] font-medium ${viewMode === "tree" ? "bg-surgent-text/10 text-surgent-text" : "text-surgent-text-3 hover:text-surgent-text-2"}`}
										>
											Tree
										</button>
										<button
											onClick={() => setViewMode("path")}
											className={`px-2.5 h-full text-[10px] font-medium ${viewMode === "path" ? "bg-surgent-text/10 text-surgent-text" : "text-surgent-text-3 hover:text-surgent-text-2"}`}
										>
											Path
										</button>
									</div>
									<button
										onClick={() => setZenMode(!zenMode)}
										className={`relative z-10 flex shrink-0 items-center justify-center rounded-lg border border-surgent-border h-7 w-7 transition-colors ${
											zenMode
												? "bg-surgent-text/10 text-surgent-text"
												: "bg-surgent-surface text-surgent-text-3 hover:text-surgent-text-2"
										}`}
									>
										<svg
											width="13"
											height="13"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
										>
											<circle cx="12" cy="12" r="10" />
											<path d="M12 2a10 10 0 0 0 0 20" />
										</svg>
									</button>
								</>
							)}
						</div>

						{/* Content Area */}
						{currentPage === "terminal" ? (
							/* Terminal Content - Row of chat columns */
							<div className="flex-1 flex overflow-hidden">
								<div className="flex-1 flex h-full overflow-x-auto bg-surgent-bg">
									{terminalChats.map((chat, i) => (
										<div
											key={chat.project}
											className={`shrink-0 h-full overflow-hidden flex flex-col ${i < terminalChats.length - 1 ? "border-r border-surgent-border" : ""}`}
											style={{ width: 420 }}
										>
											<ChatPanel chat={chat} />
										</div>
									))}
								</div>

								{/* Sessions Sidebar */}
								<div className="w-44 flex flex-col shrink-0 border-l border-surgent-border bg-surgent-bg">
									<div className="flex-1 overflow-y-auto">
										<div className="px-2 py-2">
											<div className="py-1">
												<button className="flex items-center gap-1.5 px-1 text-surgent-text-3 hover:text-surgent-text-2 transition-colors">
													<svg
														width="12"
														height="12"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														strokeWidth="2"
														className="rotate-180"
													>
														<rect x="3" y="3" width="7" height="18" rx="1" />
														<path d="M14 9l3 3-3 3" />
													</svg>
													<span className="text-[9px] font-bold tracking-widest uppercase">
														Sessions
													</span>
												</button>
											</div>
											{terminalChats.map((chat, i) => (
												<div
													key={chat.project}
													className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 mb-0.5 cursor-pointer ${
														i === 0
															? "bg-surgent-surface-2"
															: "hover:bg-surgent-surface"
													}`}
												>
													<span
														className={`w-1.5 h-1.5 rounded-full shrink-0 ${
															chat.status === "active"
																? "bg-surgent-success"
																: chat.status === "running"
																	? "bg-surgent-warning"
																	: "bg-surgent-text-3"
														}`}
													></span>
													<div className="min-w-0 flex-1">
														<p
															className={`truncate text-[10px] font-medium ${i === 0 ? "text-surgent-text" : "text-surgent-text-2"}`}
														>
															{chat.project}
														</p>
													</div>
												</div>
											))}
										</div>
									</div>
									<div className="border-t border-surgent-border">
										<div className="px-2 py-2">
											<div className="flex items-center gap-1.5 px-1 mb-2">
												<svg
													width="12"
													height="12"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="2"
													className="text-surgent-text-3"
												>
													<circle cx="12" cy="12" r="10" />
													<line x1="2" y1="12" x2="22" y2="12" />
													<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
												</svg>
												<span className="text-[9px] font-bold tracking-widest uppercase text-surgent-text-3">
													Ports
												</span>
												<span className="text-[10px] text-surgent-accent">
													2
												</span>
											</div>
											<div className="group flex w-full items-center gap-2 rounded-md px-2 py-1 hover:bg-surgent-surface">
												<svg
													width="6"
													height="6"
													viewBox="0 0 8 8"
													fill="currentColor"
													className="text-surgent-accent shrink-0"
												>
													<circle cx="4" cy="4" r="4" />
												</svg>
												<p className="truncate text-[10px] font-medium text-surgent-text">
													:3000
												</p>
											</div>
											<div className="group flex w-full items-center gap-2 rounded-md px-2 py-1 hover:bg-surgent-surface">
												<svg
													width="6"
													height="6"
													viewBox="0 0 8 8"
													fill="currentColor"
													className="text-surgent-accent shrink-0"
												>
													<circle cx="4" cy="4" r="4" />
												</svg>
												<p className="truncate text-[10px] font-medium text-surgent-text">
													:5432
												</p>
											</div>
										</div>
									</div>
								</div>
							</div>
						) : (
							/* Experimental Content */
							<div className="relative flex-1 flex overflow-hidden">
								{/* Chat Panel - hidden in zen mode */}
								{!zenMode && (
									<section className="w-[320px] shrink-0 flex min-h-0 flex-col border-r border-surgent-border">
										<ChatPanel chat={experimentalChat} />
									</section>
								)}

								{/* Diff Viewer + File Sidebar */}
								<aside className="flex-1 min-h-0 min-w-0 bg-black flex">
									{/* Diff Viewer */}
									<div className="flex-1 min-h-0 min-w-0 overflow-auto bg-black">
										{diffRows.map((row, i) => (
											<div key={i} className="flex">
												{/* Left Pane - Before */}
												<div className="flex-1 min-w-0">
													<DiffLine
														lineNum={row.left.num}
														content={row.left.content}
														type={row.left.type}
													/>
												</div>
												{/* Divider */}
												<div className="w-px shrink-0 bg-surgent-border"></div>
												{/* Right Pane - After */}
												<div className="flex-1 min-w-0">
													<DiffLine
														lineNum={row.right.num}
														content={row.right.content}
														type={row.right.type}
													/>
												</div>
											</div>
										))}
									</div>

									{/* File Sidebar */}
									<FileSidebar
										selectedFile={selectedFile}
										onSelectFile={setSelectedFile}
									/>
								</aside>

								{/* Zen Mode Floating Input */}
								{zenMode && (
									<div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4">
										<div className="relative flex flex-col rounded-xl border border-surgent-border bg-surgent-surface/95 backdrop-blur-sm shadow-2xl overflow-visible">
											{/* Status bar */}
											<div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-surgent-border/50 rounded-t-xl">
												<div className="flex items-center gap-2 min-w-0 flex-1">
													<span className="text-surgent-success animate-pulse">
														<EditIcon />
													</span>
													<span className="text-[11px] text-surgent-text truncate">
														Editing {selectedFile}
													</span>
													<span className="shrink-0 text-[9px] text-surgent-accent bg-surgent-accent/10 px-1.5 py-0.5 rounded-full tabular-nums">
														+2
													</span>
												</div>
												<button className="shrink-0 flex items-center gap-1.5 h-6 px-2 rounded-md text-[10px] font-medium bg-surgent-surface-2 text-surgent-text-2 hover:bg-surgent-surface-3 border border-surgent-border">
													<svg
														className="w-3 h-3"
														viewBox="0 0 24 24"
														fill="currentColor"
													>
														<rect x="6" y="6" width="12" height="12" rx="1" />
													</svg>
													Stop
												</button>
											</div>
											{/* Input */}
											<div className="flex items-center gap-3 px-3 py-2.5">
												<input
													type="text"
													placeholder="Message Claude..."
													className="flex-1 bg-transparent text-[13px] text-surgent-text outline-none placeholder:text-surgent-text-3"
												/>
												<button className="shrink-0 w-6 h-6 flex items-center justify-center rounded bg-surgent-accent/20 text-surgent-accent">
													<svg
														width="12"
														height="12"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														strokeWidth="2"
													>
														<line x1="22" y1="2" x2="11" y2="13" />
														<polygon points="22 2 15 22 11 13 2 9 22 2" />
													</svg>
												</button>
											</div>
										</div>
									</div>
								)}
							</div>
						)}
					</div>
				</div>
			</div>
		</section>
	);
}

export default Inferay;
