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

    // ปีปัจจุบัน (หรือจะรับจาก query ก็ได้)
    const year = new Date().getFullYear();

    // ดึง user id
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { employee: true },
    });
    if (!user || !user.employee)
      return NextResponse.json({ error: "no user/employee" }, { status: 400 });

    // ดึง LeaveRights สำหรับปีนี้
    const rights = await prisma.leaveRights.findFirst({
      where: { employeeId: user.employee.id, year },
    });

    // รวม carry forward กับสิทธิ์ปีนี้
    const annualTotal =
      (rights?.annualLeave ?? 0) + (rights?.carryForwardAnnual ?? 0);
    const holidayTotal =
      (rights?.holidayLeave ?? 0) + (rights?.carryForwardHoliday ?? 0);

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
    ];

    // สรุปยอดใช้แต่ละประเภท
    const summary: Record<string, number> = {};
    // ดึงยอดใช้ลาแต่ละประเภท
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

    // --- ปรับ logic ให้ ANNUAL/ANNUAL_HOLIDAY แสดงเฉพาะยอดที่หักจากสิทธิ์ปีปัจจุบัน ---
    const usedAnnual = summary["ANNUAL"] ?? 0;
    let usedFromCF = Math.min(usedAnnual, rights?.carryForwardAnnual ?? 0);
    let usedFromCurrent = usedAnnual - usedFromCF;
    let remainCarryForwardAnnual =
      (rights?.carryForwardAnnual ?? 0) - usedFromCF;
    let remainVacationLeave = (rights?.vacationLeave ?? 0) - usedFromCurrent;

    // ให้ ANNUAL แสดงเฉพาะยอดที่หักจาก vacationLeave จริง
    summary["ANNUAL"] = usedFromCurrent > 0 ? usedFromCurrent : 0;

    const usedHoliday = summary["ANNUAL_HOLIDAY"] ?? 0;
    let usedHolidayFromCF = Math.min(
      usedHoliday,
      rights?.carryForwardHoliday ?? 0
    );
    let usedHolidayFromCurrent = usedHoliday - usedHolidayFromCF;
    let remainCarryForwardHoliday =
      (rights?.carryForwardHoliday ?? 0) - usedHolidayFromCF;
    let remainHolidayLeave =
      (rights?.holidayLeave ?? 0) - usedHolidayFromCurrent;

    // ให้ ANNUAL_HOLIDAY แสดงเฉพาะยอดที่หักจาก holidayLeave จริง
    summary["ANNUAL_HOLIDAY"] =
      usedHolidayFromCurrent > 0 ? usedHolidayFromCurrent : 0;

    // เพิ่มข้อมูล carry forward และสิทธิ์รวมใน response
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
        totalRemainAnnual:
          remainCarryForwardAnnual > 0
            ? remainCarryForwardAnnual
            : remainVacationLeave,
        totalRemainHoliday:
          remainCarryForwardHoliday > 0
            ? remainCarryForwardHoliday
            : remainHolidayLeave,
      },
    });
  } catch (error) {
    console.error("GET /api/leaves/summary error:", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
