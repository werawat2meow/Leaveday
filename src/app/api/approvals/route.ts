import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const org = url.searchParams.get("org") || undefined;
    const department = url.searchParams.get("department") || undefined;
    const division = url.searchParams.get("division") || undefined;
    const unit = url.searchParams.get("unit") || undefined;

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { employee: true },
    });
    if (!user) {
      return NextResponse.json({ error: "user not found" }, { status: 404 });
    }

    const isAdmin = user.role === "MASTER_ADMIN";

    const approver = await prisma.approver.findFirst({
      where: {
        OR: [
          { email: session.user.email },
          { empNo: user.employee?.empNo },
        ],
      },
      select: {
        id: true,
        orgId: true,
        departmentId: true,
        divisionId: true,
        unitId: true,
        org: true,
        department: true,
        division: true,
        unit: true,
      },
    });

    // scopes ที่เขามีจริง (เพื่อหน้าเรียกเก็บไปแสดง filter)
    const availableScopes: string[] = [];
    if (approver?.orgId || approver?.org) availableScopes.push("org");
    if (approver?.departmentId || approver?.department)
      availableScopes.push("department");
    if (approver?.divisionId || approver?.division)
      availableScopes.push("division");
    if (approver?.unitId || approver?.unit) availableScopes.push("unit");

    // ตัวกรองเพิ่มเติมจาก querystring
    const extraFilter: any = {};
    if (org) extraFilter.org = org;
    if (department) extraFilter.department = department;
    if (division) extraFilter.division = division;
    if (unit) extraFilter.unit = unit;

    const whereCondition: any = { status: "PENDING" };

    if (!isAdmin) {
      if (!approver) {
        // ไม่ใช่ admin แต่ไม่ได้เป็น approver -> คืนว่าง
        return NextResponse.json({
          ok: true,
          data: [],
          scopes: availableScopes,
        });
      }

      // สร้างเงื่อนไขสังกัดของเรา
      const empScope: any = {};
    if (approver.orgId != null) empScope.orgId = approver.orgId;
    else if (approver.org) empScope.org = approver.org;
    // (ไม่ใส่ department/division/unit อีกต่อไป)

    if (Object.keys(empScope).length === 0) {
      return NextResponse.json({
        ok: true,
        data: [],
        scopes: availableScopes,
      });
    }

      const orClauses: any[] = [];

      // 1) คำขอของคนในสังกัดเรา (พร้อมตัวกรองเพิ่มเติม)
      const clause1: any = { user: { employee: { ...empScope } } };
    if (Object.keys(extraFilter).length) {
      clause1.user.employee = { ...clause1.user.employee, ...extraFilter };
    }
    orClauses.push(clause1);

    const clause2: any = { approverId: approver.id };
    if (Object.keys(extraFilter).length) {
      clause2.user = { employee: extraFilter };
    }
    orClauses.push(clause2);

    whereCondition.OR = orClauses;
  } else {
    // admin ก็ใช้ extraFilter ได้เหมือนเดิม
    if (Object.keys(extraFilter).length) {
      whereCondition.user = { employee: extraFilter };
    }
  }

    const leaves = await prisma.leave.findMany({
      where: whereCondition,
      include: { user: { include: { employee: true } } },
      orderBy: { createdAt: "desc" },
    });

    const mapped = leaves.map((l) => {
      const emp = l.user?.employee;
      const empNo = emp?.empNo ?? "";
      return {
        ...l,
        my: l.approverId === approver?.id,
        user: {
          ...l.user,
          employee: emp
            ? {
                ...emp,
                photoUrl: emp.photoUrl ?? `/uploads/avatars/${empNo}.jpg`,
              }
            : null,
        },
      };
    });

    return NextResponse.json({
      ok: true,
      data: mapped,
      scopes: availableScopes,
    });
  } catch (error) {
    console.error("GET /api/approvals error:", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}