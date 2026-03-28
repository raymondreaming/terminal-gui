import { useCallback, useEffect, useState } from "react";
import { fetchJson, postJson, sendJson } from "../lib/fetch-json.ts";
import type { Prompt } from "../pages/PromptsPage/support.ts";

export function usePrompts() {
	const [prompts, setPrompts] = useState<Prompt[]>([]);

	const reload = useCallback(async () => {
		const data = await fetchJson<Prompt[]>("/api/prompts");
		if (data) setPrompts(data);
	}, []);

	useEffect(() => {
		reload();
	}, [reload]);

	const createPrompt = useCallback(
		async (data: {
			name: string;
			command: string;
			description: string;
			promptTemplate: string;
			category?: string;
			tags?: string[];
		}) => {
			await postJson("/api/prompts", data);
			await reload();
		},
		[reload]
	);

	const updatePrompt = useCallback(
		async (id: string, data: Record<string, unknown>) => {
			await sendJson(`/api/prompts/${id}`, data, { method: "PUT" });
			await reload();
		},
		[reload]
	);

	const removePrompt = useCallback(
		async (id: string) => {
			await fetch(`/api/prompts/${id}`, { method: "DELETE" });
			await reload();
		},
		[reload]
	);

	const incrementUsage = useCallback(async (id: string) => {
		await postJson(`/api/prompts/${id}/usage`, {});
	}, []);

	return {
		prompts,
		createPrompt,
		updatePrompt,
		removePrompt,
		incrementUsage,
		reload,
	};
}
