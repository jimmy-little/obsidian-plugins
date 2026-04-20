import { requestUrl } from "obsidian";

const OL_ORIGIN = "https://openlibrary.org";

/** Identify politely (Open Library asks for a descriptive User-Agent). */
const OL_HEADERS = {
	"User-Agent": "Repose-Obsidian-Plugin/1.0 (https://github.com/obsidianmd)",
};

export type OlSearchDoc = {
	key?: string;
	title?: string;
	author_name?: string[];
	first_publish_year?: number;
	isbn?: string[];
	cover_i?: number;
	publisher?: string[];
};

function assertOk(res: Awaited<ReturnType<typeof requestUrl>>, label: string): void {
	if (res.status >= 400) {
		throw new Error(`${label} HTTP ${res.status}`);
	}
}

/** Search works (books) via Open Library Search API. */
export async function searchOpenLibraryBooks(query: string, limit = 18): Promise<OlSearchDoc[]> {
	const q = query.trim();
	if (!q) return [];
	const url = `${OL_ORIGIN}/search.json?q=${encodeURIComponent(q)}&limit=${limit}`;
	const res = await requestUrl({ url, method: "GET", headers: OL_HEADERS });
	assertOk(res, "Open Library search");
	const data = res.json as { docs?: OlSearchDoc[] };
	return Array.isArray(data.docs) ? data.docs : [];
}

/** `/works/OL45883W` → `OL45883W` */
export function parseOpenLibraryWorkId(workKey: string | undefined): string | null {
	if (!workKey?.trim()) return null;
	const m = /\/works\/([^/]+)/.exec(workKey);
	if (m) return m[1] ?? null;
	if (/^OL\d+W$/i.test(workKey.trim())) return workKey.trim();
	return null;
}

/** Load a work record (description, subjects, etc.). */
export async function fetchOpenLibraryWork(workKey: string): Promise<Record<string, unknown> | null> {
	const id = parseOpenLibraryWorkId(workKey);
	if (!id) return null;
	const url = `${OL_ORIGIN}/works/${id}.json`;
	const res = await requestUrl({ url, method: "GET", headers: OL_HEADERS });
	if (res.status === 404) return null;
	assertOk(res, "Open Library work");
	return res.json as Record<string, unknown>;
}

/** Subtitle for pick lists (search UI, refresh match modal). */
export function olSearchDocPickMetaLine(doc: OlSearchDoc): string {
	const parts: string[] = [];
	if (doc.author_name && doc.author_name.length > 0) {
		parts.push(
			doc.author_name.slice(0, 3).join(", ") + (doc.author_name.length > 3 ? "…" : ""),
		);
	}
	if (doc.first_publish_year != null) parts.push(String(doc.first_publish_year));
	const id = doc.key?.replace(/^\/works\//, "") ?? "";
	if (id) parts.push(id);
	return parts.join(" · ");
}

export function coverUrlForOlSearchDoc(
	doc: OlSearchDoc,
	size: "S" | "M" | "L" = "M",
): string | null {
	if (doc.cover_i != null && Number.isFinite(Number(doc.cover_i))) {
		return `https://covers.openlibrary.org/b/id/${doc.cover_i}-${size}.jpg`;
	}
	const raw = doc.isbn?.find((x) => typeof x === "string" && normalizeIsbn(x));
	if (raw) {
		const clean = normalizeIsbn(raw);
		if (clean) return `https://covers.openlibrary.org/b/isbn/${clean}-${size}.jpg`;
	}
	return null;
}

export function coverUrlForOlWork(work: Record<string, unknown> | null | undefined, size: "S" | "M" | "L"): string | null {
	const covers = work?.covers;
	if (Array.isArray(covers) && covers.length > 0) {
		const id = covers[0];
		if (typeof id === "number" && Number.isFinite(id)) {
			return `https://covers.openlibrary.org/b/id/${id}-${size}.jpg`;
		}
	}
	return null;
}

function normalizeIsbn(s: string): string | null {
	const d = s.replace(/[^0-9Xx]/g, "");
	if (d.length === 10 || d.length === 13) return d.toUpperCase();
	return null;
}

/** Prefer ISBN-13 when present. */
export function pickPrimaryIsbn(doc: OlSearchDoc): string | undefined {
	const list = doc.isbn;
	if (!Array.isArray(list)) return undefined;
	let best10: string | undefined;
	for (const x of list) {
		if (typeof x !== "string") continue;
		const n = normalizeIsbn(x);
		if (!n) continue;
		if (n.length === 13) return n;
		if (n.length === 10) best10 = n;
	}
	return best10;
}

/**
 * Normalize OL prose for YAML/frontmatter: CRLF, stray NULs, and huge blobs can break Obsidian's
 * metadata parser so keys after `description` never load (hero looks empty except title).
 */
export function sanitizeBookDescriptionForYaml(s: string): string {
	let t = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	t = t.replace(/\u0000/g, "");
	const max = 12000;
	if (t.length > max) t = `${t.slice(0, max).trimEnd()}…`;
	return t.trim();
}

export function extractOlDescription(work: Record<string, unknown> | null | undefined): string | undefined {
	if (!work) return undefined;
	const d = work.description;
	let raw: string | undefined;
	if (typeof d === "string" && d.trim()) raw = d.trim();
	else if (d && typeof d === "object" && "value" in d && typeof (d as { value?: unknown }).value === "string") {
		const v = (d as { value: string }).value.trim();
		if (v) raw = v;
	}
	if (!raw) return undefined;
	return sanitizeBookDescriptionForYaml(raw);
}

export function extractOlSubjectStrings(work: Record<string, unknown> | null | undefined): string[] {
	const subs = work?.subjects;
	if (!Array.isArray(subs)) return [];
	const out: string[] = [];
	for (const s of subs) {
		if (typeof s === "string" && s.trim()) out.push(s.trim());
	}
	return out;
}

export function extractYearFromOlWork(work: Record<string, unknown> | null | undefined): number | undefined {
	if (!work) return undefined;
	const fd = work.first_publish_date;
	if (typeof fd === "string") {
		const y = /^(\d{4})/.exec(fd);
		if (y) {
			const n = parseInt(y[1]!, 10);
			if (!Number.isNaN(n)) return n;
		}
	}
	return undefined;
}
