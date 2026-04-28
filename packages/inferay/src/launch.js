import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
	defaultInstallPath,
	findExistingApp,
	platformInfo,
} from "./platform.js";

function run(command, args) {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(command, args, { stdio: "inherit" });
		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) {
				resolvePromise();
			} else {
				reject(new Error(`${command} exited with code ${code}`));
			}
		});
	});
}

export async function launchApp(targetPath = process.cwd()) {
	const platform = platformInfo();
	if (platform.os !== "macos") {
		throw new Error("launch is currently supported on macOS only");
	}
	const appPath = findExistingApp() || defaultInstallPath();
	if (!existsSync(appPath)) {
		throw new Error("Inferay is not installed. Run `inferay install` first.");
	}
	const cwd = resolve(targetPath);
	await run("open", ["-a", appPath, "--args", "--cwd", cwd]);
}

export async function openFile(filePath) {
	await run("open", [filePath]);
}
