import { mkdir, readdir, unlink } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { readJson } from "../lib/route-helpers.ts";

interface FileSnapshot {
	relativePath: string;
	blobBefore: string | null;
	blobAfter: string | null;
}

interface Checkpoint {
	id: string;
	paneId: string;
	cwd: string;
	gitRoot: string | null;
	cwdRelative: string;
	headSha: string | null;
	timestamp: number;
	userMessage: string;
	beforeSnapshot: Record<string, string | null>;
	changedFiles: FileSnapshot[];
	reverted: boolean;
}

interface CheckpointMeta {
	id: string;
	paneId: string;
	timestamp: number;
	userMessage: string;
	changedFileCount: number;
	changedFiles: { path: string; action: "created" | "modified" | "deleted" }[];
	reverted: boolean;
}

const CHECKPOINTS_PATH = resolve(
	import.meta.dir,
	"../../data/checkpoints.json"
);
const MAX_CHECKPOINTS_PER_PANE = 10;
const MAX_TOTAL_CHECKPOINTS = 50;
const MAX_FILE_SIZE = 1_000_000;
const BINARY_EXTENSIONS = new Set([
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
	".ico",
	".svg",
	".mp3",
	".mp4",
	".wav",
	".mov",
	".avi",
	".zip",
	".tar",
	".gz",
	".bz2",
	".7z",
	".pdf",
	".woff",
	".woff2",
	".ttf",
	".eot",
	".o",
	".a",
	".dylib",
	".so",
	".dll",
	".exe",
]);

const SKIP_DIRS = new Set([
	"node_modules",
	".git",
	".build",
	"build",
	"dist",
	".next",
	".turbo",
	".cache",
]);

function isBinary(filePath: string): boolean {
	return BINARY_EXTENSIONS.has(
		filePath.substring(filePath.lastIndexOf(".")).toLowerCase()
	);
}

async function runGit(
	args: string[],
	cwd: string
): Promise<{ code: number; stdout: string }> {
	try {
		const proc = Bun.spawn(["git", ...args], {
			cwd,
			stdout: "pipe",
			stderr: "pipe",
		});
		const stdout = (await new Response(proc.stdout).text()).trim();
		return { code: await proc.exited, stdout };
	} catch {
		return { code: 1, stdout: "" };
	}
}

async function getGitRoot(cwd: string): Promise<string | null> {
	const { code, stdout } = await runGit(["rev-parse", "--show-toplevel"], cwd);
	return code === 0 && stdout ? stdout : null;
}

async function getHeadSha(gitRoot: string): Promise<string | null> {
	const r = await runGit(["rev-parse", "HEAD"], gitRoot);
	return r.code === 0 && r.stdout ? r.stdout : null;
}

function toMeta(cp: Checkpoint): CheckpointMeta {
	return {
		id: cp.id,
		paneId: cp.paneId,
		timestamp: cp.timestamp,
		userMessage: cp.userMessage,
		changedFileCount: cp.changedFiles.length,
		changedFiles: cp.changedFiles.map((f) => ({
			path: f.relativePath,
			action:
				f.blobBefore === null
					? "created"
					: f.blobAfter === null
						? "deleted"
						: "modified",
		})),
		reverted: cp.reverted,
	};
}

function parsePorcelain(output: string): { status: string; path: string }[] {
	const results: { status: string; path: string }[] = [];
	for (const line of output.split("\n")) {
		if (!line) continue;
		let filePath = line.substring(3).trim();
		if (filePath.includes(" -> ")) filePath = filePath.split(" -> ")[1]!;
		if (filePath.startsWith('"') && filePath.endsWith('"'))
			filePath = filePath.slice(1, -1);
		results.push({ status: line.substring(0, 2), path: filePath });
	}
	return results;
}

async function storeBlob(gitRoot: string, content: string): Promise<string> {
	const proc = Bun.spawn(["git", "hash-object", "-w", "--stdin"], {
		cwd: gitRoot,
		stdin: new Blob([content]),
		stdout: "pipe",
		stderr: "pipe",
	});
	const sha = (await new Response(proc.stdout).text()).trim();
	await proc.exited;
	return sha;
}

async function readBlob(gitRoot: string, sha: string): Promise<string | null> {
	const { code, stdout } = await runGit(["cat-file", "-p", sha], gitRoot);
	return code === 0 ? stdout : null;
}

