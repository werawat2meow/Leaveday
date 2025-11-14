export type HalfSession = "FULL" | "AM" | "PM";

export function normalizeSession(label?: string): HalfSession {
  const s = (label || "").toLowerCase();
  if (s.includes("morning")) return "AM";
  if (s.includes("afternoon")) return "PM";
  return "FULL";
}
export function ymd(d: Date) {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2,"0");
  const day = d.getDate().toString().padStart(2,"0");
  return `${y}-${m}-${day}`;
}
export function isWeekend(d: Date) {
  const wd = d.getDay(); // 0=Sun,6=Sat
  return wd === 0 || wd === 6;
}
export function isHoliday(d: Date, holidays: Set<string>) {
  return holidays.has(ymd(d));
}
export function countBusinessDays(from: Date, to: Date, session: HalfSession, holidays: Set<string>) {
  if (to < from) return 0;
  let days = 0;
  for (let dt = new Date(from); dt <= to; dt.setDate(dt.getDate() + 1)) {
    const d = new Date(dt);
    if (isWeekend(d) || isHoliday(d, holidays)) continue;
    days += 1;
  }
  if (session !== "FULL") {
    const same = ymd(from) === ymd(to);
    const working = !(isWeekend(from) || isHoliday(from, holidays));
    if (same && working) days = 0.5;
    else if (working) days = Math.max(0, days - 0.5);
  }
  return days;
}
