import type {App, Plugin} from "obsidian";
import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
import type {VaultIndex} from "../fulcrum/VaultIndex";
import type {TimeModeTab} from "./types";

/** Minimal Fulcrum plugin surface used by {@link TimerModule} (avoids circular imports). */
export interface FulcrumTimerHost extends Plugin {
	readonly settings: FulcrumSettings;
	readonly vaultIndex: VaultIndex;
	openTimeTracked(tab?: TimeModeTab): Promise<void>;
	openActiveTimers(): Promise<void>;
	openQuickStart(): Promise<void>;
	openCalendar(): Promise<void>;
	openProjectSummary(path: string): Promise<void>;
	saveSettings(): Promise<void>;
	bumpTimerRevision?(): void;
	// scheduleWidgetBridgeSync?(): void;
}
