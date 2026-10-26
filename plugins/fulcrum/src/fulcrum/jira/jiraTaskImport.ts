import {Notice, type WorkspaceLeaf} from "obsidian";
import {createTaskNoteFile} from "../createTaskNote";
import {applyTaskScheduledOnlyChange} from "../kanban/taskFieldUpdate";
import type {FulcrumHost} from "../pluginBridge";
import {scheduleTodayIso} from "../taskSchedulePresets";
import type {IndexedTask} from "../types";
import {fetchJiraIssueDetail} from "./jiraClient";
import {jiraFieldMatchesIssueKey} from "./jiraFormat";

/**
 * Finds a task note already linked to this Jira issue (via `settings.taskJiraField`), so
 * "Create task note" reopens it instead of creating a duplicate.
 */
export function findExistingJiraTaskNote(host: FulcrumHost, issueKey: string): IndexedTask | null {
	const field = host.settings.taskJiraField;
	for (const task of host.vaultIndex.getSnapshot().tasks) {
		if (task.source !== "taskNote") continue;
		const raw = host.app.metadataCache.getFileCache(task.file)?.frontmatter?.[field];
		const value = typeof raw === "string" ? raw : null;
		if (jiraFieldMatchesIssueKey(value, issueKey)) return task;
	}
	return null;
}

function notifyError(e: unknown, fallback: string): void {
	console.error(e);
	const msg = e instanceof Error ? e.message : String(e);
	new Notice(msg.length < 160 ? msg : fallback);
}

/**
 * One-way "Create task note" / drop-to-schedule for a Jira ticket: pulls in the ticket's title and
 * description only (no status/type/priority/labels, and nothing is ever written back to Jira).
 *
 * - `targetIso` null (context-menu "Create task note"): reopens an existing linked note unchanged,
 *   or creates a new one scheduled for today.
 * - `targetIso` set (dropped on an exact Today time slot): reschedules an existing linked note to
 *   that exact time, or creates a new one scheduled at that time.
 */
export async function createOrScheduleJiraTaskNote(
	host: FulcrumHost,
	issueKey: string,
	targetIso: string | null,
	anchorLeaf?: WorkspaceLeaf,
): Promise<void> {
	const key = issueKey.trim();
	if (!key) return;

	const email = host.settings.jiraEmail?.trim() ?? "";
	const apiToken = host.settings.jiraApiToken?.trim() ?? "";
	if (!email || !apiToken) {
		new Notice("Add your Jira email and API token in Settings → Integrations first.");
		return;
	}

	const existing = findExistingJiraTaskNote(host, key);
	if (existing) {
		if (!targetIso) {
			new Notice("Opening existing task note.");
			host.openIndexedTask(existing, anchorLeaf);
			return;
		}
		try {
			await applyTaskScheduledOnlyChange(host.app, existing, host.settings, targetIso);
			await host.refreshIndex();
			new Notice("Rescheduled task note.");
			host.openIndexedTask(existing, anchorLeaf);
		} catch (e) {
			notifyError(e, "Could not reschedule task note.");
		}
		return;
	}

	try {
		const {issue, error} = await fetchJiraIssueDetail(email, apiToken, key);
		if (!issue) {
			new Notice(error ?? `Could not fetch ${key} from Jira.`);
			return;
		}

		const file = await createTaskNoteFile(host.app, host.settings, {
			title: `${issue.issueKey} | ${issue.title}`,
			bodyContent: issue.descriptionText || undefined,
			scheduledDate: targetIso ?? scheduleTodayIso(),
			tags: [host.settings.taskTag.trim() || "task", "jira"],
			jiraKey: issue.issueKey,
		});
		if (!file) return;

		await host.refreshIndex();
		new Notice(`Created ${file.path}`);
		host.openLinkedNoteFromFulcrum(file.path, anchorLeaf);
	} catch (e) {
		notifyError(e, "Could not create task note from Jira.");
	}
}

/** Context-menu entry point ("Create task note"): always today, no specific time. */
export async function createTaskNoteFromJiraTicket(
	host: FulcrumHost,
	issueKey: string,
	anchorLeaf?: WorkspaceLeaf,
): Promise<void> {
	return createOrScheduleJiraTaskNote(host, issueKey, null, anchorLeaf);
}
