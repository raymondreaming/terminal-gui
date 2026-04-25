export type ChatAgentKind = "claude" | "codex";
export type AgentKind = "terminal" | ChatAgentKind;
export type AgentIconKey = "terminal" | "anthropic" | "openai";

export interface NativeSlashCommand {
	readonly name: string;
	readonly description: string;
}

export interface ModelOption {
	readonly id: string;
	readonly label: string;
	readonly detail?: string;
}

export interface AgentDefinition {
	readonly kind: AgentKind;
	readonly label: string;
	readonly paneTitle: string;
	readonly description: string;
	readonly iconKey: AgentIconKey;
	readonly supportsChat: boolean;
	readonly supportsInteractiveTerminal: boolean;
	readonly supportsResume: boolean;
	readonly nativeSlashCommands: readonly NativeSlashCommand[];
	readonly models: readonly ModelOption[];
	readonly defaultModel: string;
}

const CLAUDE_NATIVE_COMMANDS = [
	{
		name: "btw",
		description: "Ask a side question without adding to conversation",
	},
	{ name: "bug", description: "Report bugs or issues" },
	{ name: "compact", description: "Compact conversation history" },
	{ name: "config", description: "Open config panel" },
	{ name: "cost", description: "Show token usage and costs" },
	{ name: "doctor", description: "Check Claude Code health" },
	{ name: "init", description: "Initialize project with CLAUDE.md" },
	{ name: "login", description: "Switch accounts or login" },
	{ name: "logout", description: "Logout from current account" },
	{ name: "memory", description: "Edit CLAUDE.md memory file" },
	{ name: "model", description: "Switch AI model" },
	{ name: "pr-comments", description: "View PR comments" },
	{ name: "review", description: "Review code changes" },
	{ name: "terminal-setup", description: "Setup terminal integration" },
	{ name: "vim", description: "Toggle vim mode" },
] as const satisfies readonly NativeSlashCommand[];

const CLAUDE_MODELS: readonly ModelOption[] = [
	{ id: "claude-opus-4-6", label: "Opus 4.6", detail: "★ Most capable" },
	{ id: "claude-sonnet-4-6", label: "Sonnet 4.6", detail: "Best value" },
	{ id: "claude-haiku-4-5", label: "Haiku 4.5", detail: "Fastest" },
] as const;

const CODEX_MODELS: readonly ModelOption[] = [
	{ id: "o3", label: "o3", detail: "★ Most capable" },
	{ id: "gpt-5.2", label: "GPT-5.2", detail: "Best value" },
	{ id: "o4-mini", label: "o4-mini", detail: "Fastest" },
] as const;

export const AGENT_DEFINITIONS: Record<AgentKind, AgentDefinition> = {
	terminal: {
		kind: "terminal",
		label: "Terminal",
		paneTitle: "Terminal",
		description: "Interactive shell session",
		iconKey: "terminal",
		supportsChat: false,
		supportsInteractiveTerminal: true,
		supportsResume: false,
		nativeSlashCommands: [],
		models: [],
		defaultModel: "",
	},
	claude: {
		kind: "claude",
		label: "Claude",
		paneTitle: "Claude",
		description: "Anthropic Claude Code CLI",
		iconKey: "anthropic",
		supportsChat: true,
		supportsInteractiveTerminal: true,
		supportsResume: true,
		nativeSlashCommands: CLAUDE_NATIVE_COMMANDS,
		models: CLAUDE_MODELS,
		defaultModel: "claude-sonnet-4-6",
	},
	codex: {
		kind: "codex",
		label: "Codex",
		paneTitle: "Codex",
		description: "OpenAI Codex CLI",
		iconKey: "openai",
		supportsChat: true,
		supportsInteractiveTerminal: true,
		supportsResume: true,
		nativeSlashCommands: [],
		models: CODEX_MODELS,
		defaultModel: "o3",
	},
} as const;

export const NEW_PANE_AGENT_KINDS = [
	"terminal",
	"claude",
	"codex",
] as const satisfies readonly AgentKind[];

export function isChatAgentKind(kind: AgentKind): kind is ChatAgentKind {
	return kind === "claude" || kind === "codex";
}

export function getAgentDefinition(kind: AgentKind): AgentDefinition {
	return AGENT_DEFINITIONS[kind];
}
