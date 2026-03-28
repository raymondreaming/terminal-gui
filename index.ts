import index from "./index.html";
import { buildApiRoutes } from "./src/server/routes/api.ts";
import { handlePromptRequest } from "./src/server/routes/prompts.ts";
import { websocketHandler } from "./src/server/ws.ts";
import { TerminalService } from "./src/server/routes/terminal.ts";
import { ChatService } from "./src/server/services/claude-chat.ts";
import { CheckpointService } from "./src/server/services/checkpoint.ts";
import { resolve } from "path";

const apiRoutes = buildApiRoutes();
const publicDir = resolve(import.meta.dir, "public");
const distDir = resolve(import.meta.dir, "dist");

function staticFile(
	dir: string,
	filename: string,
	contentType: string,
	extraHeaders?: Record<string, string>
) {
	return async () => {
		const file = Bun.file(resolve(dir, filename));
		if (!(await file.exists())) {
			return new Response("Not found", { status: 404 });
		}
		return new Response(file, {
			headers: { "Content-Type": contentType, ...extraHeaders },
		});
	};
}

Bun.serve({
	port: 4000,
	idleTimeout: 255,
	routes: {
		"/": index,

		"/styles.css": staticFile(distDir, "styles.css", "text/css"),
		"/logo.png": staticFile(publicDir, "logo.png", "image/png"),
		"/app-icon.png": staticFile(publicDir, "app-icon.png", "image/png"),
		"/icon-192.png": staticFile(publicDir, "icon-192.png", "image/png"),
		"/icon-512.png": staticFile(publicDir, "icon-512.png", "image/png"),
		"/manifest.json": staticFile(
			publicDir,
			"manifest.json",
			"application/manifest+json"
		),
		"/sw.js": staticFile(publicDir, "sw.js", "application/javascript", {
			"Cache-Control": "no-cache",
			"Service-Worker-Allowed": "/",
		}),

		...apiRoutes,

		"/api/restart": {
			POST: async () => {
				setTimeout(() => process.exit(0), 50);
				return Response.json({ ok: true, message: "Restarting..." });
			},
		},

		"/*": index,
	},
	websocket: websocketHandler,
	fetch(req, server) {
		const url = new URL(req.url);
		if (url.pathname === "/ws") {
			const upgraded = server.upgrade(req, {
				data: { subscriptions: new Set() },
			});
			if (upgraded) return undefined;
			return new Response("WebSocket upgrade failed", { status: 400 });
		}
		const promptResponse = handlePromptRequest(req);
		if (promptResponse) return promptResponse;
		return new Response(null, { status: 404 });
	},
	development: {
		hmr: true,
		console: true,
	},
});

CheckpointService.load().catch((e) =>
	console.error("[Checkpoint] Failed to load:", e)
);

function cleanShutdown() {
	TerminalService.destroyAll();
	ChatService.destroyAll();
	process.exit(0);
}
process.on("SIGTERM", cleanShutdown);
process.on("SIGINT", cleanShutdown);
process.on("SIGHUP", cleanShutdown);
