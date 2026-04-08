// src/app/api/employees/route.ts
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import {
  computeCarryForwardAnnualExpiry,
  computeCarryForwardHolidayExpiry,
} from "@/lib/carry-forward-expiry";
import { computeAnnualCarryForwardBucketExpiresAt } from "@/lib/annual-carry-forward-buckets";

type Role = "MASTER_ADMIN" | "ADMIN" | "MANAGER" | "USER";

function toDecimal1(input: unknown) {
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  return Math.round(n * 10) / 10;
}

/* ---------------- GET: list employees ---------------- */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  // if id provided -> return single employee with approvers
  if (id) {
    const n = Number(id);
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json({ error: "invalid id" }, { status: 400 });
    }
    const emp = await prisma.employee.findUnique({
      where: { id: n },
      include: { approvers: true },
    });
    if (!emp) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(emp);
  }

  // otherwise return list (requires session)
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
    const rightsYear = new Date().getFullYear();
    const carryForwardAnnual = toDecimal1(body.carryForwardAnnual);
    const carryForwardHoliday = toDecimal1(body.carryForwardHoliday);

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
          approvers: {
            connect: (body.approverIds ?? []).map((id: number) => ({ id })),
          },
        },
        include: { approvers: true },
      });

      // ดึง LeaveRightsTemplate ตาม prefix (ถ้ามีค่า)
      let template = null;
      if (created.levelP) {
        template = await tx.leaveRightsTemplate.findFirst({
          where: { prefix: created.levelP },
        });
      }

      // สร้าง LeaveRights ให้ employee (ใช้ปีปัจจุบัน)
      const carryForwardAnnualExpiry = computeCarryForwardAnnualExpiry(
        created.startDate,
        rightsYear
      );
      const carryForwardHolidayExpiry = computeCarryForwardHolidayExpiry(rightsYear);

      if (template) {
        await tx.leaveRights.upsert({
          where: {
            employeeId_year: {
              employeeId: created.id,
              year: rightsYear,
            },
          },
          update: {},
          create: {
            employeeId: created.id,
            year: rightsYear,
            annualLeave: template.annualLeaveDays,
            holidayLeave: template.holidayLeaveDays,
            vacationLeave: template.vacationLeaveDays,
            businessLeave: template.businessLeaveDays,
            sickLeave: template.sickLeaveDays,
            ordainLeave: template.ordainLeaveDays,
            maternityLeave: template.maternityLeaveDays,
            unpaidLeave: template.unpaidLeaveDays,
            birthdayLeave: template.birthdayLeaveDays,
            carryForwardAnnual,
            carryForwardAnnualExpiry,
            carryForwardHoliday,
            carryForwardHolidayExpiry,
          },
        });
      } else {
        // ถ้าไม่มี template ให้สร้าง LeaveRights ด้วยค่า default เป็น 0
        await tx.leaveRights.upsert({
          where: {
            employeeId_year: {
              employeeId: created.id,
              year: rightsYear,
            },
          },
          update: {},
          create: {
            employeeId: created.id,
            year: rightsYear,
            annualLeave: 0,
            holidayLeave: 0,
            vacationLeave: 0,
            businessLeave: 0,
            sickLeave: 0,
            ordainLeave: 0,
            maternityLeave: 0,
            unpaidLeave: 0,
            birthdayLeave: 0,
            carryForwardAnnual,
            carryForwardAnnualExpiry,
            carryForwardHoliday,
            carryForwardHolidayExpiry,
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
  if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "MASTER_ADMIN" && role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
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
    return NextResponse.json({ error: "รูปแบบอีเมลไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.employee.findUnique({ where: { id } });

      const rightsYear = new Date().getFullYear();
      const carryForwardAnnualProvided = typeof body.carryForwardAnnual !== "undefined";
      const carryForwardHolidayProvided = typeof body.carryForwardHoliday !== "undefined";
      const startDateProvided = typeof body.startDate !== "undefined";

      const data: any = {
        empNo: body.empNo ?? undefined,
        email: body.email ?? undefined,
        prefix: body.prefix ?? undefined,
        firstName: body.firstName ?? undefined,
        lastName: body.lastName ?? undefined,
        idCard: body.idCard ?? undefined,
        orgId: typeof body.orgId !== "undefined" ? body.orgId : undefined,
        org: typeof body.org !== "undefined" ? body.org : undefined,
        departmentId:
          typeof body.departmentId !== "undefined" ? body.departmentId : undefined,
        department:
          typeof body.department !== "undefined" ? body.department : undefined,
        divisionId:
          typeof body.divisionId !== "undefined" ? body.divisionId : undefined,
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
      };

      const normalizeKey = (raw: string) => {
        if (!raw) return "";
        try {
          const base = process.env.NEXT_PUBLIC_API_URL || process.env.SUPABASE_URL || "";
          const u = new URL(raw, base || undefined);
          const p = u.pathname || "";
          const idx = p.indexOf("/uploads/");
          const key = idx >= 0 ? p.slice(idx + "/uploads/".length) : p.replace(/^\/+/, "");
          return decodeURIComponent(key).replace(/^\/+/, "");
        } catch {
          const s = String(raw).replace(/^.*\/uploads\/?/, "");
          return decodeURIComponent(s).replace(/^\/+/, "");
        }
      };

      // CASE A: explicit delete request -> photoUrl === ""
      if (typeof body.photoUrl !== "undefined" && body.photoUrl === "") {
        if (existing?.photoUrl) {
          try {
            if (process.env.USE_SUPABASE === "true") {
              const { createClient } = await import("@supabase/supabase-js");
              const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
              const key = normalizeKey(String(existing.photoUrl));
              if (key) {
                const attempts = [key, encodeURIComponent(key)];
                let lastError: any = null;
                for (const k of attempts) {
                  const res = await sb.storage.from("uploads").remove([k]);
                  if (!res.error) { lastError = null; break; }
                  lastError = res.error;
                }
                if (lastError) console.warn("[STORAGE DELETE ERROR]", lastError);
              }
            } else {
              const fs = await import("fs/promises");
              const pathMod = await import("path");
              const key = normalizeKey(String(existing.photoUrl));
              if (key) {
                const p = pathMod.join(process.cwd(), "public", "uploads", key);
                await fs.unlink(p).catch(() => {});
              }
            }
          } catch (err) {
            console.warn("[DELETE PHOTO] unexpected:", err);
          }
        }
        data.photoUrl = null;
      }
      // CASE B: client provided a new photoUrl -> maybe delete old if different
      else if (typeof body.photoUrl !== "undefined" && body.photoUrl !== "") {
        const existingKey = existing?.photoUrl ? normalizeKey(String(existing.photoUrl)) : "";
        const incomingKey = normalizeKey(String(body.photoUrl));

        // ลบไฟล์เก่าเฉพาะเมื่อ key ต่างกันจริง (กันกรณี URL รูปแบบต่างกันแต่ไฟล์เดียวกัน)
        if (existingKey && incomingKey && existingKey !== incomingKey) {
          try {
            if (process.env.USE_SUPABASE === "true") {
              const { createClient } = await import("@supabase/supabase-js");
              const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
              const attempts = [existingKey, encodeURIComponent(existingKey)];
                let lastError: any = null;
                for (const k of attempts) {
                  const res = await sb.storage.from("uploads").remove([k]);
                  if (!res.error) { lastError = null; break; }
                  lastError = res.error;
                }
                if (lastError) console.warn("[STORAGE DELETE ERROR]", lastError);
            } else {
              const fs = await import("fs/promises");
              const pathMod = await import("path");
              const p = pathMod.join(process.cwd(), "public", "uploads", existingKey);
              await fs.unlink(p).catch(() => {});
            }
          } catch (err) {
            console.warn("[DELETE OLD PHOTO] unexpected:", err);
          }
        }
        data.photoUrl = body.photoUrl;
      }
      // CASE C: body.photoUrl === undefined -> do nothing (preserve existing photo)

      // approvers handling (only when provided)
      if (typeof body.approverIds !== "undefined") {
        data.approvers = { set: (body.approverIds ?? []).map((id: any) => ({ id: Number(id) })) };
      }

      const emp = await tx.employee.update({
        where: { id },
        data,
        include: { approvers: true },
      });

      // Optional: update carry-forward fields on current-year LeaveRights
      if (carryForwardAnnualProvided || carryForwardHolidayProvided || startDateProvided) {
        // Ensure rights row exists (create with template/zeros if missing)
        const templateKey = emp.levelP || emp.prefix || null;
        const template = templateKey
          ? await tx.leaveRightsTemplate.findFirst({ where: { prefix: templateKey } })
          : null;

        const currentRights = await tx.leaveRights.upsert({
          where: { employeeId_year: { employeeId: emp.id, year: rightsYear } },
          update: {},
          create: {
            employeeId: emp.id,
            year: rightsYear,
            annualLeave: Number(template?.annualLeaveDays ?? 0),
            holidayLeave: Number(template?.holidayLeaveDays ?? 0),
            vacationLeave: Number(template?.vacationLeaveDays ?? 0),
            businessLeave: Number(template?.businessLeaveDays ?? 0),
            sickLeave: Number(template?.sickLeaveDays ?? 0),
            ordainLeave: Number(template?.ordainLeaveDays ?? 0),
            maternityLeave: Number(template?.maternityLeaveDays ?? 0),
            unpaidLeave: Number(template?.unpaidLeaveDays ?? 0),
            birthdayLeave: Number(template?.birthdayLeaveDays ?? 0),
          },
        });

        const rightsUpdate: any = {};
        if (carryForwardAnnualProvided) {
          const cf = toDecimal1(body.carryForwardAnnual);
          rightsUpdate.carryForwardAnnual = cf;
          rightsUpdate.carryForwardAnnualExpiry = computeCarryForwardAnnualExpiry(
            emp.startDate,
            rightsYear
          );

          // Keep the bucket-based annual carry-forward store in sync.
          // This field represents carry-forward from the previous rights year.
          const originYear = rightsYear - 1;
          const bucketExpiresAt = computeAnnualCarryForwardBucketExpiresAt(
            emp.startDate,
            originYear
          );

          if (cf > 0 && bucketExpiresAt) {
            await (tx as any).annualCarryForwardBucket.upsert({
              where: {
                employeeId_originYear: { employeeId: emp.id, originYear },
              },
              update: {
                remaining: cf,
                expiresAt: bucketExpiresAt,
              },
              create: {
                employeeId: emp.id,
                originYear,
                remaining: cf,
                expiresAt: bucketExpiresAt,
              },
            });
          } else if (cf <= 0) {
            // When explicitly set to 0, remove any bucket row for that origin year.
            await (tx as any).annualCarryForwardBucket
              .delete({
                where: {
                  employeeId_originYear: { employeeId: emp.id, originYear },
                },
              })
              .catch(() => {});
          }
        } else if (startDateProvided && Number(currentRights.carryForwardAnnual ?? 0) > 0) {
          rightsUpdate.carryForwardAnnualExpiry = computeCarryForwardAnnualExpiry(
            emp.startDate,
            rightsYear
          );

          // If startDate changes, keep the bucket expiry consistent too.
          const originYear = rightsYear - 1;
          const bucketExpiresAt = computeAnnualCarryForwardBucketExpiresAt(
            emp.startDate,
            originYear
          );
          if (bucketExpiresAt) {
            await (tx as any).annualCarryForwardBucket
              .update({
                where: {
                  employeeId_originYear: { employeeId: emp.id, originYear },
                },
                data: { expiresAt: bucketExpiresAt },
              })
              .catch(() => {});
          }
        }

        if (carryForwardHolidayProvided) {
          const cf = toDecimal1(body.carryForwardHoliday);
          rightsUpdate.carryForwardHoliday = cf;
          rightsUpdate.carryForwardHolidayExpiry = computeCarryForwardHolidayExpiry(rightsYear);
        } else if (startDateProvided && Number(currentRights.carryForwardHoliday ?? 0) > 0) {
          // Holiday carry-forward expiry does not depend on startDate, but keep it consistent.
          rightsUpdate.carryForwardHolidayExpiry = computeCarryForwardHolidayExpiry(rightsYear);
        }

        if (Object.keys(rightsUpdate).length > 0) {
          await tx.leaveRights.update({
            where: { employeeId_year: { employeeId: emp.id, year: rightsYear } },
            data: rightsUpdate,
          });
        }
      }

      if (emp.email) {
        const u = await tx.user.findUnique({ where: { email: emp.email } });
        if (u) {
          await tx.user.update({
            where: { id: u.id },
            data: {
              name: `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim() || u.name,
            },
          });
        }
      }

      return emp;
    });

    return NextResponse.json(updated);
  } catch (e: any) {
    if (e?.code === "P2025") return NextResponse.json({ error: "not found" }, { status: 404 });
    if (e?.code === "P2002")
      return NextResponse.json({ error: "ข้อมูลซ้ำ (empNo/email/idCard)" }, { status: 409 });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}