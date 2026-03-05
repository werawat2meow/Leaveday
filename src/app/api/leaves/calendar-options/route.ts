import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type KeyField = "org" | "department" | "division" | "unit" | "position";
type EmployeeFieldRecord = Partial<Record<KeyField, string | null>>;

const distinctField = async (field: KeyField, employeeWhere?: any) => {
  const rows = await prisma.employee.findMany({
    where: {
      AND: [
        employeeWhere ?? {},
        {
          [field]: { not: null },
          NOT: { [field]: "" },
        },
      ],
    },
    select: { [field]: true },
    distinct: [field],
    orderBy: { [field]: "asc" },
  });

  const typedRows = rows as EmployeeFieldRecord[];

  return typedRows
    .map((row) => row[field] ?? null)
    .filter(
      (value): value is string => typeof value === "string" && value.length > 0
    );
};

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { employee: true },
    });
    if (!user) {
      return NextResponse.json({ error: "user not found" }, { status: 404 });
    }

    const isAdmin = user.role === "MASTER_ADMIN";

    const { searchParams } = new URL(req.url);
    const orgFilter = searchParams.get("org") || undefined;
    const deptFilter = searchParams.get("department") || undefined;
    const divFilter = searchParams.get("division") || undefined;
    const unitFilter = searchParams.get("unit") || undefined;

    let employeeWhere: any = undefined;

    if (!isAdmin) {
      const approver = await prisma.approver.findFirst({
        where: {
          OR: [{ email: session.user.email }, { empNo: user.employee?.empNo }],
        },
        select: { orgId: true, org: true },
      });

      if (!approver) {
        return NextResponse.json({ ok: true, org: [], department: [], division: [], unit: [], position: [] });
      }

      let approverOrgName: string | null = approver.org ?? null;
      if (!approverOrgName && approver.orgId != null) {
        const orgRow = await prisma.organization.findUnique({
          where: { id: approver.orgId },
          select: { name: true },
        });
        approverOrgName = orgRow?.name ?? null;
      }

      if (orgFilter && approverOrgName && orgFilter !== approverOrgName) {
        // do not allow org filter to expand scope
        return NextResponse.json({ ok: true, org: [], department: [], division: [], unit: [], position: [] });
      }

      const scopeOr: any[] = [];
      if (approver.orgId != null) scopeOr.push({ orgId: approver.orgId });
      if (approverOrgName) scopeOr.push({ org: approverOrgName });

      const scopeEmployeeWhere =
        scopeOr.length === 1 ? scopeOr[0] : { OR: scopeOr };

      const extraFilter: any = {};
      if (deptFilter) extraFilter.department = deptFilter;
      if (divFilter) extraFilter.division = divFilter;
      if (unitFilter) extraFilter.unit = unitFilter;

      employeeWhere = Object.keys(extraFilter).length
        ? { AND: [scopeEmployeeWhere, extraFilter] }
        : scopeEmployeeWhere;
    } else {
      const extraFilter: any = {};
      if (orgFilter) extraFilter.org = orgFilter;
      if (deptFilter) extraFilter.department = deptFilter;
      if (divFilter) extraFilter.division = divFilter;
      if (unitFilter) extraFilter.unit = unitFilter;
      employeeWhere = Object.keys(extraFilter).length ? extraFilter : undefined;
    }

    const [orgs, departments, divisions, units, positions] = await Promise.all([
      distinctField("org", employeeWhere),
      distinctField("department", employeeWhere),
      distinctField("division", employeeWhere),
      distinctField("unit", employeeWhere),
      distinctField("position", employeeWhere),
    ]);

    return NextResponse.json({
      ok: true,
      org: orgs,
      department: departments,
      division: divisions,
      unit: units,
      position: positions,
    });
  } catch (error) {
    console.error("GET /api/leaves/calendar-options error:", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
