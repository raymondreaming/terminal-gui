import { useCallback } from "react";

import type { ChatAgentKind } from "../lib/agents.ts";

import { fetchJsonOr } from "../lib/fetch-json.ts";

import { usePollingResource } from "./usePollingResource.ts";

export interface AgentSession {
	paneId: string;
	agentKind: ChatAgentKind;
	cwd: string;
	sessionId: string | null;
	isRunning: boolean;
	clientCount: number;
	messageCount: number;
}

export function useAgentSessions(pollInterval = 3000) {
	const fetchSessions = useCallback(async (signal?: AbortSignal) => {
		const data = await fetchJsonOr<{ sessions?: AgentSession[] }>(
			"/api/terminal/agent-sessions",
			{},
			{ signal }
		);
		return data.sessions || [];
	}, []);
	const { data: sessions, refetch } = usePollingResource(
		fetchSessions,
		pollInterval,
		[] as AgentSession[],
		{ deferInitialFetch: true }
	);
	return { sessions, refetch };
}
