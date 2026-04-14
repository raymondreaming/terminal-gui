import {
	installShutdownHandlers,
	startAppServer,
} from "./src/server/app-server.ts";
import { PidTracker } from "./src/server/services/pid-tracker.ts";

await startAppServer();
installShutdownHandlers();

PidTracker.cleanupOrphans().catch((e) =>
	console.error("[PID] Failed to cleanup orphans:", e)
);
