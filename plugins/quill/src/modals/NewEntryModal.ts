import { App, Modal, getAllTags, setIcon } from "obsidian";
import type QuillPlugin from "../main";
import {
  formatPathWithDate,
  sanitizeFilename,
  getImageExtension,
  parseTagsInput,
} from "../utils/pathUtils";

export class NewEntryModal extends Modal {
  private thought = "";
  private journal = "";
  private dateTime = new Date();
  private tags = "";
  private journalNames: string[] = [];
  private defaultJournal: string | null = null;
  private onCreated: (() => void) | null = null;
  private tagSuggestEl: HTMLElement | null = null;
  private tagSuggestSelected = 0;
  private tagSuggestItems: string[] = [];
  private selectedFiles: File[] = [];
  private fileInputEl: HTMLInputElement | null = null;
  private mediaPreviewEl: HTMLElement | null = null;

  constructor(
    app: App,
    private plugin: QuillPlugin,
    opts: {
      journalNames: string[];
      defaultJournal: string | null;
      onCreated: () => void;
    }
  ) {
    super(app);
    this.journalNames = opts.journalNames;
    this.defaultJournal = opts.defaultJournal;
    this.onCreated = opts.onCreated;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.selectedFiles = [];
    contentEl.addClass("quill-new-entry-modal");
    contentEl.createEl("h2", { text: "New journal entry" });

    const thoughtWrap = contentEl.createDiv("quill-modal-field");
    thoughtWrap.createEl("label", { text: "Thought" }).setAttribute("for", "quill-thought");
    const thoughtInput = thoughtWrap.createEl("input", {
      type: "text",
      cls: "quill-modal-input",
    }) as HTMLInputElement;
    thoughtInput.id = "quill-thought";
    thoughtInput.placeholder = "What's on your mind?";
    thoughtInput.value = this.thought;

    const journalWrap = contentEl.createDiv("quill-modal-field");
    journalWrap.createEl("label", { text: "Journal" }).setAttribute("for", "quill-journal");
    const journalSelect = journalWrap.createEl("select", { cls: "quill-modal-select quill-modal-journal-select" }) as HTMLSelectElement;
    journalSelect.id = "quill-journal";
    const options = this.journalNames.filter((n) => n !== "All");
    if (options.length === 0) options.push("Default");
    for (const name of options) {
      const opt = journalSelect.createEl("option", { value: name });
      opt.setText(name);
    }
    journalSelect.value =
      this.defaultJournal && options.includes(this.defaultJournal) ? this.defaultJournal : options[0]!;

    const dateWrap = contentEl.createDiv("quill-modal-field");
    dateWrap.createEl("label", { text: "Date / Time" }).setAttribute("for", "quill-datetime");
    const dateInput = dateWrap.createEl("input", {
      type: "datetime-local",
      cls: "quill-modal-input",
    }) as HTMLInputElement;
    dateInput.id = "quill-datetime";
    const now = new Date();
    dateInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const tagsWrap = contentEl.createDiv("quill-modal-field");
    tagsWrap.createEl("label", { text: "Tags" }).setAttribute("for", "quill-tags");
    const tagsContainer = tagsWrap.createDiv("quill-modal-tags-wrap");
    const tagsInput = tagsContainer.createEl("input", {
      type: "text",
      cls: "quill-modal-input",
    }) as HTMLInputElement;
    tagsInput.id = "quill-tags";
    tagsInput.placeholder = "e.g. #daily #gratitude (type # for suggestions)";
    tagsInput.value = this.tags;
    this.tagSuggestEl = tagsContainer.createDiv("quill-modal-tag-suggest");
    this.tagSuggestEl.addClass("is-hidden");
    tagsInput.addEventListener("input", () => this.onTagsInput(tagsInput));
    tagsInput.addEventListener("keydown", (e) => this.onTagsKeydown(e, tagsInput));
    tagsInput.addEventListener("focus", () => this.onTagsInput(tagsInput));
    tagsInput.addEventListener("blur", () => {
      setTimeout(() => this.hideTagSuggest(), 150);
    });

    const mediaWrap = contentEl.createDiv("quill-modal-field");
    mediaWrap.createEl("label", { text: "Attachments" });
    const mediaRow = mediaWrap.createDiv("quill-modal-media-row");
    this.fileInputEl = mediaRow.createEl("input", {
      type: "file",
      cls: "quill-modal-file-input",
    }) as HTMLInputElement;
    this.fileInputEl.setAttribute("accept", "image/*");
    this.fileInputEl.setAttribute("multiple", "true");
    this.fileInputEl.style.display = "none";
    const addMediaBtn = mediaRow.createEl("button", { type: "button", cls: "quill-modal-add-media" });
    setIcon(addMediaBtn, "image-plus");
    addMediaBtn.setText("Add images");
    addMediaBtn.addEventListener("click", () => this.fileInputEl?.click());
    this.fileInputEl.addEventListener("change", () => {
      const files = this.fileInputEl?.files;
      if (files?.length) {
        this.selectedFiles = [...this.selectedFiles, ...Array.from(files)];
        this.updateMediaPreview();
      }
      if (this.fileInputEl) this.fileInputEl.value = "";
    });
    this.mediaPreviewEl = mediaRow.createDiv("quill-modal-media-preview");

    const actions = contentEl.createDiv("quill-modal-actions");
    const submitBtn = actions.createEl("button", { type: "button", cls: "mod-cta" });
    submitBtn.setText("Create entry");
    const cancelBtn = actions.createEl("button", { type: "button" });
    cancelBtn.setText("Cancel");

    submitBtn.addEventListener("click", () => {
      this.thought = thoughtInput.value.trim();
      this.journal = journalSelect.value;
      this.dateTime = new Date(dateInput.value || Date.now());
      this.tags = tagsInput.value.trim();
      const files = [...this.selectedFiles];
      this.createEntry(files);
      this.close();
    });
    cancelBtn.addEventListener("click", () => this.close());
  }

