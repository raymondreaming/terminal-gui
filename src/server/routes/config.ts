import { hostname } from "node:os";
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
