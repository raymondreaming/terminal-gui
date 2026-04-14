import type { ChatAgentKind } from "../../lib/agents.ts";

export interface SessionUsage {
	contextTokens: number;
	contextLimit: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCostUsd: number;
	numTurns: number;
	durationMs: number;
}

export interface AgentRunContext {
	readonly paneId: string;
	readonly cwd: string;
	readonly systemPrompt: string | null;
	readonly referencePaths: string[];
	getSessionId(): string | null;
	updateSessionId(nextSessionId: string): void;
	emitChatEvent(event: unknown): void;
	emitStatus(status: string, isLoading?: boolean): void;
	emitSystemMessage(message: string): void;
	emitUsage(usage: SessionUsage): void;
}

export interface AgentHandle {
	run(): Promise<void>;
	stop(): void;
	kill(): void;
}

export interface AgentAdapter<State = unknown> {
	readonly kind: ChatAgentKind;
	readonly displayName: string;
	createState(ctx: AgentRunContext): State;
	createHandle(prompt: string, ctx: AgentRunContext, state: State): AgentHandle;
}
