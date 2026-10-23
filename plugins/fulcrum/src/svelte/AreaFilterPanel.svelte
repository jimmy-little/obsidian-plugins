<script lang="ts">
	import type {FulcrumHost} from "../fulcrum/pluginBridge";
	import {
		indexRevision,
		settingsRevision,
		areaFilterState,
		setAreaFilterState,
	} from "../fulcrum/stores";
	import {
		buildAreaFilterPanelGroups,
		normalizeLifeModeKey,
		type AreaFilterState,
	} from "../fulcrum/utils/areaFocusFilter";

	export let plugin: FulcrumHost;
	/** @deprecated sidebar-footer is treated as bottom-bar. */
	export let variant: "default" | "sidebar-footer" | "bottom-bar" = "default";

	$: bar = variant === "bottom-bar" || variant === "sidebar-footer";

	let snapshot = plugin.vaultIndex.getSnapshot();
	$: rev = $indexRevision;
	$: {
		void rev;
		snapshot = plugin.vaultIndex.getSnapshot();
	}
	$: sRev = $settingsRevision;
	$: filter = $areaFilterState;

	$: groups = (void sRev, buildAreaFilterPanelGroups(snapshot.areas, filter, plugin.settings));

	function patchFilter(next: AreaFilterState): void {
		setAreaFilterState(next);
	}

	function toggleSection(lifeModeKey: string): void {
		const key = normalizeLifeModeKey(lifeModeKey);
		const modes = new Set(filter.disabledLifeModes);
		if (modes.has(key)) modes.delete(key);
		else modes.add(key);
		patchFilter({...filter, disabledLifeModes: [...modes]});
	}

	function toggleArea(path: string, lifeModeKey: string, groupAreaPaths: string[]): void {
		const key = normalizeLifeModeKey(lifeModeKey);
		const sectionWasOff = filter.disabledLifeModes.includes(key);

		if (sectionWasOff) {
			const disabledLifeModes = filter.disabledLifeModes.filter((m) => m !== key);
			const paths = new Set(filter.disabledAreaPaths);
			for (const groupPath of groupAreaPaths) {
				if (groupPath === path) paths.delete(groupPath);
				else paths.add(groupPath);
			}
			patchFilter({disabledLifeModes, disabledAreaPaths: [...paths]});
			return;
		}

		const disabledLifeModes = filter.disabledLifeModes.filter((m) => m !== key);
		const paths = new Set(filter.disabledAreaPaths);
		if (paths.has(path)) paths.delete(path);
		else paths.add(path);
		patchFilter({disabledLifeModes, disabledAreaPaths: [...paths]});
	}

	function sectionButtonStyle(enabled: boolean): string {
		return enabled ? "" : "opacity: 0.45; filter: grayscale(0.35);";
	}

	function areaButtonStyle(colorCss: string, enabled: boolean): string {
		if (!enabled) {
			return "opacity: 0.4; filter: grayscale(0.5);";
		}
		return `--fulcrum-area-filter-accent: ${colorCss}; background: color-mix(in srgb, ${colorCss} 22%, var(--background-primary)); color: var(--text-normal);`;
	}

	function areaIsOn(group: (typeof groups)[0], area: (typeof groups)[0]["areas"][0]): boolean {
		return group.sectionEnabled && area.enabled;
	}
</script>

{#if groups.length > 0}
	<div
		class="fulcrum-area-filter"
		class:fulcrum-area-filter--bar={bar}
		aria-label="Areas"
	>
		<div class="fulcrum-area-filter__body" class:fulcrum-area-filter__body--bar={bar}>
			{#each groups as group, groupIndex (group.lifeModeKey)}
				{#if groupIndex > 0}
					<span class="fulcrum-area-filter__group-gap" aria-hidden="true"></span>
				{/if}
				<div class="fulcrum-area-filter__row" role="group" aria-label={group.label}>
					<button
						type="button"
						class="fulcrum-area-filter__section-btn"
						class:fulcrum-area-filter__section-btn--off={!group.sectionEnabled}
						style={sectionButtonStyle(group.sectionEnabled)}
						aria-pressed={group.sectionEnabled}
						title={group.sectionEnabled
							? `Hide ${group.label} areas`
							: `Show ${group.label} areas`}
						on:click={() => toggleSection(group.lifeModeKey)}
					>
						{group.label}
					</button>
					{#each group.areas as area (area.path)}
						<button
							type="button"
							class="fulcrum-area-filter__area-btn"
							class:fulcrum-area-filter__area-btn--off={!areaIsOn(group, area)}
							style={areaButtonStyle(area.colorCss, areaIsOn(group, area))}
							aria-pressed={areaIsOn(group, area)}
							title={area.name}
							on:click={() =>
								toggleArea(
									area.path,
									group.lifeModeKey,
									group.areas.map((a) => a.path),
								)}
						>
							{#if area.icon}
								<span class="fulcrum-area-filter__area-icon" aria-hidden="true">{area.icon}</span>
							{/if}
							<span class="fulcrum-area-filter__area-label">{area.name}</span>
						</button>
					{/each}
				</div>
			{/each}
		</div>
	</div>
{/if}
