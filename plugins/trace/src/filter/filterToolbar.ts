import type { LogEntry, StatusCategory } from "../types";
import {
	ALL_STATUS_CATEGORIES,
	defaultFilterState,
	filterEntries,
	type FilterState,
} from "./filterState";

export interface FilterToolbarMount {
	root: HTMLElement;
	destroy: () => void;
}

export function createFilterToolbar(
	entries: LogEntry[],
	onApply: (visible: Set<number>, showing: number, total: number) => void,
): FilterToolbarMount {
	const state = defaultFilterState();
	const root = document.createElement("div");
	root.className = "trace-filter-toolbar";

	const badge = document.createElement("span");
	badge.className = "trace-filter-badge";

	const row = document.createElement("div");
	row.className = "trace-filter-row";

	const dateFrom = document.createElement("input");
	dateFrom.type = "date";
	dateFrom.className = "trace-filter-date";
	dateFrom.title = "Date from";

	const dateTo = document.createElement("input");
	dateTo.type = "date";
	dateTo.className = "trace-filter-date";
	dateTo.title = "Date to";

	const keyword = document.createElement("input");
	keyword.type = "text";
	keyword.className = "trace-filter-keyword";
	keyword.placeholder = "Keyword";

	const statusWrap = document.createElement("div");
	statusWrap.className = "trace-filter-statuses";

	const statusChecks = new Map<StatusCategory, HTMLInputElement>();
	for (const cat of ALL_STATUS_CATEGORIES) {
		const label = document.createElement("label");
		label.className = "trace-filter-status-label";
		const cb = document.createElement("input");
		cb.type = "checkbox";
		cb.checked = true;
		cb.addEventListener("change", () => {
			if (cb.checked) state.statusCategories.add(cat);
			else state.statusCategories.delete(cat);
			apply();
		});
		statusChecks.set(cat, cb);
		label.appendChild(cb);
		label.appendChild(document.createTextNode(cat));
		statusWrap.appendChild(label);
	}

	function apply(): void {
		state.dateFrom = dateFrom.value;
		state.dateTo = dateTo.value;
		state.keyword = keyword.value;
		const filtered = filterEntries(entries, state);
		const visible = new Set(filtered.map((e) => e.lineNumber));
		badge.textContent = `Showing ${filtered.length} of ${entries.length} entries`;
		onApply(visible, filtered.length, entries.length);
	}

	dateFrom.addEventListener("change", apply);
	dateTo.addEventListener("change", apply);
	keyword.addEventListener("input", apply);

	row.appendChild(dateFrom);
	row.appendChild(dateTo);
	row.appendChild(statusWrap);
	row.appendChild(keyword);
	root.appendChild(badge);
	root.appendChild(row);

	apply();

	return {
		root,
		destroy: () => root.remove(),
	};
}

export function applyVisibilityToDom(root: HTMLElement, visibleLines: Set<number>): void {
	const rows = root.querySelectorAll("[data-trace-line]");
	rows.forEach((el) => {
		const line = Number(el.getAttribute("data-trace-line"));
		if (!line) return;
		(el as HTMLElement).style.display = visibleLines.has(line) ? "" : "none";
	});

	const cmLines = root.querySelectorAll(".cm-line");
	cmLines.forEach((el, idx) => {
		const lineNum = idx + 1;
		(el as HTMLElement).style.display = visibleLines.has(lineNum) ? "" : "none";
	});
}
