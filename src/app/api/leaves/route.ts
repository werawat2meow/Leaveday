import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { countBusinessDays, normalizeSession } from "@/lib/leave-utils";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // รับ department จาก query param (เช่น /api/leaves?department=xxx)
    const { searchParams } = new URL(req.url);
    const department = searchParams.get('department');

    let whereCondition: any = {};
    if (department) {
      // ถ้ามี department param ให้ filter leave ของทุกคนในแผนกนั้น
      whereCondition.user = {
        employee: {
          department: department
        }
      };
    } else {
      // ถ้าไม่มี department param ให้ filter leave ของ user ที่ login อยู่
      whereCondition.user = { email: session.user.email };
    }

    const leaves = await prisma.leave.findMany({
      where: whereCondition,
      orderBy: { createdAt: 'desc' }
    });

    // ดึงข้อมูลผู้อนุมัติจาก Approver table
    const approverIds = leaves
      .map(leave => leave.approverId)
      .filter((id): id is number => id !== null);

    const approvers = await prisma.approver.findMany({
      where: { id: { in: approverIds } },
      select: { 
        id: true, 
        prefix: true, 
        firstNameTh: true, 
        lastNameTh: true 
      }
    });

    // สร้าง Map สำหรับ lookup
    const approverMap = new Map(
      approvers.map(a => [
        a.id, 
        `${a.prefix ?? ""}${a.firstNameTh} ${a.lastNameTh}`
      ])
    );

    // Format ข้อมูล
    const formattedLeaves = leaves.map(leave => ({
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
          ? (approverMap.get(leave.approverId) || 'ยังไม่ระบุผู้อนุมัติ') 
          : 'ยังไม่ระบุผู้อนุมัติ'
      }
    }));

    return NextResponse.json({ 
      ok: true, 
      data: formattedLeaves 
    });
  } catch (error) {
    console.error("GET /api/leaves error:", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { kind, startDate, endDate, sessionLabel, reason, contact, handoverTo, attachmentUrl, approverId } = await req.json();

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { employee: true },
  });
  if (!user?.employee) return NextResponse.json({ error: "no employee profile" }, { status: 400 });

  if (kind === "ANNUAL") {
    const startDate = user.employee.startDate;
    if (!startDate || (new Date().getTime() - new Date(startDate).getTime()) < 365 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: "อายุงานยังไม่ครบ 1 ปี จึงยังไม่สามารถลาพักร้อนได้" }, { status: 400 });
    }
  }

  const start = new Date(startDate);
  const end   = new Date(endDate);
  const sNorm = normalizeSession(sessionLabel);

  const year = start.getFullYear();
  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: new Date(`${year}-01-01`), lt: new Date(`${year+1}-01-01`) } },
    select: { date: true },
  });
  const setH = new Set(holidays.map(h => h.date.toISOString().slice(0,10)));
  const requestedDays = countBusinessDays(start, end, sNorm, setH, user.employee.weeklyHoliday ?? undefined);
  if (requestedDays <= 0) return NextResponse.json({ error: "ช่วงวันไม่ใช่วันทำการ" }, { status: 400 });

  // กันซ้อน
  const overlap = await prisma.leave.findFirst({
    where: {
      userId: user.id,
      status: { in: ["PENDING","APPROVED"] },
      AND: [{ startDate: { lte: end } }, { endDate: { gte: start } }],
    },
  });
  if (overlap) return NextResponse.json({ error: "วันที่ลาซ้อนคำขอเดิม" }, { status: 400 });

  // เช็คสิทธิ์จาก Employee ของปีนี้ (ชนิดที่ตัดสิทธิ์เท่านั้น)
  const rights = await prisma.leaveRights.findFirst({
    where: { employeeId: user.employee.id, year },
  });

  const entitled = (() => {
    switch (kind as string) {
      case "ANNUAL": return (rights?.vacationLeave ?? rights?.annualLeave ?? 0) + (rights?.carryForwardAnnual ?? 0);
      case "BUSINESS": return rights?.businessLeave ?? 0;
      case "SICK": return rights?.sickLeave ?? 0;
      case "BIRTHDAY": return rights?.birthdayLeave ?? 0;
      case "ORDAIN": return rights?.ordainLeave ?? 0;
      case "MATERNITY": return rights?.maternityLeave ?? 0;
      case "UNPAID": return rights?.unpaidLeave ?? 0;
      case "ANNUAL_HOLIDAY": return (rights?.holidayLeave ?? 0) + (rights?.carryForwardHoliday ?? 0);
      default: return 0;
    }
  })();
  const isQuotaKind = ["ANNUAL","BUSINESS","SICK","BIRTHDAY","ORDAIN","MATERNITY","UNPAID","ANNUAL_HOLIDAY"].includes(kind);
  if (isQuotaKind) {
    const [A, P] = await Promise.all([
      prisma.leave.aggregate({ _sum: { requestedDays: true }, where: { userId: user.id, kind, status: "APPROVED", startDate: { gte: new Date(`${year}-01-01`), lt: new Date(`${year+1}-01-01`) } } }),
      prisma.leave.aggregate({ _sum: { requestedDays: true }, where: { userId: user.id, kind, status: "PENDING",  startDate: { gte: new Date(`${year}-01-01`), lt: new Date(`${year+1}-01-01`) } } }),
    ]);
    const usedApproved = Number(A._sum.requestedDays ?? 0);
    const usedPending  = Number(P._sum.requestedDays ?? 0);
    const remain = entitled - usedApproved - usedPending;
    
    // 🔍 Debug log สำหรับตรวจสอบค่า
    console.log(`[DEBUG] Leave Type: ${kind}`);
    console.log(`[DEBUG] Entitled: ${entitled}, Used: ${usedApproved}, Pending: ${usedPending}`);
    console.log(`[DEBUG] Remain: ${remain}, Requested: ${requestedDays}`);
    
    if (requestedDays > remain) {
      return NextResponse.json({ error: `สิทธิ์คงเหลือไม่พอ (เหลือ ${remain} วัน)` }, { status: 400 });
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
      reason, contact, handoverTo, attachmentUrl,
      requestedDays,
      status: "PENDING",
    }
  });

  return NextResponse.json({ ok: true, data: saved });
  } catch (error) {
    console.error("POST /api/leaves error:", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { employee: true }
  });
  if (!user) return NextResponse.json({ error: "no user" }, { status: 400 });

  // หา approver ที่ตรงกับ user นี้
  const approver = await prisma.approver.findFirst({
    where: {
      OR: [
        { email: session.user.email },
        { empNo: user.employee?.empNo }
      ]
    }
  });

  const { searchParams } = new URL(req.url);
  const leaveId = searchParams.get('id');
  if (!leaveId) return NextResponse.json({ error: "missing leave id" }, { status: 400 });

  const { status, approverReason, approverSignature } = await req.json();
  
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  try {
    const updatedLeave = await prisma.leave.update({
      where: { id: parseInt(leaveId) },
      data: {
        status,
        approverReason,
        approverSignature,
        approvedAt: new Date()
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
              }
            }
          }
        }
      }
    });

    return NextResponse.json(updatedLeave);
  } catch (error) {
    console.error('Error updating leave:', error);
    return NextResponse.json({ error: "failed to update leave" }, { status: 500 });
  }
}
