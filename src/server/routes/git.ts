import { resolve } from "node:path";
import { badRequest, tryRoute } from "../lib/route-helpers.ts";
import {
	type GitStatusResult,
	getBranches,
	getDiff,
	getLog,
	getStatus,
} from "../services/git.ts";

interface DiffLine {
	number: number | null;
	content: string;
	type: "add" | "remove" | "context" | "spacer" | "hunk";
}

interface HunkDiff {
	oldLines: DiffLine[];
	newLines: DiffLine[];
	isBinary: boolean;
	isNew: boolean;
}

const MAX_RENDER_DIFF_CHARS = 80_000;
const MAX_RENDER_DIFF_LINES = 1_500;
const MAX_UNTRACKED_FILE_BYTES = 120_000;
const MAX_RENDER_LINE_LENGTH = 4_000;

function tooLargeDiff(message: string, isNew = false): HunkDiff {
	return {
		oldLines: [],
		newLines: [{ number: 1, content: message, type: "context" }],
		isBinary: false,
		isNew,
	};
}

async function getHunkDiff(
	cwd: string,
	filePath: string,
	staged: boolean
): Promise<HunkDiff> {
	// Run git diff with context (default 3 lines) and a timeout
	let diffText = "";
	let isNew = false;

	try {
		const args = staged
			? ["git", "diff", "--cached", "--", filePath]
			: ["git", "diff", "--", filePath];
		const proc = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
		diffText = await Promise.race([
			new Response(proc.stdout).text(),
			new Promise<string>((r) =>
				setTimeout(() => {
					proc.kill();
					r("");
				}, 3000)
			),
		]);
	} catch {}

	// No diff output — try reading the file as a new/untracked file
	if (!diffText.trim()) {
		const fullPath = resolve(cwd, filePath);
		try {
			const f = Bun.file(fullPath);
			if (f.size > MAX_UNTRACKED_FILE_BYTES)
				return tooLargeDiff("File too large to render safely", true);
			const content = await f.text();
			if (content.includes("\0"))
				return { oldLines: [], newLines: [], isBinary: true, isNew: false };
			const lines = content.split("\n");
			return {
				oldLines: [],
				newLines: lines.map((c, i) => ({
					number: i + 1,
					content: c,
					type: "add" as const,
				})),
				isBinary: false,
				isNew: true,
			};
		} catch {
			return {
				oldLines: [],
				newLines: [{ number: 1, content: "Cannot read file", type: "context" }],
				isBinary: false,
				isNew: true,
			};
		}
	}

	if (diffText.includes("Binary files")) {
		return { oldLines: [], newLines: [], isBinary: true, isNew: false };
	}
	if (
		diffText.length > MAX_RENDER_DIFF_CHARS ||
		diffText.split("\n").length > MAX_RENDER_DIFF_LINES ||
		diffText.split("\n").some((line) => line.length > MAX_RENDER_LINE_LENGTH)
	) {
		return tooLargeDiff("Diff too large to render safely");
	}

	// Parse git diff into aligned left/right lines (like GitKraken)
	const oldLines: DiffLine[] = [];
	const newLines: DiffLine[] = [];
	let oldNum = 0;
	let newNum = 0;

	for (const raw of diffText.split("\n")) {
		if (raw.startsWith("--- /dev/null")) {
			isNew = true;
			continue;
		}
		if (
			raw.startsWith("---") ||
			raw.startsWith("+++") ||
			raw.startsWith("diff ") ||
			raw.startsWith("index ")
		)
			continue;

		if (raw.startsWith("@@")) {
			const m = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
			if (m) {
				oldNum = +m[1]!;
				newNum = +m[2]!;
				const label = m[3]?.trim() || "";
				oldLines.push({
					number: null,
					content: label ? `@@ ${label}` : "@@",
					type: "hunk",
				});
				newLines.push({
					number: null,
					content: label ? `@@ ${label}` : "@@",
					type: "hunk",
				});
			}
			continue;
		}

		if (raw.startsWith("+")) {
			// Added line — goes on right, spacer on left
			newLines.push({ number: newNum++, content: raw.slice(1), type: "add" });
			oldLines.push({ number: null, content: "", type: "spacer" });
		} else if (raw.startsWith("-")) {
			// Removed line — goes on left, spacer on right
			oldLines.push({
				number: oldNum++,
				content: raw.slice(1),
				type: "remove",
			});
			newLines.push({ number: null, content: "", type: "spacer" });
		} else if (raw.startsWith(" ")) {
			// Context line — both sides
			oldLines.push({
				number: oldNum++,
				content: raw.slice(1),
				type: "context",
			});
			newLines.push({
				number: newNum++,
				content: raw.slice(1),
				type: "context",
			});
		}
	}

	return { oldLines, newLines, isBinary: false, isNew };
}

export function gitRoutes() {
	return {
		"/api/git/status": {
			GET: tryRoute(async (req) => {
				const url = new URL(req.url);
				const cwd = url.searchParams.get("cwd");
				if (!cwd) return badRequest("Missing cwd parameter");
				const status = await getStatus(cwd);
				if (!status)
					return Response.json(
						{ error: "Not a git repository" },
						{ status: 404 }
					);
				return Response.json(status);
			}),
		},

		"/api/git/statuses": {
			POST: tryRoute(async (req) => {
				const body = (await req.json()) as { cwds: string[] };
				if (!body.cwds?.length) return Response.json([]);
				const seen = new Set<string>();
				const unique: string[] = [];
				for (const cwd of body.cwds) {
					if (!seen.has(cwd)) {
						seen.add(cwd);
						unique.push(cwd);
					}
				}
				const results = await Promise.all(unique.map((cwd) => getStatus(cwd)));
				return Response.json(results.filter(Boolean) as GitStatusResult[]);
			}),
		},

		"/api/git/diff": {
			GET: tryRoute(async (req) => {
				const url = new URL(req.url);
				const cwd = url.searchParams.get("cwd");
				const file = url.searchParams.get("file");
				const staged = url.searchParams.get("staged") === "true";
				if (!cwd || !file) return badRequest("Missing cwd or file parameter");
				const diff = await getDiff(cwd, file, staged);
				return Response.json({ diff });
			}),
		},

		"/api/git/full-diff": {
			GET: tryRoute(async (req) => {
				const url = new URL(req.url);
				const cwd = url.searchParams.get("cwd");
				const file = url.searchParams.get("file");
				const staged = url.searchParams.get("staged") === "true";
				if (!cwd || !file) return badRequest("Missing cwd or file parameter");
				// Simple approach: just read the file from disk + get diff markers
				const result = await getHunkDiff(cwd, file, staged);
				return Response.json(result);
			}),
		},

		"/api/git/branches": {
			GET: tryRoute(async (req) => {
				const url = new URL(req.url);
				const cwd = url.searchParams.get("cwd");
				if (!cwd) return badRequest("Missing cwd parameter");
				const branches = await getBranches(cwd);
				return Response.json({ branches });
			}),
		},

		"/api/git/log": {
			GET: tryRoute(async (req) => {
				const url = new URL(req.url);
				const cwd = url.searchParams.get("cwd");
				const limit = Number(url.searchParams.get("limit") || 20);
				if (!cwd) return badRequest("Missing cwd parameter");
				const log = await getLog(cwd, limit);
				return Response.json({ log });
			}),
		},
	};
}
