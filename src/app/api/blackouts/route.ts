import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";

function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isAdmin(role?: Role) {
  return role === "MASTER_ADMIN" || role === "ADMIN";
}

type TargetType = "ORG" | "DEPARTMENT" | "DIVISION" | "UNIT";
type LeaveKind =
  | "ANNUAL"
  | "SICK"
  | "BUSINESS"
  | "UNPAID"
  | "BIRTHDAY"
  | "ORDAIN"
  | "MATERNITY"
  | "ANNUAL_HOLIDAY"
  | "SHIFT_CHANGE"
  | "HOLIDAY_CHANGE"
  | "OT";

const TARGET_TYPES: TargetType[] = ["ORG", "DEPARTMENT", "DIVISION", "UNIT"];
const LEAVE_KINDS: LeaveKind[] = [
  "ANNUAL",
  "SICK",
  "BUSINESS",
  "UNPAID",
  "BIRTHDAY",
  "ORDAIN",
  "MATERNITY",
  "ANNUAL_HOLIDAY",
  "SHIFT_CHANGE",
  "HOLIDAY_CHANGE",
  "OT",
];

type TargetInput = { targetType: TargetType; targetId: number };

function validateTargets(input: unknown): TargetInput[] {
  if (!Array.isArray(input)) return [];
  const out: TargetInput[] = [];
  for (const t of input) {
    const targetType = (t as any)?.targetType as TargetType;
    const targetIdRaw = (t as any)?.targetId;
    const targetId = typeof targetIdRaw === "number" ? targetIdRaw : Number(targetIdRaw);
    if (!targetType || !Number.isFinite(targetId) || targetId <= 0) continue;
    if (!TARGET_TYPES.includes(targetType)) continue;
    out.push({ targetType, targetId });
  }
  // de-dupe
  const uniq = new Map(out.map((t) => [`${t.targetType}:${t.targetId}`, t] as const));
  return Array.from(uniq.values());
}

function validateKinds(input: unknown): LeaveKind[] {
  if (!Array.isArray(input)) return [];
  const kinds: LeaveKind[] = [];
  for (const k of input) {
    if (typeof k !== "string") continue;
    const kk = k as LeaveKind;
    if (!LEAVE_KINDS.includes(kk)) continue;
    kinds.push(kk);
  }
  return Array.from(new Set(kinds));
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = (session as any)?.role as Role | undefined;
  if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const p = prisma as any;
  const rows: any[] = await p.leaveBlackout.findMany({
    orderBy: [{ active: "desc" }, { startDate: "desc" }, { id: "desc" }],
    include: {
      targets: true,
      kinds: true,
    },
  });

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      startDate: r.startDate.toISOString().slice(0, 10),
      endDate: r.endDate.toISOString().slice(0, 10),
      reason: r.reason ?? "",
      active: r.active,
      allKinds: r.allKinds,
      blockedKinds: (r.kinds ?? []).map((k: any) => k.kind),
      targets: (r.targets ?? []).map((t: any) => ({
        id: t.id,
        targetType: t.targetType,
        targetId: t.targetId,
      })),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }))
  );
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session as any)?.role as Role | undefined;
  if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const startDate = parseDateOnly(body?.startDate);
  const endDate = parseDateOnly(body?.endDate);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const active = typeof body?.active === "boolean" ? body.active : true;
  const allKinds = typeof body?.allKinds === "boolean" ? body.allKinds : true;

  const targets = validateTargets(body?.targets);
  const blockedKinds = validateKinds(body?.blockedKinds);

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }
  if (endDate < startDate) {
    return NextResponse.json({ error: "endDate must be >= startDate" }, { status: 400 });
  }
  if (!targets.length) {
    return NextResponse.json({ error: "targets required" }, { status: 400 });
  }
  if (!allKinds && blockedKinds.length === 0) {
    return NextResponse.json({ error: "blockedKinds required when allKinds=false" }, { status: 400 });
  }

  const p = prisma as any;
  const created = await p.leaveBlackout.create({
    data: {
      startDate,
      endDate,
      reason: reason || null,
      active,
      allKinds,
      targets: {
        createMany: {
          data: targets,
          skipDuplicates: true,
        },
      },
      kinds: allKinds
        ? undefined
        : {
            createMany: {
              data: blockedKinds.map((kind) => ({ kind })),
              skipDuplicates: true,
            },
          },
    },
    include: { targets: true, kinds: true },
  });

  return NextResponse.json({ ok: true, id: created.id });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session as any)?.role as Role | undefined;
  if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const idRaw = body?.id;
  const id = typeof idRaw === "number" ? idRaw : Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const startDate = body?.startDate !== undefined ? parseDateOnly(body.startDate) : undefined;
  const endDate = body?.endDate !== undefined ? parseDateOnly(body.endDate) : undefined;
  const reason = body?.reason !== undefined ? (typeof body.reason === "string" ? body.reason.trim() : "") : undefined;
  const active = body?.active !== undefined ? Boolean(body.active) : undefined;
  const allKinds = body?.allKinds !== undefined ? Boolean(body.allKinds) : undefined;

  const targets = body?.targets !== undefined ? validateTargets(body.targets) : undefined;
  const blockedKinds = body?.blockedKinds !== undefined ? validateKinds(body.blockedKinds) : undefined;

  if (startDate === null || endDate === null) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }

  if (targets && targets.length === 0) {
    return NextResponse.json({ error: "targets required" }, { status: 400 });
  }

  if (allKinds === false && blockedKinds && blockedKinds.length === 0) {
    return NextResponse.json({ error: "blockedKinds required when allKinds=false" }, { status: 400 });
  }

  // validate range if both supplied
  if (startDate && endDate && endDate < startDate) {
    return NextResponse.json({ error: "endDate must be >= startDate" }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx: any) => {
    if (targets) {
      await tx.leaveBlackoutTarget.deleteMany({ where: { blackoutId: id } });
      await tx.leaveBlackoutTarget.createMany({
        data: targets.map((t) => ({ blackoutId: id, ...t })),
        skipDuplicates: true,
      });
    }

    const effectiveAllKinds = allKinds;
    if (effectiveAllKinds === true) {
      await tx.leaveBlackoutKind.deleteMany({ where: { blackoutId: id } });
    } else if (effectiveAllKinds === false && blockedKinds) {
      await tx.leaveBlackoutKind.deleteMany({ where: { blackoutId: id } });
      await tx.leaveBlackoutKind.createMany({
        data: blockedKinds.map((kind) => ({ blackoutId: id, kind })),
        skipDuplicates: true,
      });
    } else if (blockedKinds) {
      // allKinds not explicitly changed, but kinds were provided
      await tx.leaveBlackoutKind.deleteMany({ where: { blackoutId: id } });
      await tx.leaveBlackoutKind.createMany({
        data: blockedKinds.map((kind) => ({ blackoutId: id, kind })),
        skipDuplicates: true,
      });
    }

    return tx.leaveBlackout.update({
      where: { id },
      data: {
        startDate: startDate ?? undefined,
        endDate: endDate ?? undefined,
        reason: reason === undefined ? undefined : reason || null,
        active,
        allKinds,
      },
      include: { targets: true, kinds: true },
    });
  });

  return NextResponse.json({ ok: true, id: updated.id });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session as any)?.role as Role | undefined;
  if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const idRaw = searchParams.get("id");
  const id = idRaw ? Number(idRaw) : NaN;
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const p = prisma as any;
  await p.leaveBlackout.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
