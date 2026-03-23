function clampDayOfMonthUTC(year: number, month0: number, day: number) {
  const lastDay = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  return Math.max(1, Math.min(day, lastDay));
}

export function computeAnnualUnlockDate(
  employeeStartDate: Date | null | undefined,
  rightsYear: number
): Date | null {
  if (!employeeStartDate) return null;
  const base = new Date(employeeStartDate);
  const month0 = base.getUTCMonth();
  const day = base.getUTCDate();
  const clampedDay = clampDayOfMonthUTC(rightsYear, month0, day);
  return new Date(Date.UTC(rightsYear, month0, clampedDay));
}

export function dayBeforeUTC(d: Date) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() - 1);
  return x;
}
