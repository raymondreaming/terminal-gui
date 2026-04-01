import {
	installShutdownHandlers,
	startAppServer,
} from "./src/server/app-server.ts";

await startAppServer();
installShutdownHandlers();
