import {
  ItemView,
  WorkspaceLeaf,
  setIcon,
  MarkdownRenderer,
} from "obsidian";
import type QuillPlugin from "../main";
import {
  type JournalEntry,
  getJournalEntries,
  parseFolderList,
  getDefaultJournalColor,
} from "../journal";
import { entryTypesToRuleShape } from "../utils/pathUtils";
import { VIEW_TYPE_QUILL_DAY, type QuillDayState } from "./constants";
import { openJournalEntry } from "../open/openJournalEntry";
import { renderActivityTimeline } from "../ui/renderActivityTimeline";

function buildDayLeafletMarkdown(entries: JournalEntry[], dateKey: string): string | null {
  const withCoords = entries.filter((e) => e.latitude != null && e.longitude != null);
  if (withCoords.length === 0) return null;
  const id = `quill_${dateKey.replace(/-/g, "_")}`;
  const sumLat = withCoords.reduce((s, e) => s + e.latitude!, 0);
  const sumLng = withCoords.reduce((s, e) => s + e.longitude!, 0);
  const n = withCoords.length;
  const lines = [
    `id: ${id}`,
    `lat: ${sumLat / n}`,
    `long: ${sumLng / n}`,
    "showAllMarkers: true",
  ];
  for (const e of withCoords) {
    const pathNoExt = e.file.path.replace(/\.md$/i, "");
    lines.push(`marker: default, ${e.latitude}, ${e.longitude}, [[${pathNoExt}]]`);
  }
  return "```leaflet\n" + lines.join("\n") + "\n```";
}

/** Full-page Day One–style view for a single day: aggregated entries, tiled images, type cards. */

export class QuillDayView extends ItemView {
  static readonly VIEW_TYPE = VIEW_TYPE_QUILL_DAY;
  private state: QuillDayState = { dateKey: "", journalFilter: null };
  private entries: JournalEntry[] = [];
  private loading = true;

  constructor(leaf: WorkspaceLeaf, private plugin: QuillPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return QuillDayView.VIEW_TYPE;
  }

  getDisplayText(): string {
    const key = this.state.dateKey || "";
    const parts = key.split("-").map(Number);
    if (parts.length < 3) return "Day";
    const [y, m, d] = parts;
    if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return "Day";
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  getState(): Record<string, unknown> {
    return this.state as unknown as Record<string, unknown>;
  }

  setState(state: unknown): Promise<void> {
    const s = state as Partial<QuillDayState>;
    if (s && typeof s.dateKey === "string") {
      this.state = {
        dateKey: s.dateKey,
        journalFilter: s.journalFilter ?? null,
      };
    }
    return this.loadEntries();
  }

  async onOpen() {
    await this.loadEntries();
  }

  /** Reload entries for the current day (e.g. after file change). */
  async refresh() {
    await this.loadEntries();
  }

  private async loadEntries() {
    this.loading = true;
    this.render();
    try {
      const folders = parseFolderList(
        this.plugin.settings.journalFolders ?? this.plugin.settings.journalFolder ?? "Journal"
      );
      const logFolders = parseFolderList(this.plugin.settings.logFolders ?? "");
      const s = this.plugin.settings;
      const all = await getJournalEntries(
        this.app.vault,
        this.app.metadataCache,
        folders.length > 0 ? folders : [],
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
      let list = all.filter((e) => e.date === this.state.dateKey);
      if (this.state.journalFilter != null && this.state.journalFilter !== "All") {
        list = list.filter((e) => (e.journal || "Default") === this.state.journalFilter);
      }
      list.sort((a, b) => (a.time || "00:00").localeCompare(b.time || "00:00"));
      this.entries = list;
    } catch {
      this.entries = [];
    }
    this.loading = false;
    this.render();
  }

  private render() {
    const el = this.contentEl;
    el.empty();
    el.addClasses(["quill", "quill-day-detail"]);

    if (this.loading) {
      el.createDiv("quill-day-loading").setText("Loading…");
      return;
    }

    const [y, m, d] = this.state.dateKey.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const prevDate = new Date(y, m - 1, d - 1);
    const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}-${String(prevDate.getDate()).padStart(2, "0")}`;
    const nextDate = new Date(y, m - 1, d + 1);
    const nextKey = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(nextDate.getDate()).padStart(2, "0")}`;

    const header = el.createDiv("quill-day-header");
    const navRow = header.createDiv("quill-day-nav-row");
    const backBtn = navRow.createEl("button", "quill-day-back");
    backBtn.setAttribute("aria-label", "Back");
    setIcon(backBtn, "arrow-left");
    backBtn.addEventListener("click", () => this.app.workspace.activeLeaf?.detach());

    const dateWrap = navRow.createDiv("quill-day-date-wrap");
    dateWrap.createEl("div", "quill-day-date").setText(
      date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })
    );
    const ago = this.yearsAgo(date);
    if (ago) dateWrap.createEl("div", "quill-day-ago").setText(ago);

