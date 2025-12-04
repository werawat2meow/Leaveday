import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: ดึง leave rights template ทั้งหมด (สิทธิ์การลาตามตำแหน่ง default)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const prefix = searchParams.get("prefix");
  if (prefix) {
    const template = await prisma.leaveRightsTemplate.findFirst({ where: { prefix } });
    if (!template) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: template });
  }
  // ส่งข้อมูล field ตาม schema (ทั้งหมด)
  const templates = await prisma.leaveRightsTemplate.findMany();
  return NextResponse.json({ data: templates });
}

// PUT: อัปเดต leave rights template (default สิทธิ์การลาตามตำแหน่ง)
export async function PUT(req: Request) {
  try {
    const { rows } = await req.json();
    // 1. ลบข้อมูลที่ไม่มีใน rows
    const ids = rows
      .filter((r: any) => r.id)
      .map((r: any) => Number(r.id))
      .filter((id: number) => !isNaN(id));
    if (ids.length > 0) {
      await prisma.leaveRightsTemplate.deleteMany({
        where: { id: { notIn: ids } },
      });
    } else {
      await prisma.leaveRightsTemplate.deleteMany({});
    }

    // 2. update ที่ id เดิม, create สำหรับรายการใหม่
    for (const r of rows) {
      const id = r.id ? Number(r.id) : undefined;
      if (id) {
        await prisma.leaveRightsTemplate.update({
          where: { id },
          data: {
            prefix: r.level,
            maternityLeaveDays: r.maternity === undefined ? 0 : Number(r.maternity),
            ordainLeaveDays: r.ordain === undefined ? 0 : Number(r.ordain),
            annualLeaveDays: r.annualHoliday === undefined ? 0 : Number(r.annualHoliday),
            holidayLeaveDays: r.annualHoliday === undefined ? 0 : Number(r.annualHoliday),
            vacationLeaveDays: r.vacation === undefined ? 0 : Number(r.vacation),
            businessLeaveDays: r.business === undefined ? 0 : Number(r.business),
            sickLeaveDays: r.sick === undefined ? 0 : Number(r.sick),
            unpaidLeaveDays: r.unpaid === undefined ? 0 : Number(r.unpaid),
            birthdayLeaveDays: r.birthday === undefined ? 0 : Number(r.birthday),
          },
        });
      } else {
        await prisma.leaveRightsTemplate.create({
          data: {
            prefix: r.level,
            maternityLeaveDays: r.maternity === undefined ? 0 : Number(r.maternity),
            ordainLeaveDays: r.ordain === undefined ? 0 : Number(r.ordain),
            annualLeaveDays: r.annualHoliday === undefined ? 0 : Number(r.annualHoliday),
            holidayLeaveDays: r.annualHoliday === undefined ? 0 : Number(r.annualHoliday),
            vacationLeaveDays: r.vacation === undefined ? 0 : Number(r.vacation),
            businessLeaveDays: r.business === undefined ? 0 : Number(r.business),
            sickLeaveDays: r.sick === undefined ? 0 : Number(r.sick),
            unpaidLeaveDays: r.unpaid === undefined ? 0 : Number(r.unpaid),
            birthdayLeaveDays: r.birthday === undefined ? 0 : Number(r.birthday),
          },
        });
      }
    }
    // ดึงข้อมูลใหม่กลับไปให้ client
    const refreshed = await prisma.leaveRightsTemplate.findMany();
    return NextResponse.json({ data: refreshed, message: "บันทึกแล้ว" });
  } catch (e) {
    console.error("API leave-rights PUT error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextResponse) {
  try {
    const { employeeId, year, annualLeave, holidayLeave, ...otherFields } = await req.json();

    // ดึง LeaveRights ของปีที่แล้ว
    const lastYearRights = await prisma.leaveRights.findFirst({
      where: { employeeId, year: year - 1 },
    });

    //คำนวณ carry forward (ถ้ามี)
    const carryForwardAnnual = lastYearRights?.annualLeave ?? 0;
    const carryForwardHoliday = lastYearRights?.holidayLeave ?? 0;
    const carryForwardAnnualExpiry = new Date(`${year}-12-31`); // ตัวอย่างวันหมดอายุ
    const carryForwardHolidayExpiry = new Date(`${year}-12-31`);

    // สร้าง LeaveRights สำหรับปีใหม่
    const newRights = await prisma.leaveRights.create({
      data: {
        employeeId,
        year,
        annualLeave,
        holidayLeave,
        carryForwardAnnual,
        carryForwardAnnualExpiry,
        carryForwardHoliday,
        carryForwardHolidayExpiry,
        ...otherFields,
      },
    });

    return NextResponse.json({ ok: true, data: newRights });
  } catch (error) {
    console.error("POST /api/leave-rights error:", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}