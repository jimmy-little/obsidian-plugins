export interface OmniFocusHealth {
	ok: boolean;
	status: string;
	installed: boolean;
	running: boolean;
	automationOk: boolean;
	version?: string | null;
	error?: string | null;
	message?: string | null;
}

export interface OmniFocusProject {
	id: string;
	name: string;
	status: string;
	folder?: string | null;
	sequential?: boolean;
}

export interface OmniFocusTask {
	id: string;
	name: string;
	completed: boolean;
	dropped?: boolean;
	flagged?: boolean;
	due?: string | null;
	defer?: string | null;
	note?: string;
	projectId?: string | null;
	projectName?: string | null;
	inInbox: boolean;
	tags?: string[];
	modified?: string | null;
}

export interface OmniFocusCreateTask {
	name: string;
	note?: string;
	due?: string | null;
	defer?: string | null;
	flagged?: boolean;
	projectId?: string | null;
	tags?: string[];
}

export interface OmniFocusUpdateTask {
	name?: string;
	note?: string;
	due?: string | null;
	defer?: string | null;
	flagged?: boolean;
	completed?: boolean;
	projectId?: string | null;
}

export interface SyncFingerprint {
	title: string;
	due: string | null;
	defer: string | null;
	completed: boolean;
	projectId: string | null;
}
