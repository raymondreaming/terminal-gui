import { dirname } from "path";
import { mkdir } from "fs/promises";
import { renameSync } from "fs";

/**
 * Atomically write JSON data to a file.
 * Writes to a .tmp sibling first, then renames into place.
 * Prevents partial/corrupt writes on crash or slow I/O (Windows/OneDrive).
 */
export async function atomicWriteJson(
	filePath: string,
	data: unknown,
	indent?: number
): Promise<void> {
	const tmpPath = filePath + ".tmp";
	await mkdir(dirname(filePath), { recursive: true });
	await Bun.write(tmpPath, JSON.stringify(data, null, indent));
	renameSync(tmpPath, filePath);
}
