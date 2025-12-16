import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

interface Params {
  departmentId: string;
}

export async function GET(_req: Request, context: { params: Params }) {
  const { departmentId } = context.params;
  const divisions = await prisma.division.findMany({
    where: { departmentId: Number(departmentId) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(divisions);
}

export async function POST(req: Request, context: { params: Params }) {
  try {
    const { departmentId } = context.params;
    const departmentIdNum = Number(departmentId);
    if (!departmentIdNum) {
      return NextResponse.json(
        { error: "departmentId required" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "").trim();
    if (!name)
      return NextResponse.json({ error: "name required" }, { status: 400 });

    const created = await prisma.division.create({
      data: { name, departmentId: departmentIdNum },
      select: { id: true, name: true, departmentId: true },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Create failed" },
      { status: 500 }
    );
  }
}
