import { Component, MarkdownRenderer } from "obsidian";
import type PulsePlugin from "../main";
import type { ExerciseLogEntry, SetEntry, SessionData } from "./types";
import { createSuiteWorkoutHeatmap } from "./pulseHeatmap";

const SVG_NS = "http://www.w3.org/2000/svg";

export function estimate1RM(weight: number, reps: number): number {
	if (reps <= 0 || weight <= 0) return 0;
	if (reps === 1) return weight;
	return Math.round(weight * (1 + reps / 30));
}

export function daysAgo(dateStr: string): number {
	const d = new Date(dateStr + "T00:00:00");
	const now = new Date();
	now.setHours(0, 0, 0, 0);
	return Math.round((now.getTime() - d.getTime()) / 86400000);
}

export function relativeDate(dateStr: string): string {
	const days = daysAgo(dateStr);
	if (days === 0) return "Today";
	if (days === 1) return "Yesterday";
	if (days < 7) return `${days} days ago`;
	if (days < 14) return "1 week ago";
	if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
	if (days < 60) return "1 month ago";
	return `${Math.floor(days / 30)} months ago`;
}

export function bestSet(entries: ExerciseLogEntry[]): SetEntry | null {
	let best: SetEntry | null = null;
	for (const e of entries) {
		for (const s of e.sets) {
			if (s.weight != null && s.reps != null && s.weight > 0) {
				if (!best || s.weight > (best.weight ?? 0) || (s.weight === best.weight && (s.reps ?? 0) > (best.reps ?? 0))) {
					best = s;
				}
			}
		}
	}
	return best;
}

export function totalVolumeForEntry(entry: ExerciseLogEntry): number {
	return entry.sets.reduce((sum, s) =>
		(s.weight != null && s.reps != null) ? sum + s.weight * s.reps : sum, 0);
}

// ─── SVG chart helpers ───

