import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const currentPassword = String(body?.currentPassword ?? "");
    const newPassword = String(body?.newPassword ?? "");
    const confirmPassword = String(body?.confirmPassword ?? "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json({ error: "กรุณากรอกข้อมูลให้ครบ" }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" }, { status: 400 });
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: "รหัสใหม่กับยืนยันรหัสไม่ตรงกัน" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return NextResponse.json({ error: "ไม่พบผู้ใช้งาน" }, { status: 404 });

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" }, { status: 403 });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });

    // NOTE: โปรเจคนี้ใช้ NextAuth session strategy = "jwt" (ดูใน src/lib/auth.ts)
    // การ invalidate ทุกอุปกรณ์แบบ server-side ต้องมี tokenVersion/passwordChangedAt แล้วตรวจใน callbacks.jwt
    // ตอนนี้ให้ฝั่ง client เรียก signOut() หลังสำเร็จเพื่อบังคับ login ใหม่

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PATCH /api/me/password failed", err);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดของระบบ" }, { status: 500 });
  }
}