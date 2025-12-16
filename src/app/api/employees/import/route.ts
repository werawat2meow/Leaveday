import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

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

      try {
        // ตรวจสอบข้อมูลที่จำเป็น
        if (
          !row.empNo ||
          !row.firstName ||
          !row.lastName ||
          !row.email ||
          !row.idCard
        ) {
          results.failed++;
          results.errors.push(
            `แถว ${rowNumber}: ข้อมูลไม่ครบถ้วน (empNo, firstName, lastName, email, idCard จำเป็น)`
          );
          continue;
        }

        // ตรวจสอบข้อมูลซ้ำ
        const existingUser = await prisma.user.findFirst({
          where: {
            email: row.email, // ✅ เช็ค email อย่างเดียว
          },
        });

        const existingEmployee = await prisma.employee.findFirst({
          where: {
            OR: [
              { empNo: row.empNo },
              { idCard: String(row.idCard) }, // ✅ แปลงเป็น String
              { email: row.email },
            ],
          },
        });

        if (existingUser || existingEmployee) {
          results.failed++;
          results.errors.push(
            `แถว ${rowNumber}: ข้อมูลซ้ำ (empNo: ${row.empNo}, email: ${row.email}, หรือ idCard)`
          );
          continue;
        }

        // สร้างข้อมูลในฐานข้อมูล (รวมการ lookup/create ของ org/dept/div/unit)
        await prisma.$transaction(async (tx) => {
          // 1. สร้าง User
          const passwordHash = await bcrypt.hash(String(row.idCard), 10);
          const user = await tx.user.create({
            data: {
              email: row.email,
              passwordHash,
              role: "USER",
              name: `${row.firstName} ${row.lastName}`,
            },
          });

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

          // 3. สร้าง Employee พร้อม *_Id และ normalized levelP
          const created = await tx.employee.create({
            data: {
              empNo: row.empNo,
              prefix: row.prefix || "",
              firstName: row.firstName,
              lastName: row.lastName,
              email: row.email,
              idCard: String(row.idCard),
              org: orgName || row.org || "",
              department: deptName || row.department || "",
              division: divName || row.division || "",
              unit: unitName || row.unit || "",
              orgId: orgId ?? undefined,
              departmentId: departmentId ?? undefined,
              divisionId: divisionId ?? undefined,
              unitId: unitId ?? undefined,
              levelP: normalizedLevelP || "",
              lineId: row.lineId || "",
              startDate: row.startDate ? new Date(row.startDate) : null,
              weeklyHoliday: row.weeklyHoliday || "",
              photoUrl: row.photoUrl || "",
              userId: user.id,
            },
          });

          // create leaveRights for the employee: prefer explicit row values, else template, else zeros
          const lrTemplate = normalizedLevelP
            ? await tx.leaveRightsTemplate.findFirst({
                where: { prefix: normalizedLevelP },
              })
            : null;

          const hasExplicit =
            typeof row.annualHolidays !== "undefined" ||
            typeof row.vacationDays !== "undefined" ||
            typeof row.businessDays !== "undefined" ||
            typeof row.sickDays !== "undefined" ||
            typeof row.ordainDays !== "undefined" ||
            typeof row.maternityDays !== "undefined" ||
            typeof row.unpaidDays !== "undefined" ||
            typeof row.birthdayDays !== "undefined";

          if (hasExplicit) {
            await tx.leaveRights.create({
              data: {
                employeeId: created.id,
                year: new Date().getFullYear(),
                annualLeave: Number(row.annualHolidays) || 0,
                holidayLeave: 0,
                vacationLeave: Number(row.vacationDays) || 0,
                businessLeave: Number(row.businessDays) || 0,
                sickLeave: Number(row.sickDays) || 0,
                ordainLeave: Number(row.ordainDays) || 0,
                maternityLeave: Number(row.maternityDays) || 0,
                unpaidLeave: Number(row.unpaidDays) || 0,
                birthdayLeave: Number(row.birthdayDays) || 0,
              },
            });
          } else if (lrTemplate) {
            await tx.leaveRights.create({
              data: {
                employeeId: created.id,
                year: new Date().getFullYear(),
                annualLeave: lrTemplate.annualLeaveDays,
                holidayLeave: lrTemplate.holidayLeaveDays,
                vacationLeave: lrTemplate.vacationLeaveDays,
                businessLeave: lrTemplate.businessLeaveDays,
                sickLeave: lrTemplate.sickLeaveDays,
                ordainLeave: lrTemplate.ordainLeaveDays,
                maternityLeave: lrTemplate.maternityLeaveDays,
                unpaidLeave: lrTemplate.unpaidLeaveDays,
                birthdayLeave: lrTemplate.birthdayLeaveDays,
              },
            });
          } else {
            await tx.leaveRights.create({
              data: {
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
