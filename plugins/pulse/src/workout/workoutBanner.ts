import type { App } from "obsidian";
import { TFile, normalizePath, setIcon } from "obsidian";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;

export interface WorkoutBannerAction {
	icon: string;
	label: string;
	onClick: () => void;
}

export interface RenderWorkoutBannerOptions {
	wrapClass?: string;
	footActions?: WorkoutBannerAction[];
}

/** Resolve import `banner: "[[assets/foo.png]]"` relative to the workout note. */
export function resolveWorkoutBannerSrc(
	app: App,
	bannerRaw: unknown,
	sourcePath: string,
): string | null {
	const s = String(bannerRaw ?? "").trim();
	if (!s) return null;

	let linkpath: string | null = null;
	const wiki = s.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
	if (wiki) linkpath = wiki[1]!.trim();
	else if (!s.includes("://")) linkpath = s.replace(/^["']|["']$/g, "");

	if (!linkpath) return null;

	const dest = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
	if (dest instanceof TFile && IMAGE_EXT.test(dest.path)) {
		return app.vault.getResourcePath(dest);
	}

	const noteDir = sourcePath.includes("/")
		? sourcePath.slice(0, sourcePath.lastIndexOf("/"))
		: "";
	const candidates = [
		normalizePath(linkpath),
		noteDir ? normalizePath(`${noteDir}/${linkpath}`) : null,
	].filter((p): p is string => Boolean(p));

	for (const path of candidates) {
		const file = app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile && IMAGE_EXT.test(file.path)) {
			return app.vault.getResourcePath(file);
		}
	}

	return null;
}

function renderBannerActionButton(parent: HTMLElement, action: WorkoutBannerAction): void {
	const btn = parent.createEl("button", {
		type: "button",
		cls: "pulse-session-banner-btn pulse-session-banner-btn--icon-only pulse-session-banner-btn--shell-home",
		attr: { "aria-label": action.label, title: action.label },
	});
	setIcon(btn.createSpan({ cls: "pulse-session-banner-btn__icon" }), action.icon);
	btn.addEventListener("click", (e) => {
		e.stopPropagation();
		action.onClick();
	});
}

export function renderWorkoutBanner(
	parent: HTMLElement,
	src: string,
	options?: RenderWorkoutBannerOptions,
): HTMLElement {
	const wrap = parent.createDiv({
		cls: `pulse-session-banner pulse-session-banner--has-image${
			options?.wrapClass ? ` ${options.wrapClass}` : ""
		}`,
	});
	wrap.createEl("img", { cls: "pulse-session-banner__img", attr: { src, alt: "" } });

	const footActions = options?.footActions ?? [];
	if (footActions.length > 0) {
		const foot = wrap.createDiv({ cls: "pulse-session-banner__foot" });
		const footLeft = foot.createDiv({ cls: "pulse-session-banner__foot-left" });
		for (const action of footActions) {
			renderBannerActionButton(footLeft, action);
		}
	}

	return wrap;
}
