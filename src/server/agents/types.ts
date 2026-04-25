import type { ChatAgentKind } from "../../lib/agents.ts";

export interface AgentRunContext {
	readonly paneId: string;
	readonly cwd: string;
	readonly model?: string;
	getSessionId(): string | null;
	updateSessionId(nextSessionId: string): void;
	emitChatEvent(event: unknown): void;
	emitStatus(status: string, isLoading?: boolean): void;
	emitSystemMessage(message: string): void;
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
