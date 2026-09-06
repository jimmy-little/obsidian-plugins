<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { TFile, type WorkspaceLeaf } from "obsidian";
	import type ReposePlugin from "../main";
	import { reposeMobile } from "../platform";
	import {
		addDays,
		daysInView,
		formatDayNum,
		formatDayShort,
		formatMonthYear,
		formatWeekRange,
		gridDates,
		gridStartDate,
		toISODate,
		type ReposeCalendarViewMode,
	} from "../calendar/calendarGrid";
	import {
		REPOSE_CALENDAR_EPISODE_MIME,
		episodeDragPayload,
		isEpisodeCalendarDrag,
		parseEpisodeDragPayload,
	} from "../calendar/calendarEpisodeDrag";
	import { bindVaultRefresh } from "./bindVaultRefresh";
	import {
		buildConsumptionIndex,
		consumptionEventsForDate,
		type ConsumptionEvent,
		type ConsumptionIndex,
	} from "../calendar/consumptionIndex";
	import { markEpisodeWatchedOnCalendarDate } from "../vault/watchState";

	export let plugin: ReposePlugin;
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;
	export let focalDateIso: string | undefined = undefined;
	export let onFocalIsoChange: ((iso: string) => void) | undefined = undefined;
	/** Mobile: open consumption records inside Repose instead of a split markdown tab. */
	export let onSelectPath: ((path: string) => void) | undefined = undefined;

	const mobileCalendar = reposeMobile();

	const WEEK_START = 0;

	let listRev = 0;
	let viewMode: ReposeCalendarViewMode = "month";
	let focalDate = new Date();
	focalDate.setHours(0, 0, 0, 0);

	let index: ConsumptionIndex = buildConsumptionIndex(plugin.app, plugin.settings);
	let dragOverDateIso: string | null = null;
	let episodeDragActive = false;
	let draggingCardPath: string | null = null;
	let dropBusy = false;
	let indexTimer: number | undefined;

	function scheduleIndexRebuild(): void {
		if (indexTimer !== undefined) window.clearTimeout(indexTimer);
		const delay = mobileCalendar ? 400 : 120;
		indexTimer = window.setTimeout(() => {
			indexTimer = undefined;
			index = buildConsumptionIndex(plugin.app, plugin.settings);
		}, delay);
	}

	$: if (listRev > 0) {
		scheduleIndexRebuild();
	}

	$: if (focalDateIso && /^\d{4}-\d{2}-\d{2}$/.test(focalDateIso)) {
		const next = new Date(`${focalDateIso}T12:00:00`);
		if (!Number.isNaN(next.getTime())) focalDate = next;
	}

	$: dates = gridDates(focalDate, viewMode, WEEK_START);
	$: startDate = gridStartDate(focalDate, viewMode, WEEK_START);
	$: dayCount = daysInView(viewMode);
	$: isMonthView = viewMode === "month";

	$: titleText = isMonthView ? formatMonthYear(focalDate) : formatWeekRange(startDate, dayCount);

	$: weekdayHeaders = isMonthView
		? (() => {
				const out: { label: string; date: Date }[] = [];
				for (let i = 0; i < 7; i++) {
					const d = addDays(startDate, i);
					out.push({ label: formatDayShort(d), date: d });
				}
				return out;
			})()
		: dates.map(({ date }) => ({
				label: `${formatDayShort(date)} ${formatDayNum(date)}`,
				date,
			}));

	function eventsForDate(iso: string): ConsumptionEvent[] {
		return consumptionEventsForDate(index, iso);
	}

	function openEvent(ev: ConsumptionEvent): void {
		if (mobileCalendar && onSelectPath) {
			onSelectPath(ev.path);
			return;
		}
		void plugin.openConsumptionRecordInSplit(ev.path, hoverParentLeaf);
	}

	function onCardKeydown(ev: KeyboardEvent, consumption: ConsumptionEvent): void {
		if (ev.key !== "Enter" && ev.key !== " ") return;
		ev.preventDefault();
		openEvent(consumption);
	}

	function goPrev(): void {
		if (viewMode === "month") {
			focalDate = new Date(focalDate.getFullYear(), focalDate.getMonth() - 1, 1);
		} else {
			focalDate = addDays(focalDate, -dayCount);
		}
		notifyFocalChange();
	}

	function goNext(): void {
		if (viewMode === "month") {
			focalDate = new Date(focalDate.getFullYear(), focalDate.getMonth() + 1, 1);
		} else {
			focalDate = addDays(focalDate, dayCount);
		}
		notifyFocalChange();
	}

	function goToday(): void {
		focalDate = new Date();
		focalDate.setHours(0, 0, 0, 0);
		notifyFocalChange();
	}

	function notifyFocalChange(): void {
		onFocalIsoChange?.(toISODate(focalDate));
	}

	function onViewModeChange(ev: Event): void {
		viewMode = (ev.currentTarget as HTMLSelectElement).value as ReposeCalendarViewMode;
	}

	function isToday(iso: string): boolean {
		return iso === toISODate(new Date());
	}

	function hueFromPath(path: string): number {
		let h = 216;
		for (let i = 0; i < path.length; i++) h = (h + path.charCodeAt(i) * (i + 3)) % 360;
		return h;
	}

	function isEpisodeEvent(ev: ConsumptionEvent): boolean {
		return ev.mediaType === "episode";
	}

	function clearEpisodeDragState(): void {
		dragOverDateIso = null;
		episodeDragActive = false;
		draggingCardPath = null;
	}

	function onEpisodeCardDragStart(ev: ConsumptionEvent, e: DragEvent): void {
		if (!isEpisodeEvent(ev) || !e.dataTransfer) return;
		e.stopPropagation();
		e.dataTransfer.setData(REPOSE_CALENDAR_EPISODE_MIME, episodeDragPayload(ev.path));
		e.dataTransfer.effectAllowed = "copy";
		episodeDragActive = true;
		draggingCardPath = ev.path;
	}

	function onDayDragOver(iso: string, e: DragEvent): void {
		if (!isEpisodeCalendarDrag(e)) return;
		e.preventDefault();
		e.stopPropagation();
		if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
		dragOverDateIso = iso;
		episodeDragActive = true;
	}

	function onDayDragLeave(iso: string, e: DragEvent): void {
		const cell = e.currentTarget as HTMLElement;
		const rel = e.relatedTarget;
		if (rel instanceof Node && cell.contains(rel)) return;
		if (dragOverDateIso === iso) dragOverDateIso = null;
	}

	async function onDayDrop(iso: string, e: DragEvent): Promise<void> {
		if (dropBusy) return;
		const raw = e.dataTransfer?.getData(REPOSE_CALENDAR_EPISODE_MIME) ?? "";
		const path = parseEpisodeDragPayload(raw);
		clearEpisodeDragState();
		if (!path) return;
		e.preventDefault();
		e.stopPropagation();
		const file = plugin.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		dropBusy = true;
		try {
			await markEpisodeWatchedOnCalendarDate(plugin, file, iso);
			listRev++;
		} finally {
			dropBusy = false;
		}
	}

	onMount(() => {
		return bindVaultRefresh(plugin, () => listRev++, { debounceMs: 200 });
	});

	onDestroy(() => {
		if (indexTimer !== undefined) window.clearTimeout(indexTimer);
	});
