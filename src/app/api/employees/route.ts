// src/app/api/employees/route.ts
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

type Role = "MASTER_ADMIN" | "ADMIN" | "MANAGER" | "USER";

/* ---------------- GET: list employees ---------------- */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = await prisma.employee.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(list);
}

/* ---------------- POST: create employee (+ auto create user) ---------------- */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session as any)?.role as Role | undefined;

  if (!role)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "MASTER_ADMIN" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  // validate
  if (!body.empNo || !body.firstName || !body.lastName) {
    return NextResponse.json(
      { error: "empNo/firstName/lastName is required" },
      { status: 400 }
    );
  }
  if (!body.email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  if (!/^\S+@\S+\.\S+$/.test(body.email)) {
    return NextResponse.json(
      { error: "รูปแบบอีเมลไม่ถูกต้อง" },
      { status: 400 }
    );
  }
  if (!body.idCard) {
    return NextResponse.json(
      { error: "idCard is required (ใช้เป็นรหัสเริ่มต้น)" },
      { status: 400 }
    );
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
          // องค์กร (id และชื่อ)
          orgId: typeof body.orgId !== "undefined" ? body.orgId : null,
          org: typeof body.org !== "undefined" ? body.org : null,
          departmentId:
            typeof body.departmentId !== "undefined" ? body.departmentId : null,
          department:
            typeof body.department !== "undefined" ? body.department : null,
          divisionId:
            typeof body.divisionId !== "undefined" ? body.divisionId : null,
          division: typeof body.division !== "undefined" ? body.division : null,
          unitId: typeof body.unitId !== "undefined" ? body.unitId : null,
          unit: typeof body.unit !== "undefined" ? body.unit : null,
          position: body.position ?? null,
          levelP: body.levelP ?? null,
          lineId: body.lineId ?? null,
          startDate: body.startDate ? new Date(body.startDate) : null,
          weeklyHoliday: body.weeklyHoliday ?? null,
          photoUrl: body.photoUrl ?? null,
          userId: user.id,
        },
      });

      // ดึง LeaveRightsTemplate ตาม prefix (ถ้ามีค่า)
      let template = null;
      if (created.levelP) {
        template = await tx.leaveRightsTemplate.findFirst({
          where: { prefix: created.levelP },
        });
      }

      // สร้าง LeaveRights ให้ employee (ใช้ปีปัจจุบัน)
      if (template) {
        await tx.leaveRights.upsert({
          where: {
            employeeId_year: {
              employeeId: created.id,
              year: new Date().getFullYear(),
            },
          },
          update: {},
          create: {
            employeeId: created.id,
            year: new Date().getFullYear(),
            annualLeave: template.annualLeaveDays,
            holidayLeave: template.holidayLeaveDays,
            vacationLeave: template.vacationLeaveDays,
            businessLeave: template.businessLeaveDays,
            sickLeave: template.sickLeaveDays,
            ordainLeave: template.ordainLeaveDays,
            maternityLeave: template.maternityLeaveDays,
            unpaidLeave: template.unpaidLeaveDays,
            birthdayLeave: template.birthdayLeaveDays,
          },
        });
      } else {
        // ถ้าไม่มี template ให้สร้าง LeaveRights ด้วยค่า default เป็น 0
        await tx.leaveRights.upsert({
          where: {
            employeeId_year: {
              employeeId: created.id,
              year: new Date().getFullYear(),
            },
          },
          update: {},
          create: {
            employeeId: created.id,
            year: new Date().getFullYear(),
            annualLeave: 0,
            holidayLeave: 0,
            vacationLeave: 0,
            businessLeave: 0,
            sickLeave: 0,
            ordainLeave: 0,
            maternityLeave: 0,
            unpaidLeave: 0,
            birthdayLeave: 0,
          },
        });
      }

      return created;
    });

    return NextResponse.json(emp, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: "ข้อมูลซ้ำ (empNo หรือ email หรือ idCard)" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/* ---------------- PUT: update employee (+ sync user name) ---------------- */
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session as any)?.role as Role | undefined;
  if (!role)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  if (
    typeof body.email !== "undefined" &&
    body.email &&
    !/^\S+@\S+\.\S+$/.test(body.email)
  ) {
    return NextResponse.json(
      { error: "รูปแบบอีเมลไม่ถูกต้อง" },
      { status: 400 }
    );
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
          // องค์กร (id และชื่อ)
          orgId: typeof body.orgId !== "undefined" ? body.orgId : undefined,
          org: typeof body.org !== "undefined" ? body.org : undefined,
          departmentId:
            typeof body.departmentId !== "undefined"
              ? body.departmentId
              : undefined,
          department:
            typeof body.department !== "undefined"
              ? body.department
              : undefined,
          divisionId:
            typeof body.divisionId !== "undefined"
              ? body.divisionId
              : undefined,
          division:
            typeof body.division !== "undefined" ? body.division : undefined,
          unitId: typeof body.unitId !== "undefined" ? body.unitId : undefined,
          unit: typeof body.unit !== "undefined" ? body.unit : undefined,
          position: body.position ?? undefined,
          levelP: body.levelP ?? undefined,
          lineId: body.lineId ?? undefined,
          startDate:
            typeof body.startDate !== "undefined"
              ? body.startDate
                ? new Date(body.startDate)
                : null
              : undefined,
          weeklyHoliday: body.weeklyHoliday ?? undefined,
          photoUrl:
            typeof body.photoUrl !== "undefined"
              ? body.photoUrl || null
              : undefined,
        },
      });

      if (emp.email) {
        const u = await tx.user.findUnique({ where: { email: emp.email } });
        if (u) {
          await tx.user.update({
            where: { id: u.id },
            data: {
              name:
                `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim() || u.name,
            },
          });
        }
      }

      return emp;
    });

    return NextResponse.json(updated);
  } catch (e: any) {
    if (e?.code === "P2025")
      return NextResponse.json({ error: "not found" }, { status: 404 });
    if (e?.code === "P2002")
      return NextResponse.json(
        { error: "ข้อมูลซ้ำ (empNo/email/idCard)" },
        { status: 409 }
      );
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
