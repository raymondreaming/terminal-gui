/**
 * Watches src/server, src/bun, and src/lib for .ts changes and restarts
 * the electrobun dev process when they change.
 */
import { watch } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const ELECTROBUN =
	Bun.which("electrobun", {
		PATH: `./node_modules/electrobun/.cache:./node_modules/.bin`,
	}) ?? "./node_modules/.bin/electrobun";

const watchDirs = ["src/server", "src/bun", "src/lib"].map((d) =>
	resolve(ROOT, d)
);

let child: ReturnType<typeof spawn> | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;

function startApp() {
	if (child) {
		child.kill("SIGTERM");
		child = null;
	}
	console.log("\x1b[36m[watch-server]\x1b[0m starting electrobun dev...");
	child = spawn(ELECTROBUN, ["dev"], {
		stdio: "inherit",
		env: { ...process.env, TERMINAL_GUI_APP_ROOT: ROOT },
	});
	child.on("exit", (code) => {
		if (child?.killed) return;
		console.log(
			`\x1b[36m[watch-server]\x1b[0m electrobun exited with code ${code}`
		);
		child = null;
	});
}

for (const dir of watchDirs) {
	watch(dir, { recursive: true }, (_event, filename) => {
		if (!filename?.endsWith(".ts")) return;
		if (debounce) clearTimeout(debounce);
		debounce = setTimeout(() => {
			console.log(
				`\x1b[33m[watch-server]\x1b[0m ${filename} changed, restarting...`
			);
			startApp();
		}, 300);
	});
}

startApp();

process.on("SIGTERM", () => child?.kill("SIGTERM"));
process.on("SIGINT", () => {
	child?.kill("SIGTERM");
	process.exit(0);
});
