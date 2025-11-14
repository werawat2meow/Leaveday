import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { countBusinessDays, normalizeSession } from "@/lib/leave-utils";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { kind, startDate, endDate, sessionLabel, reason, contact, handoverTo, attachmentUrl } = await req.json();

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { employee: true },
  });
  if (!user?.employee) return NextResponse.json({ error: "no employee profile" }, { status: 400 });

  const start = new Date(startDate);
  const end   = new Date(endDate);
  const sNorm = normalizeSession(sessionLabel);

  const year = start.getFullYear();
  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: new Date(`${year}-01-01`), lt: new Date(`${year+1}-01-01`) } },
    select: { date: true },
  });
  const setH = new Set(holidays.map(h => h.date.toISOString().slice(0,10)));
  const requestedDays = countBusinessDays(start, end, sNorm, setH);
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
  const entitled = (() => {
    switch (kind as string) {
      case "ANNUAL": return user.employee.vacationDays;
      case "BUSINESS": return user.employee.businessDays;
      case "SICK": return user.employee.sickDays;
      case "BIRTHDAY": return user.employee.birthdayDays;
      case "ORDAIN": return user.employee.ordainDays;
      case "MATERNITY": return user.employee.maternityDays;
      case "UNPAID": return user.employee.unpaidDays;
      default: return 0; // ไม่ตัดสิทธิ์
    }
  })();
  const isQuotaKind = ["ANNUAL","BUSINESS","SICK","BIRTHDAY","ORDAIN","MATERNITY","UNPAID"].includes(kind);
  if (isQuotaKind) {
    const [A, P] = await Promise.all([
      prisma.leave.aggregate({ _sum: { requestedDays: true }, where: { userId: user.id, kind, status: "APPROVED", startDate: { gte: new Date(`${year}-01-01`), lt: new Date(`${year+1}-01-01`) } } }),
      prisma.leave.aggregate({ _sum: { requestedDays: true }, where: { userId: user.id, kind, status: "PENDING",  startDate: { gte: new Date(`${year}-01-01`), lt: new Date(`${year+1}-01-01`) } } }),
    ]);
    const usedApproved = Number(A._sum.requestedDays ?? 0);
    const usedPending  = Number(P._sum.requestedDays ?? 0);
    const remain = entitled - usedApproved - usedPending;
    if (requestedDays > remain) {
      return NextResponse.json({ error: `สิทธิ์คงเหลือไม่พอ (เหลือ ${remain} วัน)` }, { status: 400 });
    }
  }

  const saved = await prisma.leave.create({
    data: {
      userId: user.id,
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
}
