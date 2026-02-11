export type HalfSession = "FULL" | "AM" | "PM";

export function normalizeSession(label?: string): HalfSession {
  const s = (label || "").toLowerCase();
  // Support enum-like inputs too (from DB) e.g. "AM" | "PM" | "FULL"
  if (s === "am") return "AM";
  if (s === "pm") return "PM";
  if (s === "full") return "FULL";

  // Support Thai labels
  if (s.includes("เช้า")) return "AM";
  if (s.includes("บ่าย")) return "PM";
  if (s.includes("เต็มวัน")) return "FULL";

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

export function isWeekyHoliday(d: Date, weeklyHoliday: string) {
  // weeklyHoliday เช่น "อาทิตย์", "จันทร์", ...
  const daysMap: Record<string, number> = {
    "อาทิตย์": 0, "sunday": 0,
    "จันทร์": 1, "monday": 1,
    "อังคาร": 2, "tuesday": 2,
    "พุธ": 3, "wednesday": 3,
    "พฤหัสบดี": 4, "thursday": 4,
    "ศุกร์": 5, "friday": 5,
    "เสาร์": 6, "saturday": 6,
  };
  const key = weeklyHoliday.trim().replace(/^วัน/, "").toLowerCase();
  return d.getDay() === daysMap[key] || d.getDay() === daysMap[weeklyHoliday.trim().toLowerCase()];
}

export function countBusinessDays(from: Date, to: Date, session: HalfSession, holidays: Set<string>, weeklyHoliday?: string) {
  if (to < from) return 0;
  let days = 0;
  for (let dt = new Date(from); dt <= to; dt.setDate(dt.getDate() + 1)) {
    const d = new Date(dt);
    // สำหรับบริษัททัวร์: ทำงานทุกวัน ยกเว้นวันหยุดที่กำหนดใน Holiday table เท่านั้น
    // if (isHoliday(d, holidays)) continue;
    if (weeklyHoliday && isWeekyHoliday(d, weeklyHoliday)) continue;
    days += 1;
  }
  if (session !== "FULL") {
    const same = ymd(from) === ymd(to);
    const working = !isHoliday(from, holidays);
    if (same && working) days = 0.5;
    else if (working) days = Math.max(0, days - 0.5);
  }
  return days;
}