    const prevBtn = navRow.createEl("button", "quill-day-arrow");
    setIcon(prevBtn, "chevron-left");
    prevBtn.setAttribute("aria-label", "Previous day");
    prevBtn.addEventListener("click", () => this.navigateTo(prevKey));
    const nextBtn = navRow.createEl("button", "quill-day-arrow");
    setIcon(nextBtn, "chevron-right");
    nextBtn.setAttribute("aria-label", "Next day");
    nextBtn.addEventListener("click", () => this.navigateTo(nextKey));

    const countRow = header.createDiv("quill-day-count-row");
    countRow.createEl("span", "quill-day-count").setText(
      this.entries.length === 1 ? "1 Entry" : `${this.entries.length} Entries`
    );

    const body = el.createDiv("quill-day-body");
    if (this.entries.length === 0) {
      body.createDiv("quill-day-empty").setText("No entries for this day.");
      return;
    }

    if (this.plugin.settings.useLeafletMaps) {
      const leafletMd = buildDayLeafletMarkdown(this.entries, this.state.dateKey);
      if (leafletMd) {
        const leafletWrap = body.createDiv("quill-day-leaflet");
        void this.renderLeafletMarkdown(leafletWrap, leafletMd);
      }
    }

    const timelineMount = body.createDiv("quill-day-timeline-mount");
    const journalFilter = this.state.journalFilter;
    const singleJournal = journalFilter != null && journalFilter !== "All";
    void renderActivityTimeline(this.app, this.plugin, timelineMount, {
      entries: this.entries,
      showJournalChip: !singleJournal,
      showDayMarkers: false,
      hideDateChip: true,
      timelineAccentCss: singleJournal ? this.getJournalColor(journalFilter) : undefined,
      getJournalColor: (name) => this.getJournalColor(name),
      getEntryTypeIcon: (type) => this.getEntryTypeIcon(type),
      onOpenEntry: (entry) => {
        void openJournalEntry(this.app, entry, this.plugin.settings);
      },
      previewOwner: this,
    });
  }

  private async renderLeafletMarkdown(container: HTMLElement, markdown: string) {
    container.empty();
    const firstWithCoords = this.entries.find((e) => e.latitude != null && e.longitude != null);
    const sourcePath = firstWithCoords?.file.path ?? "";
    try {
      await MarkdownRenderer.render(this.app, markdown, container, sourcePath, this);
    } catch (e) {
      console.error("Quill: Leaflet markdown render failed", e);
      container.createDiv("quill-leaflet-error").setText(
        "Map could not be rendered. Install and enable the Leaflet community plugin."
      );
    }
  }

  private yearsAgo(d: Date): string {
    const now = new Date();
    const diff = now.getFullYear() - d.getFullYear();
    if (diff <= 0) return "";
    if (diff === 1) return "1 Year Ago";
    return `${diff} Years Ago`;
  }

  private getJournalColor(journalName: string): string {
    const configs = this.plugin.settings.journalConfigs ?? {};
    return configs[journalName]?.color ?? getDefaultJournalColor(journalName);
  }

  private getEntryTypeIcon(typeName: string | null): string {
    if (!typeName) return "file-text";
    const t = (this.plugin.settings.entryTypes ?? []).find(
      (e) => e.name.trim().toLowerCase() === typeName.trim().toLowerCase()
    );
    return t?.icon?.trim() || "file-text";
  }

  private navigateTo(dateKey: string) {
    this.setState({ ...this.state, dateKey });
  }
}
