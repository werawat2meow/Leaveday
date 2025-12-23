import { authOptions } from "@/lib/auth";
import { ensureLeaveRightsForYear } from "@/lib/leave-rights-rollover";
import { countBusinessDays, normalizeSession } from "@/lib/leave-utils";
import {
  countBusinessDaysByYear,
  splitRangeByYear,
} from "@/lib/leave-year-split";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

type HalfSession = "FULL" | "AM" | "PM";

function yearStart(y: number) {
  return new Date(`${y}-01-01T00:00:00.000Z`);
}

function yearEnd(y: number) {
  return new Date(`${y}-12-31T00:00:00.000Z`);
}

async function holidaySetForYear(year: number) {
  const holidays = await prisma.holiday.findMany({
    where: {
      date: {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`),
      },
    },
    select: { date: true },
  });
  return new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
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
    leaveStart.getFullYear() === year &&
    leaveStart.toISOString().slice(0, 10) ===
      segStart.toISOString().slice(0, 10);

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

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // รับ department จาก query param (เช่น /api/leaves?department=xxx)
    const { searchParams } = new URL(req.url);
    const department = searchParams.get("department");

    let whereCondition: any = {};
    if (department) {
      // ถ้ามี department param ให้ filter leave ของทุกคนในแผนกนั้น
      whereCondition.user = {
        employee: {
          department: department,
        },
      };
    } else {
      // ถ้าไม่มี department param ให้ filter leave ของ user ที่ login อยู่
      whereCondition.user = { email: session.user.email };
    }

    const leaves = await prisma.leave.findMany({
      where: whereCondition,
      orderBy: { createdAt: "desc" },
    });

    // ดึงข้อมูลผู้อนุมัติจาก Approver table
    const approverIds = leaves
      .map((leave) => leave.approverId)
      .filter((id): id is number => id !== null);

    const approvers = await prisma.approver.findMany({
      where: { id: { in: approverIds } },
      select: {
        id: true,
        prefix: true,
        firstNameTh: true,
        lastNameTh: true,
      },
    });

    // สร้าง Map สำหรับ lookup
    const approverMap = new Map(
      approvers.map((a) => [
        a.id,
        `${a.prefix ?? ""}${a.firstNameTh} ${a.lastNameTh}`,
      ])
    );

    // Format ข้อมูล
    const formattedLeaves = leaves.map((leave) => ({
      id: leave.id,
      kind: leave.kind,
      startDate: leave.startDate,
      endDate: leave.endDate,
      status: leave.status,
      reason: leave.reason,
      requestedDays: leave.requestedDays,
      handoverTo: leave.handoverTo,
      approverComment: leave.approverReason ?? "",
      approver: {
        name: leave.approverId
          ? approverMap.get(leave.approverId) || "ยังไม่ระบุผู้อนุมัติ"
          : "ยังไม่ระบุผู้อนุมัติ",
      },
    }));

    return NextResponse.json({
      ok: true,
      data: formattedLeaves,
    });
  } catch (error) {
    console.error("GET /api/leaves error:", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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
    } = await req.json();

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { employee: true },
    });
    if (!user?.employee)
      return NextResponse.json(
        { error: "no employee profile" },
        { status: 400 }
      );

    if (kind === "ANNUAL") {
      const startDate = user.employee.startDate;
      if (
        !startDate ||
        new Date().getTime() - new Date(startDate).getTime() <
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
    const sNorm = normalizeSession(sessionLabel);

    // คำนวณวันลาแยกตามปี (รองรับลาคร่อมปี)
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
      weeklyHoliday: user.employee.weeklyHoliday ?? undefined,
    });

    const requestedDays = Object.values(requestedByYear).reduce(
      (sum, n) => sum + Number(n || 0),
      0
    );

    if (requestedDays <= 0)
      return NextResponse.json(
        { error: "ช่วงวันไม่ใช่วันทำการ" },
        { status: 400 }
      );

    // กันซ้อน
    const overlap = await prisma.leave.findFirst({
      where: {
        userId: user.id,
        status: { in: ["PENDING", "APPROVED"] },
        AND: [{ startDate: { lte: end } }, { endDate: { gte: start } }],
      },
    });
    if (overlap)
      return NextResponse.json(
        { error: "วันที่ลาซ้อนคำขอเดิม" },
        { status: 400 }
      );

    // เช็คสิทธิ์แบบแยกตามปี (รองรับลาคร่อมปี)
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

    // สำหรับ ANNUAL/ANNUAL_HOLIDAY: ตรึงการกันสิทธิ์ไว้ตอนยื่นลา
    const reservation: Record<string, { cf: number; current: number }> = {};

    if (isQuotaKind) {
      const now = new Date();

      for (const y of years) {
        const reqY = Number(requestedByYear[y] ?? 0);
        if (reqY <= 0) continue;

        await ensureLeaveRightsForYear(user.employee.id, y);
        const rights = await prisma.leaveRights.findUnique({
          where: { employeeId_year: { employeeId: user.employee.id, year: y } },
        });

        const holidaysY = holidaysByYear[y] ?? new Set<string>();

        // ดึงใบลาที่ทับปีนี้ (เฉพาะ kind เดียว) เพื่อคำนวณ used (รองรับลาคร่อมปี)
        const leavesInYear = await prisma.leave.findMany({
          where: {
            userId: user.id,
            kind,
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

        // ✅ Annual/AnnualHoliday: balances are already decremented on APPROVED in LeaveRights.
        // So we only need to reserve PENDING against the current balances.
        if (kind === "ANNUAL" || kind === "ANNUAL_HOLIDAY") {
          const cfTotal = Number(
            kind === "ANNUAL"
              ? rights?.carryForwardAnnual ?? 0
              : rights?.carryForwardHoliday ?? 0
          );
          const cfExpiry =
            kind === "ANNUAL"
              ? rights?.carryForwardAnnualExpiry
                ? new Date(rights.carryForwardAnnualExpiry)
                : null
              : rights?.carryForwardHolidayExpiry
              ? new Date(rights.carryForwardHolidayExpiry)
              : null;
          const cfActiveNow = !!(cfTotal > 0 && cfExpiry && cfExpiry > now);

          let cfRemain = cfActiveNow ? cfTotal : 0;
          let currentRemain = Number(
            kind === "ANNUAL"
              ? rights?.vacationLeave ?? 0
              : rights?.holidayLeave ?? 0
          );

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
              weeklyHoliday: user.employee.weeklyHoliday,
            });
            if (d <= 0) continue;
            const leaveDate = new Date(l.startDate);
            let remain = d;
            if (
              cfRemain > 0 &&
              cfExpiry &&
              cfActiveNow &&
              leaveDate < cfExpiry
            ) {
              const useCF = Math.min(cfRemain, remain);
              cfRemain -= useCF;
              remain -= useCF;
            }
            if (remain > 0) currentRemain -= remain;
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

          // จองสิทธิ์สำหรับคำขอใหม่นี้ (ไม่เอาไปหักจริงจนกว่าจะ APPROVED)
          // ใช้ตรรกะเดียวกับ validation: ยอดยกใช้ได้เฉพาะถ้ายังไม่หมดอายุ ณ ตอนยื่นลา และวันที่ลาอยู่ก่อนวันหมดอายุ
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
                return Number(rights?.businessLeave ?? 0);
              case "SICK":
                return Number(rights?.sickLeave ?? 0);
              case "BIRTHDAY":
                return Number(rights?.birthdayLeave ?? 0);
              case "ORDAIN":
                return Number(rights?.ordainLeave ?? 0);
              case "MATERNITY":
                return Number(rights?.maternityLeave ?? 0);
              case "UNPAID":
                return Number(rights?.unpaidLeave ?? 0);
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
              weeklyHoliday: user.employee.weeklyHoliday,
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

    const saved = await prisma.leave.create({
      data: {
        userId: user.id,
        approverId,
        kind,
        startDate: start,
        endDate: end,
        session: sNorm,
        reason,
        contact,
        handoverTo,
        attachmentUrl,
        requestedDays,
        reservation:
          kind === "ANNUAL" || kind === "ANNUAL_HOLIDAY"
            ? (reservation as any)
            : undefined,
        status: "PENDING",
      },
    });

    return NextResponse.json({ ok: true, data: saved });
  } catch (error) {
    console.error("POST /api/leaves error:", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { employee: true },
  });
  if (!user) return NextResponse.json({ error: "no user" }, { status: 400 });

  // หา approver ที่ตรงกับ user นี้
  const approver = await prisma.approver.findFirst({
    where: {
      OR: [{ email: session.user.email }, { empNo: user.employee?.empNo }],
    },
  });

  const { searchParams } = new URL(req.url);
  const leaveId = searchParams.get("id");
  if (!leaveId)
    return NextResponse.json({ error: "missing leave id" }, { status: 400 });

  const { status, approverReason, approverSignature } = await req.json();

  if (!["APPROVED", "REJECTED"].includes(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  try {
    const updatedLeave = await prisma.leave.update({
      where: { id: parseInt(leaveId) },
      data: {
        status,
        approverReason,
        approverSignature,
        approvedAt: new Date(),
      },
      include: {
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
              },
            },
          },
        },
      },
    });

    // Prisma update above doesn't select scalar fields beyond defaults.
    // We must explicitly fetch `reservation` so approval can follow the same allocation as PENDING.
    const updatedLeaveReservation = await prisma.leave.findUnique({
      where: { id: updatedLeave.id },
      select: { reservation: true },
    });
    (updatedLeave as any).reservation = updatedLeaveReservation?.reservation;

    if (
      status === "APPROVED" &&
      ["ANNUAL", "ANNUAL_HOLIDAY"].includes(updatedLeave.kind)
    ) {
      if (updatedLeave.user.employee) {
        const employeeId = updatedLeave.user.employee.id;
        const now = new Date();

        // ถ้ามี reservation ให้หักตามที่จองไว้ (ไม่คำนวณใหม่)
        const res = (updatedLeave as any).reservation as
          | Record<string, { cf?: number; current?: number }>
          | null
          | undefined;
        if (res && typeof res === "object") {
          const entries = Object.entries(res);
          for (const [yearStr, alloc] of entries) {
            const y = Number(yearStr);
            if (!Number.isFinite(y)) continue;
            let cf = Math.max(0, Number(alloc?.cf ?? 0));
            let current = Math.max(0, Number(alloc?.current ?? 0));

            if (cf === 0 && current === 0) continue;

            await ensureLeaveRightsForYear(employeeId, y);
            const rights = await prisma.leaveRights.findUnique({
              where: { employeeId_year: { employeeId, year: y } },
            });
            if (!rights) continue;

            // Policy: once carry-forward is expired "today", it cannot be used even if the leave date was before expiry.
            // If reservation tries to use CF but CF is expired now, shift that amount to current.
            if (updatedLeave.kind === "ANNUAL") {
              const expiry = rights.carryForwardAnnualExpiry
                ? new Date(rights.carryForwardAnnualExpiry)
                : null;
              if (cf > 0 && (!expiry || expiry <= now)) {
                current += cf;
                cf = 0;
              }
            }
            if (updatedLeave.kind === "ANNUAL_HOLIDAY") {
              const expiry = rights.carryForwardHolidayExpiry
                ? new Date(rights.carryForwardHolidayExpiry)
                : null;
              if (cf > 0 && (!expiry || expiry <= now)) {
                current += cf;
                cf = 0;
              }
            }

            if (updatedLeave.kind === "ANNUAL") {
              if (cf > 0) {
                await prisma.leaveRights.updateMany({
                  where: { employeeId, year: y },
                  data: { carryForwardAnnual: { decrement: cf } },
                });
              }
              if (current > 0) {
                await prisma.leaveRights.updateMany({
                  where: { employeeId, year: y },
                  data: { vacationLeave: { decrement: current } },
                });
              }
            }

            if (updatedLeave.kind === "ANNUAL_HOLIDAY") {
              if (cf > 0) {
                await prisma.leaveRights.updateMany({
                  where: { employeeId, year: y },
                  data: { carryForwardHoliday: { decrement: cf } },
                });
              }
              if (current > 0) {
                await prisma.leaveRights.updateMany({
                  where: { employeeId, year: y },
                  data: { holidayLeave: { decrement: current } },
                });
              }
            }
          }

          return NextResponse.json(updatedLeave);
        }

        const start = new Date(updatedLeave.startDate);
        const end = new Date(updatedLeave.endDate);

        const segs = splitRangeByYear(start, end);
        const years = Array.from(new Set(segs.map((s) => s.year)));
        const holidaysByYear: Record<number, Set<string>> = {};
        await Promise.all(
          years.map(async (y) => {
            holidaysByYear[y] = await holidaySetForYear(y);
          })
        );

        for (const seg of segs) {
          const holidaysY = holidaysByYear[seg.year] ?? new Set<string>();
          const segSession: HalfSession = seg.includesOriginalStart
            ? (updatedLeave.session as HalfSession | null) ?? "FULL"
            : "FULL";

          const daysInYear = countBusinessDays(
            seg.start,
            seg.end,
            segSession,
            holidaysY,
            updatedLeave.user.employee.weeklyHoliday ?? undefined
          );
          if (daysInYear <= 0) continue;

          await ensureLeaveRightsForYear(employeeId, seg.year);
          const rights = await prisma.leaveRights.findUnique({
            where: { employeeId_year: { employeeId, year: seg.year } },
          });
          if (!rights) continue;

          let remain = Number(daysInYear);

          // 1) หักยอดยกก่อน โดยอิง "วันที่ลา" (segment.start) ไม่ใช่วันที่อนุมัติ
          if (
            updatedLeave.kind === "ANNUAL" &&
            rights.carryForwardAnnual > 0 &&
            rights.carryForwardAnnualExpiry &&
            new Date(rights.carryForwardAnnualExpiry) > now &&
            seg.start < new Date(rights.carryForwardAnnualExpiry)
          ) {
            const useCF = Math.min(remain, Number(rights.carryForwardAnnual));
            if (useCF > 0) {
              await prisma.leaveRights.updateMany({
                where: { employeeId, year: seg.year },
                data: { carryForwardAnnual: { decrement: useCF } },
              });
              remain -= useCF;
            }
          }
          if (
            updatedLeave.kind === "ANNUAL_HOLIDAY" &&
            rights.carryForwardHoliday > 0 &&
            rights.carryForwardHolidayExpiry &&
            new Date(rights.carryForwardHolidayExpiry) > now &&
            seg.start < new Date(rights.carryForwardHolidayExpiry)
          ) {
            const useCF = Math.min(remain, Number(rights.carryForwardHoliday));
            if (useCF > 0) {
              await prisma.leaveRights.updateMany({
                where: { employeeId, year: seg.year },
                data: { carryForwardHoliday: { decrement: useCF } },
              });
              remain -= useCF;
            }
          }

          // 2) หักสิทธิ์ปีนั้น ๆ
          if (remain > 0) {
            if (updatedLeave.kind === "ANNUAL" && rights.vacationLeave > 0) {
              const useCurrent = Math.min(remain, Number(rights.vacationLeave));
              if (useCurrent > 0) {
                await prisma.leaveRights.updateMany({
                  where: { employeeId, year: seg.year },
                  data: { vacationLeave: { decrement: useCurrent } },
                });
                remain -= useCurrent;
              }
            }
            if (
              updatedLeave.kind === "ANNUAL_HOLIDAY" &&
              rights.holidayLeave > 0
            ) {
              const useCurrent = Math.min(remain, Number(rights.holidayLeave));
              if (useCurrent > 0) {
                await prisma.leaveRights.updateMany({
                  where: { employeeId, year: seg.year },
                  data: { holidayLeave: { decrement: useCurrent } },
                });
                remain -= useCurrent;
              }
            }
          }
        }
      } else {
        console.error("Employee data is null for user:", updatedLeave.user.id);
      }
    }

    return NextResponse.json(updatedLeave);
  } catch (error) {
    console.error("Error updating leave:", error);
    return NextResponse.json(
      { error: "failed to update leave" },
      { status: 500 }
    );
  }
}
