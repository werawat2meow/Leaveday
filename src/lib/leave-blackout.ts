import { prisma } from "@/lib/prisma";
import { ymd } from "@/lib/leave-utils";
import type { LeaveKind } from "@prisma/client";

type BlackoutTargetType = "ORG" | "DEPARTMENT" | "DIVISION" | "UNIT";

export type LeaveBlackoutConflict = {
  blackoutId: number;
  reason: string | null;
  startDate: Date;
  endDate: Date;
};

function toYmd(input: Date) {
  return ymd(input);
}

function dateRangeOverlapsYmd(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
) {
  return aStart <= bEnd && aEnd >= bStart;
}

export async function findLeaveBlackoutConflict(params: {
  employeeId: number;
  kind: LeaveKind;
  start: Date;
  end: Date;
}): Promise<LeaveBlackoutConflict | null> {
  const employee = await prisma.employee.findUnique({
    where: { id: params.employeeId },
    select: {
      orgId: true,
      departmentId: true,
      divisionId: true,
      unitId: true,
    },
  });

  if (!employee) return null;

  const targets: Array<{ targetType: BlackoutTargetType; targetId: number }> = [];
  if (employee.orgId) targets.push({ targetType: "ORG", targetId: employee.orgId });
  if (employee.departmentId)
    targets.push({ targetType: "DEPARTMENT", targetId: employee.departmentId });
  if (employee.divisionId)
    targets.push({ targetType: "DIVISION", targetId: employee.divisionId });
  if (employee.unitId) targets.push({ targetType: "UNIT", targetId: employee.unitId });

  if (!targets.length) return null;

  const startY = toYmd(params.start);
  const endY = toYmd(params.end);

  const where: any = {
    active: true,
    // bounding filter (actual overlap checked again via ymd below)
    AND: [{ startDate: { lte: params.end } }, { endDate: { gte: params.start } }],
    targets: {
      some: {
        OR: targets,
      },
    },
    OR: [
      { allKinds: true },
      { allKinds: false, kinds: { some: { kind: params.kind } } },
    ],
  };

  const p = prisma as any;
  const blackouts = await p.leaveBlackout.findMany({
    where,
    orderBy: [{ startDate: "asc" }],
    select: {
      id: true,
      reason: true,
      startDate: true,
      endDate: true,
    },
    take: 5,
  });

  for (const b of blackouts) {
    const bStart = toYmd(new Date(b.startDate));
    const bEnd = toYmd(new Date(b.endDate));
    if (dateRangeOverlapsYmd(startY, endY, bStart, bEnd)) {
      return {
        blackoutId: b.id,
        reason: b.reason ?? null,
        startDate: b.startDate,
        endDate: b.endDate,
      };
    }
  }

  return null;
}
