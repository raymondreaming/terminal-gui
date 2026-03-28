export function readStoredJson<T>(key: string, fallback: T): T {
	try {
		const stored = localStorage.getItem(key);
		return stored ? (JSON.parse(stored) as T) : fallback;
	} catch {
		return fallback;
	}
}

export function writeStoredJson<T>(key: string, value: T) {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// Ignore storage write failures.
	}
}

export function readStoredValue(
	key: string,
	fallback: string | null = null
): string | null {
	try {
		return localStorage.getItem(key) ?? fallback;
	} catch {
		return fallback;
	}
}

export function writeStoredValue(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Ignore storage write failures.
	}
}

export function readStoredBoolean(key: string, fallback = false): boolean {
	const stored = readStoredValue(key);
	if (stored === null) return fallback;
	return stored === "true";
}
