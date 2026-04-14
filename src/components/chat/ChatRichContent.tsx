import React, { useCallback, useMemo, useState } from "react";
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
				backgroundColor: theme ? theme.surface : "var(--color-inferay-surface)",
				color: copied
					? "#22c55e"
					: theme
						? theme.fgDim
						: "var(--color-inferay-text-3)",
			}}
			title={copied ? "Copied!" : "Copy"}
		>
			{copied ? (
				<svg
					aria-hidden="true"
					width="10"
					height="10"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="M20 6L9 17l-5-5" />
				</svg>
			) : (
				<svg
					aria-hidden="true"
					width="10"
					height="10"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
					<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
				</svg>
			)}
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
							className="overflow-x-auto rounded border text-[10px]"
							style={{
								borderColor: theme?.border ?? "rgba(255,255,255,0.1)",
								backgroundColor: theme?.surface ?? "rgba(255,255,255,0.03)",
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
													borderBottom: `1px solid ${theme?.border ?? "rgba(255,255,255,0.12)"}`,
													color: theme?.fg ?? "#e5e5e5",
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
																? `1px solid ${theme?.border ?? "rgba(255,255,255,0.06)"}`
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
	const surfaceBg = theme?.surface ?? "rgba(255,255,255,0.04)";
	const borderClr = theme?.border ?? "rgba(255,255,255,0.08)";
	const fgColor = theme?.fg ?? "#e5e5e5";
	const fgMuted = theme?.fgMuted ?? "#e5e5e588";
	const fgDim = theme?.fgDim ?? "#e5e5e555";

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
							<svg
								aria-hidden="true"
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke={accentColor}
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<circle cx="12" cy="12" r="10" />
								<path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
								<line x1="12" y1="17" x2="12.01" y2="17" />
							</svg>
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
													<svg
														aria-hidden="true"
														width="8"
														height="8"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														strokeWidth="3"
														strokeLinecap="round"
														strokeLinejoin="round"
													>
														<path d="M20 6L9 17l-5-5" />
													</svg>
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
					<svg
						aria-hidden="true"
						width="10"
						height="10"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<line x1="22" y1="2" x2="11" y2="13" />
						<polygon points="22 2 15 22 11 13 2 9 22 2" />
					</svg>
					Send selections
				</button>
			)}
		</div>
	);
}
