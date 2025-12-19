import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const now = new Date();

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

    // ดึง LeaveRights สำหรับปีนี้
    const rights = await prisma.leaveRights.findFirst({
      where: { employeeId: user.employee.id, year },
    });

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
    const annualTotal = (rights?.annualLeave ?? 0) + carryAllowedAnnual;
    const holidayTotal = (rights?.holidayLeave ?? 0) + carryAllowedHoliday;

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

    // ดึงยอดใช้ลาแต่ละประเภท (รวมทุก kind)
    const aggAll = await prisma.leave.findMany({
      where: {
        userId: user.id,
        status: { in: ["APPROVED", "PENDING"] },
        startDate: {
          gte: new Date(`${year}-01-01`),
          lt: new Date(`${year + 1}-01-01`),
        },
      },
      select: {
        kind: true,
        requestedDays: true,
      },
    });

    // รวมยอดใช้แต่ละประเภท
    for (const kind of kinds) {
      summary[kind] = aggAll
        .filter((l) => l.kind === kind)
        .reduce((sum, l) => sum + Number(l.requestedDays ?? 0), 0);
    }

    // ===== FIX: ANNUAL คำนวณแบบ per-leave ตามวันที่ลา (กัน re-allocation เมื่อหมดอายุ) =====
    let usedAnnualFromCF = 0;
    let usedAnnualFromCurrent = 0;

    // ใช้ "ยอดยกทั้งหมด" เพื่อจัดสรรย้อนหลัง
    let annualCfRemain = cfAnnualTotal;
    let annualCurrentRemain = rights?.vacationLeave ?? 0;

    const sortedAnnualLeaves = await prisma.leave.findMany({
      where: {
        userId: user.id,
        kind: "ANNUAL",
        status: { in: ["APPROVED", "PENDING"] },
        startDate: {
          gte: new Date(`${year}-01-01`),
          lt: new Date(`${year + 1}-01-01`),
        },
      },
      select: {
        requestedDays: true,
        startDate: true,
      },
      orderBy: { startDate: "asc" },
    });

    for (const leave of sortedAnnualLeaves) {
      const leaveDays = Number(leave.requestedDays ?? 0);
      const leaveDate = new Date(leave.startDate);

      // ใช้ยอดยกได้เฉพาะ "วันที่ลา" < "วันหมดอายุ"
      if (annualCfRemain > 0 && cfAnnualExpiry && leaveDate < cfAnnualExpiry) {
        const useCF = Math.min(annualCfRemain, leaveDays);
        usedAnnualFromCF += useCF;
        annualCfRemain -= useCF;

        const spill = leaveDays - useCF;
        if (spill > 0) {
          usedAnnualFromCurrent += spill;
          annualCurrentRemain -= spill;
        }
      } else {
        usedAnnualFromCurrent += leaveDays;
        annualCurrentRemain -= leaveDays;
      }
    }

    // ถ้าวันนี้หมดอายุแล้ว แสดงยอดยกคงเหลือเป็น 0 (แต่ไม่ย้ายไปหักปีนี้)
    const remainCarryForwardAnnual = cfAnnualActiveNow ? annualCfRemain : 0;
    const remainVacationLeave = annualCurrentRemain;

    // ให้ ANNUAL แสดงเฉพาะยอดที่หักจาก vacationLeave (สิทธิ์ปีนี้) จริง
    summary["ANNUAL"] = usedAnnualFromCurrent > 0 ? usedAnnualFromCurrent : 0;

    // ===== FIX: ANNUAL_HOLIDAY ทำแบบเดียวกัน (ป้องกัน bug แบบเดียวกัน) =====
    let usedHolidayFromCF = 0;
    let usedHolidayFromCurrent = 0;

    let holidayCfRemain = cfHolidayTotal;
    let holidayCurrentRemain = rights?.holidayLeave ?? 0;

    const sortedHolidayLeaves = await prisma.leave.findMany({
      where: {
        userId: user.id,
        kind: "ANNUAL_HOLIDAY",
        status: { in: ["APPROVED", "PENDING"] },
        startDate: {
          gte: new Date(`${year}-01-01`),
          lt: new Date(`${year + 1}-01-01`),
        },
      },
      select: {
        requestedDays: true,
        startDate: true,
      },
      orderBy: { startDate: "asc" },
    });

    for (const leave of sortedHolidayLeaves) {
      const leaveDays = Number(leave.requestedDays ?? 0);
      const leaveDate = new Date(leave.startDate);

      if (holidayCfRemain > 0 && cfHolidayExpiry && leaveDate < cfHolidayExpiry) {
        const useCF = Math.min(holidayCfRemain, leaveDays);
        usedHolidayFromCF += useCF;
        holidayCfRemain -= useCF;

        const spill = leaveDays - useCF;
        if (spill > 0) {
          usedHolidayFromCurrent += spill;
          holidayCurrentRemain -= spill;
        }
      } else {
        usedHolidayFromCurrent += leaveDays;
        holidayCurrentRemain -= leaveDays;
      }
    }

    const remainCarryForwardHoliday = cfHolidayActiveNow ? holidayCfRemain : 0;
    const remainHolidayLeave = holidayCurrentRemain;

    summary["ANNUAL_HOLIDAY"] =
      usedHolidayFromCurrent > 0 ? usedHolidayFromCurrent : 0;

    // totals คงเหลือ = (ยอดยกที่ยังใช้ได้วันนี้) + (สิทธิ์ปีนี้ที่เหลือ)
    const totalRemainAnnual = remainCarryForwardAnnual + remainVacationLeave;
    const totalRemainHoliday = remainCarryForwardHoliday + remainHolidayLeave;

    return NextResponse.json({
      ok: true,
      data: {
        ...summary,
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
      },
    });
  } catch (error) {
    console.error("GET /api/leaves/summary error:", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}