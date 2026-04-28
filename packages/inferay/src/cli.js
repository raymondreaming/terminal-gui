import { install } from "./install.js";
import { launchApp } from "./launch.js";
import { doctor } from "./doctor.js";
import { getChannel, setChannel } from "./config.js";
import { fetchRelease, findAsset } from "./releases.js";
import { platformInfo } from "./platform.js";

const VERSION = "0.1.0";

function printHelp() {
	console.log(`inferay ${VERSION}

Usage:
  inferay                 Install or launch Inferay
  inferay .               Open the current folder in Inferay
  inferay <path>          Open a folder in Inferay
  inferay install         Install Inferay from the latest release
  inferay install --local <app>
  inferay launch [path]   Launch Inferay with a workspace
  inferay update          Re-run the release installer
  inferay doctor [--dev]  Check local setup
  inferay channel [name]  Show or set release channel
  inferay version         Print CLI version

Channels:
  stable, nightly, dev
`);
}

function optionValue(args, name) {
	const index = args.indexOf(name);
	if (index === -1) {
		return null;
	}
	return args[index + 1] || null;
}

async function printDoctor(args) {
	const checks = await doctor({ dev: args.includes("--dev") });
	for (const [label, value] of checks) {
		console.log(`${label.padEnd(18)} ${value}`);
	}
}

async function update() {
	const channel = await getChannel();
	const release = await fetchRelease(channel);
	const asset = findAsset(release, platformInfo());
	if (!asset) {
		throw new Error(
			`no installable asset found for ${release.tag_name || channel}`
		);
	}
	console.log(
		`Latest ${channel}: ${release.tag_name || release.name || "unknown"}`
	);
	console.log(`Asset: ${asset.name}`);
	console.log("Run `inferay install` to download and open the installer.");
}

async function installAndReport(args) {
	const local = optionValue(args, "--local");
	const result = await install({ local });
	console.log(result.message);
}

export async function main(argv) {
	const args = argv.slice(2);
	const command = args[0];

	if (
		!command ||
		command === "." ||
		(!command.startsWith("-") && !isKnownCommand(command))
	) {
		const target = command || process.cwd();
		try {
			await launchApp(target);
		} catch (error) {
			if (command && command !== ".") {
				throw error;
			}
			const result = await install();
			console.log(result.message);
		}
		return;
	}

	switch (command) {
		case "--help":
		case "-h":
		case "help":
			printHelp();
			return;
		case "--version":
		case "-v":
		case "version":
			console.log(VERSION);
			return;
		case "install":
			await installAndReport(args);
			return;
		case "launch":
			await launchApp(args[1] || process.cwd());
			return;
		case "doctor":
			await printDoctor(args);
			return;
		case "update":
			await update();
			return;
		case "channel":
			if (!args[1]) {
				console.log(await getChannel());
			} else {
				await setChannel(args[1]);
				console.log(`Channel set to ${args[1]}`);
			}
			return;
		default:
			throw new Error(`unknown command "${command}". Run \`inferay --help\`.`);
	}
}

function isKnownCommand(command) {
	return new Set([
		"help",
		"install",
		"launch",
		"doctor",
		"update",
		"channel",
		"version",
	]).has(command);
}
