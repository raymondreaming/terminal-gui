import { useCallback } from "react";

import { fetchJsonOr, sendJson } from "../lib/fetch-json.ts";

import { usePollingResource } from "./usePollingResource.ts";

export interface RunningPort {
	port: number;
	pid: number;
	command: string;
	name: string;
}

export function useRunningPorts(pollInterval = 10000) {
	const fetchPorts = useCallback(async (signal?: AbortSignal) => {
		const data = await fetchJsonOr<{ ports?: RunningPort[] }>(
			"/api/terminal/ports",
			{},
			{ signal }
		);
		return data.ports || [];
	}, []);
	const {
		data: ports,
		setData: setPorts,
		refetch: refetchPorts,
		mountedRef,
	} = usePollingResource(fetchPorts, pollInterval, [] as RunningPort[], {
		deferInitialFetch: true,
	});
	const killPort = useCallback(
		async (pid: number) => {
			try {
				const res = await sendJson("/api/terminal/ports/kill", { pid });
				if (res.ok) {
					setPorts((prev) => prev.filter((p) => p.pid !== pid));
					setTimeout(() => {
						if (mountedRef.current) {
							void refetchPorts();
						}
					}, 500);
				}
			} catch (e) {
				console.error("Failed to kill port:", e);
			}
		},
		[mountedRef, refetchPorts, setPorts]
	);
	const openInBrowser = useCallback((port: number) => {
		window.open(`http://localhost:${port}`, "_blank");
	}, []);
	return { ports, killPort, openInBrowser, refetch: refetchPorts };
}
