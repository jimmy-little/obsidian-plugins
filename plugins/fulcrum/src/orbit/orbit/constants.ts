/** Custom view: ribbon / command hub (optional entry). */
export const VIEW_ORBIT_MAIN = "orbit-main";
/** Custom view: single person CRM profile for a markdown file. */
export const VIEW_ORBIT_PERSON = "fulcrum-orbit-person";
/** Right-sidebar org chart from a person's org_up / org_down links. */
export const VIEW_ORBIT_ORG_CHART = "fulcrum-orbit-org-chart";

/** Standalone Orbit plugin view ids (pre-merge); used for leaf migration checks. */
export const LEGACY_VIEW_ORBIT_PERSON = "orbit-person";
export const LEGACY_VIEW_ORBIT_ORG_CHART = "orbit-org-chart";

export function isOrbitPersonViewType(type: string): boolean {
	return type === VIEW_ORBIT_PERSON || type === LEGACY_VIEW_ORBIT_PERSON;
}

export function isOrbitOrgChartViewType(type: string): boolean {
	return type === VIEW_ORBIT_ORG_CHART || type === LEGACY_VIEW_ORBIT_ORG_CHART;
}

/** manifest.json id — use for `app.plugins.plugins["orbit"]` checks. */
export const ORBIT_PLUGIN_ID = "orbit";
