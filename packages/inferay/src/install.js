import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { getChannel } from "./config.js";
import {
	defaultInstallPath,
	findExistingApp,
	platformInfo,
} from "./platform.js";
import { downloadAsset, fetchRelease, findAsset } from "./releases.js";
import { openFile } from "./launch.js";

async function copyAppBundle(source, destination = defaultInstallPath()) {
	if (!source.endsWith(".app")) {
		throw new Error("local install source must be a .app bundle");
	}
	await mkdir(dirname(destination), { recursive: true });
	await cp(source, destination, { recursive: true, force: true });
	return destination;
}

export async function install({ local, launch = true } = {}) {
	const platform = platformInfo();
	if (!platform.supported) {
		throw new Error(`unsupported platform ${platform.os}-${platform.cpu}`);
	}

	if (local) {
		const source = resolve(local);
		if (!existsSync(source)) {
			throw new Error(`local app not found: ${source}`);
		}
		const destination = await copyAppBundle(source);
		return {
			kind: "local-app",
			message: `Installed ${basename(source)} to ${destination}`,
			installedPath: destination,
		};
	}

	const existing = findExistingApp();
	if (existing) {
		return {
			kind: "already-installed",
			message: `Inferay is already available at ${existing}`,
			installedPath: existing,
		};
	}

	const channel = await getChannel();
	const release = await fetchRelease(channel);
	const asset = findAsset(release, platform);
	if (!asset) {
		throw new Error(
			`no ${platform.target} release asset found for ${release.tag_name || channel}`
		);
	}

	const downloadedPath = await downloadAsset(asset);
	if (downloadedPath.endsWith(".dmg")) {
		if (launch) {
			await openFile(downloadedPath);
		}
		return {
			kind: "dmg",
			message: `Downloaded ${asset.name}. Drag Inferay to Applications from the opened DMG.`,
			downloadedPath,
		};
	}

	return {
		kind: "downloaded",
		message: `Downloaded ${asset.name} to ${downloadedPath}`,
		downloadedPath,
	};
}