async function safeReadFile(fullPath: string): Promise<string | null> {
	if (isBinary(fullPath)) return null;
	try {
		const file = Bun.file(fullPath);
		return file.size > MAX_FILE_SIZE ? null : await file.text();
	} catch {
		return null;
	}
}

async function gitShowFile(
	gitRoot: string,
	commitSha: string,
	relativePath: string
): Promise<string | null> {
	const r = await runGit(["show", `${commitSha}:${relativePath}`], gitRoot);
	return r.code === 0 ? r.stdout : null;
}

async function walkDir(
	dir: string,
	base: string,
	files: string[] = []
): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const fullPath = resolve(dir, entry.name);
		if (entry.isDirectory()) await walkDir(fullPath, base, files);
		else if (entry.isFile() && !isBinary(entry.name))
			files.push(relative(base, fullPath));
	}
	return files;
}

async function captureGitSnapshot(
	gitRoot: string,
	cwdRelative: string
): Promise<Record<string, string | null>> {
	const args = ["status", "--porcelain"];
	if (cwdRelative) args.push("--", cwdRelative);

	const { stdout: output } = await runGit(args, gitRoot);
	const snapshot: Record<string, string | null> = {};

	for (const { status, path } of parsePorcelain(output)) {
		if (isBinary(path)) continue;
		if (status.includes("D")) {
			const content = await gitShowFile(gitRoot, "HEAD", path);
			snapshot[path] =
				content !== null ? await storeBlob(gitRoot, content) : null;
		} else {
			const content = await safeReadFile(resolve(gitRoot, path));
			snapshot[path] =
				content !== null ? await storeBlob(gitRoot, content) : null;
		}
	}
	return snapshot;
}

async function captureFileSnapshot(
	cwd: string
): Promise<Record<string, string | null>> {
	const snapshot: Record<string, string | null> = {};
	for (const relPath of await walkDir(cwd, cwd)) {
		const content = await safeReadFile(resolve(cwd, relPath));
		if (content !== null) snapshot[relPath] = content;
	}
	return snapshot;
}

const checkpoints = new Map<string, Checkpoint[]>();
const pending = new Map<string, string>();

function findCheckpoint(checkpointId: string): Checkpoint | null {
	for (const list of checkpoints.values()) {
		const cp = list.find((c) => c.id === checkpointId);
		if (cp) return cp;
	}
	return null;
}

function resolveContent(
	cp: Checkpoint,
	blobOrContent: string
): Promise<string | null> | string {
	return cp.gitRoot ? readBlob(cp.gitRoot, blobOrContent) : blobOrContent;
}