export function buildProgressSvg(entries: ExerciseLogEntry[], width: number, height: number): SVGSVGElement {
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
	svg.setAttribute("class", "pulse-log-chart-svg");

	const e1rmData = entries
		.map(e => {
			const best = e.sets
				.filter(s => s.weight != null && s.reps != null && s.weight! > 0)
				.reduce<SetEntry | null>((b, s) => {
					const e1 = estimate1RM(s.weight!, s.reps!);
					const bE1 = b ? estimate1RM(b.weight!, b.reps!) : 0;
					return e1 > bE1 ? s : b;
				}, null);
			return { date: e.date, e1rm: best ? estimate1RM(best.weight!, best.reps!) : 0 };
		})
		.filter(d => d.e1rm > 0)
		.reverse();

	const pad = { top: 8, right: 8, bottom: 20, left: 36 };
	const plotW = width - pad.left - pad.right;
	const plotH = height - pad.top - pad.bottom;

	if (e1rmData.length === 0) {
		const msg = document.createElementNS(SVG_NS, "text");
		msg.setAttribute("x", String(width / 2));
		msg.setAttribute("y", String(height / 2));
		msg.setAttribute("text-anchor", "middle");
		msg.setAttribute("class", "pulse-log-empty-chart-msg");
		msg.textContent = "Log weighted sets to see estimated 1RM over time.";
		svg.appendChild(msg);
		return svg;
	}

	const vals = e1rmData.map(d => d.e1rm);
	const minV = Math.min(...vals);
	const maxV = Math.max(...vals);
	const range = maxV - minV || 1;

	const gridSteps = 4;
	for (let i = 0; i <= gridSteps; i++) {
		const y = pad.top + (plotH / gridSteps) * i;
		const line = document.createElementNS(SVG_NS, "line");
		line.setAttribute("x1", String(pad.left));
		line.setAttribute("x2", String(width - pad.right));
		line.setAttribute("y1", String(y));
		line.setAttribute("y2", String(y));
		line.setAttribute("class", "pulse-log-grid-line");
		svg.appendChild(line);
		const label = document.createElementNS(SVG_NS, "text");
		label.setAttribute("x", String(pad.left - 4));
		label.setAttribute("y", String(y + 3));
		label.setAttribute("class", "pulse-log-axis-label");
		label.textContent = String(Math.round(maxV - (range / gridSteps) * i));
		svg.appendChild(label);
	}

	const xAt = (i: number, n: number) => pad.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);

	if (e1rmData.length === 1) {
		const x = xAt(0, 1);
		const y = pad.top + plotH - ((e1rmData[0].e1rm - minV) / range) * plotH;
		const dl = document.createElementNS(SVG_NS, "text");
		dl.setAttribute("x", String(x));
		dl.setAttribute("y", String(height - 2));
		dl.setAttribute("text-anchor", "middle");
		dl.setAttribute("class", "pulse-log-date-label");
		dl.textContent = e1rmData[0].date.slice(5);
		svg.appendChild(dl);

		const defs = document.createElementNS(SVG_NS, "defs");
		const grad = document.createElementNS(SVG_NS, "linearGradient");
		grad.setAttribute("id", "pulse-e1rm-gradient");
		grad.setAttribute("x1", "0");
		grad.setAttribute("x2", "0");
		grad.setAttribute("y1", "0");
		grad.setAttribute("y2", "1");
		const stop1 = document.createElementNS(SVG_NS, "stop");
		stop1.setAttribute("offset", "0%");
		stop1.setAttribute("class", "pulse-log-grad-top");
		const stop2 = document.createElementNS(SVG_NS, "stop");
		stop2.setAttribute("offset", "100%");
		stop2.setAttribute("class", "pulse-log-grad-bottom");
		grad.appendChild(stop1);
		grad.appendChild(stop2);
		defs.appendChild(grad);
		svg.appendChild(defs);

		const bl = pad.top + plotH;
		const areaPath = document.createElementNS(SVG_NS, "path");
		areaPath.setAttribute(
			"d",
			`M ${x - 3},${y} L ${x + 3},${y} L ${x + 3},${bl} L ${x - 3},${bl} Z`
		);
		areaPath.setAttribute("class", "pulse-log-area");
		svg.appendChild(areaPath);

		const c = document.createElementNS(SVG_NS, "circle");
		c.setAttribute("cx", String(x));
		c.setAttribute("cy", String(y));
		c.setAttribute("r", "4");
		c.setAttribute("class", "pulse-log-dot");
		svg.appendChild(c);
		return svg;
	}

	const denom = e1rmData.length - 1;
	const dateIdxs = [...new Set([0, Math.floor(e1rmData.length / 2), e1rmData.length - 1])].sort((a, b) => a - b);
	for (const idx of dateIdxs) {
		const x = xAt(idx, e1rmData.length);
		const label = document.createElementNS(SVG_NS, "text");
		label.setAttribute("x", String(x));
		label.setAttribute("y", String(height - 2));
		label.setAttribute("class", "pulse-log-date-label");
		label.textContent = e1rmData[idx].date.slice(5);
		svg.appendChild(label);
	}

	const defs = document.createElementNS(SVG_NS, "defs");
	const grad = document.createElementNS(SVG_NS, "linearGradient");
	grad.setAttribute("id", "pulse-e1rm-gradient");
	grad.setAttribute("x1", "0");
	grad.setAttribute("x2", "0");
	grad.setAttribute("y1", "0");
	grad.setAttribute("y2", "1");
	const stop1 = document.createElementNS(SVG_NS, "stop");
	stop1.setAttribute("offset", "0%");
	stop1.setAttribute("class", "pulse-log-grad-top");
	const stop2 = document.createElementNS(SVG_NS, "stop");
	stop2.setAttribute("offset", "100%");
	stop2.setAttribute("class", "pulse-log-grad-bottom");
	grad.appendChild(stop1);
	grad.appendChild(stop2);
	defs.appendChild(grad);
	svg.appendChild(defs);

	const pts = e1rmData.map((d, i) => ({
		x: pad.left + (i / denom) * plotW,
		y: pad.top + plotH - ((d.e1rm - minV) / range) * plotH,
	}));

	const areaPath = document.createElementNS(SVG_NS, "path");
	const areaD = `M${pts[0].x},${pts[0].y} ` +
		pts.slice(1).map(p => `L${p.x},${p.y}`).join(" ") +
		` L${pts[pts.length - 1].x},${pad.top + plotH} L${pts[0].x},${pad.top + plotH} Z`;
	areaPath.setAttribute("d", areaD);
	areaPath.setAttribute("class", "pulse-log-area");
	svg.appendChild(areaPath);

	const line = document.createElementNS(SVG_NS, "polyline");
	line.setAttribute("points", pts.map(p => `${p.x},${p.y}`).join(" "));
	line.setAttribute("class", "pulse-log-line");
	svg.appendChild(line);

	for (const p of pts) {
		const c = document.createElementNS(SVG_NS, "circle");
		c.setAttribute("cx", String(p.x));
		c.setAttribute("cy", String(p.y));
		c.setAttribute("r", "2.5");
		c.setAttribute("class", "pulse-log-dot");
		svg.appendChild(c);
	}

	return svg;
}

