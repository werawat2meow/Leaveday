// src/app/api/leave-rights/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
// (ถ้าต้องการ guard role ค่อยผูก getServerSession + authOptions ทีหลัง)
const prisma = new PrismaClient();

type RowDTO = { level: string; vacation: number | ""; business: number | ""; sick: number | ""; active?: boolean };

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const level = searchParams.get("level");

    if (level) {
      const row = await prisma.leaveRight.findUnique({ where: { level } });
      if (!row) return NextResponse.json({ message: "not found", data: null }, { status: 404 });
      return NextResponse.json({ message: "success", data: row });
    }

    const rows = await prisma.leaveRight.findMany({
      where: { active: true },
      orderBy: { level: "asc" },
    });
    return NextResponse.json({ data: rows });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as { rows: RowDTO[] };
    if (!Array.isArray(body?.rows)) return NextResponse.json({ message: "Invalid body" }, { status: 400 });

    const normalized = body.rows
      .map(r => ({
        level: (r.level || "").trim(),
        vacation: r.vacation === "" ? 0 : Number(r.vacation ?? 0),
        business: r.business === "" ? 0 : Number(r.business ?? 0),
        sick: r.sick === "" ? 0 : Number(r.sick ?? 0),
        active: r.active ?? true,
      }))
      .filter(r => r.level.length > 0);

    const levels = normalized.map(r => r.level);

    await prisma.$transaction([
      ...normalized.map(r =>
        prisma.leaveRight.upsert({
          where: { level: r.level },
          update: { vacation: r.vacation, business: r.business, sick: r.sick, active: r.active },
          create: { level: r.level, vacation: r.vacation, business: r.business, sick: r.sick, active: r.active },
        })
      ),
      // ถ้าอยาก "ลบจริง"
      prisma.leaveRight.deleteMany({ where: { level: { notIn: levels } } }),
      // ถ้าอยาก "soft delete" แทน ให้คอมเมนต์บรรทัดบน แล้วใช้บรรทัดล่างแทน:
      // prisma.leaveRight.updateMany({ where: { level: { notIn: levels } }, data: { active: false } }),
    ]);

    const refreshed = await prisma.leaveRight.findMany({ orderBy: { level: "asc" } });
    return NextResponse.json({ message: `Saved ${normalized.length} rows`, data: refreshed });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
