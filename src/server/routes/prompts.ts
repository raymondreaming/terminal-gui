import { mkdir } from "fs/promises";
import { dirname, resolve } from "path";
import { PROJECT_ROOT } from "../lib/path-utils.ts";
import { tryRoute } from "../lib/route-helpers.ts";

const PROMPTS_FILE = resolve(PROJECT_ROOT, "data/prompts.json");
const LEGACY_PROMPTS_FILE = resolve(PROJECT_ROOT, "src/data/prompts.json");

interface Prompt {
	_id: string;
	name: string;
	description: string;
	command: string;
	promptTemplate: string;
	category?: string;
	tags: string[];
	isBuiltIn: boolean;
	executionCount: number;
	lastUsed?: number;
	createdAt: number;
	updatedAt: number;
}

async function loadPrompts(): Promise<Prompt[]> {
	const file = Bun.file(PROMPTS_FILE);
	if (await file.exists()) {
		return JSON.parse(await file.text());
	}

	const legacyFile = Bun.file(LEGACY_PROMPTS_FILE);
	if (!(await legacyFile.exists())) return [];

	const prompts = JSON.parse(await legacyFile.text()) as Prompt[];
	await savePrompts(prompts);
	return prompts;
}

async function savePrompts(prompts: Prompt[]): Promise<void> {
	await mkdir(dirname(PROMPTS_FILE), { recursive: true });
	await Bun.write(PROMPTS_FILE, JSON.stringify(prompts, null, 2));
}

export function promptRoutes() {
	return {
		"/api/prompts": {
			GET: tryRoute(async () => {
				const prompts = await loadPrompts();
				prompts.sort((a, b) => b.executionCount - a.executionCount);
				return Response.json(prompts);
			}),
			POST: tryRoute(async (req) => {
				const body = await req.json();
				const prompts = await loadPrompts();

				const existing = prompts.find((p) => p.command === body.command);
				if (existing) {
					return Response.json(
						{ error: `Command /${body.command} already exists` },
						{ status: 400 }
					);
				}

				const now = Date.now();
				const prompt: Prompt = {
					_id: `custom-${now}`,
					name: body.name,
					description: body.description || body.name,
					command: body.command,
					promptTemplate: body.promptTemplate,
					category: body.category || "custom",
					tags: body.tags || [],
					isBuiltIn: false,
					executionCount: 0,
					createdAt: now,
					updatedAt: now,
				};

				prompts.push(prompt);
				await savePrompts(prompts);
				return Response.json(prompt);
			}),
		},
	};
}

// These need to be handled in the fetch handler since Bun routes don't support path params
export function handlePromptRequest(
	req: Request
): Response | Promise<Response> | null {
	const url = new URL(req.url);
	const match = url.pathname.match(/^\/api\/prompts\/([^/]+)(\/usage)?$/);
	if (!match) return null;

	const id = match[1]!;
	const isUsage = !!match[2];

	if (isUsage && req.method === "POST") {
		return handleIncrementUsage(id);
	}
	if (req.method === "PUT") {
		return handleUpdate(id, req);
	}
	if (req.method === "DELETE") {
		return handleDelete(id);
	}
	return null;
}

async function handleUpdate(id: string, req: Request): Promise<Response> {
	const body = await req.json();
	const prompts = await loadPrompts();

	const idx = prompts.findIndex((p) => p._id === id);
	if (idx === -1) {
		return Response.json({ error: "Not found" }, { status: 404 });
	}

	if (body.command) {
		const conflict = prompts.find(
			(p) => p.command === body.command && p._id !== id
		);
		if (conflict) {
			return Response.json(
				{ error: `Command /${body.command} already exists` },
				{ status: 400 }
			);
		}
	}

	prompts[idx] = { ...prompts[idx], ...body, updatedAt: Date.now() };
	await savePrompts(prompts);
	return Response.json(prompts[idx]);
}

async function handleDelete(id: string): Promise<Response> {
	const prompts = await loadPrompts();
	const prompt = prompts.find((p) => p._id === id);
	if (!prompt) {
		return Response.json({ error: "Not found" }, { status: 404 });
	}
	if (prompt.isBuiltIn) {
		return Response.json(
			{ error: "Cannot delete built-in prompts" },
			{ status: 400 }
		);
	}
	await savePrompts(prompts.filter((p) => p._id !== id));
	return Response.json({ ok: true });
}

async function handleIncrementUsage(id: string): Promise<Response> {
	const prompts = await loadPrompts();
	const idx = prompts.findIndex((p) => p._id === id);
	if (idx === -1) {
		return Response.json({ error: "Not found" }, { status: 404 });
	}
	prompts[idx].executionCount += 1;
	prompts[idx].lastUsed = Date.now();
	await savePrompts(prompts);
	return Response.json({ ok: true });
}
