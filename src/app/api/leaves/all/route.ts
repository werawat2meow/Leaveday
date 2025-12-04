import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // รับ department จาก query param (เช่น /api/leaves/all?department=xxx)
    const { searchParams } = new URL(req.url);
    const department = searchParams.get('department');

    let whereCondition: any = {};
    if (department) {
      whereCondition.user = {
        employee: {
          department: department
        }
      };
    }
    // ไม่ filter approverId

    const leaves = await prisma.leave.findMany({
      where: whereCondition,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          include: {
            employee: true
          }
        },
        approver: true
      }
    });

    // Map ข้อมูลให้ modal ใช้
    const mapped = leaves.map(leave => ({
      id: leave.id,
      userId: leave.userId,
      kind: leave.kind,
      startDate: leave.startDate,
      endDate: leave.endDate,
      reason: leave.reason,
      status: leave.status,
      approverReason: leave.approverReason,
      approverSignature: leave.approverSignature,
      handoverTo: leave.handoverTo,
      createdAt: leave.createdAt,
      approverName: leave.approver
        ? `${leave.approver.prefix ?? ''}${leave.approver.firstNameTh} ${leave.approver.lastNameTh}`
        : '',
      user: {
        name: leave.user?.name,
        employee: leave.user?.employee
          ? {
              empNo: leave.user.employee.empNo,
              firstName: leave.user.employee.firstName,
              lastName: leave.user.employee.lastName,
              org: leave.user.employee.org ?? '',
              department: leave.user.employee.department ?? '',
              division: leave.user.employee.division ?? '',
              unit: leave.user.employee.unit ?? '',
              levelP: leave.user.employee.levelP ?? '',
            }
          : null
      }
    }));

    return NextResponse.json({ ok: true, data: mapped });
  } catch (error) {
    console.error("GET /api/leaves/all error:", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
