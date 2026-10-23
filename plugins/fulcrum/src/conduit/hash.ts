import type {RemindersSyncFingerprint} from "./types";

function dayOnly(value: string | null | undefined): string | null {
	if (!value?.trim()) return null;
	const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
	return m?.[1] ?? null;
}

export function normalizeReminderFingerprint(input: RemindersSyncFingerprint): RemindersSyncFingerprint {
	return {
		title: input.title.trim(),
		due: dayOnly(input.due),
		completed: !!input.completed,
		listId: input.listId?.trim() || null,
	};
}

/** Stable content fingerprint stored in `appleReminderSyncHash`. */
export function reminderSyncHash(input: RemindersSyncFingerprint): string {
	const p = normalizeReminderFingerprint(input);
	return [p.title, p.due ?? "", p.completed ? "1" : "0", p.listId ?? ""].join("\n");
}

export function reminderFingerprintsEqual(
	a: RemindersSyncFingerprint,
	b: RemindersSyncFingerprint,
): boolean {
	return reminderSyncHash(a) === reminderSyncHash(b);
}
