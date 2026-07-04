const DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})([-_\s]+)?/;

/** Replace a leading YYYY-MM-DD in the basename with `Recurring-`. */
export function recurringTaskBasename(currentBasename: string): string {
	const stem = currentBasename.replace(/\.md$/i, "");
	if (/^Recurring-/i.test(stem)) return currentBasename;

	const m = stem.match(DATE_PREFIX);
	if (m) {
		const rest = stem.slice(m[0].length);
		const newStem = rest ? `Recurring-${rest}` : "Recurring-task";
		return `${newStem}.md`;
	}
	return `Recurring-${stem}.md`;
}
