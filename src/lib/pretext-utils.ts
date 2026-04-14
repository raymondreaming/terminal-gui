import { layout, prepare } from "@chenglou/pretext";

// Font strings matching the CSS declarations
const UI_FONT =
	"12px Geist, -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
const MONO_FONT = '10px "Geist Mono", "SF Mono", Menlo, Consolas, monospace';
const HEADING_FONT =
	"500 11px Geist, -apple-system, BlinkMacSystemFont, system-ui, sans-serif";

// Line heights matching CSS
const UI_LINE_HEIGHT = 19.2; // 12px * 1.6
const MONO_LINE_HEIGHT = 16; // 10px * 1.6 relaxed
const HEADING_LINE_HEIGHT = 16;

// Cache prepared texts to avoid re-measuring
const cache = new Map<string, ReturnType<typeof prepare>>();

function getPrepared(
	text: string,
	font: string,
	whiteSpace: "normal" | "pre-wrap" = "normal"
): ReturnType<typeof prepare> {
	const key = `${whiteSpace}::${font}::${text}`;
	let p = cache.get(key);
	if (!p) {
		p = prepare(text, font, { whiteSpace });
		cache.set(key, p);
		// Keep cache bounded
		if (cache.size > 2000) {
			const first = cache.keys().next().value;
			if (first) cache.delete(first);
		}
	}
	return p;
}
export function measureTextHeight(
	text: string,
	maxWidth: number,
	font: string = UI_FONT,
	lineHeight: number = UI_LINE_HEIGHT
): number {
	if (!text) return lineHeight;
	const p = getPrepared(text, font);
	const result = layout(p, maxWidth, lineHeight);
	return result.height;
}
export function measureCodeHeight(text: string, maxWidth: number): number {
	if (!text) return MONO_LINE_HEIGHT + 12; // padding
	const p = getPrepared(text, MONO_FONT);
	const result = layout(p, maxWidth, MONO_LINE_HEIGHT);
	return result.height + 12; // py-1.5 padding
}
export function measureMessageHeight(
	content: string,
	containerWidth: number
): number {
	if (!content) return UI_LINE_HEIGHT;

	const lines = content.split("\n");
	let height = 0;
	let inCodeBlock = false;
	let codeContent = "";

	for (const line of lines) {
		if (line.startsWith("```")) {
			if (inCodeBlock) {
				// End of code block
				height += measureCodeHeight(codeContent.trim(), containerWidth - 16);
				height += 4; // spacing
				codeContent = "";
			}
			inCodeBlock = !inCodeBlock;
			continue;
		}

		if (inCodeBlock) {
			codeContent += `${line}\n`;
			continue;
		}

		// Heading
		if (line.startsWith("#")) {
			const text = line.replace(/^#+\s*/, "");
			height += measureTextHeight(
				text,
				containerWidth,
				HEADING_FONT,
				HEADING_LINE_HEIGHT
			);
			height += 4;
			continue;
		}

		// List item
		if (line.match(/^\s*[-*]\s/) || line.match(/^\s*\d+\.\s/)) {
			const text = line.replace(/^\s*[-*\d.]+\s*/, "");
			height += measureTextHeight(
				text,
				containerWidth - 12,
				UI_FONT,
				UI_LINE_HEIGHT
			);
			height += 4;
			continue;
		}

		// Empty line = spacing
		if (!line.trim()) {
			height += 4;
			continue;
		}

		// Regular paragraph
		height += measureTextHeight(line, containerWidth, UI_FONT, UI_LINE_HEIGHT);
		height += 4;
	}

	// Close any unclosed code block
	if (inCodeBlock && codeContent) {
		height += measureCodeHeight(codeContent.trim(), containerWidth - 16);
	}

	return Math.max(height, UI_LINE_HEIGHT);
}
export function measureTextareaHeight(
	text: string,
	maxWidth: number,
	font: string = UI_FONT,
	lineHeight: number = UI_LINE_HEIGHT
): number {
	if (!text) return lineHeight;
	const p = getPrepared(text, font, "pre-wrap");
	const result = layout(p, maxWidth, lineHeight);
	return result.height;
}
export function getLineCount(
	text: string,
	maxWidth: number,
	font: string = UI_FONT,
	lineHeight: number = UI_LINE_HEIGHT
): number {
	if (!text) return 1;
	const p = getPrepared(text, font);
	return layout(p, maxWidth, lineHeight).lineCount;
}
export function clearMeasurementCache(): void {
	cache.clear();
}
