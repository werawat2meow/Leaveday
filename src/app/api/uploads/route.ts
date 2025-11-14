import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

export const runtime = "nodejs";

// ใช้ Node runtime (ต้องเขียนไฟล์ลงดิสก์)
export async function POST(req: NextRequest) {
    try {
        const form = await req.formData();
        const file = form.get("file") as File | null;
        if (!file) {
            return NextResponse.json({ error: "no file"}, { status: 400 });
        }

        // validate ชนิดไฟล์แบบง่าย ๆ
        if (!file.type.startsWith("image/")) {
            return NextResponse.json({ error: "only image allowed"}, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // ตั้งชื่อไฟล์ไม่ซ้ำ
        const ext = file.name.split(".").pop() ?? "png";
        const name = crypto.randomBytes(8).toString("hex");
        const filename = `${Date.now()}-${name}.${ext}`;

        // โฟล์เดอร์ปลายทาง (public/uploads)
        const folder = path.join(process.cwd(), "public", "uploads");
        await mkdir(folder, { recursive: true });
        await writeFile(path.join(folder, filename), buffer);

        const url = `/uploads/${filename}`; // เสิร์ฟจาก public/
        return NextResponse.json({ url }, { status: 201 });
    } catch (e) {
        console.log(e);
        return NextResponse.json({ error: "upload failed"}, { status: 500 });
    }
}