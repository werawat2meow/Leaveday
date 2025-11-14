// src/app/api/employees/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

type Role = "MASTER_ADMIN" | "ADMIN" | "MANAGER" | "USER";

/* ---------------- GET: list employees ---------------- */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = await prisma.employee.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(list);
}

/* ---------------- POST: create employee (+ auto create user) ---------------- */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session as any)?.role as Role | undefined;

  if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "MASTER_ADMIN" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  // validate
  if (!body.empNo || !body.firstName || !body.lastName) {
    return NextResponse.json({ error: "empNo/firstName/lastName is required" }, { status: 400 });
  }
  if (!body.email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  if (!/^\S+@\S+\.\S+$/.test(body.email)) {
    return NextResponse.json({ error: "รูปแบบอีเมลไม่ถูกต้อง" }, { status: 400 });
  }
  if (!body.idCard) {
    return NextResponse.json({ error: "idCard is required (ใช้เป็นรหัสเริ่มต้น)" }, { status: 400 });
  }

  try {
    const emp = await prisma.$transaction(async (tx) => {
      // หา/สร้าง user
      let user = await tx.user.findUnique({ where: { email: body.email } });
      if (!user) {
        const passwordHash = await bcrypt.hash(String(body.idCard), 12);
        user = await tx.user.create({
          data: {
            email: body.email,
            name: `${body.firstName} ${body.lastName}`.trim(),
            role: "USER",
            passwordHash,
          },
        });
      }

      // สร้าง employee
      const created = await tx.employee.create({
        data: {
          empNo: body.empNo,
          email: body.email ?? null,
          prefix: body.prefix ?? null,
          firstName: body.firstName,
          lastName: body.lastName,
          idCard: body.idCard ?? null,
          org: body.org ?? null,
          department: body.department ?? null,
          division: body.division ?? null,
          unit: body.unit ?? null,
          levelP: body.levelP ?? null,
          lineId: body.lineId ?? null,
          startDate: body.startDate ? new Date(body.startDate) : null,
          weeklyHoliday: body.weeklyHoliday ?? null,
          vacationDays: Number(body.vacationDays ?? 0),
          businessDays: Number(body.businessDays ?? 0),
          sickDays: Number(body.sickDays ?? 0),
          ordainDays: Number(body.ordainDays ?? 0),
          maternityDays: Number(body.maternityDays ?? 0),
          unpaidDays: Number(body.unpaidDays ?? 0),
          birthdayDays: Number(body.birthdayDays ?? 0),
          annualHolidays: Number(body.annualHolidays ?? 0),
          photoUrl: body.photoUrl ?? null,
          userId: user.id,
        },
      });

      return created;
    });

    return NextResponse.json(emp, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "ข้อมูลซ้ำ (empNo หรือ email หรือ idCard)" }, { status: 409 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/* ---------------- PUT: update employee (+ sync user name) ---------------- */
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session as any)?.role as Role | undefined;
  if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "MASTER_ADMIN" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);

  // ⬇️ แก้ตรงนี้: แปลงเป็น number และตรวจสอบ
  const id = Number(searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  if (typeof body.email !== "undefined" && body.email && !/^\S+@\S+\.\S+$/.test(body.email)) {
    return NextResponse.json({ error: "รูปแบบอีเมลไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const emp = await tx.employee.update({
        // ⬇️ ใช้ number ตามชนิด Int ของ Prisma
        where: { id }, 
        data: {
          empNo: body.empNo ?? undefined,
          email: body.email ?? undefined,
          prefix: body.prefix ?? undefined,
          firstName: body.firstName ?? undefined,
          lastName: body.lastName ?? undefined,
          idCard: body.idCard ?? undefined,
          org: body.org ?? undefined,
          department: body.department ?? undefined,
          division: body.division ?? undefined,
          unit: body.unit ?? undefined,
          levelP: body.levelP ?? undefined,
          lineId: body.lineId ?? undefined,
          startDate: typeof body.startDate !== "undefined"
            ? (body.startDate ? new Date(body.startDate) : null)
            : undefined,
          weeklyHoliday: body.weeklyHoliday ?? undefined,
          vacationDays: typeof body.vacationDays !== "undefined" ? Number(body.vacationDays) : undefined,
          businessDays: typeof body.businessDays !== "undefined" ? Number(body.businessDays) : undefined,
          sickDays: typeof body.sickDays !== "undefined" ? Number(body.sickDays) : undefined,
          ordainDays: typeof body.ordainDays !== "undefined" ? Number(body.ordainDays) : undefined,
          maternityDays: typeof body.maternityDays !== "undefined" ? Number(body.maternityDays) : undefined,
          unpaidDays: typeof body.unpaidDays !== "undefined" ? Number(body.unpaidDays) : undefined,
          birthdayDays: typeof body.birthdayDays !== "undefined" ? Number(body.birthdayDays) : undefined,
          annualHolidays: typeof body.annualHolidays !== "undefined" ? Number(body.annualHolidays) : undefined,
          photoUrl: typeof body.photoUrl !== "undefined" ? (body.photoUrl || null) : undefined,
        },
      });

      if (emp.email) {
        const u = await tx.user.findUnique({ where: { email: emp.email } });
        if (u) {
          await tx.user.update({
            where: { id: u.id },
            data: { name: `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim() || u.name },
          });
        }
      }

      return emp;
    });

    return NextResponse.json(updated);
  } catch (e: any) {
    if (e?.code === "P2025") return NextResponse.json({ error: "not found" }, { status: 404 });
    if (e?.code === "P2002") return NextResponse.json({ error: "ข้อมูลซ้ำ (empNo/email/idCard)" }, { status: 409 });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
