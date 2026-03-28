import { resolve } from "path";
import type { AgentKind, ChatAgentKind } from "../../lib/agents.ts";

const isWin = process.platform === "win32";

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
				? [isWin ? "claude.cmd" : "claude", "--dangerously-skip-permissions"]
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
