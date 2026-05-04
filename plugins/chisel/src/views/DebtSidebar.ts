import { Menu, setIcon } from "obsidian";
import type ChiselPlugin from "../main";
import { DebtModal } from "../modals/DebtModal";
import { DeleteDebtModal } from "../modals/DeleteDebtModal";
import type { ChiselMainView } from "./ChiselMainView";
import { formatApr, formatMoney } from "../format";

export class DebtSidebar {
	constructor(
		private plugin: ChiselPlugin,
		private host: ChiselMainView,
	) {}

	render(container: HTMLElement): void {
		container.empty();

		if (this.plugin.debts.length === 0) {
			container.createDiv({
				cls: "chisel-pm__sidebar-empty",
				text: "No debts yet. Use + in the toolbar to add one.",
			});
			return;
		}

		for (const debt of this.plugin.debts) {
			const row = container.createDiv({
				cls: "chisel-pm__debt-row",
			});
			if (
				this.plugin.chiselViewState.mainMode === "debt" &&
				this.plugin.chiselViewState.selectedDebtId === debt.id
			) {
				row.addClass("chisel-pm__debt-row--selected");
			}

			const mainClick = row.createDiv({ cls: "chisel-pm__debt-row-main" });
			mainClick.createDiv({ cls: "chisel-pm__debt-name", text: debt.name });
			const rateLabel = debt.promo
				? `${formatApr(debt.promo.apr)} promo → ${formatApr(debt.standardApr)}`
				: formatApr(debt.standardApr);
			mainClick.createDiv({
				cls: "chisel-pm__debt-meta",
				text: `${formatMoney(debt.balance, this.plugin.settings)} · ${rateLabel}`,
			});
			if (debt.promo) {
				mainClick.createDiv({
					cls: "chisel-pm__debt-promo",
					text: `Promo ends ${debt.promo.endsOn}`,
				});
			}

			mainClick.addEventListener("click", () => {
				this.plugin.chiselViewState.mainMode = "debt";
				this.plugin.chiselViewState.selectedDebtId = debt.id;
				this.host.render();
			});

			const menuBtn = row.createEl("button", {
				type: "button",
				cls: "chisel-pm__debt-menu clickable-icon",
				attr: { "aria-label": "Debt actions" },
			});
			setIcon(menuBtn, "more-vertical");
			menuBtn.addEventListener("click", (ev) => {
				ev.stopPropagation();
				const menu = new Menu();
				menu.addItem((item) =>
					item.setTitle("Delete").setIcon("trash").onClick(() => {
						new DeleteDebtModal(this.plugin.app, `Permanently remove “${debt.name}”?`, async () => {
							await this.deleteDebt(debt.id);
						}).open();
					}),
				);
				menu.showAtMouseEvent(ev);
			});
		}
	}

	private async deleteDebt(id: string): Promise<void> {
		this.plugin.debts = this.plugin.debts.filter((d) => d.id !== id);
		if (this.plugin.chiselViewState.selectedDebtId === id) {
			this.plugin.chiselViewState.selectedDebtId = this.plugin.debts[0]?.id ?? null;
			if (this.plugin.debts.length === 0) {
				this.plugin.chiselViewState.mainMode = "dashboard";
			}
		}
		await this.plugin.persist();
		this.host.render();
	}
}
