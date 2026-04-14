import { useCallback, useRef } from "react";
import {
	computeLineDiff,
	type DiffCacheEntry,
	type DiffWorkerMessage,
	type DiffWorkerResponse,
	type ParsedDiff,
} from "../services/diff-worker";

// Global cache for when worker isn't available
const fallbackCache = new Map<string, Map<string, DiffCacheEntry>>();

// Singleton worker instance
let workerInstance: Worker | null = null;
const pendingCallbacks = new Map<
	string,
	(response: DiffWorkerResponse) => void
>();

function getWorker(): Worker | null {
	if (workerInstance) return workerInstance;

	try {
		// Try to create worker
		workerInstance = new Worker(
			new URL("../services/diff-worker.ts", import.meta.url),
			{ type: "module" }
		);

		workerInstance.onmessage = (e: MessageEvent<DiffWorkerResponse>) => {
			const key = `${e.data.type}:${(e.data as any).chatId ?? ""}:${(e.data as any).filePath ?? ""}`;
			const callback = pendingCallbacks.get(key);
			if (callback) {
				callback(e.data);
				pendingCallbacks.delete(key);
			}
		};

		workerInstance.onerror = (e) => {
			workerInstance = null;
		};
		return workerInstance;
	} catch {
		return null;
	}
}

function postToWorker(msg: DiffWorkerMessage): Promise<DiffWorkerResponse> {
	return new Promise((resolve) => {
		const worker = getWorker();

		if (!worker) {
			// Fallback to synchronous handling
			const response = handleMessageSync(msg);
			resolve(response);
			return;
		}

		const key = `${msg.type}:${(msg as any).chatId ?? ""}:${(msg as any).filePath ?? ""}`;
		pendingCallbacks.set(key, resolve);
		worker.postMessage(msg);

		// Timeout fallback
		setTimeout(() => {
			if (pendingCallbacks.has(key)) {
				pendingCallbacks.delete(key);
				const response = handleMessageSync(msg);
				resolve(response);
			}
		}, 5000);
	});
}

// Synchronous fallback
function handleMessageSync(msg: DiffWorkerMessage): DiffWorkerResponse {
	switch (msg.type) {
		case "compute": {
			const { chatId, filePath, before, after } = msg;
			const parsedDiff = computeLineDiff(before, after);

			if (!fallbackCache.has(chatId)) {
				fallbackCache.set(chatId, new Map());
			}
			fallbackCache.get(chatId)!.set(filePath, {
				before,
				after,
				filePath,
				parsedDiff,
			});

			return { type: "computed", chatId, filePath, diff: parsedDiff };
		}

		case "get": {
			const { chatId, filePath } = msg;
			const entry = fallbackCache.get(chatId)?.get(filePath) ?? null;
			return { type: "cached", chatId, filePath, entry };
		}

		case "clear": {
			fallbackCache.delete(msg.chatId);
			return { type: "cleared", chatId: msg.chatId };
		}

		case "clearAll": {
			fallbackCache.clear();
			return { type: "clearedAll" };
		}
	}
}

export interface UseDiffCacheOptions {
	chatId: string;
}

export interface DiffCacheAPI {
	computeDiff: (
		filePath: string,
		before: string,
		after: string
	) => Promise<ParsedDiff>;
	getCachedDiff: (filePath: string) => Promise<DiffCacheEntry | null>;
	getCachedDiffSync: (filePath: string) => DiffCacheEntry | null;
	clearCache: () => void;
	hasCachedDiff: (filePath: string) => boolean;
}

export function useDiffCache({ chatId }: UseDiffCacheOptions): DiffCacheAPI {
	const localCacheRef = useRef<Map<string, DiffCacheEntry>>(new Map());

	const computeDiff = useCallback(
		async (
			filePath: string,
			before: string,
			after: string
		): Promise<ParsedDiff> => {
			const response = await postToWorker({
				type: "compute",
				chatId,
				filePath,
				before,
				after,
			});

			if (response.type === "computed") {
				// Update local ref for sync access
				localCacheRef.current.set(filePath, {
					before,
					after,
					filePath,
					parsedDiff: response.diff,
				});
				return response.diff;
			}

			throw new Error("Unexpected response from diff worker");
		},
		[chatId]
	);

	const getCachedDiff = useCallback(
		async (filePath: string): Promise<DiffCacheEntry | null> => {
			// Check local ref first
			const local = localCacheRef.current.get(filePath);
			if (local) return local;

			const response = await postToWorker({
				type: "get",
				chatId,
				filePath,
			});

			if (response.type === "cached") {
				if (response.entry) {
					localCacheRef.current.set(filePath, response.entry);
				}
				return response.entry;
			}

			return null;
		},
		[chatId]
	);

	const getCachedDiffSync = useCallback(
		(filePath: string): DiffCacheEntry | null => {
			return (
				localCacheRef.current.get(filePath) ??
				fallbackCache.get(chatId)?.get(filePath) ??
				null
			);
		},
		[chatId]
	);

	const clearCache = useCallback(() => {
		localCacheRef.current.clear();
		postToWorker({ type: "clear", chatId });
	}, [chatId]);

	const hasCachedDiff = useCallback(
		(filePath: string): boolean => {
			return (
				localCacheRef.current.has(filePath) ||
				(fallbackCache.get(chatId)?.has(filePath) ?? false)
			);
		},
		[chatId]
	);

	return {
		computeDiff,
		getCachedDiff,
		getCachedDiffSync,
		clearCache,
		hasCachedDiff,
	};
}

// Export for direct usage
export { computeLineDiff };
