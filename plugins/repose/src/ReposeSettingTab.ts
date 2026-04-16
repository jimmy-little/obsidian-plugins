import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { generateDeviceCode, pollDeviceToken } from "./trakt/client";
import { TRAKT_OAUTH_APP_NAME } from "./trakt/constants";
import type ReposePlugin from "./main";

export class ReposeSettingTab extends PluginSettingTab {
	private traktStatusEl!: HTMLElement;
	private deviceAuthPanel!: HTMLElement;

	constructor(app: App, private plugin: ReposePlugin) {
		super(app, plugin);
	}

	display(): void {
		this.plugin.clearTraktDevicePoll();

		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Repose" });
		containerEl.createEl("p", {
			text: `Create a Trakt OAuth app (https://trakt.tv/oauth/applications) named “${TRAKT_OAUTH_APP_NAME}”, then paste Client ID and Secret below. TMDB is for posters and stills.`,
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("Trakt Client ID")
			.setDesc("OAuth application client ID from Trakt.")
			.addText((t) =>
				t.setValue(this.plugin.settings.traktClientId).onChange(async (v) => {
					this.plugin.settings.traktClientId = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Trakt Client Secret")
			.setDesc("OAuth application secret (stored in this vault’s plugin data).")
			.addText((t) => {
				t.inputEl.type = "password";
				t.setValue(this.plugin.settings.traktClientSecret).onChange(async (v) => {
					this.plugin.settings.traktClientSecret = v;
					await this.plugin.saveSettings();
				});
			});

		const connectSection = containerEl.createDiv({ cls: "repose-settings-trakt-connect" });
		connectSection.createEl("div", { text: "Trakt account", cls: "setting-item-name" });
		this.traktStatusEl = connectSection.createDiv({ cls: "setting-item-description repose-settings-trakt-status" });
		this.updateTraktStatus();
		connectSection.createEl("button", { text: "Connect Trakt (device login)" }).addEventListener("click", () => {
			void this.startDeviceAuth();
		});
		this.deviceAuthPanel = connectSection.createDiv({
			cls: "repose-device-auth repose-device-auth--hidden",
		});

		new Setting(containerEl)
			.setName("TMDB API key")
			.setDesc("The Movie Database API v3 key (posters, backdrops, episode stills).")
			.addText((t) => {
				t.inputEl.type = "password";
				t.setValue(this.plugin.settings.tmdbApiKey).onChange(async (v) => {
					this.plugin.settings.tmdbApiKey = v;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Media folder (vault-relative)")
			.setDesc("Root folder for imported notes, e.g. 90 Media")
			.addText((t) =>
				t.setValue(this.plugin.settings.mediaRoot).onChange(async (v) => {
					this.plugin.settings.mediaRoot = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Movies subfolder")
			.addText((t) =>
				t.setValue(this.plugin.settings.moviesSubfolder).onChange(async (v) => {
					this.plugin.settings.moviesSubfolder = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Series subfolder")
			.addText((t) =>
				t.setValue(this.plugin.settings.seriesSubfolder).onChange(async (v) => {
					this.plugin.settings.seriesSubfolder = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Project wikilink")
			.setDesc("Frontmatter project field for shows and episodes (e.g. [[Downtime]])")
			.addText((t) =>
				t.setValue(this.plugin.settings.projectWikilink).onChange(async (v) => {
					this.plugin.settings.projectWikilink = v;
					await this.plugin.saveSettings();
				}),
			);
	}

	private updateTraktStatus(): void {
		const s = this.plugin.settings;
		if (s.traktAccessToken && s.traktRefreshToken) {
			this.traktStatusEl.textContent = "Signed in to Trakt (token stored for sync features).";
		} else {
			this.traktStatusEl.textContent =
				"Not signed in. Optional — search and import work with Client ID + TMDB only.";
		}
	}

	private clearDeviceAuthPanel(): void {
		this.deviceAuthPanel.empty();
		this.deviceAuthPanel.addClass("repose-device-auth--hidden");
	}

	private async startDeviceAuth(): Promise<void> {
		this.plugin.clearTraktDevicePoll();
		this.clearDeviceAuthPanel();

		const id = this.plugin.settings.traktClientId.trim();
		const secret = this.plugin.settings.traktClientSecret.trim();
		if (!id || !secret) {
			new Notice("Set Trakt Client ID and Client Secret above first.");
			return;
		}
		const gen = await generateDeviceCode(id);
		if (!gen.success || !gen.deviceCode || !gen.userCode || !gen.verificationUrl) {
			new Notice(gen.error || "Could not start device login.");
			return;
		}

		const deviceCode = gen.deviceCode;
		const userCode = gen.userCode;
		const verificationUrl = gen.verificationUrl;

		this.deviceAuthPanel.removeClass("repose-device-auth--hidden");
		this.deviceAuthPanel.empty();

		this.deviceAuthPanel.createEl("div", {
			text: "Authorize on Trakt",
			cls: "repose-device-auth-title",
		});
		this.deviceAuthPanel.createEl("p", {
			text: `Approve “${TRAKT_OAUTH_APP_NAME}” on the Trakt website (rename your OAuth app on trakt.tv if it still shows an old name).`,
			cls: "setting-item-description",
		});
		this.deviceAuthPanel.createEl("div", {
			text: userCode,
			cls: "repose-device-code",
			attr: { "aria-label": "Trakt user code" },
		});
		const actions = this.deviceAuthPanel.createDiv({ cls: "repose-device-auth-actions" });
		actions
			.createEl("button", { text: "Open Trakt in browser" })
			.addEventListener("click", () => {
				window.open(verificationUrl, "_blank");
			});
		actions
			.createEl("button", { text: "Copy verification link" })
			.addEventListener("click", () => {
				void navigator.clipboard.writeText(verificationUrl).then(
					() => new Notice("Link copied."),
					() => new Notice("Could not copy — use Open Trakt instead."),
				);
			});

		try {
			await navigator.clipboard.writeText(verificationUrl);
			this.deviceAuthPanel.createEl("p", {
				text: "Verification link copied to clipboard.",
				cls: "setting-item-description repose-device-auth-hint",
			});
		} catch {
			this.deviceAuthPanel.createEl("p", {
				text: "Copy the link with the button above if clipboard access is unavailable.",
				cls: "setting-item-description repose-device-auth-hint",
			});
		}

		this.deviceAuthPanel.createEl("p", {
			text: "Waiting for authorization… This panel clears when connected.",
			cls: "repose-device-auth-waiting",
		});

		const intervalMs = (gen.interval ?? 5) * 1000;
		this.plugin.traktDevicePollTimer = window.setInterval(() => {
			void (async () => {
				const r = await pollDeviceToken(id, secret, deviceCode);
				if (r.success && r.accessToken && r.refreshToken && r.expiresIn != null) {
					this.plugin.clearTraktDevicePoll();
					this.clearDeviceAuthPanel();
					this.plugin.settings.traktAccessToken = r.accessToken;
					this.plugin.settings.traktRefreshToken = r.refreshToken;
					this.plugin.settings.traktTokenExpiresAt = Date.now() + r.expiresIn * 1000;
					await this.plugin.saveSettings();
					this.updateTraktStatus();
					new Notice("Trakt connected.");
				} else if (!r.pending && r.error && !r.error.includes("Waiting")) {
					this.plugin.clearTraktDevicePoll();
					this.clearDeviceAuthPanel();
					new Notice(r.error);
				}
			})();
		}, intervalMs);
	}
}
