import type { ChatAgentKind } from "../../features/agents/agents.ts";
import { getAgentDefinition } from "../../features/agents/agents.ts";
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

export function resolveAgentModel(
	agentKind: ChatAgentKind,
	requestedModel?: string
): string | undefined {
	const definition = getAgentDefinition(agentKind);
	if (!definition.models.length) return undefined;
	if (
		requestedModel &&
		definition.models.some((model) => model.id === requestedModel)
	) {
		return requestedModel;
	}
	return definition.defaultModel || definition.models[0]?.id;
}
