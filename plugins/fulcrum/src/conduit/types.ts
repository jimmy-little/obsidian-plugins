export type ConduitSyncForce = "pull" | "push" | "both";

export interface ConduitTaskSnapshot {
	title: string;
	status: string;
	dueDate: string | null;
	done: boolean;
}

export interface ConduitEntityState {
	vaultKey: string;
	reminderNumericId?: number;
	projectPath?: string;
	base: ConduitTaskSnapshot;
	vaultRevision: string;
	reminderRevision: string;
	lastWriter: "vault" | "reminders" | null;
	conflict?: boolean;
}

export interface ConduitSyncState {
	lastCompletedAt: string | null;
	lastRemindersFingerprint: string;
	lastVaultFingerprint: string;
	entities: Record<string, ConduitEntityState>;
}

export interface RemctlReminderRow {
	numericId: number;
	title: string;
	completed: boolean;
	dueDate: string | null;
	notes: string;
	listId?: string;
	listName?: string;
	lastModified: string;
}

export interface RemctlListRow {
	id: string;
	name: string;
}

export interface ProjectListMap {
	byId: Map<string, RemctlListRow>;
	byName: Map<string, RemctlListRow>;
	/** Fresh list ids from the current sync pass (avoids stale metadata cache). */
	projectPathToListId: Map<string, string>;
}

export interface ConduitSyncResult {
	ok: boolean;
	deferred?: boolean;
	deferReason?: string;
	message?: string;
	pulled?: number;
	pushed?: number;
}
