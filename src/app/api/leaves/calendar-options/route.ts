import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type KeyField = "org" | "department" | "division" | "unit" | "position";
type EmployeeFieldRecord = Partial<Record<KeyField, string | null>>;

const distinctField = async (field: KeyField) => {
  const rows = await prisma.employee.findMany({
    where: {
      [field]: { not: null },
      NOT: { [field]: "" },
    },
    select: { [field]: true },
    distinct: [field],
    orderBy: { [field]: "asc" },
  });

  const typedRows = rows as EmployeeFieldRecord[];

  return typedRows
    .map((row) => row[field] ?? null)
    .filter(
      (value): value is string => typeof value === "string" && value.length > 0
    );
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const [orgs, departments, divisions, units, positions] = await Promise.all([
      distinctField("org"),
      distinctField("department"),
      distinctField("division"),
      distinctField("unit"),
      distinctField("position"),
    ]);

    return NextResponse.json({
      ok: true,
      org: orgs,
      department: departments,
      division: divisions,
      unit: units,
      position: positions,
    });
  } catch (error) {
    console.error("GET /api/leaves/calendar-options error:", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
