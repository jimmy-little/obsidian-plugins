/** Matches spec §2.6 — em dash after time. */
export function formatQuickNoteLine(text: string): string {
	const d = new Date();
	const mo = d.getMonth() + 1;
	const da = d.getDate();
	const y = String(d.getFullYear()).slice(-2);
	let h = d.getHours();
	const mins = d.getMinutes();
	const ampm = h >= 12 ? "PM" : "AM";
	const h12 = h % 12 || 12;
	const mm = String(mins).padStart(2, "0");
	const time = `${h12}:${mm} ${ampm}`;
	return `- ${mo}/${da}/${y}, ${time} — ${text}`;
}
