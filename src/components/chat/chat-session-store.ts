const STORAGE_KEY_PREFIX = "inferay-chat-";
const SESSION_KEY_PREFIX = "inferay-chat-session-";
const INPUT_KEY_PREFIX = "inferay-chat-input-";
const CHECKPOINT_KEY_PREFIX = "inferay-checkpoints-";

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

export function clearAgentChatMessages(paneId: string) {
	try {
		localStorage.removeItem(STORAGE_KEY_PREFIX + paneId);
		localStorage.removeItem(SESSION_KEY_PREFIX + paneId);
		localStorage.removeItem(INPUT_KEY_PREFIX + paneId);
	} catch {}
}
