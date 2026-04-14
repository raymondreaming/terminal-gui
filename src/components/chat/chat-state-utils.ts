export type ChatStateMessage = {
	id: string;
	role: "user" | "assistant" | "tool" | "system" | "btw";
	content: string;
	isStreaming?: boolean;
};

export function patchMessageById(
	messages: ChatStateMessage[],
	id: string,
	patch:
		| Partial<ChatStateMessage>
		| ((message: ChatStateMessage) => Partial<ChatStateMessage>),
	searchFromEnd = true
): ChatStateMessage[] {
	const updated = messages.slice();
	const start = searchFromEnd ? updated.length - 1 : 0;
	const end = searchFromEnd ? -1 : updated.length;
	const step = searchFromEnd ? -1 : 1;

	for (let i = start; i !== end; i += step) {
		if (updated[i]?.id !== id) continue;
		const nextPatch = typeof patch === "function" ? patch(updated[i]!) : patch;
		updated[i] = { ...updated[i]!, ...nextPatch };
		return updated;
	}

	return messages;
}

export function appendMessageContent(
	messages: ChatStateMessage[],
	id: string,
	content: string
): ChatStateMessage[] {
	return patchMessageById(messages, id, (message) => ({
		content: message.content + content,
	}));
}

export function mergeSyncedMessages(
	localMessages: ChatStateMessage[],
	serverMessages: ChatStateMessage[]
): ChatStateMessage[] {
	const localUserMsgs = localMessages.filter(
		(message) => message.role === "user"
	);
	const serverUserMsgs = serverMessages.filter(
		(message) => message.role === "user"
	);
	const displayTextMap = new Map<number, string>();

	for (let i = 0; i < serverUserMsgs.length && i < localUserMsgs.length; i++) {
		if (localUserMsgs[i]!.content.length < serverUserMsgs[i]!.content.length) {
			displayTextMap.set(i, localUserMsgs[i]!.content);
		}
	}

	let userIdx = 0;
	return serverMessages.map((message) => {
		if (message.role !== "user") return message;
		const displayText = displayTextMap.get(userIdx);
		userIdx++;
		return displayText ? { ...message, content: displayText } : message;
	});
}
