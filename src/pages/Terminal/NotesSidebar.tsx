import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
	IconChevronDown,
	IconChevronRight,
	IconPencil,
} from "../../components/ui/Icons.tsx";
import { fetchJsonOr, sendJson } from "../../lib/fetch-json.ts";

interface NotesSidebarProps {
	groupId: string | null;
	expanded: boolean;
	onToggle: () => void;
	onNotesChange?: (notes: string) => void;
}

export const NotesSidebar = memo(function NotesSidebar({
	groupId,
	expanded,
	onToggle,
	onNotesChange,
}: NotesSidebarProps) {
	const [text, setText] = useState("");
	const [loaded, setLoaded] = useState(false);
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (!groupId) return;
		setLoaded(false);
		fetchJsonOr<Record<string, string>>("/api/notes", {}).then((notes) => {
			const val = notes[groupId] ?? "";
			setText(val);
			setLoaded(true);
			onNotesChange?.(val);
		});
	}, [groupId]);

	const save = useCallback(
		(value: string) => {
			if (!groupId) return;
			onNotesChange?.(value);
			if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
			saveTimerRef.current = setTimeout(() => {
				sendJson(
					"/api/notes",
					{ groupId, text: value },
					{ method: "PUT" }
				).catch(() => {});
			}, 500);
		},
		[groupId, onNotesChange]
	);

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			const val = e.target.value;
			setText(val);
			save(val);
		},
		[save]
	);

	return (
		<div className="border-t border-surgent-border">
			<button
				type="button"
				onClick={onToggle}
				className="flex items-center gap-1.5 px-2 py-1.5 w-full text-surgent-text-3 hover:text-surgent-text-2 transition-colors"
			>
				{expanded ? (
					<IconChevronDown size={10} />
				) : (
					<IconChevronRight size={10} />
				)}
				<IconPencil size={10} />
				<span className="text-[9px] font-bold tracking-widest uppercase">
					Notes
				</span>
				{text.trim().length > 0 && (
					<span className="ml-auto h-1.5 w-1.5 rounded-full bg-surgent-accent" />
				)}
			</button>
			{expanded && (
				<div className="px-2 pb-2">
					<textarea
						value={text}
						onChange={handleChange}
						placeholder="Add notes for this workspace. Notes are injected as system prompt context for all agents."
						disabled={!loaded}
						rows={5}
						className="w-full resize-y rounded-md border border-surgent-border bg-surgent-bg px-2 py-1.5 text-[11px] text-surgent-text placeholder:text-surgent-text-3 outline-none focus:border-surgent-text-3 transition-colors"
					/>
				</div>
			)}
		</div>
	);
});
