import React, { useCallback, useMemo, useState } from "react";
import { IconCheck, IconCopy, IconHelpCircle, IconSend } from "../ui/Icons.tsx";
import { parseInlineTokens, parseMarkdownBlocks } from "./chat-text.ts";

type ChatTheme = {
	bg: string;
	fg: string;
	cursor: string;
	surface: string;
	border: string;
	fgMuted: string;
	fgDim: string;
};

function CopyButton({
	text,
	theme,
	className,
}: {
	text: string;
	theme?: ChatTheme;
	className?: string;
}) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(() => {
		navigator.clipboard
			.writeText(text)
			.then(() => {
				setCopied(true);
				setTimeout(() => setCopied(false), 1500);
			})
			.catch(() => {});
	}, [text]);

	return (
		<button
			type="button"
			onClick={handleCopy}
			className={`flex items-center justify-center h-5 w-5 rounded transition-colors ${className ?? ""}`}
			style={{
				backgroundColor: theme
					? theme.surface
					: "var(--color-inferay-dark-gray)",
				color: copied
					? "#22c55e"
					: theme
						? theme.fgDim
						: "var(--color-inferay-muted-gray)",
			}}
			title={copied ? "Copied!" : "Copy"}
		>
			{copied ? <IconCheck size={10} /> : <IconCopy size={10} />}
		</button>
	);
}

export function Inline({
	text,
	theme,
	onMdFileClick,
}: {
	text: string;
	theme?: ChatTheme;
	onMdFileClick?: (path: string) => void;
}) {
	const tokens = useMemo(() => parseInlineTokens(text), [text]);
	const linkStyle = theme ? { color: `${theme.cursor}cc` } : undefined;
	return (
		<>
			{tokens.map((token, i) => {
				const partKey = `${i}-${token.type}`;
				if (token.type === "code") {
					const cs = theme
						? { backgroundColor: theme.surface, color: `${theme.cursor}cc` }
						: undefined;
					return (
						<code
							key={partKey}
							className="rounded px-0.5 font-mono text-[10px]"
							style={cs}
						>
							{token.value}
						</code>
					);
				}
				if (token.type === "bold") {
					return (
						<strong
							key={partKey}
							className="font-medium"
							style={theme ? { color: theme.fg } : undefined}
						>
							{token.value}
						</strong>
					);
				}
				if (token.type === "italic") {
					return (
						<em
							key={partKey}
							style={theme ? { color: theme.fgMuted } : undefined}
						>
							{token.value}
						</em>
					);
				}
				if (token.type === "markdown_link") {
					return (
						<a
							key={partKey}
							href={token.href}
							target="_blank"
							rel="noopener noreferrer"
							className="hover:underline"
							style={linkStyle}
						>
							{token.label}
						</a>
					);
				}
				if (token.type === "markdown_path" && onMdFileClick) {
					return (
						<button
							key={partKey}
							type="button"
							onClick={() => onMdFileClick(token.value)}
							className="underline decoration-current/30 hover:decoration-current/60 cursor-pointer"
							style={linkStyle}
						>
							{token.value}
						</button>
					);
				}
				if (token.type === "url") {
					return (
						<a
							key={partKey}
							href={token.href}
							target="_blank"
							rel="noopener noreferrer"
							className="underline decoration-current/30 hover:decoration-current/60"
							style={linkStyle}
						>
							{token.value}
						</a>
					);
				}
				return <React.Fragment key={partKey}>{token.value}</React.Fragment>;
			})}
		</>
	);
}

