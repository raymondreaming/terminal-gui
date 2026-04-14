export type ChatToolMessage = {
	id: string;
	role: "user" | "assistant" | "tool" | "system" | "btw";
	content: string;
	toolName?: string;
	isStreaming?: boolean;
};

export type ToolActivity = {
	id: string;
	toolName: string;
	isStreaming: boolean;
	summary: string;
};

export function findTriggerAtCursor(
	value: string,
	cursorPos: number,
	trigger: "/" | "@"
): { index: number; query: string } | null {
	let triggerIdx = -1;
	for (let i = cursorPos - 1; i >= 0; i--) {
		if (value[i] === trigger) {
			if (i === 0 || /\s/.test(value[i - 1]!)) {
				triggerIdx = i;
			}
			break;
		}
		if (/\s/.test(value[i]!)) break;
	}

	if (triggerIdx === -1) return null;
	return {
		index: triggerIdx,
		query: value.slice(triggerIdx + 1, cursorPos),
	};
}

export function extractToolSummary(content: string): string {
	if (!content) return "";
	try {
		const parsed = JSON.parse(content);
		if (parsed.file_path) {
			return parsed.file_path.split("/").pop() || parsed.file_path;
		}
		if (parsed.command) {
			const command = parsed.command.slice(0, 40);
			return `${command}${parsed.command.length > 40 ? "..." : ""}`;
		}
		if (parsed.pattern) return `/${parsed.pattern.slice(0, 30)}/`;
		if (parsed.query) return parsed.query.slice(0, 40);
		if (parsed.url) {
			try {
				return new URL(parsed.url).hostname;
			} catch {
				return parsed.url.slice(0, 40);
			}
		}
		if (parsed.skill) return `/${parsed.skill}`;
		if (parsed.prompt) return parsed.prompt.slice(0, 40);
	} catch {}
	return "";
}

export function extractToolActivities(
	messages: ChatToolMessage[]
): ToolActivity[] {
	const activities: ToolActivity[] = [];
	for (const msg of messages) {
		if (msg.role !== "tool" || !msg.toolName) continue;
		const summary = extractToolSummary(msg.content) || msg.toolName;
		activities.push({
			id: msg.id,
			toolName: msg.toolName,
			isStreaming: msg.isStreaming ?? false,
			summary,
		});
	}
	return activities;
}

export function getStatusToolName(status: string): string | null {
	return status.startsWith("tool:") ? status.slice(5) : null;
}
