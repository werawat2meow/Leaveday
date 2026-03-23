import { authOptions } from "@/lib/auth";
import { canViewerAccessEmployee } from "@/lib/approval-scope";
import { getEmployeeLeaveBalanceSummary } from "@/lib/leave-balance-summary";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
	try {
		const session = await getServerSession(authOptions);
		const email = session?.user?.email;
		if (!email) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { searchParams } = new URL(req.url);
		const employeeId = Number(searchParams.get("employeeId"));
		const year = Number(searchParams.get("year") || new Date().getFullYear());

		if (!Number.isFinite(employeeId) || employeeId <= 0) {
			return NextResponse.json({ error: "invalid employeeId" }, { status: 400 });
		}

		if (!Number.isFinite(year) || year < 2000 || year > 2100) {
			return NextResponse.json({ error: "invalid year" }, { status: 400 });
		}

		const allowed = await canViewerAccessEmployee(email, employeeId);
		if (!allowed) {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}

		const data = await getEmployeeLeaveBalanceSummary({ employeeId, year });
		return NextResponse.json({ ok: true, data });
	} catch (error: any) {
		console.error("GET /api/leave-balance/summary error:", error);
		return NextResponse.json(
			{ error: error?.message || "internal_error" },
			{ status: 500 }
		);
	}
}
