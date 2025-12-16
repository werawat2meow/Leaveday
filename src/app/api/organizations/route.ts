import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const organizations = await prisma.organization.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(organizations);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const name = body?.name?.trim();

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    // Optional: prevent duplicate names
    const exists = await prisma.organization.findFirst({ where: { name } });
    if (exists) {
      return NextResponse.json(
        { error: "organization already exists" },
        { status: 409 }
      );
    }

    const created = await prisma.organization.create({ data: { name } });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "failed to create organization" },
      { status: 500 }
    );
  }
}
export async function PUT(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    if (!id)
      return NextResponse.json({ error: "id required" }, { status: 400 });

    const body = await req.json().catch(() => null);
    const name = String(body?.name || "").trim();
    if (!name)
      return NextResponse.json({ error: "name required" }, { status: 400 });

    const updated = await prisma.organization.update({
      where: { id },
      data: { name },
    });
    return NextResponse.json(updated);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Update failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    const force = searchParams.get("force") === "true";
    if (!id)
      return NextResponse.json({ error: "id required" }, { status: 400 });

    const deptCount = await prisma.department.count({
      where: { organizationId: id },
    });
    if (deptCount > 0 && !force) {
      return NextResponse.json(
        { error: "มีแผนกอยู่ กรุณาลบแผนกก่อน หรือส่ง ?force=true เพื่อยืนยัน" },
        { status: 409 }
      );
    }

    if (force) {
      await prisma.$transaction([
        prisma.unit.deleteMany({
          where: { division: { department: { organizationId: id } } },
        }),
        prisma.division.deleteMany({
          where: { department: { organizationId: id } },
        }),
        prisma.department.deleteMany({ where: { organizationId: id } }),
        prisma.organization.delete({ where: { id } }),
      ]);
    } else {
      await prisma.organization.delete({ where: { id } });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Delete failed" },
      { status: 500 }
    );
  }
}
