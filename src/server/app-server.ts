import { buildApiRoutes } from "./routes/api.ts";
import { handlePromptRequest } from "./routes/prompts.ts";
import { websocketHandler } from "./ws.ts";
import { TerminalService } from "./routes/terminal.ts";
import { ChatService } from "./services/claude-chat.ts";
import { CheckpointService } from "./services/checkpoint.ts";
import { resolve } from "path";
import { existsSync } from "fs";
import { readdir } from "fs/promises";
import { PROJECT_ROOT } from "./lib/path-utils.ts";

const apiRoutes = buildApiRoutes();
const publicDir = resolve(PROJECT_ROOT, "public");
// In bundle the electrobun config copies dist/* → views/*
const distDir = existsSync(resolve(PROJECT_ROOT, "dist"))
	? resolve(PROJECT_ROOT, "dist")
	: resolve(PROJECT_ROOT, "views");
const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

const g = globalThis as typeof globalThis & {
	__terminal_gui_server?: ReturnType<typeof Bun.serve>;
	__terminal_gui_shutdown_handlers_installed?: boolean;
};

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
			headers: {
				"Content-Type": contentType,
				...CORS_HEADERS,
				...extraHeaders,
			},
		});
	};
}

function withCors(response: Response): Response {
	const headers = new Headers(response.headers);
	for (const [key, value] of Object.entries(CORS_HEADERS)) {
		headers.set(key, value);
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

function addCorsToRoutes(
	routes: ReturnType<typeof buildApiRoutes>
): ReturnType<typeof buildApiRoutes> {
	return Object.fromEntries(
		Object.entries(routes).map(([path, methods]) => [
			path,
			Object.fromEntries(
				Object.entries(methods).map(([method, handler]) => [
					method,
					async (...args: Parameters<typeof handler>) =>
						withCors(await handler(...args)),
				])
			),
		])
	) as ReturnType<typeof buildApiRoutes>;
}

async function hasViteBuild() {
	try {
		const entries = await readdir(distDir);
		return entries.some((e) => e === "index.html" || e === "assets");
	} catch {
		return false;
	}
}

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
		? "public, max-age=31536000, immutable"
		: "no-cache";

	return new Response(file, {
		headers: { "Content-Type": contentType, "Cache-Control": cacheControl },
	});
}

export function shutdownAppServices() {
	TerminalService.destroyAll();
	ChatService.destroyAll();
}

export function installShutdownHandlers() {
	if (g.__terminal_gui_shutdown_handlers_installed) {
		return;
	}

	g.__terminal_gui_shutdown_handlers_installed = true;
	const cleanShutdown = () => {
		shutdownAppServices();
		process.exit(0);
	};
	process.on("SIGTERM", cleanShutdown);
	process.on("SIGINT", cleanShutdown);
	process.on("SIGHUP", cleanShutdown);
}

export async function startAppServer(port = 4001) {
	if (g.__terminal_gui_server) {
		return g.__terminal_gui_server;
	}

	const viteBuildPresent = await hasViteBuild();
	const corsApiRoutes = addCorsToRoutes(apiRoutes);

	const server = Bun.serve({
		port,
		idleTimeout: 255,
		routes: {
			"/logo.png": staticFile(publicDir, "logo.png", "image/png"),
			"/app-icon.png": staticFile(publicDir, "app-icon.png", "image/png"),
			...corsApiRoutes,
			"/api/restart": {
				POST: async () => {
					setTimeout(() => process.exit(0), 50);
					return withCors(
						Response.json({ ok: true, message: "Restarting..." })
					);
				},
			},
		},
		websocket: websocketHandler,
		async fetch(req, server) {
			const url = new URL(req.url);

			if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
				return new Response(null, {
					status: 204,
					headers: CORS_HEADERS,
				});
			}

			if (url.pathname === "/ws") {
				const upgraded = server.upgrade(req, {
					data: { subscriptions: new Set() },
				});
				if (upgraded) return undefined;
				return new Response("WebSocket upgrade failed", { status: 400 });
			}

			const promptResponse = handlePromptRequest(req);
			if (promptResponse) return withCors(await promptResponse);

			if (viteBuildPresent) {
				const distResponse = await serveDistFile(url.pathname);
				if (distResponse) return withCors(distResponse);

				if (!url.pathname.startsWith("/api/")) {
					const indexFile = Bun.file(resolve(distDir, "index.html"));
					if (await indexFile.exists()) {
						return withCors(
							new Response(indexFile, {
								headers: {
									"Content-Type": "text/html",
									"Cache-Control": "no-cache",
								},
							})
						);
					}
				}
			}

			return new Response("Not found", { status: 404 });
		},
	});

	g.__terminal_gui_server = server;
	CheckpointService.load().catch((e) =>
		console.error("[Checkpoint] Failed to load:", e)
	);
	return server;
}
