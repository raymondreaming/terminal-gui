import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { PROJECT_ROOT } from "../../lib/path-utils.ts";
import { tryRoute } from "../../lib/route-helpers.ts";

const TMP_DIR = resolve(PROJECT_ROOT, "data/.tmp");

export function fileRoutes() {
	return {
		"/api/files/search": {
			GET: tryRoute(async (req) => {
				const url = new URL(req.url);
				const cwd = url.searchParams.get("cwd") || PROJECT_ROOT;
				const query = (url.searchParams.get("q") || "").toLowerCase();
				const limit = Math.min(
					Number(url.searchParams.get("limit") || "20"),
					50
				);

				const homeDir = process.env.HOME || "/Users";
				const resolvedCwd = resolve(cwd);
				if (!resolvedCwd.startsWith(homeDir)) {
					return Response.json({ error: "Invalid directory" }, { status: 400 });
				}

				const results: { name: string; path: string; isDir: boolean }[] = [];
				const seen = new Set<string>();
				const SKIP = new Set(["node_modules", "build", "dist"]);

				async function searchDir(dir: string, depth: number) {
					if (depth > 4 || results.length >= limit) return;
					try {
						const entries = await readdir(dir, { withFileTypes: true });
						for (const entry of entries) {
							if (results.length >= limit) break;
							if (entry.name.startsWith(".") || SKIP.has(entry.name)) continue;
							const full = join(dir, entry.name);
							const rel = relative(resolvedCwd, full);
							if (seen.has(rel)) continue;
							if (
								!query ||
								entry.name.toLowerCase().includes(query) ||
								rel.toLowerCase().includes(query)
							) {
								seen.add(rel);
								results.push({
									name: entry.name,
									path: rel,
									isDir: entry.isDirectory(),
								});
							}
							if (entry.isDirectory() && depth < 4) {
								await searchDir(full, depth + 1);
							}
						}
					} catch {}
				}

				await searchDir(resolvedCwd, 0);
				return Response.json({ cwd: resolvedCwd, results });
			}),
		},

		"/api/upload-temp": {
			POST: tryRoute(async (req) => {
				const formData = await req.formData();
				const file = formData.get("file") as File | null;
				if (!file)
					return Response.json({ error: "No file provided" }, { status: 400 });
				await mkdir(TMP_DIR, { recursive: true });
				const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
				const filePath = resolve(TMP_DIR, `${Date.now()}-${safeName}`);
				await Bun.write(filePath, file);
				return Response.json({ path: filePath });
			}),
		},

		"/api/file": {
			GET: tryRoute(async (req) => {
				const url = new URL(req.url);
				const filePath = url.searchParams.get("path");
				if (!filePath) {
					return Response.json({ error: "No path provided" }, { status: 400 });
				}

				const resolvedPath = resolve(filePath);
				const homeDir = process.env.HOME || "/Users";

				// Allow serving files from temp directory or user's home directory
				if (
					!resolvedPath.startsWith(TMP_DIR) &&
					!resolvedPath.startsWith(homeDir)
				) {
					return Response.json({ error: "Access denied" }, { status: 403 });
				}

				if (!existsSync(resolvedPath)) {
					return Response.json({ error: "File not found" }, { status: 404 });
				}

				const file = Bun.file(resolvedPath);
				return new Response(file, {
					headers: {
						"Content-Type": file.type || "application/octet-stream",
						"Cache-Control": "public, max-age=3600",
					},
				});
			}),
		},
	};
}
