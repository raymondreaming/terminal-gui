import type { AgentKind } from "../../lib/terminal-utils.ts";

export interface AgentChatSession {
	paneId: string;
	cwd?: string;
	agentKind: AgentKind;
}

export interface QueuedMessageInfo {
	id: string;
	text: string;
	displayText: string;
	images?: string[];
}

export interface AttachedImageInfo {
	name: string;
	path: string;
	previewUrl: string;
}

export interface ChatMessage {
	id: string;
	role: "user" | "assistant" | "tool" | "system" | "btw";
	content: string;
	toolName?: string;
	isStreaming?: boolean;
	btwQuestion?: string;
	images?: string[];
}

export interface CheckpointInfo {
	id: string;
	timestamp: number;
	changedFileCount: number;
	changedFiles: { path: string; action: "created" | "modified" | "deleted" }[];
	reverted: boolean;
	afterMessageId: string | null;
}

export interface SlashCommand {
	id?: string;
	name: string;
	description: string;
	action: "local" | "send";
	promptTemplate?: string;
	category?: string;
	isLocalCommand?: boolean;
	isFromLibrary?: boolean;
}

const MAX_MESSAGES = 80;
const MAX_TOTAL_CHARS = 150000;

let msgId = 0;

export function nextId() {
	return `c${++msgId}-${Date.now().toString(36)}`;
}

export function trimMessages(msgs: ChatMessage[]): ChatMessage[] {
	if (msgs.length <= MAX_MESSAGES) return msgs;
	let trimmed = msgs.slice(-MAX_MESSAGES);
	if (trimmed.length > 50) {
		let totalChars = trimmed.reduce(
			(sum, message) => sum + message.content.length,
			0
		);
		while (totalChars > MAX_TOTAL_CHARS && trimmed.length > 1) {
			totalChars -= trimmed[0]?.content.length ?? 0;
			trimmed = trimmed.slice(1);
		}
	}

	return trimmed;
}

export function addMessage(
	msgs: ChatMessage[],
	msg: ChatMessage
): ChatMessage[] {
	return [...msgs, msg];
}
