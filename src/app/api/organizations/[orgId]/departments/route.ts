import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

interface Params {
  orgId: string;
}

export async function GET(_req: Request, context: { params: Params }) {
  const { orgId } = context.params;
  const departments = await prisma.department.findMany({
    where: { organizationId: Number(orgId) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(departments);
}

export async function POST(req: Request, context: { params: Params }) {
  try {
    const { orgId } = context.params;
    const organizationId = Number(orgId);
    if (!organizationId) {
      return NextResponse.json({ error: "organizationId required" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    const created = await prisma.department.create({
      data: { name, organizationId },
      select: { id: true, name: true, organizationId: true },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Create department failed" }, { status: 500 });
  }
}

export async function PUT(req: Request, context: { params: { orgId: string } }) {
  try {
    const { orgId } = context.params;
    const organizationId = Number(orgId);
    if (!organizationId) {
      return NextResponse.json({ error: "organizationId required" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    // ตรวจสอบว่า department อยู่ใต้ organization ที่ระบุ
    const exists = await prisma.department.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });
    if (!exists || exists.organizationId !== organizationId) {
      return NextResponse.json({ error: "department not in this organization" }, { status: 404 });
    }

    const updated = await prisma.department.update({
      where: { id },
      data: { name },
      select: { id: true, name: true, organizationId: true },
    });
    return NextResponse.json(updated);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Update department failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request, context: { params: { orgId: string } }) {
  try {
    const { orgId } = context.params;
    const organizationId = Number(orgId);
    if (!organizationId) {
      return NextResponse.json({ error: "organizationId required" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    // ตรวจสอบว่า department อยู่ใต้ organization ที่ระบุ
    const exists = await prisma.department.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });
    if (!exists || exists.organizationId !== organizationId) {
      return NextResponse.json({ error: "department not in this organization" }, { status: 404 });
    }

    // ลบแบบ cascade: หน่วย → ฝ่าย → แผนก
    await prisma.$transaction([
      prisma.unit.deleteMany({ where: { division: { departmentId: id } } }),
      prisma.division.deleteMany({ where: { departmentId: id } }),
      prisma.department.delete({ where: { id } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Delete department failed" }, { status: 500 });
  }
}
