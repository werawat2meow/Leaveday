import { authOptions } from "@/lib/auth";
import { ensureLeaveRightsForYear } from "@/lib/leave-rights-rollover";
import { findLeaveBlackoutConflict } from "@/lib/leave-blackout";
import { countBusinessDays, normalizeSession } from "@/lib/leave-utils";
import { computeAnnualUnlockDate, dayBeforeUTC } from "@/lib/annual-unlock";
import {
  getActiveAnnualCarryForwardBuckets,
  reserveAnnualCarryForwardFromPool,
  sumUsableAnnualCarryForward,
  takeAnnualCarryForwardDays,
} from "@/lib/annual-carry-forward-store";
import {
  countBusinessDaysByYear,
  splitRangeByYear,
} from "@/lib/leave-year-split";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

type HalfSession = "FULL" | "AM" | "PM";

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

function getReservationForYear(
  reservation: unknown,
  year: number
): { cf: number; current: number } | null {
  if (!reservation || typeof reservation !== "object") return null;
  const anyRes = reservation as Record<string, any>;
  const v = anyRes[String(year)];
  if (!v || typeof v !== "object") return null;
  const cf = Math.max(0, Number(v.cf ?? 0));
  const current = Math.max(0, Number(v.current ?? 0));
  if (!Number.isFinite(cf) || !Number.isFinite(current)) return null;
  return { cf, current };
}

function minDate(a: Date, b: Date) {
  return a.getTime() <= b.getTime() ? a : b;
}

