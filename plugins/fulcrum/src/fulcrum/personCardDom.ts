import {setIcon, type App} from "obsidian";
import {TFile} from "obsidian";
import type {IndexedPerson} from "./types";

function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className?: string,
	text?: string,
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text != null) node.textContent = text;
	return node;
}

export type PersonAvatarStackItem = {
	person: IndexedPerson;
	position?: string;
};

/** Overlapping avatar stack for companion chrome (Teams/Slack style). */
export function buildCompanionPeopleAvatarStack(
	items: PersonAvatarStackItem[],
	onKnown: (path: string) => void,
	onGhost: (linkText: string, displayName: string) => void,
): HTMLElement {
	const stack = el("div", "fulcrum-companion-people-stack");
	for (const {person, position} of items) {
		const btn = el("button", "fulcrum-companion-people-stack__avatar");
		btn.type = "button";
		if (person.isGhost) {
			btn.classList.add("fulcrum-companion-people-stack__avatar--ghost");
			btn.setAttribute("aria-label", `${person.name} (create person note)`);
		} else {
			btn.setAttribute("aria-label", person.name);
		}

		const face = el("span", "fulcrum-companion-people-stack__face");
		if (person.isGhost) {
			setIcon(face, "ghost");
		} else if (person.avatarSrc) {
			const img = document.createElement("img");
			img.src = person.avatarSrc;
			img.alt = "";
			face.append(img);
		} else {
			face.innerHTML =
				'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>';
		}
		btn.append(face);

		const tip = el("span", "fulcrum-companion-people-stack__tooltip");
		tip.append(el("span", "fulcrum-companion-people-stack__tooltip-name", person.name));
		if (position?.trim()) {
			tip.append(el("span", "fulcrum-companion-people-stack__tooltip-position", position.trim()));
		}
		btn.append(tip);

		btn.addEventListener("click", () => {
			if (person.isGhost) {
				onGhost(person.linkText, person.name);
			} else if (person.file) {
				onKnown(person.file.path);
			}
		});
		stack.append(btn);
	}
	return stack;
}

/** Read job title from a people note for companion hover tooltips. */
export function readPersonPositionFromFile(app: App, file: TFile): string {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
	const raw = typeof fm?.position === "string" ? fm.position : "";
	return raw.replace(/\[\[(?:[^\]|]+\|)?([^\]]+)]]/g, "$1").trim();
}

/** Portrait person card for companion chrome (known + ghost). */
export function buildPersonCardButton(
	person: IndexedPerson,
	onKnown: (path: string) => void,
	onGhost: (linkText: string, displayName: string) => void,
	extraClass = "",
): HTMLButtonElement {
	const btn = el("button", `fulcrum-person-card ${extraClass}`.trim());
	btn.type = "button";
	if (person.isGhost) {
		btn.classList.add("fulcrum-person-card--ghost");
		btn.setAttribute("aria-label", `${person.name} (create person note)`);
		btn.title = "Create person note";
	} else {
		btn.setAttribute("aria-label", person.name);
	}

	const topZone = el("div", "fulcrum-person-card__top");
	if (person.bannerImageSrc) {
		topZone.classList.add("fulcrum-person-card__top--has-banner");
		topZone.style.backgroundImage = `url(${JSON.stringify(person.bannerImageSrc)})`;
	}

	const av = el("div", "fulcrum-person-card__avatar");
	if (person.isGhost) {
		setIcon(av, "ghost");
	} else if (person.avatarSrc) {
		const img = document.createElement("img");
		img.src = person.avatarSrc;
		img.alt = "";
		av.append(img);
	} else {
		av.innerHTML =
			'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>';
	}
	topZone.append(av);
	btn.append(topZone, el("span", "fulcrum-person-card__name", person.name));

	btn.addEventListener("click", () => {
		if (person.isGhost) {
			onGhost(person.linkText, person.name);
		} else if (person.file) {
			onKnown(person.file.path);
		}
	});

	return btn;
}
