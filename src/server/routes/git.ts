import { resolve } from "node:path";
import { badRequest, tryRoute } from "../../lib/route-helpers.ts";
import {
	type GitStatusResult,
	commit,
	getBlame,
	getBranches,
	getCommitDetails,
	getDiff,
	getFileHistory,
	getGraphLog,
	getLog,
	getStatus,
	stageAll,
	stageFile,
	unstageAll,
	unstageFile,
} from "../services/git.ts";
import { watchDirectory, unwatchDirectory } from "../services/file-watcher.ts";

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
	isImage?: boolean;
	imagePath?: string;
}

const MAX_UNTRACKED_FILE_BYTES = 120_000;

const IMAGE_EXTENSIONS = new Set([
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
	".svg",
	".ico",
	".bmp",
]);

function isImageFile(filePath: string): boolean {
	const ext = filePath.toLowerCase().slice(filePath.lastIndexOf("."));
	return IMAGE_EXTENSIONS.has(ext);
}

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
	const fullPath = resolve(cwd, filePath);

	if (isImageFile(filePath)) {
		return {
			oldLines: [],
			newLines: [],
			isBinary: true,
			isNew: true,
			isImage: true,
			imagePath: fullPath,
		};
	}

	let currentContent = "";
	let readAttempts = 0;
	const maxAttempts = 3;
	while (readAttempts < maxAttempts) {
		try {
			const f = Bun.file(fullPath);
			if (f.size > MAX_UNTRACKED_FILE_BYTES) {
				return tooLargeDiff("File too large to render safely", true);
			}
			currentContent = await f.text();
			if (currentContent.includes("\0")) {
				return { oldLines: [], newLines: [], isBinary: true, isNew: false };
			}
			break;
		} catch {
			readAttempts++;
			if (readAttempts >= maxAttempts) {
				return {
					oldLines: [],
					newLines: [
						{ number: 1, content: "Cannot read file", type: "context" },
					],
					isBinary: false,
					isNew: true,
				};
			}
			await new Promise((r) => setTimeout(r, 100));
		}
	}

	let oldContent = "";
	let isNew = false;
	try {
		const ref = staged ? `HEAD:${filePath}` : `:${filePath}`;
		const proc = Bun.spawn(["git", "show", ref], {
			cwd,
			stdout: "pipe",
			stderr: "pipe",
		});
		const [text, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			proc.exited,
		]);
		if (exitCode === 0) {
			oldContent = text;
		} else {
			isNew = true;
		}
	} catch {
		isNew = true;
	}

	if (isNew) {
		const lines = currentContent.split("\n");
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
	}

	const oldFileLines = oldContent.split("\n");
	const newFileLines = currentContent.split("\n");

	interface DiffHunk {
		oldStart: number;
		oldCount: number;
		newStart: number;
		newCount: number;
	}
	const hunks: DiffHunk[] = [];

	try {
		const args = staged
			? ["git", "diff", "--cached", "-U0", "--", filePath]
			: ["git", "diff", "-U0", "--", filePath];
		const proc = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
		const diffText = await new Response(proc.stdout).text();

		for (const line of diffText.split("\n")) {
			if (line.startsWith("@@")) {
				const m = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
				if (m) {
					hunks.push({
						oldStart: Number.parseInt(m[1]!, 10),
						oldCount: m[2] ? Number.parseInt(m[2], 10) : 1,
						newStart: Number.parseInt(m[3]!, 10),
						newCount: m[4] ? Number.parseInt(m[4], 10) : 1,
					});
				}
			}
		}
	} catch {}

	const removedRanges: Array<{ start: number; end: number }> = [];
	const addedRanges: Array<{ start: number; end: number }> = [];

	for (const hunk of hunks) {
		if (hunk.oldCount > 0) {
			removedRanges.push({
				start: hunk.oldStart,
				end: hunk.oldStart + hunk.oldCount - 1,
			});
		}
		if (hunk.newCount > 0) {
			addedRanges.push({
				start: hunk.newStart,
				end: hunk.newStart + hunk.newCount - 1,
			});
		}
	}

	const isRemoved = (n: number) =>
		removedRanges.some((r) => n >= r.start && n <= r.end);
	const isAdded = (n: number) =>
		addedRanges.some((r) => n >= r.start && n <= r.end);

	const oldLines: DiffLine[] = [];
	const newLines: DiffLine[] = [];
	let oldIdx = 0;
	let newIdx = 0;

	while (oldIdx < oldFileLines.length || newIdx < newFileLines.length) {
		const oldLineNum = oldIdx + 1;
		const newLineNum = newIdx + 1;
		const oldIsRemoved = oldIdx < oldFileLines.length && isRemoved(oldLineNum);
		const newIsAdded = newIdx < newFileLines.length && isAdded(newLineNum);

		if (oldIsRemoved && newIsAdded) {
			oldLines.push({
				number: oldLineNum,
				content: oldFileLines[oldIdx] ?? "",
				type: "remove",
			});
			newLines.push({
				number: newLineNum,
				content: newFileLines[newIdx] ?? "",
				type: "add",
			});
			oldIdx++;
			newIdx++;
		} else if (oldIsRemoved) {
			oldLines.push({
				number: oldLineNum,
				content: oldFileLines[oldIdx] ?? "",
				type: "remove",
			});
			newLines.push({ number: null, content: "", type: "spacer" });
			oldIdx++;
		} else if (newIsAdded) {
			oldLines.push({ number: null, content: "", type: "spacer" });
			newLines.push({
				number: newLineNum,
				content: newFileLines[newIdx] ?? "",
				type: "add",
			});
			newIdx++;
		} else if (oldIdx < oldFileLines.length && newIdx < newFileLines.length) {
			oldLines.push({
				number: oldLineNum,
				content: oldFileLines[oldIdx] ?? "",
				type: "context",
			});
			newLines.push({
				number: newLineNum,
				content: newFileLines[newIdx] ?? "",
				type: "context",
			});
			oldIdx++;
			newIdx++;
		} else if (oldIdx < oldFileLines.length) {
			oldLines.push({
				number: oldLineNum,
				content: oldFileLines[oldIdx] ?? "",
				type: "remove",
			});
			newLines.push({ number: null, content: "", type: "spacer" });
			oldIdx++;
		} else {
			oldLines.push({ number: null, content: "", type: "spacer" });
			newLines.push({
				number: newLineNum,
				content: newFileLines[newIdx] ?? "",
				type: "add",
			});
			newIdx++;
		}
	}

	return { oldLines, newLines, isBinary: false, isNew: false };
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
				const result = await getHunkDiff(cwd, file, staged);
				return Response.json(result);
			}),
		},

		"/api/git/file-with-diff": {
			GET: tryRoute(async (req) => {
				const url = new URL(req.url);
				const cwd = url.searchParams.get("cwd");
				const file = url.searchParams.get("file");
				const staged = url.searchParams.get("staged") === "true";
				if (!cwd || !file) return badRequest("Missing cwd or file parameter");

				const fullPath = resolve(cwd, file);

				if (isImageFile(file)) {
					return Response.json({
						isImage: true,
						imagePath: fullPath,
						lines: [],
					});
				}

				let content: string;
				try {
					const f = Bun.file(fullPath);
					if (f.size > 500_000)
						return Response.json({ error: "File too large", lines: [] });
					content = await f.text();
					if (content.includes("\0"))
						return Response.json({ error: "Binary file", lines: [] });
				} catch {
					return Response.json({ error: "Cannot read file", lines: [] });
				}

				const addedLines = new Set<number>();
				try {
					const args = staged
						? ["git", "diff", "--cached", "-U0", "--", file]
						: ["git", "diff", "-U0", "--", file];
					const proc = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
					const diffText = await new Response(proc.stdout).text();

					let lineNum = 0;
					for (const line of diffText.split("\n")) {
						if (line.startsWith("@@")) {
							const m = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
							if (m) lineNum = Number.parseInt(m[1]!, 10);
							continue;
						}
						if (line.startsWith("+") && !line.startsWith("+++")) {
							addedLines.add(lineNum++);
						} else if (line.startsWith("-") && !line.startsWith("---")) {
						} else if (!line.startsWith("\\")) {
							lineNum++;
						}
					}
				} catch {}

				const fileLines = content.split("\n");
				const lines = fileLines.map((text, i) => ({
					number: i + 1,
					content: text,
					type: addedLines.has(i + 1) ? "add" : "context",
				}));

				return Response.json({ lines });
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

		"/api/git/graph": {
			GET: tryRoute(async (req) => {
				const url = new URL(req.url);
				const cwd = url.searchParams.get("cwd");
				const limit = Number(url.searchParams.get("limit") || 50);
				if (!cwd) return badRequest("Missing cwd parameter");
				const commits = await getGraphLog(cwd, limit);
				return Response.json({ commits });
			}),
		},

		"/api/git/blame": {
			GET: tryRoute(async (req) => {
				const url = new URL(req.url);
				const cwd = url.searchParams.get("cwd");
				const file = url.searchParams.get("file");
				if (!cwd || !file) return badRequest("Missing cwd or file parameter");
				const blame = await getBlame(cwd, file);
				return Response.json({ blame });
			}),
		},

		"/api/git/file-history": {
			GET: tryRoute(async (req) => {
				const url = new URL(req.url);
				const cwd = url.searchParams.get("cwd");
				const file = url.searchParams.get("file");
				const limit = Number(url.searchParams.get("limit") || 20);
				if (!cwd || !file) return badRequest("Missing cwd or file parameter");
				const history = await getFileHistory(cwd, file, limit);
				return Response.json({ history });
			}),
		},

		"/api/git/commit-details": {
			GET: tryRoute(async (req) => {
				const url = new URL(req.url);
				const cwd = url.searchParams.get("cwd");
				const hash = url.searchParams.get("hash");
				if (!cwd || !hash) return badRequest("Missing cwd or hash parameter");
				const details = await getCommitDetails(cwd, hash);
				return Response.json({ details });
			}),
		},

		"/api/git/stage": {
			POST: tryRoute(async (req) => {
				const body = (await req.json()) as { cwd: string; file?: string };
				if (!body.cwd) return badRequest("Missing cwd parameter");
				const success = body.file
					? await stageFile(body.cwd, body.file)
					: await stageAll(body.cwd);
				return Response.json({ success });
			}),
		},

		"/api/git/unstage": {
			POST: tryRoute(async (req) => {
				const body = (await req.json()) as { cwd: string; file?: string };
				if (!body.cwd) return badRequest("Missing cwd parameter");
				const success = body.file
					? await unstageFile(body.cwd, body.file)
					: await unstageAll(body.cwd);
				return Response.json({ success });
			}),
		},

		"/api/git/commit": {
			POST: tryRoute(async (req) => {
				const body = (await req.json()) as { cwd: string; message: string };
				if (!body.cwd) return badRequest("Missing cwd parameter");
				if (!body.message) return badRequest("Missing message parameter");
				const result = await commit(body.cwd, body.message);
				return Response.json(result);
			}),
		},

		"/api/git/watch": {
			POST: tryRoute(async (req) => {
				const body = (await req.json()) as { cwd: string };
				if (!body.cwd) return badRequest("Missing cwd parameter");
				watchDirectory(body.cwd);
				return Response.json({ ok: true });
			}),
		},

		"/api/git/unwatch": {
			POST: tryRoute(async (req) => {
				const body = (await req.json()) as { cwd: string };
				if (!body.cwd) return badRequest("Missing cwd parameter");
				unwatchDirectory(body.cwd);
				return Response.json({ ok: true });
			}),
		},
	};
}
