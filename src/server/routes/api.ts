import { checkpointRoutes } from "./checkpoint.ts";
import { configRoutes } from "./config.ts";
import { fileRoutes } from "./files.ts";
import { forgeRoutes } from "./forge.ts";
import { goalRoutes } from "./goals.ts";
import { gitRoutes } from "./git.ts";
import { nativeRoutes } from "./native.ts";
import { promptRoutes } from "./prompts.ts";
import { simulatorRoutes } from "./simulator.ts";
import { terminalRoutes } from "./terminal.ts";
import { titleRoutes } from "./title.ts";
export function buildApiRoutes() {
	return {
		...configRoutes(),
		...fileRoutes(),
		...forgeRoutes(),
		...nativeRoutes(),
		...terminalRoutes(),
		...checkpointRoutes(),
		...promptRoutes(),
		...goalRoutes(),
		...gitRoutes(),
		...simulatorRoutes(),
		...titleRoutes(),
	};
}
