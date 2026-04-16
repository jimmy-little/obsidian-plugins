import { setIcon } from "obsidian";

export function safeSetIcon(el: HTMLElement, icon: string): void {
	try {
		setIcon(el, icon);
	} catch {
		setIcon(el, "circle");
	}
}
