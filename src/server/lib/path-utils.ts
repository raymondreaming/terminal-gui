import { existsSync } from "node:fs";
import { resolve } from "node:path";

function resolveProjectRoot(): string {
	if (process.env.TERMINAL_GUI_APP_ROOT) {
		return process.env.TERMINAL_GUI_APP_ROOT;
	}
	// In Electrobun bundle: import.meta.dir = app/bun/, parent = app/
	const bundleRoot = resolve(import.meta.dir, "..");
	if (existsSync(resolve(bundleRoot, "views"))) {
		return bundleRoot;
	}
	// Dev: import.meta.dir = src/server/lib/, go up 3 levels
	return resolve(import.meta.dir, "../../..");
}

export const PROJECT_ROOT = resolveProjectRoot();
