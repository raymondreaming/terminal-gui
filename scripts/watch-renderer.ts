#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { existsSync, watch } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const watchTargets = [
	{ path: resolve(ROOT, "src"), recursive: true },
	{ path: resolve(ROOT, "scripts", "build-renderer.ts"), recursive: false },
].filter((target) => existsSync(target.path));

let debounce: ReturnType<typeof setTimeout> | null = null;
let building = false;
let pending = false;

function isRendererFile(filename: string | null | undefined) {
	if (!filename) return false;
	return /\.(css|html|ts|tsx)$/.test(filename);
}

function runBuild(): Promise<number> {
	return new Promise((resolve) => {
		const proc = spawn("bun", ["scripts/build-renderer.ts"], {
			cwd: ROOT,
			stdio: "inherit",
		});
		proc.on("exit", (code) => resolve(code ?? 0));
		proc.on("error", () => resolve(1));
	});
}

async function buildQueued() {
	if (building) {
		pending = true;
		return;
	}
	building = true;
	try {
		do {
			pending = false;
			await runBuild();
		} while (pending);
	} finally {
		building = false;
	}
}

for (const target of watchTargets) {
	watch(target.path, { recursive: target.recursive }, (_event, filename) => {
		if (!isRendererFile(filename)) return;
		if (debounce) clearTimeout(debounce);
		debounce = setTimeout(() => {
			void buildQueued();
		}, 120);
	});
}

process.stdin.resume();
