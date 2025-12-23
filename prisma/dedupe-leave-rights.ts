import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type LeaveRightsRow = {
  id: number;
  employeeId: number;
  year: number;
  annualLeave: number;
  carryForwardAnnual: number;
  carryForwardAnnualExpiry: Date | null;
  holidayLeave: number;
  carryForwardHoliday: number;
  carryForwardHolidayExpiry: Date | null;
  vacationLeave: number;
  businessLeave: number;
  sickLeave: number;
  ordainLeave: number;
  maternityLeave: number;
  unpaidLeave: number;
  birthdayLeave: number;
};

function toInt(x: unknown): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function pickMin(rows: LeaveRightsRow[], field: keyof LeaveRightsRow): number {
  return rows.reduce(
    (min, r) => Math.min(min, toInt((r as any)[field])),
    Number.POSITIVE_INFINITY
  );
}

function pickMax(rows: LeaveRightsRow[], field: keyof LeaveRightsRow): number {
  return rows.reduce(
    (max, r) => Math.max(max, toInt((r as any)[field])),
    Number.NEGATIVE_INFINITY
  );
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has("--apply");

  const dupGroups = await prisma.leaveRights.groupBy({
    by: ["employeeId", "year"],
    _count: { id: true },
    having: {
      id: { _count: { gt: 1 } },
    },
    orderBy: [{ employeeId: "asc" }, { year: "asc" }],
  });

  if (dupGroups.length === 0) {
    console.log("No duplicate LeaveRights groups found.");
    return;
  }

  console.log(`Found ${dupGroups.length} duplicate LeaveRights groups.`);
  if (!apply) {
    console.log(
      "Dry-run mode. Re-run with --apply to perform updates/deletes."
    );
  }

  for (const g of dupGroups) {
    const rows = (await prisma.leaveRights.findMany({
      where: { employeeId: g.employeeId, year: g.year },
      orderBy: { id: "asc" },
      select: {
        id: true,
        employeeId: true,
        year: true,
        annualLeave: true,
        carryForwardAnnual: true,
        carryForwardAnnualExpiry: true,
        holidayLeave: true,
        carryForwardHoliday: true,
        carryForwardHolidayExpiry: true,
        vacationLeave: true,
        businessLeave: true,
        sickLeave: true,
        ordainLeave: true,
        maternityLeave: true,
        unpaidLeave: true,
        birthdayLeave: true,
      },
    })) as LeaveRightsRow[];

    const keep = rows[rows.length - 1];
    const deleteIds = rows.slice(0, -1).map((r) => r.id);

    const merged = {
      // Entitlement-like field (used as fallback in summary): keep the highest.
      annualLeave: pickMax(rows, "annualLeave"),

      // Remaining pools: keep the lowest to avoid accidentally granting extra leave.
      vacationLeave: pickMin(rows, "vacationLeave"),
      holidayLeave: pickMin(rows, "holidayLeave"),
      businessLeave: pickMin(rows, "businessLeave"),
      sickLeave: pickMin(rows, "sickLeave"),
      ordainLeave: pickMin(rows, "ordainLeave"),
      maternityLeave: pickMin(rows, "maternityLeave"),
      unpaidLeave: pickMin(rows, "unpaidLeave"),
      birthdayLeave: pickMin(rows, "birthdayLeave"),
      carryForwardAnnual: pickMin(rows, "carryForwardAnnual"),
      carryForwardHoliday: pickMin(rows, "carryForwardHoliday"),

      // Expiry policy can be changed by admin; keep the value from the latest row.
      carryForwardAnnualExpiry: keep.carryForwardAnnualExpiry,
      carryForwardHolidayExpiry: keep.carryForwardHolidayExpiry,
    };

    const changedFields = Object.entries(merged)
      .filter(([k, v]) => {
        const current = (keep as any)[k];
        if (current instanceof Date && v instanceof Date)
          return current.getTime() !== v.getTime();
        return current !== v;
      })
      .map(([k]) => k);

    console.log(
      `employeeId=${g.employeeId}, year=${g.year}: keep id=${
        keep.id
      }, delete [${deleteIds.join(", ")}], merged changes: ${
        changedFields.length ? changedFields.join(", ") : "(none)"
      }`
    );

    if (!apply) continue;

    await prisma.$transaction(async (tx) => {
      await tx.leaveRights.update({
        where: { id: keep.id },
        data: merged as any,
      });

      if (deleteIds.length) {
        await tx.leaveRights.deleteMany({
          where: { id: { in: deleteIds } },
        });
      }
    });
  }

  console.log(apply ? "Done (applied)." : "Done (dry-run).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
