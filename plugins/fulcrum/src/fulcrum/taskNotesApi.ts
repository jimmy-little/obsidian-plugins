/** Normalize base URL: trim, no trailing slash; default localhost. */
export function normalizeTaskNotesBaseUrl(raw: string): string {
	let t = raw.trim().replace(/^\/+/, "");
	while (t.endsWith("/")) {
		t = t.slice(0, -1);
	}
	return t.length ? t : "http://localhost:8080";
}

export async function postTaskNotesToggleStatus(
	baseUrl: string,
	token: string | undefined,
	vaultRelativePath: string,
	signal?: AbortSignal,
): Promise<{ok: boolean; error?: string}> {
	const root = normalizeTaskNotesBaseUrl(baseUrl);
	const enc = encodeURIComponent(vaultRelativePath.replace(/\\/g, "/"));
	const url = `${root}/api/tasks/${enc}/toggle-status`;
	const headers: Record<string, string> = {Accept: "application/json"};
	const tok = token?.trim();
	if (tok) headers.Authorization = `Bearer ${tok}`;
	let res: Response;
	try {
		res = await fetch(url, {method: "POST", headers, signal});
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : String(e),
		};
	}
	let body: unknown;
	try {
		body = await res.json();
	} catch {
		return {
			ok: false,
			error: res.ok ? "Invalid JSON from TaskNotes API" : `HTTP ${res.status}`,
		};
	}
	const o = body as {success?: boolean; error?: string};
	if (res.ok && o.success === true) return {ok: true};
	return {
		ok: false,
		error:
			typeof o.error === "string"
				? o.error
				: res.ok
					? "TaskNotes API reported failure"
					: `HTTP ${res.status}`,
	};
}

export async function getTaskNotesHealth(
	baseUrl: string,
	token: string | undefined,
	signal?: AbortSignal,
): Promise<{ok: boolean; error?: string}> {
	const root = normalizeTaskNotesBaseUrl(baseUrl);
	const url = `${root}/api/health`;
	const headers: Record<string, string> = {Accept: "application/json"};
	const tok = token?.trim();
	if (tok) headers.Authorization = `Bearer ${tok}`;
	try {
		const res = await fetch(url, {headers, signal});
		if (!res.ok) return {ok: false, error: `HTTP ${res.status}`};
		const body = (await res.json()) as {success?: boolean; error?: string};
		return body.success === true
			? {ok: true}
			: {ok: false, error: body.error ?? "Unexpected health response"};
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : String(e),
		};
	}
}
