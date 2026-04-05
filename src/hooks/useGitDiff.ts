import { useCallback, useRef, useState } from "react";

// Single line in a diff view
export interface DiffLine {
	number: number | null;
	content: string;
	type: "add" | "remove" | "context" | "spacer" | "hunk";
}

// Full diff result with aligned old/new lines
export interface HunkDiff {
	oldLines: DiffLine[];
	newLines: DiffLine[];
	isBinary: boolean;
	isNew: boolean;
	isImage?: boolean;
	imagePath?: string;
}

// Request parameters for loading a diff
export interface DiffRequest {
	cwd: string;
	file: string;
	staged: boolean;
}

// Counter to track and cancel stale requests
let requestCounter = 0;

// Hook for loading and managing git diff state
export function useGitDiff() {
	const [loading, setLoading] = useState(false);
	const [diff, setDiff] = useState<HunkDiff | null>(null);
	const [request, setRequest] = useState<DiffRequest | null>(null);
	const activeId = useRef(0);

	const loadDiff = useCallback((req: DiffRequest) => {
		const id = ++requestCounter;
		activeId.current = id;
		setRequest(req);
		setLoading(true);
		setDiff(null);

		fetch(
			`/api/git/full-diff?cwd=${encodeURIComponent(req.cwd)}&file=${encodeURIComponent(req.file)}&staged=${req.staged}`
		)
			.then((resp) => {
				if (activeId.current !== id) return null;
				if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
				return resp.json();
			})
			.then((result) => {
				if (activeId.current !== id || !result) return;
				setDiff(result as HunkDiff);
				setLoading(false);
			})
			.catch(() => {
				if (activeId.current !== id) return;
				setDiff(null);
				setLoading(false);
			});
	}, []);

	// Clear current diff state
	const clear = useCallback(() => {
		activeId.current = ++requestCounter;
		setDiff(null);
		setRequest(null);
		setLoading(false);
	}, []);

	return { diff, request, loading, loadDiff, clear };
}
