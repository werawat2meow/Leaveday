// ...existing code...
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PUT(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    if (!id)
      return NextResponse.json({ error: "id required" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "").trim();
    const organizationId = body?.organizationId
      ? Number(body.organizationId)
      : undefined;
    if (!name)
      return NextResponse.json({ error: "name required" }, { status: 400 });

    const exists = await prisma.department.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });
    if (!exists)
      return NextResponse.json(
        { error: "department not found" },
        { status: 404 }
      );

    const updated = await prisma.department.update({
      where: { id },
      data: { name, ...(organizationId ? { organizationId } : {}) },
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

    const divCount = await prisma.division.count({
      where: { departmentId: id },
    });
    if (divCount > 0 && !force) {
      return NextResponse.json(
        { error: "มีฝ่ายอยู่ กรุณาลบฝ่ายก่อน" },
        { status: 409 }
      );
    }

    if (force) {
      await prisma.$transaction([
        prisma.unit.deleteMany({ where: { division: { departmentId: id } } }),
        prisma.division.deleteMany({ where: { departmentId: id } }),
        prisma.department.delete({ where: { id } }),
      ]);
    } else {
      await prisma.department.delete({ where: { id } });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Delete failed" },
      { status: 500 }
    );
  }
}
// ...existing code...
