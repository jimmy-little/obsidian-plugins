import { ItemView, WorkspaceLeaf, type Plugin } from "obsidian";
import type { ComponentType, SvelteComponent } from "svelte";

export type SuiteShellProps = Record<string, unknown>;

export type SuiteShellConfig<TPlugin extends Plugin> = {
	viewType: string;
	displayText: string;
	icon: string;
	App: ComponentType<SvelteComponent>;
	/** Merged with `{ title: displayText }` on mount */
	defaultProps?: SuiteShellProps;
	getProps?: (plugin: TPlugin) => SuiteShellProps;
};

/**
 * ItemView subclass that mounts a Svelte root component. Use with `registerView`.
 */
export function createSuiteShellViewClass<TPlugin extends Plugin>(
	config: SuiteShellConfig<TPlugin>,
): new (leaf: WorkspaceLeaf, plugin: TPlugin) => ItemView {
	return class SuiteShellItemView extends ItemView {
		private component: SvelteComponent | null = null;

		constructor(
			leaf: WorkspaceLeaf,
			private readonly plugin: TPlugin,
		) {
			super(leaf);
		}

		getViewType(): string {
			return config.viewType;
		}

		getDisplayText(): string {
			return config.displayText;
		}

		getIcon(): string {
			return config.icon;
		}

		async onOpen(): Promise<void> {
			const props = {
				title: config.displayText,
				...config.defaultProps,
				...config.getProps?.(this.plugin),
			};
			this.component = new config.App({
				target: this.contentEl,
				props,
			});
		}

		async onClose(): Promise<void> {
			this.component?.$destroy();
			this.component = null;
		}
	};
}