</script>

<svelte:window on:dragend={clearEpisodeDragState} on:drop={clearEpisodeDragState} />

<div
	class="repose-calendar"
	class:repose-calendar--episode-drag={episodeDragActive}
	data-repose-calendar-root
>
	<div class="repose-calendar__toolbar">
		<button type="button" class="repose-calendar__nav-btn" aria-label="Previous" on:click={goPrev}>‹</button>
		<button type="button" class="repose-calendar__nav-btn" aria-label="Next" on:click={goNext}>›</button>
		<h2 class="repose-calendar__title">{titleText}</h2>
		<button type="button" class="repose-calendar__today" on:click={goToday}>Today</button>
		<label class="repose-calendar__view-mode">
			<span class="repose-calendar__view-mode-label">View</span>
			<select
				class="dropdown repose-calendar__view-select"
				aria-label="Calendar view mode"
				value={viewMode}
				on:change={onViewModeChange}
			>
				<option value="month">Month</option>
				<option value="week">Week</option>
			</select>
		</label>
	</div>

	<div class="repose-calendar__scroll">
		{#if isMonthView}
			<div class="repose-calendar__month" role="grid" aria-label="Month calendar">
				<div class="repose-calendar__month-header" role="row">
					{#each weekdayHeaders as { label }}
						<div class="repose-calendar__month-cell repose-calendar__month-cell--head" role="columnheader">
							{label}
						</div>
					{/each}
				</div>
				<div class="repose-calendar__month-body">
					{#each Array(Math.ceil(dates.length / 7)) as _, rowIndex}
						<div class="repose-calendar__month-row" role="row">
							{#each Array(7) as _, colIndex}
								{@const idx = rowIndex * 7 + colIndex}
								{@const cell = dates[idx]}
								{#if cell}
									{@const iso = toISODate(cell.date)}
									{@const dayEvents = (listRev, eventsForDate(iso))}
									<div
										class="repose-calendar__day-cell"
										class:repose-calendar__day-cell--other-month={!cell.isCurrentMonth}
										class:repose-calendar__day-cell--today={isToday(iso)}
										class:repose-calendar__day-cell--has-events={dayEvents.length > 0}
										class:repose-calendar__day-cell--drop-target={dragOverDateIso === iso}
										role="gridcell"
										data-date={iso}
										on:dragover={(e) => onDayDragOver(iso, e)}
										on:dragleave={(e) => onDayDragLeave(iso, e)}
										on:drop={(e) => void onDayDrop(iso, e)}
									>
										<span class="repose-calendar__day-num">{formatDayNum(cell.date)}</span>
										<div class="repose-calendar__day-events">
											{#each dayEvents as ev (ev.id)}
												<div
													class="repose-cal-card"
													class:repose-cal-card--draggable={isEpisodeEvent(ev)}
													class:repose-cal-card--dragging={draggingCardPath === ev.path}
													role="button"
													tabindex="0"
													draggable={isEpisodeEvent(ev)}
													on:click={() => openEvent(ev)}
													on:keydown={(e) => onCardKeydown(e, ev)}
													on:dragstart={(e) => onEpisodeCardDragStart(ev, e)}
													on:dragend={clearEpisodeDragState}
												>
													<span class="repose-cal-card__thumb">
														{#if ev.thumbUrl}
															<img src={ev.thumbUrl} alt="" loading="lazy" />
														{/if}
														{#if !ev.thumbUrl}
															<span
																class="repose-cal-card__ph"
																style="--repose-hue: {hueFromPath(ev.path)}"
															></span>
														{/if}
													</span>
													<span class="repose-cal-card__body">
														<span class="repose-cal-card__title">{ev.title}</span>
														{#if ev.subtitle}
															<span class="repose-cal-card__sub">{ev.subtitle}</span>
														{/if}
													</span>
												</div>
											{/each}
										</div>
									</div>
								{/if}
							{/each}
						</div>
					{/each}
				</div>
			</div>
		{/if}
		{#if !isMonthView}
			<div class="repose-calendar__week" role="grid" aria-label="Week calendar">
				<div class="repose-calendar__week-header" role="row">
					{#each weekdayHeaders as { label, date }}
						{@const iso = toISODate(date)}
						<div
							class="repose-calendar__week-head"
							class:repose-calendar__week-head--today={isToday(iso)}
							role="columnheader"
						>
							{label}
						</div>
					{/each}
				</div>
				<div class="repose-calendar__week-body" role="row">
					{#each dates as { date }}
						{@const iso = toISODate(date)}
						{@const dayEvents = (listRev, eventsForDate(iso))}
						<div
							class="repose-calendar__week-col"
							class:repose-calendar__week-col--today={isToday(iso)}
							class:repose-calendar__week-col--has-events={dayEvents.length > 0}
							class:repose-calendar__week-col--drop-target={dragOverDateIso === iso}
							role="gridcell"
							data-date={iso}
							on:dragover={(e) => onDayDragOver(iso, e)}
							on:dragleave={(e) => onDayDragLeave(iso, e)}
							on:drop={(e) => void onDayDrop(iso, e)}
						>
							<div class="repose-calendar__week-events">
								{#each dayEvents as ev (ev.id)}
									<div
										class="repose-cal-card repose-cal-card--week"
										class:repose-cal-card--draggable={isEpisodeEvent(ev)}
										class:repose-cal-card--dragging={draggingCardPath === ev.path}
										role="button"
										tabindex="0"
										draggable={isEpisodeEvent(ev)}
										on:click={() => openEvent(ev)}
										on:keydown={(e) => onCardKeydown(e, ev)}
										on:dragstart={(e) => onEpisodeCardDragStart(ev, e)}
										on:dragend={clearEpisodeDragState}
									>
										<span class="repose-cal-card__thumb">
											{#if ev.thumbUrl}
												<img src={ev.thumbUrl} alt="" loading="lazy" />
											{/if}
											{#if !ev.thumbUrl}
												<span
													class="repose-cal-card__ph"
													style="--repose-hue: {hueFromPath(ev.path)}"
												></span>
											{/if}
										</span>
										<span class="repose-cal-card__body">
											<span class="repose-cal-card__title">{ev.title}</span>
											{#if ev.subtitle}
												<span class="repose-cal-card__sub">{ev.subtitle}</span>
											{/if}
										</span>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>
