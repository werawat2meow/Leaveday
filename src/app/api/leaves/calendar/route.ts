import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get("month");
    const month = monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam)
      ? monthParam
      : (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`; })();

    const [y, m] = month.split("-").map(Number);
    const start = new Date(Date.UTC(y, m-1, 1));
    const nextMonth = new Date(Date.UTC(y, m, 1));

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { employee: true },
    });
    if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });

    const isAdmin = user.role === "MASTER_ADMIN";

    const orgFilter = searchParams.get("org") || undefined;
    const deptFilter = searchParams.get("department") || undefined;
    const divFilter = searchParams.get("division") || undefined;
    const unitFilter = searchParams.get("unit") || undefined;
    const onlyMyApprovalsParam = searchParams.get("onlyMyApprovals");
    const onlyMyApprovals =
      onlyMyApprovalsParam === "1" ||
      onlyMyApprovalsParam === "true" ||
      onlyMyApprovalsParam === "yes";

    const baseWhere: any = {
      startDate: { lt: nextMonth },
      endDate: { gte: start },
    };

    const extraFilter: any = {};
    if (orgFilter) extraFilter.org = orgFilter;
    if (deptFilter) extraFilter.department = deptFilter;
    if (divFilter) extraFilter.division = divFilter;
    if (unitFilter) extraFilter.unit = unitFilter;

    let where: any = { ...baseWhere };

    if (isAdmin) {
      if (Object.keys(extraFilter).length) {
        where.user = { employee: extraFilter };
      }
    } else {
      const approver = await prisma.approver.findFirst({
        where: {
          OR: [{ email: session.user.email }, { empNo: user.employee?.empNo }],
        },
        select: { id: true, orgId: true, org: true },
      });

      if (!approver) {
        return NextResponse.json({ ok: true, month, days: {} });
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
        where = { ...baseWhere, ...clause2 };
      } else {
        const orClauses: any[] = [];

        const scopeOr: any[] = [];
        if (approver.orgId != null) scopeOr.push({ orgId: approver.orgId });
        if (approverOrgName) scopeOr.push({ org: approverOrgName });

        if (scopeOr.length) {
          // clause1: people in my org scope, optionally narrowed by query filters.
          // IMPORTANT: do not allow query filters to expand scope.
          if (approverOrgName && orgFilter && orgFilter !== approverOrgName) {
            // mismatched org filter => no in-scope results
          } else {
            const scopeEmployeeWhere = scopeOr.length === 1 ? scopeOr[0] : { OR: scopeOr };
            const employeeWhere = Object.keys(extraFilter).length
              ? { AND: [scopeEmployeeWhere, extraFilter] }
              : scopeEmployeeWhere;

            const clause1: any = { user: { employee: employeeWhere } };
            orClauses.push(clause1);
          }
        }

        // clause2: anyone who selected me as approver (can be outside org)
        orClauses.push(clause2);
        where = { ...baseWhere, OR: orClauses };
      }
    }

    const leaves = await prisma.leave.findMany({
      where,
      select: {
        startDate: true, endDate: true, status: true,
        user: {
          select: {
            employee: {
              select: {
                prefix: true,
                firstName: true,
                lastName: true,
                empNo: true,
                org: true,
                department: true,
                division: true,
                unit: true,
              }
            }
          }
        }
      },
      orderBy: { startDate: "asc" }
    });

    const days: Record<string, { approved:number; pending:number; rejected:number; people:Array<{name:string, empNo:string, status:string}> }> = {};
    const toISO = (d: Date) => d.toISOString().slice(0,10);

    for (const lv of leaves) {
      const emp = lv.user?.employee;
      if (!emp?.empNo) continue;
      const s = new Date(lv.startDate), e = new Date(lv.endDate);
      const os = s > start ? new Date(s) : new Date(start);
      const oe = e < new Date(nextMonth.getTime()-1) ? new Date(e) : new Date(nextMonth.getTime()-1);

      let cur = new Date(Date.UTC(os.getUTCFullYear(), os.getUTCMonth(), os.getUTCDate()));
      const endUTC = new Date(Date.UTC(oe.getUTCFullYear(), oe.getUTCMonth(), oe.getUTCDate()));
      while (cur.getTime() <= endUTC.getTime()) {
        const iso = toISO(cur);
        if (!days[iso]) days[iso] = { approved:0, pending:0, rejected:0, people: [] };
        if (lv.status === "APPROVED") days[iso].approved += 1;
        else if (lv.status === "REJECTED") days[iso].rejected += 1;
        else days[iso].pending += 1;
        days[iso].people.push({ name: `${emp.prefix ?? ""}${emp.firstName} ${emp.lastName}`.trim(), empNo: emp.empNo, status: lv.status });
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }

    return NextResponse.json({ ok: true, month, days });

  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}