function maxDate(a: Date, b: Date) {
  return a.getTime() >= b.getTime() ? a : b;
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
      if (!user.employee.startDate) {
        return NextResponse.json(
          { error: "ไม่พบวันเริ่มงาน (startDate)" },
          { status: 400 }
        );
      }
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const sNorm = normalizeSession(sessionLabel);

    // Annual eligibility must be evaluated against the leave start date (not server 'now').
    if (kind === "ANNUAL") {
      const empStart = new Date(user.employee.startDate as any);
      const firstUnlock = computeAnnualUnlockDate(
        empStart,
        empStart.getUTCFullYear() + 1
      );
      if (!firstUnlock || start < firstUnlock) {
        return NextResponse.json(
          {
            error:
              "อายุงานยังไม่ครบ 1 ปี (อิงจากวันเริ่มลา) จึงยังไม่สามารถลาพักร้อนได้",
          },
          { status: 400 }
        );
      }
    }

    // ปิดรับการลา (Blackout) ตามหน่วยงานและประเภทการลา
    const blackout = await findLeaveBlackoutConflict({
      employeeId: user.employee.id,
      kind,
      start,
      end,
    });
    if (blackout) {
      const msg = blackout.reason
        ? `ช่วงวันที่เลือกถูกปิดรับการลา (${blackout.reason})`
        : "ช่วงวันที่เลือกถูกปิดรับการลา";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

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
      const todayKey = now.toISOString().slice(0, 10);

      // Annual carry-forward pool (multi-bucket). Mutated as we reserve across years.
      const annualCfPool =
        kind === "ANNUAL"
          ? await getActiveAnnualCarryForwardBuckets({
              employeeId: user.employee.id,
              now,
            })
          : null;

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
            reservation: true,
          },
          orderBy: { startDate: "asc" },
        });

        // ✅ Annual/AnnualHoliday: balances are already decremented on APPROVED in LeaveRights.
        // So we only need to reserve PENDING against the current balances.
        if (kind === "ANNUAL") {
          const currentApprovedRemain = Number(rights?.vacationLeave ?? 0);
          let currentRemain = currentApprovedRemain;

          const seg = segments.find((s) => s.year === y) || null;
          const segStartInYear = seg?.start ?? start;
          const segEndInYear = seg?.end ?? end;

          const empStart = user.employee.startDate
            ? new Date(user.employee.startDate)
            : null;
          // Policy: Rights of year y become usable starting anniversary in (y + 1).
          const unlock = empStart ? computeAnnualUnlockDate(empStart, y + 1) : null;

          // Reserve against existing PENDING leaves in this year.
          for (const l of leavesInYear) {
            if (l.status !== "PENDING") continue;

            const leaveDate = new Date(l.startDate);
            const existingRes = getReservationForYear((l as any).reservation, y);

            if (existingRes) {
              const wantCf = Math.max(0, Number(existingRes.cf || 0));
              const wantCurrent = Math.max(0, Number(existingRes.current || 0));

              const cfUsed = annualCfPool
                ? reserveAnnualCarryForwardFromPool({
                    pool: annualCfPool,
                    employeeStartDate: empStart,
                    now,
                    leaveStart: leaveDate,
                    days: wantCf,
                  }).used
                : 0;

              const shiftToCurrent = Math.max(0, wantCf - cfUsed);
              currentRemain -= wantCurrent + shiftToCurrent;
              continue;
            }

            const d = overlapDaysInYear({
              leaveStart: new Date(l.startDate),
              leaveEnd: new Date(l.endDate),
              leaveSession: (l.session as HalfSession | null) ?? null,
              year: y,
              holidays: holidaysY,
              weeklyHoliday: user.employee.weeklyHoliday,
            });
            if (d <= 0) continue;

            const cfUsed = annualCfPool
              ? reserveAnnualCarryForwardFromPool({
                  pool: annualCfPool,
                  employeeStartDate: empStart,
                  now,
                  leaveStart: leaveDate,
                  days: d,
                }).used
              : 0;

            currentRemain -= Math.max(0, d - cfUsed);
          }

          // Enforce anniversary-based unlock: before unlock date, current-year entitlement cannot be used.
          let reqPre = 0;
          let reqPost = Number(reqY || 0);

          if (unlock && seg) {
            reqPre = 0;
            reqPost = 0;

            if (segStartInYear < unlock) {
              const preStart = segStartInYear;
              const preEnd = minDate(segEndInYear, dayBeforeUTC(unlock));
              if (preEnd >= preStart) {
                const preSession: HalfSession =
                  seg.includesOriginalStart && start < unlock ? sNorm : "FULL";
                reqPre = countBusinessDays(
                  preStart,
                  preEnd,
                  preSession,
                  holidaysY,
                  user.employee.weeklyHoliday ?? undefined
                );
              }
            }

            if (segEndInYear >= unlock) {
              const postStart = maxDate(segStartInYear, unlock);
              const postEnd = segEndInYear;
              if (postEnd >= postStart) {
                const postSession: HalfSession =
                  seg.includesOriginalStart && start >= unlock ? sNorm : "FULL";
                reqPost = countBusinessDays(
                  postStart,
                  postEnd,
                  postSession,
                  holidaysY,
                  user.employee.weeklyHoliday ?? undefined
                );
              }
            }
          }

          const reqTotal = Math.max(0, Number(reqPre || 0)) + Math.max(0, Number(reqPost || 0));
          if (reqTotal <= 0) continue;

          const cfUsableNowForSegStart = annualCfPool
            ? sumUsableAnnualCarryForward({
                buckets: annualCfPool,
                employeeStartDate: empStart,
                now,
                leaveStart: segStartInYear,
              })
            : 0;

          if (reqPre > 0) {
            if (reqPre > Math.max(0, cfUsableNowForSegStart)) {
              return NextResponse.json(
                {
                  error: `ยอดยกพักร้อนไม่พอก่อนถึงวันครบรอบ (ปี ${y}) ต้องใช้ ${reqPre} วัน แต่เหลือ ${Math.max(
                    0,
                    cfUsableNowForSegStart
                  )} วัน`,
                },
                { status: 400 }
              );
            }
          }

          const wantCfNew = Math.min(reqTotal, Math.max(0, cfUsableNowForSegStart));
          const cfUsedNew = annualCfPool
            ? reserveAnnualCarryForwardFromPool({
                pool: annualCfPool,
                employeeStartDate: empStart,
                now,
                leaveStart: segStartInYear,
                days: wantCfNew,
              }).used
            : 0;

          if (reqPre > 0 && cfUsedNew + 1e-9 < reqPre) {
            return NextResponse.json(
              { error: `ยอดยกพักร้อนไม่พอก่อนถึงวันครบรอบ (ปี ${y})` },
              { status: 400 }
            );
          }

          const useCurrentNew = Math.max(0, reqTotal - cfUsedNew);
          if (useCurrentNew > Math.max(0, currentRemain)) {
            return NextResponse.json(
              {
                error: `สิทธิ์พักร้อนคงเหลือไม่พอ (ปี ${y} เหลือ ${Math.max(
                  0,
                  currentRemain
                )} วัน)`,
              },
              { status: 400 }
            );
          }

          currentRemain -= useCurrentNew;

          reservation[String(y)] = {
            cf: Number(cfUsedNew),
            current: Number(useCurrentNew),
          };
        } else if (kind === "ANNUAL_HOLIDAY") {
          const cfTotal = Number(rights?.carryForwardHoliday ?? 0);
          const cfExpiry = rights?.carryForwardHolidayExpiry
            ? new Date(rights.carryForwardHolidayExpiry)
            : null;
          const cfActiveNow = !!(cfTotal > 0 && cfExpiry && cfExpiry > now);

          let cfRemain = cfActiveNow ? cfTotal : 0;
          const currentApprovedRemain = Number(rights?.holidayLeave ?? 0);
          let currentRemain = currentApprovedRemain;

          const segStartInYear = segments.find((s) => s.year === y)?.start ?? start;

          for (const l of leavesInYear) {
            if (l.status !== "PENDING") continue;

            const existingRes = getReservationForYear((l as any).reservation, y);
            if (existingRes) {
              let exCf = Math.max(0, Number(existingRes.cf || 0));
              let exCurrent = Math.max(0, Number(existingRes.current || 0));

              // If CF is not usable now, shift reserved CF to current (matches approval policy).
              if (!cfActiveNow && exCf > 0) {
                exCurrent += exCf;
                exCf = 0;
              }

              cfRemain -= exCf;
              currentRemain -= exCurrent;
              continue;
            }

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
            if (cfRemain > 0 && cfExpiry && cfActiveNow && leaveDate < cfExpiry) {
              const useCF = Math.min(cfRemain, remain);
              cfRemain -= useCF;
              remain -= useCF;
            }
            if (remain > 0) currentRemain -= remain;
          }

          // ✅ NEW: Annual Holiday (ปีนี้) ใช้ได้เฉพาะ "วันหยุดที่ประกาศและผ่านมาแล้ว" (ไม่ให้ยืมอนาคต)
          if (kind === "ANNUAL_HOLIDAY") {
            const declared = holidaysY.size;
            const passed = Array.from(holidaysY).filter((d) => d <= todayKey).length;

            const accrued = Math.min(declared, passed);

            // สมมติสิทธิ์ holidayLeave ปีนั้นตั้งต้นเท่ากับจำนวนวันหยุดที่ประกาศ (declared)
            const usedApprovedFromCurrent = Math.max(0, declared - Math.max(0, currentApprovedRemain));
            const usedPendingFromCurrent = Math.max(0, Math.max(0, currentApprovedRemain) - Math.max(0, currentRemain));
            const usedFromCurrentInclPending = usedApprovedFromCurrent + usedPendingFromCurrent;

            const currentAccruedRemainRaw = Math.max(0, accrued - usedFromCurrentInclPending);
            const currentAccruedRemain = Math.min(Math.max(0, currentRemain), currentAccruedRemainRaw);
            const availableNow = currentAccruedRemain + (cfActiveNow ? Math.max(0, cfRemain) : 0);

            if (reqY > availableNow) {
              return NextResponse.json(
                {
                  error: `Annual Holiday ใช้ได้ไม่พอ ณ ตอนนี้ (ปี ${y} ใช้ได้ ${availableNow} วัน: ยอดยก ${cfActiveNow ? Math.max(0, cfRemain) : 0} + ปีนี้ที่ปลดล็อคแล้วคงเหลือ ${currentAccruedRemain})`,
                },
                { status: 400 }
              );
            }

            // จองสิทธิ์สำหรับคำขอใหม่นี้ (ไม่เอาไปหักจริงจนกว่าจะ APPROVED)
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
                  error: "Annual Holiday ปีนี้ยังปลดล็อคไม่พอ (ไม่สามารถใช้สิทธิ์อนาคตได้)",
                },
                { status: 400 }
              );
            }

            reservation[String(y)] = {
              cf: Number(useCfNew),
              current: Number(remainNew),
            };
          }
        } else {
          // For non-annual kinds: LeaveRights.<field> is already decremented on APPROVED.
          // So we only reserve PENDING leaves against the current remaining balance.
          const currentApprovedRemain = (() => {
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

          let usedPending = 0;
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
            usedPending += d;
          }

          const available = currentApprovedRemain - usedPending;
          if (reqY > available) {
            return NextResponse.json(
              { error: `สิทธิ์คงเหลือไม่พอ (ปี ${y} เหลือ ${available} วัน)` },
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
    const leaveIntId = parseInt(leaveId);
    const prev = await prisma.leave.findUnique({
      where: { id: leaveIntId },
      select: { id: true, status: true, kind: true, startDate: true, endDate: true, session: true, userId: true },
    });
    if (!prev) {
      return NextResponse.json({ error: "leave not found" }, { status: 404 });
    }

    // Guard (pre-update): prevent approving ANNUAL that uses current-year entitlement
    // before the employee's anniversary unlock date within that year.
    if (status === "APPROVED" && prev.kind === "ANNUAL" && prev.status !== "APPROVED") {
      const leaveForGuard = await prisma.leave.findUnique({
        where: { id: leaveIntId },
        select: {
          kind: true,
          startDate: true,
          endDate: true,
          session: true,
          reservation: true,
          user: { select: { employee: { select: { startDate: true, weeklyHoliday: true } } } },
        },
      });

      const employeeStartDate = leaveForGuard?.user?.employee?.startDate
        ? new Date(leaveForGuard.user.employee.startDate)
        : null;
      const reservation = leaveForGuard?.reservation as
        | Record<string, { cf?: number; current?: number }>
        | null
        | undefined;

      if (employeeStartDate && reservation && typeof reservation === "object") {
        const leaveStart = new Date(leaveForGuard!.startDate);
        const leaveEnd = new Date(leaveForGuard!.endDate);
        const leaveSegments = splitRangeByYear(leaveStart, leaveEnd);
        const holidayCache = new Map<number, Set<string>>();

        for (const [yearStr, alloc] of Object.entries(reservation)) {
          const y = Number(yearStr);
          if (!Number.isFinite(y)) continue;
          const current = Math.max(0, Number(alloc?.current ?? 0));
          if (current <= 0) continue;

          // Policy: Rights of year y become usable starting anniversary in (y + 1).
          const unlock = computeAnnualUnlockDate(employeeStartDate, y + 1);
          if (!unlock) continue;

          const seg = leaveSegments.find((s) => s.year === y);
          if (!seg) continue;

          if (seg.end < unlock) {
            return NextResponse.json(
              {
                error: `พักร้อนปี ${y} ยังไม่ถึงวันปลดล็อคตามรอบอายุงาน จึงห้ามใช้สิทธิ์ปีนี้ก่อนวันครบรอบ`,
              },
              { status: 400 }
            );
          }

          const holidaysY = holidayCache.get(y) ?? (await holidaySetForYear(y));
          if (!holidayCache.has(y)) holidayCache.set(y, holidaysY);

          const postStart = maxDate(seg.start, unlock);
          const postEnd = seg.end;
          const postSession: HalfSession =
            seg.includesOriginalStart && leaveStart >= unlock
              ? ((leaveForGuard!.session as HalfSession | null) ?? "FULL")
              : "FULL";
          const postDays = countBusinessDays(
            postStart,
            postEnd,
            postSession,
            holidaysY,
            leaveForGuard?.user?.employee?.weeklyHoliday ?? undefined
          );

          if (current > Math.max(0, postDays) + 1e-9) {
            return NextResponse.json(
              {
                error: `พักร้อนปี ${y} ยังไม่ปลดล็อคครบตามวันครบรอบ: ขอใช้สิทธิ์ปีนี้ ${current} วัน แต่ช่วงหลังครบรอบมีได้แค่ ${postDays} วัน`,
              },
              { status: 400 }
            );
          }
        }
      }
    }

    const updatedLeave = await prisma.leave.update({
      where: { id: leaveIntId },
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

    // Only decrement rights when transitioning to APPROVED (idempotent guard)
    if (status === "APPROVED" && prev.status !== "APPROVED") {
      if (updatedLeave.user.employee) {
        const employeeId = updatedLeave.user.employee.id;
        const now = new Date();

        const quotaFieldForKind = (kind: string) => {
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

        if (["ANNUAL", "ANNUAL_HOLIDAY"].includes(updatedLeave.kind)) {

        // ถ้ามี reservation ให้หักตามที่จองไว้ (ไม่คำนวณใหม่)
        const res = (updatedLeave as any).reservation as
          | Record<string, { cf?: number; current?: number }>
          | null
          | undefined;
        if (res && typeof res === "object") {
          const leaveStart = new Date(updatedLeave.startDate);
          const leaveEnd = new Date(updatedLeave.endDate);
          const leaveSegments = splitRangeByYear(leaveStart, leaveEnd);

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

            const segStartForYear =
              leaveSegments.find((s) => s.year === y)?.start ?? leaveStart;

            // Policy: once carry-forward is expired "today", it cannot be used.
            // For ANNUAL we use multi-bucket carry-forward (FIFO by expiry).
            if (updatedLeave.kind === "ANNUAL" && cf > 0) {
              const taken = await takeAnnualCarryForwardDays({
                employeeId,
                employeeStartDate: updatedLeave.user.employee.startDate
                  ? new Date(updatedLeave.user.employee.startDate as any)
                  : null,
                now,
                leaveStart: segStartForYear,
                days: cf,
              });
              const shiftToCurrent = Math.max(0, cf - taken.used);
              current += shiftToCurrent;
              cf = 0;
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

          const carryForwardAnnualNum = Number(rights.carryForwardAnnual ?? 0);
          const carryForwardHolidayNum = Number(rights.carryForwardHoliday ?? 0);
          const vacationLeaveNum = Number(rights.vacationLeave ?? 0);
          const holidayLeaveNum = Number(rights.holidayLeave ?? 0);

          let remain = Number(daysInYear);

          // 1) หักยอดยกก่อน โดยอิง "วันที่ลา" (segment.start) ไม่ใช่วันที่อนุมัติ
          if (updatedLeave.kind === "ANNUAL" && remain > 0) {
            const taken = await takeAnnualCarryForwardDays({
              employeeId,
              employeeStartDate: updatedLeave.user.employee.startDate
                ? new Date(updatedLeave.user.employee.startDate as any)
                : null,
              now,
              leaveStart: seg.start,
              days: remain,
            });
            remain -= Math.max(0, taken.used);
          }
          if (
            updatedLeave.kind === "ANNUAL_HOLIDAY" &&
            carryForwardHolidayNum > 0 &&
            rights.carryForwardHolidayExpiry &&
            new Date(rights.carryForwardHolidayExpiry) > now &&
            seg.start < new Date(rights.carryForwardHolidayExpiry)
          ) {
            const useCF = Math.min(remain, carryForwardHolidayNum);
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
            if (updatedLeave.kind === "ANNUAL" && vacationLeaveNum > 0) {
              const useCurrent = Math.min(remain, vacationLeaveNum);
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
              holidayLeaveNum > 0
            ) {
              const useCurrent = Math.min(remain, holidayLeaveNum);
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
          const field = quotaFieldForKind(updatedLeave.kind);
          if (field) {
            const start = new Date(updatedLeave.startDate);
            const end = new Date(updatedLeave.endDate);

            // If the leave is entirely within one year, prefer stored requestedDays
            // so UI and DB use the same number.
            if (
              start.getFullYear() === end.getFullYear() &&
              toNum((updatedLeave as any).requestedDays) > 0
            ) {
              const y = start.getFullYear();
              await ensureLeaveRightsForYear(employeeId, y);
              await prisma.leaveRights.updateMany({
                where: { employeeId, year: y },
                data: {
                  [field]: { decrement: toNum((updatedLeave as any).requestedDays) },
                } as any,
              });
              return NextResponse.json(updatedLeave);
            }

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
              await prisma.leaveRights.updateMany({
                where: { employeeId, year: seg.year },
                data: { [field]: { decrement: Number(daysInYear) } } as any,
              });
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
