<script lang="ts">
	import {onMount} from "svelte";
	import type {WorkspaceLeaf} from "obsidian";
	import {setIcon} from "obsidian";
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import type {AtomicNoteRow} from "../fulcrum/types";
	import {
		areaFilterState,
		indexRevision,
		settingsRevision,
	} from "../fulcrum/stores";
	import {
		buildAreaLifeModeMap,
		isAreaFilterWideOpen,
		meetingPassesAreaFilter,
		projectPassesAreaFilter,
	} from "../fulcrum/utils/areaFocusFilter";
	import {parseDoneStatusSet} from "../fulcrum/settingsDefaults";
	import {addDaysIso, todayLocalISODate} from "../fulcrum/utils/dates";
	import {fetchForecastCalendarRows} from "../fulcrum/tasks/forecastCalendar";
	import {fetchBridgeCalendarEvents} from "../conduit/bridgeCalendar";
	import {formatMinutesLabel, type ForecastCalendarRow} from "../fulcrum/tasks/tasksViewModel";
	import {collectHorizonTasks} from "../fulcrum/tasks/horizonTasks";
	import {collectTodayChecklist} from "../fulcrum/today/todayTasks";
	import {buildTodayFeed, type TodayFeedItem} from "../fulcrum/today/todayFeed";
	import {formatTodayMasthead, shiftIsoWeek} from "../fulcrum/today/todayWeek";
	import {parseWorldClocks, formatWorldClockTime} from "../fulcrum/today/worldClocks";
	import {fetchOpenMeteoWeather, type WeatherForecast} from "../fulcrum/today/weather";
	import {weatherLucideIcon} from "../fulcrum/today/weatherParse";
	import {getDailyNoteForIso} from "../fulcrum/today/dailyQuickNote";
	import {showTodayAddMenu} from "../fulcrum/today/todayAddMenu";
	import TasksListRow from "./TasksListRow.svelte";
	import TodayWeekStrip from "./TodayWeekStrip.svelte";
	import FulcrumLeafToolbar from "./FulcrumLeafToolbar.svelte";

	export let plugin: FulcrumHost;
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;

	const CHECKLIST_COLUMNS = ["title", "project", "tags"] as const;

	let focalDateIso = todayLocalISODate();
	let nowTick = 0;
	let weather: WeatherForecast | null = null;
	let weatherError = false;
	let weatherLoadId = 0;
	let forecastCalendarRows: ForecastCalendarRow[] = [];
	let calendarLoadId = 0;
	let atomicNotes: {projectPath: string; note: AtomicNoteRow}[] = [];
	let notesLoadId = 0;

	$: snapshot = (void $indexRevision, plugin.vaultIndex.getSnapshot());
	$: sRev = $settingsRevision;
	$: doneTask = (void sRev, parseDoneStatusSet(plugin.settings.taskDoneStatuses));
	$: areaFilter = $areaFilterState;
	$: lifeModeMap = buildAreaLifeModeMap(snapshot.areas, {
		projects: snapshot.projects,
		app: plugin.app,
		typeField: plugin.settings.typeField,
		areaTypeValue: plugin.settings.areaTypeValue,
		settings: plugin.settings,
	});
	$: clocks = (void sRev, parseWorldClocks(plugin.settings.todayWorldClocks));
	$: clockTimes = (void nowTick,
		clocks.map((c) => ({
			...c,
			time: formatWorldClockTime(new Date(), c.timeZone),
		})));

	$: masthead = formatTodayMasthead(focalDateIso);
	$: todayIso = todayLocalISODate();
	$: isFocalToday = focalDateIso === todayIso;

	$: filteredTasks = collectHorizonTasks(
		snapshot,
		plugin.settings,
		areaFilter,
		lifeModeMap,
		doneTask,
	);
	$: checklist = collectTodayChecklist(filteredTasks, focalDateIso, todayIso);

	$: filteredMeetings = snapshot.meetings.filter((m) =>
		meetingPassesAreaFilter(m, snapshot, areaFilter, lifeModeMap),
	);
	$: filteredNotes = atomicNotes
		.filter(({projectPath}) => {
			if (isAreaFilterWideOpen(areaFilter)) return true;
			const proj = snapshot.projects.find((p) => p.file.path === projectPath);
			return proj != null && projectPassesAreaFilter(proj, areaFilter, lifeModeMap);
		})
		.map((x) => x.note);
	$: filteredPlanner = (snapshot.plannerEvents ?? []).filter((ev) => {
		if (ev.dateIso !== focalDateIso) return false;
		if (isAreaFilterWideOpen(areaFilter) || !ev.projectFile) return true;
		const proj = snapshot.projects.find((p) => p.file.path === ev.projectFile!.path);
		return proj != null && projectPassesAreaFilter(proj, areaFilter, lifeModeMap);
	});
	$: dailyFile = (void $indexRevision, getDailyNoteForIso(focalDateIso));
	$: feedSections = buildTodayFeed({
		dateIso: focalDateIso,
		meetings: filteredMeetings,
		notes: filteredNotes,
		calendarEvents: forecastCalendarRows,
		plannerEvents: filteredPlanner,
		dailyNoteTitle: dailyFile?.basename.replace(/\.md$/i, "") ?? null,
		dailyNotePath: dailyFile?.path ?? null,
	});

	$: {
		void $indexRevision;
		void sRev;
		void plugin.settings.forecastCalendarIds;
		void plugin.settings.forecastShowSystemCalendars;
		void plugin.settings.conduitEnabled;
		void focalDateIso;
		void refreshForecast();
		void refreshNotes();
	}

	$: {
		void sRev;
		void plugin.settings.todayWeatherLocation;
		void plugin.settings.todayWeatherUnits;
		void refreshWeather();
	}

	async function refreshForecast(): Promise<void> {
		const id = ++calendarLoadId;
		const from = focalDateIso;
		const to = addDaysIso(focalDateIso, 1);
		try {
			const [forecast, overlay] = await Promise.all([
				fetchForecastCalendarRows(plugin.settings, from, to).catch(() => []),
				fetchBridgeCalendarEvents(plugin.settings, from, to).catch(() => []),
			]);
			if (id !== calendarLoadId) return;
			const seen = new Set(
				forecast.map((r) => `${r.title}|${r.dateIso}|${r.startMinutes ?? ""}`),
			);
			const extra: ForecastCalendarRow[] = [];
			for (const [i, ev] of overlay.entries()) {
				const key = `${ev.title}|${ev.dateIso}|${ev.startMinutes ?? ""}`;
				if (seen.has(key)) continue;
				seen.add(key);
				extra.push({
					eventId: `overlay-${i}-${ev.title}`,
					title: ev.title,
					dateIso: ev.dateIso,
					startMinutes: ev.startMinutes,
					durationMinutes: ev.durationMinutes,
				});
			}
			forecastCalendarRows = [...forecast, ...extra];
		} catch (e) {
			console.error(e);
			if (id === calendarLoadId) forecastCalendarRows = [];
		}
	}

	async function refreshNotes(): Promise<void> {
		const id = ++notesLoadId;
		try {
			const rows = await plugin.vaultIndex.listAtomicNotes();
			if (id === notesLoadId) atomicNotes = rows;
		} catch (e) {
			console.error(e);
			if (id === notesLoadId) atomicNotes = [];
		}
	}

	async function refreshWeather(): Promise<void> {
		const q = plugin.settings.todayWeatherLocation.trim();
		if (!q) {
			weather = null;
			weatherError = false;
			return;
		}
		const id = ++weatherLoadId;
		try {
			const next = await fetchOpenMeteoWeather(q, plugin.settings.todayWeatherUnits);
			if (id !== weatherLoadId) return;
			weather = next;
			weatherError = next == null;
		} catch (e) {
			console.error(e);
			if (id !== weatherLoadId) return;
			weather = null;
			weatherError = true;
		}
	}

	onMount(() => {
		const id = window.setInterval(() => {
			nowTick += 1;
		}, 30_000);
		return () => window.clearInterval(id);
	});

	function onPickDay(iso: string): void {
		focalDateIso = iso;
	}

	function onAddDay(ev: MouseEvent, iso: string): void {
		focalDateIso = iso;
		showTodayAddMenu(plugin, iso, ev, hoverParentLeaf);
	}

	function goToday(): void {
		focalDateIso = todayLocalISODate();
	}

	function shiftWeek(weeks: number): void {
		focalDateIso = shiftIsoWeek(focalDateIso, weeks);
	}

	function feedIconName(item: TodayFeedItem): string {
		switch (item.kind) {
			case "meeting":
				return "users";
			case "calendar":
				return "calendar";
			case "note":
				return "sticky-note";
			case "planner":
				return "clock";
			case "daily":
				return "book-open";
			default:
				return "dot";
		}
	}

	function bindFeedIcon(node: HTMLElement, item: TodayFeedItem) {
		setIcon(node, feedIconName(item));
		return {
			update(next: TodayFeedItem) {
				setIcon(node, feedIconName(next));
			},
			destroy() {
				node.empty();
			},
		};
	}

	function bindWeatherIcon(node: HTMLElement, code: number) {
		setIcon(node, weatherLucideIcon(code));
		return {
			update(next: number) {
				setIcon(node, weatherLucideIcon(next));
			},
			destroy() {
				node.empty();
			},
		};
	}

	function openFeedItem(item: TodayFeedItem): void {
		if (item.kind === "planner" && item.planner) {
			plugin.openPlannerEvent(item.planner, hoverParentLeaf);
			return;
		}
		if (item.filePath) {
			plugin.openLinkedNoteFromFulcrum(item.filePath, hoverParentLeaf);
		}
	}
