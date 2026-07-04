export function loadCollapsedGroupKeys(storageKey: string): Set<string> {
	if (typeof localStorage === "undefined") return new Set();
	try {
		const raw = localStorage.getItem(storageKey);
		if (!raw) return new Set();
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return new Set();
		return new Set(parsed.filter((k): k is string => typeof k === "string" && k.length > 0));
	} catch {
		return new Set();
	}
}

export function saveCollapsedGroupKeys(storageKey: string, keys: Set<string>): void {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.setItem(storageKey, JSON.stringify([...keys]));
	} catch {
		/* ignore */
	}
}

export function toggleCollapsedGroupKey(keys: Set<string>, key: string): Set<string> {
	const next = new Set(keys);
	if (next.has(key)) next.delete(key);
	else next.add(key);
	return next;
}
