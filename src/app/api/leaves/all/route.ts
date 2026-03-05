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

    const { searchParams } = new URL(req.url);

    const orgFilter = searchParams.get("org") || undefined;
    const deptFilter = searchParams.get("department") || undefined;
    const divFilter = searchParams.get("division") || undefined;
    const unitFilter = searchParams.get("unit") || undefined;
    const onlyMyApprovalsParam = searchParams.get("onlyMyApprovals");
    const onlyMyApprovals =
      onlyMyApprovalsParam === "1" ||
      onlyMyApprovalsParam === "true" ||
      onlyMyApprovalsParam === "yes";

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { employee: true },
    });
    if (!user) {
      return NextResponse.json({ error: "user not found" }, { status: 404 });
    }

    const isAdmin = user.role === "MASTER_ADMIN";

    const extraFilter: any = {};
    if (orgFilter) extraFilter.org = orgFilter;
    if (deptFilter) extraFilter.department = deptFilter;
    if (divFilter) extraFilter.division = divFilter;
    if (unitFilter) extraFilter.unit = unitFilter;

    let whereCondition: any = {};

    if (isAdmin) {
      if (Object.keys(extraFilter).length) {
        whereCondition.user = { employee: extraFilter };
      }
    } else {
      const approver = await prisma.approver.findFirst({
        where: {
          OR: [{ email: session.user.email }, { empNo: user.employee?.empNo }],
        },
        select: { id: true, orgId: true, org: true },
      });

      if (!approver) {
        return NextResponse.json({ ok: true, data: [] });
      }

      let approverOrgName: string | null = approver.org ?? null;
      if (!approverOrgName && approver.orgId != null) {
        const orgRow = await prisma.organization.findUnique({
          where: { id: approver.orgId },
          select: { name: true },
        });
        approverOrgName = orgRow?.name ?? null;
      }

      const clause2: any = { approverId: approver.id };
      if (Object.keys(extraFilter).length) {
        clause2.user = { employee: extraFilter };
      }

      if (onlyMyApprovals) {
        whereCondition = clause2;
      } else {
        const orClauses: any[] = [];

        const scopeOr: any[] = [];
        if (approver.orgId != null) scopeOr.push({ orgId: approver.orgId });
        if (approverOrgName) scopeOr.push({ org: approverOrgName });

        if (scopeOr.length) {
          // IMPORTANT: do not allow query filters to expand org scope.
          if (approverOrgName && orgFilter && orgFilter !== approverOrgName) {
            // mismatched org filter => no in-scope results
          } else {
            const scopeEmployeeWhere =
              scopeOr.length === 1 ? scopeOr[0] : { OR: scopeOr };
            const employeeWhere = Object.keys(extraFilter).length
              ? { AND: [scopeEmployeeWhere, extraFilter] }
              : scopeEmployeeWhere;
            orClauses.push({ user: { employee: employeeWhere } });
          }
        }

        orClauses.push(clause2);
        whereCondition = { OR: orClauses };
      }
    }

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
