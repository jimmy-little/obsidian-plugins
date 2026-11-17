import {describe, expect, it} from "vitest";
import {applyRostrFields, normalizeRostrUrl, rostrUpdateHashUrl, rostrUrlsMatch} from "../rostrUpdate";

const ROSTR = "https://rostr.disney.com/people/abc123";

describe("normalizeRostrUrl", () => {
	it("drops the hash, query, and a trailing slash", () => {
		expect(normalizeRostrUrl(`${ROSTR}/?x=1#orbit-update&token=abc`)).toBe(ROSTR);
	});

	it("keeps path case and ignores host case", () => {
		expect(normalizeRostrUrl("HTTPS://Rostr.Disney.com/people/AbC")).toBe("https://rostr.disney.com/people/AbC");
	});

	it("rejects a non-url", () => {
		expect(normalizeRostrUrl("not a url")).toBe("");
	});
});

describe("rostrUrlsMatch", () => {
	it("matches the same profile with or without a hash", () => {
		expect(rostrUrlsMatch(`${ROSTR}#orbit-update&token=1`, ROSTR)).toBe(true);
	});
});

describe("rostrUpdateHashUrl", () => {
	it("puts the token and port in the hash", () => {
		expect(rostrUpdateHashUrl(`${ROSTR}/`, "abc", 47321)).toBe(`${ROSTR}#orbit-update&token=abc&port=47321`);
	});
});

describe("applyRostrFields", () => {
	it("replaces scraped fields, including an empty report list, and leaves the rest", () => {
		const fm: Record<string, unknown> = {
			name: "Old",
			title: "Old title",
			position: "Old title",
			company: "Walt Disney Company",
			banner: "[[rostr_header.jpg]]",
			color: "#33A8EC",
			tags: ["person"],
			aliases: ["Old"],
			summary: "Keep me",
			org_down: ["[[Peer, Someone]]"],
			cellPhone: "555",
		};
		applyRostrFields(fm, {
			name: "Sean Snider",
			pronouns: "he/him",
			title: "Manager",
			position: "Manager",
			department: "Content Platforms & Operations",
			email: "sean.snider@disney.com",
			workPhone: "(818) 555-0100",
			cellPhone: "",
			cover: "https://example.test/profile.jpg",
			location: "Glendale",
			city: "Glendale",
			state: "CA",
			org_up: "[[Clarke, Justin]]",
			org_down: [],
			expertise: "Taxonomy",
			projects: ["Orbit"],
			summary: "",
			updated: "2026-11-10",
			rostr: ROSTR,
		});
		expect(fm.name).toBe("Sean Snider");
		expect(fm.title).toBe("Manager");
		expect(fm.position).toBe("Manager");
		expect(fm.cellPhone).toBe("");
		expect(fm.org_up).toBe("[[Clarke, Justin]]");
		expect(fm.org_down).toEqual([]);
		expect(fm.projects).toEqual(["Orbit"]);
		expect(fm.summary).toBe("Keep me");
		expect(fm.company).toBe("Walt Disney Company");
		expect(fm.banner).toBe("[[rostr_header.jpg]]");
		expect(fm.color).toBe("#33A8EC");
		expect(fm.tags).toEqual(["person"]);
		expect(fm.aliases).toEqual(["Old"]);
	});

	it("replaces summary when Rostr has one", () => {
		const fm: Record<string, unknown> = {summary: "old"};
		applyRostrFields(fm, {summary: "New summary"});
		expect(fm.summary).toBe("New summary");
	});
});
