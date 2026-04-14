import type React from "react";

type TokenRange = {
	start: number;
	end: number;
};

function findDecoratedTokenRanges(text: string): TokenRange[] {
	if (!text) return [];

	const ranges: TokenRange[] = [];
	const slashRegex = /(^|\s)(\/[a-zA-Z][\w-]*)/g;
	const fileRegex = /(^|\s)(@[^\s]+)/g;
	let match: RegExpExecArray | null;

	while ((match = slashRegex.exec(text)) !== null) {
		const prefix = match[1]!;
		const token = match[2]!;
		const start = match.index + prefix.length;
		ranges.push({ start, end: start + token.length });
	}

	while ((match = fileRegex.exec(text)) !== null) {
		const prefix = match[1]!;
		const token = match[2]!;
		const start = match.index + prefix.length;
		ranges.push({ start, end: start + token.length });
	}

	ranges.sort((a, b) => a.start - b.start);
	return ranges;
}

export function renderInputHighlights(
	text: string,
	theme?: { accent?: string; text?: string }
): React.ReactNode {
	if (!text) return <span style={{ color: "transparent" }}>{"\u00A0"}</span>;

	const tokens = findDecoratedTokenRanges(text);
	if (tokens.length === 0) {
		return (
			<span style={{ color: theme?.text ?? "var(--color-inferay-text)" }}>
				{text}
			</span>
		);
	}

	const segments: React.ReactNode[] = [];
	let lastEnd = 0;

	for (const token of tokens) {
		if (token.start < lastEnd) continue;

		if (token.start > lastEnd) {
			segments.push(
				<span
					key={`t-${lastEnd}`}
					style={{ color: theme?.text ?? "var(--color-inferay-text)" }}
				>
					{text.slice(lastEnd, token.start)}
				</span>
			);
		}

		const tokenText = text.slice(token.start, token.end);
		segments.push(
			<span
				key={`h-${token.start}`}
				className="rounded-sm"
				style={{
					color: theme?.accent ?? "var(--color-inferay-accent)",
					backgroundColor: theme?.accent
						? `${theme.accent}20`
						: "var(--color-inferay-accent-15, rgba(0, 122, 255, 0.15))",
				}}
			>
				{tokenText}
			</span>
		);
		lastEnd = token.end;
	}

	if (lastEnd < text.length) {
		segments.push(
			<span
				key={`t-${lastEnd}`}
				style={{ color: theme?.text ?? "var(--color-inferay-text)" }}
			>
				{text.slice(lastEnd)}
			</span>
		);
	}

	return <>{segments}</>;
}

export function renderTextPills(
	text: string,
	bubbleTheme?: { cursor?: string }
): React.ReactNode[] {
	if (!text) return [];

	const matches = findDecoratedTokenRanges(text);
	if (matches.length === 0) return [text];

	const parts: React.ReactNode[] = [];
	let lastEnd = 0;

	for (const token of matches) {
		if (token.start < lastEnd) continue;

		if (token.start > lastEnd) {
			parts.push(text.slice(lastEnd, token.start));
		}

		const tokenText = text.slice(token.start, token.end);
		const pillColor = bubbleTheme?.cursor ?? "#3b82f6";
		parts.push(
			<span
				key={`${token.start}-${tokenText}`}
				className="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium align-middle"
				style={{
					backgroundColor: `${pillColor}20`,
					color: pillColor,
				}}
			>
				{tokenText}
			</span>
		);
		lastEnd = token.end;
	}

	if (lastEnd < text.length) {
		parts.push(text.slice(lastEnd));
	}

	return parts;
}
