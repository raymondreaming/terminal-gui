import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJsonOr } from "../../lib/fetch-json.ts";
import type { SlashCommand } from "./agent-chat-shared.ts";
import { findTriggerAtCursor } from "./chat-agent-utils.ts";
import { applyInlineCompletion } from "./chat-command-utils.ts";

interface MenuPosition {
	top: number;
	left: number;
	width: number;
	maxHeight: number;
}

interface FileMenuState {
	show: boolean;
	selectedIdx: number;
	query: string;
	atIndex: number;
	position: MenuPosition | null;
}

interface SlashMenuState {
	show: boolean;
	selectedIdx: number;
	query: string;
	slashIndex: number;
}

interface FileSearchResult {
	name: string;
	path: string;
	isDir: boolean;
}

interface UseAgentChatMenusOptions {
	cwd?: string;
	input: string;
	setInput: (value: string) => void;
	allCommands: SlashCommand[];
	textareaRef: React.RefObject<HTMLTextAreaElement | null>;
	inputContainerRef: React.RefObject<HTMLDivElement | null>;
	containerRef: React.RefObject<HTMLDivElement | null>;
}

export function useAgentChatMenus({
	cwd,
	input,
	setInput,
	allCommands,
	textareaRef,
	inputContainerRef,
	containerRef,
}: UseAgentChatMenusOptions) {
	const [fileMenu, setFileMenu] = useState<FileMenuState>({
		show: false,
		selectedIdx: 0,
		query: "",
		atIndex: -1,
		position: null,
	});
	const [slashMenu, setSlashMenu] = useState<SlashMenuState>({
		show: false,
		selectedIdx: 0,
		query: "",
		slashIndex: -1,
	});
	const [fileResults, setFileResults] = useState<FileSearchResult[]>([]);
	const fileSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const cachedRects = useRef<{ input: DOMRect; container: DOMRect } | null>(
		null
	);

	const slashCommandInfo = useMemo(() => {
		if (!slashMenu.show || slashMenu.slashIndex === -1) {
			return { filtered: [] as SlashCommand[] };
		}
		const query = slashMenu.query.toLowerCase();
		const filtered = allCommands.filter((cmd) =>
			cmd.name.toLowerCase().startsWith(query)
		);
		return { filtered };
	}, [allCommands, slashMenu.query, slashMenu.show, slashMenu.slashIndex]);

	const filteredCommands = slashCommandInfo.filtered;
	const showCommands = slashMenu.show && filteredCommands.length > 0;

	useEffect(() => {
		const inputEl = inputContainerRef.current;
		const containerEl = containerRef.current;
		if (!inputEl || !containerEl) return;
		const update = () => {
			cachedRects.current = {
				input: inputEl.getBoundingClientRect(),
				container: containerEl.getBoundingClientRect(),
			};
		};
		update();
		const obs = new ResizeObserver(update);
		obs.observe(inputEl);
		obs.observe(containerEl);
		return () => obs.disconnect();
	}, [containerRef, inputContainerRef]);

	useEffect(
		() => () => {
			if (fileSearchTimerRef.current) clearTimeout(fileSearchTimerRef.current);
		},
		[]
	);

	const getMenuPosition = useCallback(
		(maxHeight: number): MenuPosition | null => {
			const rects = cachedRects.current;
			if (!rects) return null;
			const availableHeight = rects.input.top - rects.container.top - 16;
			return {
				top: rects.input.top,
				left: rects.input.left,
				width: rects.input.width,
				maxHeight: Math.min(availableHeight * 0.75, maxHeight),
			};
		},
		[]
	);

	const handleInputForSlashMenu = useCallback(
		(value: string, cursorPos: number) => {
			const trigger = findTriggerAtCursor(value, cursorPos, "/");
			if (!trigger) {
				if (slashMenu.show) setSlashMenu((prev) => ({ ...prev, show: false }));
				return;
			}

			setSlashMenu({
				show: true,
				selectedIdx: 0,
				query: trigger.query,
				slashIndex: trigger.index,
			});
		},
		[slashMenu.show]
	);

	const handleInputForFileMenu = useCallback(
		(value: string, cursorPos: number) => {
			const trigger = findTriggerAtCursor(value, cursorPos, "@");
			if (!trigger) {
				if (fileMenu.show) setFileMenu((prev) => ({ ...prev, show: false }));
				return;
			}

			let position = fileMenu.position;
			const nextPosition = getMenuPosition(300);
			if (nextPosition) position = nextPosition;

			setFileMenu({
				show: true,
				selectedIdx: 0,
				query: trigger.query,
				atIndex: trigger.index,
				position,
			});

			if (fileSearchTimerRef.current) clearTimeout(fileSearchTimerRef.current);
			fileSearchTimerRef.current = setTimeout(async () => {
				const params = new URLSearchParams({
					q: trigger.query,
					limit: "15",
				});
				if (cwd) params.set("cwd", cwd);
				const data = await fetchJsonOr<{ results?: FileSearchResult[] }>(
					`/api/files/search?${params}`,
					{}
				);
				setFileResults(data.results || []);
			}, 150);
		},
		[cwd, fileMenu.position, fileMenu.show, getMenuPosition]
	);

	const selectCommand = useCallback(
		(idx: number) => {
			const cmd = filteredCommands[idx];
			if (!cmd) return;
			const cursorPos = textareaRef.current?.selectionStart ?? input.length;
			const { nextValue, nextCursor } = applyInlineCompletion(
				input,
				cursorPos,
				slashMenu.slashIndex,
				`/${cmd.name}`
			);
			setInput(nextValue);
			setSlashMenu((prev) => ({ ...prev, show: false }));
			requestAnimationFrame(() => {
				const textarea = textareaRef.current;
				if (!textarea) return;
				textarea.focus();
				textarea.setSelectionRange(nextCursor, nextCursor);
			});
		},
		[filteredCommands, input, setInput, slashMenu.slashIndex, textareaRef]
	);

	const selectFile = useCallback(
		(idx: number) => {
			const file = fileResults[idx];
			if (!file) return;
			const cursorPos = textareaRef.current?.selectionStart ?? input.length;
			const { nextValue, nextCursor } = applyInlineCompletion(
				input,
				cursorPos,
				fileMenu.atIndex,
				`@${file.path}`
			);
			setInput(nextValue);
			setFileMenu((prev) => ({ ...prev, show: false }));
			requestAnimationFrame(() => {
				const textarea = textareaRef.current;
				if (!textarea) return;
				textarea.focus();
				textarea.setSelectionRange(nextCursor, nextCursor);
			});
		},
		[fileMenu.atIndex, fileResults, input, setInput, textareaRef]
	);

	return {
		fileMenu,
		setFileMenu,
		fileResults,
		slashMenu,
		setSlashMenu,
		filteredCommands,
		showCommands,
		handleInputForFileMenu,
		handleInputForSlashMenu,
		selectCommand,
		selectFile,
	};
}
