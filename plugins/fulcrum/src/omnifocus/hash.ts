import type {SyncFingerprint} from "./types";

function dayOnly(value: string | null | undefined): string | null {
	if (!value?.trim()) return null;
	const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
	return m?.[1] ?? null;
}

export function normalizeFingerprint(input: SyncFingerprint): SyncFingerprint {
	return {
		title: input.title.trim(),
		due: dayOnly(input.due),
		defer: dayOnly(input.defer),
		completed: !!input.completed,
		projectId: input.projectId?.trim() || null,
	};
}

/** Stable content fingerprint stored in `omnifocusSyncHash`. */
export function syncHash(input: SyncFingerprint): string {
	const p = normalizeFingerprint(input);
	return [
		p.title,
		p.due ?? "",
		p.defer ?? "",
		p.completed ? "1" : "0",
		p.projectId ?? "",
	].join("\n");
}

export function fingerprintsEqual(a: SyncFingerprint, b: SyncFingerprint): boolean {
	return syncHash(a) === syncHash(b);
}
