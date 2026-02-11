import { authOptions } from "@/lib/auth";
import { ensureLeaveRightsForYear } from "@/lib/leave-rights-rollover";
import {
  countBusinessDays,
  HalfSession,
  normalizeSession,
  ymd,
} from "@/lib/leave-utils";
import {
  countBusinessDaysByYear,
  splitRangeByYear,
} from "@/lib/leave-year-split";
import { prisma } from "@/lib/prisma";
import { LeaveStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

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

function sessionLabelFromSession(session: HalfSession | null | undefined) {
  if (session === "AM") return "Morning (Half)";
  if (session === "PM") return "Afternoon (Half)";
  return "Full Day";
}

function overlapDaysInYear(params: {
  leaveStart: Date;
  leaveEnd: Date;
  leaveSession: HalfSession | null;
  year: number;
  holidays: Set<string>;
  weeklyHoliday?: string | null;
}) {
  const { leaveStart, leaveEnd, leaveSession, year, holidays, weeklyHoliday } =
    params;
  const ys = yearStart(year);
  const ye = yearEnd(year);

  const segStart = leaveStart > ys ? leaveStart : ys;
  const segEnd = leaveEnd < ye ? leaveEnd : ye;
  if (segEnd < segStart) return 0;

  const includesOriginalStart =
    leaveStart.getFullYear() === year && ymd(leaveStart) === ymd(segStart);

  const session: HalfSession = includesOriginalStart
    ? leaveSession ?? "FULL"
    : "FULL";

  return countBusinessDays(
    segStart,
    segEnd,
    session,
    holidays,
    weeklyHoliday ?? undefined
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const leaveId = parseInt(params.id);
  if (isNaN(leaveId)) {
    return NextResponse.json({ error: "invalid leave id" }, { status: 400 });
  }

  const leave = await prisma.leave.findUnique({
    where: { id: leaveId },
    select: {
      id: true,
      userId: true,
      kind: true,
      startDate: true,
      endDate: true,
      session: true,
      reason: true,
      contact: true,
      handoverTo: true,
      attachmentUrl: true,
      approverId: true,
      status: true,
      user: { select: { email: true } },
    },
  });

  if (!leave) {
    return NextResponse.json({ error: "leave not found" }, { status: 404 });
  }

  // ผู้ยื่นคำขอเท่านั้นที่ดึงรายละเอียดไปแก้ไขได้
  if (leave.user.email !== session.user.email) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      id: leave.id,
      kind: leave.kind,
      startDate: leave.startDate,
      endDate: leave.endDate,
      status: leave.status,
      session: leave.session,
      sessionLabel: sessionLabelFromSession(leave.session ?? undefined),
      reason: leave.reason,
      contact: leave.contact,
      handoverTo: leave.handoverTo,
      attachmentUrl: leave.attachmentUrl,
      approverId: leave.approverId,
    },
  });
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

  const body = await req.json();
  const status = body?.status as string | undefined;

  // --- Approver flow (approve/reject)
  if (["APPROVED", "REJECTED"].includes(status || "")) {
    const { approverReason, approverSignature } = body as {
      approverReason?: string;
      approverSignature?: string;
    };

    const nextStatus = status as "APPROVED" | "REJECTED";

    try {
      const result = await prisma.$transaction(async (tx) => {
        const leave = await tx.leave.findUnique({
          where: { id: leaveId },
          select: {
            id: true,
            kind: true,
            status: true,
            startDate: true,
            endDate: true,
            session: true,
            requestedDays: true,
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
            status: nextStatus,
            approverReason,
            approverSignature,
            approvedAt: nextStatus === "APPROVED" ? new Date() : null,
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

        // Decrement rights only when transitioning to APPROVED (idempotent).
        if (nextStatus === "APPROVED" && leave.status !== "APPROVED") {
          const employee = leave.user.employee;
          if (employee) {
            const employeeId = employee.id;
            const now = new Date();

            const quotaFieldForKind = (kind: typeof leave.kind) => {
              switch (kind) {
                case "BUSINESS":
                  return "businessLeave" as const;
                case "SICK":
                  return "sickLeave" as const;
                case "ORDAIN":
                  return "ordainLeave" as const;
                case "MATERNITY":
                  return "maternityLeave" as const;
                case "UNPAID":
                  return "unpaidLeave" as const;
                case "BIRTHDAY":
                  return "birthdayLeave" as const;
                default:
                  return null;
              }
            };

            if (leave.kind === "ANNUAL" || leave.kind === "ANNUAL_HOLIDAY") {

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
                ? ((leave.session as HalfSession | null) ?? "FULL")
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
                Number(rights.carryForwardAnnual) > 0 &&
                rights.carryForwardAnnualExpiry &&
                new Date(rights.carryForwardAnnualExpiry) > now &&
                seg.start < new Date(rights.carryForwardAnnualExpiry)
              ) {
                const useCF = Math.min(
                  remain,
                  Number(rights.carryForwardAnnual)
                );
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
                Number(rights.carryForwardHoliday) > 0 &&
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
                if (leave.kind === "ANNUAL" && Number(rights.vacationLeave) > 0) {
                  const useCurrent = Math.min(
                    remain,
                    Number(rights.vacationLeave)
                  );
                  if (useCurrent > 0) {
                    await tx.leaveRights.update({
                      where: {
                        employeeId_year: { employeeId, year: seg.year },
                      },
                      data: { vacationLeave: { decrement: useCurrent } },
                    });
                    remain -= useCurrent;
                  }
                }
                if (
                  leave.kind === "ANNUAL_HOLIDAY" &&
                  Number(rights.holidayLeave) > 0
                ) {
                  const useCurrent = Math.min(
                    remain,
                    Number(rights.holidayLeave)
                  );
                  if (useCurrent > 0) {
                    await tx.leaveRights.update({
                      where: {
                        employeeId_year: { employeeId, year: seg.year },
                      },
                      data: { holidayLeave: { decrement: useCurrent } },
                    });
                    remain -= useCurrent;
                  }
                }
              }
            }
            } else {
              const field = quotaFieldForKind(leave.kind);
              if (field) {
                const start = new Date(leave.startDate);
                const end = new Date(leave.endDate);

                // If the leave is entirely within one year, prefer stored requestedDays
                // so UI and DB use the same number.
                if (
                  start.getFullYear() === end.getFullYear() &&
                  toNum(leave.requestedDays) > 0
                ) {
                  const y = start.getFullYear();
                  await ensureLeaveRightsForYear(employeeId, y);
                  await tx.leaveRights.update({
                    where: { employeeId_year: { employeeId, year: y } },
                    data: { [field]: { decrement: toNum(leave.requestedDays) } } as any,
                  });
                  return updatedLeave;
                }

                // Otherwise, compute by year segments.
                const segs = splitRangeByYear(start, end);
                const years = Array.from(new Set(segs.map((s) => s.year)));
                const holidaysByYear: Record<number, Set<string>> = {};
                for (const y of years) {
                  holidaysByYear[y] = await holidaySetForYear(y);
                }

                for (const seg of segs) {
                  const holidays = holidaysByYear[seg.year] ?? new Set<string>();
                  const session: HalfSession = seg.includesOriginalStart
                    ? ((leave.session as HalfSession | null) ?? "FULL")
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
                  await tx.leaveRights.update({
                    where: { employeeId_year: { employeeId, year: seg.year } },
                    data: { [field]: { decrement: Number(daysInYear) } } as any,
                  });
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

  // --- Owner flow (edit pending / cancel)
  const leave = await prisma.leave.findUnique({
    where: { id: leaveId },
    select: {
      id: true,
      userId: true,
      status: true,
      kind: true,
      startDate: true,
      endDate: true,
      session: true,
      reservation: true,
      user: {
        select: {
          email: true,
          employee: {
            select: {
              id: true,
              startDate: true,
              weeklyHoliday: true,
            },
          },
        },
      },
    },
  });

  if (!leave) {
    return NextResponse.json({ error: "leave not found" }, { status: 404 });
  }
  if (leave.user.email !== session.user.email) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (leave.status !== "PENDING") {
    return NextResponse.json(
      { error: "can edit/cancel only when PENDING" },
      { status: 400 }
    );
  }

  // Cancel (audit)
  if (status === "CANCELLED") {
    const updated = await prisma.leave.update({
      where: { id: leaveId },
      data: {
        status: LeaveStatus.CANCELLED,
        approvedAt: null,
      },
    });
    return NextResponse.json({ ok: true, data: updated });
  }

  // Edit fields (still pending)
  const {
    kind,
    startDate,
    endDate,
    sessionLabel,
    reason,
    contact,
    handoverTo,
    attachmentUrl,
    approverId,
  } = body as {
    kind?: string;
    startDate?: string;
    endDate?: string;
    sessionLabel?: string;
    reason?: string;
    contact?: string;
    handoverTo?: string;
    attachmentUrl?: string;
    approverId?: number | null;
  };

  if (!kind || !startDate || !endDate) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  if (!leave.user.employee) {
    return NextResponse.json({ error: "no employee profile" }, { status: 400 });
  }

  // ANNUAL อายุงาน
  if (kind === "ANNUAL") {
    const empStart = leave.user.employee.startDate;
    if (
      !empStart ||
      new Date().getTime() - new Date(empStart).getTime() <
        365 * 24 * 60 * 60 * 1000
    ) {
      return NextResponse.json(
        { error: "อายุงานยังไม่ครบ 1 ปี จึงยังไม่สามารถลาพักร้อนได้" },
        { status: 400 }
      );
    }
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
    return NextResponse.json({ error: "invalid date range" }, { status: 400 });
  }

  const sNorm = normalizeSession(sessionLabel);
  const segments = splitRangeByYear(start, end);
  const years = Array.from(new Set(segments.map((s) => s.year)));
  const holidaysByYear: Record<number, Set<string>> = {};
  await Promise.all(
    years.map(async (y) => {
      holidaysByYear[y] = await holidaySetForYear(y);
    })
  );

  const requestedByYear = countBusinessDaysByYear({
    start,
    end,
    sessionLabel,
    holidaysByYear,
    weeklyHoliday: leave.user.employee.weeklyHoliday ?? undefined,
  });
  const requestedDays = Object.values(requestedByYear).reduce(
    (sum, n) => sum + Number(n || 0),
    0
  );
  if (requestedDays <= 0) {
    return NextResponse.json(
      { error: "ช่วงวันไม่ใช่วันทำการ" },
      { status: 400 }
    );
  }

  // กันซ้อน (ยกเว้นใบเดิม)
  const overlap = await prisma.leave.findFirst({
    where: {
      id: { not: leaveId },
      userId: user.id,
      status: { in: ["PENDING", "APPROVED"] },
      AND: [{ startDate: { lte: end } }, { endDate: { gte: start } }],
    },
  });
  if (overlap) {
    return NextResponse.json(
      { error: "วันที่ลาซ้อนคำขอเดิม" },
      { status: 400 }
    );
  }

  const isQuotaKind = [
    "ANNUAL",
    "BUSINESS",
    "SICK",
    "BIRTHDAY",
    "ORDAIN",
    "MATERNITY",
    "UNPAID",
    "ANNUAL_HOLIDAY",
  ].includes(kind);

  const reservation: Record<string, { cf: number; current: number }> = {};

  if (isQuotaKind) {
    const now = new Date();
    const todayKey = ymd(now);
    const employeeId = leave.user.employee.id;

    for (const y of years) {
      const reqY = Number(requestedByYear[y] ?? 0);
      if (reqY <= 0) continue;

      await ensureLeaveRightsForYear(employeeId, y);
      const rights = await prisma.leaveRights.findUnique({
        where: { employeeId_year: { employeeId, year: y } },
      });

      const holidaysY = holidaysByYear[y] ?? new Set<string>();

      const leavesInYear = await prisma.leave.findMany({
        where: {
          id: { not: leaveId },
          userId: user.id,
          kind: kind as any,
          status: { in: ["APPROVED", "PENDING"] },
          AND: [
            { startDate: { lte: yearEnd(y) } },
            { endDate: { gte: yearStart(y) } },
          ],
        },
        select: {
          startDate: true,
          endDate: true,
          session: true,
          status: true,
        },
        orderBy: { startDate: "asc" },
      });

      if (kind === "ANNUAL" || kind === "ANNUAL_HOLIDAY") {
        const cfTotal = Number(
          kind === "ANNUAL"
            ? (rights as any)?.carryForwardAnnual ?? 0
            : (rights as any)?.carryForwardHoliday ?? 0
        );
        const cfExpiry =
          kind === "ANNUAL"
            ? (rights as any)?.carryForwardAnnualExpiry
              ? new Date((rights as any).carryForwardAnnualExpiry)
              : null
            : (rights as any)?.carryForwardHolidayExpiry
            ? new Date((rights as any).carryForwardHolidayExpiry)
            : null;

        const cfActiveNow = !!(cfTotal > 0 && cfExpiry && cfExpiry > now);
        let cfRemain = cfActiveNow ? cfTotal : 0;
        const currentApprovedRemain = Number(
          kind === "ANNUAL"
            ? (rights as any)?.vacationLeave ?? 0
            : (rights as any)?.holidayLeave ?? 0
        );
        let currentRemain = currentApprovedRemain;

        const segStartInYear =
          segments.find((s) => s.year === y)?.start ?? start;

        for (const l of leavesInYear) {
          if (l.status !== "PENDING") continue;
          const d = overlapDaysInYear({
            leaveStart: new Date(l.startDate),
            leaveEnd: new Date(l.endDate),
            leaveSession: (l.session as HalfSession | null) ?? null,
            year: y,
            holidays: holidaysY,
            weeklyHoliday: leave.user.employee.weeklyHoliday,
          });
          if (d <= 0) continue;
          const leaveDate = new Date(l.startDate);
          let remain = d;
          if (cfRemain > 0 && cfExpiry && cfActiveNow && leaveDate < cfExpiry) {
            const useCF = Math.min(cfRemain, remain);
            cfRemain -= useCF;
            remain -= useCF;
          }
          if (remain > 0) currentRemain -= remain;
        }

        // ✅ NEW: Annual Holiday (ปีนี้) ใช้ได้เฉพาะวันหยุดที่ประกาศ "ผ่านมาแล้ว" (ไม่ให้ยืมอนาคต)
        if (kind === "ANNUAL_HOLIDAY") {
          const declared = holidaysY.size;
          const passed = Array.from(holidaysY).filter((d) => d <= todayKey)
            .length;
          const accrued = Math.min(declared, passed);

          const usedApprovedFromCurrent = Math.max(
            0,
            declared - Math.max(0, currentApprovedRemain)
          );
          const usedPendingFromCurrent = Math.max(
            0,
            Math.max(0, currentApprovedRemain) - Math.max(0, currentRemain)
          );
          const usedFromCurrentInclPending =
            usedApprovedFromCurrent + usedPendingFromCurrent;

          const currentAccruedRemainRaw = Math.max(
            0,
            accrued - usedFromCurrentInclPending
          );
          const currentAccruedRemain = Math.min(
            Math.max(0, currentRemain),
            currentAccruedRemainRaw
          );
          const availableNow =
            currentAccruedRemain + (cfActiveNow ? Math.max(0, cfRemain) : 0);

          if (reqY > availableNow) {
            return NextResponse.json(
              {
                error: `Annual Holiday ใช้ได้ไม่พอ ณ ตอนนี้ (ปี ${y} ใช้ได้ ${availableNow} วัน: ยอดยก ${cfActiveNow ? Math.max(0, cfRemain) : 0} + ปีนี้ที่ปลดล็อคแล้วคงเหลือ ${currentAccruedRemain})`,
              },
              { status: 400 }
            );
          }

          let remainNew = reqY;
          let useCfNew = 0;
          if (
            cfRemain > 0 &&
            cfExpiry &&
            cfActiveNow &&
            segStartInYear < cfExpiry
          ) {
            useCfNew = Math.min(cfRemain, remainNew);
            remainNew -= useCfNew;
          }

          if (remainNew > currentAccruedRemain) {
            return NextResponse.json(
              {
                error:
                  "Annual Holiday ปีนี้ยังปลดล็อคไม่พอ (ไม่สามารถใช้สิทธิ์อนาคตได้)",
              },
              { status: 400 }
            );
          }

          reservation[String(y)] = {
            cf: Number(useCfNew),
            current: Number(remainNew),
          };
          continue;
        }

        const available =
          Math.max(0, currentRemain) +
          (cfActiveNow ? Math.max(0, cfRemain) : 0);
        if (reqY > available) {
          return NextResponse.json(
            { error: `สิทธิ์คงเหลือไม่พอ (ปี ${y} เหลือ ${available} วัน)` },
            { status: 400 }
          );
        }

        let remainNew = reqY;
        let useCfNew = 0;
        if (
          cfRemain > 0 &&
          cfExpiry &&
          cfActiveNow &&
          segStartInYear < cfExpiry
        ) {
          useCfNew = Math.min(cfRemain, remainNew);
          remainNew -= useCfNew;
        }

        const useCurrentNew = remainNew;
        reservation[String(y)] = {
          cf: Number(useCfNew),
          current: Number(useCurrentNew),
        };
      } else {
        const entitled = (() => {
          switch (kind as string) {
            case "BUSINESS":
              return Number((rights as any)?.businessLeave ?? 0);
            case "SICK":
              return Number((rights as any)?.sickLeave ?? 0);
            case "BIRTHDAY":
              return Number((rights as any)?.birthdayLeave ?? 0);
            case "ORDAIN":
              return Number((rights as any)?.ordainLeave ?? 0);
            case "MATERNITY":
              return Number((rights as any)?.maternityLeave ?? 0);
            case "UNPAID":
              return Number((rights as any)?.unpaidLeave ?? 0);
            default:
              return 0;
          }
        })();

        let usedApproved = 0;
        let usedPending = 0;
        for (const l of leavesInYear) {
          const d = overlapDaysInYear({
            leaveStart: new Date(l.startDate),
            leaveEnd: new Date(l.endDate),
            leaveSession: (l.session as HalfSession | null) ?? null,
            year: y,
            holidays: holidaysY,
            weeklyHoliday: leave.user.employee.weeklyHoliday,
          });
          if (l.status === "APPROVED") usedApproved += d;
          if (l.status === "PENDING") usedPending += d;
        }

        const remain = entitled - usedApproved - usedPending;
        if (reqY > remain) {
          return NextResponse.json(
            { error: `สิทธิ์คงเหลือไม่พอ (ปี ${y} เหลือ ${remain} วัน)` },
            { status: 400 }
          );
        }
      }
    }
  }

  const updated = await prisma.leave.update({
    where: { id: leaveId },
    data: {
      kind: kind as any,
      startDate: start,
      endDate: end,
      session: sNorm,
      reason: reason ?? undefined,
      contact: contact ?? undefined,
      handoverTo: handoverTo ?? undefined,
      attachmentUrl: attachmentUrl ?? undefined,
      approverId: typeof approverId === "number" ? approverId : null,
      requestedDays,
      reservation:
        kind === "ANNUAL" || kind === "ANNUAL_HOLIDAY"
          ? (reservation as any)
          : undefined,
      status: "PENDING",
      approvedAt: null,
    },
  });

  return NextResponse.json({ ok: true, data: updated });
}
