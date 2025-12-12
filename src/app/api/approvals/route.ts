import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // หา user จาก session
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { employee: true }
    });
    
    if (!user) {
      return NextResponse.json({ error: "user not found" }, { status: 404 });
    }

    // หา approver โดยใช้ email หรือ empNo เป็นตัวเชื่อม
    const approver = await prisma.approver.findFirst({
      where: {
        OR: [
          { email: session.user.email },
          { empNo: user.employee?.empNo }
        ]
      }
    });

    // กำหนดเงื่อนไขการกรอง
    // ถ้าเป็น approver ให้ดูเฉพาะคำขอที่เลือกตัวเองเป็นผู้อนุมัติ
    // ถ้าไม่ใช่ approver (admin) ให้ดูได้ทั้งหมด
    // ใช้ user.id เพราะ approverId ใน Leave table ชี้ไปที่ User table
  const whereCondition = {
    status: 'PENDING' as const,
    // ✅ เพิ่มเงื่อนไข: ถ้าไม่ใช่ MASTER_ADMIN ต้องมี approver record
    ...(user.role === 'MASTER_ADMIN' 
      ? {} 
      : approver 
        ? { approverId: approver.id } 
        : { approverId: -1 } // ไม่เจออะไรเลย
    )
  };

    // ดึงข้อมูลรายการลาตามเงื่อนไข
    const leaves = await prisma.leave.findMany({
      where: whereCondition,
      include: {
        user: {
          include: {
            employee: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    const mapped = leaves.map((leave) => {
      const emp = leave.user?.employee;
      const empNo = emp?.empNo ?? '';
      return {
        ...leave,
        user: {
          ...leave.user,
          employee: emp
          ? {
            ...emp,
            // ถ้ามี photoUrl ใน DB ให้ใช้ค่านั้น ถ้าไม่มีก็ใช้ fallback path
            photoUrl: emp.photoUrl ?? `/uploads/avatars/${empNo}.jpg`,
          }
          : null,
        },
      };
    });

    return NextResponse.json({ ok: true, data: mapped });
    
  } catch (error) {
    console.error("GET /api/approvals error:", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}