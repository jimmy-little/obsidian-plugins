import { ItemView, WorkspaceLeaf, TFile, setIcon } from "obsidian";
import type QuillPlugin from "../main";
import {
  type JournalEntry,
  getJournalEntries,
  getOnThisDayEntries,
  groupEntriesByDate,
  computeStreak,
  onThisDayCount,
  parseFolderList,
  getDefaultJournalColor,
} from "../journal";
import { daysInMonth as monthDayCount, formatMonthTitle, toIsoDateLocal } from "../utils/calendar";
import { entryTypesToRuleShape } from "../utils/pathUtils";
import { getImageGridSlots } from "../utils/imageGrid";
import { formatDateKeyLabel, luminance } from "../utils/formatDate";
import { NewEntryModal } from "../modals/NewEntryModal";
import { VIEW_TYPE_QUILL, VIEW_TYPE_QUILL_DAY, type QuillDayState } from "./constants";
import { openJournalEntry } from "../open/openJournalEntry";
import { renderGroupedActivityTimeline, buildTimelineDayGroupsNewestFirst, type TimelineDayGroup } from "../ui/renderActivityTimeline";

const VIEW_ICON = "feather";
/** Cap list timeline rows so large vaults stay responsive. */
const LIST_TIMELINE_MAX = 400;

type TabId = "summary" | "list" | "calendar";

