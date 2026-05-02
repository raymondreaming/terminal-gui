#!/usr/bin/env bun

import { mkdir, rm } from "node:fs/promises";
import { createStylexBunPlugin } from "@stylexjs/unplugin/bun";

const distDir = "dist";
const stylexCssPath = `${distDir}/stylex.css`;

await rm(distDir, { recursive: true, force: true });
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
	splitting: true,
	sourcemap: "external",
	minify: false,
	plugins: [
		createStylexBunPlugin({
			bunDevCssOutput: stylexCssPath,
			importSources: ["@stylexjs/stylex"],
			useCSSLayers: true,
		}),
	],
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
const stylexCssFile = Bun.file(stylexCssPath);
const stylexCss = (await stylexCssFile.exists())
	? await stylexCssFile.text()
	: "";

await Bun.write(
	`${distDir}/index.html`,
	template
		.replace("__INLINE_APP_CSS__", `${css}\n${stylexCss}`)
		.replace("./index.js", "./main.js")
);
