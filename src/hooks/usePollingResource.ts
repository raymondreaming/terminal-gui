import { useCallback, useEffect, useRef, useState } from "react";

function isAbortLikeError(error: unknown): boolean {
	if (error instanceof DOMException) return error.name === "AbortError";
	if (error instanceof Error) {
		const message = error.message.toLowerCase();
		return (
			error.name === "AbortError" ||
			message.includes("aborted") ||
			message.includes("load failed")
		);
	}
	return false;
}

export function usePollingResource<T>(
	fetcher: (signal?: AbortSignal) => Promise<T>,
	pollInterval: number,
	initialValue: T
) {
	const [data, setData] = useState(initialValue);
	const mountedRef = useRef(true);
	const dataRef = useRef(data);
	dataRef.current = data;
	const refetch = useCallback(
		async (signal?: AbortSignal) => {
			try {
				const next = await fetcher(signal);
				if (mountedRef.current) {
					setData(next);
				}
				return next;
			} catch (error) {
				if (signal?.aborted || isAbortLikeError(error)) {
					return dataRef.current;
				}
				throw error;
			}
		},
		[fetcher]
	);
	useEffect(() => {
		mountedRef.current = true;
		const controller = new AbortController();
		void refetch(controller.signal);
		const interval = window.setInterval(() => {
			void refetch(controller.signal);
		}, pollInterval);
		return () => {
			mountedRef.current = false;
			controller.abort();
			window.clearInterval(interval);
		};
	}, [pollInterval, refetch]);
	return { data, setData, refetch, mountedRef };
}
