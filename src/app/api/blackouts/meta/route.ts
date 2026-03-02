import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import type { Role } from "@prisma/client";

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = (session as any)?.role as Role | undefined;
  if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "MASTER_ADMIN" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [organizations, departments, divisions, units] = await Promise.all([
    prisma.organization.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.department.findMany({
      select: { id: true, name: true, organizationId: true },
      orderBy: { name: "asc" },
    }),
    prisma.division.findMany({
      select: { id: true, name: true, departmentId: true },
      orderBy: { name: "asc" },
    }),
    prisma.unit.findMany({
      select: { id: true, name: true, divisionId: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return NextResponse.json({ organizations, departments, divisions, units });
}
