import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { usePrompts } from "../../hooks/usePrompts.ts";
import { PromptDetailPanel } from "./PromptDetailPanel.tsx";
import type { Prompt } from "./support.ts";
import { CATEGORIES } from "./support.ts";

interface FormState {
	name: string;
	command: string;
	description: string;
	promptTemplate: string;
	category: string;
	tags: string;
	error: string;
	isSaving: boolean;
	isEditing: boolean;
	isCreating: boolean;
}

type FormAction =
	| { type: "reset" }
	| { type: "setField"; field: string; value: string }
	| { type: "setError"; error: string }
	| { type: "startSaving" }
	| { type: "stopSaving" }
	| { type: "startEdit"; prompt: Prompt }
	| { type: "startCreate" }
	| { type: "cancelEdit" }
	| { type: "finishEdit" }
	| { type: "finishCreate" };

const INITIAL_FORM: FormState = {
	name: "",
	command: "",
	description: "",
	promptTemplate: "",
	category: "custom",
	tags: "",
	error: "",
	isSaving: false,
	isEditing: false,
	isCreating: false,
};

function formReducer(state: FormState, action: FormAction): FormState {
	switch (action.type) {
		case "reset":
			return INITIAL_FORM;
		case "setField":
			return { ...state, [action.field]: action.value };
		case "setError":
			return { ...state, error: action.error };
		case "startSaving":
			return { ...state, isSaving: true, error: "" };
		case "stopSaving":
			return { ...state, isSaving: false };
		case "startEdit":
			return {
				...state,
				isEditing: true,
				name: action.prompt.name,
				command: action.prompt.command,
				description: action.prompt.description,
				promptTemplate: action.prompt.promptTemplate,
				category: action.prompt.category || "custom",
				tags: action.prompt.tags.join(", "),
				error: "",
			};
		case "startCreate":
			return { ...INITIAL_FORM, isCreating: true };
		case "cancelEdit":
			return INITIAL_FORM;
		case "finishEdit":
			return { ...state, isEditing: false };
		case "finishCreate":
			return INITIAL_FORM;
	}
}

