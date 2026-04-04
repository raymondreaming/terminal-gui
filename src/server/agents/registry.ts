import type { ChatAgentKind } from "../../lib/agents.ts";
import { claudeAdapter } from "./adapters/claude.ts";
import { codexAdapter } from "./adapters/codex.ts";
import type { AgentAdapter } from "./types.ts";

const adapters: Record<ChatAgentKind, AgentAdapter<any>> = {
	claude: claudeAdapter,
	codex: codexAdapter,
};

export function getAgentAdapter(kind: ChatAgentKind): AgentAdapter<any> {
	return adapters[kind];
}