/**
 * Same layout as Orbit person profiles / Stats: `suite-heatmap-wrap` with month + weekday labels.
 */
export function buildActivityHeatmap(entries: ExerciseLogEntry[]): HTMLElement {
	const counts = new Map<string, number>();
	for (const e of entries) {
		counts.set(e.date, (counts.get(e.date) ?? 0) + 1);
	}
	const wrap = createSuiteWorkoutHeatmap(counts, {
		ariaLabel: "Logged sets for this exercise in the last year",
	});
	wrap.addClass("pulse-log-activity-heatmap");
	return wrap;
}

export function renderExerciseLogBlock(source: string, el: HTMLElement, plugin: PulsePlugin): void {
	let entries: ExerciseLogEntry[];
	try {
		entries = JSON.parse(source);
	} catch {
		el.createEl("p", { text: "Invalid pulse-log data", cls: "pulse-workout-error" });
		return;
	}

	if (!Array.isArray(entries) || entries.length === 0) {
		el.createEl("p", { text: "No logged sets yet.", cls: "pulse-workout-muted" });
		return;
	}

	const unit = plugin.settings.weightUnit;
	const container = el.createDiv({ cls: "pulse-log-block" });

	// ── Stat cards row ──
	const statsRow = container.createDiv({ cls: "pulse-log-stats" });

	// Last performed
	const lastEntry = entries[0];
	const lastCard = statsRow.createDiv({ cls: "pulse-log-card" });
	lastCard.createDiv({ text: "Last Done", cls: "pulse-log-card-label" });
	lastCard.createDiv({ text: relativeDate(lastEntry.date), cls: "pulse-log-card-value" });
	lastCard.createDiv({ text: lastEntry.date, cls: "pulse-log-card-sub" });

	// PR / best set
	const pr = bestSet(entries);
	if (pr && pr.weight != null && pr.reps != null) {
		const prCard = statsRow.createDiv({ cls: "pulse-log-card pulse-log-card-accent" });
		prCard.createDiv({ text: "PR", cls: "pulse-log-card-label" });
		prCard.createDiv({ text: `${pr.weight} ${unit} × ${pr.reps}`, cls: "pulse-log-card-value" });
		const e1rm = estimate1RM(pr.weight, pr.reps);
		prCard.createDiv({ text: `Est. 1RM: ${e1rm} ${unit}`, cls: "pulse-log-card-sub" });
	}

	// Total sessions
	const sessCard = statsRow.createDiv({ cls: "pulse-log-card" });
	sessCard.createDiv({ text: "Sessions", cls: "pulse-log-card-label" });
	sessCard.createDiv({ text: String(entries.length), cls: "pulse-log-card-value" });
	const totalSets = entries.reduce((s, e) => s + e.sets.length, 0);
	sessCard.createDiv({ text: `${totalSets} total sets`, cls: "pulse-log-card-sub" });

	// Total volume
	const volCard = statsRow.createDiv({ cls: "pulse-log-card" });
	volCard.createDiv({ text: "Total Volume", cls: "pulse-log-card-label" });
	const totalVol = entries.reduce((s, e) => s + totalVolumeForEntry(e), 0);
	volCard.createDiv({ text: `${totalVol.toLocaleString()}`, cls: "pulse-log-card-value" });
	volCard.createDiv({ text: unit, cls: "pulse-log-card-sub" });

	// ── E1RM progress chart ──
	const weightEntries = entries.filter(e => e.sets.some(s => s.weight != null && s.reps != null && s.weight! > 0));
	const chartSection = container.createDiv({ cls: "pulse-log-section" });
	chartSection.createDiv({ text: "Estimated 1RM Progress", cls: "pulse-log-section-title" });
	chartSection.appendChild(buildProgressSvg(weightEntries, 500, 140));

	// ── Activity heatmap (last ~52 weeks, same layout as Stats) ──
	const activitySection = container.createDiv({ cls: "pulse-log-section" });
	activitySection.createDiv({ text: "Activity", cls: "pulse-log-section-title" });
	activitySection.appendChild(buildActivityHeatmap(entries));

	// ── Recent log table ──
	const tableSection = container.createDiv({ cls: "pulse-log-section" });
	const headerRow = tableSection.createDiv({ cls: "pulse-log-section-header" });
	headerRow.createDiv({ text: "Recent Sessions", cls: "pulse-log-section-title" });

	const table = tableSection.createEl("table", { cls: "pulse-log-table" });
	const thead = table.createEl("thead");
	const hRow = thead.createEl("tr");
	["Date", "Sets", "Best Set", "Volume"].forEach(h => hRow.createEl("th", { text: h }));

	const tbody = table.createEl("tbody");
	const displayEntries = entries.slice(0, 10);
	for (const entry of displayEntries) {
		const row = tbody.createEl("tr");

		const dateCell = row.createEl("td");
		dateCell.createSpan({ text: entry.date });
		const ago = daysAgo(entry.date);
		if (ago <= 7) dateCell.createSpan({ text: ` (${relativeDate(entry.date)})`, cls: "pulse-log-relative" });

		row.createEl("td", { text: String(entry.sets.length) });

		const best = entry.sets.reduce<SetEntry | null>((b, s) =>
			(s.weight != null && s.reps != null && (!b || s.weight! > (b.weight ?? 0))) ? s : b, null);
		row.createEl("td", {
			text: best?.weight != null && best?.reps != null ? `${best.weight} × ${best.reps}` : "—",
		});

		const volume = totalVolumeForEntry(entry);
		row.createEl("td", { text: volume > 0 ? `${volume.toLocaleString()} ${unit}` : "—" });
	}

	if (entries.length > 10) {
		tableSection.createDiv({
			text: `+ ${entries.length - 10} more sessions`,
			cls: "pulse-log-more",
		});
	}
}

