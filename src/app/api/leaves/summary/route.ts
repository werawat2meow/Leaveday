import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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
    if (!user || !user.employee) return NextResponse.json({ error: "no user/employee" }, { status: 400 });

    // ดึง LeaveRights สำหรับปีนี้
    const rights = await prisma.leaveRights.findFirst({
      where: { employeeId: user.employee.id, year },
    });

    // รวม carry forward กับสิทธิ์ปีนี้
    const annualTotal = (rights?.annualLeave ?? 0) + (rights?.carryForwardAnnual ?? 0);
    const holidayTotal = (rights?.holidayLeave ?? 0) + (rights?.carryForwardHoliday ?? 0);

    // ประเภทการลาทั้งหมด
    const kinds = [
      "ANNUAL", "BUSINESS", "SICK", "BIRTHDAY", "ORDAIN", "MATERNITY", "UNPAID", "ANNUAL_HOLIDAY"
    ];

    // สรุปยอดใช้แต่ละประเภท
    const summary: Record<string, number> = {};
    for (const kind of kinds) {
      const agg = await prisma.leave.aggregate({
        _sum: { requestedDays: true },
        where: {
          userId: user.id,
          kind: kind as any,
          status: { in: ["APPROVED", "PENDING"] }, // รวมรออนุมัติด้วย
          startDate: { gte: new Date(`${year}-01-01`), lt: new Date(`${year+1}-01-01`) }
        }
      });
      summary[kind] = Number(agg._sum?.requestedDays ?? 0);
    }

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
      }
    });
  } catch (error) {
    console.error("GET /api/leaves/summary error:", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
