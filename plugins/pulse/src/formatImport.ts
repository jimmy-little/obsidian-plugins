/** Format stored ISO import timestamps for dashboard footers. */
export function formatPulseImportAt(iso: string | undefined | null): string {
	const s = (iso ?? "").trim();
	if (!s) return "Never";
	const d = new Date(s);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