export function Markdown({
	text,
	theme,
	onMdFileClick,
}: {
	text: string;
	theme?: ChatTheme;
	onMdFileClick?: (path: string) => void;
}) {
	const blocks = useMemo(() => parseMarkdownBlocks(text), [text]);
	return (
		<div className="min-w-0 space-y-1 break-words">
			{blocks.map((b, i) => {
				const blockKey = `${b.type}-${i}`;
				if (b.type === "code") {
					return (
						<div key={blockKey} className="group/code relative">
							<pre
								className="overflow-x-auto rounded border px-2 py-1.5 font-mono text-[10px] leading-relaxed"
								style={
									theme
										? {
												backgroundColor: theme.surface,
												borderColor: theme.border,
												color: theme.fgMuted,
											}
										: undefined
								}
							>
								{b.content}
							</pre>
							<div className="absolute top-1 right-1 opacity-0 group-hover/code:opacity-100 transition-opacity">
								<CopyButton text={b.content} theme={theme} />
							</div>
						</div>
					);
				}
				if (b.type === "heading") {
					return (
						<p
							key={blockKey}
							className="font-medium text-[11px]"
							style={theme ? { color: theme.fg } : undefined}
						>
							{b.content}
						</p>
					);
				}
				if (b.type === "list-item") {
					return (
						<div key={blockKey} className="flex gap-1 pl-0.5 text-[12px]">
							<span
								className="shrink-0 select-none"
								style={theme ? { color: theme.fgDim } : undefined}
							>
								{b.bullet}
							</span>
							<span className="min-w-0">
								<Inline
									text={b.content}
									theme={theme}
									onMdFileClick={onMdFileClick}
								/>
							</span>
						</div>
					);
				}
				if (b.type === "table") {
					return (
						<div
							key={blockKey}
							className="max-w-full overflow-auto rounded border text-[10px]"
							style={{
								borderColor: "var(--color-inferay-gray-border)",
								backgroundColor: "var(--color-inferay-dark-gray)",
							}}
						>
							<table className="w-full border-collapse">
								<thead>
									<tr>
										{b.headers.map((h, hi) => (
											<th
												key={hi}
												className="px-2 py-1 text-left font-semibold whitespace-nowrap"
												style={{
													borderBottom:
														"1px solid var(--color-inferay-gray-border)",
													color: theme?.fg ?? "#e5e5e5",
													backgroundColor: "var(--color-inferay-dark-gray)",
												}}
											>
												{h}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{b.rows.map((row, ri) => (
										<tr key={ri}>
											{row.map((cell, ci) => (
												<td
													key={ci}
													className="px-2 py-1 whitespace-pre-wrap"
													style={{
														borderBottom:
															ri < b.rows.length - 1
																? "1px solid var(--color-inferay-gray-border)"
																: "none",
														color: theme?.fg ?? "#e5e5e5",
													}}
												>
													<Inline
														text={cell}
														theme={theme}
														onMdFileClick={onMdFileClick}
													/>
												</td>
											))}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					);
				}
				return (
					<p key={blockKey}>
						<Inline
							text={b.content}
							theme={theme}
							onMdFileClick={onMdFileClick}
						/>
					</p>
				);
			})}
		</div>
	);
}

export function AskUserQuestionCard({
	content,
	theme,
	isStreaming,
	onSendMessage,
}: {
	content: string;
	theme?: ChatTheme;
	isStreaming?: boolean;
	onSendMessage?: (text: string) => void;
}) {
	const parsed = useMemo(() => {
		try {
			const data = JSON.parse(content);
			if (data.questions && Array.isArray(data.questions))
				return data.questions as Array<{
					question: string;
					header?: string;
					options?: Array<{ label: string; description?: string }>;
					multiSelect?: boolean;
				}>;
		} catch {}
		return null;
	}, [content]);
	const [selections, setSelections] = useState<Map<number, Set<number>>>(
		new Map()
	);
	const [submitted, setSubmitted] = useState(false);
	const accentColor = theme?.cursor ?? "#007AFF";
	const surfaceBg = theme?.surface ?? "var(--color-inferay-dark-gray)";
	const borderClr = theme?.border ?? "var(--color-inferay-gray-border)";
	const fgColor = theme?.fg ?? "var(--color-inferay-white)";
	const fgMuted = theme?.fgMuted ?? "var(--color-inferay-soft-white)";
	const fgDim = theme?.fgDim ?? "var(--color-inferay-muted-gray)";

	const toggleOption = useCallback(
		(qi: number, oi: number, multiSelect: boolean) => {
			if (submitted) return;
			setSelections((prev) => {
				const next = new Map(prev);
				const current = new Set(prev.get(qi) ?? []);
				if (multiSelect) {
					current.has(oi) ? current.delete(oi) : current.add(oi);
				} else {
					current.clear();
					current.add(oi);
				}
				next.set(qi, current);
				return next;
			});
		},
		[submitted]
	);

	const hasSelections = useMemo(() => {
		if (!parsed) return false;
		return parsed.every((_, qi) => {
			const sel = selections.get(qi);
			return sel && sel.size > 0;
		});
	}, [parsed, selections]);

	const handleSubmit = useCallback(() => {
		if (!parsed || !onSendMessage || submitted) return;
		setSubmitted(true);
		const parts: string[] = [];
		for (let qi = 0; qi < parsed.length; qi++) {
			const q = parsed[qi]!;
			const sel = selections.get(qi);
			if (!sel || sel.size === 0) continue;
			const labels = Array.from(sel)
				.sort()
				.map((oi) => q.options?.[oi]?.label)
				.filter(Boolean);
			if (q.header) parts.push(`**${q.header}**: ${labels.join(", ")}`);
			else parts.push(labels.join(", "));
		}
		onSendMessage(parts.join("\n"));
	}, [onSendMessage, parsed, selections, submitted]);

	if (!parsed) {
		return (
			<pre
				className="mt-0.5 max-h-40 overflow-auto rounded-lg px-3 py-2 font-mono text-[9px] leading-relaxed whitespace-pre-wrap break-all"
				style={{
					backgroundColor: surfaceBg,
					color: fgDim,
					border: `1px solid ${borderClr}`,
				}}
			>
				{content}
			</pre>
		);
	}

	return (
		<div className="space-y-2 py-1">
			{parsed.map((q, qi) => {
				const qSelections = selections.get(qi) ?? new Set<number>();
				return (
					<div
						key={qi}
						className="rounded-lg overflow-hidden"
						style={{
							backgroundColor: surfaceBg,
							border: `1px solid ${borderClr}`,
						}}
					>
						<div
							className="flex items-center gap-2 px-3 py-1.5"
							style={{ borderBottom: `1px solid ${borderClr}` }}
						>
							<IconHelpCircle size={12} style={{ color: accentColor }} />
							{q.header && (
								<span
									className="rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider"
									style={{
										backgroundColor: `${accentColor}18`,
										color: accentColor,
									}}
								>
									{q.header}
								</span>
							)}
							{q.multiSelect && (
								<span
									className="text-[8px] uppercase tracking-wider"
									style={{ color: fgDim }}
								>
									multi-select
								</span>
							)}
							{isStreaming && (
								<span
									className="ml-auto h-1.5 w-1.5 rounded-full animate-pulse"
									style={{ backgroundColor: accentColor }}
								/>
							)}
						</div>
						<div className="px-3 pt-2 pb-1.5">
							<p
								className="text-[11px] font-medium leading-snug"
								style={{ color: fgColor }}
							>
								{q.question}
							</p>
						</div>
						{q.options && q.options.length > 0 && (
							<div className="px-3 pb-2.5 space-y-1">
								{q.options.map((opt, oi) => {
									const isSelected = qSelections.has(oi);
									return (
										<button
											type="button"
											key={oi}
											onClick={() => toggleOption(qi, oi, !!q.multiSelect)}
											disabled={submitted}
											className="flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-left transition-all"
											style={{
												backgroundColor: isSelected
													? `${accentColor}18`
													: theme
														? `${theme.bg}80`
														: "rgba(0,0,0,0.15)",
												border: `1px solid ${isSelected ? `${accentColor}50` : borderClr}`,
												cursor: submitted ? "default" : "pointer",
												opacity: submitted && !isSelected ? 0.4 : 1,
											}}
										>
											<span
												className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold transition-colors"
												style={{
													backgroundColor: isSelected
														? accentColor
														: `${accentColor}20`,
													color: isSelected ? "#fff" : accentColor,
												}}
											>
												{isSelected ? (
													<IconCheck size={8} />
												) : (
													String.fromCharCode(65 + oi)
												)}
											</span>
											<div className="min-w-0">
												<span className="text-[11px] font-medium">
													{opt.label}
												</span>
												{opt.description && (
													<p
														className="text-[9px] leading-snug mt-0.5"
														style={{ color: fgMuted }}
													>
														{opt.description}
													</p>
												)}
											</div>
										</button>
									);
								})}
							</div>
						)}
					</div>
				);
			})}
			{!submitted && !isStreaming && onSendMessage && (
				<button
					type="button"
					onClick={handleSubmit}
					disabled={!hasSelections}
					className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition-all"
					style={{
						backgroundColor: hasSelections ? accentColor : `${accentColor}30`,
						color: hasSelections ? "#fff" : fgDim,
						cursor: hasSelections ? "pointer" : "not-allowed",
						opacity: hasSelections ? 1 : 0.6,
					}}
				>
					<IconSend size={10} />
					Send selections
				</button>
			)}
		</div>
	);
}
