#!/usr/bin/env bun

import { mkdir } from "node:fs/promises";

const distDir = "dist";

await mkdir(distDir, { recursive: true });

const cssProc = Bun.spawn(
	[
		"./node_modules/.bin/tailwindcss",
		"-i",
		"src/index.css",
		"-o",
		`${distDir}/index.css`,
	],
	{
		stdout: "inherit",
		stderr: "inherit",
	}
);

const jsBuild = await Bun.build({
	entrypoints: ["src/main.tsx"],
	outdir: distDir,
	target: "browser",
	format: "esm",
	splitting: false,
	sourcemap: "external",
	minify: false,
});

if (!jsBuild.success) {
	for (const log of jsBuild.logs) {
		console.error(log);
	}
	process.exit(1);
}

const cssExitCode = await cssProc.exited;
if (cssExitCode !== 0) {
	process.exit(cssExitCode);
}

const template = await Bun.file("src/renderer/index.template.html").text();
const css = await Bun.file(`${distDir}/index.css`).text();

await Bun.write(
	`${distDir}/index.html`,
	template.replace("__INLINE_APP_CSS__", css).replace("./index.js", "./main.js")
);
