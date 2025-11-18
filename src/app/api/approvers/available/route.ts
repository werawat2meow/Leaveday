import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma"; 

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        }

        // หา employee ของ user ปัจจุบัน
        let employee: any = null;

        if (session.user.email) {
            employee = await prisma.employee.findFirst({
                where: { email: session.user.email },
            });
        }

        if (!employee && (session.user as any)?.id) {
            const userIdFromSession = Number((session.user as any).id);
            if (!isNaN(userIdFromSession)) {
                employee = await prisma.employee.findFirst({
                    where: { userId: userIdFromSession },
                });
            }
        }

        if (!employee) {
            return NextResponse.json(
                { error: "employee not found" },
                { status: 404 }
            );
        }

        //filter ตามสังกัดพนักงาน
        const where: any = {};

        if (employee.org) {
        where.org = { equals: employee.org, mode: "insensitive" };
        }

        // (ยังไม่ใช้ department ไปก่อน ช่วงนี้ข้อมูลยังไม่ตรง)
        // if (employee.department) {
        //   where.department = { equals: employee.department, mode: "insensitive" };
        // }

        const approvers = await prisma.approver.findMany({
        where,
        orderBy: [{ firstNameTh: "asc" }],
        });

        const result = approvers.map((a) => ({
            id: a.id,
            name: `${a.prefix ?? ""}${a.firstNameTh} ${a.lastNameTh}`,
            empNo: a.empNo,
            department: a.department,
            division: a.division,
            unit: a.unit,
            level: a.level,
            email: a.email,
            label: `${a.prefix ?? ""}${a.firstNameTh} ${a.lastNameTh}${a.department ? ` (${a.department})` : ""}`,
        }));
        return NextResponse.json({ data: result });
        
    } catch (err) {
        console.error("GET /approvers/available error:", err);
        return NextResponse.json({ error: "server error" }, { status: 500 });
    }
}