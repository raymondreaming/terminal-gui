import { existsSync, readdirSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import type { AgentKind, ChatAgentKind } from "./agents.ts";

const isWin = process.platform === "win32";

function withExecutableExtension(pathname: string): string {
	if (!isWin || pathname.endsWith(".cmd") || pathname.endsWith(".exe")) {
		return pathname;
	}
	return `${pathname}.cmd`;
}

function findInNvmVersions(binaryName: string): string | null {
	const home = process.env.HOME;
	if (!home) return null;
	const versionsDir = join(home, ".nvm", "versions", "node");
	try {
		const versions = readdirSync(versionsDir);
		for (const v of versions.sort().reverse()) {
			const candidate = join(versionsDir, v, "bin", binaryName);
			if (existsSync(candidate)) return candidate;
		}
	} catch {}
	return null;
}

function getClaudePathCandidates(): string[] {
	const home = process.env.HOME;
	const nvmBin = process.env.NVM_BIN;
	const candidates = [
		process.env.CLAUDE_PATH,
		home ? join(home, ".bun", "bin", "claude") : null,
		nvmBin ? join(nvmBin, "claude") : null,
		findInNvmVersions("claude"),
		home ? join(home, ".npm-global", "bin", "claude") : null,
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

function getCodexPathCandidates(): string[] {
	const home = process.env.HOME;
	const candidates = [
		process.env.CODEX_PATH,
		home ? join(home, ".npm-global", "bin", "codex") : null,
		home ? join(home, ".local", "bin", "codex") : null,
		"/usr/local/bin/codex",
		"/opt/homebrew/bin/codex",
	];

	return candidates
		.filter((candidate): candidate is string => Boolean(candidate))
		.map(withExecutableExtension);
}

export function resolveCodexBinary(): string {
	for (const candidate of getCodexPathCandidates()) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}
	return isWin ? "codex.cmd" : "codex";
}

export function createCodexEnv(): Record<string, string> {
	const env = { ...process.env } as Record<string, string>;
	const pathEntries = (env.PATH || "").split(delimiter).filter(Boolean);
	for (const candidate of getCodexPathCandidates()) {
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

const availabilityCache: Partial<Record<ChatAgentKind, boolean>> = {};

async function hasCli(kind: ChatAgentKind): Promise<boolean> {
	const cached = availabilityCache[kind];
	if (cached != null) return cached;

	if (kind === "claude") {
		for (const candidate of getClaudePathCandidates()) {
			if (existsSync(candidate)) {
				availabilityCache[kind] = true;
				return true;
			}
		}
	} else {
		for (const candidate of getCodexPathCandidates()) {
			if (existsSync(candidate)) {
				availabilityCache[kind] = true;
				return true;
			}
		}
	}

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
		return { ok: true, cmd: isWin ? [userShell] : [userShell, "-i"] };
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
		cmd: [resolveCodexBinary(), "--dangerously-bypass-approvals-and-sandbox"],
	};
}
