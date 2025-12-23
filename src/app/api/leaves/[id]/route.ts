import { authOptions } from "@/lib/auth";
import { ensureLeaveRightsForYear } from "@/lib/leave-rights-rollover";
import {
  countBusinessDays,
  HalfSession,
  normalizeSession,
  ymd,
} from "@/lib/leave-utils";
import { splitRangeByYear } from "@/lib/leave-year-split";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

function yearStart(y: number) {
  return new Date(`${y}-01-01T00:00:00.000Z`);
}

function yearEnd(y: number) {
  return new Date(`${y}-12-31T23:59:59.999Z`);
}

async function holidaySetForYear(year: number) {
  const holidays = await prisma.holiday.findMany({
    where: {
      date: {
        gte: yearStart(year),
        lte: yearEnd(year),
      },
    },
    select: { date: true },
  });
  return new Set(holidays.map((h) => ymd(new Date(h.date))));
}

function getReservationForYear(
  reservation: unknown,
  year: number
): { cf: number; current: number } | null {
  if (!reservation || typeof reservation !== "object") return null;
  const r = reservation as Record<string, any>;
  const v = r[String(year)];
  if (!v || typeof v !== "object") return null;
  const cf = Math.max(0, Number(v.cf ?? 0));
  const current = Math.max(0, Number(v.current ?? 0));
  if (!Number.isFinite(cf) || !Number.isFinite(current)) return null;
  return { cf, current };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { employee: true },
  });
  if (!user) {
    return NextResponse.json({ error: "no user" }, { status: 400 });
  }

  // หา approver ที่ตรงกับ user นี้
  const approver = await prisma.approver.findFirst({
    where: {
      OR: [{ email: session.user.email }, { empNo: user.employee?.empNo }],
    },
  });

  const leaveId = parseInt(params.id);
  if (isNaN(leaveId)) {
    return NextResponse.json({ error: "invalid leave id" }, { status: 400 });
  }

  const { status, approverReason, approverSignature } = await req.json();

  if (!["APPROVED", "REJECTED"].includes(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const leave = await tx.leave.findUnique({
        where: { id: leaveId },
        select: {
          id: true,
          kind: true,
          startDate: true,
          endDate: true,
          session: true,
          reservation: true,
          user: {
            select: {
              id: true,
              name: true,
              employee: {
                select: {
                  id: true,
                  empNo: true,
                  firstName: true,
                  lastName: true,
                  org: true,
                  department: true,
                  division: true,
                  unit: true,
                  levelP: true,
                  weeklyHoliday: true,
                  startDate: true,
                  prefix: true,
                },
              },
            },
          },
        },
      });
      if (!leave) {
        throw new Error("leave not found");
      }

      const updatedLeave = await tx.leave.update({
        where: { id: leaveId },
        data: {
          status,
          approverReason,
          approverSignature,
          approvedAt: status === "APPROVED" ? new Date() : null,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              employee: {
                select: {
                  empNo: true,
                  firstName: true,
                  lastName: true,
                  org: true,
                  department: true,
                  division: true,
                  unit: true,
                  levelP: true,
                },
              },
            },
          },
        },
      });

      // Only decrement rights on APPROVED for Annual / Annual Holiday.
      if (
        status === "APPROVED" &&
        (leave.kind === "ANNUAL" || leave.kind === "ANNUAL_HOLIDAY")
      ) {
        const employee = leave.user.employee;
        if (employee) {
          const employeeId = employee.id;
          const now = new Date();

          // Prefer reservation snapshot so APPROVED matches what PENDING reserved.
          const res = leave.reservation as
            | Record<string, { cf?: number; current?: number }>
            | null
            | undefined;

          if (res && typeof res === "object") {
            for (const [yearStr, alloc] of Object.entries(res)) {
              const y = Number(yearStr);
              if (!Number.isFinite(y)) continue;

              let cf = Math.max(0, Number(alloc?.cf ?? 0));
              let current = Math.max(0, Number(alloc?.current ?? 0));
              if (cf === 0 && current === 0) continue;

              // Ensure exists (uses template + carry-forward rollover policy)
              // NOTE: use global helper for consistency; within tx we still update deterministically.
              await ensureLeaveRightsForYear(employeeId, y);

              const rights = await tx.leaveRights.findUnique({
                where: { employeeId_year: { employeeId, year: y } },
              });
              if (!rights) continue;

              // Policy: if carry-forward is expired now, it cannot be used.
              if (leave.kind === "ANNUAL") {
                const expiry = rights.carryForwardAnnualExpiry
                  ? new Date(rights.carryForwardAnnualExpiry)
                  : null;
                if (cf > 0 && (!expiry || expiry <= now)) {
                  current += cf;
                  cf = 0;
                }
              }
              if (leave.kind === "ANNUAL_HOLIDAY") {
                const expiry = rights.carryForwardHolidayExpiry
                  ? new Date(rights.carryForwardHolidayExpiry)
                  : null;
                if (cf > 0 && (!expiry || expiry <= now)) {
                  current += cf;
                  cf = 0;
                }
              }

              if (leave.kind === "ANNUAL") {
                if (cf > 0) {
                  await tx.leaveRights.update({
                    where: { employeeId_year: { employeeId, year: y } },
                    data: { carryForwardAnnual: { decrement: cf } },
                  });
                }
                if (current > 0) {
                  await tx.leaveRights.update({
                    where: { employeeId_year: { employeeId, year: y } },
                    data: { vacationLeave: { decrement: current } },
                  });
                }
              }

              if (leave.kind === "ANNUAL_HOLIDAY") {
                if (cf > 0) {
                  await tx.leaveRights.update({
                    where: { employeeId_year: { employeeId, year: y } },
                    data: { carryForwardHoliday: { decrement: cf } },
                  });
                }
                if (current > 0) {
                  await tx.leaveRights.update({
                    where: { employeeId_year: { employeeId, year: y } },
                    data: { holidayLeave: { decrement: current } },
                  });
                }
              }
            }

            return updatedLeave;
          }

          // Fallback for old leaves without reservation: compute by year segments.
          const start = new Date(leave.startDate);
          const end = new Date(leave.endDate);
          const segs = splitRangeByYear(start, end);
          const years = Array.from(new Set(segs.map((s) => s.year)));
          const holidaysByYear: Record<number, Set<string>> = {};
          for (const y of years) {
            holidaysByYear[y] = await holidaySetForYear(y);
          }

          for (const seg of segs) {
            const holidays = holidaysByYear[seg.year] ?? new Set<string>();
            const session: HalfSession = seg.includesOriginalStart
              ? normalizeSession(leave.session ?? undefined)
              : "FULL";

            const daysInYear = countBusinessDays(
              seg.start,
              seg.end,
              session,
              holidays,
              employee.weeklyHoliday ?? undefined
            );
            if (daysInYear <= 0) continue;

            await ensureLeaveRightsForYear(employeeId, seg.year);
            const rights = await tx.leaveRights.findUnique({
              where: { employeeId_year: { employeeId, year: seg.year } },
            });
            if (!rights) continue;

            let remain = Number(daysInYear);

            if (
              leave.kind === "ANNUAL" &&
              rights.carryForwardAnnual > 0 &&
              rights.carryForwardAnnualExpiry &&
              new Date(rights.carryForwardAnnualExpiry) > now &&
              seg.start < new Date(rights.carryForwardAnnualExpiry)
            ) {
              const useCF = Math.min(remain, Number(rights.carryForwardAnnual));
              if (useCF > 0) {
                await tx.leaveRights.update({
                  where: { employeeId_year: { employeeId, year: seg.year } },
                  data: { carryForwardAnnual: { decrement: useCF } },
                });
                remain -= useCF;
              }
            }

            if (
              leave.kind === "ANNUAL_HOLIDAY" &&
              rights.carryForwardHoliday > 0 &&
              rights.carryForwardHolidayExpiry &&
              new Date(rights.carryForwardHolidayExpiry) > now &&
              seg.start < new Date(rights.carryForwardHolidayExpiry)
            ) {
              const useCF = Math.min(
                remain,
                Number(rights.carryForwardHoliday)
              );
              if (useCF > 0) {
                await tx.leaveRights.update({
                  where: { employeeId_year: { employeeId, year: seg.year } },
                  data: { carryForwardHoliday: { decrement: useCF } },
                });
                remain -= useCF;
              }
            }

            if (remain > 0) {
              if (leave.kind === "ANNUAL" && rights.vacationLeave > 0) {
                const useCurrent = Math.min(
                  remain,
                  Number(rights.vacationLeave)
                );
                if (useCurrent > 0) {
                  await tx.leaveRights.update({
                    where: { employeeId_year: { employeeId, year: seg.year } },
                    data: { vacationLeave: { decrement: useCurrent } },
                  });
                  remain -= useCurrent;
                }
              }
              if (leave.kind === "ANNUAL_HOLIDAY" && rights.holidayLeave > 0) {
                const useCurrent = Math.min(
                  remain,
                  Number(rights.holidayLeave)
                );
                if (useCurrent > 0) {
                  await tx.leaveRights.update({
                    where: { employeeId_year: { employeeId, year: seg.year } },
                    data: { holidayLeave: { decrement: useCurrent } },
                  });
                  remain -= useCurrent;
                }
              }
            }
          }
        }
      }

      return updatedLeave;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error updating leave:", error);
    return NextResponse.json(
      { error: "failed to update leave" },
      { status: 500 }
    );
  }
}