  private getTagSuggestions(prefix: string): string[] {
    const tagSet = new Set<string>();
    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      if (!cache) continue;
      const tags = getAllTags(cache);
      if (tags) for (const t of tags) tagSet.add(t.replace(/^#/, ""));
    }
    const list = [...tagSet].filter((t) => !prefix || t.toLowerCase().includes(prefix.toLowerCase()));
    return list.slice(0, 20);
  }

  private onTagsInput(input: HTMLInputElement) {
    const val = input.value;
    const cursor = input.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const hashIdx = before.lastIndexOf("#");
    if (hashIdx === -1) {
      this.hideTagSuggest();
      return;
    }
    const prefix = before.slice(hashIdx + 1).trim();
    this.tagSuggestItems = this.getTagSuggestions(prefix);
    if (this.tagSuggestItems.length === 0) {
      this.hideTagSuggest();
      return;
    }
    this.tagSuggestSelected = 0;
    this.showTagSuggest(input, prefix);
  }

  private showTagSuggest(input: HTMLInputElement, prefix: string) {
    if (!this.tagSuggestEl) return;
    this.tagSuggestEl.empty();
    this.tagSuggestEl.removeClass("is-hidden");
    for (let i = 0; i < this.tagSuggestItems.length; i++) {
      const tag = this.tagSuggestItems[i]!;
      const row = this.tagSuggestEl.createDiv("quill-modal-tag-suggest-item");
      if (i === this.tagSuggestSelected) row.addClass("is-selected");
      row.setText(`#${tag}`);
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.insertTag(input, tag);
      });
    }
  }

  private refreshTagSuggestHighlight() {
    if (!this.tagSuggestEl) return;
    const items = this.tagSuggestEl.querySelectorAll(".quill-modal-tag-suggest-item");
    items.forEach((el, i) => el.classList.toggle("is-selected", i === this.tagSuggestSelected));
  }

  private hideTagSuggest() {
    if (this.tagSuggestEl) {
      this.tagSuggestEl.addClass("is-hidden");
      this.tagSuggestEl.empty();
    }
    this.tagSuggestItems = [];
  }

  private insertTag(input: HTMLInputElement, tag: string) {
    const val = input.value;
    const cursor = input.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const hashIdx = before.lastIndexOf("#");
    const start = hashIdx >= 0 ? hashIdx : cursor;
    const newVal = val.slice(0, start) + "#" + tag + " " + val.slice(cursor);
    input.value = newVal;
    input.setSelectionRange(start + tag.length + 2, start + tag.length + 2);
    input.focus();
    this.hideTagSuggest();
  }

  private updateMediaPreview() {
    if (!this.mediaPreviewEl) return;
    this.mediaPreviewEl.empty();
    if (this.selectedFiles.length === 0) return;
    const text = this.mediaPreviewEl.createSpan("quill-modal-media-count");
    text.setText(`${this.selectedFiles.length} image${this.selectedFiles.length === 1 ? "" : "s"} selected`);
    const clearBtn = this.mediaPreviewEl.createEl("button", { type: "button", cls: "quill-modal-media-clear" });
    clearBtn.setText("Clear");
    clearBtn.addEventListener("click", () => {
      this.selectedFiles = [];
      this.updateMediaPreview();
    });
  }

  private onTagsKeydown(e: KeyboardEvent, input: HTMLInputElement) {
    if (!this.tagSuggestEl?.hasClass("is-hidden") && this.tagSuggestItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.tagSuggestSelected = Math.min(this.tagSuggestSelected + 1, this.tagSuggestItems.length - 1);
        this.refreshTagSuggestHighlight();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        this.tagSuggestSelected = Math.max(0, this.tagSuggestSelected - 1);
        this.refreshTagSuggestHighlight();
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const tag = this.tagSuggestItems[this.tagSuggestSelected];
        if (tag) this.insertTag(input, tag);
        return;
      }
      if (e.key === "Escape") {
        this.hideTagSuggest();
      }
    }
  }

  private async createEntry(selectedFiles: File[]) {
    const s = this.plugin.settings;
    const dateProp = s.dateProperty || "date";
    const journalProp = s.journalProperty || "journal";
    const entryProp = s.entryProperty || "entry";
    const template = s.defaultJournalEntryLocation?.trim() || "Journal/{YYYY}/{MM}-{MMMM}";
    const dir = formatPathWithDate(template, this.dateTime);
    const title = sanitizeFilename(this.thought);
    const mode = s.attachmentMode ?? "subfolder";
    const filename =
      mode === "subfolder"
        ? `${dir}/${title}/${title}.md`.replace(/\/+/g, "/")
        : `${dir}/${title}.md`.replace(/\/+/g, "/");
    const tagsArr = parseTagsInput(this.tags);
    const timeStr = this.dateTime.toTimeString().slice(0, 5);
    const frontmatter: Record<string, unknown> = {
      [dateProp]: this.dateTime.toISOString().slice(0, 10),
      [journalProp]: this.journal,
      [entryProp]: this.thought || title,
    };
    if (s.timeProperty) frontmatter[s.timeProperty] = timeStr;
    if (tagsArr.length > 0) frontmatter.tags = tagsArr;
    const fmBlock =
      "---\n" +
      Object.entries(frontmatter)
        .map(([k, v]) => {
          if (Array.isArray(v)) {
            const items = (v as string[]).map((x) => (x.includes(" ") || x.includes(",") ? `"${x}"` : x));
            return `${k}: [${items.join(", ")}]`;
          }
          return `${k}: ${v}`;
        })
        .join("\n") +
      "\n---\n\n";

    let body = this.thought ? `${this.thought}\n\n` : "";
    const imageLinks: string[] = [];

    const noteDir = mode === "subfolder" ? `${dir}/${title}`.replace(/\/+$/, "") : dir.replace(/\/+$/, "");
    const noteDirParts = noteDir.split("/").filter(Boolean);
    for (let i = 1; i <= noteDirParts.length; i++) {
      const p = noteDirParts.slice(0, i).join("/");
      if (p) await this.app.vault.adapter.mkdir(p);
    }

    if (selectedFiles.length > 0) {
      let attachmentDir: string;
      if (mode === "subfolder") {
        attachmentDir = noteDir;
      } else {
        const assetsTemplate = s.assetsFolderPath?.trim() || "Assets/{YYYY}/{MM}-{MMMM}";
        attachmentDir = formatPathWithDate(assetsTemplate, this.dateTime).replace(/\/+$/, "");
        const attachmentParts = attachmentDir.split("/").filter(Boolean);
        for (let i = 1; i <= attachmentParts.length; i++) {
          const p = attachmentParts.slice(0, i).join("/");
          if (p) await this.app.vault.adapter.mkdir(p);
        }
      }
      const usedNames = new Map<string, number>();
      for (const file of selectedFiles) {
        const ext = getImageExtension(file.name) || ".png";
        const base = sanitizeFilename(file.name.replace(/\.[^.]+$/, "")).slice(0, 80) || "image";
        let name = base + ext;
        const count = (usedNames.get(base) ?? 0) + 1;
        usedNames.set(base, count);
        if (count > 1) name = `${base}-${count}${ext}`;
        const imagePath = `${attachmentDir}/${name}`.replace(/\/+/g, "/");
        const arrayBuffer = await file.arrayBuffer();
        await this.app.vault.createBinary(imagePath, arrayBuffer);
        imageLinks.push(imagePath);
      }
      for (const imagePath of imageLinks) {
        body += `![[${imagePath}]]\n\n`;
      }
    }

    const content = fmBlock + body;
    const created = await this.app.vault.create(filename, content);
    if (this.onCreated) this.onCreated();
    this.app.workspace.getLeaf().openFile(created);
  }

  onClose() {
    this.contentEl.empty();
  }
}
