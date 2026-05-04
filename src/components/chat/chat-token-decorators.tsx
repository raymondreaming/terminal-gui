import type React from "react";
import { colorValues, effectValues } from "../../tokens.stylex.ts";

type TokenRange = {
	start: number;
	end: number;
};

function findDecoratedTokenRanges(
	text: string,
	slashCommandNames?: readonly string[]
): TokenRange[] {
	if (!text) return [];

	const ranges: TokenRange[] = [];
	const slashRegex = /(^|\s)(\/[a-zA-Z][\w-]*)/g;
	const fileRegex = /(^|\s)(@[^\s]+)/g;
	const knownSlashCommands = slashCommandNames
		? new Set(slashCommandNames.map((name) => name.toLowerCase()))
		: null;

	for (
		let match = slashRegex.exec(text);
		match;
		match = slashRegex.exec(text)
	) {
		const prefix = match[1]!;
		const token = match[2]!;
		if (!knownSlashCommands?.has(token.slice(1).toLowerCase())) continue;
		const start = match.index + prefix.length;
		ranges.push({ start, end: start + token.length });
	}

	for (let match = fileRegex.exec(text); match; match = fileRegex.exec(text)) {
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
	slashCommandNames?: readonly string[]
): React.ReactNode {
	if (!text) return <span style={{ color: "transparent" }}>{"\u00A0"}</span>;

	const tokens = findDecoratedTokenRanges(text, slashCommandNames);
	if (tokens.length === 0) {
		return <span style={{ color: colorValues.textMain }}>{text}</span>;
	}

	const segments: React.ReactNode[] = [];
	let lastEnd = 0;

	for (const token of tokens) {
		if (token.start < lastEnd) continue;

		if (token.start > lastEnd) {
			segments.push(
				<span key={`t-${lastEnd}`} style={{ color: colorValues.textMain }}>
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
					color: colorValues.accent,
					backgroundColor: effectValues.tokenHighlightBackground,
				}}
			>
				{tokenText}
			</span>
		);
		lastEnd = token.end;
	}

	if (lastEnd < text.length) {
		segments.push(
			<span key={`t-${lastEnd}`} style={{ color: colorValues.textMain }}>
				{text.slice(lastEnd)}
			</span>
		);
	}

	return <>{segments}</>;
}

export function renderTextPills(
	text: string,
	slashCommandNames?: readonly string[]
): React.ReactNode[] {
	if (!text) return [];

	const matches = findDecoratedTokenRanges(text, slashCommandNames);
	if (matches.length === 0) return [text];

	const parts: React.ReactNode[] = [];
	let lastEnd = 0;

	for (const token of matches) {
		if (token.start < lastEnd) continue;

		if (token.start > lastEnd) {
			parts.push(text.slice(lastEnd, token.start));
		}

		const tokenText = text.slice(token.start, token.end);
		parts.push(
			<span
				key={`${token.start}-${tokenText}`}
				className="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium align-middle"
				style={{
					backgroundColor: effectValues.tokenHighlightBackground,
					color: colorValues.accent,
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
