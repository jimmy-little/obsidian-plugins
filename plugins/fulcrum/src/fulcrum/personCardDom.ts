import {setIcon, type App} from "obsidian";
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
