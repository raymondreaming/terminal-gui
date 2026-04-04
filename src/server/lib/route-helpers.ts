import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export function errorResponse(e: unknown, status = 500): Response {
	const message = e instanceof Error ? e.message : "Unknown error";
	return Response.json({ error: message }, { status });
}

export function tryRoute<T extends Request = Request>(
	handler: (req: T) => Promise<Response>
): (req: T) => Promise<Response> {
	return async (req: T) => {
		try {
			return await handler(req);
		} catch (e) {
			console.error(
				`[tryRoute] ${req.method} ${new URL(req.url).pathname} error:`,
				e
			);
			return errorResponse(e);
		}
	};
}

export function badRequest(message: string): Response {
	return Response.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found"): Response {
	return Response.json({ error: message }, { status: 404 });
}

export async function readJson<T>(path: string, fallback: T): Promise<T> {
	const file = Bun.file(path);
	if (await file.exists()) {
		try {
			return (await file.json()) as T;
		} catch {}
	}
	return fallback;
}

export async function writeJson(path: string, data: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await Bun.write(path, JSON.stringify(data, null, 2));
}
