import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

function toIntOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

// Supports: Date | Excel serial number | string "d/m/yyyy" (also Buddhist year)
function toDateOrNull(v: any): Date | null {
  if (v === null || v === undefined || v === "") return null;

  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;

  // Excel serial date (day 0 = 1899-12-30)
  if (typeof v === "number" && Number.isFinite(v)) {
    const epoch = Date.UTC(1899, 11, 30);
    const d = new Date(epoch + v * 24 * 60 * 60 * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const s = String(v).trim();

  // Try d/m/yyyy (including Buddhist year)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = Number(m[3]);
    if (year > 2400) year -= 543; // Buddhist Era -> AD
    const d = new Date(year, month - 1, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function anniversaryInYear(startDate: Date, year: number): Date {
  return new Date(year, startDate.getMonth(), startDate.getDate());
}

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
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });

    if (!jsonData || jsonData.length === 0) {
      return NextResponse.json(
        { error: "ไฟล์ Excel ว่างเปล่า" },
        { status: 400 }
      );
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

      // normalize fields -> cast to string to match Prisma schema types
      const norm = (v: any) =>
        v === null || v === undefined ? "" : String(v).trim();
      const empNo = norm(row.empNo);
      const idCard = norm(row.idCard);
      const email = norm(row.email);
      const firstName = norm(row.firstName);
      const lastName = norm(row.lastName);
      const prefix = norm(row.prefix);
      const lineId = norm(row.lineId);
      const weeklyHoliday = norm(row.weeklyHoliday);
      const photoUrl = norm(row.photoUrl);

      try {
        // ตรวจสอบข้อมูลที่จำเป็น
        if (!empNo || !firstName || !lastName || !email || !idCard) {
          results.failed++;
          results.errors.push(
            `แถว ${rowNumber}: ข้อมูลไม่ครบถ้วน (empNo, firstName, lastName, email, idCard จำเป็น)`
          );
          continue;
        }


        // ค้นหาข้อมูลเดิม (user/employee)
        const existingUser = await prisma.user.findFirst({ where: { email } });
        const existingEmployee = await prisma.employee.findFirst({
          where: {
            OR: [{ empNo }, { idCard }, { email }],
          },
        });

        // สร้างหรืออัปเดตข้อมูลในฐานข้อมูล (รวมการ lookup/create ของ org/dept/div/unit)
        await prisma.$transaction(async (tx) => {
          // 1. สร้างหรืออัปเดต User
          let user;
          if (existingUser) {
            user = await tx.user.update({
              where: { id: existingUser.id },
              data: {
                name: `${firstName} ${lastName}`,
                // เพิ่ม field อื่นๆ ที่ต้องการอัปเดต เช่น passwordHash ถ้าต้องการ
              },
            });
          } else {
            const passwordHash = await bcrypt.hash(idCard, 10);
            user = await tx.user.create({
              data: {
                email,
                passwordHash,
                role: "USER",
                name: `${firstName} ${lastName}`,
              },
            });
          }

          // 2. Lookup / create organization, department, division, unit (auto-create when not found)
          const trim = (v: any) => (v == null ? "" : String(v).trim());
          const orgName = trim(row.org);
          const deptName = trim(row.department);
          const divName = trim(row.division);
          const unitName = trim(row.unit);

          let orgId: number | null = null;
          if (orgName) {
            let orgRec = await tx.organization.findFirst({
              where: { name: { equals: orgName, mode: "insensitive" } },
            });
            if (!orgRec) {
              orgRec = await tx.organization.create({
                data: { name: orgName },
              });
            }
            orgId = orgRec.id;
          }

          let departmentId: number | null = null;
          if (deptName) {
            const whereDept: any = orgId
              ? {
                  name: { equals: deptName, mode: "insensitive" },
                  organizationId: orgId,
                }
              : { name: { equals: deptName, mode: "insensitive" } };
            let deptRec = await tx.department.findFirst({ where: whereDept });
            if (!deptRec) {
              if (orgId == null) {
                // create a fallback organization to attach the department
                const fallbackOrg = await tx.organization.create({
                  data: { name: orgName || `Org for ${deptName}` },
                });
                deptRec = await tx.department.create({
                  data: {
                    name: deptName,
                    organizationId: fallbackOrg.id as number,
                  },
                });
                orgId = fallbackOrg.id;
              } else {
                deptRec = await tx.department.create({
                  data: { name: deptName, organizationId: orgId as number },
                });
              }
            }
            departmentId = deptRec.id;
          }

          let divisionId: number | null = null;
          if (divName) {
            const whereDiv: any = departmentId
              ? { name: { equals: divName, mode: "insensitive" }, departmentId }
              : { name: { equals: divName, mode: "insensitive" } };
            let divRec = await tx.division.findFirst({ where: whereDiv });
            if (!divRec) {
              if (!departmentId) {
                // ensure an organization exists to attach new department
                let ensureOrgId = orgId;
                if (!ensureOrgId) {
                  const fallbackOrg = await tx.organization.create({
                    data: { name: orgName || `Org for ${divName}` },
                  });
                  ensureOrgId = fallbackOrg.id;
                  orgId = ensureOrgId;
                }
                const fallbackDept = await tx.department.create({
                  data: {
                    name: deptName || `Dept for ${divName}`,
                    organizationId: ensureOrgId as number,
                  },
                });
                divRec = await tx.division.create({
                  data: { name: divName, departmentId: fallbackDept.id },
                });
                divisionId = divRec.id;
              } else {
                divRec = await tx.division.create({
                  data: { name: divName, departmentId: departmentId as number },
                });
                divisionId = divRec.id;
              }
            } else {
              divisionId = divRec.id;
            }
          }

          let unitId: number | null = null;
          if (unitName) {
            const whereUnit: any = divisionId
              ? { name: { equals: unitName, mode: "insensitive" }, divisionId }
              : { name: { equals: unitName, mode: "insensitive" } };
            let unitRec = await tx.unit.findFirst({ where: whereUnit });
            if (!unitRec) {
              if (!divisionId) {
                // ensure department exists to attach new division
                let ensureDeptId = departmentId;
                if (!ensureDeptId) {
                  // ensure organization exists
                  let ensureOrgId2 = orgId;
                  if (!ensureOrgId2) {
                    const fallbackOrg2 = await tx.organization.create({
                      data: { name: orgName || `Org for ${unitName}` },
                    });
                    ensureOrgId2 = fallbackOrg2.id;
                    orgId = ensureOrgId2;
                  }
                  const fallbackDept2 = await tx.department.create({
                    data: {
                      name: deptName || `Dept for ${unitName}`,
                      organizationId: ensureOrgId2 as number,
                    },
                  });
                  ensureDeptId = fallbackDept2.id;
                  departmentId = ensureDeptId;
                }
                const fallbackDiv2 = await tx.division.create({
                  data: {
                    name: divName || `Div for ${unitName}`,
                    departmentId: ensureDeptId as number,
                  },
                });
                unitRec = await tx.unit.create({
                  data: { name: unitName, divisionId: fallbackDiv2.id },
                });
                unitId = unitRec.id;
              } else {
                unitRec = await tx.unit.create({
                  data: { name: unitName, divisionId: divisionId as number },
                });
                unitId = unitRec.id;
              }
            } else {
              unitId = unitRec.id;
            }
          }

          // normalize levelP to P# if numeric
          const rawLevel = trim(row.levelP || row.level || "");
          let normalizedLevelP = rawLevel;
          if (
            normalizedLevelP &&
            !normalizedLevelP.startsWith("P") &&
            /^\d+$/.test(normalizedLevelP)
          ) {
            normalizedLevelP = `P${normalizedLevelP}`;
          }

          const startDate = toDateOrNull(row.startDate);

          // 3. สร้างหรืออัปเดต Employee พร้อม *_Id และ normalized levelP
          let employeeRec;
          if (existingEmployee) {
            employeeRec = await tx.employee.update({
              where: { id: existingEmployee.id },
              data: {
                empNo,
                prefix: prefix || "",
                firstName,
                lastName,
                email,
                idCard,
                org: orgName || row.org || "",
                department: deptName || row.department || "",
                division: divName || row.division || "",
                unit: unitName || row.unit || "",
                orgId: orgId ?? undefined,
                departmentId: departmentId ?? undefined,
                divisionId: divisionId ?? undefined,
                unitId: unitId ?? undefined,
                levelP: normalizedLevelP || "",
                lineId: lineId || "",
                startDate,
                weeklyHoliday: weeklyHoliday || "",
                photoUrl: photoUrl || "",
                userId: user.id,
              },
            });
          } else {
            employeeRec = await tx.employee.create({
              data: {
                empNo,
                prefix: prefix || "",
                firstName,
                lastName,
                email,
                idCard,
                org: orgName || row.org || "",
                department: deptName || row.department || "",
                division: divName || row.division || "",
                unit: unitName || row.unit || "",
                orgId: orgId ?? undefined,
                departmentId: departmentId ?? undefined,
                divisionId: divisionId ?? undefined,
                unitId: unitId ?? undefined,
                levelP: normalizedLevelP || "",
                lineId: lineId || "",
                startDate,
                weeklyHoliday: weeklyHoliday || "",
                photoUrl: photoUrl || "",
                userId: user.id,
              },
            });
          }

          // create leaveRights for the employee: prefer template, else explicit, else zeros
          const lrTemplate = normalizedLevelP
            ? await tx.leaveRightsTemplate.findFirst({
                where: { prefix: normalizedLevelP },
              })
            : null;

          const currentYear = new Date().getFullYear();

          const hasExplicit =
            typeof row.annualHolidays !== "undefined" ||
            typeof row.vacationDays !== "undefined" ||
            typeof row.businessDays !== "undefined" ||
            typeof row.sickDays !== "undefined" ||
            typeof row.ordainDays !== "undefined" ||
            typeof row.maternityDays !== "undefined" ||
            typeof row.unpaidDays !== "undefined" ||
            typeof row.birthdayDays !== "undefined";

          // ---- NEW: carry forward from Excel (optional) -> goes into LeaveRights table ----
          const hasCfAnnual = typeof row.carryForwardAnnual !== "undefined";
          const hasCfAnnualExpiry =
            typeof row.carryForwardAnnualExpiry !== "undefined";
          const hasCfHoliday = typeof row.carryForwardHoliday !== "undefined";
          const hasCfHolidayExpiry =
            typeof row.carryForwardHolidayExpiry !== "undefined";

          const cfAnnual = hasCfAnnual
            ? toIntOrNull(row.carryForwardAnnual) ?? 0
            : 0;
          const cfHoliday = hasCfHoliday
            ? toIntOrNull(row.carryForwardHoliday) ?? 0
            : 0;

          const cfAnnualExpiry =
            (hasCfAnnualExpiry
              ? toDateOrNull(row.carryForwardAnnualExpiry)
              : null) ??
            (cfAnnual > 0 && startDate
              ? anniversaryInYear(startDate, currentYear)
              : null);

          const cfHolidayExpiry =
            (hasCfHolidayExpiry
              ? toDateOrNull(row.carryForwardHolidayExpiry)
              : null) ?? (cfHoliday > 0 ? new Date(currentYear, 8, 30) : null); // 30/09

          const carryCreate = {
            carryForwardAnnual: cfAnnual,
            carryForwardAnnualExpiry: cfAnnualExpiry,
            carryForwardHoliday: cfHoliday,
            carryForwardHolidayExpiry: cfHolidayExpiry,
          };

          // ถ้า import ซ้ำ จะให้ปรับ carry forward ได้ด้วย
          const carryUpdate = {
            carryForwardAnnual: cfAnnual,
            carryForwardAnnualExpiry: cfAnnualExpiry,
            carryForwardHoliday: cfHoliday,
            carryForwardHolidayExpiry: cfHolidayExpiry,
          };
          // ---- end carry forward ----

          // Prefer template when available (match manual add behavior)
          if (lrTemplate) {
            await tx.leaveRights.upsert({
              where: {
                employeeId_year: {
                  employeeId: employeeRec.id,
                  year: currentYear,
                },
              },
              update: carryUpdate,
              create: {
                employeeId: employeeRec.id,
                year: currentYear,
                annualLeave: lrTemplate.annualLeaveDays,
                holidayLeave: lrTemplate.holidayLeaveDays,
                vacationLeave: lrTemplate.vacationLeaveDays,
                businessLeave: lrTemplate.businessLeaveDays,
                sickLeave: lrTemplate.sickLeaveDays,
                ordainLeave: lrTemplate.ordainLeaveDays,
                maternityLeave: lrTemplate.maternityLeaveDays,
                unpaidLeave: lrTemplate.unpaidLeaveDays,
                birthdayLeave: lrTemplate.birthdayLeaveDays,
                ...carryCreate,
              },
            });
          } else if (hasExplicit) {
            await tx.leaveRights.upsert({
              where: {
                employeeId_year: {
                  employeeId: employeeRec.id,
                  year: currentYear,
                },
              },
              update: carryUpdate,
              create: {
                employeeId: employeeRec.id,
                year: currentYear,
                annualLeave: Number(row.annualHolidays) || 0,
                holidayLeave: 0,
                vacationLeave: Number(row.vacationDays) || 0,
                businessLeave: Number(row.businessDays) || 0,
                sickLeave: Number(row.sickDays) || 0,
                ordainLeave: Number(row.ordainDays) || 0,
                maternityLeave: Number(row.maternityDays) || 0,
                unpaidLeave: Number(row.unpaidDays) || 0,
                birthdayLeave: Number(row.birthdayDays) || 0,
                ...carryCreate,
              },
            });
          } else {
            await tx.leaveRights.upsert({
              where: {
                employeeId_year: {
                  employeeId: employeeRec.id,
                  year: currentYear,
                },
              },
              update: carryUpdate,
              create: {
                employeeId: employeeRec.id,
                year: currentYear,
                annualLeave: 0,
                holidayLeave: 0,
                vacationLeave: 0,
                businessLeave: 0,
                sickLeave: 0,
                ordainLeave: 0,
                maternityLeave: 0,
                unpaidLeave: 0,
                birthdayLeave: 0,
                ...carryCreate,
              },
            });
          }
        });

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(
          `แถว ${rowNumber}: ${
            error instanceof Error ? error.message : "เกิดข้อผิดพลาด"
          }`
        );
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