export function PromptsPage() {
	const { prompts, createPrompt, updatePrompt, removePrompt } = usePrompts();
	const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
	const [filter, setFilter] = useState("all");
	const [search, setSearch] = useState("");
	const [form, formDispatch] = useReducer(formReducer, INITIAL_FORM);

	const handleFormChange = useCallback((field: string, value: string) => {
		formDispatch({ type: "setField", field, value });
	}, []);

	const cancelEdit = useCallback(() => {
		formDispatch({ type: "cancelEdit" });
	}, []);

	const startEdit = useCallback((p: Prompt) => {
		formDispatch({ type: "startEdit", prompt: p });
	}, []);

	const startCreate = useCallback(() => {
		setSelectedPrompt(null);
		formDispatch({ type: "startCreate" });
	}, []);

	const selectPrompt = (p: Prompt) => {
		if (form.isEditing || form.isCreating) cancelEdit();
		setSelectedPrompt(p);
	};

	const handleSave = async (isInlineEdit = false) => {
		if (
			!form.name.trim() ||
			!form.command.trim() ||
			!form.promptTemplate.trim()
		) {
			formDispatch({
				type: "setError",
				error: "Name, command, and template are required",
			});
			return;
		}
		const cmd = form.command.trim().toLowerCase().replace(/^\//, "");
		if (!/^[a-z][a-z0-9-]*$/.test(cmd)) {
			formDispatch({
				type: "setError",
				error: "Command: letters, numbers, hyphens only",
			});
			return;
		}
		formDispatch({ type: "startSaving" });
		try {
			const data = {
				name: form.name.trim(),
				command: cmd,
				description: form.description.trim() || form.name.trim(),
				promptTemplate: form.promptTemplate.trim(),
				category: form.category,
				tags: form.tags
					.split(",")
					.map((t) => t.trim())
					.filter(Boolean),
			};
			if (isInlineEdit && selectedPrompt) {
				await updatePrompt(selectedPrompt._id, data);
				formDispatch({ type: "finishEdit" });
			} else if (form.isCreating) {
				await createPrompt(data);
				formDispatch({ type: "finishCreate" });
			}
		} catch (e) {
			formDispatch({
				type: "setError",
				error: e instanceof Error ? e.message : "Failed to save",
			});
		} finally {
			formDispatch({ type: "stopSaving" });
		}
	};

	const handleDelete = async (p: Prompt) => {
		if (p.isBuiltIn || !confirm(`Delete /${p.command}?`)) return;
		try {
			await removePrompt(p._id);
		} catch {}
	};

	const filtered = prompts.filter((p) => {
		if (filter !== "all") {
			if (filter === "builtin" && !p.isBuiltIn) return false;
			if (filter === "custom" && p.isBuiltIn) return false;
			if (filter !== "builtin" && filter !== "custom" && p.category !== filter)
				return false;
		}
		if (search) {
			const q = search.toLowerCase();
			return (
				p.name.toLowerCase().includes(q) ||
				p.command.toLowerCase().includes(q) ||
				p.description.toLowerCase().includes(q)
			);
		}
		return true;
	});

	return (
		<div className="flex h-full flex-col bg-surgent-bg">
			{/* Toolbar — matches Terminal/Git page style */}
			<div className="shrink-0 flex items-center gap-2 px-3 h-12 border-b border-surgent-border bg-surgent-bg">
				<FilterDropdown filter={filter} onFilterChange={setFilter} />

				<div className="relative">
					<svg
						aria-hidden="true"
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						className="absolute left-2 top-1/2 -translate-y-1/2 text-surgent-text-3 pointer-events-none"
					>
						<circle cx="11" cy="11" r="8" />
						<path d="m21 21-4.3-4.3" />
					</svg>
					<input
						type="text"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search..."
						className="h-7 w-44 rounded-lg border border-surgent-border bg-surgent-surface pl-7 pr-2 text-[11px] text-surgent-text placeholder-surgent-text-3 outline-none"
					/>
				</div>

				<span className="text-[9px] tabular-nums text-surgent-text-3">
					{filtered.length}
				</span>

				<span className="flex-1" />

				<button
					type="button"
					onClick={startCreate}
					className="flex items-center gap-1 h-7 rounded-lg border border-surgent-border bg-surgent-surface px-2.5 text-[11px] text-surgent-text-2 hover:bg-surgent-surface-2 transition-colors"
				>
					<svg
						aria-hidden="true"
						width="10"
						height="10"
						viewBox="0 0 12 12"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
					>
						<path d="M6 2v8M2 6h8" />
					</svg>
					New
				</button>
			</div>

			{/* Content */}
			<div className="flex flex-1 min-h-0 overflow-hidden">
				{/* Prompt list */}
				<div className="flex-1 overflow-y-auto">
					{filtered.length === 0 ? (
						<div className="flex items-center justify-center h-full">
							<div className="text-center">
								<p className="text-[11px] text-surgent-text-3 mb-1">
									{search ? "No prompts found" : "No prompts yet"}
								</p>
								<p className="text-[9px] text-surgent-text-3/50">
									{search
										? "Try a different search"
										: "Create your first prompt"}
								</p>
							</div>
						</div>
					) : (
						<div
							className={`grid gap-2 p-3 ${selectedPrompt || form.isCreating ? "grid-cols-3" : "grid-cols-4"}`}
						>
							{filtered.map((prompt) => {
								const isActive = selectedPrompt?._id === prompt._id;
								return (
									<button
										type="button"
										key={prompt._id}
										onClick={() => selectPrompt(prompt)}
										className={`text-left rounded-lg border p-3 transition-colors ${
											isActive
												? "border-surgent-accent/30 bg-surgent-text/[0.04]"
												: "border-surgent-border hover:bg-surgent-text/[0.03] hover:border-surgent-border-bold"
										}`}
									>
										<div className="flex items-center gap-2 mb-1.5">
											<span className="text-[10px] font-mono font-medium text-surgent-text">
												/{prompt.command}
											</span>
											{prompt.isBuiltIn && (
												<span className="text-[7px] text-surgent-text-3/50 bg-surgent-text/[0.04] px-1 py-0.5 rounded">
													built-in
												</span>
											)}
										</div>
										<p className="text-[10px] text-surgent-text-2 mb-1 truncate">
											{prompt.name}
										</p>
										<p className="text-[9px] text-surgent-text-3 line-clamp-2 leading-relaxed">
											{prompt.description}
										</p>
										{prompt.executionCount > 0 && (
											<p className="mt-2 text-[8px] tabular-nums text-surgent-text-3/40">
												{prompt.executionCount} uses
											</p>
										)}
									</button>
								);
							})}
						</div>
					)}
				</div>

				{/* Detail panel */}
				{(selectedPrompt || form.isCreating) && (
					<div className="w-[420px] shrink-0 border-l border-surgent-border overflow-y-auto bg-surgent-bg">
						<PromptDetailPanel
							selectedPrompt={selectedPrompt}
							isCreatingNew={form.isCreating}
							isEditing={form.isEditing}
							isSaving={form.isSaving}
							formCommand={form.command}
							formName={form.name}
							formDescription={form.description}
							formPromptTemplate={form.promptTemplate}
							formCategory={form.category}
							formTags={form.tags}
							formError={form.error}
							onFormChange={handleFormChange}
							onStartEditing={() => selectedPrompt && startEdit(selectedPrompt)}
							onCancelEditing={cancelEdit}
							onSave={handleSave}
							onDelete={() => {
								if (selectedPrompt) {
									handleDelete(selectedPrompt);
									setSelectedPrompt(null);
									formDispatch({ type: "cancelEdit" });
								}
							}}
							onClose={() => {
								if (form.isEditing || form.isCreating) cancelEdit();
								setSelectedPrompt(null);
							}}
						/>
					</div>
				)}
			</div>
		</div>
	);
}

const FILTER_OPTIONS = [
	{ value: "all", label: "All prompts" },
	{ value: "builtin", label: "Built-in" },
	{ value: "custom", label: "Custom" },
	...CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
];

function FilterDropdown({
	filter,
	onFilterChange,
}: {
	filter: string;
	onFilterChange: (v: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node))
				setOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	const activeLabel =
		FILTER_OPTIONS.find((o) => o.value === filter)?.label || "All prompts";

	return (
		<div ref={ref} className="relative">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="flex items-center gap-1.5 h-7 rounded-lg border border-surgent-border bg-surgent-surface px-2.5 text-[11px] text-surgent-text-2 hover:bg-surgent-surface-2 transition-colors"
			>
				{activeLabel}
				<svg
					aria-hidden="true"
					width="8"
					height="8"
					viewBox="0 0 8 8"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					className={`transition-transform ${open ? "rotate-180" : ""}`}
				>
					<path d="M1.5 3L4 5.5L6.5 3" />
				</svg>
			</button>
			{open && (
				<div className="absolute left-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-surgent-border bg-surgent-surface p-1 shadow-2xl">
					{FILTER_OPTIONS.map((opt) => (
						<button
							type="button"
							key={opt.value}
							onClick={() => {
								onFilterChange(opt.value);
								setOpen(false);
							}}
							className={`w-full text-left rounded-md px-2.5 py-1.5 text-[10px] transition-colors ${
								filter === opt.value
									? "bg-surgent-text/[0.06] text-surgent-text"
									: "text-surgent-text-3 hover:bg-surgent-text/[0.03] hover:text-surgent-text-2"
							}`}
						>
							{opt.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
