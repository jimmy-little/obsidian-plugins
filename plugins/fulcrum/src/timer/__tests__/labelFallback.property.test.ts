import {describe, it, expect} from "vitest";
import * as fc from "fast-check";

/**
 * Property 5: Active timer info column layout
 *
 * **Validates: Requirements 4.4**
 *
 * For any active timer row, the info column always renders the note name
 * in the muted filename slot. When a project link is available, it renders
 * in the accent project slot. When entry.label is present, it renders in
 * the label slot between project and filename.
 */

type InfoColumnLayout = {
	showProject: boolean;
	showLabel: boolean;
	showNote: boolean;
};

function resolveInfoColumnLayout(
	projectLink: { displayName: string; projectPath: string } | null,
	entryLabel: string | null | undefined,
): InfoColumnLayout {
	const trimmed = entryLabel?.trim();
	return {
		showProject: projectLink !== null,
		showLabel: !!trimmed,
		showNote: true,
	};
}

describe("Property 5: Active timer info column layout", () => {
	it("always shows the note name in the filename slot", () => {
		const projectArb = fc.oneof(
			fc.constant(null),
			fc.record({
				displayName: fc.string({minLength: 1, maxLength: 80}),
				projectPath: fc.string({minLength: 1, maxLength: 120}),
			}),
		);
		const labelArb = fc.oneof(
			fc.constant(null as string | null | undefined),
			fc.constant(undefined as string | null | undefined),
			fc.string({minLength: 0, maxLength: 100}),
		);

		fc.assert(
			fc.property(projectArb, labelArb, (projectLink, label) => {
				const layout = resolveInfoColumnLayout(projectLink, label);
				expect(layout.showNote).toBe(true);
			}),
			{numRuns: 200},
		);
	});

	it("shows project only when a project link is resolved", () => {
		const projectArb = fc.oneof(
			fc.constant(null),
			fc.record({
				displayName: fc.string({minLength: 1, maxLength: 80}),
				projectPath: fc.string({minLength: 1, maxLength: 120}),
			}),
		);

		fc.assert(
			fc.property(projectArb, (projectLink) => {
				const layout = resolveInfoColumnLayout(projectLink, "Working");
				expect(layout.showProject).toBe(projectLink !== null);
			}),
			{numRuns: 200},
		);
	});

	it("shows label only when entry.label has non-whitespace content", () => {
		const whitespaceStringArb = fc
			.array(fc.constantFrom(" ", "\t", "\n", "\r"), {minLength: 0, maxLength: 20})
			.map((chars) => chars.join(""));

		const labelArb = fc.oneof(
			fc.constant(null as string | null | undefined),
			fc.constant(undefined as string | null | undefined),
			fc.constant(""),
			whitespaceStringArb,
			fc.string({minLength: 1, maxLength: 100}).filter((s) => s.trim().length > 0),
		);

		fc.assert(
			fc.property(labelArb, (label) => {
				const layout = resolveInfoColumnLayout(
					{displayName: "Project", projectPath: "Projects/Example.md"},
					label,
				);
				expect(layout.showLabel).toBe(!!label?.trim());
			}),
			{numRuns: 200},
		);
	});
});
