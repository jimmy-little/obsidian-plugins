import { Modal, TFile } from "obsidian";
import type { JournalEntry } from "../journal";
import { formatDateKeyLabel } from "../utils/formatDate";

export class QuillDayModal extends Modal {
  constructor(
    app: import("obsidian").App,
    private dateKey: string,
    private entries: JournalEntry[],
    private onSelectEntry: (e: JournalEntry) => void
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("quill-modal-content");
    contentEl.createEl("h2", { text: formatDateKeyLabel(this.dateKey, "full") });
    for (const entry of this.entries) {
      const row = contentEl.createDiv("quill-modal-entry");
      if (entry.time) row.createSpan("quill-modal-time").setText(entry.time.slice(0, 5));
      row.createDiv("quill-modal-preview").setText(entry.name);
      if (entry.firstImagePath) {
        const thumb = row.createDiv("quill-modal-thumb");
        const img = document.createElement("img");
        img.src = this.getImageUrl(entry.firstImagePath);
        img.alt = "";
        thumb.appendChild(img);
      }
      row.addEventListener("click", () => {
        this.onSelectEntry(entry);
        this.close();
      });
    }
  }

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
}

