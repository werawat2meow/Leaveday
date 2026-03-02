function clampDayOfMonthUTC(year: number, month0: number, day: number) {
  const lastDay = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  return Math.max(1, Math.min(day, lastDay));
}

export function computeCarryForwardAnnualExpiry(
  employeeStartDate: Date | null | undefined,
  rightsYear: number
): Date {
  // Policy:
  // - Carry-forward annual leave (carried from previous year into rightsYear) expires on the
  //   employee's start-date anniversary within the rights year.
  // Example: start 2024-09-09, rightsYear=2026 => expiry 2026-09-09.
  const expiryYear = rightsYear;

  // Fallback when startDate is missing: keep carry-forward usable through end of expiryYear.
  if (!employeeStartDate) {
    return new Date(Date.UTC(expiryYear, 11, 31));
  }

  const base = new Date(employeeStartDate);
  const month0 = base.getUTCMonth();
  const day = base.getUTCDate();
  const clampedDay = clampDayOfMonthUTC(expiryYear, month0, day);
  return new Date(Date.UTC(expiryYear, month0, clampedDay));
}

export function computeCarryForwardHolidayExpiry(rightsYear: number): Date {
  // Policy: carry-forward holiday expires within the same rights year (Sep 30).
  return new Date(Date.UTC(rightsYear, 8, 30));
}
