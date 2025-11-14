import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

type Role = "MASTER_ADMIN" | "ADMIN" | "MANAGER" | "USER";

/* ---------------- Helpers ---------------- */
const canWrite = (role?: Role) => role === "MASTER_ADMIN" || role === "ADMIN";
const trimOrNull = (v?: string | null) =>
  v && v.toString().trim() !== "" ? v.toString().trim() : null;
const normalizeEmail = (v?: string | null) => {
  const s = trimOrNull(v);
  return s ? s.toLowerCase() : null;
};
const isEmail = (s?: string | null) =>
  !!s && /^\S+@\S+\.\S+$/.test(s);

function genTempPassword(len = 10) {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/* ---------------- GET: list approvers ---------------- */
export async function GET() {
  const items = await prisma.approver.findMany({ orderBy: { id: "desc" } });
  return NextResponse.json(items);
}

/* ---------------- POST: create approver (+ auto create User MANAGER) ---------------- */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session as any)?.role as Role | undefined;
  if (!canWrite(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  type Body = {
    prefix?: string;
    firstNameTh?: string;
    lastNameTh?: string;
    firstNameEn?: string;
    lastNameEn?: string;
    empNo?: string;
    citizenId?: string;
    org?: string;
    department?: string;
    division?: string;
    unit?: string;
    level?: string;
    lineId?: string;
    email?: string;
  };

  const body = (await req.json().catch(() => ({}))) as Body;

  // validate required
  if (!body?.firstNameTh || !body?.lastNameTh || !body?.empNo) {
    return NextResponse.json(
      { error: "firstNameTh/lastNameTh/empNo is required" },
      { status: 400 }
    );
  }
  // validate email if provided
  if (body.email && !isEmail(body.email)) {
    return NextResponse.json(
      { error: "invalid email format" },
      { status: 400 }
    );
  }

  try {
    const saved = await prisma.$transaction(async (tx) => {
      // 1) create approver
      const approver = await tx.approver.create({
        data: {
          prefix: trimOrNull(body.prefix),
          firstNameTh: String(body.firstNameTh).trim(),
          lastNameTh: String(body.lastNameTh).trim(),
          firstNameEn: trimOrNull(body.firstNameEn),
          lastNameEn: trimOrNull(body.lastNameEn),
          empNo: String(body.empNo).trim(),
          citizenId: trimOrNull(body.citizenId),
          org: trimOrNull(body.org),
          department: trimOrNull(body.department),
          division: trimOrNull(body.division),
          unit: trimOrNull(body.unit),
          level: trimOrNull(body.level),
          lineId: trimOrNull(body.lineId),
          email: normalizeEmail(body.email),
        },
      });

      // 2) upsert user by email (role = MANAGER)
      if (approver.email) {
        const displayName = `${approver.firstNameTh} ${approver.lastNameTh}`.trim();
        const existed = await tx.user.findUnique({ where: { email: approver.email } });

        if (!existed) {
  // 👉 ใช้เลขบัตรประชาชนเป็นรหัสผ่านเริ่มต้น
          const rawPassword = approver.citizenId || "123456"; // fallback เผื่อไม่มี
          const passwordHash = await bcrypt.hash(String(rawPassword), 10);

          await tx.user.create({
            data: {
              name: displayName,
              email: approver.email,
              passwordHash,
              role: "MANAGER",
            },
          });

          // ✅ แจ้งกลับให้ frontend เฉพาะบัตรประชาชน
          (approver as any).__tmpPassword = rawPassword;
        } else {
          await tx.user.update({
            where: { email: approver.email },
            data: { name: displayName || existed.name },
          });
        }
      }

      return approver;
    });

    return NextResponse.json(saved, { status: 201 });
  } catch (e: any) {
    console.error("[POST /approvers] error =", e);
    if (e?.code === "P2002") {
      // unique constraint
      return NextResponse.json(
        { error: "duplicate empNo/citizenId/email" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/* ---------------- PUT: update approver (+ sync User) ---------------- */
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session as any)?.role as Role | undefined;
  if (!canWrite(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  type Patch = {
    prefix?: string;
    firstNameTh?: string;
    lastNameTh?: string;
    firstNameEn?: string;
    lastNameEn?: string;
    empNo?: string;
    citizenId?: string;
    org?: string;
    department?: string;
    division?: string;
    unit?: string;
    level?: string;
    lineId?: string;
    email?: string;
  };

  const body = (await req.json().catch(() => ({}))) as Partial<Patch>;

  // email format (if included in patch)
  if (typeof body.email !== "undefined" && body.email && !isEmail(body.email)) {
    return NextResponse.json({ error: "invalid email format" }, { status: 400 });
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // build update data with trim/null
      const data: any = {};
      for (const [k, v] of Object.entries(body)) {
        if (v === undefined) continue;
        if (k === "email") data.email = normalizeEmail(v as string);
        else if (typeof v === "string") data[k] = trimOrNull(v);
        else data[k] = v;
      }

      const approver = await tx.approver.update({ where: { id }, data });

      // sync user if email included
      const effectiveEmail = typeof body.email !== "undefined"
        ? normalizeEmail(body.email as string)
        : approver.email;

      if (effectiveEmail) {
        const existed = await tx.user.findUnique({ where: { email: effectiveEmail } });
        const displayName = `${body.firstNameTh ?? approver.firstNameTh} ${body.lastNameTh ?? approver.lastNameTh}`.trim();

        if (!existed) {
          const rawPassword = approver.citizenId || "123456";
          const passwordHash = await bcrypt.hash(String(rawPassword), 10);
          await tx.user.create({
            data: {
              name: displayName,
              email: effectiveEmail,
              passwordHash,
              role: "MANAGER",
            },
          });
          (approver as any).__tmpPassword = rawPassword;
        } else {
          await tx.user.update({
            where: { email: effectiveEmail },
            data: { name: displayName || existed.name },
          });
        }
      }

      return approver;
    });

    return NextResponse.json(updated);
  } catch (e: any) {
    console.error("[PUT /approvers] error =", e);
    if (e?.code === "P2025")
      return NextResponse.json({ error: "not found" }, { status: 404 });
    if (e?.code === "P2002")
      return NextResponse.json(
        { error: "duplicate empNo/citizenId/email" },
        { status: 409 }
      );
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
