const STORAGE_KEY_PREFIX = "inferay-chat-";
const SESSION_KEY_PREFIX = "inferay-chat-session-";
const INPUT_KEY_PREFIX = "inferay-chat-input-";
const CHECKPOINT_KEY_PREFIX = "inferay-checkpoints-";
const MODEL_KEY_PREFIX = "inferay-chat-model-";
const REASONING_KEY_PREFIX = "inferay-chat-reasoning-";
const PENDING_SEND_KEY_PREFIX = "inferay-chat-pending-send-";
const SUMMARY_KEY_PREFIX = "inferay-chat-summary-";
const PENDING_WORKSPACE_KEY_PREFIX = "inferay-chat-pending-workspace-";

export function loadStoredMessages<T>(paneId: string): T[] {
	try {
		const saved = localStorage.getItem(STORAGE_KEY_PREFIX + paneId);
		if (!saved) return [];
		return JSON.parse(saved) as T[];
	} catch {
		return [];
	}
}

export function saveStoredMessages<T>(paneId: string, messages: T[]) {
	try {
		localStorage.setItem(STORAGE_KEY_PREFIX + paneId, JSON.stringify(messages));
	} catch {}
}

export function loadStoredInput(paneId: string): string {
	try {
		return localStorage.getItem(INPUT_KEY_PREFIX + paneId) ?? "";
	} catch {
		return "";
	}
}

export function saveStoredInput(paneId: string, value: string) {
	try {
		if (value) localStorage.setItem(INPUT_KEY_PREFIX + paneId, value);
		else localStorage.removeItem(INPUT_KEY_PREFIX + paneId);
	} catch {}
}

export function loadPendingSend(paneId: string): string {
	try {
		return localStorage.getItem(PENDING_SEND_KEY_PREFIX + paneId) ?? "";
	} catch {
		return "";
	}
}

export function savePendingSend(paneId: string, value: string) {
	try {
		if (value) localStorage.setItem(PENDING_SEND_KEY_PREFIX + paneId, value);
		else localStorage.removeItem(PENDING_SEND_KEY_PREFIX + paneId);
	} catch {}
}

export function clearPendingSend(paneId: string) {
	try {
		localStorage.removeItem(PENDING_SEND_KEY_PREFIX + paneId);
	} catch {}
}

export function loadStoredCheckpoints<T>(paneId: string): T[] {
	try {
		const stored = localStorage.getItem(CHECKPOINT_KEY_PREFIX + paneId);
		return stored ? (JSON.parse(stored) as T[]) : [];
	} catch {
		return [];
	}
}

export function saveStoredCheckpoints<T>(paneId: string, checkpoints: T[]) {
	try {
		localStorage.setItem(
			CHECKPOINT_KEY_PREFIX + paneId,
			JSON.stringify(checkpoints)
		);
	} catch {}
}

export function clearStoredCheckpoints(paneId: string) {
	try {
		localStorage.removeItem(CHECKPOINT_KEY_PREFIX + paneId);
	} catch {}
}

export function loadStoredSessionId(paneId: string): string | null {
	try {
		return localStorage.getItem(SESSION_KEY_PREFIX + paneId);
	} catch {
		return null;
	}
}

export function saveStoredSessionId(paneId: string, sessionId: string) {
	try {
		localStorage.setItem(SESSION_KEY_PREFIX + paneId, sessionId);
	} catch {}
}

export function clearStoredSessionId(paneId: string) {
	try {
		localStorage.removeItem(SESSION_KEY_PREFIX + paneId);
	} catch {}
}

export function loadStoredModel(paneId: string): string | null {
	try {
		return localStorage.getItem(MODEL_KEY_PREFIX + paneId);
	} catch {
		return null;
	}
}

export function saveStoredModel(paneId: string, modelId: string) {
	try {
		localStorage.setItem(MODEL_KEY_PREFIX + paneId, modelId);
	} catch {}
}

export function loadStoredReasoningLevel(paneId: string): string | null {
	try {
		return localStorage.getItem(REASONING_KEY_PREFIX + paneId);
	} catch {
		return null;
	}
}

export function saveStoredReasoningLevel(
	paneId: string,
	reasoningLevel: string
) {
	try {
		localStorage.setItem(REASONING_KEY_PREFIX + paneId, reasoningLevel);
	} catch {}
}

export function loadStoredSummary(paneId: string): string | null {
	try {
		return localStorage.getItem(SUMMARY_KEY_PREFIX + paneId);
	} catch {
		return null;
	}
}

export function saveStoredSummary(paneId: string, summary: string) {
	try {
		localStorage.setItem(SUMMARY_KEY_PREFIX + paneId, summary);
	} catch {}
}

export function loadPendingWorkspacePaths(paneId: string): string[] {
	try {
		const raw = localStorage.getItem(PENDING_WORKSPACE_KEY_PREFIX + paneId);
		const parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed)
			? parsed.filter((path): path is string => typeof path === "string")
			: [];
	} catch {
		return [];
	}
}

export function savePendingWorkspacePaths(paneId: string, paths: string[]) {
	try {
		if (paths.length === 0) {
			localStorage.removeItem(PENDING_WORKSPACE_KEY_PREFIX + paneId);
		} else {
			localStorage.setItem(
				PENDING_WORKSPACE_KEY_PREFIX + paneId,
				JSON.stringify(paths)
			);
		}
	} catch {}
}

export function clearAgentChatMessages(paneId: string) {
	try {
		localStorage.removeItem(STORAGE_KEY_PREFIX + paneId);
		localStorage.removeItem(SESSION_KEY_PREFIX + paneId);
		localStorage.removeItem(INPUT_KEY_PREFIX + paneId);
		localStorage.removeItem(SUMMARY_KEY_PREFIX + paneId);
		localStorage.removeItem(PENDING_WORKSPACE_KEY_PREFIX + paneId);
	} catch {}
}
