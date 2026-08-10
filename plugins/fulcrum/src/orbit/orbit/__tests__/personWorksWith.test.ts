import {describe, expect, it, vi} from "vitest";

vi.mock("obsidian", () => ({
	TFile: class TFile {
		path = "";
		basename = "";
		stat = {mtime: Date.now()};
	},
	normalizePath: (p: string) => p.replace(/\\/g, "/").replace(/^\/+/, ""),
}));

import {TFile} from "obsidian";
import type {FulcrumSettings} from "../../../fulcrum/settingsDefaults";
import type {IndexedMeeting, IndexedPerson} from "../../../fulcrum/types";
import {
	buildPersonWorksWithIndex,
	collectPeopleInMeetingNote,
	cooccurrenceWeight,
	resolveMeetingDateMs,
} from "../personWorksWith";

const DEFAULT_SETTINGS: FulcrumSettings = {
	peopleDirs: ["People"],
	meetingOrganizerField: "organizer",
	projectRelatedPeopleField: "relatedPeople",
	peopleAvatarField: "avatar",
	projectBannerField: "banner",
} as FulcrumSettings;

const NOW = new Date("2026-07-08T12:00:00").getTime();

function person(path: string, name: string): IndexedPerson {
	const file = new TFile();
	file.path = path;
	file.basename = name.replace(/\.md$/i, "");
	return {
		file,
		linkText: file.basename,
		name: file.basename,
		avatarSrc: null,
		bannerImageSrc: null,
		isGhost: false,
	};
}

function meeting(path: string, date?: string): IndexedMeeting {
	const file = new TFile();
	file.path = path;
	file.basename = path.replace(/\.md$/i, "").split("/").pop() ?? path;
	file.stat = {mtime: NOW, ctime: NOW, size: 0};
	return {file, date, projectFile: null};
}

function peopleIndex(people: IndexedPerson[]): Map<string, TFile> {
	const index = new Map<string, TFile>();
	for (const p of people) {
		if (!p.file) continue;
		const key = p.file.basename.toLowerCase();
		index.set(key, p.file);
		index.set(p.file.path.toLowerCase(), p.file);
	}
	return index;
}

function mockApp(
	meetingPeople: Record<string, IndexedPerson[]>,
	bodies: Record<string, string> = {},
	allPeople: IndexedPerson[] = [],
	meetingDates: Record<string, string> = {},
) {
	const peopleByPath = new Map(allPeople.map((p) => [p.file!.path, p]));
	const frontmatter: Record<string, Record<string, unknown>> = {};
	for (const [path, people] of Object.entries(meetingPeople)) {
		frontmatter[path] = {
			date: meetingDates[path] ?? "2026-06-01",
			attendees: people.map((p) => `[[${p.linkText}]]`).join(", "),
		};
	}

	return {
		metadataCache: {
			getFileCache(file: TFile) {
				const person = peopleByPath.get(file.path);
				return {
					frontmatter: {
						...(frontmatter[file.path] ?? {}),
						...(person ? {name: person.name} : {}),
					},
				};
			},
			fileToLinktext(file: TFile) {
				return file.basename;
			},
			getFirstLinkpathDest(link: string, _source?: string) {
				const normalized = link.trim().toLowerCase();
				for (const p of allPeople) {
					if (
						p.file &&
						(p.file.basename.toLowerCase() === normalized ||
							p.file.path.toLowerCase().endsWith(`/${normalized}.md`))
					) {
						return p.file;
					}
				}
				return null;
			},
		},
		vault: {
			async cachedRead(file: TFile) {
				return bodies[file.path] ?? "";
			},
			getMarkdownFiles() {
				return allPeople.map((p) => p.file).filter(Boolean) as TFile[];
			},
		},
	} as unknown as import("obsidian").App;
}

describe("cooccurrenceWeight", () => {
	it("returns zero for meetings older than lookback", () => {
		const oldMs = NOW - 20 * 30 * 24 * 60 * 60 * 1000;
		expect(cooccurrenceWeight(oldMs, NOW)).toBe(0);
	});

	it("doubles weight for recent meetings", () => {
		const recentMs = NOW - 30 * 24 * 60 * 60 * 1000;
		expect(cooccurrenceWeight(recentMs, NOW)).toBe(2);
	});
});

describe("resolveMeetingDateMs", () => {
	it("reads date from indexed meeting frontmatter", () => {
		const m = meeting("Meetings/m1.md", "2026-05-10");
		expect(resolveMeetingDateMs(m)).not.toBeNull();
	});
});

