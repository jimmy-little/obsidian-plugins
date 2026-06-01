export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function formatMonthTitle(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

export function toIsoDateLocal(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
