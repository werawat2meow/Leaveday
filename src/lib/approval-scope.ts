import { prisma } from "@/lib/prisma";

type ViewerMode = "ADMIN" | "SCOPED";

type ScopeNames = "org" | "department" | "division" | "unit";

type ApproverScopeRecord = {
	id: number;
	orgId: number | null;
	departmentId: number | null;
	divisionId: number | null;
	unitId: number | null;
	org: string | null;
	department: string | null;
	division: string | null;
	unit: string | null;
};

export type ApprovalViewerContext = {
	userId: number;
	email: string;
	role: string;
	viewerMode: ViewerMode;
	approverId: number | null;
	scopes: ScopeNames[];
	employeeScopeWhere: Record<string, unknown>;
};

function isAdminRole(role?: string) {
	return role === "ADMIN" || role === "MASTER_ADMIN";
}

function resolveApproverScopes(approver: ApproverScopeRecord | null): ScopeNames[] {
	if (!approver) return [];

	const scopes: ScopeNames[] = [];
	if (approver.orgId != null || approver.org) scopes.push("org");
	if (approver.departmentId != null || approver.department) scopes.push("department");
	if (approver.divisionId != null || approver.division) scopes.push("division");
	if (approver.unitId != null || approver.unit) scopes.push("unit");
	return scopes;
}

function buildScopedOrgTreeWhere(approver: ApproverScopeRecord | null) {
	if (!approver) return null;

	const where: Record<string, unknown> = {};

	if (approver.orgId != null) where.orgId = approver.orgId;
	else if (approver.org) where.org = approver.org;

	if (approver.departmentId != null) where.departmentId = approver.departmentId;
	else if (approver.department) where.department = approver.department;

	if (approver.divisionId != null) where.divisionId = approver.divisionId;
	else if (approver.division) where.division = approver.division;

	if (approver.unitId != null) where.unitId = approver.unitId;
	else if (approver.unit) where.unit = approver.unit;

	return Object.keys(where).length > 0 ? where : null;
}

export async function getApprovalViewerContext(
	email: string
): Promise<ApprovalViewerContext> {
	const user = await prisma.user.findUnique({
		where: { email },
		include: { employee: true },
	});

	if (!user) {
		throw new Error("user not found");
	}

	if (isAdminRole(user.role)) {
		return {
			userId: user.id,
			email,
			role: user.role,
			viewerMode: "ADMIN",
			approverId: null,
			scopes: ["org", "department", "division", "unit"],
			employeeScopeWhere: {},
		};
	}

	const approver = await prisma.approver.findFirst({
		where: {
			OR: [{ email }, { empNo: user.employee?.empNo ?? "" }],
		},
		select: {
			id: true,
			orgId: true,
			departmentId: true,
			divisionId: true,
			unitId: true,
			org: true,
			department: true,
			division: true,
			unit: true,
		},
	});

	if (!approver) {
		return {
			userId: user.id,
			email,
			role: user.role,
			viewerMode: "SCOPED",
			approverId: null,
			scopes: [],
			employeeScopeWhere: { id: -1 },
		};
	}

	const scopedOrgTreeWhere = buildScopedOrgTreeWhere(approver);
	const scopeOr: Record<string, unknown>[] = [];

	if (scopedOrgTreeWhere) {
		scopeOr.push(scopedOrgTreeWhere);
	}

	scopeOr.push({ approvers: { some: { id: approver.id } } });

	return {
		userId: user.id,
		email,
		role: user.role,
		viewerMode: "SCOPED",
		approverId: approver.id,
		scopes: resolveApproverScopes(approver),
		employeeScopeWhere: scopeOr.length === 1 ? scopeOr[0] : { OR: scopeOr },
	};
}

export async function canViewerAccessEmployee(email: string, employeeId: number) {
	const ctx = await getApprovalViewerContext(email);

	if (ctx.viewerMode === "ADMIN") {
		return true;
	}

	const employee = await prisma.employee.findFirst({
		where: {
			AND: [{ id: employeeId }, ctx.employeeScopeWhere],
		},
		select: { id: true },
	});

	return !!employee;
}
