import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const currentYear = new Date().getFullYear();

        // 1. Monthly Leaves - วันลาเฉลี่ยรายเดือน
        const monthlyData = await prisma.leave.groupBy({
            by: ['startDate'],
            _sum: { requestedDays: true },
            _count: true,
            where: {
                status: 'APPROVED',
                startDate: {
                    gte: new Date(`${currentYear}-01-01`),
                    lt: new Date(`${currentYear + 1}-01-01`),
                }
            }
        });

        //จัดกลุ่มตามเดือน
        const monthlyLeaves = Array.from({ length: 12 }, (_, i) => {
            const monthName = new Date(currentYear, i, 1).toLocaleDateString("en", { month: "short" });

            const monthdata = monthlyData.filter(item =>
                new Date(item.startDate).getMonth() === i
            );

            const totalDays = monthdata.reduce(
                (sum, item) => sum + Number(item._sum.requestedDays || 0),
                0
            );

            const totalRequests = monthdata.reduce(
                (sum, item) => sum + item._count,
                0
            );

            return {
                m: monthName,
                avgDays: totalRequests > 0 ? Number((totalDays / totalRequests).toFixed(1)) : 0
            };
            });

        //         const monthlyLeaves = [
        //   { m: "Jan", avgDays: 0.8 },
        //   { m: "Feb", avgDays: 1.2 },
        //   { m: "Mar", avgDays: 1.5 },
        //   { m: "Apr", avgDays: 0.9 },
        //   { m: "May", avgDays: 2.1 },
        //   { m: "Jun", avgDays: 1.7 },
        //   { m: "Jul", avgDays: 2.3 },
        //   { m: "Aug", avgDays: 1.1 },
        //   { m: "Sep", avgDays: 0.6 },
        //   { m: "Oct", avgDays: 1.4 },
        //   { m: "Nov", avgDays: 1.9 },
        //   { m: "Dec", avgDays: 0.7 }
        // ];

        // 2. Leave Tpyes - จำนวนตามประเภทลา
        const leaveTypesData = await prisma.leave.groupBy({
            by: ['kind'],
            _count: true,
            where: {
                startDate: {
                    gte: new Date(`${currentYear}-01-01`),
                    lt: new Date(`${currentYear + 1}-01-01`),
                }
            }
        });

        const leaveTypeMap: Record<string, string> = {
            'ANNUAL': 'ลาพักร้อน',
            'SICK': 'ลาป่วย',
            'BUSINESS': 'ลากิจ',
            'MATERNITY': 'ลาคลอด',
            'BIRTHDAY': 'ลาวันเกิด',
            'ORDAIN': 'ลาบวช',
            'UNPAID': 'ลาไม่ได้รับเงิน',
            'ANNUAL_HOLIDAY': 'ลาวันหยุดประจำปี'
        };

        const leaveTypes = leaveTypesData.map(item => ({
            type: leaveTypeMap[item.kind] || item.kind,
            count: item._count
        }));

        // 3. status Distribution - สัดส่วนสถานะ
        const statusData = await prisma.leave.groupBy({
            by: ['status'],
            _count: true,
            where: {
                startDate: {
                    gte: new Date(`${currentYear}-01-01`),
                    lt: new Date(`${currentYear + 1}-01-01`),
                }
            }
        });

        const statusMap: Record<string, string> = {
            'APPROVED': 'อนุมัติ',
            'PENDING': 'รออนุมัติ',
            'REJECTED': 'ไม่อนุมัติ'
        };

        const statusDist = statusData.map(item => ({
            name: statusMap[item.status] || item.status,
            value: item._count
        }));

        // 4. Attendance Radar - ข้อมูลเรดาร์การเข้างาน
        const attendanceRadar = [
            { k: "ตรงเวลา", a: 82 },
            { k: "ไม่สาย", a: 76 },
            { k: "ไม่ขาด", a: 90 },
            { k: "ลาน้อย", a: 70 },
            { k: "วางแผนลา", a: 80 },
        ];

        return NextResponse.json({
            ok: true,
            data: {
                monthlyLeaves,
                leaveTypes,
                statusDist,
                attendanceRadar
            }
        });

    } catch (error) {
        console.error("GET /api/dashboard error:", error);
        return NextResponse.json({ error: "internal error"}, { status: 500 });
    }
}