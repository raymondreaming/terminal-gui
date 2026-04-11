import { buildApiRoutes } from "./src/server/routes/api.ts";
import { handlePromptRequest } from "./src/server/routes/prompts.ts";
import { websocketHandler } from "./src/server/ws.ts";
import { TerminalService } from "./src/server/routes/terminal.ts";
import { ChatService } from "./src/server/services/claude-chat.ts";
import { CheckpointService } from "./src/server/services/checkpoint.ts";
import { PidTracker } from "./src/server/services/pid-tracker.ts";
import { resolve } from "path";
import { readdir } from "fs/promises";

const apiRoutes = buildApiRoutes();
const publicDir = resolve(import.meta.dir, "public");
const distDir = resolve(import.meta.dir, "dist");

// Check if Vite production build exists
const hasViteBuild = await (async () => {
	try {
		const entries = await readdir(distDir);
		return entries.some((e) => e === "index.html" || e === "assets");
	} catch {
		return false;
	}
})();

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

// Serve a file from dist/ with auto-detected content type
async function serveDistFile(pathname: string): Promise<Response | null> {
	const filePath = resolve(
		distDir,
		pathname.startsWith("/") ? pathname.slice(1) : pathname
	);
	const file = Bun.file(filePath);
	if (!(await file.exists())) return null;

	const ext = filePath.split(".").pop() || "";
	const types: Record<string, string> = {
		html: "text/html",
		js: "application/javascript",
		css: "text/css",
		json: "application/json",
		png: "image/png",
		jpg: "image/jpeg",
		svg: "image/svg+xml",
		woff2: "font/woff2",
		woff: "font/woff",
		ico: "image/x-icon",
		webp: "image/webp",
	};
	const contentType = types[ext] || "application/octet-stream";
	const cacheControl = pathname.startsWith("/assets/")
		? "public, max-age=31536000, immutable" // Vite hashed assets — cache forever
		: "no-cache";

	return new Response(file, {
		headers: { "Content-Type": contentType, "Cache-Control": cacheControl },
	});
}

Bun.serve({
	port: 4001,
	idleTimeout: 255,
	routes: {
		// Static assets from public/
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

		// API routes
		...apiRoutes,

		"/api/restart": {
			POST: async () => {
				setTimeout(() => process.exit(0), 50);
				return Response.json({ ok: true, message: "Restarting..." });
			},
		},
	},
	websocket: websocketHandler,
	async fetch(req, server) {
		const url = new URL(req.url);

		// WebSocket upgrade
		if (url.pathname === "/ws") {
			const upgraded = server.upgrade(req, {
				data: { subscriptions: new Set() },
			});
			if (upgraded) return undefined;
			return new Response("WebSocket upgrade failed", { status: 400 });
		}

		// Prompt sub-routes
		const promptResponse = handlePromptRequest(req);
		if (promptResponse) return promptResponse;

		// Serve Vite production build
		if (hasViteBuild) {
			// Try serving the exact file from dist/
			const distResponse = await serveDistFile(url.pathname);
			if (distResponse) return distResponse;

			// SPA fallback — serve dist/index.html for all non-API routes
			if (!url.pathname.startsWith("/api/")) {
				const indexFile = Bun.file(resolve(distDir, "index.html"));
				if (await indexFile.exists()) {
					return new Response(indexFile, {
						headers: {
							"Content-Type": "text/html",
							"Cache-Control": "no-cache",
						},
					});
				}
			}
		}

		return new Response("Not found", { status: 404 });
	},
});

CheckpointService.load().catch((e) =>
	console.error("[Checkpoint] Failed to load:", e)
);

PidTracker.cleanupOrphans().catch((e) =>
	console.error("[PID] Failed to cleanup orphans:", e)
);

async function cleanShutdown() {
	TerminalService.destroyAll();
	ChatService.destroyAll();
	await PidTracker.flush();
	process.exit(0);
}
process.on("SIGTERM", cleanShutdown);
process.on("SIGINT", cleanShutdown);
process.on("SIGHUP", cleanShutdown);
