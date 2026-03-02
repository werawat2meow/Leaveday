import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findLeaveBlackoutConflict } from "@/lib/leave-blackout";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const kind = body?.kind as string | undefined;
  const startDate = body?.startDate as string | undefined;
  const endDate = body?.endDate as string | undefined;

  if (!kind || !startDate || !endDate) {
    return NextResponse.json(
      { error: "missing kind/startDate/endDate" },
      { status: 400 }
    );
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(+start) || isNaN(+end) || start > end) {
    return NextResponse.json({ error: "invalid date range" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { employee: true },
  });
  if (!user?.employee) {
    return NextResponse.json({ error: "no employee profile" }, { status: 400 });
  }

  const conflict = await findLeaveBlackoutConflict({
    employeeId: user.employee.id,
    kind: kind as any,
    start,
    end,
  });

  if (!conflict) {
    return NextResponse.json({ ok: true, conflict: false });
  }

  const message = conflict.reason
    ? `ช่วงวันที่เลือกถูกปิดรับการลา (${conflict.reason})`
    : "ช่วงวันที่เลือกถูกปิดรับการลา";

  return NextResponse.json({
    ok: true,
    conflict: true,
    message,
    blackout: {
      id: conflict.blackoutId,
      startDate: conflict.startDate,
      endDate: conflict.endDate,
      reason: conflict.reason,
    },
  });
}
