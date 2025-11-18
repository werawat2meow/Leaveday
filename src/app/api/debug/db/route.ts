// src/app/api/debug/db/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; // ใช้ตัวเดียวกับที่ auth ใช้

export async function GET() {
  try {
    const user = await prisma.user.findFirst(); // ชื่อ model ใน Prisma ของตาราง user
    return NextResponse.json({ ok: true, user });
  } catch (err: any) {
    console.error("DB ERROR:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "unknown error" },
      { status: 500 }
    );
  }
}
