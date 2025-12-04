// src/app/api/employees/me/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Entitlement = {
  vacation: number;
  business: number;
  sick: number;
  ordainDays: number;
  maternity: number;
  birthday: number;
  unpaid: number;
  annualHolidays: number;
};

function startOfYearUTC(y: number) { return new Date(Date.UTC(y, 0, 1, 0, 0, 0)); }
function startOfNextYearUTC(y: number) { return new Date(Date.UTC(y + 1, 0, 1, 0, 0, 0)); }
function dayDiffInclusive(a: Date, b: Date) {
  const A = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()));
  const B = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()));
  const ONE = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.round((+B - +A) / ONE) + 1);
}

const typeMap: Record<string, keyof Entitlement | undefined> = {
  "Annual Leave": "vacation",
  "Business Leave": "business",
  "Personal Leave": "business",
  "Sick Leave": "sick",
  "Ordain Leave": "ordainDays",
  "Maternity Leave": "maternity",
  "Birthday Leave": "birthday",
  "Leave without Pay": "unpaid",
};

export async function GET() {
 try {
 const session = await getServerSession(authOptions);

  // --- สำคัญมาก: เพิ่ม console.log เพื่อดีบั๊ก Session User ---
  console.log("--- API /api/employees/me ---");
  console.log("Session user object:", session?.user); // ดูว่ามี id, email, อะไรบ้าง

  if (!session?.user) {
    console.log("Error: Unauthorized - No session user found.");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let employee = null as any;

  // 1. ลองค้นหา Employee ด้วย email จาก session ก่อน (เพราะคุณบอกว่า login ด้วย email)
  if (session.user.email) {
    employee = await prisma.employee.findFirst({ where: { email: session.user.email! } });
    console.log(`Attempted to find employee by email: "${session.user.email}". Found: ${employee ? true : false}`);
  }

  // 2. ถ้ายังไม่พบ และ session.user มี 'id' (ซึ่งควรจะเป็น userId ใน Employee table) ให้ลองค้นด้วย userId
  //    ตรวจสอบโครงสร้าง session.user ของคุณให้แน่ใจว่า field 'id' มีอยู่จริงและมีค่าเป็นตัวเลข
  //    ในภาพตาราง Employee ของคุณ, userId เป็น Integer (PK)
  if (!employee && (session.user as any)?.id) {
    const userIdFromSession = Number((session.user as any).id); // แปลงเป็น Number
    if (!isNaN(userIdFromSession)) { // ตรวจสอบว่าเป็นตัวเลขที่ถูกต้อง
        employee = await prisma.employee.findFirst({ where: { userId: userIdFromSession } });
        console.log(`Attempted to find employee by userId: ${userIdFromSession}. Found: ${employee ? true : false}`);
    } else {
        console.log(`Warning: session.user.id is not a valid number: ${(session.user as any).id}`);
    }
  }

  // ถ้ายังหาไม่เจอหลังจากพยายามทั้ง email และ userId
  if (!employee) {
    console.log("Error: Employee not found in DB for the logged-in user.");
    return NextResponse.json({ error: "employee not found" }, { status: 404 });
  }

  // --- ถ้าหา employee พบแล้ว โค้ดส่วนที่เหลือจะทำงานต่อตามปกติ ---
  console.log("Employee found successfully. Processing entitlements.");
const toN = (x: any) => (typeof x === "number" && isFinite(x) ? x : 0);
  // 2) สิทธิ์: ถ้ามี LeaveRights ของ levelP ใช้อันนั้น ไม่งั้นใช้ LeaveRightsTemplate ตาม prefix
  let entitled: Entitlement = {
    vacation: 0,
    business: 0,
    sick: 0,
    ordainDays: 0,
    maternity: 0,
    birthday: 0,
    unpaid: 0,
    annualHolidays: 0,
  };

  // ถ้ามี LeaveRights ของ levelP (สิทธิ์จริง)
  if (employee.levelP) {
    const lr = await prisma.leaveRights.findFirst({ where: { employeeId: employee.id, year: new Date().getFullYear() } });
    if (lr) {
      entitled.vacation = toN(lr.vacationLeave);
      entitled.business = toN(lr.businessLeave);
      entitled.sick     = toN(lr.sickLeave);
      entitled.ordainDays = toN(lr.ordainLeave);
      entitled.maternity  = toN(lr.maternityLeave);
      entitled.birthday   = toN(lr.birthdayLeave);
      entitled.unpaid     = toN(lr.unpaidLeave);
      entitled.annualHolidays = toN(lr.holidayLeave);
    }
  }

  // ถ้าไม่มี LeaveRights ให้ fallback เป็น LeaveRightsTemplate ตาม prefix
  if ((entitled.vacation + entitled.business + entitled.sick) === 0 && employee.prefix) {
    const template = await prisma.leaveRightsTemplate.findFirst({ where: { prefix: employee.prefix } });
    if (template) {
      entitled.vacation = toN(template.vacationLeaveDays);
      entitled.business = toN(template.businessLeaveDays);
      entitled.sick     = toN(template.sickLeaveDays);
      entitled.ordainDays = toN(template.ordainLeaveDays);
      entitled.maternity  = toN(template.maternityLeaveDays);
      entitled.birthday   = toN(template.birthdayLeaveDays);
      entitled.unpaid     = toN(template.unpaidLeaveDays);
      entitled.annualHolidays = toN(template.holidayLeaveDays);
    }
  }

  // 3) คำนวนใบลาที่ใช้ไปใน "ปีนี้" (เฉพาะอนุมัติแล้ว)
  // const year = new Date().getUTCFullYear();
  // const from = startOfYearUTC(year);
  // const to = startOfNextYearUTC(year);

const from = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
const to   = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 0, 1));

// ✅ สร้าง where แบบปลอดภัย - หัก PENDING และ APPROVED (ไม่หัก REJECTED)
// เมื่อแจ้งลาจะหักสิทธิ์ทันที และจะคืนเมื่อถูก REJECTED
const whereLeave: any = {
  status: { in: ["PENDING", "APPROVED"] },
  startDate: { gte: from, lt: to },
};

if (employee?.email) {
  whereLeave.user = { is: { email: employee.email } };
} else if (typeof employee?.userId === "number") {
  // กันกรณี employee ไม่มี email แต่ผูกกับ userId
  whereLeave.userId = employee.userId;
}

const approved = await prisma.leave.findMany({
  where: whereLeave,
  select: {
    kind: true,
    startDate: true,
    endDate: true,
    session: true,
    requestedDays: true,
  },
});

  // const used: Entitlement = { vacation: 0, business: 0, sick: 0 };
  // for (const l of approved) {
  //   const bucket = typeMap[l.type];
  //   if (!bucket) continue;
  //   const n = dayDiffInclusive(new Date(l.startDate), new Date(l.endDate));
  //   used[bucket] += n;
  // }

  const used: Entitlement = {
    vacation: 0, business: 0, sick: 0,
    ordainDays: 0, maternity: 0, birthday: 0, unpaid: 0,
    annualHolidays: 0,
  };

  for (const l of approved) {
    // ใช้ l.kind (เช่น "ANNUAL", "SICK", "BUSINESS", ฯลฯ)
    // ใช้ l.requestedDays ถ้ามี หรือคำนวณจาก startDate/endDate
    let days = typeof l.requestedDays === "number" ? l.requestedDays : dayDiffInclusive(new Date(l.startDate), new Date(l.endDate));
    switch (l.kind) {
      case "ANNUAL":        used.vacation      += days; break;
      case "SICK":          used.sick          += days; break;
      case "BUSINESS":      used.business      += days; break;
      case "UNPAID":        used.unpaid        += days; break;
      case "BIRTHDAY":      used.birthday      += days; break;
      case "ORDAIN":        used.ordainDays    += days; break;
      case "MATERNITY":     used.maternity     += days; break;
      case "ANNUAL_HOLIDAY": used.annualHolidays += days; break; // ลาโดยใช้วันหยุดประจำปี
      // เพิ่มประเภทอื่น ๆ ตาม schema
    }
  }

  const remaining: Entitlement = {
    vacation:        Math.max(0, entitled.vacation   - used.vacation),
    business:        Math.max(0, entitled.business   - used.business),
    sick:            Math.max(0, entitled.sick       - used.sick),
    ordainDays:      Math.max(0, entitled.ordainDays - used.ordainDays),
    maternity:       Math.max(0, entitled.maternity  - used.maternity),
    birthday:        Math.max(0, entitled.birthday   - used.birthday),
    unpaid:          Math.max(0, entitled.unpaid     - used.unpaid),
    annualHolidays:  entitled.annualHolidays, // 🟢 ไม่ลด
  };

  // 4) ส่งข้อมูล employee + สิทธิ์
  return NextResponse.json({
    employee: {
      empNo: employee.empNo,
      email: employee.email ?? "",
      prefix: employee.prefix ?? "",
      firstName: employee.firstName,
      lastName: employee.lastName,
      position: employee.org ?? employee.division ?? employee.department ?? "",
      section: employee.unit ?? "",
      department: employee.department ?? "",
      levelP: employee.levelP ?? "",
      idCard: employee.idCard ?? "",
      photoUrl: employee.photoUrl ?? null,
    },
    rights: { entitled, used, remaining, levelFrom: employee.levelP ?? null },
  });
 } catch (e: any){
    console.error("GET /api/employees/me error:", e);
    return NextResponse.json(
      { error: e?.message || "internal_error" },
      { status: 500 }
    );
  }
}