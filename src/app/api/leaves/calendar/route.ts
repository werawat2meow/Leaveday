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
     // optional: find caller's employee to filter by org/department
    const user = await prisma.user.findUnique({ where: { email: session.user.email }, include: { employee: true } });
    const approverOrg = user?.employee?.org ?? null;
    const approverDept = user?.employee?.department ?? null;

    const where: any = { startDate: { lt: nextMonth }, endDate: { gte: start } };
    if (approverOrg || approverDept) {
      where.user = { employee: { ...(approverOrg ? { org: approverOrg } : {}), ...(approverDept ? { department: approverDept } : {}) } };
    }

    const leaves = await prisma.leave.findMany({
      where,
      select: {
        startDate: true, endDate: true, status: true,
        user: { select: { employee: { select: { prefix: true, firstName: true, lastName: true, empNo: true } } } }
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