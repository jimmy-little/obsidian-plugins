export interface FulcrumReminder {
	id: number;
	title: string;
	completed: boolean;
	dueDate: string | null;
	notes: string;
	listId?: string;
	listName?: string;
	tags: string[];
	lastModified?: string;
}

export interface RemctlReminderRow {
	numericId: number;
	title: string;
	completed: boolean;
	dueDate: string | null;
	notes: string;
	listId?: string;
	listName?: string;
	tags?: string[];
	lastModified: string;
}

export interface RemctlListRow {
	id: string;
	name: string;
}

export interface ProjectListMap {
	byId: Map<string, RemctlListRow>;
	byName: Map<string, RemctlListRow>;
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
