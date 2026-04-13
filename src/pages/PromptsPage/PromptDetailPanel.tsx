import { useEffect, useRef } from "react";
import { IconPencil, IconTrash, IconX } from "../../components/ui/Icons.tsx";
import { measureTextHeight } from "../../lib/pretext-utils.ts";
import { CATEGORIES, type Prompt } from "./support.ts";

interface PromptDetailPanelProps {
	selectedPrompt: Prompt | null;
	isCreatingNew: boolean;
	isEditing: boolean;
	isSaving: boolean;
	formCommand: string;
	formName: string;
	formDescription: string;
	formPromptTemplate: string;
	formCategory: string;
	formTags: string;
	formError: string;
	onFormChange: (field: string, value: string) => void;
	onStartEditing: () => void;
	onCancelEditing: () => void;
	onSave: (isInlineEdit: boolean) => void;
	onDelete: () => void;
	onClose: () => void;
}

const label =
	"text-[9px] font-medium uppercase tracking-[0.08em] text-inferay-text-3";
const inputCls =
	"mt-1 w-full rounded-md bg-transparent border border-inferay-border px-2 py-1.5 text-[11px] text-inferay-text placeholder:text-inferay-text-3 outline-none focus:border-inferay-text-3";
const MONO_FONT = '11px "Geist Mono", "SF Mono", Menlo, Consolas, monospace';

function AutoTextarea({
	value,
	onChange,
	placeholder,
}: {
	value: string;
	onChange: (v: string) => void;
	placeholder: string;
}) {
	const ref = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		const ta = ref.current;
		if (!ta) return;
		const width = ta.clientWidth - 24;
		if (width > 0 && value) {
			const h = measureTextHeight(value, width, MONO_FONT, 18);
			ta.style.height = `${Math.min(Math.max(h + 24, 100), 300)}px`;
		} else {
			ta.style.height = "100px";
		}
	}, [value]);

	return (
		<textarea
			ref={ref}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder}
			className="mt-1 w-full rounded-md bg-inferay-surface border border-inferay-border p-3 font-mono text-[11px] text-inferay-text placeholder:text-inferay-text-3 outline-none focus:border-inferay-text-3 resize-none leading-[18px]"
			style={{ minHeight: 100, maxHeight: 300 }}
		/>
	);
}

