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

function basename(value: string): string {
	return value.split("/").pop() || value;
}

function trimSummary(value: string, max = 40): string {
	return value.length > max ? `${value.slice(0, max)}...` : value;
}

export function normalizeToolName(toolName: string): string {
	const name = toolName.trim().toLowerCase();
	if (name.startsWith("mcp__")) {
		const parts = name.split("__").filter(Boolean);
		return parts[parts.length - 1] || "mcp_tool";
	}
	if (name === "exec_command") return "exec";
	if (name === "websearch") return "web_search";
	if (name === "read_file" || name === "view") return "read";
	if (name === "apply_patch") return "patch";
	return name;
}

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

function extractToolSummary(content: string): string {
	if (!content) return "";
	try {
		const parsed = JSON.parse(content);
		if (parsed.file_path) {
			return basename(parsed.file_path);
		}
		if (parsed.path) {
			return basename(parsed.path);
		}
		if (parsed.file) {
			return basename(parsed.file);
		}
		if (Array.isArray(parsed.files) && parsed.files.length > 0) {
			const first = String(parsed.files[0] ?? "");
			return parsed.files.length === 1
				? basename(first)
				: `${basename(first)} +${parsed.files.length - 1}`;
		}
		if (Array.isArray(parsed.changes) && parsed.changes.length > 0) {
			const first = parsed.changes[0];
			const firstFile =
				typeof first === "string"
					? first
					: (first?.file_path ?? first?.path ?? first?.file ?? "");
			if (firstFile) {
				return parsed.changes.length === 1
					? basename(firstFile)
					: `${basename(firstFile)} +${parsed.changes.length - 1}`;
			}
			return `${parsed.changes.length} changes`;
		}
		if (parsed.command) {
			return trimSummary(parsed.command);
		}
		if (parsed.cmd) {
			return trimSummary(parsed.cmd);
		}
		if (parsed.pattern) return `/${parsed.pattern.slice(0, 30)}/`;
		if (parsed.query) return parsed.query.slice(0, 40);
		if (parsed.invocation?.tool) {
			return normalizeToolName(parsed.invocation.tool);
		}
		if (parsed.tool) {
			return normalizeToolName(parsed.tool);
		}
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
		const toolName = normalizeToolName(msg.toolName);
		const summary = extractToolSummary(msg.content) || toolName;
		activities.push({
			id: msg.id,
			toolName,
			isStreaming: msg.isStreaming ?? false,
			summary,
		});
	}
	return activities;
}

export function getStatusToolName(status: string): string | null {
	return status.startsWith("tool:") ? normalizeToolName(status.slice(5)) : null;
}
