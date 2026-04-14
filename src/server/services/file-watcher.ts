import { watch, type FSWatcher } from "fs";
import { broadcastAll } from "../ws.ts";

interface WatchedDir {
	watcher: FSWatcher;
	lastEvent: number;
}

const watchedDirs = new Map<string, WatchedDir>();
const DEBOUNCE_MS = 300;

export function watchDirectory(cwd: string): void {
	if (watchedDirs.has(cwd)) return;

	try {
		const watcher = watch(cwd, { recursive: true }, (eventType, filename) => {
			if (!filename) return;
			if (
				filename.startsWith(".") ||
				filename.includes("node_modules") ||
				filename.includes(".git") ||
				filename.startsWith("data/") ||
				filename.endsWith(".json")
			) {
				return;
			}
			if (!filename.match(/\.(ts|tsx|js|jsx|css|html|md)$/)) return;

			const watched = watchedDirs.get(cwd);
			if (!watched) return;

			const now = Date.now();
			if (now - watched.lastEvent < DEBOUNCE_MS) return;
			watched.lastEvent = now;

			broadcastAll(
				JSON.stringify({ type: "file:changed", cwd, file: filename, eventType })
			);
		});

		watchedDirs.set(cwd, { watcher, lastEvent: 0 });
	} catch (err) {
		console.error(`[FileWatcher] Failed to watch ${cwd}:`, err);
	}
}

export function unwatchDirectory(cwd: string): void {
	const watched = watchedDirs.get(cwd);
	if (watched) {
		watched.watcher.close();
		watchedDirs.delete(cwd);
	}
}

export function unwatchAll(): void {
	for (const [cwd] of watchedDirs) {
		unwatchDirectory(cwd);
	}
}
