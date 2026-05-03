import { useCallback, useEffect, useState } from "react";

/**
 * Generic async resource hook. Tracks loading/error state for an arbitrary
 * fetcher and re-runs whenever `deps` change. Return `null` from `fetcher`
 * to indicate "no input yet" (skips loading state).
 */
export function useAsyncResource<T>(
	fetcher: () => Promise<T> | null,
	initial: T,
	deps: React.DependencyList
) {
	const [data, setData] = useState<T>(initial);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: deps are explicit
	const refresh = useCallback(async () => {
		const promise = fetcher();
		if (!promise) {
			setData(initial);
			return;
		}
		setLoading(true);
		setError(null);
		try {
			setData(await promise);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
			setData(initial);
		} finally {
			setLoading(false);
		}
	}, deps);

	useEffect(() => {
		refresh();
	}, [refresh]);

	return { data, setData, loading, error, refresh };
}
