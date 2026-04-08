import { prisma } from "@/lib/prisma";
import {
  computeCarryForwardAnnualExpiry,
  computeCarryForwardHolidayExpiry,
} from "@/lib/carry-forward-expiry";
import { computeAnnualCarryForwardBucketExpiresAt } from "@/lib/annual-carry-forward-buckets";

function toInt(x: unknown) {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

// (expiry helpers moved to lib/carry-forward-expiry.ts)

export async function ensureLeaveRightsForYear(
  employeeId: number,
  year: number
) {
  const existing = await prisma.leaveRights.findUnique({
    where: { employeeId_year: { employeeId, year } },
  });
  // NOTE: Even if the LeaveRights row already exists, we may still need to
  // bootstrap the annual carry-forward bucket for employees who started in (year - 1)
  // and therefore had no previous-year LeaveRights record at the time the row was created.
  // This keeps the runtime bucket-based model consistent with the legacy carryForwardAnnual field.
  if (existing) {
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

    const employeeStartYear = employee.startDate
      ? new Date(employee.startDate).getFullYear()
      : null;
    const bootstrapAnnualCarryForward =
      !prev && employeeStartYear === year - 1
        ? toInt(template?.vacationLeaveDays ?? 0)
        : 0;

    const carryForwardAnnual = prev
      ? toInt(prev?.vacationLeave ?? 0)
      : bootstrapAnnualCarryForward;

    const annualBucketExpiresAt = computeAnnualCarryForwardBucketExpiresAt(
      employee.startDate,
      year - 1
    );

    if (carryForwardAnnual > 0 && annualBucketExpiresAt) {
      await (prisma as any).annualCarryForwardBucket.upsert({
        where: {
          employeeId_originYear: { employeeId, originYear: year - 1 },
        },
        update: {},
        create: {
          employeeId,
          originYear: year - 1,
          remaining: carryForwardAnnual,
          expiresAt: annualBucketExpiresAt,
        },
      });
    }

    return existing;
  }

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
  //
  // Bootstrap for new employees:
  // If there is no previous-year LeaveRights record yet, but the employee started in (year - 1),
  // they should still receive annual entitlement for the start year (rights earned "ย้อนหลัง 1 ปี")
  // which becomes usable on the first anniversary.
  const employeeStartYear = employee.startDate
    ? new Date(employee.startDate).getFullYear()
    : null;
  const bootstrapAnnualCarryForward =
    !prev && employeeStartYear === year - 1
      ? toInt(template?.vacationLeaveDays ?? 0)
      : 0;

  const carryForwardAnnual = prev
    ? toInt(prev?.vacationLeave ?? 0)
    : bootstrapAnnualCarryForward;
  const carryForwardHoliday = toInt(prev?.holidayLeave ?? 0);

  const annualBucketExpiresAt = computeAnnualCarryForwardBucketExpiresAt(
    employee.startDate,
    year - 1
  );

  const carryForwardAnnualExpiry = computeCarryForwardAnnualExpiry(
    employee.startDate,
    year
  );
  const carryForwardHolidayExpiry = computeCarryForwardHolidayExpiry(year);

  const [rights] = await prisma.$transaction([
    prisma.leaveRights.upsert({
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

        // Legacy fields (kept for backward compatibility)
        carryForwardAnnual,
        carryForwardAnnualExpiry,
        carryForwardHoliday,
        carryForwardHolidayExpiry,
      },
    }),
    ...(carryForwardAnnual > 0 && annualBucketExpiresAt
      ? [
          (prisma as any).annualCarryForwardBucket.upsert({
            where: {
              employeeId_originYear: { employeeId, originYear: year - 1 },
            },
            update: {},
            create: {
              employeeId,
              originYear: year - 1,
              remaining: carryForwardAnnual,
              expiresAt: annualBucketExpiresAt,
            },
          }),
        ]
      : []),
  ]);

  return rights;
}
