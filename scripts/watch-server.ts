/**
 * Watches server-side sources and the Bun entrypoint for .ts changes and
 * restarts the electrobun dev process when they change.
 */
import { existsSync, watch } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const ELECTROBUN =
	Bun.which("electrobun", {
		PATH: `./node_modules/electrobun/.cache:./node_modules/.bin`,
	}) ?? "./node_modules/.bin/electrobun";

const watchTargets = [
	{ path: resolve(ROOT, "src/server"), recursive: true },
	{ path: resolve(ROOT, "src/lib"), recursive: true },
	{ path: resolve(ROOT, "src/index.ts"), recursive: false },
].filter((target) => existsSync(target.path));

let child: ReturnType<typeof spawn> | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;

function startApp() {
	if (child) {
		child.kill("SIGTERM");
		child = null;
	}
	child = spawn(ELECTROBUN, ["dev"], {
		stdio: "inherit",
		env: { ...process.env, TERMINAL_GUI_APP_ROOT: ROOT },
	});
	child.on("exit", (code) => {
		if (child?.killed) return;
		child = null;
	});
}

for (const target of watchTargets) {
	watch(target.path, { recursive: target.recursive }, (_event, filename) => {
		if (!filename?.endsWith(".ts")) return;
		if (debounce) clearTimeout(debounce);
		debounce = setTimeout(startApp, 300);
	});
}

startApp();

process.on("SIGTERM", () => child?.kill("SIGTERM"));
process.on("SIGINT", () => {
	child?.kill("SIGTERM");
	process.exit(0);
});