describe("collectPeopleInMeetingNote", () => {
	it("merges frontmatter attendees with body people wikilinks", async () => {
		const meetingFile = new TFile();
		meetingFile.path = "Meetings/m1.md";
		meetingFile.basename = "m1";
		const alice = person("People/Alice.md", "Alice");
		const bob = person("People/Bob.md", "Bob");
		const app = mockApp({[meetingFile.path]: [alice]}, {[meetingFile.path]: "Notes with [[Bob]]"}, [
			alice,
			bob,
		]);

		const people = await collectPeopleInMeetingNote(
			app,
			meetingFile,
			{attendees: "[[Alice]]"},
			DEFAULT_SETTINGS,
			peopleIndex([alice, bob]),
		);

		expect(people.map((p) => p.name).sort()).toEqual(["Alice", "Bob"]);
	});

	it("ignores relatedPeople frontmatter", async () => {
		const meetingFile = new TFile();
		meetingFile.path = "Meetings/m1.md";
		meetingFile.basename = "m1";
		const alice = person("People/Alice.md", "Alice");
		const stale = person("People/Stale.md", "Stale");
		const app = mockApp({[meetingFile.path]: [alice]}, {}, [alice, stale]);

		const people = await collectPeopleInMeetingNote(
			app,
			meetingFile,
			{attendees: "[[Alice]]", relatedPeople: "[[Stale]]"},
			DEFAULT_SETTINGS,
			peopleIndex([alice, stale]),
		);

		expect(people.map((p) => p.name)).toEqual(["Alice"]);
	});
});

describe("buildPersonWorksWithIndex", () => {
	it("counts co-occurrences across meetings and caps at six", async () => {
		const alice = person("People/Alice.md", "Alice");
		const bob = person("People/Bob.md", "Bob");
		const carol = person("People/Carol.md", "Carol");
		const all = [alice, bob, carol];
		const meetings = [meeting("Meetings/m1.md"), meeting("Meetings/m2.md")];
		const app = mockApp(
			{
				"Meetings/m1.md": [alice, bob, carol],
				"Meetings/m2.md": [alice, bob],
			},
			{},
			all,
		);

		const index = await buildPersonWorksWithIndex(app, meetings, DEFAULT_SETTINGS, NOW);
		const aliceWorksWith = index.get(alice.file!.path) ?? [];

		expect(aliceWorksWith[0]?.linkText).toBe("Bob");
		expect(aliceWorksWith[0]?.meetingCount).toBe(4);
		expect(aliceWorksWith[1]?.linkText).toBe("Carol");
		expect(aliceWorksWith[1]?.meetingCount).toBe(2);
	});

	it("excludes self from collaborator lists", async () => {
		const alice = person("People/Alice.md", "Alice");
		const bob = person("People/Bob.md", "Bob");
		const all = [alice, bob];
		const meetings = [meeting("Meetings/m1.md")];
		const app = mockApp({"Meetings/m1.md": [alice, bob]}, {}, all);

		const index = await buildPersonWorksWithIndex(app, meetings, DEFAULT_SETTINGS, NOW);
		const aliceWorksWith = index.get(alice.file!.path) ?? [];

		expect(aliceWorksWith.some((e) => e.file?.path === alice.file!.path)).toBe(false);
	});

	it("returns fewer than six when data is sparse", async () => {
		const alice = person("People/Alice.md", "Alice");
		const bob = person("People/Bob.md", "Bob");
		const all = [alice, bob];
		const meetings = [meeting("Meetings/m1.md")];
		const app = mockApp({"Meetings/m1.md": [alice, bob]}, {}, all);

		const index = await buildPersonWorksWithIndex(app, meetings, DEFAULT_SETTINGS, NOW);
		expect((index.get(alice.file!.path) ?? []).length).toBe(1);
	});

	it("prefers recent collaborators over stale historical ones", async () => {
		const alice = person("People/Alice.md", "Alice");
		const daily = person("People/Daily.md", "Daily");
		const stale = person("People/Stale.md", "Stale");
		const all = [alice, daily, stale];
		const meetings = [
			meeting("Meetings/recent.md", "2026-07-01"),
			meeting("Meetings/old.md", "2022-01-15"),
		];
		const app = mockApp(
			{
				"Meetings/recent.md": [alice, daily],
				"Meetings/old.md": [alice, stale],
			},
			{},
			all,
			{
				"Meetings/recent.md": "2026-07-01",
				"Meetings/old.md": "2022-01-15",
			},
		);

		const index = await buildPersonWorksWithIndex(app, meetings, DEFAULT_SETTINGS, NOW);
		const aliceWorksWith = index.get(alice.file!.path) ?? [];

		expect(aliceWorksWith[0]?.linkText).toBe("Daily");
		expect(aliceWorksWith.some((e) => e.linkText === "Stale")).toBe(false);
	});
});
