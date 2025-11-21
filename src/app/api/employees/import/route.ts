import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "ไม่พบไฟล์" }, { status: 400 });
    }

    // อ่านไฟล์ Excel
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    if (!jsonData || jsonData.length === 0) {
      return NextResponse.json({ error: "ไฟล์ Excel ว่างเปล่า" }, { status: 400 });
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    // วนลูปประมวลผลแต่ละแถว
    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i] as any;
      const rowNumber = i + 2; // Excel row เริ่มต้นที่ 2 (หลัง header)

      try {
        // ตรวจสอบข้อมูลที่จำเป็น
        if (!row.empNo || !row.firstName || !row.lastName || !row.email || !row.idCard) {
          results.failed++;
          results.errors.push(`แถว ${rowNumber}: ข้อมูลไม่ครบถ้วน (empNo, firstName, lastName, email, idCard จำเป็น)`);
          continue;
        }

        // ตรวจสอบข้อมูลซ้ำ
        const existingUser = await prisma.user.findFirst({
          where: {
            email: row.email  // ✅ เช็ค email อย่างเดียว
          }
        });

        const existingEmployee = await prisma.employee.findFirst({
          where: {
            OR: [
              { empNo: row.empNo },
              { idCard: String(row.idCard) }, // ✅ แปลงเป็น String
              { email: row.email }
            ]
          }
        });

        if (existingUser || existingEmployee) {
          results.failed++;
          results.errors.push(`แถว ${rowNumber}: ข้อมูลซ้ำ (empNo: ${row.empNo}, email: ${row.email}, หรือ idCard)`);
          continue;
        }

        // สร้างข้อมูลในฐานข้อมูล
        await prisma.$transaction(async (tx) => {
          // 1. สร้าง User
          const passwordHash = await bcrypt.hash(String(row.idCard), 10); // ✅ แปลงเป็น String
          const user = await tx.user.create({
            data: {
              email: row.email,
              passwordHash,
              role: "USER",
              name: `${row.firstName} ${row.lastName}`, // ✅ เพิ่ม name กลับมา
            },
          });

          // 2. สร้าง Employee
          await tx.employee.create({
            data: {
              empNo: row.empNo,
              prefix: row.prefix || "",
              firstName: row.firstName,
              lastName: row.lastName,
              email: row.email,
              idCard: String(row.idCard), // ✅ แปลงเป็น String
              org: row.org || "",
              department: row.department || "",
              division: row.division || "",
              unit: row.unit || "",
              levelP: row.levelP || "",
              lineId: row.lineId || "",
              startDate: row.startDate ? new Date(row.startDate) : null,
              weeklyHoliday: row.weeklyHoliday || "",
              vacationDays: Number(row.vacationDays) || 0,
              businessDays: Number(row.businessDays) || 0,
              sickDays: Number(row.sickDays) || 0,
              ordainDays: Number(row.ordainDays) || 0,
              maternityDays: Number(row.maternityDays) || 0,
              unpaidDays: Number(row.unpaidDays) || 0,
              birthdayDays: Number(row.birthdayDays) || 0,
              annualHolidays: Number(row.annualHolidays) || 0,
              photoUrl: row.photoUrl || "",
              userId: user.id,
            },
          });
        });

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`แถว ${rowNumber}: ${error instanceof Error ? error.message : "เกิดข้อผิดพลาด"}`);
        console.error(`[IMPORT_ERROR] Row ${rowNumber}:`, error);
      }
    }

    return NextResponse.json({
      success: results.success,
      failed: results.failed,
      errors: results.errors,
      message: `Import เสร็จสิ้น: สำเร็จ ${results.success} คน, ล้มเหลว ${results.failed} คน`,
    });

  } catch (error) {
    console.error("[IMPORT_API_ERROR]", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการประมวลผล Excel" },
      { status: 500 }
    );
  }
}