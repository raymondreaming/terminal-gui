import { exec } from "node:child_process";
import { hostname, homedir, platform } from "node:os";
import { promisify } from "node:util";

const execAsync = promisify(exec);
import { ConfigManager } from "../services/config-manager.ts";

const configManager = new ConfigManager();

export function configRoutes() {
	return {
		"/api/config": {
			GET: async () => {
				const config = await configManager.load();
				return Response.json(config);
			},
			PUT: async (req: Request) => {
				const updates = await req.json();
				const config = await configManager.update(updates);
				return Response.json(config);
			},
		},
		"/api/config/search-folders": {
			GET: async () => {
				const config = await configManager.load();
				const folders = Array.isArray(config.search_folders)
					? config.search_folders
					: [];
				return Response.json({ folders });
			},
			PUT: async (req: Request) => {
				const { folders } = (await req.json()) as { folders: string[] };
				if (!Array.isArray(folders)) {
					return new Response("folders must be an array", { status: 400 });
				}
				const config = await configManager.update({
					search_folders: folders,
				});
				return Response.json({
					folders: config.search_folders,
				});
			},
		},
		"/api/config/pick-folder": {
			POST: async () => {
				try {
					let folderPath: string | null = null;
					if (platform() === "darwin") {
						const { stdout } = await execAsync(
							`osascript -e 'POSIX path of (choose folder with prompt "Select a folder to add")'`,
							{ encoding: "utf-8", timeout: 120000 }
						);
						const trimmed = stdout.trim();
						if (trimmed) folderPath = trimmed;
					} else if (platform() === "win32") {
						const { stdout } = await execAsync(
							`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; if($f.ShowDialog() -eq 'OK'){$f.SelectedPath}"`,
							{ encoding: "utf-8", timeout: 120000 }
						);
						const trimmed = stdout.trim();
						if (trimmed) folderPath = trimmed;
					}
					if (!folderPath) {
						return Response.json({ folder: null });
					}
					// Convert to ~/relative if under home
					const home = homedir();
					const displayPath = folderPath.startsWith(home + "/")
						? "~/" + folderPath.slice(home.length + 1)
						: folderPath;
					// Remove trailing slash
					const cleaned = displayPath.replace(/\/+$/, "");
					return Response.json({ folder: cleaned });
				} catch {
					return Response.json({ folder: null });
				}
			},
		},
		"/api/machine-id": {
			GET: async () => {
				const config = await configManager.load();
				const machineId =
					(config as any)?.machine_id ||
					process.env.MACHINE_ID ||
					hostname() ||
					"unknown";
				return Response.json({ machineId });
			},
		},
	};
}
