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
    const divisionId = body?.divisionId ? Number(body.divisionId) : undefined;
    if (!name)
      return NextResponse.json({ error: "name required" }, { status: 400 });

    const exists = await prisma.unit.findUnique({
      where: { id },
      select: { id: true, divisionId: true },
    });
    if (!exists)
      return NextResponse.json({ error: "unit not found" }, { status: 404 });

    const updated = await prisma.unit.update({
      where: { id },
      data: { name, ...(divisionId ? { divisionId } : {}) },
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
    if (!id)
      return NextResponse.json({ error: "id required" }, { status: 400 });

    await prisma.unit.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Delete failed" },
      { status: 500 }
    );
  }
}
