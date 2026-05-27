function formatDate(
  dateKey: string,
  format: "monthYear" | "dayShort" | "full" | "dayFull"
): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (format === "monthYear")
    return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  if (format === "dayShort")
    return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
  if (format === "dayFull")
    return date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateKeyLabel(dateKey: string, format: "monthYear" | "dayShort" | "full" | "dayFull"): string {
  return formatDate(dateKey, format);
}

/** Same style as Fulcrum activity date chips (e.g. "Apr 03, 2026"). */
export function formatShortMonthDay(iso: string | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso.slice(0, 10) + "T12:00:00");
  if (Number.isNaN(t)) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric" }).format(t);
}

export function formatShortMonthDayFromMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return formatShortMonthDay(`${y}-${mo}-${day}`) || `${y}-${mo}-${day}`;
}

export function luminance(hexOrRgb: string): number {
  let r = 0, g = 0, b = 0;
  const hex = hexOrRgb.replace(/^#/, "");
  if (hex.length === 6) {
    r = parseInt(hex.slice(0, 2), 16) / 255;
    g = parseInt(hex.slice(2, 4), 16) / 255;
    b = parseInt(hex.slice(4, 6), 16) / 255;
  }
  const l = (x: number) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
  return 0.2126 * l(r) + 0.7152 * l(g) + 0.0722 * l(b);
}
