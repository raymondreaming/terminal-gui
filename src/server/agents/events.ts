export type AgentEvent =
	| {
			type: "session";
			providerSessionId: string;
	  }
	| {
			type: "status";
			status: "thinking" | "responding" | "tool" | "idle" | "error";
			label?: string;
	  }
	| {
			type: "text-delta";
			text: string;
			messageId?: string;
	  }
	| {
			type: "thinking-delta";
			text: string;
			messageId?: string;
	  }
	| {
			type: "tool-call-start";
			toolCallId: string;
			toolName: string;
			input?: unknown;
			summary?: string;
	  }
	| {
			type: "tool-call-delta";
			toolCallId: string;
			delta: string;
	  }
	| {
			type: "tool-call-end";
			toolCallId: string;
			output?: unknown;
			error?: string;
	  }
	| {
			type: "result";
			text: string;
	  }
	| {
			type: "error";
			message: string;
	  }
	| {
			type: "finish";
			reason?: string;
	  }
	| {
			type: "raw";
			provider: "claude" | "codex";
			eventType?: string;
			event: unknown;
	  };

function basename(value: string): string {
	return value.split("/").pop() || value;
}

function trimSummary(value: string, max = 64): string {
	return value.length > max ? `${value.slice(0, max)}...` : value;
}

export function summarizeToolInput(toolName: string, input: unknown): string {
	if (!input || typeof input !== "object") return toolName;
	const payload = input as Record<string, unknown>;
	const command = payload.command ?? payload.cmd;
	if (typeof command === "string" && command) return trimSummary(command);
	const query = payload.query;
	if (typeof query === "string" && query) return trimSummary(query);
	const path = payload.path ?? payload.file ?? payload.file_path;
	if (typeof path === "string" && path) return basename(path);
	const files = payload.files ?? payload.changes;
	if (Array.isArray(files) && files.length > 0) {
		const first = files[0];
		const firstPath =
			typeof first === "string"
				? first
				: typeof first === "object" && first
					? ((first as Record<string, unknown>).path ??
						(first as Record<string, unknown>).file ??
						(first as Record<string, unknown>).file_path)
					: null;
		if (typeof firstPath === "string" && firstPath) {
			return files.length === 1
				? basename(firstPath)
				: `${basename(firstPath)} +${files.length - 1}`;
		}
		return `${files.length} changes`;
	}
	return toolName;
}
