import type { Subprocess } from "bun";
import type { ChatAgentKind } from "../../lib/agents.ts";

export interface AgentRunContext {
	readonly paneId: string;
	readonly cwd: string;
	getSessionId(): string | null;
	updateSessionId(nextSessionId: string): void;
	emitChatEvent(event: unknown): void;
	emitStatus(status: string, isLoading?: boolean): void;
	emitSystemMessage(message: string): void;
}

export interface AgentFinalizeInput<State> {
	readonly state: State;
	readonly ctx: AgentRunContext;
	readonly exitCode: number;
	readonly stderrText: string;
}

export interface AgentAdapter<State = unknown> {
	readonly kind: ChatAgentKind;
	readonly displayName: string;
	createState(ctx: AgentRunContext): State;
	spawn(prompt: string, ctx: AgentRunContext, state: State): Subprocess;
	handleEvent(event: any, ctx: AgentRunContext, state: State): void;
	finalize(input: AgentFinalizeInput<State>): Promise<void>;
	stop(proc: Subprocess): void;
}
