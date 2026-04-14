import { useCallback, useMemo } from "react";
import { postJson } from "../lib/fetch-json.ts";
import { usePollingResource } from "./usePollingResource.ts";

export interface GitFileEntry {
	status: string;
	staged: boolean;
	path: string;
	originalPath?: string;
}

export interface GitProjectStatus {
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

export function useGitStatus(cwds: string[]) {
	const fetcher = useCallback(
		async () => {
			if (cwds.length === 0) return [];
			return postJson<GitProjectStatus[]>("/api/git/statuses", { cwds });
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[cwds]
	);

	const { data: projects, refetch } = usePollingResource<GitProjectStatus[]>(
		fetcher,
		5000,
		[],
		{ deferInitialFetch: true }
	);

	const projectMap = useMemo(() => {
		const map = new Map<string, GitProjectStatus>();
		for (const p of projects) map.set(p.cwd, p);
		return map;
	}, [projects]);

	return { projects, projectMap, refetch };
}
