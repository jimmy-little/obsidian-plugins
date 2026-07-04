export function splitTableRow(line: string): string[] {
	const trimmed = line.trim();
	if (!trimmed.startsWith("|")) return [];
	const inner = trimmed.replace(/^\|/, "").replace(/\|$/, "");
	return inner.split("|").map((c) => c.trim());
}
