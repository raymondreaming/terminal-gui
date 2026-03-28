export async function fetchJson<T>(
	input: RequestInfo | URL,
	init?: RequestInit
): Promise<T> {
	const response = await fetch(input, init);
	if (!response.ok) {
		throw new Error(`Request failed: ${response.status}`);
	}
	return response.json() as Promise<T>;
}

export async function fetchJsonOr<T>(
	input: RequestInfo | URL,
	fallback: T,
	init?: RequestInit
): Promise<T> {
	const response = await fetch(input, init);
	if (!response.ok) {
		return fallback;
	}
	return response.json() as Promise<T>;
}

export async function postJson<TResponse>(
	input: RequestInfo | URL,
	body?: unknown,
	init?: RequestInit
): Promise<TResponse> {
	return fetchJson<TResponse>(input, {
		...init,
		method: init?.method ?? "POST",
		headers: {
			"Content-Type": "application/json",
			...init?.headers,
		},
		body: body === undefined ? init?.body : JSON.stringify(body),
	});
}

export async function sendJson(
	input: RequestInfo | URL,
	body?: unknown,
	init?: RequestInit
): Promise<Response> {
	return fetch(input, {
		...init,
		method: init?.method ?? "POST",
		headers: {
			"Content-Type": "application/json",
			...init?.headers,
		},
		body: body === undefined ? init?.body : JSON.stringify(body),
	});
}