export class QuillView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private plugin: QuillPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_QUILL;
  }

  getDisplayText(): string {
    return this.plugin.settings.journalName || "Quill";
  }

  getIcon(): string {
    return VIEW_ICON;
  }

  private activeTab: TabId = "calendar";
  private entries: JournalEntry[] = [];
  private loading = true;
  private error: string | null = null;
  /** Selected journal filter: null = "All", otherwise journal name (e.g. Life, Daily). */
  private selectedJournal: string | null = null;
  private calendarMonthsRendered = 12;
  private calendarSentinel: HTMLElement | null = null;
  private calendarObserver: IntersectionObserver | null = null;

  /** Journal names to show in the picker: only those with showInPicker and present in entries. */
  private getJournalNames(): string[] {
    const configs = this.plugin.settings.journalConfigs ?? {};
    const set = new Set<string>();
    for (const e of this.entries) {
      const name = e.journal || "Default";
      if (configs[name]?.showInPicker !== false) set.add(name);
    }
    return ["All", ...[...set].sort((a, b) => (a === "Default" ? 1 : a.localeCompare(b)))];
  }

  /** Entries filtered by selected journal (or all if "All"). */
  private getFilteredEntries(): JournalEntry[] {
    if (this.selectedJournal === null || this.selectedJournal === "All") return this.entries;
    return this.entries.filter((e) => (e.journal || "Default") === this.selectedJournal);
  }

  /** Resolve image path to a URL (external URLs as-is; vault paths resolved). */
  private getImageUrl(path: string): string {
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) return this.app.vault.getResourcePath(file);
    for (const ext of ["", ".png", ".jpg", ".jpeg", ".webp", ".gif"]) {
      const f = this.app.vault.getAbstractFileByPath(path + ext);
      if (f instanceof TFile) return this.app.vault.getResourcePath(f);
    }
    const filename = path.includes("/") ? path.split("/").pop()! : path;
    const found = this.app.vault.getFiles().find((f) => f.name === filename);
    if (found) return this.app.vault.getResourcePath(found);
    return this.app.vault.adapter.getResourcePath(path);
  }

  /** Render Day-One style image grid into parent. slots from getImageGridSlots(); iconForEmpty used for 4th cell when 3 images. */
  private renderImageGrid(
    parent: HTMLElement,
    slots: (string | null)[],
    iconForEmpty: string
  ): void {
    if (slots.length === 0) return;
    const grid = parent.createDiv("quill-image-grid");
    const count = slots.length;
    grid.classList.add(
      count === 1 ? "quill-image-grid-full" :
      count === 2 ? "quill-image-grid-split2" :
      "quill-image-grid-4"
    );
    for (const slot of slots) {
      const cell = grid.createDiv("quill-image-grid-cell");
      if (slot) {
        const img = document.createElement("img");
        img.src = this.getImageUrl(slot);
        img.alt = "";
        img.loading = "lazy";
        cell.appendChild(img);
      } else {
        cell.addClass("quill-image-grid-cell-icon");
        setIcon(cell.createSpan(), iconForEmpty);
      }
    }
  }

  /** Journal color for calendar dots/borders (from config or default). */
  private getJournalColor(journalName: string): string {
    const configs = this.plugin.settings.journalConfigs ?? {};
    return configs[journalName]?.color ?? getDefaultJournalColor(journalName);
  }

  /** Header color for selected journal: from settings or fallback. */
  private journalHeaderColor(journal: string | null): { bg: string; fg: string } {
    if (journal === null || journal === "All") {
      return { bg: "var(--interactive-accent)", fg: "#fff" };
    }
    const configs = this.plugin.settings.journalConfigs ?? {};
    const cfg = configs[journal];
    if (cfg?.color) {
      return { bg: cfg.color, fg: luminance(cfg.color) > 0.45 ? "#1a1a1a" : "#fff" };
    }
    const theme = document.body.classList.contains("theme-dark") ? "dark" : "light";
    const palette: Record<string, { bg: string; fg: string }> = {
      Life: { bg: "#f5c842", fg: "#1a1a1a" },
      Daily: { bg: "#4caf50", fg: "#fff" },
      Stats: { bg: "#2196f3", fg: "#fff" },
      Default: { bg: "#78909c", fg: "#fff" },
    };
    if (palette[journal]) return palette[journal];
    let h = 0;
    for (let i = 0; i < journal.length; i++) h = (h << 5) - h + journal.charCodeAt(i);
    h = Math.abs(h) % 360;
    const s = theme === "dark" ? 45 : 55;
    const l = theme === "dark" ? 42 : 52;
    return { bg: `hsl(${h}, ${s}%, ${l}%)`, fg: "#1a1a1a" };
  }

  async onOpen() {
    await this.refresh();
  }

  async refresh() {
    this.loading = true;
    this.error = null;
    this.render();
    try {
      const folders = parseFolderList(
        this.plugin.settings.journalFolders ?? this.plugin.settings.journalFolder ?? "Journal"
      );
      const logFolders = parseFolderList(this.plugin.settings.logFolders ?? "");
      const s = this.plugin.settings;
      this.entries = await getJournalEntries(
        this.app.vault,
        this.app.metadataCache,
        folders.length > 0 ? folders : [], // empty = whole vault handled inside getJournalEntries via parseFolderList
        s.dateProperty,
        s.timeProperty || "",
        s.entryProperty || "entry",
        s.journalProperty || "journal",
        entryTypesToRuleShape(this.plugin.settings.entryTypes),
        this.plugin.settings.lapseEntriesProperty ?? "lapseEntries",
        this.plugin.settings.leafletLatProperty ?? "lat",
        this.plugin.settings.leafletLongProperty ?? "long",
        logFolders,
      );
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
    this.loading = false;
    this.render();
  }

  private render() {
    const el = this.contentEl;
    el.empty();
    el.addClasses(["quill", "quill-view"]);

    const filtered = this.getFilteredEntries();
    const header = el.createDiv("quill-header");
    const headerColor = this.journalHeaderColor(this.selectedJournal);
    header.style.setProperty("--quill-header-bg", headerColor.bg);
    header.style.setProperty("--quill-header-fg", headerColor.fg);

    const headerRow = header.createDiv("quill-header-row");
    const titleWrap = headerRow.createDiv("quill-title-wrap");
    const title = titleWrap.createEl("h1", "quill-title");
    title.setText(
      this.selectedJournal === null || this.selectedJournal === "All"
        ? this.plugin.settings.journalName || "All"
        : this.selectedJournal
    );
    const range = titleWrap.createEl("div", "quill-range");
    range.setText(this.getDateRangeForEntries(filtered));
    range.setAttribute("aria-hidden", "true");

    const pickerWrap = headerRow.createDiv("quill-picker-wrap");
    const picker = pickerWrap.createEl("select", "quill-picker");
    picker.setAttribute("aria-label", "Journal");
    const journalNames = this.getJournalNames();
    for (const name of journalNames) {
      picker.createEl("option", { value: name }).setText(name);
    }
    picker.value = this.selectedJournal === null ? "All" : this.selectedJournal;
    picker.addEventListener("change", () => {
      const v = picker.value;
      this.selectedJournal = v === "All" ? null : v;
      this.render();
    });

    const addBtn = headerRow.createEl("button", "quill-add-entry");
    addBtn.setAttribute("aria-label", "New journal entry");
    setIcon(addBtn, "plus");
    addBtn.addEventListener("click", () => {
      const modal = new NewEntryModal(this.app, this.plugin, {
        journalNames: this.getJournalNames().filter((n) => n !== "All"),
        defaultJournal: this.selectedJournal && this.selectedJournal !== "All" ? this.selectedJournal : null,
        onCreated: () => this.refresh(),
      });
      modal.open();
    });

    const refreshBtn = headerRow.createEl("button", "quill-refresh");
    refreshBtn.setAttribute("aria-label", "Refresh journal data");
    refreshBtn.setText("↻");
    refreshBtn.addEventListener("click", () => {
      this.refresh();
    });

    const nav = header.createDiv("quill-nav");
    for (const tab of [
      { id: "calendar" as TabId, label: "Calendar", icon: "calendar" },
      { id: "list" as TabId, label: "List", icon: "list" },
      { id: "summary" as TabId, label: "Summary", icon: "feather" },
    ]) {
      const btn = nav.createEl("button", "quill-tab");
      if (tab.id === this.activeTab) btn.addClass("is-active");
      setIcon(btn.createSpan("quill-tab-icon"), tab.icon);
      btn.createSpan("quill-tab-label").setText(tab.label);
      btn.addEventListener("click", () => {
        this.activeTab = tab.id;
        this.render();
      });
    }

    const body = el.createDiv("quill-body");
    if (this.loading) {
      body.createDiv("quill-loading").setText("Loading…");
      return;
    }
    if (this.error) {
      body.createDiv("quill-error", (e) => e.setText(this.error!));
      return;
    }

    if (this.activeTab === "summary") this.renderSummary(body, filtered);
    else if (this.activeTab === "list") this.renderList(body, filtered);
    else this.renderCalendar(body, filtered);
  }

  private getDateRangeForEntries(entries: JournalEntry[]): string {
    if (entries.length === 0) return "—";
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0].date;
    const last = sorted[sorted.length - 1].date;
    const y1 = first.slice(0, 4);
    const y2 = last.slice(0, 4);
    return y1 === y2 ? y1 : `${y1}–${y2}`;
  }

  private renderSummary(container: HTMLElement, entries: JournalEntry[]) {
    const streak = computeStreak(entries);
    const uniqueDays = new Set(entries.map((e) => e.date)).size;
    const mediaCount = entries.filter((e) => e.firstImagePath).length;
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const onThisDayCountNum = onThisDayCount(entries, month, day);
    const onThisDayEntries = getOnThisDayEntries(entries, month, day);

    const stats = container.createDiv("quill-stats");
    const items = [
      { label: "STREAK", value: `${streak} Days` },
      { label: "ENTRIES", value: String(this.entries.length) },
      { label: "MEDIA", value: String(mediaCount) },
      { label: "DAYS", value: String(uniqueDays) },
      { label: "ON THIS DAY", value: String(onThisDayCountNum) },
    ];
    for (const { label, value } of items) {
      const block = stats.createDiv("quill-stat");
      block.createEl("div", "quill-stat-label").setText(label);
      block.createEl("div", "quill-stat-value").setText(value);
    }

    if (onThisDayEntries.length > 0) {
      const section = container.createDiv("quill-summary-on-this-day");
      section.createEl("h2", "quill-summary-on-this-day-title").setText("On This Day");
      const list = section.createDiv("quill-summary-on-this-day-list");
      for (const entry of onThisDayEntries) {
        const row = list.createDiv("quill-summary-on-this-day-entry");
        if (entry.firstImagePath) {
          const thumbWrap = row.createDiv("quill-summary-on-this-day-thumb");
          const img = document.createElement("img");
          img.src = this.getImageUrl(entry.firstImagePath);
          img.alt = "";
          img.loading = "lazy";
          thumbWrap.appendChild(img);
        }
        const textWrap = row.createDiv("quill-summary-on-this-day-text");
        textWrap.createEl("span", "quill-summary-on-this-day-year").setText(entry.date.slice(0, 4));
        textWrap.createEl("span", "quill-summary-on-this-day-name").setText(entry.name);
        row.addEventListener("click", () => this.openEntry(entry));
      }
    }
  }

  private listRenderGen = 0;

  private renderList(container: HTMLElement, entries: JournalEntry[]) {
    const listEl = container.createDiv("quill-list");
    const gen = ++this.listRenderGen;

    if (entries.length === 0) {
      listEl.createDiv("quill-list-empty").setText("No entries yet.");
      return;
    }

    const isAll = this.selectedJournal === null || this.selectedJournal === "All";
    const sorted = [...entries].sort((a, b) => {
      const d = b.date.localeCompare(a.date);
      return d !== 0 ? d : (b.time || "00:00").localeCompare(a.time || "00:00");
    });
    const capped = sorted.length > LIST_TIMELINE_MAX;
    const timelineEntries = capped ? sorted.slice(0, LIST_TIMELINE_MAX) : sorted;
    const groups = buildTimelineDayGroupsNewestFirst(timelineEntries);

    const mount = listEl.createDiv("quill-list-timeline-mount");
    this.scheduleListTimeline(mount, groups, isAll, gen);

    if (capped) {
      listEl.createEl("p", { cls: "quill-list-truncated" }).setText(
        `Showing ${LIST_TIMELINE_MAX} most recent entries (${entries.length} total).`,
      );
    }
  }

  private scheduleListTimeline(
    mount: HTMLElement,
    groups: TimelineDayGroup[],
    showJournalChip: boolean,
    gen: number,
  ): void {
    const singleJournal =
      this.selectedJournal != null && this.selectedJournal !== "All";
    void renderGroupedActivityTimeline(this.app, this.plugin, mount, groups, {
      entries: groups.flatMap((g) => g.entries),
      showJournalChip,
      showDayMarkers: false,
      timelineAccentCss: singleJournal ? this.getJournalColor(this.selectedJournal!) : undefined,
      getJournalColor: (name) => this.getJournalColor(name),
      getEntryTypeIcon: (type) => this.getEntryTypeIcon(type),
      onOpenEntry: (entry) => this.openEntry(entry),
      previewOwner: this,
    }).then(() => {
      if (gen !== this.listRenderGen) return;
    });
  }

  /** Icon chain: user entry type (settings order) → lapse (timer) → default (file-text). */
  private getEntryIcon(entry: JournalEntry): string {
    if (entry.entryType) return this.getEntryTypeIcon(entry.entryType);
    if (entry.hasLapseEntries) return "timer";
    return "file-text";
  }

  private getEntryTypeIcon(typeName: string | null): string {
    if (!typeName) return "file-text";
    const t = (this.plugin.settings.entryTypes ?? []).find(
      (e) => e.name.trim().toLowerCase() === typeName.trim().toLowerCase()
    );
    return t?.icon?.trim() || "file-text";
  }

  private todayKey(): string {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }

  private createCalendarDayCell(
    dateKey: string,
    dayNum: number,
    dayEntries: JournalEntry[]
  ): HTMLElement {
    const cell = document.createElement("div");
    cell.className = "quill-calendar-cell quill-calendar-cell-day";
    const isToday = dateKey === this.todayKey();
    if (isToday) cell.classList.add("is-today");
    const isAllView =
      this.selectedJournal === null || this.selectedJournal === "All";

    const aggregatedPaths: string[] = [];
    for (const e of dayEntries) {
      if (e.imagePaths?.length) aggregatedPaths.push(...e.imagePaths);
      else if (e.firstImagePath) aggregatedPaths.push(e.firstImagePath);
    }
    const gridSlots = getImageGridSlots(aggregatedPaths);

    if (gridSlots.length > 0) {
      this.renderImageGrid(cell, gridSlots, "image");
    } else if (!isAllView && this.selectedJournal && dayEntries.length > 0) {
      cell.style.borderColor = this.getJournalColor(this.selectedJournal);
      cell.style.borderWidth = "2px";
    }

    if (dayEntries.length > 0) {
      const num = document.createElement("div");
      num.className = "quill-calendar-day-num";
      num.textContent = String(dayNum);
      cell.appendChild(num);
      const dots = document.createElement("div");
      dots.className = "quill-calendar-day-dots";
      const color = isAllView
        ? undefined
        : this.getJournalColor(this.selectedJournal || dayEntries[0].journal || "Default");
      for (const e of dayEntries) {
        const dot = document.createElement("span");
        dot.className = "quill-calendar-dot";
        dot.style.backgroundColor = color ?? this.getJournalColor(e.journal || "Default");
        dots.appendChild(dot);
      }
      cell.appendChild(dots);
      cell.classList.add("has-entries");
      cell.addEventListener("click", () => this.openDay(dateKey, dayEntries));
    } else {
      const num = document.createElement("div");
      num.className = "quill-calendar-day-num";
      num.textContent = String(dayNum);
      cell.appendChild(num);
    }
    return cell;
  }

  private renderCalendar(container: HTMLElement, entries: JournalEntry[]) {
    const byDate = groupEntriesByDate(entries);
    const scrollWrap = container.createDiv("quill-calendar-scroll");

    const renderMonth = (year: number, month: number) => {
      const monthEl = scrollWrap.createDiv("quill-calendar-month");
      monthEl.createEl("h2", "quill-calendar-title").setText(formatMonthTitle(year, month));
      const grid = monthEl.createDiv("quill-calendar-grid");
      const dayNames = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
      for (const d of dayNames) {
        const cell = grid.createDiv("quill-calendar-cell quill-calendar-cell-head");
        cell.setText(d);
      }
      const first = new Date(year, month, 1);
      let start = first.getDay() - 1;
      if (start < 0) start += 7;
      const dim = monthDayCount(year, month);
      for (let i = 0; i < start; i++) {
        grid.createDiv("quill-calendar-cell quill-calendar-cell-empty");
      }
      for (let d = 1; d <= dim; d++) {
        const dateKey = toIsoDateLocal(year, month, d);
        const dayEntries = byDate.get(dateKey) ?? [];
        grid.appendChild(
          this.createCalendarDayCell(dateKey, d, dayEntries)
        );
      }
    };

    const now = new Date();
    for (let i = 0; i < this.calendarMonthsRendered; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      renderMonth(d.getFullYear(), d.getMonth());
    }

    const sentinel = scrollWrap.createDiv("quill-calendar-sentinel");
    sentinel.setAttribute("aria-hidden", "true");

    this.calendarObserver?.disconnect();
    this.calendarSentinel = sentinel;
    this.calendarObserver = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || !this.calendarSentinel?.parentElement) return;
        const parent = this.calendarSentinel.parentElement as HTMLElement;
        const now2 = new Date();
        for (let i = this.calendarMonthsRendered; i < this.calendarMonthsRendered + 6; i++) {
          const d = new Date(now2.getFullYear(), now2.getMonth() - i, 1);
          const monthEl = document.createElement("div");
          monthEl.className = "quill-calendar-month";
          const title = document.createElement("h2");
          title.className = "quill-calendar-title";
          title.textContent = formatMonthTitle(d.getFullYear(), d.getMonth());
          monthEl.appendChild(title);
          const grid = document.createElement("div");
          grid.className = "quill-calendar-grid";
          ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].forEach((day) => {
            const cell = document.createElement("div");
            cell.className = "quill-calendar-cell quill-calendar-cell-head";
            cell.textContent = day;
            grid.appendChild(cell);
          });
          const year = d.getFullYear();
          const month = d.getMonth();
          const first = new Date(year, month, 1);
          let start = first.getDay() - 1;
          if (start < 0) start += 7;
          const dim = monthDayCount(year, month);
          for (let j = 0; j < start; j++) {
            const cell = document.createElement("div");
            cell.className = "quill-calendar-cell quill-calendar-cell-empty";
            grid.appendChild(cell);
          }
          const byDateLoad = groupEntriesByDate(this.getFilteredEntries());
          for (let day = 1; day <= dim; day++) {
            const dateKey = toIsoDateLocal(year, month, day);
            const dayEntries = byDateLoad.get(dateKey) ?? [];
            grid.appendChild(this.createCalendarDayCell(dateKey, day, dayEntries));
          }
          monthEl.appendChild(grid);
          parent.insertBefore(monthEl, this.calendarSentinel);
        }
        this.calendarMonthsRendered += 6;
      },
      { root: scrollWrap.parentElement, rootMargin: "200px", threshold: 0 }
    );
    this.calendarObserver.observe(sentinel);
  }

  private openEntry(entry: JournalEntry) {
    void openJournalEntry(this.app, entry, this.plugin.settings);
  }

  private openDay(dateKey: string, entries: JournalEntry[]) {
    const leaf = this.app.workspace.getLeaf(true);
    leaf.setViewState({
      type: VIEW_TYPE_QUILL_DAY,
      state: {
        dateKey,
        journalFilter: this.selectedJournal === "All" ? null : this.selectedJournal,
      } satisfies QuillDayState,
    });
  }
}
