import { App, Modal, Notice, Setting } from "obsidian";
import type { Debt, DebtPromo } from "../types";
import type ChiselPlugin from "../main";

export type DebtModalMode = "add" | "edit";

export class DebtModal extends Modal {
	private name = "";
	private balanceStr = "";
	private standardAprStr = "";
	private usePromo = false;
	private promoAprStr = "";
	private promoEndsStr = "";

	constructor(
		app: App,
		private plugin: ChiselPlugin,
		private mode: DebtModalMode,
		private existing: Debt | null,
		private onSaved: () => void,
	) {
		super(app);
		if (existing) {
			this.name = existing.name;
			this.balanceStr = String(existing.balance);
			this.standardAprStr = String(existing.standardApr);
			if (existing.promo) {
				this.usePromo = true;
				this.promoAprStr = String(existing.promo.apr);
				this.promoEndsStr = existing.promo.endsOn;
			}
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.titleEl.setText(this.mode === "add" ? "Add debt" : "Edit debt");

		new Setting(contentEl).setName("Name").addText((t) => {
			t.setValue(this.name).onChange((v) => {
				this.name = v;
			});
		});

		new Setting(contentEl).setName("Balance").setDesc("Current balance owed.").addText((t) => {
			t.setValue(this.balanceStr).onChange((v) => {
				this.balanceStr = v;
			});
		});

		new Setting(contentEl)
			.setName("Standard APR (%)")
			.setDesc("Annual rate after any promo ends.")
			.addText((t) => {
				t.setValue(this.standardAprStr).onChange((v) => {
					this.standardAprStr = v;
				});
			});

		const promoAprSetting = new Setting(contentEl)
			.setName("Promo APR (%)")
			.addText((t) => {
				t.setValue(this.promoAprStr).onChange((v) => {
					this.promoAprStr = v;
				});
			});

		const promoEndSetting = new Setting(contentEl)
			.setName("Promo ends (YYYY-MM-DD)")
			.setDesc("Promo APR applies through this calendar day (local).")
			.addText((t) => {
				t.setValue(this.promoEndsStr).onChange((v) => {
					this.promoEndsStr = v.trim();
				});
			});

		const syncPromoVisibility = (): void => {
			promoAprSetting.settingEl.toggleClass("chisel-modal-hidden", !this.usePromo);
			promoEndSetting.settingEl.toggleClass("chisel-modal-hidden", !this.usePromo);
		};

		new Setting(contentEl).setName("Promotional rate").addToggle((tg) => {
			tg.setValue(this.usePromo).onChange((v) => {
				this.usePromo = v;
				syncPromoVisibility();
			});
		});

		syncPromoVisibility();

		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText("Save").setCta().onClick(() => {
				void this.save();
			}),
		);
		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText("Cancel").onClick(() => {
				this.close();
			}),
		);
	}

	private parsePromo(): DebtPromo | undefined {
		if (!this.usePromo) return undefined;
		const apr = Number.parseFloat(this.promoAprStr);
		if (!Number.isFinite(apr) || apr < 0) {
			new Notice("Enter a valid promo APR.");
			return undefined;
		}
		const ends = this.promoEndsStr.trim();
		if (!/^\d{4}-\d{2}-\d{2}$/.test(ends)) {
			new Notice("Promo end date must be YYYY-MM-DD.");
			return undefined;
		}
		const [y, m, d] = ends.split("-").map((x) => Number.parseInt(x, 10));
		const dt = new Date(y, m - 1, d);
		if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
			new Notice("Invalid promo end date.");
			return undefined;
		}
		return { apr, endsOn: ends };
	}

	private async save(): Promise<void> {
		const name = this.name.trim();
		if (!name) {
			new Notice("Name is required.");
			return;
		}
		const balance = Number.parseFloat(this.balanceStr);
		if (!Number.isFinite(balance) || balance < 0) {
			new Notice("Enter a valid balance.");
			return;
		}
		const standardApr = Number.parseFloat(this.standardAprStr);
		if (!Number.isFinite(standardApr) || standardApr < 0) {
			new Notice("Enter a valid standard APR.");
			return;
		}
		const promo = this.parsePromo();
		if (this.usePromo && !promo) return;

		const debt: Debt =
			this.mode === "edit" && this.existing
				? {
						...this.existing,
						name,
						balance,
						standardApr,
						promo,
					}
				: {
						id: crypto.randomUUID(),
						name,
						balance,
						standardApr,
						promo,
					};

		if (this.mode === "add") {
			this.plugin.debts.push(debt);
			this.plugin.chiselViewState.mainMode = "debt";
			this.plugin.chiselViewState.selectedDebtId = debt.id;
		} else if (this.existing) {
			const i = this.plugin.debts.findIndex((d) => d.id === this.existing!.id);
			if (i >= 0) this.plugin.debts[i] = debt;
		}

		await this.plugin.persist();
		this.onSaved();
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
