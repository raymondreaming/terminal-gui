import { existsSync } from "fs";
import { delimiter, dirname, join, resolve } from "path";
import type { AgentKind, ChatAgentKind } from "../../lib/agents.ts";

// ── Claude binary resolution ──

const isWin = process.platform === "win32";

function withExecutableExtension(pathname: string): string {
	if (!isWin || pathname.endsWith(".cmd") || pathname.endsWith(".exe")) {
		return pathname;
	}
	return `${pathname}.cmd`;
}

function getClaudePathCandidates(): string[] {
	const home = process.env.HOME;
	const candidates = [
		process.env.CLAUDE_PATH,
		home ? join(home, ".bun", "bin", "claude") : null,
		"/usr/local/bin/claude",
		"/opt/homebrew/bin/claude",
	];

	return candidates
		.filter((candidate): candidate is string => Boolean(candidate))
		.map(withExecutableExtension);
}

export function resolveClaudeBinary(): string {
	for (const candidate of getClaudePathCandidates()) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}
	return isWin ? "claude.cmd" : "claude";
}

export function createClaudeEnv(): Record<string, string> {
	const env = { ...process.env } as Record<string, string>;
	delete env.CLAUDECODE;

	const pathEntries = (env.PATH || "").split(delimiter).filter(Boolean);
	for (const candidate of getClaudePathCandidates()) {
		const candidateDir = dirname(candidate);
		if (candidateDir && !pathEntries.includes(candidateDir)) {
			pathEntries.unshift(candidateDir);
		}
	}
	if (pathEntries.length > 0) {
		env.PATH = pathEntries.join(delimiter);
	}

	return env;
}

// ── Interactive agent command resolution ──

const availabilityCache: Partial<Record<ChatAgentKind, boolean>> = {};

async function hasCli(kind: ChatAgentKind): Promise<boolean> {
	const cached = availabilityCache[kind];
	if (cached != null) return cached;
	const findCmd = isWin ? "where" : "which";
	const binary = kind === "claude" ? "claude" : "codex";
	try {
		await Bun.$`${findCmd} ${binary}`.quiet();
		availabilityCache[kind] = true;
	} catch {
		availabilityCache[kind] = false;
	}
	return availabilityCache[kind]!;
}

export async function resolveInteractiveAgentCommand(
	kind: AgentKind,
	projectRoot: string
): Promise<{ ok: true; cmd: string[] } | { ok: false; error: string }> {
	const userShell = isWin
		? process.env.COMSPEC || "cmd.exe"
		: process.env.SHELL || "/bin/zsh";

	if (kind === "terminal") {
		return { ok: true, cmd: isWin ? [userShell] : [userShell, "-l"] };
	}

	if (kind === "claude") {
		const available = await hasCli("claude");
		return {
			ok: true,
			cmd: available
				? [resolveClaudeBinary(), "--dangerously-skip-permissions"]
				: [
						process.execPath,
						"run",
						resolve(projectRoot, "scripts/claude-repl.ts"),
					],
		};
	}

	const available = await hasCli("codex");
	if (!available) {
		return { ok: false, error: "Codex CLI not found in PATH" };
	}

	return {
		ok: true,
		cmd: [
			isWin ? "codex.cmd" : "codex",
			"--dangerously-bypass-approvals-and-sandbox",
		],
	};
}
