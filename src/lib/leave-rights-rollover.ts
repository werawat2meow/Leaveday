import { prisma } from "@/lib/prisma";

function toInt(x: unknown) {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function computeAnnualCarryExpiry(
  employeeStartDate: Date | null | undefined,
  year: number
) {
  const base = employeeStartDate
    ? new Date(employeeStartDate)
    : new Date(`${year}-01-01T00:00:00.000Z`);
  const expiry = new Date(base);
  expiry.setFullYear(year);
  return expiry;
}

function computeHolidayCarryExpiry(year: number) {
  // Policy: carry-forward holiday expires within the same year (Sep 30 of that year)
  return new Date(`${year}-09-30T00:00:00.000Z`);
}

export async function ensureLeaveRightsForYear(
  employeeId: number,
  year: number
) {
  const existing = await prisma.leaveRights.findUnique({
    where: { employeeId_year: { employeeId, year } },
  });
  if (existing) return existing;

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  });
  if (!employee) {
    throw new Error(`Employee not found (id=${employeeId})`);
  }

  const templateKey = employee.levelP || employee.prefix || null;
  const template = templateKey
    ? await prisma.leaveRightsTemplate.findFirst({
        where: { prefix: templateKey },
      })
    : null;

  const prev = await prisma.leaveRights.findUnique({
    where: { employeeId_year: { employeeId, year: year - 1 } },
  });

  // ✅ Carry forward should come from the *remaining* balance of the previous year.
  // In this codebase vacationLeave / holidayLeave are decremented on approval and represent remaining.
  const carryForwardAnnual = toInt(prev?.vacationLeave ?? 0);
  const carryForwardHoliday = toInt(prev?.holidayLeave ?? 0);

  const carryForwardAnnualExpiry = computeAnnualCarryExpiry(
    employee.startDate,
    year
  );
  const carryForwardHolidayExpiry = computeHolidayCarryExpiry(year);

  const rights = await prisma.leaveRights.upsert({
    where: { employeeId_year: { employeeId, year } },
    update: {},
    create: {
      employeeId,
      year,

      annualLeave: toInt(template?.annualLeaveDays ?? 0),
      holidayLeave: toInt(template?.holidayLeaveDays ?? 0),
      vacationLeave: toInt(template?.vacationLeaveDays ?? 0),
      businessLeave: toInt(template?.businessLeaveDays ?? 0),
      sickLeave: toInt(template?.sickLeaveDays ?? 0),
      ordainLeave: toInt(template?.ordainLeaveDays ?? 0),
      maternityLeave: toInt(template?.maternityLeaveDays ?? 0),
      unpaidLeave: toInt(template?.unpaidLeaveDays ?? 0),
      birthdayLeave: toInt(template?.birthdayLeaveDays ?? 0),

      carryForwardAnnual,
      carryForwardAnnualExpiry,
      carryForwardHoliday,
      carryForwardHolidayExpiry,
    },
  });

  return rights;
}