export function renderSessionBlock(
	source: string,
	el: HTMLElement,
	plugin: PulsePlugin,
	sourcePath?: string,
): void {
	let data: SessionData;
	try {
		data = JSON.parse(source);
	} catch {
		el.createEl("p", { text: "Invalid pulse-session data", cls: "pulse-workout-error" });
		return;
	}

	if (!data.exercises || data.exercises.length === 0) {
		el.createEl("p", { text: "No exercises in this session.", cls: "pulse-workout-muted" });
		return;
	}

	const unit = plugin.settings.weightUnit;
	const container = el.createDiv({ cls: "pulse-workout-session-block" });
	const table = container.createEl("table", { cls: "pulse-workout-session-table" });
	const thead = table.createEl("thead");
	const headerRow = thead.createEl("tr");
	["Exercise", "Sets", "Volume"].forEach(h => {
		headerRow.createEl("th", { text: h });
	});

	const tbody = table.createEl("tbody");
	const comp = new Component();
	plugin.addChild(comp);
	void (async () => {
		for (const exercise of data.exercises) {
			const row = tbody.createEl("tr");
			const td = row.createEl("td", { cls: "pulse-workout-session-exercise" });
			const p = plugin.workoutDataManager.resolveExerciseVaultPath(exercise.exercisePath).replace(/\.md$/i, "");
			await MarkdownRenderer.render(plugin.app, `[[${p}]]`, td, sourcePath ?? "", comp);
			row.createEl("td", { text: String(exercise.sets.length) });

			const volume = exercise.sets.reduce((sum, s) => {
				if (s.weight != null && s.reps != null) return sum + s.weight * s.reps;
				return sum;
			}, 0);
			row.createEl("td", { text: volume > 0 ? `${volume.toLocaleString()} ${unit}` : "—" });
		}
	})();
}
