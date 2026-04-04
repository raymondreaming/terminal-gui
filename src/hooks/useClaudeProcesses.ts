import { useCallback } from "react";

import { fetchJsonOr, sendJson } from "../lib/fetch-json.ts";

import { usePollingResource } from "./usePollingResource.ts";

export interface ClaudeProcess {
	pid: number;
	ppid: number;
	cpu: number;
	mem: number;
	rss: number;
	cwd: string;
	command: string;
	elapsed: string;
}

export function useClaudeProcesses(pollInterval = 10000) {
	const fetchProcesses = useCallback(async (signal?: AbortSignal) => {
		const data = await fetchJsonOr<{ processes?: ClaudeProcess[] }>(
			"/api/terminal/claude-processes",
			{},
			{ signal }
		);
		return data.processes || [];
	}, []);
	const {
		data: processes,
		setData: setProcesses,
		refetch: refetchProcesses,
		mountedRef,
	} = usePollingResource(fetchProcesses, pollInterval, [] as ClaudeProcess[], {
		deferInitialFetch: true,
	});
	const killProcess = useCallback(
		async (pid: number) => {
			try {
				const res = await sendJson("/api/terminal/claude-processes/kill", {
					pid,
				});
				if (res.ok) {
					setProcesses((prev) => prev.filter((p) => p.pid !== pid));
					setTimeout(() => {
						if (mountedRef.current) {
							void refetchProcesses();
						}
					}, 1000);
				}
			} catch (e) {
				console.error("Failed to kill claude process:", e);
			}
		},
		[mountedRef, refetchProcesses, setProcesses]
	);
	const killAll = useCallback(async () => {
		setProcesses([]);
		try {
			await sendJson("/api/terminal/claude-processes/kill-all");
		} catch {}
		setTimeout(() => {
			if (mountedRef.current) {
				void refetchProcesses();
			}
		}, 2000);
	}, [mountedRef, refetchProcesses, setProcesses]);
	return { processes, killProcess, killAll, refetch: refetchProcesses };
}
