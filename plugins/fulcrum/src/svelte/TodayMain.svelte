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
		viewProjectFilterPaths,
	} from "../fulcrum/stores";
	import {
		buildAreaLifeModeMap,
		isAreaFilterWideOpen,
		meetingPassesAreaFilter,
		projectPassesAreaFilter,
		taskPassesAreaFilter,
	} from "../fulcrum/utils/areaFocusFilter";
	import {parseDoneStatusSet} from "../fulcrum/settingsDefaults";
	import {addDaysIso, todayLocalISODate} from "../fulcrum/utils/dates";
	import {fetchForecastCalendarRows} from "../fulcrum/tasks/forecastCalendar";
	import {fetchBridgeCalendarEvents} from "../conduit/bridgeCalendar";
	import {
		filterOpenTasksForTasksView,
		type ForecastCalendarRow,
	} from "../fulcrum/tasks/tasksViewModel";
	import {collectHorizonTasks} from "../fulcrum/tasks/horizonTasks";
	import {
		collectFocalDoneDayEntries,
		collectTodayChecklist,
		mergeTodayDayEntries,
	} from "../fulcrum/today/todayTasks";
	import {buildTodayFeed, todayTaskFeedItem} from "../fulcrum/today/todayFeed";
	import {taskMatchesViewProjectFilter} from "../fulcrum/utils/viewProjectFilter";
	import {projectColorMap} from "../fulcrum/utils/calendarEvents";
	import {formatTodayMasthead, shiftIsoWeek} from "../fulcrum/today/todayWeek";
	import {parseWorldClocks, formatWorldClockTime} from "../fulcrum/today/worldClocks";
	import {
		isDaytimeInTimeZone,
		sortWorldClocksByLocalTime,
	} from "../fulcrum/utils/worldClocks";
	import {
		filterForecastCalendarsAgainstMeetings,
		filterForecastCalendarsAgainstNotes,
		filterMeetingsAgainstNotes,
	} from "../fulcrum/utils/calendarOccurrenceDedupe";
	import {fetchOpenMeteoWeather, type WeatherForecast} from "../fulcrum/today/weather";
	import {weatherLucideIcon} from "../fulcrum/today/weatherParse";
	import {getDailyNoteForIso} from "../fulcrum/today/dailyQuickNote";
	import {showTodayAddMenu} from "../fulcrum/today/todayAddMenu";
	import TodayFeedRow from "./TodayFeedRow.svelte";
	import TodayWeekStrip from "./TodayWeekStrip.svelte";
	import TodayActiveTimers from "./TodayActiveTimers.svelte";
	import FulcrumLeafToolbar from "./FulcrumLeafToolbar.svelte";

	export let plugin: FulcrumHost;
	export let hoverParentLeaf: WorkspaceLeaf | undefined = undefined;

	let focalDateIso = todayLocalISODate();
	let nowTick = 0;
	let weather: WeatherForecast | null = null;
	let weatherLoadId = 0;
	let forecastCalendarRows: ForecastCalendarRow[] = [];
	let calendarLoadId = 0;
	let atomicNotes: {projectPath: string; note: AtomicNoteRow}[] = [];
	let notesLoadId = 0;

	function takeCalendarLoadId(): number {
		calendarLoadId += 1;
		return calendarLoadId;
	}
	function takeNotesLoadId(): number {
		notesLoadId += 1;
		return notesLoadId;
	}
	function takeWeatherLoadId(): number {
		weatherLoadId += 1;
		return weatherLoadId;
	}

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
	$: clockTimes = (void nowTick, (() => {
		const now = new Date();
		return sortWorldClocksByLocalTime(
			clocks.map((c) => ({
				label: c.label,
				timeZone: c.timeZone as string | null,
				time: formatWorldClockTime(now, c.timeZone),
				daytime: isDaytimeInTimeZone(now, c.timeZone),
			})),
			now,
		);
	})());

	$: masthead = formatTodayMasthead(focalDateIso);
	$: todayIso = todayLocalISODate();

	$: selectedProjectPaths = $viewProjectFilterPaths;
	$: filteredTasks = collectHorizonTasks(
		snapshot,
		plugin.settings,
		areaFilter,
		lifeModeMap,
		doneTask,
		selectedProjectPaths,
	);
	$: checklist = collectTodayChecklist(filteredTasks, focalDateIso, todayIso);
	$: colorByProject = projectColorMap(snapshot.projects);
	$: focalDoneEntries = (void sRev, collectFocalDoneDayEntries(
		filterOpenTasksForTasksView(
			snapshot.tasks.filter(
				(t) =>
					taskPassesAreaFilter(t, snapshot, areaFilter, lifeModeMap, {includeUnlinked: true}) &&
					taskMatchesViewProjectFilter(t, selectedProjectPaths),
			),
			{...plugin.settings, taskSidebarFilterUncheckedStatus: []},
		),
		focalDateIso,
		doneTask,
	));
	$: dayEntries = mergeTodayDayEntries(checklist.day, focalDoneEntries);

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
	$: feedMeetings = filterMeetingsAgainstNotes(filteredMeetings, filteredNotes);
	$: feedCalendarEvents = filterForecastCalendarsAgainstNotes(
		filterForecastCalendarsAgainstMeetings(forecastCalendarRows, feedMeetings),
		filteredNotes,
	);
	$: filteredPlanner = (snapshot.plannerEvents ?? []).filter((ev) => {
		if (ev.dateIso !== focalDateIso) return false;
		if (isAreaFilterWideOpen(areaFilter) || !ev.projectFile) return true;
		const proj = snapshot.projects.find((p) => p.file.path === ev.projectFile!.path);
		return proj != null && projectPassesAreaFilter(proj, areaFilter, lifeModeMap);
	});
	$: dailyFile = (void $indexRevision, getDailyNoteForIso(focalDateIso));
	$: feedSections = buildTodayFeed({
		dateIso: focalDateIso,
		meetings: feedMeetings,
		notes: filteredNotes,
		calendarEvents: feedCalendarEvents,
		plannerEvents: filteredPlanner,
		dayTasks: dayEntries,
		doneStatuses: doneTask,
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
		if (snapshot.rebuiltAt > 0) void refreshNotes();
	}

	$: {
		void sRev;
		void plugin.settings.todayWeatherLocation;
		void plugin.settings.todayWeatherUnits;
		void refreshWeather();
	}

	async function refreshForecast(): Promise<void> {
		const id = takeCalendarLoadId();
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
					location: ev.location,
					calendarColor: ev.calendarColor,
				});
			}
			forecastCalendarRows = [...forecast, ...extra];
		} catch (e) {
			console.error(e);
			if (id === calendarLoadId) forecastCalendarRows = [];
		}
	}

	async function refreshNotes(): Promise<void> {
		const id = takeNotesLoadId();
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
			return;
		}
		const id = takeWeatherLoadId();
		try {
			const next = await fetchOpenMeteoWeather(q, plugin.settings.todayWeatherUnits);
			if (id !== weatherLoadId) return;
			weather = next;
		} catch (e) {
			console.error(e);
			if (id !== weatherLoadId) return;
			weather = null;
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

	function shiftWeek(weeks: number): void {
		focalDateIso = shiftIsoWeek(focalDateIso, weeks);
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

</script>

<div class="fulcrum-today">
	<header class="fulcrum-today__head">
		<div class="fulcrum-today__head-left">
			<div class="fulcrum-today__masthead">
				<div class="fulcrum-today__mast-line">
					<span class="fulcrum-today__day-num">{masthead.dayNum}</span>
					<span class="fulcrum-today__mast-month">{masthead.month}</span>
				</div>
				<span class="fulcrum-today__mast-weekday">{masthead.weekday}</span>
			</div>
			<TodayWeekStrip
				{plugin}
				{focalDateIso}
				compact
				onPickDay={onPickDay}
				onAddDay={onAddDay}
				onPrevWeek={() => shiftWeek(-1)}
				onNextWeek={() => shiftWeek(1)}
			/>
		</div>
		<div class="fulcrum-today__head-right">
			{#if plugin.settings.todayWeatherLocation.trim() && weather}
				<div class="fulcrum-today__weather fulcrum-today__weather--header">
					<div class="fulcrum-today__weather-days">
						{#each weather.days as day (day.iso)}
							<div class="fulcrum-today__weather-day">
								<span class="fulcrum-today__weather-wd">{day.weekday}</span>
								<span class="fulcrum-today__weather-dicon" use:bindWeatherIcon={day.code}></span>
								<span class="fulcrum-today__weather-hi">{day.high}°</span>
							</div>
						{/each}
					</div>
					<div class="fulcrum-today__weather-now">
						<span class="fulcrum-today__weather-icon" use:bindWeatherIcon={weather.currentCode}></span>
						<span class="fulcrum-today__weather-temp">{weather.currentTemp}°</span>
						<span class="fulcrum-today__weather-place">{weather.locationLabel}</span>
					</div>
				</div>
			{/if}
			<FulcrumLeafToolbar {plugin} />
		</div>
	</header>

	<div class="fulcrum-today__columns">
		<section class="fulcrum-today__col fulcrum-today__col--left" aria-label="Schedule">
			{#if clockTimes.length > 0}
				<div class="fulcrum-world-clocks fulcrum-today__clocks" role="group" aria-label="World time">
					{#each clockTimes as clock (clock.label + (clock.timeZone ?? ""))}
						<div class="fulcrum-world-clock">
							<span
								class="fulcrum-world-clock__glyph"
								title={clock.daytime ? "Daytime (7am–7pm)" : "Nighttime"}
								aria-label={clock.daytime ? "Sun" : "Moon"}
							>{clock.daytime ? "☀" : "☾"}</span>
							<span class="fulcrum-world-clock__time">{clock.time}</span>
							<span class="fulcrum-world-clock__label">{clock.label}</span>
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
									<TodayFeedRow {plugin} {item} {hoverParentLeaf} {colorByProject} />
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			{/if}
		</section>

		<div class="fulcrum-today__rule" aria-hidden="true"></div>

		<section class="fulcrum-today__col fulcrum-today__col--right" aria-label="Tasks">
			<TodayActiveTimers {plugin} />
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
							<TodayFeedRow
								{plugin}
								item={todayTaskFeedItem(entry, doneTask)}
								{hoverParentLeaf}
								{colorByProject}
								showClock={false}
							/>
						{/each}
					</div>
				{/if}
			</div>

			{#if checklist.outstanding.length > 0}
				<div class="fulcrum-today__block">
					<h2 class="fulcrum-today__block-title">Past due</h2>
					<div class="fulcrum-today__checklist">
						{#each checklist.outstanding as task (task.file.path + (task.line ?? ""))}
							<TodayFeedRow
								{plugin}
								item={todayTaskFeedItem({task}, doneTask)}
								{hoverParentLeaf}
								{colorByProject}
								showClock={false}
							/>
						{/each}
					</div>
				</div>
			{/if}

			{#if checklist.unscheduled.length > 0}
				<div class="fulcrum-today__block">
					<h2 class="fulcrum-today__block-title">Unscheduled</h2>
					<div class="fulcrum-today__checklist">
						{#each checklist.unscheduled as task (task.file.path + (task.line ?? ""))}
							<TodayFeedRow
								{plugin}
								item={todayTaskFeedItem({task}, doneTask)}
								{hoverParentLeaf}
								{colorByProject}
								showClock={false}
							/>
						{/each}
					</div>
				</div>
			{/if}
		</section>
	</div>
</div>
