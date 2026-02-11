import { prisma } from "../src/lib/prisma";
import { countBusinessDays, HalfSession, ymd } from "../src/lib/leave-utils";
import { ensureLeaveRightsForYear } from "../src/lib/leave-rights-rollover";

function toNum(x: any) {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim() !== "") {
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  }
  if (x && typeof x === "object" && typeof x.toNumber === "function") {
    const n = x.toNumber();
    return typeof n === "number" && Number.isFinite(n) ? n : 0;
  }
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function yearStart(y: number) {
  return new Date(`${y}-01-01T00:00:00.000Z`);
}

function yearEnd(y: number) {
  // inclusive-ish; countBusinessDays iterates dates inclusively
  return new Date(`${y}-12-31T00:00:00.000Z`);
}

async function holidaySetForYear(year: number) {
  const holidays = await prisma.holiday.findMany({
    where: {
      date: {
        gte: yearStart(year),
        lte: new Date(`${year}-12-31T23:59:59.999Z`),
      },
    },
    select: { date: true },
  });
  return new Set(holidays.map((h) => ymd(new Date(h.date))));
}

type YearSegment = {
  year: number;
  start: Date;
  end: Date;
  includesOriginalStart: boolean;
};

function splitRangeByYear(start: Date, end: Date): YearSegment[] {
  if (end < start) return [];
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  const segments: YearSegment[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const segStart = y === startYear ? start : yearStart(y);
    const segEnd = y === endYear ? end : yearEnd(y);
    segments.push({
      year: y,
      start: segStart,
      end: segEnd,
      includesOriginalStart: y === startYear,
    });
  }
  return segments;
}

const DEDUCT_KINDS = [
  "SICK",
  "BUSINESS",
  "UNPAID",
  "BIRTHDAY",
  "ORDAIN",
  "MATERNITY",
] as const;

type DeductKind = (typeof DEDUCT_KINDS)[number];

function fieldForKind(kind: DeductKind) {
  switch (kind) {
    case "SICK":
      return "sickLeave" as const;
    case "BUSINESS":
      return "businessLeave" as const;
    case "UNPAID":
      return "unpaidLeave" as const;
    case "BIRTHDAY":
      return "birthdayLeave" as const;
    case "ORDAIN":
      return "ordainLeave" as const;
    case "MATERNITY":
      return "maternityLeave" as const;
  }
}

function entitlementFromTemplate(template: any, kind: DeductKind) {
  if (!template) return null;
  switch (kind) {
    case "SICK":
      return toNum(template.sickLeaveDays);
    case "BUSINESS":
      return toNum(template.businessLeaveDays);
    case "UNPAID":
      return toNum(template.unpaidLeaveDays);
    case "BIRTHDAY":
      return toNum(template.birthdayLeaveDays);
    case "ORDAIN":
      return toNum(template.ordainLeaveDays);
    case "MATERNITY":
      return toNum(template.maternityLeaveDays);
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const yearArgIndex = process.argv.indexOf("--year");
  const employeeArgIndex = process.argv.indexOf("--employeeId");

  const year =
    yearArgIndex !== -1 && process.argv[yearArgIndex + 1]
      ? Number(process.argv[yearArgIndex + 1])
      : new Date().getFullYear();

  const employeeId =
    employeeArgIndex !== -1 && process.argv[employeeArgIndex + 1]
      ? Number(process.argv[employeeArgIndex + 1])
      : null;

  const allYears = args.has("--all-years");

  if (!Number.isFinite(year) || year < 2000 || year > 3000) {
    throw new Error("invalid --year");
  }

  const employees = await prisma.employee.findMany({
    where: {
      ...(employeeId ? { id: employeeId } : {}),
      userId: { not: null },
    },
    select: {
      id: true,
      userId: true,
      levelP: true,
      prefix: true,
      weeklyHoliday: true,
    },
  });

  const yearsToProcess = async (empId: number, userId: number) => {
    if (!allYears) return [year];

    const yearsFromRights = await prisma.leaveRights.findMany({
      where: { employeeId: empId },
      select: { year: true },
    });

    const yearsFromLeaves = await prisma.leave.findMany({
      where: {
        userId,
        status: "APPROVED",
        kind: { in: DEDUCT_KINDS as any },
      },
      select: { startDate: true, endDate: true },
    });

    const set = new Set<number>();
    for (const r of yearsFromRights) set.add(r.year);
    for (const l of yearsFromLeaves) {
      const sy = new Date(l.startDate).getFullYear();
      const ey = new Date(l.endDate).getFullYear();
      for (let y = sy; y <= ey; y++) set.add(y);
    }
    return Array.from(set).sort((a, b) => a - b);
  };

  let touched = 0;

  for (const emp of employees) {
    if (typeof emp.userId !== "number") continue;

    const templateKey = emp.levelP || emp.prefix || null;
    const template = templateKey
      ? await prisma.leaveRightsTemplate.findFirst({ where: { prefix: templateKey } })
      : null;

    const years = await yearsToProcess(emp.id, emp.userId);

    for (const y of years) {
      const holidays = await holidaySetForYear(y);

      // gather approved leaves overlapping this year
      const leaves = await prisma.leave.findMany({
        where: {
          userId: emp.userId,
          status: "APPROVED",
          kind: { in: DEDUCT_KINDS as any },
          AND: [{ startDate: { lte: yearEnd(y) } }, { endDate: { gte: yearStart(y) } }],
        },
        select: {
          kind: true,
          startDate: true,
          endDate: true,
          session: true,
          requestedDays: true,
        },
      });

      const used: Record<DeductKind, number> = {
        SICK: 0,
        BUSINESS: 0,
        UNPAID: 0,
        BIRTHDAY: 0,
        ORDAIN: 0,
        MATERNITY: 0,
      };

      for (const l of leaves) {
        const start = new Date(l.startDate);
        const end = new Date(l.endDate);

        // If fully within the same year, trust stored requestedDays when available.
        if (start.getFullYear() === y && end.getFullYear() === y) {
          const stored = toNum((l as any).requestedDays);
          if (stored > 0) {
            used[l.kind as DeductKind] += stored;
            continue;
          }
        }

        const segs = splitRangeByYear(start, end);
        for (const seg of segs) {
          if (seg.year !== y) continue;

          const session: HalfSession = seg.includesOriginalStart
            ? ((l.session as any) ?? "FULL")
            : "FULL";

          const d = countBusinessDays(
            seg.start,
            seg.end,
            session,
            holidays,
            emp.weeklyHoliday ?? undefined
          );
          used[l.kind as DeductKind] += d;
        }
      }

      await ensureLeaveRightsForYear(emp.id, y);
      const rights = await prisma.leaveRights.findUnique({
        where: { employeeId_year: { employeeId: emp.id, year: y } },
      });
      if (!rights) continue;

      // Update each kind balance to entitlement - used (idempotent)
      const updates: any = {};
      for (const kind of DEDUCT_KINDS) {
        const entitlement = entitlementFromTemplate(template, kind);
        if (entitlement === null) continue;
        const remaining = Math.max(0, entitlement - (used[kind] ?? 0));
        updates[fieldForKind(kind)] = remaining;
      }

      if (Object.keys(updates).length > 0) {
        await prisma.leaveRights.update({
          where: { employeeId_year: { employeeId: emp.id, year: y } },
          data: updates,
        });
        touched++;
      }
    }
  }

  console.log(
    `[backfill] Updated balances for ${touched} employee-year record(s). Year=${year} allYears=${allYears} employeeId=${employeeId ?? "ALL"}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
