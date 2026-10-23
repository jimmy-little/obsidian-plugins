export interface FulcrumReminder {
	id: string;
	title: string;
	completed: boolean;
	dueDate: string | null;
	notes: string;
	listId?: string;
	listName?: string;
	tags: string[];
	lastModified?: string;
	externalId?: string;
	recurring?: boolean;
}

export interface ReminderListRow {
	id: string;
	name: string;
	color?: string;
	isDefault?: boolean;
}

/** @deprecated Use ReminderListRow */
export type RemctlListRow = ReminderListRow;

export interface ProjectListMap {
	byId: Map<string, ReminderListRow>;
	byName: Map<string, ReminderListRow>;
	projectPathToListId: Map<string, string>;
}

export interface CreateReminderOptions {
	title: string;
	listId?: string;
	listName?: string;
	due?: string | null;
	notes?: string;
	tags?: string[];
}

export interface UpdateReminderOptions {
	title?: string;
	due?: string | null;
	notes?: string;
	completed?: boolean;
	listId?: string;
	listName?: string;
}

export interface RemindersSyncFingerprint {
	title: string;
	due: string | null;
	completed: boolean;
	listId: string | null;
}

export interface BridgeCalendarRow {
	id: string;
	title: string;
	color?: string;
}

export interface BridgeCalendarEvent {
	id: string;
	calendarId: string;
	title: string;
	startIso: string;
	endIso: string | null;
	allDay: boolean;
	location?: string;
}
