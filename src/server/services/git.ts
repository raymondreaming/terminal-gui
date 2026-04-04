import { resolve } from "node:path";

export interface GitFileEntry {
	status: string; // M, A, D, ?, R, C, U
	staged: boolean;
	path: string;
	originalPath?: string;
}

export interface GitStatusResult {
	cwd: string;
	name: string;
	branch: string;
	upstream: string | null;
	ahead: number;
	behind: number;
	stagedCount: number;
	unstagedCount: number;
	untrackedCount: number;
	files: GitFileEntry[];
}

async function run(args: string[], cwd: string): Promise<string | null> {
	try {
		const proc = Bun.spawn(["git", ...args], {
			cwd,
			stdout: "pipe",
			stderr: "pipe",
		});
		// Read stdout and stderr concurrently to prevent deadlocks
		const [text, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			proc.exited,
		]);
		if (exitCode !== 0) return null;
		return text;
	} catch {
		return null;
	}
}

// Same as run but with a timeout to prevent server hangs
async function runSafe(
	args: string[],
	cwd: string,
	timeoutMs = 5000
): Promise<string | null> {
	return Promise.race([
		run(args, cwd),
		new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
	]);
}

export async function isGitRepo(cwd: string): Promise<boolean> {
	const result = await run(["rev-parse", "--git-dir"], cwd);
	return result !== null;
}

export async function getGitRoot(cwd: string): Promise<string | null> {
	const result = await run(["rev-parse", "--show-toplevel"], cwd);
	return result?.trim() || null;
}

export async function getStatus(cwd: string): Promise<GitStatusResult | null> {
	if (!(await isGitRepo(cwd))) return null;

	const raw = await run(
		["status", "--porcelain=v1", "-b", "--untracked-files=all"],
		cwd
	);
	if (raw === null) return null;

	const lines = raw.split("\n").filter(Boolean);
	let branch = "HEAD";
	let upstream: string | null = null;
	let ahead = 0;
	let behind = 0;
	const files: GitFileEntry[] = [];

	for (const line of lines) {
		if (line.startsWith("## ")) {
			const branchLine = line.slice(3);
			const dotDot = branchLine.indexOf("...");
			if (dotDot !== -1) {
				branch = branchLine.slice(0, dotDot);
				const rest = branchLine.slice(dotDot + 3);
				const bracketStart = rest.indexOf("[");
				if (bracketStart !== -1) {
					upstream = rest.slice(0, bracketStart).trim();
					const info = rest.slice(bracketStart + 1, rest.indexOf("]"));
					const aheadMatch = info.match(/ahead (\d+)/);
					const behindMatch = info.match(/behind (\d+)/);
					if (aheadMatch) ahead = Number(aheadMatch[1]);
					if (behindMatch) behind = Number(behindMatch[1]);
				} else {
					upstream = rest.trim();
				}
			} else {
				branch = branchLine.split(" ")[0] || "HEAD";
			}
			continue;
		}

		const x = line[0] ?? " "; // index (staged)
		const y = line[1] ?? " "; // worktree (unstaged)
		const filePath = line.slice(3);

		// Handle renames: "R  old -> new"
		const arrowIdx = filePath.indexOf(" -> ");
		const actualPath =
			arrowIdx !== -1 ? filePath.slice(arrowIdx + 4) : filePath;
		const origPath = arrowIdx !== -1 ? filePath.slice(0, arrowIdx) : undefined;

		// Staged changes (index column)
		if (x !== " " && x !== "?") {
			files.push({
				status: x,
				staged: true,
				path: actualPath,
				originalPath: origPath,
			});
		}

		// Unstaged changes (worktree column)
		if (y !== " " && y !== "?") {
			files.push({
				status: y,
				staged: false,
				path: actualPath,
				originalPath: origPath,
			});
		}

		// Untracked files
		if (x === "?" && y === "?") {
			files.push({
				status: "?",
				staged: false,
				path: actualPath,
			});
		}
	}

	const stagedCount = files.filter((f) => f.staged).length;
	const unstagedCount = files.filter(
		(f) => !f.staged && f.status !== "?"
	).length;
	const untrackedCount = files.filter((f) => f.status === "?").length;
	const name = cwd.split("/").pop() || cwd;

	return {
		cwd,
		name,
		branch,
		upstream,
		ahead,
		behind,
		stagedCount,
		unstagedCount,
		untrackedCount,
		files,
	};
}

export async function getDiff(
	cwd: string,
	filePath: string,
	staged: boolean
): Promise<string> {
	const args = staged
		? ["diff", "--cached", "--", filePath]
		: ["diff", "--", filePath];

	const result = await runSafe(args, cwd);

	// For untracked files, read the file content and format as a diff
	if (result === null || result.trim() === "") {
		const fullPath = resolve(cwd, filePath);
		try {
			const file = Bun.file(fullPath);
			if (await file.exists()) {
				const content = await file.text();
				const lines = content.split("\n");
				const diffLines = lines.map((l) => `+${l}`);
				return [
					`--- /dev/null`,
					`+++ b/${filePath}`,
					`@@ -0,0 +1,${lines.length} @@`,
					...diffLines,
				].join("\n");
			}
		} catch {}
		return "";
	}

	return result;
}

export async function getBranches(
	cwd: string
): Promise<{ name: string; current: boolean }[]> {
	const result = await run(
		["branch", "--format=%(HEAD) %(refname:short)"],
		cwd
	);
	if (!result) return [];

	return result
		.split("\n")
		.filter(Boolean)
		.map((line) => ({
			current: line.startsWith("*"),
			name: line.slice(2).trim(),
		}));
}

export async function getLog(
	cwd: string,
	limit = 20
): Promise<{ hash: string; message: string; author: string; date: string }[]> {
	const result = await run(
		["log", `--max-count=${limit}`, "--format=%h|%s|%an|%ar"],
		cwd
	);
	if (!result) return [];

	return result
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [hash = "", message = "", author = "", date = ""] = line.split("|");
			return { hash, message, author, date };
		});
}
