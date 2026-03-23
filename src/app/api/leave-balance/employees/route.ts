import { authOptions } from "@/lib/auth";
import { getApprovalViewerContext } from "@/lib/approval-scope";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

function containsCI(value: string, q: string) {
	return value.toLowerCase().includes(q.toLowerCase());
}

export async function GET(req: NextRequest) {
	try {
		const session = await getServerSession(authOptions);
		const email = session?.user?.email;
		if (!email) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const ctx = await getApprovalViewerContext(email);
		const { searchParams } = new URL(req.url);
		const org = (searchParams.get("org") || "").trim();
		const department = (searchParams.get("department") || "").trim();
		const division = (searchParams.get("division") || "").trim();
		const unit = (searchParams.get("unit") || "").trim();
		const q = (searchParams.get("q") || "").trim();

		const baseEmployees = await prisma.employee.findMany({
			where: ctx.employeeScopeWhere as any,
			select: {
				id: true,
				empNo: true,
				firstName: true,
				lastName: true,
				org: true,
				department: true,
				division: true,
				unit: true,
				levelP: true,
				photoUrl: true,
			},
			orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
		});

		const options = {
			org: Array.from(new Set(baseEmployees.map((item) => item.org).filter(Boolean))).sort() as string[],
			department: Array.from(
				new Set(baseEmployees.map((item) => item.department).filter(Boolean))
			).sort() as string[],
			division: Array.from(new Set(baseEmployees.map((item) => item.division).filter(Boolean))).sort() as string[],
			unit: Array.from(new Set(baseEmployees.map((item) => item.unit).filter(Boolean))).sort() as string[],
		};

		const filtered = baseEmployees.filter((employee) => {
			if (org && employee.org !== org) return false;
			if (department && employee.department !== department) return false;
			if (division && employee.division !== division) return false;
			if (unit && employee.unit !== unit) return false;

			if (!q) return true;

			const haystack = [
				employee.empNo || "",
				employee.firstName || "",
				employee.lastName || "",
				employee.org || "",
				employee.department || "",
				employee.division || "",
				employee.unit || "",
				employee.levelP || "",
			].join(" ");

			return containsCI(haystack, q);
		});

		return NextResponse.json({
			ok: true,
			viewerMode: ctx.viewerMode,
			scopes: ctx.scopes,
			options,
			data: filtered,
		});
	} catch (error: any) {
		console.error("GET /api/leave-balance/employees error:", error);
		return NextResponse.json(
			{ error: error?.message || "internal_error" },
			{ status: 500 }
		);
	}
}