export function PromptDetailPanel({
	selectedPrompt,
	isCreatingNew,
	isEditing,
	isSaving,
	formCommand,
	formName,
	formDescription,
	formPromptTemplate,
	formCategory,
	formTags,
	formError,
	onFormChange,
	onStartEditing,
	onCancelEditing,
	onSave,
	onDelete,
	onClose,
}: PromptDetailPanelProps) {
	const isEditMode = isCreatingNew || isEditing;

	return (
		<div className="flex h-full flex-col bg-inferay-bg overflow-hidden">
			{/* Header */}
			<div className="flex items-center justify-between border-b border-inferay-border px-4 h-10">
				<div className="flex items-center gap-2">
					{isEditMode ? (
						<div className="flex items-center gap-0.5">
							<span className="text-inferay-text-3 font-mono text-[11px]">
								/
							</span>
							<input
								type="text"
								value={formCommand}
								onChange={(e) =>
									onFormChange(
										"command",
										e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
									)
								}
								placeholder="command"
								className="w-24 rounded-md bg-inferay-surface py-1 px-1.5 text-[11px] font-mono text-inferay-text outline-none focus:border-inferay-text-3 placeholder:text-inferay-text-3"
							/>
						</div>
					) : selectedPrompt ? (
						<span className="text-[11px] font-mono text-inferay-text">
							/{selectedPrompt.command}
						</span>
					) : null}
					{selectedPrompt?.isBuiltIn && !isCreatingNew && (
						<span className="text-[7px] text-inferay-text-3/50 bg-inferay-text/[0.04] px-1 py-0.5 rounded">
							built-in
						</span>
					)}
					{isCreatingNew && (
						<span className="text-[7px] text-inferay-text-3 bg-inferay-text/[0.06] px-1 py-0.5 rounded">
							new
						</span>
					)}
				</div>
				<div className="flex items-center gap-1">
					{isCreatingNew ? (
						<>
							<button
								type="button"
								onClick={onCancelEditing}
								className="h-6 px-2 rounded text-[10px] text-inferay-text-3 hover:bg-inferay-text/[0.05]"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={() => onSave(false)}
								disabled={isSaving}
								className="h-6 px-2 rounded text-[10px] text-inferay-text bg-inferay-text/[0.08] hover:bg-inferay-text/[0.12]"
							>
								{isSaving ? "..." : "Create"}
							</button>
						</>
					) : isEditing ? (
						<>
							<button
								type="button"
								onClick={onCancelEditing}
								className="h-6 px-2 rounded text-[10px] text-inferay-text-3 hover:bg-inferay-text/[0.05]"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={() => onSave(true)}
								disabled={isSaving}
								className="h-6 px-2 rounded text-[10px] text-inferay-text bg-inferay-text/[0.08] hover:bg-inferay-text/[0.12]"
							>
								{isSaving ? "..." : "Save"}
							</button>
						</>
					) : (
						<>
							<button
								type="button"
								onClick={onStartEditing}
								className="h-6 w-6 rounded flex items-center justify-center text-inferay-text-3 hover:bg-inferay-text/[0.05]"
							>
								<IconPencil size={12} />
							</button>
							{selectedPrompt && !selectedPrompt.isBuiltIn && (
								<button
									type="button"
									onClick={onDelete}
									className="h-6 w-6 rounded flex items-center justify-center text-inferay-text-3 hover:bg-inferay-text/[0.05]"
								>
									<IconTrash size={12} />
								</button>
							)}
						</>
					)}
					<button
						type="button"
						onClick={onClose}
						className="h-6 w-6 rounded flex items-center justify-center text-inferay-text-3 hover:bg-inferay-text/[0.05]"
					>
						<IconX size={12} />
					</button>
				</div>
			</div>

			{/* Body */}
			<div className="flex-1 overflow-y-auto p-4 space-y-3">
				<div className="flex gap-3">
					<div className="flex-1">
						<span className={label}>Name</span>
						{isEditMode ? (
							<input
								type="text"
								value={formName}
								onChange={(e) => onFormChange("name", e.target.value)}
								placeholder="Prompt name"
								className={inputCls}
							/>
						) : (
							<p className="mt-1 text-[11px] text-inferay-text">
								{selectedPrompt?.name}
							</p>
						)}
					</div>
					<div className="w-28">
						<span className={label}>Category</span>
						{isEditMode ? (
							<select
								value={formCategory}
								onChange={(e) => onFormChange("category", e.target.value)}
								className={inputCls}
							>
								{CATEGORIES.map((c) => (
									<option key={c.value} value={c.value}>
										{c.label}
									</option>
								))}
							</select>
						) : (
							<p className="mt-1 text-[11px] text-inferay-text-2">
								{selectedPrompt?.category}
							</p>
						)}
					</div>
				</div>

				<div>
					<span className={label}>Description</span>
					{isEditMode ? (
						<textarea
							value={formDescription}
							onChange={(e) => onFormChange("description", e.target.value)}
							rows={2}
							placeholder="What this prompt does"
							className={`${inputCls} resize-none`}
						/>
					) : (
						<p className="mt-1 text-[11px] text-inferay-text-2 leading-relaxed">
							{selectedPrompt?.description}
						</p>
					)}
				</div>

				<div>
					<span className={label}>
						Template
						{isEditMode && (
							<span className="ml-1 normal-case font-normal text-inferay-text-3/50">
								use {"{args}"} for input
							</span>
						)}
					</span>
					{isEditMode ? (
						<AutoTextarea
							value={formPromptTemplate}
							onChange={(v) => onFormChange("promptTemplate", v)}
							placeholder="Enter prompt template..."
						/>
					) : (
						<div className="mt-1 rounded-md bg-inferay-surface border border-inferay-border p-3 font-mono text-[11px] text-inferay-text-2 whitespace-pre-wrap leading-[18px] max-h-[300px] overflow-y-auto">
							{selectedPrompt?.promptTemplate}
						</div>
					)}
				</div>

				<div>
					<span className={label}>Tags</span>
					{isEditMode ? (
						<input
							type="text"
							value={formTags}
							onChange={(e) => onFormChange("tags", e.target.value)}
							placeholder="code, review, quality"
							className={inputCls}
						/>
					) : selectedPrompt && selectedPrompt.tags.length > 0 ? (
						<div className="mt-1 flex flex-wrap gap-1">
							{selectedPrompt.tags.map((tag) => (
								<span
									key={tag}
									className="rounded bg-inferay-text/[0.04] px-1.5 py-0.5 text-[9px] text-inferay-text-3"
								>
									{tag}
								</span>
							))}
						</div>
					) : (
						<p className="mt-1 text-[9px] text-inferay-text-3/40">No tags</p>
					)}
				</div>

				{!isEditMode && selectedPrompt && (
					<p className="text-[9px] text-inferay-text-3/40 tabular-nums">
						{selectedPrompt.executionCount} uses
					</p>
				)}

				{formError && (
					<p className="text-[10px] text-inferay-error">{formError}</p>
				)}
			</div>
		</div>
	);
}
