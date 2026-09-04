export function formatDailyQuickNoteLine(text: string, now = new Date()): string {
	const stamp = now.toLocaleTimeString(undefined, {hour: "numeric", minute: "2-digit"});
	const body = text.replace(/\s+/g, " ").trim();
	return `- ${stamp} — ${body}`;
}