export const CheckpointService = {
	async createCheckpoint(
		paneId: string,
		cwd: string,
		userMessage: string
	): Promise<string> {
		const id = crypto.randomUUID();
		const gitRoot = await getGitRoot(cwd);

		let cwdRelative = "";
		let headSha: string | null = null;
		let beforeSnapshot: Record<string, string | null>;

		if (gitRoot) {
			cwdRelative = relative(gitRoot, cwd);
			if (cwdRelative === ".") cwdRelative = "";
			headSha = await getHeadSha(gitRoot);
			beforeSnapshot = await captureGitSnapshot(gitRoot, cwdRelative);
		} else {
			beforeSnapshot = await captureFileSnapshot(cwd);
		}

		const checkpoint: Checkpoint = {
			id,
			paneId,
			cwd,
			gitRoot,
			cwdRelative,
			headSha,
			timestamp: Date.now(),
			userMessage,
			beforeSnapshot,
			changedFiles: [],
			reverted: false,
		};

		if (!checkpoints.has(paneId)) checkpoints.set(paneId, []);
		const list = checkpoints.get(paneId);
		if (!list) return id;
		list.push(checkpoint);
		while (list.length > MAX_CHECKPOINTS_PER_PANE) list.shift();

		pending.set(paneId, id);
		return id;
	},

	async finalizeCheckpoint(
		checkpointId: string
	): Promise<CheckpointMeta | null> {
		const cp = findCheckpoint(checkpointId);
		if (!cp) return null;

		if (pending.get(cp.paneId) === checkpointId) pending.delete(cp.paneId);

		const afterSnapshot = await (cp.gitRoot
			? captureGitSnapshot(cp.gitRoot, cp.cwdRelative)
			: captureFileSnapshot(cp.cwd));

		const allPaths = new Set([
			...Object.keys(cp.beforeSnapshot),
			...Object.keys(afterSnapshot),
		]);
		const changedFiles: FileSnapshot[] = [];
		for (const path of allPaths) {
			const before = cp.beforeSnapshot[path] ?? null;
			const after = afterSnapshot[path] ?? null;
			if (
				before !== after ||
				path in cp.beforeSnapshot !== path in afterSnapshot
			) {
				changedFiles.push({
					relativePath: path,
					blobBefore: before,
					blobAfter: after,
				});
			}
		}

		cp.changedFiles = changedFiles;
		this.save().catch((e: unknown) =>
			console.error("[Checkpoint] save failed:", e)
		);
		return toMeta(cp);
	},

	async revertToCheckpoint(
		checkpointId: string
	): Promise<{ ok: boolean; restoredFiles: string[]; error?: string }> {
		const cp = findCheckpoint(checkpointId);
		if (!cp)
			return { ok: false, restoredFiles: [], error: "Checkpoint not found" };
		if (cp.changedFiles.length === 0) return { ok: true, restoredFiles: [] };

		const root = cp.gitRoot || cp.cwd;
		const restoredFiles: string[] = [];

		for (const file of cp.changedFiles) {
			const fullPath = resolve(root, file.relativePath);
			try {
				if (file.blobBefore === null && file.blobAfter !== null) {
					await unlink(fullPath);
					restoredFiles.push(file.relativePath);
				} else if (file.blobBefore !== null) {
					const content = await resolveContent(cp, file.blobBefore);
					if (content !== null) {
						if (file.blobAfter === null)
							await mkdir(dirname(fullPath), { recursive: true });
						await Bun.write(fullPath, content);
						restoredFiles.push(file.relativePath);
					}
				}
			} catch (e) {
				return {
					ok: false,
					restoredFiles,
					error: `Failed to restore ${file.relativePath}: ${e instanceof Error ? e.message : e}`,
				};
			}
		}

		cp.reverted = true;
		this.save().catch((e: unknown) =>
			console.error("[Checkpoint] save failed:", e)
		);
		return { ok: true, restoredFiles };
	},

	listCheckpoints(paneId: string): CheckpointMeta[] {
		return (checkpoints.get(paneId) || []).map(toMeta);
	},

	getCheckpointMeta(checkpointId: string): CheckpointMeta | null {
		const cp = findCheckpoint(checkpointId);
		return cp ? toMeta(cp) : null;
	},

	async save(): Promise<void> {
		let total = 0;
		for (const list of checkpoints.values()) total += list.length;
		while (total > MAX_TOTAL_CHECKPOINTS) {
			let oldestTime = Infinity,
				oldestPane = "";
			for (const [paneId, list] of checkpoints) {
				if (list.length > 0 && list[0].timestamp < oldestTime) {
					oldestTime = list[0].timestamp;
					oldestPane = paneId;
				}
			}
			if (!oldestPane) break;
			const list = checkpoints.get(oldestPane)!;
			list.shift();
			if (list.length === 0) checkpoints.delete(oldestPane);
			total--;
		}

		const data: Record<string, any[]> = {};
		for (const [paneId, list] of checkpoints) {
			data[paneId] = list.map((cp) => {
				const { beforeSnapshot, ...rest } = cp;
				return rest;
			});
		}
		await mkdir(dirname(CHECKPOINTS_PATH), { recursive: true });
		try {
			await Bun.write(CHECKPOINTS_PATH, JSON.stringify(data));
		} catch (e) {
			console.error(
				"[Checkpoint] JSON.stringify failed, saving metadata only:",
				e
			);
			const slim: Record<string, any[]> = {};
			for (const [paneId, list] of checkpoints) slim[paneId] = list.map(toMeta);
			await Bun.write(CHECKPOINTS_PATH, JSON.stringify(slim));
		}
	},

	async load(): Promise<void> {
		try {
			const raw = await readJson<Record<string, any[]> | null>(
				CHECKPOINTS_PATH,
				null
			);
			if (!raw) return;

			for (const [paneId, list] of Object.entries(raw)) {
				const valid: Checkpoint[] = [];
				for (const cp of list) {
					if (cp.changedFiles?.some((f: any) => "contentBefore" in f)) continue;
					if (!("headSha" in cp)) cp.headSha = null;
					if (!cp.beforeSnapshot) cp.beforeSnapshot = {};
					valid.push(cp as Checkpoint);
				}
				if (valid.length > 0) checkpoints.set(paneId, valid);
			}
		} catch (e) {
			console.error("[Checkpoint] Failed to load:", e);
		}
	},
};
