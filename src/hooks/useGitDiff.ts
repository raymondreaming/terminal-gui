import { useCallback, useRef, useState } from "react";

export interface DiffLine {
	number: number | null;
	content: string;
	type: "add" | "remove" | "context" | "spacer" | "hunk";
}

export interface HunkDiff {
	oldLines: DiffLine[];
	newLines: DiffLine[];
	isBinary: boolean;
	isNew: boolean;
}

export interface DiffRequest {
	cwd: string;
	file: string;
	staged: boolean;
}

let requestCounter = 0;

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

	const clear = useCallback(() => {
		activeId.current = ++requestCounter;
		setDiff(null);
		setRequest(null);
		setLoading(false);
	}, []);

	return { diff, request, loading, loadDiff, clear };
}
