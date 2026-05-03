const MAX_STREAM_CHARS = 64_000;

export async function drainStreamToString(
	stream: ReadableStream<Uint8Array>,
	maxChars = MAX_STREAM_CHARS
) {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let text = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		text += decoder.decode(value, { stream: true });
		if (text.length > maxChars) text = text.slice(-maxChars);
	}
	return text + decoder.decode();
}

export function parseNdjsonLines(
	leftover: string,
	handler: (event: any) => void
): string {
	const lines = leftover.split("\n");
	const remainder = lines.pop()!;
	for (const line of lines) {
		if (!line.trim()) continue;
		try {
			handler(JSON.parse(line));
		} catch {}
	}
	return remainder;
}

export function flushNdjsonLeftover(
	leftover: string,
	handler: (event: any) => void
) {
	if (!leftover.trim()) return;
	try {
		handler(JSON.parse(leftover));
	} catch {}
}
