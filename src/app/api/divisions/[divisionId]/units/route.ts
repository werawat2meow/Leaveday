import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

interface Params {
  divisionId: string;
}

export async function GET(_req: Request, context: { params: Params }) {
  const { divisionId } = context.params;
  const units = await prisma.unit.findMany({
    where: { divisionId: Number(divisionId) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(units);
}

export async function POST(req: Request, context: { params: Params }) {
  try {
    const { divisionId } = context.params;
    const divisionIdNum = Number(divisionId);
    if (!divisionIdNum) {
      return NextResponse.json({ error: "divisionId required" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    const created = await prisma.unit.create({
      data: { name, divisionId: divisionIdNum },
      select: { id: true, name: true, divisionId: true },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Create failed" }, { status: 500 });
  }
}