</script>

<div class="fulcrum-today">
	<header class="fulcrum-today__head">
		<div class="fulcrum-today__masthead">
			<span class="fulcrum-today__day-num">{masthead.dayNum}</span>
			<span class="fulcrum-today__mast-rest">{masthead.monthWeekday}</span>
			{#if !isFocalToday}
				<button type="button" class="fulcrum-today__jump-today" on:click={goToday}>Today</button>
			{/if}
		</div>
		<FulcrumLeafToolbar {plugin} />
	</header>

	<div class="fulcrum-today__columns">
		<section class="fulcrum-today__col fulcrum-today__col--left" aria-label="Schedule">
			{#if clockTimes.length > 0}
				<div class="fulcrum-today__clocks" role="group" aria-label="World time">
					{#each clockTimes as clock (clock.label + clock.timeZone)}
						<div class="fulcrum-today__clock">
							<span class="fulcrum-today__clock-time">{clock.time}</span>
							<span class="fulcrum-today__clock-label">{clock.label}</span>
						</div>
					{/each}
				</div>
			{/if}

			{#if feedSections.length === 0}
				<p class="fulcrum-muted fulcrum-today__empty">Nothing on the calendar for this day.</p>
			{:else}
				{#each feedSections as section (section.key)}
					<div class="fulcrum-today__block">
						<div class="fulcrum-today__block-head">
							<h2 class="fulcrum-today__block-title">{section.label}</h2>
							<button
								type="button"
								class="fulcrum-today__add"
								aria-label={`Add to ${section.label.toLowerCase()}`}
								on:click={(e) => onAddDay(e, focalDateIso)}
							>
								+
							</button>
						</div>
						<ul class="fulcrum-today__feed">
							{#each section.items as item (item.key)}
								<li>
									<button
										type="button"
										class="fulcrum-today__feed-row"
										on:click={() => openFeedItem(item)}
									>
										<span class="fulcrum-today__feed-time">
											{item.startMinutes != null ? formatMinutesLabel(item.startMinutes) : ""}
										</span>
										<span class="fulcrum-today__feed-icon" use:bindFeedIcon={item} aria-hidden="true"
										></span>
										<span class="fulcrum-today__feed-body">
											<span class="fulcrum-today__feed-title">{item.title}</span>
											{#if item.subtitle}
												<span class="fulcrum-today__feed-sub">{item.subtitle}</span>
											{/if}
										</span>
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			{/if}
		</section>

		<div class="fulcrum-today__rule" aria-hidden="true"></div>

		<section class="fulcrum-today__col fulcrum-today__col--right" aria-label="Tasks">
			<div class="fulcrum-today__weather">
				{#if !plugin.settings.todayWeatherLocation.trim()}
					<p class="fulcrum-muted fulcrum-today__weather-empty">
						Set a weather location in Fulcrum settings → Views.
					</p>
				{:else if weatherError}
					<p class="fulcrum-muted fulcrum-today__weather-empty">Weather unavailable.</p>
				{:else if weather}
					<div class="fulcrum-today__weather-now">
						<span class="fulcrum-today__weather-icon" use:bindWeatherIcon={weather.currentCode}></span>
						<span class="fulcrum-today__weather-temp">{weather.currentTemp}°</span>
						<span class="fulcrum-today__weather-place">{weather.locationLabel}</span>
					</div>
					<div class="fulcrum-today__weather-days">
						{#each weather.days as day (day.iso)}
							<div class="fulcrum-today__weather-day">
								<span class="fulcrum-today__weather-wd">{day.weekday}</span>
								<span class="fulcrum-today__weather-dicon" use:bindWeatherIcon={day.code}></span>
								<span class="fulcrum-today__weather-hi">{day.high}°</span>
							</div>
						{/each}
					</div>
				{:else}
					<p class="fulcrum-muted fulcrum-today__weather-empty">Loading weather…</p>
				{/if}
			</div>

			{#if checklist.outstanding.length > 0}
				<div class="fulcrum-today__block">
					<h2 class="fulcrum-today__block-title">Outstanding</h2>
					<div class="fulcrum-today__checklist">
						{#each checklist.outstanding as task (task.file.path + (task.line ?? ""))}
							<TasksListRow
								{plugin}
								{task}
								columns={[...CHECKLIST_COLUMNS]}
								{doneTask}
								{hoverParentLeaf}
							/>
						{/each}
					</div>
				</div>
			{/if}

			<div class="fulcrum-today__block">
				<div class="fulcrum-today__block-head">
					<h2 class="fulcrum-today__block-title">Tasks</h2>
					<button
						type="button"
						class="fulcrum-today__add"
						aria-label="Add for this day"
						on:click={(e) => onAddDay(e, focalDateIso)}
					>
						+
					</button>
				</div>
				{#if checklist.day.length === 0}
					<p class="fulcrum-muted fulcrum-today__empty">No tasks for this day.</p>
				{:else}
					<div class="fulcrum-today__checklist">
						{#each checklist.day as entry (entry.task.file.path + (entry.occurrenceDateIso ?? "") + (entry.task.line ?? ""))}
							<TasksListRow
								{plugin}
								task={entry.task}
								columns={[...CHECKLIST_COLUMNS]}
								{doneTask}
								{hoverParentLeaf}
								occurrenceDateIso={entry.occurrenceDateIso}
								isGhostOccurrence={entry.isGhostOccurrence === true}
							/>
						{/each}
					</div>
				{/if}
			</div>
		</section>
	</div>

	<TodayWeekStrip
		{plugin}
		{focalDateIso}
		onPickDay={onPickDay}
		onAddDay={onAddDay}
		onPrevWeek={() => shiftWeek(-1)}
		onNextWeek={() => shiftWeek(1)}
	/>
</div>
