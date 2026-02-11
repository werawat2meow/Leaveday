import { authOptions } from "@/lib/auth";
import { ensureLeaveRightsForYear } from "@/lib/leave-rights-rollover";
import { countBusinessDays } from "@/lib/leave-utils";
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
  return new Date(`${y}-12-31T23:59:59.999Z`);
}

function getReservationForYear(
  reservation: unknown,
  year: number
): { cf: number; current: number } | null {
  if (!reservation || typeof reservation !== "object") return null;
  const key = String(year);
  const anyRes = reservation as any;
  const v = anyRes[key];
  if (!v || typeof v !== "object") return null;
  const cf = Number(v.cf ?? 0);
  const current = Number(v.current ?? 0);
  return {
    cf: Number.isFinite(cf) ? cf : 0,
    current: Number.isFinite(current) ? current : 0,
  };
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

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);

    // ปีปัจจุบัน (หรือจะรับจาก query ก็ได้)
    const year = new Date().getFullYear();

    // ดึง user id
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { employee: true },
    });
    if (!user || !user.employee) {
      return NextResponse.json({ error: "no user/employee" }, { status: 400 });
    }

    const weeklyHoliday = user.employee.weeklyHoliday;

    // ดึง LeaveRights สำหรับปีนี้
    await ensureLeaveRightsForYear(user.employee.id, year);
    const rights = await prisma.leaveRights.findUnique({
      where: { employeeId_year: { employeeId: user.employee.id, year } },
    });

    const templateKey = user.employee.levelP || user.employee.prefix || null;
    const template = templateKey
      ? await prisma.leaveRightsTemplate.findFirst({
          where: { prefix: templateKey },
        })
      : null;

    const holidays = await holidaySetForYear(year);

    // ===== FIX: แยก "ยอดยกทั้งหมด" ออกจาก "ยอดยกที่ยังใช้ได้วันนี้" =====
    const cfAnnualTotal = Number(rights?.carryForwardAnnual ?? 0);
    const cfAnnualExpiry = rights?.carryForwardAnnualExpiry
      ? new Date(rights.carryForwardAnnualExpiry)
      : null;
    const cfAnnualActiveNow = !!(
      cfAnnualTotal > 0 &&
      cfAnnualExpiry &&
      cfAnnualExpiry > now
    );
    const carryAllowedAnnual = cfAnnualActiveNow ? cfAnnualTotal : 0;

    const cfHolidayTotal = Number(rights?.carryForwardHoliday ?? 0);
    const cfHolidayExpiry = rights?.carryForwardHolidayExpiry
      ? new Date(rights.carryForwardHolidayExpiry)
      : null;
    const cfHolidayActiveNow = !!(
      cfHolidayTotal > 0 &&
      cfHolidayExpiry &&
      cfHolidayExpiry > now
    );
    const carryAllowedHoliday = cfHolidayActiveNow ? cfHolidayTotal : 0;

    // totals = สิทธิ์ที่ "ใช้ได้ตอนนี้" (รวมยอดยกเฉพาะถ้ายังไม่หมดอายุ)
    const annualTotal =
      Number(template?.vacationLeaveDays ?? rights?.annualLeave ?? 0) +
      carryAllowedAnnual;
    const holidayTotal =
      Number(template?.holidayLeaveDays ?? 0) + carryAllowedHoliday;

    // ประเภทการลาทั้งหมด
    const kinds = [
      "ANNUAL",
      "BUSINESS",
      "SICK",
      "BIRTHDAY",
      "ORDAIN",
      "MATERNITY",
      "UNPAID",
      "ANNUAL_HOLIDAY",
    ] as const;

    // สรุปยอดใช้แต่ละประเภท
    const summary: Record<string, number> = {};

    // ดึงใบลาที่ทับปีนี้ (รองรับลาคร่อมปี)
    const overlapLeaves = await prisma.leave.findMany({
      where: {
        userId: user.id,
        status: { in: ["APPROVED", "PENDING"] },
        AND: [
          { startDate: { lte: yearEnd(year) } },
          { endDate: { gte: yearStart(year) } },
        ],
      },
      select: {
        id: true,
        kind: true,
        startDate: true,
        endDate: true,
        session: true,
        status: true,
        requestedDays: true,
        reservation: true,
      },
      orderBy: { startDate: "asc" },
    });

    const daysInThisYear = (l: (typeof overlapLeaves)[number]) => {
      const s = new Date(l.startDate);
      const e = new Date(l.endDate);
      // If the leave is entirely within this year, prefer stored requestedDays.
      // This matches what the user saw previously and avoids re-count edge cases.
      if (s.getFullYear() === year && e.getFullYear() === year) {
        const stored = toNum((l as any).requestedDays);
        if (stored > 0) return stored;
      }
      return overlapDaysInYear({
        leaveStart: s,
        leaveEnd: e,
        leaveSession: (l.session as HalfSession | null) ?? null,
        year,
        holidays,
        weeklyHoliday,
      });
    };

    // รวมยอดใช้แต่ละประเภท (นับเฉพาะส่วนที่อยู่ในปีนี้)
    for (const kind of kinds) summary[kind] = 0;
    for (const l of overlapLeaves) {
      const d = daysInThisYear(l);
      summary[l.kind] = (summary[l.kind] ?? 0) + d;
    }

    // ✅ แยกยอดใช้แบบ APPROVED-only และยอดที่ยัง PENDING (เพื่อให้ UI แสดงสม่ำเสมอทุกประเภท)
    const usedApprovedOnlyByKind: Record<string, number> = {};
    const usedPendingByKind: Record<string, number> = {};
    for (const kind of kinds) {
      usedApprovedOnlyByKind[kind] = 0;
      usedPendingByKind[kind] = 0;
    }
    for (const l of overlapLeaves) {
      const d = daysInThisYear(l);
      if (l.status === "APPROVED") {
        usedApprovedOnlyByKind[l.kind] = (usedApprovedOnlyByKind[l.kind] ?? 0) + d;
      }
      if (l.status === "PENDING") {
        usedPendingByKind[l.kind] = (usedPendingByKind[l.kind] ?? 0) + d;
      }
    }

    // ===== คงเหลือ: ใช้ LeaveRights เป็นฐาน (APPROVED ถูกหักไปแล้ว) แล้วกัน PENDING เพิ่มเติม =====
    // ✅ เก็บ snapshot ก่อนกัน PENDING (approved-only)
    const annualCfRemainApprovedOnly = cfAnnualActiveNow ? cfAnnualTotal : 0;
    const annualCurrentRemainApprovedOnly = Number(rights?.vacationLeave ?? 0);
    const holidayCfRemainApprovedOnly = cfHolidayActiveNow ? cfHolidayTotal : 0;
    const holidayCurrentRemainApprovedOnly = Number(rights?.holidayLeave ?? 0);

    // cfRemainForUi: ใช้คำนวณยอดยกคงเหลือที่ "ใช้ได้วันนี้" (ถ้าวันนี้หมดอายุ จะโชว์ 0)
    let annualCfRemainForUi = annualCfRemainApprovedOnly;
    let annualCurrentRemain = annualCurrentRemainApprovedOnly;
    let holidayCfRemainForUi = holidayCfRemainApprovedOnly;
    let holidayCurrentRemain = holidayCurrentRemainApprovedOnly;

    // cfPoolForReservation: ใช้ backfill reservation ของใบลาเก่าที่ไม่มี reservation
    // เพื่อไม่ให้การแก้ expiry ใน DB ทำให้ย้ายการกันสิทธิ์ย้อนหลัง
    let annualCfPoolForReservation = cfAnnualActiveNow ? cfAnnualTotal : 0;
    let holidayCfPoolForReservation = cfHolidayActiveNow ? cfHolidayTotal : 0;

    // กันยอดจาก PENDING: อ่านจาก reservation เป็นหลัก
    // ถ้าใบลาเก่ายังไม่มี reservation จะ backfill โดยใช้ยอดยกก่อน (ตรึงไว้จากครั้งแรกที่คำนวณ)
    for (const l of overlapLeaves) {
      if (l.status !== "PENDING") continue;
      if (l.kind !== "ANNUAL" && l.kind !== "ANNUAL_HOLIDAY") continue;

      const leaveDays = daysInThisYear(l);
      if (leaveDays <= 0) continue;

      const existing = getReservationForYear((l as any).reservation, year);
      if (existing) {
        if (l.kind === "ANNUAL") {
          annualCurrentRemain -= Math.max(0, existing.current);
          if (cfAnnualActiveNow)
            annualCfRemainForUi -= Math.max(0, existing.cf);
        }
        if (l.kind === "ANNUAL_HOLIDAY") {
          holidayCurrentRemain -= Math.max(0, existing.current);
          if (cfHolidayActiveNow)
            holidayCfRemainForUi -= Math.max(0, existing.cf);
        }
        continue;
      }

      // Backfill
      let remain = leaveDays;
      let useCF = 0;
      if (l.kind === "ANNUAL") {
        useCF = Math.min(Math.max(0, annualCfPoolForReservation), remain);
        annualCfPoolForReservation -= useCF;
        remain -= useCF;
        const useCurrent = remain;
        annualCurrentRemain -= useCurrent;
        if (cfAnnualActiveNow) annualCfRemainForUi -= useCF;

        await prisma.leave.update({
          where: { id: (l as any).id },
          data: {
            reservation: {
              ...((l as any).reservation &&
              typeof (l as any).reservation === "object"
                ? ((l as any).reservation as any)
                : {}),
              [String(year)]: { cf: useCF, current: useCurrent },
            } as any,
          },
        });
      }

      if (l.kind === "ANNUAL_HOLIDAY") {
        useCF = Math.min(Math.max(0, holidayCfPoolForReservation), remain);
        holidayCfPoolForReservation -= useCF;
        remain -= useCF;
        const useCurrent = remain;
        holidayCurrentRemain -= useCurrent;
        if (cfHolidayActiveNow) holidayCfRemainForUi -= useCF;

        await prisma.leave.update({
          where: { id: (l as any).id },
          data: {
            reservation: {
              ...((l as any).reservation &&
              typeof (l as any).reservation === "object"
                ? ((l as any).reservation as any)
                : {}),
              [String(year)]: { cf: useCF, current: useCurrent },
            } as any,
          },
        });
      }
    }

    // ถ้าวันนี้หมดอายุแล้ว ยอดยกที่ใช้ได้วันนี้ = 0 (แต่ยังโชว์ยอดยกทั้งหมดใน UI)
    const remainCarryForwardAnnual = cfAnnualActiveNow
      ? Math.max(0, annualCfRemainForUi)
      : 0;
    const remainVacationLeave = Math.max(0, annualCurrentRemain);
    const remainCarryForwardHoliday = cfHolidayActiveNow
      ? Math.max(0, holidayCfRemainForUi)
      : 0;
    const remainHolidayLeave = Math.max(0, holidayCurrentRemain);

    // ✅ คำนวณคงเหลือแบบ "ไม่รวม PENDING" (approved-only)
    const remainCarryForwardAnnualApprovedOnly = cfAnnualActiveNow
      ? Math.max(0, annualCfRemainApprovedOnly)
      : 0;
    const remainVacationLeaveApprovedOnly = Math.max(0, annualCurrentRemainApprovedOnly);
    const remainCarryForwardHolidayApprovedOnly = cfHolidayActiveNow
      ? Math.max(0, holidayCfRemainApprovedOnly)
      : 0;
    const remainHolidayLeaveApprovedOnly = Math.max(0, holidayCurrentRemainApprovedOnly);

    const totalRemainAnnualApprovedOnly =
      remainCarryForwardAnnualApprovedOnly + remainVacationLeaveApprovedOnly;
    const totalRemainHolidayApprovedOnly =
      remainCarryForwardHolidayApprovedOnly + remainHolidayLeaveApprovedOnly;

    // used-from-current (สำหรับหลอดด้านบน) = สิทธิ์ทั้งปี - คงเหลือ (หลังกัน PENDING)
    const entitledVacation = Number(
      template?.vacationLeaveDays ?? rights?.annualLeave ?? 0
    );
    const entitledHoliday = Number(template?.holidayLeaveDays ?? 0);
    summary["ANNUAL"] = Math.max(0, entitledVacation - remainVacationLeave);
    summary["ANNUAL_HOLIDAY"] = Math.max(
      0,
      entitledHoliday - remainHolidayLeave
    );

    // ✅ used แบบไม่รวม PENDING (approved-only)
    const usedAnnualApprovedOnly = Math.max(0, entitledVacation - remainVacationLeaveApprovedOnly);
    const usedHolidayApprovedOnly = Math.max(0, entitledHoliday - remainHolidayLeaveApprovedOnly);

    // ✅ ทำให้ annual/holiday สอดคล้องกับวิธีคำนวณเดิม (อิง LeaveRights balances)
    usedApprovedOnlyByKind["ANNUAL"] = usedAnnualApprovedOnly;
    usedApprovedOnlyByKind["ANNUAL_HOLIDAY"] = usedHolidayApprovedOnly;

    // totals คงเหลือ = (ยอดยกที่ยังใช้ได้วันนี้) + (สิทธิ์ปีนี้ที่เหลือหลังกัน PENDING)
    const totalRemainAnnual = remainCarryForwardAnnual + remainVacationLeave;
    const totalRemainHoliday = remainCarryForwardHoliday + remainHolidayLeave;

    // ✅ NEW: Holiday "ใช้ได้วันนี้" = ยอดยกที่ยังไม่หมดอายุ + สิทธิ์ปีนี้ที่ปลดล็อคตามวันหยุดที่ผ่านแล้ว
    // หมายเหตุ: ไม่เอา "วันอนาคต" มาเป็นสิทธิ์ใช้ได้ แต่ก็ไม่ถือว่าเป็น "used"
    const passedHolidayCount = Array.from(holidays).filter((d) => d <= todayKey)
      .length;
    const holidayAccruedThisYear = Math.min(entitledHoliday, passedHolidayCount);

    // used-from-current (รวม PENDING) = (used approved) + (used pending)
    const usedHolidayApprovedFromCurrent = Math.max(
      0,
      entitledHoliday - remainHolidayLeaveApprovedOnly
    );
    const usedHolidayPendingFromCurrent = Math.max(
      0,
      remainHolidayLeaveApprovedOnly - remainHolidayLeave
    );
    const usedHolidayFromCurrentInclPending =
      usedHolidayApprovedFromCurrent + usedHolidayPendingFromCurrent;

    const holidayCurrentAccruedRemain = Math.max(
      0,
      Math.min(
        remainHolidayLeave,
        holidayAccruedThisYear - usedHolidayFromCurrentInclPending
      )
    );
    const holidayAvailableNow =
      Math.max(0, remainCarryForwardHoliday) + holidayCurrentAccruedRemain;

    // approved-only variant (ไม่รวม PENDING)
    const holidayCurrentAccruedRemainApprovedOnly = Math.max(
      0,
      Math.min(
        remainHolidayLeaveApprovedOnly,
        holidayAccruedThisYear - usedHolidayApprovedFromCurrent
      )
    );
    const holidayAvailableNowApprovedOnly =
      Math.max(0, remainCarryForwardHolidayApprovedOnly) +
      holidayCurrentAccruedRemainApprovedOnly;

    // DB-backed remaining balances (LeaveRights) for quota kinds.
    // These should reflect APPROVED deductions (PENDING is tracked separately).
    const remainingByKind = {
      SICK: toNum((rights as any)?.sickLeave ?? 0),
      BUSINESS: toNum((rights as any)?.businessLeave ?? 0),
      UNPAID: toNum((rights as any)?.unpaidLeave ?? 0),
      BIRTHDAY: toNum((rights as any)?.birthdayLeave ?? 0),
      ORDAIN: toNum((rights as any)?.ordainLeave ?? 0),
      MATERNITY: toNum((rights as any)?.maternityLeave ?? 0),
    };

    return NextResponse.json({
      ok: true,
      data: {
        ...summary,
        usedApprovedOnlyByKind,
        usedPendingByKind,
        remainingByKind,
        annualTotal,
        holidayTotal,
        carryForwardAnnual: rights?.carryForwardAnnual ?? 0,
        carryForwardAnnualExpiry: rights?.carryForwardAnnualExpiry,
        carryForwardHoliday: rights?.carryForwardHoliday ?? 0,
        carryForwardHolidayExpiry: rights?.carryForwardHolidayExpiry,
        remainCarryForwardAnnual,
        remainVacationLeave,
        remainCarryForwardHoliday,
        remainHolidayLeave,
        totalRemainAnnual,
        totalRemainHoliday,

        // ✅ ฟิลด์เพิ่มสำหรับ UI (ไม่รวม PENDING)
        remainCarryForwardAnnualApprovedOnly,
        remainVacationLeaveApprovedOnly,
        remainCarryForwardHolidayApprovedOnly,
        remainHolidayLeaveApprovedOnly,
        totalRemainAnnualApprovedOnly,
        totalRemainHolidayApprovedOnly,
        usedAnnualApprovedOnly,
        usedHolidayApprovedOnly,

        // ✅ Holiday availability (accrual-based)
        passedHolidayCount,
        holidayAccruedThisYear,
        holidayCurrentAccruedRemain,
        holidayAvailableNow,
        holidayCurrentAccruedRemainApprovedOnly,
        holidayAvailableNowApprovedOnly,
      },
    });
  } catch (error) {
    console.error("GET /api/leaves/summary error:", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
